/**
 * Explicit, bounded import of user-selected external task metadata.
 * No default home-directory scan is performed here and raw chats are never
 * copied into the XYAI ledger.
 */

import { createHash } from 'node:crypto'
import { basename, extname, join, resolve } from 'node:path'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { type ExternalTaskOrigin, type TaskLedger, type XyaiTask } from './task-ledger.ts'

const TASK_FILE = /(session|rollout|task|conversation|chat|thread)/iu
const TASK_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.yaml', '.yml'])
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'cache', 'cacheddata', 'code cache', 'gpucache', 'logs', 'extensions', 'crashpad'])

export interface SelectedTaskSource {
  readonly providerId: string
  readonly providerLabel: string
  readonly root: string
}

export interface ExternalTaskCandidate {
  readonly id: string
  readonly providerId: string
  readonly providerLabel: string
  readonly title: string
  readonly goal: string
  readonly sourceHash: string
  readonly sourceFormat: string
  readonly modifiedAt: string
  /** Audit-only; never used by the imported task at execution time. */
  readonly originalPath: string
}

export interface ExternalTaskImportResult {
  readonly task: XyaiTask
  readonly imported: boolean
  readonly updated: boolean
}

export async function discoverTasksInSelectedRoot(source: SelectedTaskSource, limits: { maxFiles?: number; maxDepth?: number } = {}): Promise<readonly ExternalTaskCandidate[]> {
  const selectedRoot = await realpath(source.root)
  const details = await stat(selectedRoot)
  if (!details.isDirectory()) throw new Error('Selected task source must be a directory.')
  const files: CandidateFile[] = []
  await walkTaskFiles(selectedRoot, selectedRoot, files, { limit: limits.maxFiles ?? 350, depth: 0, maxDepth: limits.maxDepth ?? 8 })
  const candidates = await Promise.all(files.sort((left, right) => right.modifiedMs - left.modifiedMs).map((file) => parseExternalTask(file, source)))
  return candidates.filter((candidate): candidate is ExternalTaskCandidate => candidate !== undefined)
}

/**
 * Imports only structured task essentials.  The existing record is returned
 * on duplicate provider/hash, so retrying cannot create a second task.
 */
export async function importExternalTask(ledger: TaskLedger, candidate: ExternalTaskCandidate, projectId = 'external-imports'): Promise<ExternalTaskImportResult> {
  const existing = ledger.findByExternalSource(candidate.providerId, candidate.id)
  if (existing?.origin?.sourceHash === candidate.sourceHash) return { task: existing, imported: false, updated: false }
  if (existing !== undefined) {
    const task = await ledger.mutate(existing.id, (mutable) => {
      mutable.events.push({ id: `external-update-${candidate.sourceHash.slice(0, 18)}`, type: 'external-task-source-updated', detail: {
        providerId: candidate.providerId,
        sourceHash: candidate.sourceHash,
        sourceFormat: candidate.sourceFormat,
        rawChatCopied: false,
      }, occurredAt: new Date().toISOString() })
    })
    return { task, imported: false, updated: true }
  }
  const origin: ExternalTaskOrigin = {
    providerId: candidate.providerId,
    providerLabel: candidate.providerLabel,
    externalId: candidate.id,
    sourceHash: candidate.sourceHash,
    importedAt: new Date().toISOString(),
    originalPath: candidate.originalPath,
  }
  const task = await ledger.create({
    projectId,
    title: candidate.title,
    goal: candidate.goal,
    constraints: ['外部任务内容经用户选择后导入；运行时不依赖原始目录。'],
    acceptanceCriteria: ['导入后的任务可在 XYAI Studio 本地恢复。'],
    origin,
  })
  await ledger.mutate(task.id, (mutable) => {
    mutable.status = 'active'
    mutable.events.push({ id: `external-import-${candidate.sourceHash.slice(0, 18)}`, type: 'external-task-imported', detail: {
      providerId: candidate.providerId,
      sourceHash: candidate.sourceHash,
      sourceFormat: candidate.sourceFormat,
      rawChatCopied: false,
    }, occurredAt: new Date().toISOString() })
  })
  const imported = ledger.findByOrigin(candidate.providerId, candidate.sourceHash)
  if (imported === undefined) throw new Error('Imported task could not be read back from the ledger.')
  return { task: imported, imported: true, updated: false }
}

