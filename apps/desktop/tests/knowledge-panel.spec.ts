import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const panelSource = readFileSync(resolve(desktopRoot, 'src/founders-panel.ts'), 'utf8')

function embeddedScript(): string {
  const scriptTag = '<script>'
  const start = panelSource.indexOf(scriptTag)
  const end = panelSource.indexOf('</script>', start)
  if (start < 0 || end < 0) throw new Error('script tags missing in founders panel')
  return panelSource.slice(start + scriptTag.length, end)
}

describe('XYAI Founders knowledge panel source', () => {
  it('keeps the embedded panel script syntactically valid', () => {
    const script = embeddedScript()
    expect(script.length).toBeGreaterThan(5000)
    const tmpScript = resolve(desktopRoot, 'tests/.kb-panel-script.js')
    const log = resolve(desktopRoot, 'tests/.kb-panel-syntax.log')
    writeFileSync(tmpScript, script, 'utf8')
    try {
      execFileSync(process.execPath, ['--check', tmpScript], { encoding: 'utf8', stdio: 'pipe' })
    } catch (error: unknown) {
      const ex = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
      const out = typeof ex.stdout === 'string' ? ex.stdout : ''
      const err = typeof ex.stderr === 'string' ? ex.stderr : ''
      writeFileSync(log, out + err, 'utf8')
      throw new Error('embedded script syntax error:\n' + (err || String(ex.message ?? '')).slice(0, 1200))
    }
    expect(true).toBe(true)
  })

  it('exposes the wizard, parse-centre filters and the theme hook', () => {
    expect(panelSource).toContain('function knowledge(){')
    expect(panelSource).toContain('kb-wizard-slot')
    expect(panelSource).toContain('knowledgePickDirectory')
    expect(panelSource).toContain('knowledgePrecheck')
    expect(panelSource).toContain('knowledgeMountPath')
    expect(panelSource).toContain('kb-theme-toggle')
    expect(panelSource).toContain('body.dark')
    expect(panelSource).toContain('kbApplyThemeState')
    expect(panelSource).toContain('cycleTheme')
    expect(panelSource).toContain('data-preview')
    expect(panelSource).toContain('filterchip')
  })

  it('renders capability center as plugin/skills card tabs with install-import actions', () => {
    expect(panelSource).toContain("tabBtn('plugins'")
    expect(panelSource).toContain("tabBtn('skills'")
    expect(panelSource).toContain('cap-cards')
    expect(panelSource).toContain('cap-card')
    expect(panelSource).toContain('cap-plugin-import')
    expect(panelSource).toContain('data-cap-import-skill')
    expect(panelSource).toContain('data-cap-import-plugin')
    expect(panelSource).toContain('agentPluginInstall')
    expect(panelSource).toContain('agentSkillImportLocal')
  })

  it('keeps embedded scripts free of template-literal escapes', () => {
    const script = embeddedScript()
    expect(script).not.toContain('${')
    const backticks = script.split('`').length - 1
    expect(backticks).toBe(0)
  })
})