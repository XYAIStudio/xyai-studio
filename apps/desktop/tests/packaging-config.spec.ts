import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface DesktopPackage {
  readonly scripts: Readonly<Record<string, string>>
  readonly build: {
    readonly afterPack: string
    readonly electronDist: string
    readonly extraResources: readonly {
      readonly from: string
      readonly to: string
      readonly filter?: readonly string[]
    }[]
    readonly mac: {
      readonly hardenedRuntime: boolean
      readonly icon: string
      readonly notarize: boolean
    }
    readonly win: { readonly icon: string }
  }
}

interface RootPackage {
  readonly scripts: Readonly<Record<string, string>>
}

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(desktopRoot, '../..')
const workspaceConfiguration = readFileSync(resolve(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')
const desktopPackage = JSON.parse(
  readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'),
) as DesktopPackage
const rootPackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as RootPackage
const runtimeStaging = readFileSync(resolve(desktopRoot, 'scripts/stage-runtime.ts'), 'utf8')
const migratedIndustryAgent = readFileSync(
  resolve(repositoryRoot, 'packages/client/xyai-industry-agent/lib/client.js'),
  'utf8',
)

describe('desktop packaging configuration', () => {
  it('packages the installed Electron distribution', () => {
    expect(desktopPackage.build.electronDist).toBe('node_modules/electron/dist')
    expect(workspaceConfiguration).toContain('electron-winstaller: false')
  })

  it('maps the staged Host node_modules directory as the copy root', () => {
    expect(desktopPackage.build.extraResources).toEqual(expect.arrayContaining([
      { from: 'runtime-host/package.json', to: 'host/package.json' },
      { from: 'runtime-host/node_modules', to: 'host/node_modules' },
      { from: 'resources/llama-cpp', to: 'llama-cpp' },
    ]))
    expect(desktopPackage.build.afterPack).toBe('./scripts/verify-packaged-runtime.ts')
  })

  it('includes the XYOS frontend and backend but excludes mutable local state', () => {
    expect(desktopPackage.build.extraResources).toEqual(expect.arrayContaining([
      { from: '../../xyos-dist', to: 'dist' },
      expect.objectContaining({
        from: '../../xyos-backend',
        to: 'xyos-backend',
        filter: expect.arrayContaining(['!.env', '!runtime-workspace/**', '!data/**', '!uploads/**']),
      }),
      { from: '../../xyos-backend/node_modules', to: 'xyos-backend/node_modules' },
    ]))
  })

  it('ships the historical IndustryAgent client from the current source tree only', () => {
    expect(runtimeStaging).toContain("packages/client/xyai-industry-agent/lib/client.js")
    expect(runtimeStaging).not.toContain('../XYAI-Studio/legacy')
    expect(migratedIndustryAgent).toContain('parseDesktopClientEnvironment(`${window.location.search}&dsh-desktop-mode=xyai&dsh-desktop-platform=win32`)')
    expect(migratedIndustryAgent).toContain('IndustryAgentView')
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/lib/skill-workspace.js'), 'utf8'))
      .toContain('registerKnowledgeBaseRoutes')
    for (const asset of [
      'xyos-backend-DROJg1pS.js',
      'local-gguf-3IBAx29M.js',
      'ollama-client-B5R1Vg5V.js',
      'production-projects-D-aghHr8.js',
    ]) {
      expect(readFileSync(resolve(repositoryRoot, `packages/client/xyai-industry-agent/lib/${asset}`), 'utf8').length)
        .toBeGreaterThan(1000)
    }
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/lib/local-gguf.js'), 'utf8'))
      .toContain("from './local-gguf-3IBAx29M.js'")
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/package.json'), 'utf8'))
      .toContain('"./local-gguf": "./lib/local-gguf.js"')
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/package.json'), 'utf8'))
      .toContain('"./ollama-provider": "./lib/ollama-provider.js"')
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/lib/ollama-provider.js'), 'utf8'))
      .toContain("const PROVIDER = 'xyai-ollama'")
    expect(readFileSync(resolve(repositoryRoot, 'packages/client/xyai-industry-agent/lib/ollama-provider.js'), 'utf8'))
      .not.toContain("import { settingsNamespace }")
  })

  it('ships one shared llama.cpp runtime instead of a path into a historical checkout', () => {
    expect(readFileSync(resolve(desktopRoot, 'resources/llama-cpp/llama-server.exe')).length).toBeGreaterThan(8_000)
    expect(readFileSync(resolve(desktopRoot, 'resources/llama-cpp/llama.dll')).length).toBeGreaterThan(1_000_000)
    expect(readFileSync(resolve(desktopRoot, 'src/main.ts'), 'utf8')).toContain("name: dsh-plugin-desktop/local-gguf")
    expect(readFileSync(resolve(desktopRoot, 'src/main.ts'), 'utf8')).toContain("name: dsh-plugin-desktop/ollama-provider")
  })

  it('allows an acceptance run to isolate Electron state in an explicitly writable directory', () => {
    const main = readFileSync(resolve(desktopRoot, 'src/main.ts'), 'utf8')
    expect(main).toContain('XYAI_STUDIO_ACCEPTANCE_USER_DATA')
    expect(main).toContain("app.setPath('userData', acceptanceUserData)")
  })

  it('falls back from Chromium GPU compositing without disabling local Vulkan inference', () => {
    const main = readFileSync(resolve(desktopRoot, 'src/main.ts'), 'utf8')
    expect(main).toContain("process.env.XYAI_RENDERER_GPU?.trim().toLowerCase() === 'on'")
    expect(main).toContain('app.disableHardwareAcceleration()')
    expect(main).toContain("app.commandLine.appendSwitch('disable-gpu')")
    expect(main).toContain("app.commandLine.appendSwitch('in-process-gpu')")
    expect(main).toContain('llama.cpp')
  })

  it('exposes the legacy model-marketplace GPU subscription through the narrowed desktop bridge', () => {
    const preload = readFileSync(resolve(desktopRoot, 'src/dsh-preload.ts'), 'utf8')
    expect(preload).toContain('onGpuInfo:')
    expect(preload).toContain("subscribe('xyai:model-marketplace-refresh', callback)")
  })

  it('keeps the pre-built IndustryAgent browser asset out of the generic Host rebuild', () => {
    const rootTsdown = readFileSync(resolve(repositoryRoot, 'tsdown.config.ts'), 'utf8')
    expect(rootTsdown).toContain("'!packages/client/xyai-industry-agent'")
  })

  it('ships the optional Codex and Claude harness providers for explicit profile activation', () => {
    const desktopRuntime = readFileSync(resolve(desktopRoot, 'runtime-host/package.json'), 'utf8')
    const pythonRuntime = readFileSync(resolve(repositoryRoot, 'python/sdk-runtime/package.json'), 'utf8')
    for (const dependency of [
      '@deepseek-ai/dsh-subagent-codex',
      '@deepseek-ai/dsh-subagent-claude-code',
    ]) {
      expect(desktopRuntime).toContain(`\"${dependency}\": \"workspace:^\"`)
      expect(pythonRuntime).toContain(`\"${dependency}\": \"workspace:^\"`)
    }
  })

  it('keeps the supplied image byte-for-byte and shares it across macOS and Windows', () => {
    const icon = readFileSync(resolve(desktopRoot, 'build/icon.png'))

    expect(createHash('sha256').update(icon).digest('hex'))
      .toBe('ac70afef07db817c9597175236b078288327a21ba4cddcdd8051a3a5321a73ce')
    expect(desktopPackage.build.mac.icon).toBe('build/icon.png')
    expect(desktopPackage.build.win.icon).toBe('build/icon.png')
  })

  it('builds and stages the complete workspace before local packaging', () => {
    for (const name of ['package', 'dist']) {
      expect(desktopPackage.scripts[name]).toContain('pnpm --workspace-root run build')
      expect(desktopPackage.scripts[name]).toContain('pnpm run build')
      expect(desktopPackage.scripts[name]).toContain('scripts/stage-runtime.ts')
    }
    expect(desktopPackage.scripts.package).toContain('electron-builder --dir')
    expect(desktopPackage.scripts.package).not.toContain('release-preflight.ts')
  })

  it('makes the macOS DMG path signed, hardened, and notarized', () => {
    const command = desktopPackage.scripts['dist:mac']

    expect(command).toBe('node --import tsx scripts/release-mac.ts')
    expect(desktopPackage.build.mac.hardenedRuntime).toBe(true)
    expect(desktopPackage.build.mac.notarize).toBe(true)
  })

  it('exposes generic and macOS release commands at the repository root', () => {
    expect(rootPackage.scripts['dist:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dist')
    expect(rootPackage.scripts['dist:mac:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dist:mac')
  })
})
