/** Online-account link verbs through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { afterEach, expect, it, vi } from 'vitest'
import * as onlineAuth from '../src/index.ts'

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
    { name: '@xyai/dsh-online-auth' },
  ]))
  const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['fake-connection', connectionPlugin()],
    ['@xyai/dsh-online-auth', onlineAuth],
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

it('dispatches status, device polling, and me over the /xyai-online channel without exposing the token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-online-')); directories.push(dir)
  const ctx = await boot(dir); contexts.push(ctx)
  expect(channels.has('/xyai-online')).toBe(true)
  const call = (endpoint: string, payload: unknown = null) => channels.get('/xyai-online')!(endpoint, payload)

  await expect(call('status')).resolves.toEqual({
    ok: true,
    value: { errcode: '0', errmsg: '', baseUrl: 'https://www.cnxyai.cn', loggedIn: false, user: null },
  })

  await ctx.settings.update('xyai-online', { accessToken: 'secret-token', userId: 7, userName: 'Alice', userEmail: 'alice@cnxyai.cn', userIsAdmin: true })
  const linked = await call('status')
  expect(linked).toMatchObject({ ok: true, value: { loggedIn: true, user: { id: 7, name: 'Alice', email: 'alice@cnxyai.cn', isAdmin: true } } })
  expect(JSON.stringify(linked)).not.toContain('secret-token')

  await expect(call('device/poll', {})).resolves.toEqual({
    ok: true,
    value: { errcode: '400', errmsg: 'missing deviceCode', status: 'invalid', user: null },
  })

  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, status: 'authorized', access_token: 'fresh-token', user: { id: 8, name: 'Bob', email: 'bob@cnxyai.cn', isAdmin: false } }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(call('device/poll', { deviceCode: 'code-1' })).resolves.toEqual({
    ok: true,
    value: { errcode: '0', errmsg: '', status: 'authorized', user: { id: 8, name: 'Bob', email: 'bob@cnxyai.cn', isAdmin: false } },
  })
  expect(fetchMock).toHaveBeenCalledWith('https://www.cnxyai.cn/app/api/device.php', expect.objectContaining({ method: 'POST' }))
  vi.unstubAllGlobals()
})

it('resets the account section when me reports an invalid session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-online-')); directories.push(dir)
  const ctx = await boot(dir); contexts.push(ctx)
  const call = (endpoint: string, payload: unknown = null) => channels.get('/xyai-online')!(endpoint, payload)
  await ctx.settings.update('xyai-online', { accessToken: 'stale-token', userId: 9, userName: 'Carol', userEmail: 'carol@cnxyai.cn' })

  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, message: 'expired' }) })))
  await expect(call('me')).resolves.toEqual({ ok: true, value: { errcode: '401', errmsg: 'expired', user: null } })
  expect(ctx.settings.get('xyai-online').accessToken).toBe('')
  vi.unstubAllGlobals()
})
