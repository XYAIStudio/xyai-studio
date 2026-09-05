/**
 * XYAI-owned durable task contract.
 *
 * This module intentionally knows nothing about Electron renderers, DSH, XYOS,
 * or any third-party AI.  A task remains usable when its source directory,
 * model, or Harness is no longer available.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type TaskStatus = 'draft' | 'active' | 'blocked' | 'completed'
export type FactConfidence = 'confirmed' | 'reported' | 'uncertain'

export interface TaskFact {
  readonly id: string
  readonly statement: string
  readonly source: string
  readonly confidence: FactConfidence
  readonly recordedAt: string
}

export interface TaskArtifact {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly kind: string
  readonly summary: string
  readonly recordedAt: string
}

export interface TaskEvent {
  readonly id: string
  readonly type: string
  readonly detail: unknown
  readonly occurredAt: string
}

/** Provenance is audit-only: no task execution reads this original path. */
export interface ExternalTaskOrigin {
  readonly providerId: string
  readonly providerLabel: string
  /** Stable identity derived from the selected source file path. */
  readonly externalId: string
  readonly sourceHash: string
  readonly importedAt: string
  readonly originalPath?: string
}

export interface XyaiTask {
  readonly id: string
  readonly projectId: string
  readonly title: string
  readonly goal: string
  readonly constraints: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  status: TaskStatus
  readonly createdAt: string
  updatedAt: string
  readonly facts: TaskFact[]
  readonly artifacts: TaskArtifact[]
  readonly nextActions: string[]
  readonly events: TaskEvent[]
  readonly origin?: ExternalTaskOrigin
}

export interface CreateTaskInput {
  readonly id?: string
  readonly projectId: string
  readonly title: string
  readonly goal: string
  readonly constraints?: readonly string[]
  readonly acceptanceCriteria?: readonly string[]
  readonly origin?: ExternalTaskOrigin
}

export interface MinimumHandoff {
  readonly schemaVersion: 1
  readonly taskId: string
  readonly title: string
  readonly goal: string
  readonly constraints: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly facts: readonly TaskFact[]
  readonly artifacts: readonly TaskArtifact[]
  readonly nextActions: readonly string[]
  readonly recentEvents: readonly TaskEvent[]
  readonly generatedAt: string
}

interface TaskLedgerState {
  readonly schemaVersion: 1
  readonly tasks: XyaiTask[]
}

const timestamp = (): string => new Date().toISOString()

export function createTask(input: CreateTaskInput): XyaiTask {
  const projectId = input.projectId.trim()
  const title = input.title.trim()
  const goal = input.goal.trim()
  if (!projectId || !title || !goal) throw new Error('Task requires projectId, title and goal.')
  const createdAt = timestamp()
  return {
    id: input.id?.trim() || randomUUID(),
    projectId,
    title,
    goal,
    constraints: cleanStrings(input.constraints),
    acceptanceCriteria: cleanStrings(input.acceptanceCriteria),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    facts: [],
    artifacts: [],
    nextActions: [],
    events: [],
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  }
}

export function addTaskFact(task: XyaiTask, input: { statement: string; source: string; confidence?: FactConfidence }): XyaiTask {
  const statement = input.statement.trim()
  const source = input.source.trim()
  if (!statement || !source) throw new Error('A durable fact requires statement and source.')
  task.facts.push({ id: randomUUID(), statement, source, confidence: input.confidence ?? 'confirmed', recordedAt: timestamp() })
  task.updatedAt = timestamp()
  return task
}

export function setNextActions(task: XyaiTask, actions: readonly string[]): XyaiTask {
  task.nextActions.splice(0, task.nextActions.length, ...cleanStrings(actions))
  task.updatedAt = timestamp()
  return task
}

export function recordTaskEvent(task: XyaiTask, type: string, detail: unknown): XyaiTask {
  const normalizedType = type.trim()
  if (!normalizedType) throw new Error('A task event requires a type.')
  task.events.push({ id: randomUUID(), type: normalizedType, detail, occurredAt: timestamp() })
  task.updatedAt = timestamp()
  return task
}

