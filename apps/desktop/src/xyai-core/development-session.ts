/** Durable development-session registry. DSH sessions are an execution detail;
 * this registry keeps the XYAI task relationship and handoff trail local. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { buildMinimumHandoff, recordTaskEvent, type MinimumHandoff, TaskLedger } from './task-ledger.ts'

export type DevelopmentSessionState = 'active' | 'paused' | 'blocked' | 'completed'
export interface DevelopmentSession {
  readonly id: string
  readonly taskId: string
  title: string
  runtimeId: string
  dshSessionId?: string
  state: DevelopmentSessionState
  readonly createdAt: string
  updatedAt: string
  readonly handoffs: Array<{ readonly id: string; readonly fromRuntime: string; readonly toRuntime: string; readonly at: string; readonly handoff: MinimumHandoff }>
}
interface State { readonly schemaVersion: 1; readonly sessions: DevelopmentSession[] }
const now = (): string => new Date().toISOString()

export class DevelopmentSessionRegistry {
  private state: State = { schemaVersion: 1, sessions: [] }
  constructor(private readonly filePath: string, private readonly ledger: TaskLedger) {}
  async load(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || !('sessions' in value)) throw new Error('invalid session registry')
      const parsed = value as { schemaVersion?: unknown; sessions?: unknown }
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sessions)) throw new Error('unsupported session registry schema')
      this.state = parsed as State
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT') throw error
    }
  }
  list(): readonly DevelopmentSession[] { return this.state.sessions.map((session) => structuredClone(session)) }
  async create(input: { taskId: string; title: string; runtimeId?: string }): Promise<DevelopmentSession> {
    if (!this.ledger.list().some((task) => task.id === input.taskId)) throw new Error(`Cannot create a session for unknown task: ${input.taskId}`)
    const title = input.title.trim()
    if (!title) throw new Error('Development session requires a title.')
    const createdAt = now()
    const session: DevelopmentSession = { id: randomUUID(), taskId: input.taskId, title, runtimeId: input.runtimeId?.trim() || 'dsh', state: 'active', createdAt, updatedAt: createdAt, handoffs: [] }
    this.state.sessions.push(session)
    await this.ledger.mutate(input.taskId, (task) => recordTaskEvent(task, 'development-session-created', { sessionId: session.id, runtimeId: session.runtimeId }))
    await this.save()
    return structuredClone(session)
  }
  async bindDshSession(id: string, dshSessionId: string): Promise<DevelopmentSession> {
    return await this.mutate(id, (session) => { session.dshSessionId = requireText(dshSessionId, 'DSH session id') })
  }
  async setState(id: string, state: DevelopmentSessionState): Promise<DevelopmentSession> {
    return await this.mutate(id, (session) => { session.state = state })
  }
  async switchRuntime(id: string, runtimeId: string): Promise<{ session: DevelopmentSession; handoff: MinimumHandoff }> {
    const target = requireText(runtimeId, 'runtime id')
    const found = this.require(id)
    if (found.runtimeId === target) return { session: structuredClone(found), handoff: this.handoffFor(found.taskId) }
    const handoff = this.handoffFor(found.taskId)
    const fromRuntime = found.runtimeId
    const session = await this.mutate(id, (mutable) => {
      mutable.runtimeId = target
      mutable.handoffs.push({ id: randomUUID(), fromRuntime, toRuntime: target, at: now(), handoff })
    })
    await this.ledger.mutate(found.taskId, (task) => recordTaskEvent(task, 'development-session-runtime-switched', { sessionId: id, fromRuntime, toRuntime: target, factCount: handoff.facts.length, artifactCount: handoff.artifacts.length }))
    return { session, handoff }
  }
  private handoffFor(taskId: string): MinimumHandoff {
    const task = this.ledger.list().find((item) => item.id === taskId)
    if (task === undefined) throw new Error(`Task not found for session: ${taskId}`)
    return buildMinimumHandoff(task)
  }
  private require(id: string): DevelopmentSession { const found = this.state.sessions.find((session) => session.id === id); if (!found) throw new Error(`Development session not found: ${id}`); return found }
  private async mutate(id: string, apply: (session: DevelopmentSession) => void): Promise<DevelopmentSession> { const session = this.require(id); apply(session); session.updatedAt = now(); await this.save(); return structuredClone(session) }
  private async save(): Promise<void> { await mkdir(dirname(this.filePath), { recursive: true }); const temporary = `${this.filePath}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8'); await rename(temporary, this.filePath) }
}
function requireText(value: string, label: string): string { const text = value.trim(); if (!text) throw new Error(`${label} is required.`); return text }
