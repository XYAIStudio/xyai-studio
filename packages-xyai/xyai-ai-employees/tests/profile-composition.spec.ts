import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))

interface ProfileManifest {
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

describe('XYAI profile composition', () => {
  it('layers DSH base, Agent Teams, Web, and the XYAI application in executable order', () => {
    const manifest = JSON.parse(readFileSync(`${root}/profiles/xyai/package.json`, 'utf8')) as ProfileManifest
    expect(manifest.dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-experimental-agent-team-profile',
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-experimental-agent-team-web-profile',
      '@xyai/dsh-xyai-app',
    ])
  })

  it('mounts the AI employee plugin through the XYAI application bundle', () => {
    const patch = readFileSync(`${root}/packages-xyai/xyai-app/cordis.patch.yml`, 'utf8')
    expect(patch).toContain("id: xyai-ai-employees")
    expect(patch).toContain("name: '@xyai/dsh-ai-employees'")
  })
})
