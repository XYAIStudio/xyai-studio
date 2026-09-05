/**
 * Knowledge base silent-parse kernel (W-102 step 1).
 *
 * Headless and Node-builtin-only so it can be unit tested and later driven
 * by the parse worker, the IPC layer and the knowledge UI.  Scope today:
 * mount preflight, ignore rules, bounded enumeration with size+mtime
 * fingerprints, incremental diff, and persistent per-mount scan state.
 * Content extraction/parsing is intentionally out of scope: the roadmap
 * splits scan/register from parse, and the W-102 parse worker consumes the
 * file lists produced here.
 */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

export const DEFAULT_SCAN_LIMITS = {
  maxDepth: 24,
  maxFiles: 200_000,
  maxFileBytes: 100 * 1024 * 1024,
} as const

/** Plain-text style formats the desktop worker parses inline. */
export const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.log',
  '.yaml', '.yml', '.xml', '.html', '.htm', '.ini', '.conf', '.properties',
  '.sql', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx',
  '.py', '.java', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
  '.sh', '.ps1', '.bat', '.cmd', '.css', '.scss', '.less', '.vue', '.svelte',
])

/** Binary document formats in the 0.3.1 first batch (D5 default). */
export const DOCUMENT_FILE_EXTENSIONS = new Set(['.docx', '.pdf'])

export type KnowledgeScanKind = 'text' | 'document' | 'unsupported'

export type KnowledgeIgnoreReason =
  | 'protected-directory'
  | 'version-control-directory'
  | 'dependency-directory'
  | 'hidden-directory'
  | 'custom-ignored-directory'
  | 'custom-ignored-file'
  | 'office-lock-file'
  | 'hidden-system-file'
  | 'temporary-file'
  | 'oversized-file'

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '__pycache__',
  '.pnpm-store',
])
const DEFAULT_IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])
const DEFAULT_IGNORED_FILE_EXTENSIONS = new Set(['.tmp', '.crdownload', '.part', '.swp'])
const PROTECTED_DIRECTORIES = new Set(['$recycle.bin', 'system volume information'])
const VERSION_CONTROL_DIRECTORIES = new Set(['.git', '.svn', '.hg'])
const DEPENDENCY_DIRECTORIES = new Set(['node_modules', '__pycache__', '.pnpm-store'])

export interface KnowledgeScanOptions {
  /** Maximum directory nesting under the root; root children are depth 1. */
  readonly maxDepth?: number
  readonly maxFiles?: number
  readonly maxFileBytes?: number
  readonly ignoredDirectoryNames?: ReadonlySet<string>
  readonly ignoredFileNames?: ReadonlySet<string>
  readonly ignoredFileExtensions?: ReadonlySet<string>
  readonly signal?: AbortSignal
}

interface ScanProfile {
  readonly maxDepth: number
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly ignoredDirectories: ReadonlySet<string>
  readonly ignoredFiles: ReadonlySet<string>
  readonly ignoredFileExtensions: ReadonlySet<string>
  readonly signal: AbortSignal | undefined
}

