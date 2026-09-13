/** Tenancy persistence through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { expect, it } from 'vitest'
import * as tenancy from '../src/index.ts'

it('persists a validated tenancy document across Loader restarts and rejects invalid values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-tenancy-'))
  const configPath = join(dir, 'cordis.yml')
  const settingsPath = join(dir, 'settings.json')
  await writeFile(configPath, JSON.stringify([
    { name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
    { name: '@xyai/dsh-tenancy' },
  ]))
  async function boot() {
    const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-settings-file', FileSettingsProvider], ['@xyai/dsh-tenancy', tenancy]])
    ctx.loader.internal = { version: 'v2', async import(name: string) {
      if (!modules.has(name)) throw new Error('Unexpected module: ' + name)
      return modules.get(name)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    return ctx
  }
  let ctx: Context | undefined
  try {
    ctx = await boot()
    await ctx.settings.update('xyai-tenancy', { tenant: '启明智创', plan: 'enterprise', seats: 24, entitlements: 'brand,local-models' })
    const stored = JSON.parse(await readFile(settingsPath, 'utf8'))['xyai-tenancy']
    expect(stored.tenant).toBe('启明智创'); expect(stored.seats).toBe(24)
    await expect(ctx.settings.update('xyai-tenancy', { plan: 'platinum' })).rejects.toThrow()
    await expect(ctx.settings.update('xyai-tenancy', { seats: 0 })).rejects.toThrow()
    await expect(ctx.settings.update('xyai-tenancy', { expiresAt: 'not-a-date' })).rejects.toThrow()
    await ctx.fiber.dispose(); ctx = await boot()
    expect(ctx.settings.get('xyai-tenancy')).toEqual({
      tenant: '启明智创', plan: 'enterprise', seats: 24,
      licenseKey: '', expiresAt: '', entitlements: 'brand,local-models',
    })
  } finally {
    await ctx?.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
