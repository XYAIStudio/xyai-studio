import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(desktopRoot, 'src/kb-mention-overlay.ts'), 'utf8')

function embeddedScript(): string {
  const start = source.indexOf('<script>')
  const end = source.indexOf('</script>', start)
  if (start < 0 || end < 0) throw new Error('script tags missing in kb-mention overlay')
  return source.slice(start + '<script>'.length, end)
}

describe('W-105b @知识库 overlay source', () => {
  it('keeps the embedded overlay script syntactically valid', () => {
    const script = embeddedScript()
    expect(script.length).toBeGreaterThan(500)
    const tmp = resolve(desktopRoot, 'tests/.kb-mention-script.js')
    const log = resolve(desktopRoot, 'tests/.kb-mention-syntax.log')
    writeFileSync(tmp, script, 'utf8')
    try {
      execFileSync(process.execPath, ['--check', tmp], { encoding: 'utf8', stdio: 'pipe' })
    } catch (error: unknown) {
      const ex = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
      const err = typeof ex.stderr === 'string' ? ex.stderr : ''
      writeFileSync(log, err, 'utf8')
      throw new Error('kb-mention overlay script syntax error:' + String.fromCharCode(10) + (err || String(ex.message ?? '')).slice(0, 1200))
    }
    expect(true).toBe(true)
  })

  it('exposes the mention pill, scopes and model-status wiring', () => {
    expect(source).toContain('KB_MENTION_OVERLAY_HTML')
    expect(source).toContain('kb-pill')
    expect(source).toContain('kb-scopes')
    expect(source).toContain('kb-model-status')
    expect(source).toContain('knowledgeChatAsk')
    expect(source).toContain('knowledgeChatModelStatus')
    expect(source).toContain('kbMentionToggle')
  })

  it('keeps the embedded script free of template literals', () => {
    const script = embeddedScript()
    expect(script).not.toContain('${')
    const backticks = script.split('`').length - 1
    expect(backticks).toBe(0)
  })
})
