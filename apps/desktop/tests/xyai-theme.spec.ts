import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cycleThemePreference,
  loadThemePreference,
  normalizeThemePreference,
  resolveThemeDark,
  saveThemePreference,
  syncDshThemePreference,
  themeToggleLabel,
  XYAI_SURFACE_HARDEN_CSS,
  XYAI_WELCOME_DARK_CSS,
} from '../src/xyai-theme.ts'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('XYAI global theme preference (K-001 / W-107)', () => {
  it('normalizes and cycles preference in a stable order', () => {
    expect(normalizeThemePreference('nope')).toBe('system')
    expect(cycleThemePreference('system')).toBe('light')
    expect(cycleThemePreference('light')).toBe('dark')
    expect(cycleThemePreference('dark')).toBe('system')
  })

  it('resolves dark from preference and system appearance', () => {
    expect(resolveThemeDark('dark', false)).toBe(true)
    expect(resolveThemeDark('light', true)).toBe(false)
    expect(resolveThemeDark('system', true)).toBe(true)
    expect(resolveThemeDark('system', false)).toBe(false)
  })

  it('persists preference under userData and labels the shell toggle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyai-theme-'))
    try {
      expect(loadThemePreference(dir)).toBe('system')
      saveThemePreference(dir, 'dark')
      expect(loadThemePreference(dir)).toBe('dark')
      expect(themeToggleLabel({ preference: 'system', dark: true })).toContain('跟随')
      expect(themeToggleLabel({ preference: 'dark', dark: true })).toContain('亮色')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes ui-theme.preference into DSH settings.yaml without wiping other sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyai-dsh-theme-'))
    try {
      writeFileSync(join(dir, 'settings.yaml'), 'other:\n  keep: true\n', 'utf8')
      syncDshThemePreference(dir, 'dark')
      const text = readFileSync(join(dir, 'settings.yaml'), 'utf8')
      expect(text).toContain('other:')
      expect(text).toContain('keep: true')
      expect(text).toMatch(/ui-theme:[\s\S]*preference:\s*dark/)
      syncDshThemePreference(dir, 'light')
      expect(readFileSync(join(dir, 'settings.yaml'), 'utf8')).toMatch(/preference:\s*light/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ships dark welcome overrides and dark surface tokens for DSH insertCSS', () => {
    expect(XYAI_WELCOME_DARK_CSS).toContain('body[data-ds-dark-theme] .xyai-home-welcome-title')
    expect(XYAI_WELCOME_DARK_CSS).toContain('xyai-home-guide-card')
    expect(XYAI_SURFACE_HARDEN_CSS).toContain('body[data-ds-dark-theme]')
    expect(XYAI_SURFACE_HARDEN_CSS).toContain('#1a2332')
    expect(XYAI_SURFACE_HARDEN_CSS).not.toMatch(/body,\s*body\[data-ds-dark-theme\]\s*\{[^}]*#ffffff/)
  })

  it('exposes a visible shell theme toggle and wires preload/main IPC', () => {
    const shell = readFileSync(resolve(desktopRoot, 'src/shell.ts'), 'utf8')
    const preload = readFileSync(resolve(desktopRoot, 'src/preload.ts'), 'utf8')
    const main = readFileSync(resolve(desktopRoot, 'src/main.ts'), 'utf8')
    const client = readFileSync(resolve(desktopRoot, '../../packages/client/xyai-industry-agent/lib/client.js'), 'utf8')
    expect(shell).toContain('id="theme-toggle"')
    expect(shell).toContain('cycleTheme')
    expect(preload).toContain('xyai:theme-cycle')
    expect(preload).toContain('xyai:theme-changed')
    expect(main).toContain('applyThemePreference')
    expect(main).toContain('XYAI_WELCOME_DARK_CSS')
    expect(client).toContain('body[data-ds-dark-theme] .xyai-home-welcome-title')
  })
})
