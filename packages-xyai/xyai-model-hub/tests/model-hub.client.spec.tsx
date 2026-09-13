// @vitest-environment jsdom
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { ComponentType } from 'react'
import * as hub from '../src/client/index.ts'
import { defaultModelHub, MODEL_HUB_FIELDS, type ModelHub } from '../src/models.ts'

const contexts: Context[] = []
afterEach(async () => { cleanup(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const scope = stubSettingsScope<ModelHub>()
  scope.publish({ status: 'ready', value: defaultModelHub, writable: true })
  ctx.provide('settingsScope', { bind: () => scope.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-model-hub-'))
  const path = join(dir, 'cordis.yml'); await writeFile(path, '- name: xyai-subject\n')
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (name !== 'xyai-subject') throw new Error(name)
    return hub
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  function component(key: string) {
    const entry = slots.entries(key)[0]!
    const C = entry.component as ComponentType<Record<string, unknown>>
    const face = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
    return { C, props: { ...face, t: locale.bind(entry.locale ?? 'xyaiModelHub') } }
  }
  return { ctx, slots, scope, component }
}

it('saves strategy and catalog edits atomically, resets and unloads cleanly', async () => {
  const b = await bench()
  const { C, props } = b.component('settings.section')
  render(<C {...props} useModelHub={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.change(screen.getByLabelText(/选择策略/), { target: { value: 'balanced' } })
  fireEvent.change(screen.getByLabelText('模型目录'), { target: { value: 'A|local-ollama|http://127.0.0.1:11434\nB|cloud|' } })
  b.scope.mutate.mockImplementationOnce(async () => { b.scope.publish({ value: { preference: 'balanced', catalog: 'A|local-ollama|http://127.0.0.1:11434\nB|cloud|' } }) })
  fireEvent.click(screen.getByText('保存模型广场'))
  await screen.findByText('模型广场已保存')
  expect(b.scope.mutate).toHaveBeenLastCalledWith([
    { op: 'set', path: ['preference'], value: 'balanced' },
    { op: 'set', path: ['catalog'], value: 'A|local-ollama|http://127.0.0.1:11434\nB|cloud|' },
  ])
  cleanup()
  render(<C {...props} useModelHub={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.click(screen.getByText('恢复默认'))
  await waitFor(() => expect(b.scope.mutate).toHaveBeenLastCalledWith(MODEL_HUB_FIELDS.map(field => ({ op: 'unset', path: [field] }))))
  cleanup(); await b.ctx.fiber.dispose()
  expect(b.slots.entries('settings.section')).toHaveLength(0)
})

it('previews only well-formed catalog rows', async () => {
  const b = await bench()
  const { C, props } = b.component('settings.section')
  render(<C {...props} useModelHub={bindSnapshotSelector(b.scope.scope)} />)
  expect(screen.getByText(/本地 · qwen2\.5-32b — local-gguf/)).toBeTruthy()
  expect(screen.getByText(/云端 · DeepSeek-V4 — cloud/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('模型目录'), { target: { value: 'ok|local-gguf|\nbroken-line\n|empty-name|' } })
  expect(screen.getByText('ok — local-gguf')).toBeTruthy()
  expect(screen.queryByText(/broken-line\s*—/)).toBeNull()
  expect(screen.queryByText(' — local-gguf')).toBeNull()
})
