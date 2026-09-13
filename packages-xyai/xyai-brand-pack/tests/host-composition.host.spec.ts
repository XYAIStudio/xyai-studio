/** Brand persistence through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { expect, it } from 'vitest'
import * as brand from '../src/index.ts'

it('persists a validated brand across Loader restarts and rejects invalid colors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-brand-'))
  const configPath = join(dir, 'cordis.yml')
  const settingsPath = join(dir, 'settings.json')
  await writeFile(configPath, JSON.stringify([
    { name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
    { name: '@xyai/dsh-brand-pack' },
  ]))
  async function boot() {
    const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([['@deepseek-ai/dsh-settings-file', FileSettingsProvider], ['@xyai/dsh-brand-pack', brand]])
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
    await ctx.settings.update('xyai-brand', { name: '行业工作室', initials: '行业', accent: '#008866' })
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))['xyai-brand'].name).toBe('行业工作室')
    await expect(ctx.settings.update('xyai-brand', { accent: 'url(https://invalid)' })).rejects.toThrow()
    await expect(ctx.settings.update('xyai-brand', { logo: 'not-a-dataurl' })).rejects.toThrow()
    await ctx.fiber.dispose(); ctx = await boot()
    expect(ctx.settings.get('xyai-brand')).toEqual({
      name: '行业工作室', initials: '行业', accent: '#008866',
      text: '', gradientFrom: '#1565c0', gradientTo: '#0288d1', vision: '', site: '', icp: '', logo: '',
    })
  } finally {
    await ctx?.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
