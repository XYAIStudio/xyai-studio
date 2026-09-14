// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentType } from 'react'
import * as shell from '../src/client/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  cleanup()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const list = createSnapshotStore({
    ids: ['dm1', 'g1', 'plain'],
    byId: {
      dm1: { id: 'dm1', displayTitle: 'Cindy · 单聊', title: 'Cindy · 单聊', blank: false, running: false, updatedAt: 2 },
      g1: { id: 'g1', displayTitle: 'A、B · 协作', title: 'A、B · 协作', blank: false, running: false, updatedAt: 1 },
      plain: { id: 'plain', displayTitle: 'notes', title: 'notes', blank: false, running: false, updatedAt: 0 },
    },
    current: undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
  const open = vi.fn()
  const rename = vi.fn(async () => ({ ok: true, value: { title: 'Renamed', seq: 1 } }))
  const archiveSession = vi.fn(async () => {})
  const openSession = vi.fn()
  ctx.provide('layout', {})
  ctx.provide('uiWorkspace', { openSession, archiveSession })
  ctx.provide('theme', { getTheme: () => ({ preference: 'system' }), setTheme: () => {} })
  ctx.provide('sessions', {
    list,
    open,
    binding: () => ({ session: { rename } }),
  })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  await ctx.plugin(shell).await()
  const component = (slot: string, id?: string) => {
    const entry = (id ? slots.entries(slot).find(item => item.options.id === id) : slots.entries(slot)[0])!
    const C = entry.component as ComponentType<Record<string, unknown>>
    const injected = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
    const hooks = (injected.hooks ?? {}) as Record<string, Parameters<typeof bindSnapshotSelector>[0]>
    const hookProps = Object.fromEntries(Object.entries(hooks).map(([name, source]) => [
      `use${name.slice(0, 1).toUpperCase()}${name.slice(1)}`,
      bindSnapshotSelector(source),
    ]))
    const { hooks: _hooks, ...plain } = injected
    return { C, props: { ...plain, ...hookProps, wide: true, t: locale.bind(entry.locale ?? 'xyaiDevShell') } }
  }
  return { ctx, slots, open, openSession, rename, archiveSession, component }
}

it('lists DM and group chats and opens them onto conversation, not workbench', async () => {
  const opened: unknown[] = []
  const onOpen = (event: Event) => opened.push((event as CustomEvent).detail)
  window.addEventListener('xyai:open-conversation', onOpen)
  try {
    const b = await bench()
    const { C, props } = b.component('sidebar.footer.action', 'xyai-ai-interact')
    render(<C {...props} />)
    expect(screen.getByText('与AI互动')).toBeTruthy()
    expect(screen.getByText('Cindy · 单聊')).toBeTruthy()
    expect(screen.getByText('A、B · 协作')).toBeTruthy()
    expect(screen.queryByText('notes')).toBeNull()
    fireEvent.click(screen.getByText('Cindy · 单聊'))
    expect(b.openSession).toHaveBeenCalledWith('dm1')
    expect(b.open).toHaveBeenCalledWith('dm1')
    expect(opened).toEqual([{ sessionId: 'dm1', view: 'conversation' }])
    const workbench = b.slots.entries('conversation.session.header.utilities').find(entry => entry.options.id === 'xyai-workbench')
    expect(workbench).toBeTruthy()
    expect(opened.some(detail => (detail as { view?: string }).view === 'workbench')).toBe(false)
  } finally {
    window.removeEventListener('xyai:open-conversation', onOpen)
  }
})

it('renames and archives from the interact list', async () => {
  const b = await bench()
  const { C, props } = b.component('sidebar.footer.action', 'xyai-ai-interact')
  render(<C {...props} />)
  fireEvent.click(screen.getAllByText('重命名')[0]!)
  fireEvent.change(screen.getByLabelText('重命名'), { target: { value: 'Cindy 值班' } })
  fireEvent.click(screen.getByText('保存'))
  await vi.waitFor(() => expect(b.rename).toHaveBeenCalledWith('Cindy 值班'))
  fireEvent.click(screen.getAllByText('归档')[0]!)
  await vi.waitFor(() => expect(b.archiveSession).toHaveBeenCalled())
})