function scanProfile(options: KnowledgeScanOptions): ScanProfile {
  const ignoredDirectories = new Set(DEFAULT_IGNORED_DIRECTORIES)
  options.ignoredDirectoryNames?.forEach(name => ignoredDirectories.add(name.trim().toLocaleLowerCase()))
  const ignoredFiles = new Set(DEFAULT_IGNORED_FILES)
  options.ignoredFileNames?.forEach(name => ignoredFiles.add(name.trim().toLocaleLowerCase()))
  const ignoredFileExtensions = new Set(DEFAULT_IGNORED_FILE_EXTENSIONS)
  options.ignoredFileExtensions?.forEach(extension => ignoredFileExtensions.add(extension.toLocaleLowerCase()))
  return {
    maxDepth: options.maxDepth ?? DEFAULT_SCAN_LIMITS.maxDepth,
    maxFiles: options.maxFiles ?? DEFAULT_SCAN_LIMITS.maxFiles,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_SCAN_LIMITS.maxFileBytes,
    ignoredDirectories,
    ignoredFiles,
    ignoredFileExtensions,
    signal: options.signal,
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new Error('knowledge scan aborted')
}

function directoryReason(name: string, profile: ScanProfile): KnowledgeIgnoreReason | undefined {
  const lower = name.trim().toLocaleLowerCase()
  if (PROTECTED_DIRECTORIES.has(lower)) return 'protected-directory'
  if (VERSION_CONTROL_DIRECTORIES.has(lower)) return 'version-control-directory'
  if (DEPENDENCY_DIRECTORIES.has(lower)) return 'dependency-directory'
  if (profile.ignoredDirectories.has(lower)) return 'custom-ignored-directory'
  if (lower.startsWith('.')) return 'hidden-directory'
  return undefined
}

/** Pure ignore-rule check for a directory name (exported for tests and the wizard). */
export function ignoredDirectoryName(name: string): KnowledgeIgnoreReason | undefined {
  const lower = name.trim().toLocaleLowerCase()
  if (PROTECTED_DIRECTORIES.has(lower)) return 'protected-directory'
  if (VERSION_CONTROL_DIRECTORIES.has(lower)) return 'version-control-directory'
  if (DEPENDENCY_DIRECTORIES.has(lower)) return 'dependency-directory'
  if (lower.startsWith('.')) return 'hidden-directory'
  return undefined
}

export function isOfficeLockFileName(name: string): boolean {
  return name.startsWith('~$')
}
export function isTemporaryFileExtension(extension: string): boolean {
  return DEFAULT_IGNORED_FILE_EXTENSIONS.has(extension.toLocaleLowerCase())
}
export function isHiddenSystemFileName(name: string): boolean {
  return DEFAULT_IGNORED_FILES.has(name.trim().toLocaleLowerCase())
}

/** Extension-level classification; does not read file contents. */
export function classifyKnowledgeFile(path: string): { readonly kind: KnowledgeScanKind; readonly parseable: boolean } {
  const extension = extname(path).toLocaleLowerCase()
  if (TEXT_FILE_EXTENSIONS.has(extension)) return { kind: 'text', parseable: true }
  if (DOCUMENT_FILE_EXTENSIONS.has(extension)) return { kind: 'document', parseable: true }
  return { kind: 'unsupported', parseable: false }
}

export interface KnowledgeScanFile {
  readonly relPath: string
  readonly kind: KnowledgeScanKind
  readonly parseable: boolean
  readonly bytes: number
  readonly mtimeMs: number
}
export interface KnowledgeIgnoredItem {
  readonly relPath: string
  readonly reason: KnowledgeIgnoreReason
}
export interface KnowledgeScanReport {
  readonly scannedAt: string
  readonly files: readonly KnowledgeScanFile[]
  readonly ignoredItems: readonly KnowledgeIgnoredItem[]
  readonly ignoredItemCount: number
  readonly ignoredDirectoryCount: number
  readonly symlinkCount: number
  readonly inaccessibleCount: number
  readonly parseableCount: number
  readonly unsupportedCount: number
  readonly maxDepthReached: boolean
  readonly maxFilesReached: boolean
}

const MAX_REPORTED_IGNORED = 500

/**
 * 挂接预检：目录存在性 / 类型 / 可读性 + 面向普通用户的提示。
 * 不读取内容，不做全盘遍历，因此任何目录都可以安全地先过这一关。
 */
export interface KnowledgePreflight {
  readonly rootPath: string
  readonly exists: boolean
  readonly isDirectory: boolean
  readonly isSymbolicLink: boolean
  readonly readable: boolean
  readonly warnings: readonly string[]
}
export async function preflightKnowledgeRoot(rootPath: string): Promise<KnowledgePreflight> {
  const root = resolve(rootPath)
  let exists = false
  let isSymbolicLink = false
  let isDirectory = false
  let readable = false
  try {
    const stat = await lstat(root)
    exists = true
    isSymbolicLink = stat.isSymbolicLink()
    isDirectory = stat.isDirectory()
    if (isDirectory && !isSymbolicLink) {
      try {
        await readdir(root)
        readable = true
      } catch {
        /* keep readable=false */
      }
    }
  } catch {
    /* keep exists=false */
  }
  const warnings: string[] = []
  const driveLetter = root.length >= 2 && root.charCodeAt(1) === 58
  const isDriveRoot = driveLetter && (root.length === 2 || (root.length === 3 && (root.charCodeAt(2) === 92 || root.charCodeAt(2) === 47)))
  if (isDriveRoot) warnings.push('该路径是整块磁盘的根目录，首次扫描范围很大，请留意解析进度。')
  if (basename(root).startsWith('.')) warnings.push('该目录名以点开头，默认按隐藏目录跳过其中内容，若确有文档请考虑改名。')
  return { rootPath: root, exists, isDirectory, isSymbolicLink, readable, warnings }
}

/**
 * 遍历知识根目录并登记可解析/暂不支持文件（扫描与解析分离的第一步）。
 * 忽略的目录整棵跳过，不跟进（避免 node_modules 等巨型噪音）；
 * 符号链接一律不跟随（防环与越界）；不可访问的分支只计数不中断。
 */
export async function scanKnowledgeRoot(rootPath: string, options: KnowledgeScanOptions = {}): Promise<KnowledgeScanReport> {
  const root = resolve(rootPath)
  const rootStat = await lstat(root)
  if (rootStat.isSymbolicLink()) throw new Error('knowledge scan root must not be a symbolic link')
  if (!rootStat.isDirectory()) throw new Error('knowledge scan root is not a directory')
  const profile = scanProfile(options)
  const files: KnowledgeScanFile[] = []
  const ignoredItems: KnowledgeIgnoredItem[] = []
  let ignoredItemCount = 0
  let ignoredDirectoryCount = 0
  let symlinkCount = 0
  let inaccessibleCount = 0
  let parseableCount = 0
  let unsupportedCount = 0
  let maxDepthReached = false
  let maxFilesReached = false
  const segments: string[] = []

  async function walk(directory: string, depth: number): Promise<void> {
    if (maxFilesReached) return
    if (depth > profile.maxDepth) {
      maxDepthReached = true
      return
    }
    throwIfAborted(profile.signal)
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      inaccessibleCount += 1
      return
    }
    for (const entry of entries) {
      throwIfAborted(profile.signal)
      if (entry.isDirectory()) {
        const reason = directoryReason(entry.name, profile)
        if (reason !== undefined) {
          ignoredDirectoryCount += 1
          continue
        }
        segments.push(entry.name)
        await walk(join(directory, entry.name), depth + 1)
        segments.pop()
        if (maxFilesReached) return
        continue
      }
      if (entry.isSymbolicLink()) {
        symlinkCount += 1
        continue
      }
      if (!entry.isFile()) continue
      if (files.length >= profile.maxFiles) {
        maxFilesReached = true
        return
      }
      const name = entry.name
      const lowerName = name.toLocaleLowerCase()
      const extension = extname(lowerName)
      if (isOfficeLockFileName(name) || lowerName.endsWith('~')) {
        ignoredItemCount += 1
        if (ignoredItems.length < MAX_REPORTED_IGNORED) ignoredItems.push({ relPath: [...segments, name].join('/'), reason: 'office-lock-file' })
        continue
      }
      if (profile.ignoredFiles.has(lowerName)) {
        ignoredItemCount += 1
        if (ignoredItems.length < MAX_REPORTED_IGNORED) ignoredItems.push({ relPath: [...segments, name].join('/'), reason: 'hidden-system-file' })
        continue
      }
      if (profile.ignoredFileExtensions.has(extension)) {
        ignoredItemCount += 1
        if (ignoredItems.length < MAX_REPORTED_IGNORED) ignoredItems.push({ relPath: [...segments, name].join('/'), reason: 'temporary-file' })
        continue
      }
      let stat
      try {
        stat = await lstat(join(directory, name))
      } catch {
        inaccessibleCount += 1
        continue
      }
      if (stat.isSymbolicLink()) {
        symlinkCount += 1
        continue
      }
      if (!stat.isFile()) continue
      if (stat.size > profile.maxFileBytes) {
        ignoredItemCount += 1
        if (ignoredItems.length < MAX_REPORTED_IGNORED) ignoredItems.push({ relPath: [...segments, name].join('/'), reason: 'oversized-file' })
        continue
      }
      const { kind, parseable } = classifyKnowledgeFile(name)
      files.push({ relPath: [...segments, name].join('/'), kind, parseable, bytes: stat.size, mtimeMs: stat.mtimeMs })
      if (parseable) parseableCount += 1
      else unsupportedCount += 1
    }
  }

  await walk(root, 1)
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  ignoredItems.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  return {
    scannedAt: new Date().toISOString(),
    files,
    ignoredItems,
    ignoredItemCount,
    ignoredDirectoryCount,
    symlinkCount,
    inaccessibleCount,
    parseableCount,
    unsupportedCount,
    maxDepthReached,
    maxFilesReached,
  }
}

