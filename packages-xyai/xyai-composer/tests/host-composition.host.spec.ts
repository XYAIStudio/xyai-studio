// @vitest-environment node
/** Composer settings through the actual Loader and file settings provider. */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { expect, it } from 'vitest'
import * as composer from '../src/index.ts'

it('registers the xyai-composer namespace through the Loader and rejects invalid phrases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xyai-composer-'))
  const configPath = join(dir, 'cordis.yml')
  const settingsPath = join(dir, 'settings.json')
  await writeFile(configPath, JSON.stringify([
    { name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
    { name: '@xyai/dsh-composer' },
  ]))
  async function boot() {
    const ctx = new Context(); ctx.baseUrl = pathToFileURL(dir).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@xyai/dsh-composer', composer],
    ])
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
    expect(ctx.settings.get('xyai-composer')).toEqual({ snippets: [], mode: 'standard', think: 'medium', kb: 'off', workspace: '' })
    await ctx.settings.update('xyai-composer', { snippets: [{ label: '问候', text: '你好' }] })
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))['xyai-composer'].snippets).toEqual([
      { label: '问候', text: '你好' },
    ])
    await expect(ctx.settings.update('xyai-composer', { snippets: [{ label: '', text: 'x' }] })).rejects.toThrow()
    await expect(ctx.settings.update('xyai-composer', {
      snippets: [{ label: 'x'.repeat(41), text: 'ok' }],
    })).rejects.toThrow()
    await ctx.fiber.dispose(); ctx = await boot()
    expect(ctx.settings.get('xyai-composer')).toEqual({ snippets: [{ label: '问候', text: '你好' }], mode: 'standard', think: 'medium', kb: 'off', workspace: '' })
  } finally {
    await ctx?.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