it('opens About Us with srcDoc and blocks remote embeds on dsh-app', async () => {
  vi.stubGlobal('location', { protocol: 'dsh-app:' })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  try {
    const b = await bench()
    const { C, props } = b.component('shell.overlay', 'xyai-space-bar')
    render(<C {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '关于我们' }))
    const about = document.querySelector('[data-xyai-shell-view="about"] iframe') as HTMLIFrameElement | null
    expect(about).toBeTruthy()
    expect(about?.getAttribute('srcdoc') ?? about?.srcdoc).toContain('XYAI')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '业务空间' }))
    expect(await screen.findByText('当前桌面窗口无法嵌入远程 https 页面。请复制地址，在外部浏览器中打开。', {}, { timeout: 4000 })).toBeTruthy()
    expect((screen.getByLabelText('复制地址') as HTMLInputElement).value).toMatch(/^https?:\/\//)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '开发空间' }))
    expect(document.querySelector('[data-xyai-shell-view]')).toBeNull()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('disables product nav until owning plugins advertise', async () => {
  document.documentElement.removeAttribute('data-xyai-surface-models')
  document.documentElement.removeAttribute('data-xyai-surface-employees')
  document.documentElement.removeAttribute('data-xyai-surface-knowledge')
  const opened: string[] = []
  const onPlaza = () => opened.push('plaza')
  window.addEventListener('xyai:open-model-plaza', onPlaza)
  try {
    const b = await bench()
    const { C, props } = b.component('sidebar.footer.action', 'xyai-product-nav')
    render(<C {...props} />)
    const models = screen.getByRole('button', { name: '模型广场' })
    expect((models as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(models)
    expect(opened).toEqual([])
    document.documentElement.setAttribute('data-xyai-surface-models', '')
    await vi.waitFor(() => expect((screen.getByRole('button', { name: '模型广场' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '模型广场' }))
    expect(opened).toEqual(['plaza'])
  } finally {
    window.removeEventListener('xyai:open-model-plaza', onPlaza)
    document.documentElement.removeAttribute('data-xyai-surface-models')
  }
})

it('compacts an empty interact list', async () => {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const list = createSnapshotStore({
    ids: [],
    byId: {},
    current: undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
  ctx.provide('layout', {})
  ctx.provide('uiWorkspace', { openSession: vi.fn(), archiveSession: vi.fn() })
  ctx.provide('theme', { getTheme: () => ({ preference: 'system' }), setTheme: () => {} })
  ctx.provide('sessions', { list, open: vi.fn(), binding: () => ({ session: { rename: vi.fn() } }) })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  await ctx.plugin(shell).await()
  const entry = slots.entries('sidebar.footer.action').find(item => item.options.id === 'xyai-ai-interact')!
  const C = entry.component as ComponentType<Record<string, unknown>>
  const injected = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
  const hooks = (injected.hooks ?? {}) as Record<string, Parameters<typeof bindSnapshotSelector>[0]>
  const hookProps = Object.fromEntries(Object.entries(hooks).map(([name, source]) => [
    `use${name.slice(0, 1).toUpperCase()}${name.slice(1)}`,
    bindSnapshotSelector(source),
  ]))
  const { hooks: _hooks, ...plain } = injected
  render(<C {...plain} {...hookProps} wide t={locale.bind(entry.locale ?? 'xyaiDevShell')} />)
  const nav = document.querySelector('[data-xyai-interact]') as HTMLElement
  expect(nav.getAttribute('data-xyai-empty')).toBe('')
  expect(document.querySelectorAll('[data-xyai-interact-empty]')).toHaveLength(2)
})
