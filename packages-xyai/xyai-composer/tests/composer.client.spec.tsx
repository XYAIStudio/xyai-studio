// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentType } from 'react'
import * as composer from '../src/client/index.ts'
import type { ComposerSettings } from '../src/client/logic.ts'

const contexts: Context[] = []
afterEach(async () => {
  cleanup()
  const speechWindow = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  delete speechWindow.SpeechRecognition
  delete speechWindow.webkitSpeechRecognition
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const scope = stubSettingsScope<ComposerSettings>()
  scope.publish({ status: 'ready', value: { snippets: [{ label: '周报', text: '请整理本周进展' }] }, writable: true })
  ctx.provide('settingsScope', { bind: () => scope.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'conversation.input.left': { kind: 'list', scope: 'session' },
    'conversation.input.right': { kind: 'list', scope: 'session' },
    'conversation.composer.dock': { kind: 'list', scope: 'session' },
    'conversation.input.overlay': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  await ctx.plugin(composer).await()
  const input = createSnapshotStore({ draft: '', phase: 'plain', attachmentIds: [], queue: [] })
  const setDraft = vi.fn((draft: string) => input.update(state => { state.draft = draft }))
  const component = (slot: string) => {
    const entry = slots.entries(slot)[0]!
    const C = entry.component as ComponentType<Record<string, unknown>>
    const injected = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
    const hooks = (injected.hooks ?? {}) as Record<string, Parameters<typeof bindSnapshotSelector>[0]>
    const hookProps = Object.fromEntries(Object.entries(hooks).map(([name, source]) => [
      `use${name.slice(0, 1).toUpperCase()}${name.slice(1)}`,
      bindSnapshotSelector(source),
    ]))
    const { hooks: _hooks, ...plainProps } = injected
    return { C, props: {
      ...plainProps,
      ...hookProps,
      t: locale.bind(entry.locale ?? 'xyaiComposer'),
      useInput: bindSnapshotSelector(input),
      inputActions: { setDraft },
    } }
  }
  return { ctx, slots, scope, input, setDraft, component }
}

it('opens one compact capability menu and invokes the real slash skill pipeline', async () => {
  const b = await bench()
  const { C, props } = b.component('conversation.input.left')
  render(<C {...props} />)
  fireEvent.click(screen.getByText('能力'))
  expect(screen.getByText('知识库').closest('button')?.disabled).toBe(false)
  expect(screen.getByText('插件工具').closest('button')?.disabled).toBe(true)
  expect(screen.getByText('文件与图片').closest('button')?.disabled).toBe(true)
  fireEvent.click(screen.getByText('技能与命令'))
  expect(b.setDraft).toHaveBeenLastCalledWith('/')
  fireEvent.click(screen.getByText('能力'))
  fireEvent.click(screen.getByText('周报'))
  expect(b.input.getSnapshot().draft).toBe('/\n请整理本周进展')
})

it('opens the mounted Knowledge plugin through its public shell event', async () => {
  const opened = vi.fn()
  window.addEventListener('xyai:open-knowledge', opened)
  try {
    const b = await bench()
    const { C, props } = b.component('conversation.input.left')
    render(<C {...props} />)
    fireEvent.click(screen.getByText('能力'))
    fireEvent.click(screen.getByText('知识库'))
    expect(opened).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: '能力' })).toBeNull()
  } finally {
    window.removeEventListener('xyai:open-knowledge', opened)
  }
})
it('inserts /plan through the resident slash pipeline and filters the menu', async () => {
  const b = await bench()
  const { C, props } = b.component('conversation.input.left')
  render(<C {...props} />)
  fireEvent.click(screen.getByText('能力'))
  fireEvent.click(screen.getByText('规划模式'))
  expect(b.setDraft).toHaveBeenLastCalledWith('/plan')
  fireEvent.click(screen.getByText('能力'))
  fireEvent.change(screen.getByLabelText('搜索能力'), { target: { value: '知识' } })
  expect(screen.getByText('知识库')).toBeTruthy()
  expect(screen.queryByText('规划模式')).toBeNull()
  fireEvent.change(screen.getByLabelText('搜索能力'), { target: { value: '不存在的能力' } })
  expect(screen.getByText('没有匹配的能力或短语。')).toBeTruthy()
})

it('closes the capability menu on Escape without changing the draft', async () => {
  const b = await bench()
  const { C, props } = b.component('conversation.input.left')
  render(<C {...props} />)
  fireEvent.click(screen.getByText('能力'))
  expect(screen.getByRole('dialog', { name: '能力' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '能力' })).toBeNull()
  expect(b.setDraft).not.toHaveBeenCalled()
})

