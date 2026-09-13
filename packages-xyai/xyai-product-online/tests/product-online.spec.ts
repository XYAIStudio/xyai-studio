import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))

interface BundleManifest {
  readonly name?: string
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
}

describe('@xyai/dsh-product-online', () => {
  it('declares the online commercial closure and Cordis patch', () => {
    const manifest = JSON.parse(readFileSync(`${root}/packages-xyai/xyai-product-online/package.json`, 'utf8')) as BundleManifest
    expect(manifest.name).toBe('@xyai/dsh-product-online')
    expect(manifest.dependencies).toEqual({
      '@xyai/dsh-commerce': 'workspace:*',
      '@xyai/dsh-online-auth': 'workspace:*',
      '@xyai/dsh-tenancy': 'workspace:*',
    })
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })

  it('mounts online-auth, tenancy, and commerce plugins only', () => {
    const patch = readFileSync(`${root}/packages-xyai/xyai-product-online/cordis.patch.yml`, 'utf8')
    expect(patch).toContain("id: xyai-online-auth")
    expect(patch).toContain("name: '@xyai/dsh-online-auth'")
    expect(patch).toContain("id: xyai-tenancy")
    expect(patch).toContain("name: '@xyai/dsh-tenancy'")
    expect(patch).toContain("id: xyai-commerce")
    expect(patch).toContain("name: '@xyai/dsh-commerce'")
    expect(patch).not.toContain('xyai-ai-employees')
    expect(patch).not.toContain('xyai-brand-pack')
    expect(patch).not.toContain('xyai-agent-forge')
  })
})
