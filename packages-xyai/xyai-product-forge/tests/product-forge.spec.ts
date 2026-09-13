import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))

interface BundleManifest {
  readonly name?: string
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
}

interface ProfileManifest {
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
  readonly dependencies?: Record<string, string>
}

describe('@xyai/dsh-product-forge', () => {
  it('declares the experimental forge closure and Cordis patch', () => {
    const manifest = JSON.parse(
      readFileSync(`${root}/packages-xyai/xyai-product-forge/package.json`, 'utf8'),
    ) as BundleManifest
    expect(manifest.name).toBe('@xyai/dsh-product-forge')
    expect(manifest.dependencies).toEqual({
      '@xyai/dsh-agent-forge': 'workspace:*',
    })
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('mounts agent-forge only', () => {
    const patch = readFileSync(`${root}/packages-xyai/xyai-product-forge/cordis.patch.yml`, 'utf8')
    expect(patch).toContain('id: xyai-agent-forge')
    expect(patch).toContain("name: '@xyai/dsh-agent-forge'")
    expect(patch).not.toContain('xyai-ai-employees')
    expect(patch).not.toContain('xyai-online-auth')
    expect(patch).not.toContain('xyai-brand-pack')
  })

  it('is omitted from the default full xyai profile (explicit opt-in)', () => {
    const profile = JSON.parse(readFileSync(`${root}/profiles/xyai/package.json`, 'utf8')) as ProfileManifest
    const bundles = profile.dsh?.profile?.bundles ?? []
    expect(bundles).not.toContain('@xyai/dsh-product-forge')
    expect(bundles).not.toContain('@xyai/dsh-agent-forge')
    expect(profile.dependencies?.['@xyai/dsh-product-forge']).toBeUndefined()
    expect(profile.dependencies?.['@xyai/dsh-agent-forge']).toBeUndefined()
  })
})