export interface KnowledgeFileFingerprint {
  readonly bytes: number
  readonly mtimeMs: number
}
export interface KnowledgeScanDiff {
  readonly added: readonly KnowledgeScanFile[]
  readonly changed: readonly KnowledgeScanFile[]
  readonly removed: readonly string[]
  readonly unchangedCount: number
}

/** 纯函数：新旧指纹对照，判定新增 / 修改 / 删除 / 未变（供增量事件与解析队列使用）。 */
export function diffKnowledgeScans(
  previous: ReadonlyMap<string, KnowledgeFileFingerprint>,
  next: readonly KnowledgeScanFile[],
): KnowledgeScanDiff {
  const added: KnowledgeScanFile[] = []
  const changed: KnowledgeScanFile[] = []
  let unchangedCount = 0
  const nextPaths = new Set<string>()
  for (const file of next) {
    nextPaths.add(file.relPath)
    const prior = previous.get(file.relPath)
    if (prior === undefined) added.push(file)
    else if (prior.bytes === file.bytes && prior.mtimeMs === file.mtimeMs) unchangedCount += 1
    else changed.push(file)
  }
  const removed: string[] = []
  for (const relPath of previous.keys()) {
    if (!nextPaths.has(relPath)) removed.push(relPath)
  }
  removed.sort()
  return { added, changed, removed, unchangedCount }
}

