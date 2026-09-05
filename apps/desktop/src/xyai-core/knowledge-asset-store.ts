/**
 * User-selected knowledge assets are copied into XYAI-owned user data.  The
 * resulting registry intentionally contains no source path, so an installed
 * application remains usable after the selected external folder disappears.
 */
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, open, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'

const MAX_FILES = 400
const MAX_BYTES = 200 * 1024 * 1024
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_SCAN_DEPTH = 8
const PROBE_BYTES = 8 * 1024
const IGNORED_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
])
const PARSEABLE_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.log',
  '.yaml', '.yml', '.xml', '.html', '.htm', '.ini', '.conf', '.properties',
  '.sql', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx',
  '.py', '.java', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
  '.sh', '.ps1', '.bat', '.cmd', '.css', '.scss', '.less', '.vue', '.svelte',
])

function isIgnoredDirectoryName(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name.trim().toLocaleLowerCase())
}

/**
 * A mount can point at a whole drive, where Windows exposes protected system
 * directories. Check every path segment rather than trusting Dirent metadata:
 * protected NTFS entries do not always report their type before access fails.
 */
function isIgnoredMountedPath(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/u)
    .filter(Boolean)
    .some(isIgnoredDirectoryName)
}

function hasParseableTextExtension(path: string): boolean {
  return PARSEABLE_TEXT_EXTENSIONS.has(extname(path).toLocaleLowerCase())
}

