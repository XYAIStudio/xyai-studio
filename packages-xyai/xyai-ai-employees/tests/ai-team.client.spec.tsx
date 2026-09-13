// @vitest-environment jsdom
import Loader from '../../../vendor/loader/src/index.ts'
import Include from '../../../vendor/include/src/index.ts'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ComponentType } from 'react'
import * as employees from '../src/client/index.ts'
import type { EmployeeLibrary } from '../src/protocol.ts'
import { DEFAULT_EMPLOYEES } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { cleanup(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function bench(lang: 'zh' | 'en' = 'zh', members: unknown[] = [], tasks: unknown[] = [], outcomes: unknown[] = [], renameResult: { ok: true } | { ok: false; error: { message: string } } = { ok: true }) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale(lang); ctx.provide('locale', locale)
  const library: EmployeeLibrary = { revision: 0, employees: DEFAULT_EMPLOYEES.map(item => ({ ...item })) }
  const rpc = vi.fn(async (_channel: string, endpoint: string, payload: unknown) => ({ ok: true, value: { ok: true, value: endpoint === 'employees/list' || endpoint === 'employees/save-draft' || endpoint === 'employees/publish' ? library : endpoint === 'team/view' ? { members, tasks } : endpoint === 'outcomes/list' ? outcomes : endpoint === 'chats/single-get' ? { sessionId: null } : endpoint === 'chats/single-bind' ? { sessionId: (payload as { sessionId: string }).sessionId } : { started: ['architect'], existing: [], failed: [] } } }))
  ctx.provide('connection', { rpc: { call: rpc } })
  const rename = vi.fn(async () => renameResult)
  const sessions = {
    list: { getSnapshot: () => ({ current: 'lead', byId: { lead: { cwd: 'E:/project', displayTitle: 'Lead' } } }) },
    create: vi.fn(async () => 'created'), open: vi.fn(), binding: vi.fn(() => ({ session: { rename } })),
  }
  ctx.provide('sessions', sessions)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'shell.overlay': { kind: 'list', scope: 'root' }, 'conversation.view': { kind: 'list', scope: 'session' },
    'conversation.input.left': { kind: 'list', scope: 'session' }, 'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
  } } as never, () => null)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-employees-'))
  const path = join(dir, 'cordis.yml'); await writeFile(path, '- name: xyai-subject\n')
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) { if (name !== 'xyai-subject') throw new Error(name); return employees } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } }); await ctx.loader.await(); await rm(dir, { recursive: true, force: true })
  const component = (key: string) => {
    const entry = slots.entries(key)[0] as unknown as { component: ComponentType<Record<string, unknown>>; locale?: string; inject?: () => object }
    return { C: entry.component, props: { ...(entry.inject?.() ?? {}), t: locale.bind(entry.locale ?? ''), sessionId: 'lead' } }
  }
  return { ctx, slots, component, rpc, sessions, rename }
}

it('registers every AI Team entry through a real Loader and unloads cleanly', async () => {
  const b = await bench()
  expect(b.slots.entries('conversation.view')).toHaveLength(1)
  expect(b.slots.entries('shell.overlay')).toHaveLength(1)
  expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1)
  const picker = b.component('conversation.input.left')
  const event = vi.fn(); window.addEventListener('xyai:open-ai-collaboration', event)
  render(<picker.C {...picker.props} />); fireEvent.click(screen.getByRole('button', { name: '添加 AI 员工' }))
  expect(event).toHaveBeenCalledOnce()
  await b.ctx.fiber.dispose()
  expect(b.slots.entries('conversation.view')).toHaveLength(0)
})

it('opens one-to-one chat directly from an employee card', async () => {
  const b = await bench()
  const opened = vi.fn()
  window.addEventListener('xyai:open-view', opened)
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.click(screen.getByRole('button', { name: '一对一聊天 架构师' }))
  await waitFor(() => expect(b.sessions.create).toHaveBeenCalledOnce())
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'team/start', expect.objectContaining({ sessionId: 'created', employeeIds: ['architect'] })))
  expect(b.sessions.open).toHaveBeenCalledWith('created')
  await waitFor(() => expect(opened).toHaveBeenCalledWith(expect.objectContaining({ detail: { id: 'xyai-ai-team' } })))
  window.removeEventListener('xyai:open-view', opened)
})

it('enables group chat only after selecting at least two employee cards', async () => {
  const b = await bench()
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.change(screen.getByRole('textbox', { name: '群聊名称（可选）' }), { target: { value: '产品发布协作' } })
  const start = screen.getByRole('button', { name: '开始群聊' }) as HTMLButtonElement
  expect(start.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: '群聊勾选 架构师' }))
  expect(start.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: '群聊勾选 全站全能开发大师' }))
  expect(start.disabled).toBe(false)
  fireEvent.click(start)
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'team/start', expect.objectContaining({ sessionId: 'created', employeeIds: ['architect', 'fullstack'] })))
  expect(b.rename).toHaveBeenCalledWith('产品发布协作')
})

it('filters employees by their configured category', async () => {
  const b = await bench()
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.change(screen.getByRole('combobox', { name: '全部分类' }), { target: { value: '质量' } })
  expect(screen.getByText('质量审计员')).toBeTruthy()
  expect(screen.queryByText('架构师')).toBeNull()
})