export interface KnowledgeMountScanState {
  readonly rootPath: string
  readonly scannedAt: string
  readonly files: readonly KnowledgeScanFile[]
}
interface KnowledgeIndexStateDocument {
  readonly schemaVersion: 1
  readonly mounts: KnowledgeMountScanState[]
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, 'utf8')
  await rename(temporaryPath, path)
}

export function mountStateKey(rootPath: string): string {
  return resolve(rootPath).toLocaleLowerCase()
}

export class KnowledgeIndexerStateStore {
  private document: KnowledgeIndexStateDocument = { schemaVersion: 1, mounts: [] }
  private loaded = false

  constructor(private readonly registryPath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = JSON.parse(await readFile(this.registryPath, 'utf8')) as { schemaVersion?: number; mounts?: KnowledgeMountScanState[] }
      if (raw.schemaVersion === 1 && Array.isArray(raw.mounts)) {
        const mounts = raw.mounts.filter(item => typeof item.rootPath === 'string' && Array.isArray(item.files) && typeof item.scannedAt === 'string')
        this.document = { schemaVersion: 1, mounts }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.loaded = true
  }

  list(): readonly KnowledgeMountScanState[] {
    return this.document.mounts
  }

  recordFor(rootPath: string): KnowledgeMountScanState | undefined {
    const key = mountStateKey(rootPath)
    return this.document.mounts.find(item => mountStateKey(item.rootPath) === key)
  }

  async upsert(state: KnowledgeMountScanState): Promise<void> {
    await this.load()
    const key = mountStateKey(state.rootPath)
    const without = this.document.mounts.filter(item => mountStateKey(item.rootPath) !== key)
    this.document = { schemaVersion: 1, mounts: [...without, state] }
    await writeAtomic(this.registryPath, this.document)
  }

  async remove(rootPath: string): Promise<void> {
    await this.load()
    const key = mountStateKey(rootPath)
    this.document = { schemaVersion: 1, mounts: this.document.mounts.filter(item => mountStateKey(item.rootPath) !== key) }
    await writeAtomic(this.registryPath, this.document)
  }
}

/** 编排：预检 → 增量扫描 → 持久化状态。返回报告与相对上次的差异。 */
export class KnowledgeIndexer {
  constructor(private readonly stateStore: KnowledgeIndexerStateStore, private readonly options: KnowledgeScanOptions = {}) {}

  async load(): Promise<void> {
    await this.stateStore.load()
  }

  async scanMount(rootPath: string, options: KnowledgeScanOptions = {}): Promise<{
    readonly report: KnowledgeScanReport
    readonly diff: KnowledgeScanDiff
    readonly state: KnowledgeMountScanState
  }> {
    const profileOptions = { ...this.options, ...options }
    const preflight = await preflightKnowledgeRoot(rootPath)
    if (!preflight.exists || !preflight.isDirectory || preflight.isSymbolicLink) throw new Error('挂接目录不可用：请选择一个存在的普通文件夹。')
    if (!preflight.readable) throw new Error('挂接目录不可读：可能是系统保护目录或权限不足。')
    const report = await scanKnowledgeRoot(rootPath, profileOptions)
    const root = resolve(rootPath)
    const previous = this.stateStore.recordFor(root)
    const previousFingerprints = new Map<string, KnowledgeFileFingerprint>()
    for (const file of previous?.files ?? []) previousFingerprints.set(file.relPath, { bytes: file.bytes, mtimeMs: file.mtimeMs })
    const diff = diffKnowledgeScans(previousFingerprints, report.files)
    const state: KnowledgeMountScanState = { rootPath: root, scannedAt: report.scannedAt, files: report.files }
    await this.stateStore.upsert(state)
    return { report, diff, state }
  }

  async removeMount(rootPath: string): Promise<void> {
    await this.stateStore.remove(rootPath)
  }
}
