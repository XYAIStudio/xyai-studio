/** Commerce Host verbs through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { afterEach, expect, it } from 'vitest'
import * as commerce from '../src/index.ts'

type RpcResult = { ok: boolean; value?: unknown; error?: { code: string; message: string } }
type Handler = (endpoint: string, payload: unknown) => Promise<RpcResult>

const channels = new Map<string, Handler>()

function connectionPlugin() {
  return {
    name: 'fake-connection',
    inject: [],
    apply(ctx: Context) {
      ctx.provide('connection', {
        rpc: {
          handle(channel: string, handler: Handler) {
            channels.set(channel, handler)
            return async () => { channels.delete(channel) }
          },
        },
      })
    },
  }
}

async function boot(dir: string) {
  const configPath = join(dir, 'cordis.yml')
  const settingsPath = join(dir, 'settings.json')
  await writeFile(configPath, JSON.stringify([
    { name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
    { name: 'fake-connection' },
    { name: '@xyai/dsh-commerce' },
  ]))
  const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['fake-connection', connectionPlugin()],
    ['@xyai/dsh-commerce', commerce],
  ])
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (!modules.has(name)) throw new Error('Unexpected module: ' + name)
    return modules.get(name)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

const contexts: Context[] = []
const directories: string[] = []
afterEach(async () => {
  channels.clear()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
})

it('dispatches payment config, pricing, and plugin licensing over /xyai-commerce and redacts secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-commerce-')); directories.push(dir)
  const ctx = await boot(dir); contexts.push(ctx)
  expect(channels.has('/xyai-commerce')).toBe(true)
  const call = (endpoint: string, payload: unknown = null) => channels.get('/xyai-commerce')!(endpoint, payload)

  await expect(call('pay/config/get')).resolves.toEqual({
    ok: true,
    value: { errcode: '0', errmsg: '', appid: '', gateway: 'https://api.xunhupay.com', notifyUrl: '', returnUrl: '', appSecretSet: false },
  })

  await expect(call('pay/config/set', { appid: 'merchant-1', appSecret: 'merchant-secret', notifyUrl: 'https://cb.example/notify' }))
    .resolves.toEqual({ ok: true, value: { errcode: '0', errmsg: '' } })
  const read = await call('pay/config/get')
  expect(read).toMatchObject({ ok: true, value: { appid: 'merchant-1', notifyUrl: 'https://cb.example/notify', appSecretSet: true } })
  expect(JSON.stringify(read)).not.toContain('merchant-secret')

  const computed = await call('price/compute', { product: 'P', factoryPrice: 100, suggestPrice: 200, xyaiDiscount: 50, role: 'xyai-direct' })
  expect(computed).toMatchObject({ ok: true, value: { product: 'P', role: 'xyai-direct', base: 200, discount: 50, coupon: 0, final: 150, ok: true } })
  expect(typeof (computed as { value: { note: unknown } }).value.note).toBe('string')

  const split = await call('price/plugin-split', { product: 'P', listPrice: 199, platformFeePct: 0.2 })
  expect(split).toMatchObject({ ok: true, value: { product: 'P', author: 'developer', listPrice: 199, platformFeePct: 0.2, developerRate: 0.8, platformRate: 0.2 } })
  expect((split as { value: { developerShare: number; platformCut: number } }).value.developerShare).toBeCloseTo(159.2)
  expect((split as { value: { platformCut: number } }).value.platformCut).toBeCloseTo(39.8)

  const granted = await call('plugin/grant', { id: 'industry-agent-thermo', order: 'PLG-industry-agent-thermo-1' })
  expect(granted).toMatchObject({ ok: true, value: { errcode: '0' } })
  expect((granted as { value: { expires: unknown } }).value.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(call('plugin/license/get')).resolves.toMatchObject({ ok: true, value: { errcode: '0', licenses: [{ id: 'industry-agent-thermo', order: 'PLG-industry-agent-thermo-1' }] } })
})

it('answers an unknown endpoint as a channel refusal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-commerce-')); directories.push(dir)
  const ctx = await boot(dir); contexts.push(ctx)
  const call = (endpoint: string, payload: unknown = null) => channels.get('/xyai-commerce')!(endpoint, payload)
  await expect(call('not/a/verb')).resolves.toEqual({
    ok: false,
    error: { code: 'commerce/unknown-endpoint', message: 'unknown commerce endpoint "not/a/verb"', details: {} },
  })
})
