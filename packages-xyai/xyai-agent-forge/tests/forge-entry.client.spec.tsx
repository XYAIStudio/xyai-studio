// @vitest-environment jsdom
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ComponentType } from 'react'
import * as forge from '../src/client/index.ts'

const contexts: Context[] = []
afterEach(async () => { cleanup(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

/** Mount the plugin over a real Loader with only the Session utility slot declared. */
async function bench(lang: 'zh' | 'en' = 'zh') {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale(lang); ctx.provide('locale', locale)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } } } as never, () => null)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-agent-forge-'))
  const path = join(dir, 'cordis.yml'); await writeFile(path, '- name: xyai-subject\n')
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (name !== 'xyai-subject') throw new Error(name)
    return forge
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  await rm(dir, { recursive: true, force: true })
  function component(key: string) {
    const entry = slots.entries(key)[0]!
    const C = entry.component as ComponentType<{ t: (key: string) => string }>
    return { C, t: locale.bind(entry.locale ?? '') as unknown as (key: string) => string }
  }
  return { ctx, slots, component }
}

it('registers the Agent-Forge entry into the Session utility row and unloads cleanly', async () => {
  const b = await bench()
  const entry = b.component('conversation.session.header.utilities')
  render(<entry.C t={entry.t} />)
  expect(screen.getByRole('button', { name: '兵工厂' })).toBeTruthy()
  await b.ctx.fiber.dispose()
  expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
})

it('renders the English forge label through the locale dictionary', async () => {
  const b = await bench('en')
  const entry = b.component('conversation.session.header.utilities')
  render(<entry.C t={entry.t} />)
  expect(screen.getByRole('button', { name: 'Forge' })).toBeTruthy()
})
