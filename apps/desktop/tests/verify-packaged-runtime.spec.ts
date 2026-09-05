import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { afterPack } from '../scripts/verify-packaged-runtime.ts'

function context(appOutDir: string, electronPlatformName = 'darwin') {
  return {
    appOutDir,
    electronPlatformName,
    packager: { appInfo: { productFilename: 'DeepSeek Harness' } },
  } as Parameters<typeof afterPack>[0]
}

describe('packaged desktop runtime verification', () => {
  it('accepts packaged DSH and XYOS entrypoints', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      const resources = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
      const cli = join(resources, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      const web = join(resources, '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
      const xyosTsx = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'xyos-backend', 'node_modules', 'tsx', 'dist', 'cli.mjs')
      await mkdir(join(cli, '..'), { recursive: true })
      await mkdir(join(web, '..'), { recursive: true })
      await mkdir(join(xyosTsx, '..'), { recursive: true })
      await writeFile(cli, '')
      await writeFile(web, '')
      await writeFile(xyosTsx, '')

      await expect(afterPack(context(appOutDir))).resolves.toBeUndefined()
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a shell whose Host dependency tree was filtered out', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      await expect(afterPack(context(appOutDir))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('soft-fails missing xyos tsx on unsigned darwin when Host files exist', async () => {
    const prev = process.env.CSC_IDENTITY_AUTO_DISCOVERY
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      const resources = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
      const cli = join(resources, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      const web = join(resources, '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
      await mkdir(join(cli, '..'), { recursive: true })
      await mkdir(join(web, '..'), { recursive: true })
      await writeFile(cli, '')
      await writeFile(web, '')
      await expect(afterPack(context(appOutDir))).resolves.toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.CSC_IDENTITY_AUTO_DISCOVERY
      else process.env.CSC_IDENTITY_AUTO_DISCOVERY = prev
      await rm(appOutDir, { recursive: true, force: true })
    }
  })
})
