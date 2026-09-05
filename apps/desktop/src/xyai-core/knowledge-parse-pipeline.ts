/**
 * Knowledge parse pipeline (W-102b).
 *
 * Consumes scanner output (KnowledgeScanFile lists) and turns parseable
 * files into extracted corpus artifacts with an honest per-file state:
 * pending -> parsing -> ready | failed.  Status and fingerprints persist so
 * restarts can resume, edited files re-parse, and deleted files drop their
 * artifacts.  Extracted text lands in the XYAI-owned content directory as
 * flat .txt artifacts (later used by BM25 and the corpus export line).
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import {
  extractDocxText,
  extractPdfText,
  extractPlainText,
  type KnowledgeExtractionResult,
} from './knowledge-document-extract.ts'
import type { KnowledgeScanFile } from './knowledge-indexer.ts'

function isParseableScanFile(file: KnowledgeScanFile): file is KnowledgeScanFile & { readonly kind: 'text' | 'document' } {
  return file.parseable && (file.kind === 'text' || file.kind === 'document')
}

export type KnowledgeParseStatus = 'pending' | 'parsing' | 'ready' | 'failed'

export interface KnowledgeParseRecord {
  readonly relPath: string
  readonly kind: 'text' | 'document'
  readonly sourceBytes: number
  readonly sourceMtimeMs: number
  readonly status: KnowledgeParseStatus
  readonly error?: string
  readonly characters?: number
  readonly truncated?: boolean
  readonly parsedAt?: string
  readonly textFile?: string
}

export interface KnowledgeParseUpdate {
  readonly rootPath: string
  readonly relPath: string
  readonly record: KnowledgeParseRecord
}

export interface KnowledgeParseSummary {
  readonly total: number
  readonly pending: number
  readonly parsing: number
  readonly ready: number
  readonly failed: number
}

export interface KnowledgeReconcileSummary {
  readonly added: number
  readonly stale: number
  readonly removed: number
}

interface KnowledgeParseMount {
  readonly rootPath: string
  readonly records: KnowledgeParseRecord[]
}
interface KnowledgeParseDocument {
  readonly schemaVersion: 1
  readonly mounts: KnowledgeParseMount[]
}

function normalizeRootPath(rootPath: string): string {
  return resolve(rootPath).toLocaleLowerCase()
}

function artifactMountKey(rootPath: string): string {
  return createHash('sha256').update(normalizeRootPath(rootPath)).digest('hex').slice(0, 24)
}

function artifactFileName(relPath: string): string {
  return `${createHash('sha256').update(relPath).digest('hex')}.txt`
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, 'utf8')
  await rename(temporaryPath, path)
}

async function extractKnowledgeText(filePath: string, kind: 'text' | 'document'): Promise<KnowledgeExtractionResult> {
  const buffer = await readFile(filePath)
  if (kind === 'document') {
    const extension = extname(filePath).toLocaleLowerCase()
    if (extension === '.docx') return extractDocxText(buffer)
    if (extension === '.pdf') return extractPdfText(buffer)
    throw new Error(`暂不支持的文档格式 ${extension}`)
  }
  return extractPlainText(buffer)
}

function fingerprintChanged(record: KnowledgeParseRecord, file: KnowledgeScanFile): boolean {
  return record.sourceBytes !== file.bytes || record.sourceMtimeMs !== file.mtimeMs
}

function sourcePath(rootPath: string, relPath: string): string {
  return join(rootPath, ...relPath.split('/'))
}

export class KnowledgeParsePipeline {
  private document: KnowledgeParseDocument = { schemaVersion: 1, mounts: [] }
  private loaded = false
  private readonly listeners = new Set<(update: KnowledgeParseUpdate) => void>()

  constructor(
    private readonly registryPath: string,
    private readonly contentDirectory: string,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = JSON.parse(await readFile(this.registryPath, 'utf8')) as { schemaVersion?: number; mounts?: KnowledgeParseMount[] }
      if (raw.schemaVersion === 1 && Array.isArray(raw.mounts)) {
        const mounts = raw.mounts.filter(item => typeof item.rootPath === 'string' && Array.isArray(item.records))
        this.document = { schemaVersion: 1, mounts }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.loaded = true
  }

  onUpdate(listener: (update: KnowledgeParseUpdate) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private mountFor(rootPath: string): KnowledgeParseMount | undefined {
    const key = normalizeRootPath(rootPath)
    return this.document.mounts.find(item => normalizeRootPath(item.rootPath) === key)
  }

  listRecords(rootPath: string): readonly KnowledgeParseRecord[] {
    return this.mountFor(rootPath)?.records ?? []
  }

  recordFor(rootPath: string, relPath: string): KnowledgeParseRecord | undefined {
    return this.mountFor(rootPath)?.records.find(item => item.relPath === relPath)
  }

  statusSummary(rootPath: string): KnowledgeParseSummary {
    const records = this.listRecords(rootPath)
    const summary = { total: records.length, pending: 0, parsing: 0, ready: 0, failed: 0 }
    for (const record of records) {
      if (record.status === 'pending') summary.pending += 1
      else if (record.status === 'parsing') summary.parsing += 1
      else if (record.status === 'ready') summary.ready += 1
      else summary.failed += 1
    }
    return summary
  }

  private async persist(): Promise<void> {
    await writeAtomic(this.registryPath, this.document)
  }

  private replaceRecords(rootPath: string, records: KnowledgeParseRecord[]): void {
    const key = normalizeRootPath(rootPath)
    const others = this.document.mounts.filter(item => normalizeRootPath(item.rootPath) !== key)
    this.document = { schemaVersion: 1, mounts: [...others, { rootPath: resolve(rootPath), records }] }
  }

  private async emit(rootPath: string, relPath: string, record: KnowledgeParseRecord): Promise<void> {
    for (const listener of this.listeners) {
      try {
        listener({ rootPath: resolve(rootPath), relPath, record })
      } catch {
        /* a listener must never break the pipeline */
      }
    }
  }

  private async removeArtifact(record: KnowledgeParseRecord): Promise<void> {
    if (record.textFile !== undefined) {
      try {
        await rm(record.textFile, { force: true })
      } catch {
        /* best effort */
      }
    }
  }

  /**
   * 对照最新扫描结果修正台账：新文件入队 pending；指纹变化的文件回到
   * pending 并清掉旧语料；已删除文件移除记录与语料。
   */
  async reconcile(rootPath: string, files: readonly KnowledgeScanFile[]): Promise<KnowledgeReconcileSummary> {
    await this.load()
    const summary = { added: 0, stale: 0, removed: 0 }
    const byPath = new Map<string, KnowledgeScanFile & { readonly kind: 'text' | 'document' }>()
    for (const file of files) {
      if (isParseableScanFile(file)) byPath.set(file.relPath, file)
    }
    const previous = this.listRecords(rootPath)
    const next: KnowledgeParseRecord[] = []
    for (const existing of previous) {
      const current = byPath.get(existing.relPath)
      if (current === undefined) {
        await this.removeArtifact(existing)
        summary.removed += 1
        continue
      }
      if (fingerprintChanged(existing, current)) {
        await this.removeArtifact(existing)
        next.push({
          relPath: existing.relPath,
          kind: existing.kind,
          sourceBytes: current.bytes,
          sourceMtimeMs: current.mtimeMs,
          status: 'pending',
        })
        summary.stale += 1
        continue
      }
      next.push(existing)
    }
    for (const file of byPath.values()) {
      if (previous.some(item => item.relPath === file.relPath)) continue
      next.push({
        relPath: file.relPath,
        kind: file.kind,
        sourceBytes: file.bytes,
        sourceMtimeMs: file.mtimeMs,
        status: 'pending',
      })
      summary.added += 1
    }
    next.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
    this.replaceRecords(rootPath, next)
    await this.persist()
    return summary
  }

  async retryFailed(rootPath: string): Promise<number> {
    await this.load()
    const mount = this.mountFor(rootPath)
    if (mount === undefined) return 0
    let count = 0
    const records = mount.records.map(record => {
      if (record.status !== 'failed') return record
      count += 1
      return {
        relPath: record.relPath,
        kind: record.kind,
        sourceBytes: record.sourceBytes,
        sourceMtimeMs: record.sourceMtimeMs,
        status: 'pending' as const,
      }
    })
    this.replaceRecords(rootPath, records)
    await this.persist()
    return count
  }

  /** 串行处理一个库的全部 pending 文件（有界、可中断、逐文件落状态）。 */
  async runPending(rootPath: string, signal?: AbortSignal): Promise<{ readonly processed: number; readonly ready: number; readonly failed: number }> {
    await this.load()
    const mount = this.mountFor(rootPath)
    if (mount === undefined) return { processed: 0, ready: 0, failed: 0 }
    const root = resolve(rootPath)
    let processed = 0
    let readyCount = 0
    let failedCount = 0
    const mountKey = artifactMountKey(root)
    const artifactDirectory = join(this.contentDirectory, mountKey)
    let again = true
    while (again) {
      if (signal?.aborted === true) throw new Error('knowledge parse aborted')
      const current = this.mountFor(root)
      if (current === undefined) break
      const pendingIndex = current.records.findIndex(item => item.status === 'pending')
      if (pendingIndex < 0) break
      const record = current.records[pendingIndex]
      if (record === undefined) break
      const running: KnowledgeParseRecord = { ...record, status: 'parsing' }
      this.replaceRecords(root, current.records.map((item, index) => (index === pendingIndex ? running : item)))
      await this.persist()
      await this.emit(root, record.relPath, running)
      processed += 1
      try {
        const extraction = await extractKnowledgeText(sourcePath(root, record.relPath), record.kind)
        const artifactName = artifactFileName(record.relPath)
        await mkdir(artifactDirectory, { recursive: true })
        const textFile = join(artifactDirectory, artifactName)
        await writeFile(textFile, extraction.text, 'utf8')
        const done: KnowledgeParseRecord = {
          relPath: record.relPath,
          kind: record.kind,
          sourceBytes: record.sourceBytes,
          sourceMtimeMs: record.sourceMtimeMs,
          status: 'ready',
          characters: extraction.text.length,
          truncated: extraction.truncated,
          parsedAt: new Date().toISOString(),
          textFile,
        }
        this.replaceRecords(root, (this.mountFor(root)?.records ?? []).map(item => (item.relPath === record.relPath ? done : item)))
        await this.persist()
        await this.emit(root, record.relPath, done)
        readyCount += 1
      } catch (error: unknown) {
        const failed: KnowledgeParseRecord = {
          relPath: record.relPath,
          kind: record.kind,
          sourceBytes: record.sourceBytes,
          sourceMtimeMs: record.sourceMtimeMs,
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        }
        this.replaceRecords(root, (this.mountFor(root)?.records ?? []).map(item => (item.relPath === record.relPath ? failed : item)))
        await this.persist()
        await this.emit(root, record.relPath, failed)
        failedCount += 1
      }
    }
    return { processed, ready: readyCount, failed: failedCount }
  }

  /** 读取已就绪语料文本（供 UI 预览 / 后续检索）。 */
  async textFor(rootPath: string, relPath: string): Promise<string | undefined> {
    await this.load()
    const record = this.recordFor(rootPath, relPath)
    if (record?.status !== 'ready' || record.textFile === undefined) return undefined
    try {
      return await readFile(record.textFile, 'utf8')
    } catch {
      return undefined
    }
  }

  async removeMount(rootPath: string): Promise<void> {
    await this.load()
    const key = normalizeRootPath(rootPath)
    const mounts = this.document.mounts.filter(item => normalizeRootPath(item.rootPath) !== key)
    this.document = { schemaVersion: 1, mounts }
    await this.persist()
    try {
      await rm(join(this.contentDirectory, artifactMountKey(rootPath)), { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
}
