#!/usr/bin/env node
/**
 * Assemble the V0.4 base runtime host (XYAI Studio base product).
 *
 * Produces a self-contained runtime directory that runs offline:
 *   <out>/node_modules/{@deepseek-ai/*,@xyai/*}  ← registry closure + XYAI layer
 *   <out>/profiles/xyai/package.json            ← profile manifest
 *   <out>/xyos-dist  <out>/xyos-backend         ← bundled XYOS (local option)
 *
 * Steps are exactly the ones validated on a live root:
 *   1) deploy the canonical XYAI workspace profile and its exact production closure
 *   2) copy the knowledge-only bundle, which reuses the deployed knowledge plugin
 *   3) write profiles/xyai and profiles/xyai-knowledge
 *   4) copy XYOS frontend dist + backend sources (backend closure installed
 *      behind --with-xyos-backend)
 *
 * Usage:
 *   node scripts/assemble-base.mjs <out> [--with-xyos-backend]
 *   To verify: DSH_HOME=<out> node <out>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile xyai
 */
import { spawnSync } from 'node:child_process'
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? 'build/base-runtime')
const withXyosBackend = process.argv.includes('--with-xyos-backend')
const dshVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const cordisGroupVersion = JSON.parse(readFileSync(join(root, 'vendor', 'group', 'package.json'), 'utf8')).version
const canonicalProfile = JSON.parse(readFileSync(join(root, 'profiles', 'xyai', 'package.json'), 'utf8'))
const runtimeDependency = name => name === '@xyai/dsh-xyai-app'
  ? 'file:../../node_modules/@xyai/dsh-xyai-app'
  : name === '@deepseek-ai/cordis-plugin-group' ? cordisGroupVersion : dshVersion