interface CandidateFile {
  readonly path: string
  readonly size: number
  readonly modifiedAt: string
  readonly modifiedMs: number
}

async function walkTaskFiles(root: string, directory: string, output: CandidateFile[], options: { limit: number; depth: number; maxDepth: number }): Promise<void> {
  if (output.length >= options.limit || options.depth > options.maxDepth) return
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (output.length >= options.limit) break
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) await walkTaskFiles(root, join(directory, entry.name), output, { ...options, depth: options.depth + 1 })
      continue
    }
    if (!entry.isFile()) continue
    const path = join(directory, entry.name)
    const extension = extname(entry.name).toLowerCase()
    if (!TASK_EXTENSIONS.has(extension) || !TASK_FILE.test(path.slice(root.length))) continue
    try {
      const details = await stat(path)
      if (details.size <= 2 * 1024 * 1024) output.push({ path, size: details.size, modifiedAt: details.mtime.toISOString(), modifiedMs: details.mtimeMs })
    } catch { /* Another application may still be writing this file. */ }
  }
}

async function parseExternalTask(file: CandidateFile, source: SelectedTaskSource): Promise<ExternalTaskCandidate | undefined> {
  let content: string
  try { content = await readFile(file.path, 'utf8') } catch { return undefined }
  const values: Record<string, string[]> = {}
  for (const record of parseRecords(content).slice(-120)) collectValues(record, values)
  const fallback = basename(file.path, extname(file.path)).replace(/[-_]+/gu, ' ').trim() || '外部任务'
  const title = firstText(values, ['title', 'name', 'subject', 'summary', 'tasktitle']) ?? fallback
  const goal = lastText(values, ['userprompt', 'prompt', 'goal', 'task', 'description', 'message', 'content', 'text']) ?? `从 ${source.providerLabel} 导入的任务：${title}`
  const sourceHash = createHash('sha256').update(content).digest('hex')
  return {
    id: `external-task-${createHash('sha256').update(`${source.providerId}\0${resolve(file.path).toLowerCase()}`).digest('hex').slice(0, 18)}`,
    providerId: source.providerId,
    providerLabel: source.providerLabel,
    title: title.slice(0, 160),
    goal: goal.slice(0, 4_000),
    sourceHash,
    sourceFormat: extname(file.path).slice(1).toLowerCase(),
    modifiedAt: file.modifiedAt,
    originalPath: file.path,
  }
}

function parseRecords(content: string): unknown[] {
  if (!content.trim()) return []
  try { const value: unknown = JSON.parse(content); return Array.isArray(value) ? value : [value] } catch { /* JSONL is handled below. */ }
  return content.split(/\r?\n/u).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as unknown] } catch { return [] } })
}

function collectValues(value: unknown, output: Record<string, string[]>, depth = 0, parentKey = ''): void {
  if (depth > 6 || value === null || value === undefined) return
  if (typeof value === 'string') {
    const text = value.trim()
    if (text && text.length <= 12_000) (output[parentKey.toLowerCase()] ??= []).push(text)
    return
  }
  if (Array.isArray(value)) { for (const item of value.slice(-30)) collectValues(item, output, depth + 1, parentKey); return }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const role = typeof record.role === 'string' ? record.role.toLowerCase() : typeof record.type === 'string' ? record.type.toLowerCase() : ''
  for (const [key, item] of Object.entries(record)) {
    const normalized = key.toLowerCase()
    if (typeof item === 'string' && role === 'user' && ['content', 'text', 'message', 'prompt'].includes(normalized)) (output.userprompt ??= []).push(item.trim())
    collectValues(item, output, depth + 1, normalized)
  }
}

function firstText(values: Record<string, string[]>, names: readonly string[]): string | undefined {
  return names.flatMap((name) => values[name] ?? []).find(validText)
}

function lastText(values: Record<string, string[]>, names: readonly string[]): string | undefined {
  return names.flatMap((name) => values[name] ?? []).filter(validText).at(-1)
}

function validText(value: string): boolean { return value.trim().length >= 2 }
