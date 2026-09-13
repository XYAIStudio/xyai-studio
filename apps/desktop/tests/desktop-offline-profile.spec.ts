import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

describe('desktop offline-first profile (Phase 3)', () => {
  it('keeps DESKTOP_PROFILE_BUNDLES on product-base + product-collab only', () => {
    const source = readFileSync(`${repoRoot}/apps/desktop/src/project-manager.ts`, 'utf8')
    const match = source.match(/const DESKTOP_PROFILE_BUNDLES = \[([^\]]+)\]/u)
    expect(match).not.toBeNull()
    const bundles = [...match![1].matchAll(/'([^']+)'/gu)].map(entry => entry[1])
    expect(bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@xyai/dsh-product-base',
      '@xyai/dsh-product-collab',
    ])
    expect(bundles).not.toContain('@xyai/dsh-product-online')
    expect(bundles).not.toContain('@xyai/dsh-product-forge')
    expect(bundles).not.toContain('@xyai/dsh-xyai-app')
    expect(bundles).not.toContain('@xyai/dsh-agent-forge')
    expect(bundles).not.toContain('@xyai/dsh-online-auth')
    expect(bundles).not.toContain('@xyai/dsh-tenancy')
    expect(bundles).not.toContain('@xyai/dsh-commerce')
  })

  it('does not pull online-auth, tenancy, commerce, or forge into the desktop package closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@deepseek-ai/dsh', packed('@deepseek-ai/dsh', {
        dependencies: { '@deepseek-ai/dsh-base': '^1.0.0' },
      })],
      ['@deepseek-ai/dsh-desktop-host', packed('@deepseek-ai/dsh-desktop-host', {
        dependencies: { '@deepseek-ai/dsh': '^1.0.0' },
      })],
      ['@deepseek-ai/dsh-base', packed('@deepseek-ai/dsh-base')],
      ['@xyai/dsh-product-base', packed('@xyai/dsh-product-base', {
        dependencies: { '@xyai/dsh-composer': 'workspace:*' },
      })],
      ['@xyai/dsh-composer', packed('@xyai/dsh-composer')],
      ['@xyai/dsh-product-collab', packed('@xyai/dsh-product-collab', {
        dependencies: { '@xyai/dsh-ai-employees': 'workspace:*' },
      })],
      ['@xyai/dsh-ai-employees', packed('@xyai/dsh-ai-employees')],
      ['@xyai/dsh-product-online', packed('@xyai/dsh-product-online', {
        dependencies: {
          '@xyai/dsh-online-auth': 'workspace:*',
          '@xyai/dsh-tenancy': 'workspace:*',
          '@xyai/dsh-commerce': 'workspace:*',
        },
      })],
      ['@xyai/dsh-online-auth', packed('@xyai/dsh-online-auth')],
      ['@xyai/dsh-tenancy', packed('@xyai/dsh-tenancy')],
      ['@xyai/dsh-commerce', packed('@xyai/dsh-commerce')],
      ['@xyai/dsh-product-forge', packed('@xyai/dsh-product-forge', {
        dependencies: { '@xyai/dsh-agent-forge': 'workspace:*' },
      })],
      ['@xyai/dsh-agent-forge', packed('@xyai/dsh-agent-forge')],
    ])
    const names = selectDesktopPackageClosure(available).map(entry => entry.manifest.name)
    expect(names).toContain('@xyai/dsh-product-base')
    expect(names).toContain('@xyai/dsh-product-collab')
    expect(names).not.toContain('@xyai/dsh-product-online')
    expect(names).not.toContain('@xyai/dsh-online-auth')
    expect(names).not.toContain('@xyai/dsh-tenancy')
    expect(names).not.toContain('@xyai/dsh-commerce')
    expect(names).not.toContain('@xyai/dsh-product-forge')
    expect(names).not.toContain('@xyai/dsh-agent-forge')
  })

  it('documents pack-xyai roots as product-base + product-collab only', () => {
    const pack = readFileSync(`${repoRoot}/apps/desktop/scripts/pack-xyai-set.mjs`, 'utf8')
    expect(pack).toContain("const XYAI_ROOT_PACKAGES = ['@xyai/dsh-product-base', '@xyai/dsh-product-collab']")
    expect(pack).not.toMatch(/XYAI_ROOT_PACKAGES = \[[^\]]*product-online/u)
    expect(pack).not.toMatch(/XYAI_ROOT_PACKAGES = \[[^\]]*product-forge/u)
    expect(pack).not.toMatch(/XYAI_ROOT_PACKAGES = \[[^\]]*agent-forge/u)
  })
})
