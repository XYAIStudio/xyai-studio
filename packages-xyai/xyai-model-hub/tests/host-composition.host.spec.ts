/** Model-hub persistence through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { expect, it } from 'vitest'
import * as hub from '../src/index.ts'
import { defaultModelHub } from '../src/models.ts'

it('persists a validated model-hub document across Loader restarts and rejects invalid values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-model-hub-'))
  const configPath = join(dir, 'cordis.yml')
  const settingsPath = join(dir, 'settings.json')
  await writeFile(configPath, JSON.stringify([
    { name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
    { name: '@xyai/dsh-model-hub' },
  ]))
  async function boot() {
    const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-settings-file', FileSettingsProvider], ['@xyai/dsh-model-hub', hub]])
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
    const initial = ctx.settings.get('xyai-model-hub')
    expect(initial.preference).toBe(defaultModelHub.preference)
    expect(initial.catalog).toBe(defaultModelHub.catalog)
    expect(initial.registryJson).toBe('[]')
    await ctx.settings.update('xyai-model-hub', { preference: 'cloud', catalog: '本地 · qwen2.5-32b|local-gguf|' })
    const stored = JSON.parse(await readFile(settingsPath, 'utf8'))['xyai-model-hub']
    expect(stored.preference).toBe('cloud')
    await expect(ctx.settings.update('xyai-model-hub', { preference: 'edge' })).rejects.toThrow()
    await ctx.fiber.dispose(); ctx = await boot()
    expect(ctx.settings.get('xyai-model-hub').preference).toBe('cloud')
    // Registry persistence across restart
    await ctx.settings.update('xyai-model-hub', {
      registryJson: JSON.stringify([{ id: 't1', name: 'Test', kind: 'GGUF', size: '1', path: '/tmp/x.gguf', mounted: true, missing: true }]),
      defaultModelId: 't1',
    })
    await ctx.fiber.dispose(); ctx = await boot()
    expect(ctx.settings.get('xyai-model-hub').defaultModelId).toBe('t1')
    expect(JSON.parse(ctx.settings.get('xyai-model-hub').registryJson)[0].id).toBe('t1')
  } finally {
    await ctx?.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
