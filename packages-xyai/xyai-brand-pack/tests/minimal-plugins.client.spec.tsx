// @vitest-environment jsdom
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import * as composer from '../../xyai-composer/src/client/index.ts'
import * as shell from '../../xyai-dev-shell/src/client/index.ts'
import * as brand from '../src/client/index.ts'
import { defaultBrand, BRAND_FIELDS, type Brand } from '../src/brand.ts'
import type { ComponentType } from 'react'

const contexts: Context[] = []
const directories: string[] = []
afterEach(async () => { cleanup(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }) })
async function bench<T>(plugin: typeof composer, children: object) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const layout = { toggleSidebar: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn() }
  const uiWorkspace = { startSession: vi.fn() }
  const scope = stubSettingsScope<T>()
  scope.publish({ status: 'ready', value: defaultBrand, writable: true })
  ctx.provide('layout', layout as never); ctx.provide('uiWorkspace', uiWorkspace as never)
  ctx.provide('settingsScope', { bind: () => scope.scope } as never)
  const removeTheme = vi.fn(); const overrideTokens = vi.fn(() => removeTheme)
  ctx.provide('theme', { overrideTokens } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children } as never, () => null)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-client-')); directories.push(dir)
  const path = join(dir, 'cordis.yml'); await writeFile(path, '- name: xyai-subject\n')
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (name !== 'xyai-subject') throw new Error(name)
    return plugin
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  const fiber = ctx.fiber
  function component(key: string) {
    const entry = slots.entries(key)[0]!
    // SlotRegistry erases component props; this harness supplies only the shares consumed by each entry.
    const C = entry.component as ComponentType<Record<string, unknown>>
    const face = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
    return { C, props: { ...face, t: locale.bind(entry.locale ?? 'xyaiBrand') } }
  }
  return { ctx, slots, fiber, component, layout, uiWorkspace, scope, overrideTokens, removeTheme }
}
it('edits the live draft, refuses busy edits, sends through DSH and confirms clearing', async () => {
  const b = await bench<Brand>(composer, { 'conversation.input.left': { kind: 'list', scope: 'session' }, 'conversation.composer.dock': { kind: 'list', scope: 'session' }, 'settings.section': { kind: 'list', scope: 'root' } })
  const input = createSnapshotStore({ draft: '原始草稿', phase: 'plain', attachmentIds: [], queue: [] })
  const setDraft = vi.fn((draft: string) => input.update(s => { s.draft = draft }))
  const submit = vi.fn()
  const { C, props } = b.component('conversation.input.left')
  render(<C {...props} useInput={bindSnapshotSelector(input)} inputActions={{ setDraft, submit }} />)
  fireEvent.click(screen.getByText('草稿工具'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '修改后的草稿' } })
  expect(input.getSnapshot().draft).toBe('修改后的草稿')
  expect(document.body.innerHTML).toMatchSnapshot('edited draft')
  fireEvent.click(screen.getByText('清空草稿')); fireEvent.click(screen.getByText('取消'))
  expect(input.getSnapshot().draft).toBe('修改后的草稿')
  fireEvent.click(screen.getByText('发送')); expect(submit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('草稿工具'))
  fireEvent.click(screen.getByText('清空草稿')); fireEvent.click(screen.getAllByText('清空草稿')[1]!)
  expect(input.getSnapshot().draft).toBe('')
  act(() => input.update(s => { s.phase = 'submitting' }))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  await b.fiber.dispose(); expect(b.slots.entries('conversation.input.left')).toHaveLength(0)
})
it('quick phrases are managed in settings and insert into the input draft', async () => {
  const b = await bench<{ snippets: { label: string; text: string }[] }>(composer, {
    'conversation.input.left': { kind: 'list', scope: 'session' },
    'conversation.composer.dock': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  })
  b.scope.publish({ status: 'ready', value: { snippets: [{ label: '问候', text: '你好，请帮我…' }] }, writable: true })
  const { C, props } = b.component('settings.section')
  const setSnippets = vi.fn()
  render(<C {...props} useSnippets={bindSnapshotSelector(b.scope.scope)} setSnippets={setSnippets} />)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '周报' } })
  fireEvent.change(screen.getByLabelText('内容'), { target: { value: '请生成本周工作周报' } })
  fireEvent.click(screen.getByText('添加短语'))
  await screen.findByText('快捷短语已保存')
  expect(setSnippets).toHaveBeenLastCalledWith([
    { label: '问候', text: '你好，请帮我…' }, { label: '周报', text: '请生成本周工作周报' },
  ])
  fireEvent.click(screen.getAllByText('删除')[0]!)
  // The stub scope does not apply writes, so rows still render the published
  // value and deleting its first row filters down to an empty list.
  expect(setSnippets).toHaveBeenLastCalledWith([])
  cleanup()
  const entry = b.slots.entries('conversation.input.left')[1]!
  const face = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
  const input = createSnapshotStore({ draft: '', phase: 'plain', attachmentIds: [], queue: [] })
  const setDraft = vi.fn((draft: string) => input.update(s => { s.draft = draft }))
  const Chip = entry.component as ComponentType<Record<string, unknown>>
  const locale = b.ctx.get('locale') as LocaleRuntime
  render(<Chip {...face} t={locale.bind('xyaiComposer')} useSnippets={bindSnapshotSelector(b.scope.scope)}
    useInput={bindSnapshotSelector(input)} inputActions={{ setDraft }} />)
  fireEvent.click(screen.getByText('快捷短语'))
  fireEvent.click(screen.getByText('问候'))
  expect(input.getSnapshot().draft).toBe('你好，请帮我…')
  await b.fiber.dispose()
  expect(b.slots.entries('settings.section')).toHaveLength(0)
})
it('workbench actions call DSH navigation and panel services', async () => {
  const b = await bench<Brand>(shell, { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' } })
  const { C, props } = b.component('conversation.session.header.utilities')
  render(<C {...props} />); fireEvent.click(screen.getByText('工作台'))
  expect(document.body.innerHTML).toMatchSnapshot('workbench navigation')
  fireEvent.click(screen.getByText('展开/收起侧栏')); expect(b.layout.toggleSidebar).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('打开详情面板')); expect(b.layout.openDetails).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('关闭详情面板')); expect(b.layout.closeDetails).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByText('新建对话')); expect(b.uiWorkspace.startSession).toHaveBeenCalledOnce()
  await b.fiber.dispose(); expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
})
it('brand save is atomic, failed saves keep edits, reset and unload restore owned state', async () => {
  const b = await bench<Brand>(brand, { 'settings.section': { kind: 'list', scope: 'root' }, 'sidebar.brand.name': { kind: 'single', scope: 'root' }, 'sidebar.brand.mark': { kind: 'single', scope: 'root' }, 'conversation.hero.brand.mark': { kind: 'single', scope: 'root' } })
  const { C, props } = b.component('settings.section')
  render(<C {...props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  expect((screen.getByLabelText('品牌名称') as HTMLInputElement).value).toBe('XYAI Studio')
  fireEvent.change(screen.getByLabelText('品牌名称'), { target: { value: '行业工作室' } })
  b.scope.mutate.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByText('保存品牌'))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('品牌名称') as HTMLInputElement).value).toBe('行业工作室')
  b.scope.mutate.mockImplementationOnce(async () => { b.scope.publish({ value: { ...defaultBrand, name: '行业工作室' } }) })
  fireEvent.click(screen.getByText('保存品牌'))
  await screen.findByText('品牌已保存')
  expect(document.body.innerHTML).toMatchSnapshot('saved brand')
  expect(b.scope.mutate).toHaveBeenLastCalledWith([
    { op: 'set', path: ['name'], value: '行业工作室' }, { op: 'set', path: ['initials'], value: 'XY' }, { op: 'set', path: ['accent'], value: '#1565c0' },
    { op: 'set', path: ['text'], value: '' },
    { op: 'set', path: ['gradientFrom'], value: '#1565c0' }, { op: 'set', path: ['gradientTo'], value: '#0288d1' },
    { op: 'set', path: ['vision'], value: '' }, { op: 'set', path: ['site'], value: '' }, { op: 'set', path: ['icp'], value: '' }, { op: 'set', path: ['logo'], value: '' },
  ])
  expect(b.overrideTokens).toHaveBeenCalled()
  cleanup()
  const mark = b.component('sidebar.brand.name')
  render(<mark.C {...mark.props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  expect(screen.getByText('行业工作室')).toBeTruthy()
  cleanup(); render(<C {...props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.click(screen.getByText('恢复配置默认值'))
  await waitFor(() => expect(b.scope.mutate).toHaveBeenLastCalledWith(BRAND_FIELDS.map(field => ({ op: 'unset', path: [field] }))))
  cleanup(); await b.fiber.dispose(); expect(b.removeTheme).toHaveBeenCalled(); expect(b.scope.listenerCount()).toBe(0)
  expect(b.slots.entries('settings.section')).toHaveLength(0)
})
it('renders the ICP legal line under the hero brand only while a number is configured', async () => {
  const b = await bench<Brand>(brand, { 'conversation.hero.brand.mark': { kind: 'single', scope: 'root' } })
  const hero = b.component('conversation.hero.brand.mark')
  const { rerender } = render(<hero.C {...hero.props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  expect(screen.getByText('XY · XYAI Studio')).toBeTruthy()
  expect(screen.queryByText('京ICP备2024080932号-13')).toBeNull()
  b.scope.publish({ value: { ...defaultBrand, icp: '京ICP备2024080932号-13' } })
  rerender(<hero.C {...hero.props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  const link = screen.getByText('京ICP备2024080932号-13') as HTMLAnchorElement
  expect(link.href).toBe('https://beian.miit.gov.cn/')
  expect(link.target).toBe('_blank')
  b.scope.publish({ value: defaultBrand })
  rerender(<hero.C {...hero.props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  expect(screen.queryByText('京ICP备2024080932号-13')).toBeNull()
})
it('renders multiple ecosystem sites from a comma-separated value', async () => {
  const b = await bench<Brand>(brand, { 'settings.section': { kind: 'list', scope: 'root' } })
  const { C, props } = b.component('settings.section')
  render(<C {...props} useBrand={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.change(screen.getByPlaceholderText('多个站点请用逗号分隔'), { target: { value: 'https://a.example.com, https://b.example.com' } })
  const links = screen.getAllByRole('link') as HTMLAnchorElement[]
  expect(links.map(link => link.href)).toEqual(['https://a.example.com/', 'https://b.example.com/'])
})
