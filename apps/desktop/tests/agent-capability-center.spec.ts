import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  importPluginDirectory,
  importSkillDirectory,
  installPluginFiles,
  removePluginFiles,
  scanAgentCatalog,
} from '../src/xyai-core/agent-capability-center.ts'

function writeSkill(dir: string, name: string, description: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, 'utf8')
}

describe('agent capability center plugin/skills install-import', () => {
  it('scans Codex-style plugin.json packages and supports import/remove into DSH', () => {
    const root = mkdtempSync(join(tmpdir(), 'xyai-cap-'))
    const home = join(root, 'home')
    const dshHome = join(root, 'dsh')
    const pluginPkg = join(home, '.codex', 'plugins', 'cache', 'demo', '1.0.0')
    mkdirSync(join(pluginPkg, '.codex-plugin'), { recursive: true })
    writeFileSync(join(pluginPkg, '.codex-plugin', 'plugin.json'), JSON.stringify({
      name: 'demo-browser',
      version: '1.0.0',
      description: 'Demo browser plugin',
      interface: { displayName: 'Demo Browser', shortDescription: 'Open localhost pages' },
    }), 'utf8')
    writeSkill(join(home, '.codex', 'skills', '01-demo'), 'demo-skill', '演示技能')
    try {
      const catalog = scanAgentCatalog({ dshHome, homeDir: home })
      expect(catalog.skills.some((item) => item.id === 'demo-skill')).toBe(true)
      const plugin = catalog.plugins.find((item) => item.id === 'demo-browser')
      expect(plugin?.displayName).toBe('Demo Browser')
      expect(plugin?.imported).toBe(false)
      expect(plugin?.path).toBe(pluginPkg)
      const installed = installPluginFiles(catalog, pluginPkg)
      expect(installed.ok).toBe(true)
      expect(existsSync(join(dshHome, 'plugins', 'imported', 'demo-browser', '.xyai-installed.json'))).toBe(true)
      const again = scanAgentCatalog({ dshHome, homeDir: home })
      const imported = again.plugins.find((item) => item.id === 'demo-browser')
      expect(imported?.imported).toBe(true)
      expect(imported?.managed).toBe(true)
      const removed = removePluginFiles(again, 'demo-browser')
      expect(removed.ok).toBe(true)
      expect(existsSync(join(dshHome, 'plugins', 'imported', 'demo-browser'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('imports a local Skills folder that contains SKILL.md into DSH skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'xyai-cap-skill-'))
    const dshHome = join(root, 'dsh')
    const source = join(root, 'external-skill')
    writeSkill(source, 'imported-skill', '从本机文件夹导入')
    try {
      const catalog = scanAgentCatalog({ dshHome, homeDir: join(root, 'home') })
      const outcome = importSkillDirectory(catalog, source)
      expect(outcome.ok).toBe(true)
      expect(readFileSync(join(dshHome, 'skills', 'external-skill', 'SKILL.md'), 'utf8')).toContain('imported-skill')
      expect(existsSync(join(dshHome, 'skills', 'external-skill', '.xyai-installed.json'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('imports a local plugin folder into DSH plugins/imported', () => {
    const root = mkdtempSync(join(tmpdir(), 'xyai-cap-plugin-'))
    const dshHome = join(root, 'dsh')
    const source = join(root, 'my-plugin')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'manifest.json'), JSON.stringify({ name: 'my-plugin', version: '0.1.0' }), 'utf8')
    try {
      const catalog = scanAgentCatalog({ dshHome, homeDir: join(root, 'home') })
      const outcome = importPluginDirectory(catalog, source)
      expect(outcome.ok).toBe(true)
      expect(existsSync(join(dshHome, 'plugins', 'imported', 'my-plugin', 'manifest.json'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