function isValidUtf8(buffer: Uint8Array): boolean {
  if (buffer.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

async function isReadableKnowledgeDirectory(path: string): Promise<boolean> {
  try {
    await readdir(path, { withFileTypes: true })
    return true
  } catch {
    return false
  }
}

async function isParseableKnowledgeFile(path: string, bytes: number): Promise<boolean> {
  if (bytes > MAX_FILE_BYTES || !hasParseableTextExtension(path)) return false
  let handle
  try {
    handle = await open(path, 'r')
    const probe = Buffer.alloc(Math.min(PROBE_BYTES, bytes))
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0)
    return isValidUtf8(probe.subarray(0, bytesRead))
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export interface KnowledgeAssetFile {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}
export interface KnowledgeAsset {
  readonly id: string
  readonly name: string
  readonly importedAt: string
  readonly files: readonly KnowledgeAssetFile[]
  readonly totalBytes: number
}
export type KnowledgeSourceStatus = 'online' | 'offline' | 'permission-denied'
export interface KnowledgeMount {
  readonly id: string
  readonly name: string
  readonly rootPath: string
  readonly mountedAt: string
  readonly status: KnowledgeSourceStatus
}
export interface KnowledgeTreeNode {
  readonly name: string
  readonly path: string
  readonly kind: 'directory' | 'file'
  readonly bytes?: number
}
interface KnowledgeAssetDocument { readonly schemaVersion: 2; readonly assets: KnowledgeAsset[]; readonly mounts: KnowledgeMount[] }

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

async function selectedFiles(sourcePath: string): Promise<string[]> {
  const source = resolve(sourcePath)
  const stat = await lstat(source)
  if (stat.isSymbolicLink()) throw new Error('cannot import symbolic links')
  if (stat.isFile()) return [source]
  if (!stat.isDirectory()) throw new Error('selected asset is neither a file nor a directory')
  const files: string[] = []
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (isIgnoredDirectoryName(entry.name)) continue
      const child = join(directory, entry.name)
      let childStat
      try {
        childStat = await lstat(child)
      } catch {
        // Protected/system files (for example E:\\pagefile.sys) are not
        // importable and must not abort a user-selected directory scan.
        continue
      }
      if (childStat.isSymbolicLink()) throw new Error('cannot import a directory containing symbolic links')
      if (childStat.isDirectory()) await visit(child, depth + 1)
      else if (childStat.isFile()) {
        files.push(child)
        if (files.length > MAX_FILES) throw new Error(`knowledge asset exceeds ${MAX_FILES} files`)
      }
    }
  }
  await visit(source, 0)
  return files
}

function destinationRelativePath(sourceRoot: string, sourceFile: string): string {
  const rootStatPath = resolve(sourceRoot)
  const candidate = relative(rootStatPath, sourceFile)
  return candidate && !candidate.startsWith(`..${sep}`) && candidate !== '..' ? candidate : basename(sourceFile)
}

export class KnowledgeAssetStore {
  private document: KnowledgeAssetDocument = { schemaVersion: 2, assets: [], mounts: [] }
  private loaded = false

  constructor(private readonly registryPath: string, private readonly contentDirectory: string) {}

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = JSON.parse(await readFile(this.registryPath, 'utf8')) as { schemaVersion?: number; assets?: KnowledgeAsset[]; mounts?: KnowledgeMount[] }
      if (raw.schemaVersion === 2 && Array.isArray(raw.assets) && Array.isArray(raw.mounts)) this.document = { schemaVersion: 2, assets: raw.assets, mounts: raw.mounts }
      else if (raw.schemaVersion === 1 && Array.isArray(raw.assets)) this.document = { schemaVersion: 2, assets: raw.assets, mounts: [] }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.loaded = true
  }

  list(): readonly KnowledgeAsset[] { return [...this.document.assets] }
  listMounts(): readonly KnowledgeMount[] { return [...this.document.mounts] }

  async mountDirectory(sourcePath: string): Promise<KnowledgeMount> {
    await this.load()
    const rootPath = resolve(sourcePath)
    const stat = await lstat(rootPath)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('knowledge mount must be a directory')
    const existing = this.document.mounts.find(item => resolve(item.rootPath).toLowerCase() === rootPath.toLowerCase())
    if (existing) return existing
    const mount: KnowledgeMount = { id: `mount-${randomUUID()}`, name: basename(rootPath) || rootPath, rootPath, mountedAt: new Date().toISOString(), status: 'online' }
    this.document = { ...this.document, mounts: [...this.document.mounts, mount] }
    await writeAtomic(this.registryPath, this.document)
    return mount
  }

  async unmount(id: string): Promise<void> {
    await this.load()
    if (!this.document.mounts.some(item => item.id === id)) throw new Error('knowledge mount not found')
    this.document = { ...this.document, mounts: this.document.mounts.filter(item => item.id !== id) }
    await writeAtomic(this.registryPath, this.document)
  }

  async renameMount(id: string, name: string): Promise<void> {
    await this.load()
    const trimmed = name.trim()
    if (!trimmed) throw new Error('knowledge mount name cannot be empty')
    if (trimmed.length > 120) throw new Error('knowledge mount name is too long')
    const mount = this.document.mounts.find(item => item.id === id)
    if (!mount) throw new Error('knowledge mount not found')
    this.document = { ...this.document, mounts: this.document.mounts.map(item => item.id === id ? { ...item, name: trimmed } : item) }
    await writeAtomic(this.registryPath, this.document)
  }

  async listMountChildren(id: string, relativePath = ''): Promise<readonly KnowledgeTreeNode[]> {
    await this.load()
    const mount = this.document.mounts.find(item => item.id === id)
    if (!mount) throw new Error('knowledge mount not found')
    const base = resolve(mount.rootPath)
    const target = resolve(base, relativePath)
    const nested = relative(base, target)
    if (nested.startsWith(`..${sep}`) || nested === '..') throw new Error('knowledge mount path escapes root')
    // Do not touch protected Windows folders even when an old renderer still
    // sends their path. This keeps a whole-drive mount usable after one
    // inaccessible folder is encountered.
    if (isIgnoredMountedPath(nested)) return []
    let entries
    try {
      entries = await readdir(target, { withFileTypes: true })
    } catch {
      // Access can change while a drive is mounted (recycle-bin SIDs, system
      // folders, removable media and network shares). An inaccessible branch
      // is not a mount failure; omit it and retain all readable peers.
      return []
    }
    const result: KnowledgeTreeNode[] = []
    for (const entry of entries) {
      if (isIgnoredDirectoryName(entry.name)) continue
      const child = join(target, entry.name)
      try {
        const stat = await lstat(child)
        if (stat.isSymbolicLink()) continue
        if (stat.isDirectory()) {
          if (!await isReadableKnowledgeDirectory(child)) continue
          result.push({ name: entry.name, path: relative(base, child).replace(/\\/gu, '/'), kind: 'directory' })
        } else if (stat.isFile() && await isParseableKnowledgeFile(child, stat.size)) {
          result.push({ name: entry.name, path: relative(base, child).replace(/\\/gu, '/'), kind: 'file', bytes: stat.size })
        }
      } catch { /* inaccessible/protected entries are omitted from the tree */ }
    }
    return result.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name))
  }

  async readMountedFile(id: string, relativePath: string): Promise<string> {
    await this.load()
    const mount = this.document.mounts.find(item => item.id === id)
    if (!mount) throw new Error('knowledge mount not found')
    const base = resolve(mount.rootPath)
    const target = resolve(base, relativePath)
    const nested = relative(base, target)
    if (!nested || nested.startsWith(`..${sep}`) || nested === '..') throw new Error('knowledge mount path escapes root')
    if (isIgnoredMountedPath(nested)) throw new Error('knowledge mount target is protected by the operating system')
    const stat = await lstat(target)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('knowledge mount target is not a regular file')
    if (stat.size > MAX_FILE_BYTES) throw new Error(`knowledge file exceeds ${MAX_FILE_BYTES} bytes`)
    if (!hasParseableTextExtension(target)) throw new Error('knowledge mount target is not a parseable text file')
    const buffer = await readFile(target)
    if (!isValidUtf8(buffer)) throw new Error('knowledge mount target is not valid UTF-8 text')
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  }

  /**
   * Read text already copied into XYAI-owned storage for the production data
   * line.  No caller gets the original external source path.
   */
  async exportTextCorpus(assetId: string): Promise<readonly { readonly path: string; readonly text: string }[]> {
    await this.load()
    const asset = this.document.assets.find(item => item.id === assetId)
    if (asset === undefined) throw new Error('knowledge asset not found')
    const base = join(this.contentDirectory, asset.id, 'files')
    const records: Array<{ path: string; text: string }> = []
    for (const file of asset.files) {
      const relativePath = file.path.replace(/\//gu, sep)
      const target = resolve(base, relativePath)
      const nested = relative(base, target)
      if (!nested || nested.startsWith(`..${sep}`) || nested === '..') throw new Error('knowledge asset contains an invalid path')
      const lower = file.path.toLowerCase()
      if (!/\.(?:txt|md|markdown|json|csv|tsv|log|yaml|yml)$/u.test(lower)) continue
      const raw = await readFile(target, 'utf8')
      const text = raw.replace(/\r\n?/gu, '\n').trim()
      if (text) records.push({ path: file.path, text })
    }
    return records
  }

  async importSelected(sourcePath: string): Promise<KnowledgeAsset> {
    await this.load()
    const source = resolve(sourcePath)
    const files = await selectedFiles(source)
    const id = `knowledge-${randomUUID()}`
    const destinationRoot = join(this.contentDirectory, id, 'files')
    let totalBytes = 0
    const records: KnowledgeAssetFile[] = []
    for (const sourceFile of files) {
      const stat = await lstat(sourceFile)
      if (stat.size > MAX_FILE_BYTES) throw new Error(`knowledge asset file exceeds ${MAX_FILE_BYTES} bytes`)
      totalBytes += stat.size
      if (totalBytes > MAX_BYTES) throw new Error(`knowledge asset exceeds ${MAX_BYTES} bytes`)
      const filePath = destinationRelativePath(source, sourceFile).replace(/\\/gu, '/')
      const destination = join(destinationRoot, filePath)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(sourceFile, destination)
      const digest = createHash('sha256').update(await readFile(destination)).digest('hex')
      records.push({ path: filePath, bytes: stat.size, sha256: digest })
    }
    const asset: KnowledgeAsset = {
      id,
      name: basename(source),
      importedAt: new Date().toISOString(),
      files: records,
      totalBytes,
    }
    this.document = { ...this.document, assets: [...this.document.assets, asset] }
    await writeAtomic(this.registryPath, this.document)
    return asset
  }
}
