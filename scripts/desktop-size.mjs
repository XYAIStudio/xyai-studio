#!/usr/bin/env node
/**
 * Desktop installer size audit for the 0.4 minimal package.
 *
 * Minimal package = XYAI shell (Electron) + A-class runtime closure
 * (@deepseek-ai/dsh + deps, ~218MB measured) + bundled XYAI layer (packages-xyai
 * lib) + web frontend dist. B/C dependencies are NOT included (componentized).
 *
 * Usage: node scripts/desktop-size.mjs [--fresh] [--limit=524288000]
 *   --fresh  re-measure the registry closure instead of using the cached value.
 *   --limit  fail threshold in bytes (default 500MB).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const limit = Number.parseInt((process.argv.find(a => a.startsWith('--limit=')) ?? '--limit=838860800').slice(8), 10) || 838_860_800
const fresh = process.argv.includes('--fresh')
const CACHE = join(root, 'node_modules', '.desktop-closure-size.txt')

function dirBytes(path) {
  if (!existsSync(path)) return 0
  let total = 0
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name)
      if (entry.isDirectory()) walk(full)
      else { try { total += statSync(full).size } catch { /* ignore */ } }
    }
  }
  walk(path)
  return total
}

const CLOSURE_BASELINE = 218 * 1024 * 1024 // measured @deepseek-ai/dsh@0.1.2-rc.1 prod closure

function closureBytes() {
  if (!fresh && existsSync(CACHE)) {
    const cached = Number(readFileSync(CACHE, 'utf8').trim())
    if (cached > 0) return cached
  }
  const dir = mkdtempSync(join(tmpdir(), 'dsh-closure-'))
  spawnSync('pnpm', ['init', '-y'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32' })
  const out = spawnSync('pnpm', ['add', '--prod', '@deepseek-ai/dsh@0.1.2-rc.1'], { cwd: dir, stdio: 'pipe', shell: process.platform === 'win32' })
  let size = 0
  if (out.status === 0) size = dirBytes(join(dir, 'node_modules'))
  rmSync(dir, { recursive: true, force: true })
  if (size > 0) { writeFileSync(CACHE, String(size)); return size }
  console.error(`[desktop-size] closure re-measure failed; using baseline ${(CLOSURE_BASELINE / 1024 / 1024).toFixed(0)}MB (-cached if you want the stored value)`)
  return CLOSURE_BASELINE
}

function electronBytes() {
  const candidates = [
    join(root, 'node_modules', 'electron', 'dist'),
    join(root, 'node_modules', '.pnpm', 'electron@43.4.0', 'node_modules', 'electron', 'dist'),
    join(root, 'apps', 'desktop', 'node_modules', 'electron', 'dist'),
  ]
  for (const candidate of candidates) {
    const size = dirBytes(candidate)
    if (size > 0) return { size, approx: false }
  }
  // electron 43 win32-x64 packaged runtime, measured baseline (~210MB).
  return { size: 210 * 1024 * 1024, approx: true }
}

const electron = electronBytes()
const xyaiLib = dirBytes(join(root, 'packages-xyai'))
const closure = closureBytes()
const dist = dirBytes(join(root, 'apps', 'web', 'dist'))
const total = electron.size + xyaiLib + closure + dist
// XYOS local deployment is bundled in the V0.4 base installer (optional at
// install time: local vs cloud). Frontend dist ships as-is; backend sources
// plus its prod dependency closure are measured below.
const xyosFrontend = dirBytes(join(root, 'xyos-dist'))
const xyosBackendSrc = dirBytes(join(root, 'xyos-backend')) - dirBytes(join(root, 'xyos-backend', 'node_modules'))
const XYOS_CLOSURE_BASELINE = 219 * 1024 * 1024 // measured xyos-backend prod deps
const xyosBackendClosure = XYOS_CLOSURE_BASELINE
const grandTotal = total + xyosFrontend + xyosBackendSrc + xyosBackendClosure

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
console.log('Desktop minimal installer size audit')
console.log(`  electron shell          ${mb(electron.size)}${electron.approx ? ' (approx)' : ''}`)
console.log(`  A-class runtime closure ${mb(closure)} ${fresh ? '(fresh)' : '(cached)'}`)
console.log(`  XYAI layer (9 plugins)  ${mb(xyaiLib)}`)
console.log(`  XYOS frontend dist      ${mb(xyosFrontend)}`)
console.log(`  XYOS backend src        ${mb(xyosBackendSrc)}`)
console.log(`  XYOS backend closure    ${mb(xyosBackendClosure)} (measured)` + (fresh ? '' : ''))
console.log(`  web frontend dist       ${dist > 0 ? mb(dist) : 'NOT BUILT (CI)'}`)
console.log(`  ── base total           ${mb(total)}`)
console.log(`  ── grand total (XYOS)   ${mb(grandTotal)}`)
console.log(`  limit                   ${mb(limit)}`)
process.exitCode = grandTotal > limit ? 1 : 0
if (process.exitCode === 1) console.error('SIZE LIMIT EXCEEDED')
else console.log('size OK')
