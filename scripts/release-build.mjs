#!/usr/bin/env node
/**
 * Release-constrained workspace build.
 *
 * `tsdown` one-shot bundling of the whole monorepo (282+ packages, rolldown +
 * typert) exceeds a laptop's node heap even at 12GB. This script slices the
 * workspace into per-top-level batches (vendor, each packages/<group>, apps/cli)
 * and runs the host face once per batch with an injected patterns list, so each
 * process stays within a small heap. Combined outputs land in each package's
 * lib/, exactly as the full build would.
 *
 * Usage (repo root): node scripts/release-build.mjs [--heap=8192] [--face=host|client]
 * Env overrides: DSH_TSDOWN_BATCH=<group> to run one group only.
 */
import { spawn } from 'node:child_process'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Resolve the workspace-installed tsdown launcher instead of pinning a store
// hash, which changes on every dependency bump.
function resolveTsdownRun() {
  const store = join(root, 'node_modules/.pnpm')
  const candidates = readdirSync(store)
    .filter(name => name.startsWith('tsdown@'))
    .sort()
    .reverse()
  for (const candidate of candidates) {
    const run = join(store, candidate, 'node_modules/tsdown/dist/run.mjs')
    if (existsSync(run)) return run
  }
  throw new Error('tsdown run.mjs not found under node_modules/.pnpm — run pnpm install first')
}
const pnpmTsdown = resolveTsdownRun()
const heap = Number.parseInt((process.argv.find(a => a.startsWith('--heap=')) ?? '--heap=8192').slice(7), 10) || 8192

const groups = readdirSync(join(root, 'packages')).filter(d => !d.startsWith('.'))
// The client face bundles browser artifacts only; the desktop apps are
// host-face packages and join the batch list for the host face alone.
const faceArg = process.argv.find(a => a.startsWith('--face='))
const face = faceArg !== undefined ? faceArg.slice(7) : (process.env.DSH_RELEASE_BUILD_FACE ?? 'host')
if (face !== 'host' && face !== 'client') throw new Error(`release build: --face must be host or client, received ${face}`)
const batches = ['vendor/*', ...groups.map(d => `packages/${d}/*`), 'apps/cli',
  ...(face === 'client' ? [] : ['apps/desktop-host', 'apps/desktop'])]

const only = process.env.DSH_TSDOWN_BATCH
const toRun = only !== undefined ? batches.filter(b => b === only || b.startsWith(`packages/${only}/`)) : batches

function runBatch(batch) {
  const appBatch = batch === 'apps/cli' || batch.startsWith('apps/')
  const patterns = appBatch ? ['vendor/*', batch] : [batch]
  const env = {
    ...process.env,
    DSH_TSDOWN_PATTERNS: JSON.stringify(patterns),
    DSH_TSDOWN_TYPERT_PACKAGES: JSON.stringify(typertPackagesForBatch(batch)),
    NODE_OPTIONS: `--max-old-space-size=${heap}`,
  }
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [pnpmTsdown, '--env.DSH_BUILD_FACE', face], {
      cwd: root, env, stdio: 'inherit',
    })
    child.on('exit', code => resolveRun(code === 0))
    child.on('error', reject)
  })
}

function typertPackagesForBatch(batch) {
  const directories = batch === 'vendor/*'
    ? readdirSync(join(root, 'vendor')).map(name => join(root, 'vendor', name))
    : batch.startsWith('apps/')
      ? [join(root, batch)]
      : readdirSync(join(root, batch.slice(0, -2))).map(name => join(root, batch.slice(0, -2), name))
  return directories.flatMap(directory => {
    const manifestPath = join(directory, 'package.json')
    if (!existsSync(manifestPath)) return []
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const exportsField = manifest.exports
    if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return []
    const exportsRecord = exportsField
    if (!Object.hasOwn(exportsRecord, './typert')
      && !Object.hasOwn(exportsRecord, './client/typert')
      && !Object.hasOwn(exportsRecord, './remote')) return []
    return typeof manifest.name === 'string' ? [manifest.name] : []
  })
}

if (!existsSync(pnpmTsdown)) throw new Error(`tsdown run.mjs not found at ${pnpmTsdown} — run pnpm install first`)
if (toRun.length === 0) throw new Error(`no batch matches ${only ?? '?'}`)

for (const batch of toRun) {
  process.stdout.write(`\n=== batch ${batch} ===\n`)
  const ok = await runBatch(batch)
  if (!ok) { process.stderr.write(`batch failed: ${batch}\n`); process.exitCode = 1; break }
}
process.stdout.write(process.exitCode === 1 ? '\nrelease build FAILED\n' : '\nrelease build OK\n')
