/**
 * W-101 parse-centre service (desktop main process side).
 *
 * Owns one KnowledgeParsePipeline per mounted knowledge root.  Callers ask
 * for a scan/parse pass (mount IPC, boot seed, manual refresh) or rely on the
 * light polling tick; every pass pushes coalesced renderer updates.  Only
 * renderer-safe snapshots cross the Founders IPC bridge.  Content directories and the
 * registry JSON never leave this process.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { scanKnowledgeRoot } from './knowledge-indexer.ts'
import { KnowledgeParsePipeline, type KnowledgeParseRecord } from './knowledge-parse-pipeline.ts'

export type KnowledgeParseStatus = KnowledgeParseRecord['status']

export interface KnowledgeParseCounts {
  readonly total: number
  readonly pending: number
  readonly parsing: number
  readonly ready: number
  readonly failed: number
}

export interface KnowledgeMountParseState {
  readonly scanning: boolean
  readonly busy: boolean
  readonly lastError?: string
  readonly summary: KnowledgeParseCounts
}

/** Renderer-safe file row: never leaks the corpus text file path. */
export interface KnowledgeParseFileView {
  readonly relPath: string
  readonly kind: 'text' | 'document'
  readonly status: KnowledgeParseStatus
  readonly bytes: number
  readonly characters?: number
  readonly truncated?: boolean
  readonly parsedAt?: string
  readonly error?: string
}

interface KnowledgeParseSession {
  readonly mountId: string
  readonly rootPath: string
  readonly pipeline: KnowledgeParsePipeline
  scanning: boolean
  busy: boolean
  lastError?: string
}

const EMPTY_COUNTS: KnowledgeParseCounts = { total: 0, pending: 0, parsing: 0, ready: 0, failed: 0 }

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned.length === 0 ? 'mount' : cleaned
}

function toFileView(record: KnowledgeParseRecord): KnowledgeParseFileView {
  return {
    relPath: record.relPath,
    kind: record.kind,
    status: record.status,
    bytes: record.sourceBytes,
    ...(record.characters === undefined ? {} : { characters: record.characters }),
    ...(record.truncated === undefined ? {} : { truncated: record.truncated }),
    ...(record.parsedAt === undefined ? {} : { parsedAt: record.parsedAt }),
    ...(record.error === undefined ? {} : { error: record.error }),
  }
}

export class KnowledgeParseService {
  private readonly sessions = new Map<string, KnowledgeParseSession>()
  private readonly listeners = new Set<() => void>()
  private emitTimer: ReturnType<typeof setTimeout> | undefined
  private watchTimer: ReturnType<typeof setInterval> | undefined
  private readonly pending = new Map<string, Promise<void>>()