it('records into a review field and inserts only after confirmation', async () => {
  class Recognition {
    static current: Recognition
    continuous = false
    interimResults = false
    lang = ''
    onresult: ((event: unknown) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    onend: (() => void) | null = null
    constructor() { Recognition.current = this }
    start() {}
    stop() { this.onend?.() }
    abort() {}
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition })
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition })
  const b = await bench()
  const { C, props } = b.component('conversation.input.right')
  render(<C {...props} />)
  fireEvent.click(screen.getByLabelText('语音输入'))
  fireEvent.click(screen.getByText('开始录音'))
  act(() => {
    Recognition.current.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: '语音任务' } } },
    })
  })
  expect(b.setDraft).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('停止'))
  expect((screen.getByLabelText('校对转写内容') as HTMLTextAreaElement).value).toBe('语音任务')
  fireEvent.click(screen.getByText('插入草稿'))
  expect(b.setDraft).toHaveBeenCalledWith('语音任务')
})

it('keeps the draft unchanged when recognition is silent or permission is denied', async () => {
  class Recognition {
    static current: Recognition
    onresult: ((event: unknown) => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    onend: (() => void) | null = null
    constructor() { Recognition.current = this }
    start() {}
    stop() { this.onend?.() }
    abort() {}
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition })
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Recognition })
  const b = await bench()
  const { C, props } = b.component('conversation.input.right')
  render(<C {...props} />)
  fireEvent.click(screen.getByLabelText('语音输入'))
  fireEvent.click(screen.getByText('开始录音'))
  fireEvent.click(screen.getByText('停止'))
  expect(screen.getByText('未检测到语音。草稿未更改。')).toBeTruthy()
  expect(b.setDraft).not.toHaveBeenCalled()
  act(() => { Recognition.current.onerror?.({ error: 'not-allowed' }) })
  expect(screen.getByText(/麦克风授权被拒绝/)).toBeTruthy()
  expect(b.setDraft).not.toHaveBeenCalled()
})

it('shows DSH as the only connected Harness and derives live draft counts', async () => {
  const b = await bench()
  b.input.update(state => {
    state.draft = '三个字'
    state.attachmentIds = ['a']
    state.queue = [{ text: 'queued' }] as never
    state.phase = 'submitting'
  })
  const { C, props } = b.component('conversation.composer.dock')
  render(<C {...props} />)
  fireEvent.click(screen.getByText('Harness: DSH'))
  expect(screen.getByText('当前会话由 DSH 执行。')).toBeTruthy()
  expect(screen.getByText('Codex').closest('button')?.disabled).toBe(true)
  expect(screen.getByText('Claude Code').closest('button')?.disabled).toBe(true)
  expect(screen.getByText(/字数: 3 · 附件: 1 · 排队消息: 1 · 忙碌/)).toBeTruthy()
})

it('reports queued messages on the overlay without offering a fake send path', async () => {
  const b = await bench()
  b.input.update(state => { state.queue = [{ text: 'queued' }] as never })
  const { C, props } = b.component('conversation.input.overlay')
  render(<C {...props} />)
  expect(screen.getByRole('status').textContent).toContain('1 条待发消息')
  expect(screen.queryByText('立即补充')).toBeNull()
})

it('keeps quick-phrase edits visible when Host persistence fails', async () => {
  const b = await bench()
  b.scope.mutate.mockRejectedValueOnce(new Error('Host rejected write'))
  const { C, props } = b.component('settings.section')
  render(<C {...props} />)
  const label = screen.getByLabelText('名称') as HTMLInputElement
  const text = screen.getByLabelText('内容') as HTMLTextAreaElement
  fireEvent.change(label, { target: { value: '发布检查' } })
  fireEvent.change(text, { target: { value: '检查构建与安装包' } })
  fireEvent.click(screen.getByText('添加短语'))
  expect((await screen.findByRole('alert')).textContent).toBe('快捷短语保存失败，修改已保留，请重试。')
  expect(label.value).toBe('发布检查')
  expect(text.value).toBe('检查构建与安装包')
})

it('edits an existing phrase and rejects a duplicate name before writing', async () => {
  const b = await bench()
  const { C, props } = b.component('settings.section')
  render(<C {...props} />)
  fireEvent.click(screen.getByText('编辑'))
  const label = screen.getByLabelText('名称') as HTMLInputElement
  const text = screen.getByLabelText('内容') as HTMLTextAreaElement
  expect(label.value).toBe('周报')
  fireEvent.change(text, { target: { value: '请整理本周风险与进展' } })
  fireEvent.click(screen.getByText('保存短语'))
  expect(await screen.findByText('快捷短语已保存')).toBeTruthy()
  expect(b.scope.mutate).toHaveBeenCalled()

  fireEvent.change(label, { target: { value: '周报' } })
  fireEvent.change(text, { target: { value: '另一份周报' } })
  fireEvent.click(screen.getByText('添加短语'))
  expect((await screen.findByRole('alert')).textContent).toBe('已存在同名短语。')
})
