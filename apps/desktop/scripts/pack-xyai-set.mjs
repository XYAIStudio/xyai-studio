/** Pack the XYAI product closure into the Desktop package-set input directory. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const XYAI_SOURCE_DIR = join(REPOSITORY_ROOT, 'packages-xyai')

/** Root of the packed XYAI closure; everything it depends on under @xyai/ joins the set. */
const XYAI_ROOT_PACKAGES = ['@xyai/dsh-product-base', '@xyai/dsh-product-collab']
/** Dependency sections whose @xyai/ members must join the packed closure. */
const CLOSURE_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

interface XyaiManifest {
  readonly name?: unknown
  readonly version?: unknown
  readonly private?: unknown
  readonly exports?: unknown
}

function readManifest(directory: string): { name: string; version: string; manifest: XyaiManifest } {
  const path = join(directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as XyaiManifest
  if (typeof manifest.name !== 'string' || manifest.name === '') {
    throw new Error(`xyai pack: ${path} has no package name`)
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`xyai pack: ${manifest.name} has no version`)
  }
  return { name: manifest.name, version: manifest.version, manifest }
}

/** Resolve every XYAI package the root bundle pulls in, closing over @xyai/ edges only. */
export function selectXyaiClosure(members: ReadonlyMap<string, { name: string; manifest: XyaiManifest }>): readonly string[] {
  const selected = new Set<string>()
  const visit = (name: string): void => {
    if (selected.has(name)) return
    const member = members.get(name)
    if (member === undefined) throw new Error(`xyai pack: closure requires ${name}, which is not under ${XYAI_SOURCE_DIR}`)
    selected.add(name)
    for (const section of CLOSURE_SECTIONS) {
      const value = member.manifest[section]
      if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) continue
      for (const dependency of Object.keys(value)) {
        if (dependency.startsWith('@xyai/')) visit(dependency)
      }
    }
  }
  for (const root of XYAI_ROOT_PACKAGES) visit(root)
  return [...selected].sort()
}

/**
 * Reject a member whose declared library exports are missing from lib/, which
 * `pnpm pack` would otherwise tar up silently as a broken payload.
 * @param directory - Member package directory.
 * @param name - Member package name.
 */
function verifyBuiltPayload(directory: string, name: string): void {
  const exports = readManifest(directory).manifest.exports
  if (exports === undefined || exports === null || typeof exports !== 'object' || Array.isArray(exports)) return
  for (const [subpath, target] of Object.entries(exports)) {
    if (typeof target !== 'string' || !target.startsWith('./lib/')) continue
    const file = join(directory, target)
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`xyai pack: ${name} export "${subpath}" points at missing ${target}; run the package build first`)
    }
  }
}

function packMember(directory: string, destination: string): Promise<void> {
  const pnpmEntry = process.env.npm_execpath
  if (pnpmEntry === undefined || pnpmEntry === '') {
    return Promise.reject(new Error('xyai pack: invoke this script through a pnpm package command'))
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [pnpmEntry, '--dir', directory, 'pack', '--pack-destination', destination], {
      cwd: REPOSITORY_ROOT,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`xyai pack: pnpm pack in ${directory} exited with ${String(code ?? signal)}`))
    })
  })
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' } },
    allowPositionals: false,
  })
  const buildPaths = resolveDesktopTargetBuildPaths()
  const destination = values.out === undefined ? buildPaths.packedXyai : resolve(REPOSITORY_ROOT, values.out)

  const members = new Map()
  for (const entry of readdirSync(XYAI_SOURCE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(XYAI_SOURCE_DIR, entry.name)
    if (!existsSync(join(directory, 'package.json'))) continue
    const member = readManifest(directory)
    if (members.has(member.name)) throw new Error(`xyai pack: duplicate package ${member.name} under ${XYAI_SOURCE_DIR}`)
    members.set(member.name, { name: member.name, manifest: member.manifest, directory })
  }
  const closure = selectXyaiClosure(members)
  for (const root of XYAI_ROOT_PACKAGES) {
    if (!closure.includes(root)) throw new Error(`xyai pack: ${root} is missing from ${XYAI_SOURCE_DIR}`)
  }

  rmSync(destination, { recursive: true, force: true })
  for (const name of closure) {
    const member = members.get(name)
    if (member === undefined) throw new Error(`xyai pack: missing member ${name}`)
    verifyBuiltPayload(member.directory, name)
    await packMember(member.directory, destination)
  }
  console.log(`xyai pack: packed ${String(closure.length)} package(s) into ${destination}`)
}

await main()