  /** @param dataDirectory persistent registry/content directory owned by XYAI user data. */
  constructor(private readonly dataDirectory: string) {}

  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Coalesced push so a burst of per-file parse events stays cheap. */
  private fire(): void {
    if (this.emitTimer !== undefined) clearTimeout(this.emitTimer)
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined
      for (const listener of [...this.listeners]) {
        try { listener() } catch { /* a listener must never break parsing */ }
      }
    }, 200)
  }

  private require(mountId: string): KnowledgeParseSession {
    const session = this.sessions.get(mountId)
    if (session === undefined) throw new Error('未找到该挂接源的解析会话（请先挂接目录）')
    return session
  }

  /** Boot-time + mount-time registration.  Existing per-mount parse state is reloaded. */
  // Note: registration is intentionally passive; the caller decides when to
  // run a scan/parse pass so tests and IPC stay deterministic.
  async startMount(mountId: string, rootPath: string): Promise<void> {
    const existing = this.sessions.get(mountId)
    if (existing?.rootPath === rootPath) {
      void this.runNow(mountId)
      return
    }
    if (existing !== undefined) await this.detach(mountId)
    const safe = sanitizeSegment(mountId)
    const sessionRoot = join(this.dataDirectory, safe)
    // Register synchronously so an immediately-following runNow (mount IPC /
    // boot seed) can never race the async registry load below.
    const pipeline = new KnowledgeParsePipeline(join(sessionRoot, 'registry.json'), join(sessionRoot, 'content'))
    const session: KnowledgeParseSession = { mountId, rootPath, pipeline, scanning: false, busy: false }
    this.sessions.set(mountId, session)
    await mkdir(sessionRoot, { recursive: true })
    try {
      await pipeline.load()
    } catch (error: unknown) {
      this.sessions.delete(mountId)
      throw error
    }
    pipeline.onUpdate(() => this.fire())
    this.fire()
  }

  /** Ensure a scan -> reconcile -> parse pass runs, then resolve once idle. */
  async runNow(mountId: string): Promise<void> {
    const session = this.require(mountId)
    const previous = this.pending.get(mountId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(() => this.executeOnce(session))
    this.pending.set(mountId, next)
    return next
  }

  private async executeOnce(session: KnowledgeParseSession): Promise<void> {
    if (session.busy || session.scanning) return
    session.busy = true
    session.scanning = true
    if (session.lastError !== undefined) delete session.lastError
    this.fire()
    try {
      const root = session.rootPath
      const report = await scanKnowledgeRoot(root)
      await session.pipeline.reconcile(root, report.files)
      const summary = session.pipeline.statusSummary(root)
      if (summary.pending > 0) await session.pipeline.runPending(root)
    } catch (error: unknown) {
      session.lastError = error instanceof Error ? error.message : String(error)
    } finally {
      session.busy = false
      session.scanning = false
      this.fire()
    }
  }

  /** Renderer manual action: request a rescan; parse progress follows via events. */
  refresh(mountId: string): boolean {
    void this.runNow(mountId)
    return true
  }

  stateFor(mountId: string): KnowledgeMountParseState {
    const session = this.sessions.get(mountId)
    if (session === undefined) return { scanning: false, busy: false, summary: EMPTY_COUNTS }
    return {
      scanning: session.scanning,
      busy: session.busy,
      ...(session.lastError === undefined ? {} : { lastError: session.lastError }),
      summary: session.pipeline.statusSummary(session.rootPath),
    }
  }

  listFiles(mountId: string, limit = 1500): KnowledgeParseFileView[] {
    const session = this.require(mountId)
    const records = session.pipeline.listRecords(session.rootPath)
    return [...records]
      .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
      .slice(0, Math.max(1, limit))
      .map(toFileView)
  }

  async retryFailed(mountId: string): Promise<number> {
    const session = this.require(mountId)
    const retried = await session.pipeline.retryFailed(session.rootPath)
    if (retried > 0) void this.runNow(mountId)
    return retried
  }

  /** Parsed corpus text for a ready file (preview only, bounded). */
  async preview(mountId: string, relPath: string): Promise<string | undefined> {
    const session = this.require(mountId)
    const text = await session.pipeline.textFor(session.rootPath, relPath)
    return text?.slice(0, 200_000)
  }

  async detach(mountId: string): Promise<void> {
    const session = this.sessions.get(mountId)
    if (session === undefined) return
    const running = this.pending.get(mountId)
    if (running !== undefined) {
      try { await running } catch { /* best effort */ }
    }
    await session.pipeline.removeMount(session.rootPath)
    this.sessions.delete(mountId)
    this.pending.delete(mountId)
    this.fire()
  }

  /** Light polling watch: catches files added/changed while the app is idle. */
  start(): void {
    if (this.watchTimer !== undefined) return
    this.watchTimer = setInterval(() => {
      for (const mountId of [...this.sessions.keys()]) {
        const session = this.sessions.get(mountId)
        if (session !== undefined && !session.busy && !session.scanning) void this.runNow(mountId)
      }
    }, 20_000)
    if (this.watchTimer.unref) this.watchTimer.unref()
  }

  stop(): void {
    if (this.watchTimer !== undefined) { clearInterval(this.watchTimer); this.watchTimer = undefined }
    if (this.emitTimer !== undefined) { clearTimeout(this.emitTimer); this.emitTimer = undefined }
  }
}