/**
 * Provider-neutral and bounded by design.  Raw chat/tool histories are not
 * retained or replayed through this contract.
 */
export function buildMinimumHandoff(task: XyaiTask, limits: { maxFacts?: number; maxArtifacts?: number; maxActions?: number; maxEvents?: number } = {}): MinimumHandoff {
  const maxFacts = limits.maxFacts ?? 12
  const maxArtifacts = limits.maxArtifacts ?? 12
  const maxActions = limits.maxActions ?? 8
  const maxEvents = limits.maxEvents ?? 12
  return {
    schemaVersion: 1,
    taskId: task.id,
    title: task.title,
    goal: task.goal,
    constraints: [...task.constraints],
    acceptanceCriteria: [...task.acceptanceCriteria],
    facts: task.facts.slice(-maxFacts),
    artifacts: task.artifacts.slice(-maxArtifacts),
    nextActions: task.nextActions.slice(0, maxActions),
    recentEvents: task.events.slice(-maxEvents).map((event) => ({ ...event, detail: compactEventDetail(event.detail) })),
    generatedAt: timestamp(),
  }
}

/** A small JSON store with atomic replace; it is kept below Electron userData. */
export class TaskLedger {
  private state: TaskLedgerState = { schemaVersion: 1, tasks: [] }

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      this.state = validateState(parsed)
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT') throw new Error(`Unable to load XYAI task ledger: ${error instanceof Error ? error.message : String(error)}`)
      this.state = { schemaVersion: 1, tasks: [] }
    }
  }

  list(): readonly XyaiTask[] { return this.state.tasks.map((task) => structuredClone(task)) }

  findByOrigin(providerId: string, sourceHash: string): XyaiTask | undefined {
    const found = this.state.tasks.find((task) => task.origin?.providerId === providerId && task.origin.sourceHash === sourceHash)
    return found === undefined ? undefined : structuredClone(found)
  }

  findByExternalSource(providerId: string, externalId: string): XyaiTask | undefined {
    const found = this.state.tasks.find((task) => task.origin?.providerId === providerId && task.origin.externalId === externalId)
    return found === undefined ? undefined : structuredClone(found)
  }

  async create(input: CreateTaskInput): Promise<XyaiTask> {
    const task = createTask(input)
    if (this.state.tasks.some((existing) => existing.id === task.id)) throw new Error(`Task id already exists: ${task.id}`)
    this.state.tasks.push(task)
    await this.save()
    return structuredClone(task)
  }

  async mutate(id: string, apply: (task: XyaiTask) => void): Promise<XyaiTask> {
    const task = this.state.tasks.find((candidate) => candidate.id === id)
    if (task === undefined) throw new Error(`Task not found: ${id}`)
    apply(task)
    task.updatedAt = timestamp()
    await this.save()
    return structuredClone(task)
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
  }
}

function cleanStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

function compactEventDetail(detail: unknown): unknown {
  if (detail === undefined || detail === null) return detail
  try {
    const serialized = JSON.stringify(detail)
    return serialized.length <= 4_000 ? detail : { summary: serialized.slice(0, 4_000), truncated: true }
  } catch {
    return { summary: String(detail).slice(0, 4_000), truncated: true }
  }
}

function validateState(value: unknown): TaskLedgerState {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || !('tasks' in value)) throw new Error('Ledger content is not a supported state object.')
  const state = value as { schemaVersion?: unknown; tasks?: unknown }
  if (state.schemaVersion !== 1 || !Array.isArray(state.tasks)) throw new Error('Ledger schema version is not supported.')
  for (const task of state.tasks) {
    if (typeof task !== 'object' || task === null || !('id' in task) || !('title' in task) || !('goal' in task)) throw new Error('Ledger contains an invalid task.')
  }
  return state as TaskLedgerState
}
