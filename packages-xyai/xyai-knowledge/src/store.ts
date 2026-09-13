/** Durable local and cloud knowledge providers with serialized mutations. */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import { extractDocxText, extractPdfText, extractPlainText } from './extract.ts'
import type { ImaCredentials } from './ima.ts'
import { ImaClient } from './ima.ts'
import { OllamaModelRunner } from './local-model.ts'
import type { CloudMount, DocumentId, KnowledgeSearchHit, Limits, LocalDocumentRecord, LocalMount, Mount, MountId, Snapshot, TreeEntry } from './protocol.ts'

/** Storage adapter supplied by the Host settings service. */
export interface Registry { read(): string; write(value: string): Promise<void> }
/** Secret adapter backed by DSH credentials. */
export interface Secrets { get(name: string): Promise<string | undefined>; set(name: string, value: string): Promise<void>; unset(name: string): Promise<void> }
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
const within = (root: string, child: string): boolean => { const value = relative(root, child); return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`)) }
const clientRef = (id: string): string => `XYAI_IMA_CLIENT_${id.replaceAll('-', '_').toUpperCase()}`
const keyRef = (id: string): string => `XYAI_IMA_KEY_${id.replaceAll('-', '_').toUpperCase()}`

async function canonical(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('PATH_ABSOLUTE_REQUIRED')
  const absolute = resolve(path); let cursor = parse(absolute).root
  for (const part of relative(cursor, absolute).split(sep).filter(Boolean)) { cursor = join(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED') }
  return realpath(absolute)
}

async function ensureDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('PATH_ABSOLUTE_REQUIRED')
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (!(await lstat(path)).isDirectory()) throw new Error('OUTPUT_NOT_DIRECTORY')
  return realpath(path)
}

function load(raw: string): Mount[] {
  const parsed: unknown = JSON.parse(raw)
  const rows = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).mounts) ? (parsed as { mounts: unknown[] }).mounts : undefined
  if (rows === undefined) throw new Error('INVALID_REGISTRY')
  return rows.map(value => {
    if (typeof value !== 'object' || value === null) throw new Error('INVALID_REGISTRY')
    const row = value as Record<string, unknown>
    if (row.kind === 'ima') {
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.knowledgeBaseId !== 'string' || !Array.isArray(row.documents)) throw new Error('INVALID_CLOUD_REGISTRY')
      return row as unknown as CloudMount
    }
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.root !== 'string' || typeof row.output !== 'string' || !Array.isArray(row.documents)) throw new Error('INVALID_LOCAL_REGISTRY')
    return { ...row, kind: 'local' } as unknown as LocalMount
  })
}

/** Knowledge service; one local scan owns mutations until it settles. */
export class KnowledgeStore {
  private mounts: Mount[]
  private running: Promise<void> | null = null
  private busy: MountId | null = null
  private processed = 0
  private error: string | null = null
  private closed = false
  private mutations: Promise<unknown> = Promise.resolve()
  constructor(private readonly registry: Registry, private readonly limits: Limits, private readonly model: OllamaModelRunner, private readonly ima: ImaClient, private readonly secrets: Secrets) {
    this.mounts = load(registry.read())
    for (const value of [limits.maxFileBytes, limits.maxFiles, limits.modelTimeoutMs, limits.benchmarkTimeoutMs, limits.distillChunkChars, limits.maxBenchmarkModels, limits.cloudTimeoutMs, limits.cloudPageSize, limits.cloudContentBytes, limits.cloudHydrateLimit]) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_LIMITS')
  }
  /** Return a detached snapshot without credentials. */
  snapshot(): Snapshot { return structuredClone({ mounts: this.mounts, busy: this.busy, processed: this.processed, error: this.error, artifactRoot: this.limits.artifactRoot }) }
  private persist(): Promise<void> { return this.registry.write(JSON.stringify({ schemaVersion: 2, mounts: this.mounts })) }
  private mutate<T>(fn: () => Promise<T>): Promise<T> { const task = this.mutations.then(async () => { if (this.closed) throw new Error('PROVIDER_CLOSED'); if (this.busy) throw new Error('SCAN_BUSY'); return fn() }); this.mutations = task.catch(() => undefined); return task }
  private mount(id: string): Mount { const found = this.mounts.find(item => item.id === id); if (!found) throw new Error('MOUNT_NOT_FOUND'); return found }
  private local(id: string): LocalMount { const found = this.mount(id); if (found.kind !== 'local') throw new Error('LOCAL_MOUNT_REQUIRED'); return found }
  private cloud(id: string): CloudMount { const found = this.mount(id); if (found.kind !== 'ima') throw new Error('IMA_MOUNT_REQUIRED'); return found }

  /** Check a readable local source without writing to it. */
  async precheck(path: string): Promise<{ root: string; existing: MountId | null }> {
    const root = await canonical(path)
    if (root === parse(root).root || !(await lstat(root)).isDirectory()) throw new Error('SPECIFIC_DIRECTORY_REQUIRED')
    const system = process.env.SystemRoot; if (system && within(resolve(system), root)) throw new Error('SYSTEM_DIRECTORY_FORBIDDEN')
    await access(root, constants.R_OK); await readdir(root)
    return { root, existing: this.mounts.find(item => item.kind === 'local' && item.root === root)?.id ?? null }
  }

  /** Register a local source and reserve its application-owned artifact directory. */
  async addLocal(path: string): Promise<LocalMount> {
    return this.mutate(async () => {
      const { root, existing } = await this.precheck(path); if (existing) throw new Error('ALREADY_MOUNTED')
      const artifactRoot = await ensureDirectory(this.limits.artifactRoot)
      if (within(root, artifactRoot) || within(artifactRoot, root)) throw new Error('ARTIFACT_ROOT_OVERLAPS_SOURCE')
      const id = randomUUID() as MountId; const output = join(artifactRoot, id); await mkdir(output, { mode: 0o700 }); await writeFile(join(output, '.owner'), id, { flag: 'wx', mode: 0o600 })
      const mount: LocalMount = { kind: 'local', id, name: basename(root), root, output, documents: [] }
      this.mounts.push(mount); try { await this.persist() } catch (error) { this.mounts.pop(); throw error }
      return structuredClone(mount)
    })
  }

  /** Prove ima credentials, mount one visible library and fetch metadata only. */
  async addIma(input: { name: string; knowledgeBaseId: string; clientId: string; apiKey: string }, signal?: AbortSignal): Promise<CloudMount> {
    return this.mutate(async () => {
      if (!input.clientId.trim() || !input.apiKey.trim() || !input.knowledgeBaseId.trim()) throw new Error('IMA_FIELDS_REQUIRED')
      if (this.mounts.some(item => item.kind === 'ima' && item.knowledgeBaseId === input.knowledgeBaseId.trim())) throw new Error('ALREADY_MOUNTED')
      const credentials = { clientId: input.clientId.trim(), apiKey: input.apiKey.trim() }
      const libraries = await this.ima.libraries(credentials, signal)
      const library = libraries.find(item => item.id === input.knowledgeBaseId.trim()); if (!library) throw new Error('IMA_LIBRARY_NOT_VISIBLE')
      const id = randomUUID() as MountId
      await this.secrets.set(clientRef(id), credentials.clientId)
      try {
        await this.secrets.set(keyRef(id), credentials.apiKey)
        const documents = await this.ima.list(credentials, library.id, undefined, signal)
        const mount: CloudMount = { kind: 'ima', id, name: input.name.trim() || library.name, knowledgeBaseId: library.id, documents, refreshedAt: new Date().toISOString() }
        this.mounts.push(mount); try { await this.persist() } catch (error) { this.mounts.pop(); throw error }
        return structuredClone(mount)
      } catch (error) { await Promise.allSettled([this.secrets.unset(clientRef(id)), this.secrets.unset(keyRef(id))]); throw error }
    })
  }

  /** Test ima parameters and return visible libraries without persisting credentials. */
  testIma(clientId: string, apiKey: string, signal?: AbortSignal): Promise<Array<{ id: string; name: string }>> { return this.ima.libraries({ clientId: clientId.trim(), apiKey: apiKey.trim() }, signal) }
  private async credentials(mount: CloudMount): Promise<ImaCredentials> { const [clientId, apiKey] = await Promise.all([this.secrets.get(clientRef(mount.id)), this.secrets.get(keyRef(mount.id))]); if (!clientId || !apiKey) throw new Error('IMA_CREDENTIALS_MISSING'); return { clientId, apiKey } }

  /** Rename or detach. Detaching preserves every source and local artifact. */
  async update(id: string, name: string | null): Promise<void> {
    await this.mutate(async () => {
      const before = structuredClone(this.mounts), mount = this.mount(id)
      if (name === null) this.mounts = this.mounts.filter(item => item.id !== id)
      else { if (!name.trim()) throw new Error('NAME_REQUIRED'); mount.name = name.trim() }
      try { await this.persist() } catch (error) { this.mounts = before; throw error }
      if (name === null && mount.kind === 'ima') await Promise.all([this.secrets.unset(clientRef(id)), this.secrets.unset(keyRef(id))])
    })
  }

  private async ownedOutput(mount: LocalMount): Promise<void> { if (await canonical(mount.output) !== mount.output || within(mount.root, mount.output) || await readFile(join(mount.output, '.owner'), 'utf8') !== mount.id) throw new Error('OUTPUT_OWNERSHIP_FAILED') }
  /** List one local directory without following symbolic links. */
  async tree(id: string, path: string): Promise<TreeEntry[]> { const mount = this.local(id), target = resolve(mount.root, path); if (!within(mount.root, target)) throw new Error('PATH_ESCAPE'); await canonical(target); const entries = await readdir(target, { withFileTypes: true }); return entries.filter(entry => !entry.isSymbolicLink()).map(entry => ({ name: entry.name, path: relative(mount.root, join(target, entry.name)), directory: entry.isDirectory() })) }

  /** Start incremental extraction and real local-model distillation. */
  async scan(id: string, retryOnly = false): Promise<void> { await this.mutate(async () => { const mount = this.local(id); this.busy = mount.id; this.processed = 0; this.error = null; this.running = this.run(mount, retryOnly).catch(error => { this.error = message(error) }).finally(() => { this.busy = null; this.running = null }) }) }
  private async run(mount: LocalMount, retryOnly: boolean): Promise<void> {
    try {
      await canonical(mount.root); await this.ownedOutput(mount)
      const paths: string[] = []
      if (retryOnly) paths.push(...mount.documents.filter(item => item.state === 'failed' || item.state === 'extracted').map(item => item.path))
      else {
        const pending = ['']
        while (pending.length > 0) { const directory = pending.pop()!; for (const entry of await this.tree(mount.id, directory)) { if (entry.directory) pending.push(entry.path); else { paths.push(entry.path); if (paths.length > this.limits.maxFiles) throw new Error('FILE_COUNT_LIMIT') } } }
      }
      let selection = mount.selectedModel
      try { selection = await this.model.fastest(); mount.selectedModel = selection } catch (error) { selection = undefined; mount.error = message(error) }
      const records = retryOnly ? [...mount.documents] : []
      for (const path of paths) {
        if (this.closed) throw new Error('SCAN_INTERRUPTED')
        const id = createHash('sha256').update(path).digest('hex') as DocumentId
        let record: LocalDocumentRecord = { id, path, size: 0, modified: 0, state: 'failed', characters: 0 }
        try {
          const file = resolve(mount.root, path); if (!within(mount.root, file)) throw new Error('PATH_ESCAPE'); await canonical(file)
          const stat = await lstat(file); record.size = stat.size; record.modified = stat.mtimeMs; if (!stat.isFile()) throw new Error('NOT_REGULAR_FILE'); if (stat.size > this.limits.maxFileBytes) throw new Error('FILE_TOO_LARGE')
          const previous = mount.documents.find(item => item.id === id)
          if (!retryOnly && previous?.state === 'ready' && previous.size === stat.size && previous.modified === stat.mtimeMs) { await access(join(mount.output, `${id}.semantic.json`), constants.R_OK); record = previous }
          else {
            const extension = extname(path).toLowerCase(); if (!['.txt', '.md', '.json', '.csv', '.docx', '.pdf'].includes(extension)) throw new Error('UNSUPPORTED_FORMAT')
            const handle = await open(file, 'r'); let buffer: Buffer
            try { const actual = await handle.stat(); if (actual.size > this.limits.maxFileBytes) throw new Error('FILE_TOO_LARGE'); buffer = Buffer.alloc(actual.size); const read = await handle.read(buffer, 0, buffer.length, 0); buffer = buffer.subarray(0, read.bytesRead) } finally { await handle.close() }
            const extracted = extension === '.docx' ? extractDocxText(buffer) : extension === '.pdf' ? extractPdfText(buffer) : extractPlainText(buffer)
            if (!extracted.text.trim()) throw new Error('NO_TEXT'); if (extracted.truncated) throw new Error('EXTRACTED_TEXT_LIMIT')
            await this.atomic(mount, `${id}.text.txt`, extracted.text)
            record = { ...record, state: 'extracted', characters: extracted.text.length }
            if (selection !== undefined) {
              record.state = 'distilling'
              const artifact = await this.model.distill({ text: extracted.text, path, size: stat.size, modified: stat.mtimeMs, sha256: createHash('sha256').update(buffer).digest('hex'), model: selection })
              await this.atomic(mount, `${id}.semantic.json`, JSON.stringify(artifact, null, 2)); record = { ...record, state: 'ready', model: selection.name }
            }
          }
        } catch (error) { record.state = record.characters > 0 ? 'extracted' : 'failed'; record.error = message(error) }
        const index = records.findIndex(item => item.id === id); if (index < 0) records.push(record); else records[index] = record
        this.processed += 1; mount.documents = records; await this.persist(); await yieldTurn()
      }
      mount.documents = records; mount.scannedAt = new Date().toISOString(); if (selection !== undefined) delete mount.error; await this.persist()
    } catch (error) { mount.error = message(error); await this.persist(); throw error }
  }
  private async atomic(mount: LocalMount, name: string, contents: string): Promise<void> { await this.ownedOutput(mount); const temp = join(mount.output, `${randomUUID()}.tmp`); await writeFile(temp, contents, { flag: 'wx', mode: 0o600 }); await rename(temp, join(mount.output, name)) }

  /** Read extracted text or its semantic artifact. */
  async preview(id: string, documentId: string, semantic = false): Promise<string> { const mount = this.local(id), document = mount.documents.find(item => item.id === documentId); if (!document || document.state === 'failed') throw new Error('DOCUMENT_NOT_READY'); await this.ownedOutput(mount); return readFile(join(mount.output, `${document.id}.${semantic ? 'semantic.json' : 'text.txt'}`), 'utf8') }
  /** Refresh one ima file list without downloading any file body. */
  async refreshIma(id: string, signal?: AbortSignal): Promise<void> { await this.mutate(async () => { const mount = this.cloud(id); mount.documents = await this.ima.list(await this.credentials(mount), mount.knowledgeBaseId, undefined, signal); mount.refreshedAt = new Date().toISOString(); delete mount.error; await this.persist() }) }
  /** Read one ima folder's metadata without persisting or downloading file bodies. */
  async listImaFolder(id: string, folderId?: string, signal?: AbortSignal): Promise<CloudMount['documents']> { const mount = this.cloud(id); return this.ima.list(await this.credentials(mount), mount.knowledgeBaseId, folderId, signal) }

  /** Query local artifacts and ima snippets for model use. */
  async search(query: string, mountId?: string, signal?: AbortSignal): Promise<KnowledgeSearchHit[]> {
    const selected = mountId ? [this.mount(mountId)] : this.mounts; const needle = query.trim().toLocaleLowerCase(); if (!needle) throw new Error('QUERY_REQUIRED')
    const hits: KnowledgeSearchHit[] = []
    for (const mount of selected) {
      if (mount.kind === 'ima') { hits.push(...await this.ima.search(await this.credentials(mount), mount.knowledgeBaseId, query, mount, signal)); continue }
      await this.ownedOutput(mount)
      for (const document of mount.documents) {
        if (document.state === 'failed') continue
        const text = await readFile(join(mount.output, `${document.id}.text.txt`), 'utf8'); const lower = text.toLocaleLowerCase(); const at = lower.indexOf(needle)
        if (at >= 0 || document.path.toLocaleLowerCase().includes(needle)) hits.push({ mountId: mount.id, mountName: mount.name, provider: 'local', documentId: document.id, title: basename(document.path), path: document.path, snippet: text.slice(Math.max(0, at < 0 ? 0 : at - 120), Math.max(0, at < 0 ? 0 : at - 120) + 500) })
      }
    }
    return hits.slice(0, 20)
  }
  /** Wait until provider work settles. */
  async idle(): Promise<void> { await this.mutations; await this.running }
  /** Reject new work and wait for work to stop. */
  async dispose(): Promise<void> { this.closed = true; await this.idle() }
}
