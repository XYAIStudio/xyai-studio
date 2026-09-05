/** Resumable, allow-listed GGUF downloads for XYAI's embedded llama.cpp. */

import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { MarketplaceModel } from './model-marketplace.ts'

export interface NativeModelDownloadProgress {
  readonly status: 'connecting' | 'downloading' | 'verifying' | 'done'
  readonly completed: number
  readonly total: number | undefined
  readonly percent: number | undefined
  readonly filePath: string
}

export function nativeModelDirectory(): string {
  return process.env.XYAI_MODEL_DIR?.trim() || join(homedir(), '.dsh', 'xyai', 'models')
}

function downloadUrls(repository: string, fileName: string): readonly string[] {
  const path = `${repository}/resolve/main/${encodeURIComponent(fileName)}?download=true`
  return [`https://hf-mirror.com/${path}`, `https://huggingface.co/${path}`]
}

function progressValue(completed: number, total: number | undefined): number | undefined {
  return total === undefined || total <= 0 ? undefined : Math.min(100, Math.round(completed / total * 100))
}

/** Download one catalog-owned GGUF, retaining `.part` for safe resume. */
export async function downloadNativeModel(
  model: MarketplaceModel,
  onProgress: (progress: NativeModelDownloadProgress) => void,
): Promise<string> {
  const descriptor = model.nativeDownload
  if (descriptor === undefined) throw new Error('该推荐模型尚未提供内置 GGUF 下载源，请启动 Ollama 后再一键部署。')
  const fileName = basename(descriptor.fileName)
  if (fileName !== descriptor.fileName || !fileName.toLowerCase().endsWith('.gguf')) {
    throw new Error('模型目录包含非法文件名，已拒绝下载。')
  }
  const directory = nativeModelDirectory()
  await mkdir(directory, { recursive: true })
  const target = join(directory, fileName)
  const partial = `${target}.part`
  if (existsSync(target)) return target

  let lastError: unknown
  for (const url of downloadUrls(descriptor.repository, fileName)) {
    try {
      let existing = existsSync(partial) ? (await stat(partial)).size : 0
      onProgress({ status: 'connecting', completed: existing, total: undefined, percent: undefined, filePath: target })
      const response = await fetch(url, {
        headers: existing > 0 ? { Range: `bytes=${String(existing)}-` } : {},
        redirect: 'follow',
        signal: AbortSignal.timeout(30 * 60_000),
      })
      if (!response.ok || response.body === null) throw new Error(`下载节点返回 HTTP ${String(response.status)}`)
      const resumed = response.status === 206 && existing > 0
      if (!resumed) existing = 0
      const contentLength = Number(response.headers.get('content-length') ?? '')
      const total = Number.isFinite(contentLength) && contentLength > 0 ? existing + contentLength : undefined
      let completed = existing
      let lastReported = 0
      const source = Readable.fromWeb(response.body as never)
      source.on('data', (chunk: Buffer) => {
        completed += chunk.length
        const now = Date.now()
        if (now - lastReported < 250) return
        lastReported = now
        onProgress({ status: 'downloading', completed, total, percent: progressValue(completed, total), filePath: target })
      })
      await pipeline(source, createWriteStream(partial, { flags: resumed ? 'a' : 'w' }))
      onProgress({ status: 'verifying', completed, total, percent: progressValue(completed, total), filePath: target })
      const downloaded = (await stat(partial)).size
      const expected = descriptor.expectedSizeMiB * 1024 ** 2
      if (downloaded < expected * 0.85 || downloaded > expected * 1.2) {
        throw new Error(`下载文件大小异常：${String(Math.round(downloaded / 1024 ** 2))} MiB，预期约 ${String(descriptor.expectedSizeMiB)} MiB`)
      }
      await rename(partial, target)
      onProgress({ status: 'done', completed: downloaded, total: downloaded, percent: 100, filePath: target })
      return target
    } catch (cause) {
      lastError = cause
    }
  }
  // Keep a meaningful partial file for a later Range resume, but discard an
  // empty placeholder that cannot help recovery.
  if (existsSync(partial) && (await stat(partial)).size === 0) await unlink(partial).catch(() => undefined)
  throw new Error(`模型下载失败，国内与官方节点均不可用：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
