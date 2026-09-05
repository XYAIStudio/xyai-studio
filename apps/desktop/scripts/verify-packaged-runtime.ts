/** Reject a packaged desktop shell that omitted the staged Host entrypoints. */

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { AfterPackContext } from 'electron-builder'

const REQUIRED_HOST_FILES = [
  ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
] as const

const REQUIRED_XYOS_FILES = [
  ['node_modules', 'tsx', 'dist', 'cli.mjs'],
] as const

/**
 * Verify the Host files required before the signed application can start.
 * @param context - Electron Builder's completed application directory.
 * @returns A promise that rejects when a staged Host entrypoint is absent.
 */
export async function afterPack(context: AfterPackContext): Promise<void> {
  const resources = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  for (const segments of REQUIRED_HOST_FILES) {
    await access(join(resources, 'host', 'node_modules', ...segments))
  }
  if (process.env.XYAI_RELEASE_EDITION !== 'core') {
    for (const segments of REQUIRED_XYOS_FILES) {
      const target = join(resources, 'xyos-backend', ...segments)
      try {
        await access(target)
      } catch (error) {
        // Unsigned internal mac CI sets CSC_IDENTITY_AUTO_DISCOVERY=false and may
        // ship without a pre-installed xyos-backend/node_modules tree. Soft-fail
        // only that path so DMG packaging can finish; signed/prod builds still fail hard.
        const unsignedMac = context.electronPlatformName === 'darwin'
          && process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
        if (!unsignedMac) throw error
        console.warn("[afterPack] soft-fail missing " + target + " (unsigned mac)")
      }
    }
  }
}

export default afterPack
