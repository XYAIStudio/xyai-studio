/** Durable, provider-neutral production trace.  It tracks work; it does not
 * claim to execute a stage or alter XYOS governance. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { recordTaskEvent, TaskLedger } from './task-ledger.ts'

export const PRODUCTION_LINES = ['knowledge', 'data', 'model', 'capability', 'agent', 'system', 'deployment'] as const
export type ProductionLine = typeof PRODUCTION_LINES[number]
const dependencies: Record<ProductionLine, readonly ProductionLine[]> = { knowledge: [], data: [], model: ['data'], capability: [], agent: ['knowledge', 'capability', 'model'], system: ['agent'], deployment: ['system'] }
export interface ProductionRun { readonly id: string; readonly taskId: string; readonly goal: string; readonly stages: Record<ProductionLine, { status: 'pending' | 'running' | 'completed' | 'blocked'; updatedAt: string; note?: string }>; readonly status: 'ready' | 'running' | 'completed' | 'blocked'; readonly createdAt: string; readonly updatedAt: string }
interface State { readonly schemaVersion: 1; readonly runs: ProductionRun[] }
const stamp = () => new Date().toISOString()
function saveAtomic(path: string, state: State): Promise<void> { return mkdir(dirname(path), { recursive: true }).then(async () => { const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); await rename(temporary, path) }) }

export class ProductionTracker {
  private state: State = { schemaVersion: 1, runs: [] }
  constructor(private readonly path: string, private readonly tasks: TaskLedger) {}
  async load(): Promise<void> { try { const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<State>; if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs)) throw new Error('unsupported production trace'); this.state = { schemaVersion: 1, runs: parsed.runs } } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
  list(): readonly ProductionRun[] { return this.state.runs.map(run => structuredClone(run)) }
  async create(taskId: string, goal: string, requestedLines: readonly ProductionLine[]): Promise<ProductionRun> {
    if (!this.tasks.list().some(task => task.id === taskId)) throw new Error('production run requires an XYAI task')
    const selected = new Set(requestedLines)
    for (const line of selected) for (const dependency of dependencies[line]) selected.add(dependency)
    const createdAt = stamp(); const stages = Object.fromEntries(PRODUCTION_LINES.map(line => [line, { status: selected.has(line) ? 'pending' : 'blocked', updatedAt: createdAt, ...(selected.has(line) ? {} : { note: 'not-selected' }) }])) as ProductionRun['stages']
    const run: ProductionRun = { id: `production-${randomUUID()}`, taskId, goal: goal.trim().slice(0, 2000), stages, status: 'ready', createdAt, updatedAt: createdAt }
    this.state = { schemaVersion: 1, runs: [...this.state.runs, run] }; await saveAtomic(this.path, this.state)
    await this.tasks.mutate(taskId, task => recordTaskEvent(task, 'production-run-created', { runId: run.id, lines: [...selected] }))
    return structuredClone(run)
  }
  async updateStage(runId: string, line: ProductionLine, status: 'running' | 'completed', note = ''): Promise<ProductionRun> {
    const current = this.state.runs.find(run => run.id === runId); if (!current) throw new Error('production run not found')
    const stage = current.stages[line]; if (stage.status === 'blocked') throw new Error('production line was not selected')
    if (status === 'running' && dependencies[line].some(dep => current.stages[dep].status !== 'completed')) throw new Error('production dependencies are incomplete')
    const updatedAt = stamp(); const stages = { ...current.stages, [line]: { status, updatedAt, ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}) } }
    const allCompleted = PRODUCTION_LINES.filter(item => stages[item].status !== 'blocked').every(item => stages[item].status === 'completed')
    const run: ProductionRun = { ...current, stages, status: allCompleted ? 'completed' : 'running', updatedAt }
    this.state = { schemaVersion: 1, runs: this.state.runs.map(item => item.id === runId ? run : item) }; await saveAtomic(this.path, this.state)
    await this.tasks.mutate(run.taskId, task => recordTaskEvent(task, 'production-stage-updated', { runId, line, status }))
    return structuredClone(run)
  }
}
