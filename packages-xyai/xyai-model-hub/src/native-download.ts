/**
 * Allow-listed GGUF HTTP download with Range resume, size bounds, and GGUF magic check.
 * Partial bytes stay in `*.part` so pause / cancel can resume later. Original files are never deleted.
 */
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Progress reported while a catalog GGUF is fetched. */
export interface GgufDownloadProgress {
  status: 'connecting' | 'downloading' | 'verifying' | 'done'
  completed: number
  total: number | undefined
  percent: number
  filePath: string
}

/** Catalog-owned download source. File names must be a single `.gguf` basename. */
export interface GgufDownloadSource {
  repository: string
  fileName: string
  expectedSizeMiB: number
}

function progressValue(completed: number, total: number | undefined): number {
  if (total === undefined || total <= 0) return completed > 0 ? 50 : 2
  return Math.min(100, Math.round((completed / total) * 100))
}

/** Directory that receives one-click GGUF downloads. */
export function nativeModelDirectory(): string {
  const override = process.env.XYAI_MODEL_DIR?.trim()
  if (override) return override
  return join(homedir(), '.dsh', 'xyai', 'models')
}

/** hf-mirror first, then huggingface.co. */
export function ggufDownloadUrls(repository: string, fileName: string): string[] {
  const path = `${repository}/resolve/main/${encodeURIComponent(fileName)}?download=true`
  return [`https://hf-mirror.com/${path}`, `https://huggingface.co/${path}`]
}

/** True when the first four bytes are the GGUF magic. */
export async function fileHasGgufMagic(filePath: string): Promise<boolean> {
  try {
    const handle = await open(filePath, 'r')
    try {
      const buf = Buffer.alloc(4)
      const { bytesRead } = await handle.read(buf, 0, 4, 0)
      return bytesRead === 4 && buf.toString('utf8') === 'GGUF'
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

/**
 * Download one catalog GGUF into the native model directory.
 * @param source - Allow-listed repository + file + expected size.
 * @param onProgress - Host task progress.
 * @param signal - Abort on pause / cancel.
 * @param fetchImpl - Injectable fetch for tests.
 * @returns Absolute path of the completed `.gguf` file.
 */
export async function downloadGgufFile(
  source: GgufDownloadSource,
  onProgress: (progress: GgufDownloadProgress) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const fileName = basename(source.fileName)
  if (fileName !== source.fileName || !fileName.toLowerCase().endsWith('.gguf')) {
    throw new Error('模型目录包含非法文件名，已拒绝下载。')
  }
  const directory = nativeModelDirectory()
  await mkdir(directory, { recursive: true })
  const target = join(directory, fileName)
  const partial = `${target}.part`
  if (existsSync(target)) {
    if (!(await fileHasGgufMagic(target))) {
      throw new Error('已有文件不是有效 GGUF（缺少 GGUF 文件头），已拒绝使用。')
    }
    const size = (await stat(target)).size
    onProgress({ status: 'done', completed: size, total: size, percent: 100, filePath: target })
    return target
  }

  let lastError: unknown
  for (const url of ggufDownloadUrls(source.repository, fileName)) {
    try {
      let existing = existsSync(partial) ? (await stat(partial)).size : 0
      onProgress({
        status: 'connecting', completed: existing, total: undefined,
        percent: progressValue(existing, undefined), filePath: target,
      })
      const headers: Record<string, string> = {}
      if (existing > 0) headers.Range = `bytes=${existing}-`
      const response = await fetchImpl(url, {
        headers,
        redirect: 'follow',
        ...(signal ? { signal } : {}),
      })
      if (!response.ok || response.body === null) {
        throw new Error(`下载节点返回 HTTP ${String(response.status)}`)
      }
      const resumed = response.status === 206 && existing > 0
      if (!resumed) existing = 0
      const contentLength = Number(response.headers.get('content-length') ?? '')
      const total = Number.isFinite(contentLength) && contentLength > 0 ? existing + contentLength : undefined
      let completed = existing
      let lastReported = 0
      const sourceStream = Readable.fromWeb(response.body as never)
      sourceStream.on('data', (chunk: Buffer) => {
        completed += chunk.length
        const now = Date.now()
        if (now - lastReported < 250) return
        lastReported = now
        onProgress({
          status: 'downloading', completed, total,
          percent: progressValue(completed, total), filePath: target,
        })
      })
      await pipeline(sourceStream, createWriteStream(partial, { flags: resumed ? 'a' : 'w' }))
      onProgress({
        status: 'verifying', completed, total,
        percent: progressValue(completed, total), filePath: target,
      })
      const downloaded = (await stat(partial)).size
      if (source.expectedSizeMiB > 0) {
        const expected = source.expectedSizeMiB * 1024 ** 2
        if (downloaded < expected * 0.85 || downloaded > expected * 1.2) {
          throw new Error(`下载文件大小异常：${String(Math.round(downloaded / 1024 ** 2))} MiB，预期约 ${String(source.expectedSizeMiB)} MiB`)
        }
      }
      if (!(await fileHasGgufMagic(partial))) {
        throw new Error('下载文件缺少 GGUF 文件头，已拒绝登记。')
      }
      await rename(partial, target)
      onProgress({ status: 'done', completed: downloaded, total: downloaded, percent: 100, filePath: target })
      return target
    } catch (cause) {
      lastError = cause
      if (signal?.aborted) throw cause
    }
  }
  if (existsSync(partial) && (await stat(partial)).size === 0) {
    await unlink(partial).catch(() => undefined)
  }
  throw new Error(`模型下载失败，国内与官方节点均不可用：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
