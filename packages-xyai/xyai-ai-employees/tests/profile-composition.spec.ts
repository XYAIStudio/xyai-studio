import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))

interface ProfileManifest {
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
  readonly dependencies?: Record<string, string>
}

describe('XYAI profile composition', () => {
  it('layers DSH base, Agent Teams, Web, and product layers without residual xyai-app or forge', () => {
    const manifest = JSON.parse(readFileSync(`${root}/profiles/xyai/package.json`, 'utf8')) as ProfileManifest
    expect(manifest.dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-experimental-agent-team-profile',
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-experimental-agent-team-web-profile',
      '@xyai/dsh-product-base',
      '@xyai/dsh-product-collab',
      '@xyai/dsh-product-online',
    ])
    expect(manifest.dsh?.profile?.bundles).not.toContain('@xyai/dsh-xyai-app')
    expect(manifest.dsh?.profile?.bundles).not.toContain('@xyai/dsh-product-forge')
    expect(manifest.dsh?.profile?.bundles).not.toContain('@xyai/dsh-agent-forge')
  })

  it('mounts the AI employee plugin through the product-collab bundle', () => {
    const patch = readFileSync(`${root}/packages-xyai/xyai-collab/cordis.patch.yml`, 'utf8')
    expect(patch).toContain('id: xyai-ai-employees')
    expect(patch).toContain("name: '@xyai/dsh-ai-employees'")
  })

  it('keeps online-auth, tenancy, and commerce on the product-online layer only', () => {
    const online = readFileSync(`${root}/packages-xyai/xyai-product-online/cordis.patch.yml`, 'utf8')
    expect(online).toContain('id: xyai-online-auth')
    expect(online).toContain('id: xyai-tenancy')
    expect(online).toContain('id: xyai-commerce')
    const app = readFileSync(`${root}/packages-xyai/xyai-app/cordis.patch.yml`, 'utf8')
    expect(app).not.toContain('xyai-online-auth')
    expect(app).not.toContain('xyai-tenancy')
    expect(app).not.toContain('xyai-commerce')
    expect(app).not.toContain('xyai-agent-forge')
  })

  it('gates Agent Forge behind the opt-in product-forge bundle only', () => {
    const forge = readFileSync(`${root}/packages-xyai/xyai-product-forge/cordis.patch.yml`, 'utf8')
    expect(forge).toContain('id: xyai-agent-forge')
    expect(forge).toContain("name: '@xyai/dsh-agent-forge'")

    const base = readFileSync(`${root}/packages-xyai/xyai-base/cordis.patch.yml`, 'utf8')
    const collab = readFileSync(`${root}/packages-xyai/xyai-collab/cordis.patch.yml`, 'utf8')
    const online = readFileSync(`${root}/packages-xyai/xyai-product-online/cordis.patch.yml`, 'utf8')
    const app = readFileSync(`${root}/packages-xyai/xyai-app/cordis.patch.yml`, 'utf8')
    for (const patch of [base, collab, online, app]) {
      expect(patch).not.toContain('xyai-agent-forge')
      expect(patch).not.toContain('@xyai/dsh-agent-forge')
    }

    const profile = JSON.parse(readFileSync(`${root}/profiles/xyai/package.json`, 'utf8')) as ProfileManifest
    expect(profile.dependencies?.['@xyai/dsh-product-forge']).toBeUndefined()
    expect(profile.dependencies?.['@xyai/dsh-agent-forge']).toBeUndefined()
  })
})
