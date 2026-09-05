/**
 * Stage official ggml-org/llama.cpp macOS arm64 binaries into resources/llama-cpp.
 * Windows vendored binaries stay in git; this only mutates the local pack tree.
 * Pin: b10809 / llama-b10809-bin-macos-arm64.tar.gz (Metal).
 */

import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
  chmodSync,
  readFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export const LLAMA_CPP_DARWIN_PIN = {
  tag: 'b10809',
  asset: 'llama-b10809-bin-macos-arm64.tar.gz',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b10809/llama-b10809-bin-macos-arm64.tar.gz',
  sha256: '7d692df9e1e386e62f1c12b843903218041e6cd74c9415aa39a7ed3176f9eaa2',
} as const

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || response.body === null) {
    throw new Error(`download failed ${String(response.status)} ${url}`)
  }
  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    createWriteStream(dest),
  )
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function extractTarGz(archive: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  const result = spawnSync('tar', ['-xzf', archive, '-C', destDir], { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`tar extract failed: ${String(result.status)}`)
}

function findExtractedRoot(scratch: string): string {
  const entries = readdirSync(scratch, { withFileTypes: true })
  const dirs = entries.filter(entry => entry.isDirectory())
  if (dirs.length === 1) return join(scratch, dirs[0]!.name)
  if (existsSync(join(scratch, 'llama-server'))) return scratch
  throw new Error(`unexpected archive layout under ${scratch}`)
}

/** Stage Metal/macOS arm64 llama-server (+ dylibs) into resources/llama-cpp. */
export async function stageLlamaCppDarwin(options?: { readonly keepCache?: boolean }): Promise<void> {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const resourcesLlama = join(desktopRoot, 'resources', 'llama-cpp')
  const cacheDir = join(desktopRoot, '.dsh-build', 'llama-cpp-darwin')
  mkdirSync(cacheDir, { recursive: true })
  const archivePath = join(cacheDir, LLAMA_CPP_DARWIN_PIN.asset)

  if (!existsSync(archivePath) || sha256File(archivePath) !== LLAMA_CPP_DARWIN_PIN.sha256) {
    console.log(`[llama-cpp-darwin] fetching ${LLAMA_CPP_DARWIN_PIN.url}`)
    await download(LLAMA_CPP_DARWIN_PIN.url, archivePath)
  } else {
    console.log(`[llama-cpp-darwin] using cached ${archivePath}`)
  }
  const digest = sha256File(archivePath)
  if (digest !== LLAMA_CPP_DARWIN_PIN.sha256) {
    throw new Error(`SHA-256 mismatch for ${LLAMA_CPP_DARWIN_PIN.asset}: got ${digest}`)
  }
  console.log(`[llama-cpp-darwin] sha256 ok (${LLAMA_CPP_DARWIN_PIN.tag})`)

  const extractDir = join(cacheDir, 'extract')
  rmSync(extractDir, { recursive: true, force: true })
  extractTarGz(archivePath, extractDir)
  const sourceRoot = findExtractedRoot(extractDir)
  const server = join(sourceRoot, 'llama-server')
  if (!existsSync(server)) throw new Error(`llama-server missing in ${sourceRoot}`)

  mkdirSync(resourcesLlama, { recursive: true })
  for (const name of readdirSync(resourcesLlama)) {
    if (/\.(exe|dll)$/i.test(name)) {
      rmSync(join(resourcesLlama, name), { force: true })
    }
  }
  for (const name of readdirSync(sourceRoot)) {
    const from = join(sourceRoot, name)
    const to = join(resourcesLlama, name)
    cpSync(from, to, { recursive: true })
    try { chmodSync(to, 0o755) } catch { /* ignore */ }
  }

  if (!existsSync(join(resourcesLlama, 'llama-server'))) {
    throw new Error('staging failed: llama-server not present in resources/llama-cpp')
  }
  const dylibs = readdirSync(resourcesLlama).filter(name => name.endsWith('.dylib'))
  if (dylibs.length === 0) {
    throw new Error('staging failed: no .dylib files in resources/llama-cpp')
  }
  console.log(`[llama-cpp-darwin] staged llama-server + ${String(dylibs.length)} dylibs into ${resourcesLlama}`)
  console.log(`[llama-cpp-darwin] pin: ${LLAMA_CPP_DARWIN_PIN.tag} / ${LLAMA_CPP_DARWIN_PIN.asset}`)

  if (options?.keepCache !== true) {
    rmSync(extractDir, { recursive: true, force: true })
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  stageLlamaCppDarwin({ keepCache: true }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
