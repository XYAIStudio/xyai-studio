/** Materialize the packaged desktop Host dependency closure. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve, sep } from 'node:path'

const desktopRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(desktopRoot, '../..')
const staging = join(desktopRoot, 'runtime-host')
const deployRoot = resolve(repositoryRoot, 'python/sdk-runtime')
const deployPackage = 'dsh-python-runtime-closure'
const entry = join(staging, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const frontend = join(staging, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html')
const workspaceState = join(repositoryRoot, 'node_modules/.pnpm-workspace-state-v1.json')
const migratedIndustryAgentClient = join(repositoryRoot, 'packages/client/xyai-industry-agent/lib/client.js')
const migratedIndustryAgentWorkspaceAssets = [
  'skill-workspace.js',
  'xyos-backend-DROJg1pS.js',
  'local-gguf-3IBAx29M.js',
  'local-gguf.js',
  'ollama-provider.js',
  'ollama-client-B5R1Vg5V.js',
  'production-projects-D-aghHr8.js',
] as const
const migratedIndustryAgentLibrary = join(repositoryRoot, 'packages/client/xyai-industry-agent/lib')

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((accept, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env: { ...process.env, CI: 'true' }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) accept()
      else reject(new Error(`desktop runtime staging failed (${code === null ? `signal ${String(signal)}` : `exit ${String(code)}`}): ${command} ${args.join(' ')}`))
    })
  })
}

async function manifest(path: string): Promise<Manifest> {
  return JSON.parse(await readFile(path, 'utf8')) as Manifest
}

async function findSymlink(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function materializeLinks(): Promise<void> {
  const nodeModules = join(staging, 'node_modules')
  for (let link = await findSymlink(nodeModules); link !== undefined; link = await findSymlink(nodeModules)) {
    const segments = link.slice(nodeModules.length + 1).split(sep)
    const bin = segments.lastIndexOf('.bin')
    if (bin >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, bin + 1)), { recursive: true, force: true })
      continue
    }
    const source = await realpath(link)
    await rm(link, { recursive: true, force: true })
    await cp(source, link, {
      recursive: true,
      dereference: true,
      filter: path => path !== join(source, 'node_modules') && !path.startsWith(join(source, 'node_modules') + sep),
    })
  }
}

async function restoreLegacyHoists(): Promise<void> {
  const deployed = await manifest(join(staging, 'package.json'))
  const sourceModules = join(deployRoot, 'node_modules')
  for (const dependency of Object.keys(deployed.dependencies ?? {})) {
    const destination = join(staging, 'node_modules', dependency)
    if (existsSync(destination)) continue
    const source = join(sourceModules, dependency)
    if (!existsSync(source)) throw new Error(`desktop runtime dependency is missing after deploy: ${dependency}`)
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: path => path !== join(source, 'node_modules') && !path.startsWith(join(source, 'node_modules') + sep),
    })
  }
}

/**
 * The historical IndustryAgent browser client is vendored in this workspace.
 *
 * Keeping the migrated artifact here is deliberate: an installed product, and
 * a clean build of it, must never reach back into a historical checkout.
 */
async function stageMigratedIndustryAgent(): Promise<void> {
  if (!existsSync(migratedIndustryAgentClient)) {
    throw new Error(`vendored IndustryAgent client is missing: ${migratedIndustryAgentClient}`)
  }
  const source = await readFile(migratedIndustryAgentClient, 'utf8')
  const compatibleEnvironmentRead = 'parseDesktopClientEnvironment(`${window.location.search}&dsh-desktop-mode=xyai&dsh-desktop-platform=win32`)'
  const matches = source.split(compatibleEnvironmentRead).length - 1
  if (matches !== 1) throw new Error(`vendored IndustryAgent environment seam must occur once, found ${String(matches)}`)
  for (const asset of migratedIndustryAgentWorkspaceAssets) {
    const path = join(migratedIndustryAgentLibrary, asset)
    if (!existsSync(path)) throw new Error(`vendored IndustryAgent workspace asset is missing: ${path}`)
  }
  if (existsSync(staging)) {
    const destination = join(staging, 'node_modules/dsh-plugin-desktop')
    await rm(destination, { recursive: true, force: true })
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(repositoryRoot, 'packages/client/xyai-industry-agent'), destination, {
      recursive: true,
      dereference: true,
    })
  }
}

async function deploy(): Promise<void> {
  const pnpmEntry = resolvePnpmEntry()
  const savedWorkspaceState = existsSync(workspaceState) ? await readFile(workspaceState) : undefined
  try {
    await run(process.execPath, [pnpmEntry,
      '--config.verify-deps-before-run=false', '--filter', deployPackage, 'deploy', '--legacy', '--prod',
      '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true', staging,
    ])
  } finally {
    if (savedWorkspaceState === undefined) await rm(workspaceState, { force: true })
    else await writeFile(workspaceState, savedWorkspaceState)
  }
}

/** Resolve pnpm's JavaScript entry without invoking a Windows command shim. */
function resolvePnpmEntry(): string {
  const configured = process.env.npm_execpath
  if (configured !== undefined && configured !== '' && existsSync(configured)) return configured
  const pathValue = process.env.Path ?? process.env.PATH ?? ''
  for (const directory of pathValue.split(delimiter)) {
    if (directory === '') continue
    const candidate = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
    if (existsSync(candidate)) return candidate
  }
  throw new Error('desktop runtime staging could not locate pnpm.mjs on PATH')
}

async function main(): Promise<void> {
  await run(process.execPath, [
    '--import', 'tsx', 'scripts/verify-runtime-closure.ts',
    '--manifest', 'python/sdk-runtime/package.json',
  ])
  await stageMigratedIndustryAgent()
  await rm(staging, { recursive: true, force: true })
  await deploy()
  await stageMigratedIndustryAgent()
  await restoreLegacyHoists()
  await materializeLinks()
  if (!existsSync(entry)) throw new Error(`desktop Host entry missing after staging: ${entry}`)
  if (!existsSync(frontend)) throw new Error(`desktop Web frontend missing after staging: ${frontend}`)
  console.log(`desktop runtime staged at ${staging}`)
}

await main()