it('requires configuration-change review before publishing an employee', async () => {
  const b = await bench()
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.click(screen.getAllByRole('button', { name: '配置' })[0]!)
  fireEvent.change(screen.getByRole('textbox', { name: '工作指令' }), { target: { value: '更新后的工作指令' } })
  fireEvent.click(screen.getByRole('button', { name: '发布配置' }))
  expect(screen.getByText('确认配置变更')).toBeTruthy()
  expect(b.rpc).not.toHaveBeenCalledWith('/xyai-ai-team', 'employees/publish', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: '确认发布' }))
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'employees/save-draft', expect.anything()))
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'employees/publish', expect.anything()))
})

it('keeps the existing chat and creates a new group after inviting a teammate', async () => {
  const b = await bench('zh', [{ name: 'architect', description: '系统设计', role: 'teammate', status: 'idle' }])
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.click(screen.getByRole('button', { name: '当前团队' }))
  await screen.findByText('邀请成员创建新群聊')
  fireEvent.click(screen.getByRole('checkbox', { name: '邀请成员创建新群聊 全站全能开发大师' }))
  fireEvent.click(screen.getByRole('button', { name: '创建新群聊' }))
  await waitFor(() => expect(b.sessions.create).toHaveBeenCalledOnce())
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'team/start', expect.objectContaining({ sessionId: 'created', employeeIds: ['architect', 'fullstack'] })))
  expect(b.sessions.open).toHaveBeenCalledWith('created')
})

it('edits a shared task through DSH compare-and-set update', async () => {
  const b = await bench('zh', [], [{ id: 'task-1', revision: 2, subject: '旧任务', description: '旧验收', status: 'pending' }])
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.click(screen.getByRole('button', { name: '当前团队' }))
  await screen.findByText('旧任务')
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  fireEvent.change(screen.getAllByRole('textbox', { name: '任务标题' })[1]!, { target: { value: '新任务' } })
  fireEvent.change(screen.getAllByRole('textbox', { name: '验收条件和上下文' })[1]!, { target: { value: '新验收' } })
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!)
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'tasks/update', expect.objectContaining({ taskId: 'task-1', expectedRevision: 2, action: 'edit', subject: '新任务', description: '新验收' })))
})

it('records an outcome through the durable outcome endpoint', async () => {
  const b = await bench()
  const view = b.component('conversation.view')
  render(<view.C {...view.props} />)
  await screen.findByText('架构师')
  fireEvent.click(screen.getByRole('button', { name: '成果' }))
  await screen.findByText('尚未接入线上成果同步提供者，无法执行同步。')
  fireEvent.change(screen.getByRole('textbox', { name: '成果标题' }), { target: { value: '评审结论' } })
  fireEvent.change(screen.getByRole('textbox', { name: '结果内容和验收证据' }), { target: { value: '接口验收通过' } })
  fireEvent.click(screen.getByRole('button', { name: '登记成果' }))
  await waitFor(() => expect(b.rpc).toHaveBeenCalledWith('/xyai-ai-team', 'outcomes/create', { sessionId: 'lead', title: '评审结论', content: '接口验收通过' }))
})

it('renames a group and keeps the editor open when DSH rejects the change', async () => {
  const b = await bench('zh', [
    { name: 'architect', description: '系统设计', role: 'teammate', status: 'idle' },
    { name: 'fullstack', description: '全栈开发', role: 'teammate', status: 'idle' },
  ], [], [], { ok: false, error: { message: '名称保存失败' } })
  const rename = b.component('conversation.session.header.utilities')
  render(<rename.C {...rename.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '修改群名' }))
  fireEvent.change(screen.getByRole('textbox', { name: '对话名称' }), { target: { value: '发布协作群' } })
  fireEvent.click(screen.getByRole('button', { name: '保存群名' }))
  expect((await screen.findByRole('alert')).textContent).toContain('名称保存失败')
  expect((screen.getByRole('textbox', { name: '对话名称' }) as HTMLInputElement).value).toBe('发布协作群')
})

it('renames the current group through the DSH Session controller', async () => {
  const b = await bench('zh', [
    { name: 'architect', description: '系统设计', role: 'teammate', status: 'idle' },
    { name: 'fullstack', description: '全栈开发', role: 'teammate', status: 'idle' },
  ])
  const rename = b.component('conversation.session.header.utilities')
  render(<rename.C {...rename.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '修改群名' }))
  fireEvent.change(screen.getByRole('textbox', { name: '对话名称' }), { target: { value: '产品发布协作' } })
  fireEvent.click(screen.getByRole('button', { name: '保存群名' }))
  await waitFor(() => expect(b.rename).toHaveBeenCalledWith('产品发布协作'))
  await screen.findByRole('button', { name: '修改群名' })
})

it('renders the English executable picker label', async () => {
  const b = await bench('en'); const picker = b.component('conversation.input.left')
  render(<picker.C {...picker.props} />)
  expect(screen.getByRole('button', { name: 'Add AI employee' })).toBeTruthy()
})