function run(command, args, opts = {}) {
  const cwd = opts.cwd ?? out
  const useCmd = process.platform === 'win32'
  const full = useCmd
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, stdio: 'pipe' })
    : spawnSync(command, args, { cwd, stdio: 'pipe' })
  const result = useCmd ? full : full
  if (result.error) throw new Error(`${opts.label ?? command} spawn failed: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).map(value => String(value).trim()).filter(Boolean).join('\n')
    throw new Error(`${opts.label ?? command} failed${detail ? `: ${detail.slice(0, 1200)}` : ''}`)
  }
  return result
}

mkdirSync(out, { recursive: true })
if (out === root || root.startsWith(`${out}\\`) || root.startsWith(`${out}/`)) throw new Error('runtime output must not contain the repository root')
for (const entry of ['node_modules', 'profiles', '.xyai-profile-deploy', 'package.json', 'pnpm-workspace.yaml', 'xyos-dist', 'xyos-backend']) {
  rmSync(join(out, entry), { recursive: true, force: true })
}
run('pnpm', ['--filter=dsh-profile-xyai', 'deploy', '--prod', '--legacy', out], { label: 'XYAI profile closure', cwd: root })
writeFileSync(join(out, 'package.json'), JSON.stringify({
  name: 'xyai-base-runtime',
  private: true,
}, null, 2) + '\n')
const xyaiDir = join(out, 'node_modules', '@xyai')
const copyClean = (source, target, excludeNestedNodeModules = true) => {
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: sourcePath => !excludeNestedNodeModules || sourcePath === source || sourcePath.split(/[\\/]/u).at(-1) !== 'node_modules',
  })
}

function packageDirectories(directory) {
  if (!existsSync(directory)) return []
  const own = existsSync(join(directory, 'package.json')) ? [directory] : []
  const nested = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !['node_modules', 'src', 'lib', 'tests'].includes(entry.name))
    .flatMap(entry => packageDirectories(join(directory, entry.name)))
  return [...own, ...nested]
}

function copyCompiledRuntime(source, target) {
  if (!existsSync(source)) return
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyCompiledRuntime(from, to)
      continue
    }
    if (!entry.isFile() || (!entry.name.endsWith('.js') && !entry.name.endsWith('.js.map'))) continue
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
}

function materializeWorkspaceRuntime() {
  const sourceRoots = ['vendor', 'packages', 'packages-xyai', 'apps/cli'].map(part => join(root, part))
  const installedByName = new Map()
  const rememberInstalled = directory => {
    const manifestPath = join(directory, 'package.json')
    if (!existsSync(manifestPath)) return
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.name !== 'string') return
    const directories = installedByName.get(manifest.name) ?? []
    directories.push(directory)
    installedByName.set(manifest.name, directories)
  }
  for (const scope of ['@deepseek-ai', '@xyai']) {
    const direct = join(out, 'node_modules', scope)
    if (existsSync(direct)) {
      for (const entry of readdirSync(direct, { withFileTypes: true })) rememberInstalled(join(direct, entry.name))
    }
  }
  const pnpm = join(out, 'node_modules', '.pnpm')
  for (const storeEntry of readdirSync(pnpm, { withFileTypes: true })) {
    const nested = join(pnpm, storeEntry.name, 'node_modules')
    for (const scope of ['@deepseek-ai', '@xyai']) {
      const scoped = join(nested, scope)
      if (!existsSync(scoped)) continue
      for (const entry of readdirSync(scoped, { withFileTypes: true })) rememberInstalled(join(scoped, entry.name))
    }
  }
  let packages = 0
  let provisionedPeers = 0
  for (const directory of sourceRoots.flatMap(packageDirectories)) {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    if (typeof manifest.name !== 'string') continue
    const library = join(directory, 'lib')
    if (!existsSync(library)) continue
    let installed = installedByName.get(manifest.name)
    if (installed === undefined) {
      const [scope, packageName] = manifest.name.split('/')
      if (scope === undefined || packageName === undefined || manifest.name.split('/').length !== 2) continue
      const target = join(out, 'node_modules', scope, packageName)
      mkdirSync(target, { recursive: true })
      copyFileSync(join(directory, 'package.json'), join(target, 'package.json'))
      installed = [target]
      installedByName.set(manifest.name, installed)
      provisionedPeers++
    }
    for (const installedDirectory of installed) {
      const target = join(realpathSync(installedDirectory), 'lib')
      copyCompiledRuntime(library, target)
      // TypeScript's source build emits modules under lib/types, whereas published
      // package entries import siblings directly from lib. Flatten those modules so
      // the deployed runtime has the same import graph as a source launch.
      copyCompiledRuntime(join(library, 'types'), target)
    }
    packages++
  }
  let directLinks = 0
  for (const [packageName, directories] of installedByName) {
    const [scope, name] = packageName.split('/')
    if (scope === undefined || name === undefined || packageName.split('/').length !== 2) continue
    const direct = join(out, 'node_modules', scope, name)
    if (existsSync(direct)) continue
    mkdirSync(dirname(direct), { recursive: true })
    symlinkSync(realpathSync(directories[0]), direct, 'junction')
    directLinks++
  }
  return { packages, provisionedPeers, directLinks }
}

copyClean(join(root, 'packages-xyai', 'xyai-knowledge-app'), join(xyaiDir, 'dsh-knowledge-app'))
const materializedPackages = materializeWorkspaceRuntime()

const profile = {
  ...canonicalProfile,
  dependencies: Object.fromEntries(Object.keys(canonicalProfile.dependencies).map(name => [
    name,
    runtimeDependency(name),
  ])),
}
mkdirSync(join(out, 'profiles', 'xyai'), { recursive: true })
writeFileSync(join(out, 'profiles', 'xyai', 'package.json'), JSON.stringify(profile, null, 2) + '\n')
const knowledgeProfile = { name: 'dsh-profile-xyai-knowledge', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@xyai/dsh-knowledge-app'] } } }
mkdirSync(join(out, 'profiles', 'xyai-knowledge'), { recursive: true })
writeFileSync(join(out, 'profiles', 'xyai-knowledge', 'package.json'), JSON.stringify(knowledgeProfile, null, 2) + '\n')

if (existsSync(join(root, 'xyos-dist'))) copyClean(join(root, 'xyos-dist'), join(out, 'xyos-dist'))
if (existsSync(join(root, 'xyos-backend'))) copyClean(join(root, 'xyos-backend'), join(out, 'xyos-backend'))
rmSync(join(out, 'xyos-backend', 'node_modules'), { recursive: true, force: true })
if (withXyosBackend) run('pnpm', ['install', '--prod', '--ignore-workspace'], { label: 'XYOS backend closure', cwd: join(out, 'xyos-backend') })

console.log(`[assemble-base] runtime host assembled at ${out}`)
console.log(`  compiled runtime overlays: ${materializedPackages.packages}`)
console.log(`  provisioned peer packages: ${materializedPackages.provisionedPeers}`)
console.log(`  direct runtime package links: ${materializedPackages.directLinks}`)
console.log(`  verify: DSH_HOME=${out} node ${join(out, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')} --profile xyai`)
console.log(`  knowledge: DSH_HOME=${out} node ${join(out, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')} --profile xyai-knowledge`)
