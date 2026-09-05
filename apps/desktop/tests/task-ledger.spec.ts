import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverTasksInSelectedRoot, importExternalTask } from '../src/xyai-core/external-task-import.ts'
import { addTaskFact, buildMinimumHandoff, TaskLedger } from '../src/xyai-core/task-ledger.ts'
import { DevelopmentSessionRegistry } from '../src/xyai-core/development-session.ts'
import { KnowledgeAssetStore } from '../src/xyai-core/knowledge-asset-store.ts'
import { McpReviewRegistry } from '../src/xyai-core/mcp-review-registry.ts'
import { ProductionTracker } from '../src/xyai-core/production-tracker.ts'
import { redactDiagnosticText, sanitizeDiagnosticUrl } from '../src/diagnostics.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'xyai-ledger-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })))
})

describe('XYAI task ledger', () => {
  it('keeps desktop diagnostics useful without storing tokens or data-url content', () => {
    expect(sanitizeDiagnosticUrl('http://127.0.0.1:4100/?token=secret-value#fragment')).toBe('http://127.0.0.1:4100/')
    expect(sanitizeDiagnosticUrl('data:text/html,secret-page')).toBe('<data-url>')
    expect(redactDiagnosticText('request?apiKey=private-value&x=1')).toContain('apiKey=[redacted]')
  })

  it('persists local work atomically and builds bounded provider-neutral handoff', async () => {
    const directory = await temporaryDirectory()
    const ledgerPath = join(directory, 'runtime', 'xyai', 'task-ledger.json')
    const ledger = new TaskLedger(ledgerPath)
    await ledger.load()
    const task = await ledger.create({ projectId: 'demo', title: '整理资料', goal: '建立可恢复的本地任务' })
    await ledger.mutate(task.id, (mutable) => {
      addTaskFact(mutable, { statement: '用户已确认资料范围。', source: 'user' })
      for (let index = 0; index < 16; index += 1) mutable.events.push({ id: `event-${index}`, type: 'progress', detail: { index }, occurredAt: '2026-09-01T00:00:00.000Z' })
    })

    const restored = new TaskLedger(ledgerPath)
    await restored.load()
    const saved = restored.list()[0]
    expect(saved?.facts[0]?.statement).toBe('用户已确认资料范围。')
    expect(buildMinimumHandoff(saved!, { maxEvents: 3 }).recentEvents).toHaveLength(3)
    expect(await readFile(ledgerPath, 'utf8')).toContain('"schemaVersion": 1')
  })

  it('only imports from an explicit selected root, deduplicates, and survives source deletion', async () => {
    const directory = await temporaryDirectory()
    const sourceRoot = join(directory, 'chosen-source')
    const sourceFile = join(sourceRoot, 'sessions', 'task.jsonl')
    await mkdir(join(sourceRoot, 'sessions'), { recursive: true })
    await writeFile(sourceFile, '{"role":"user","content":"把外部项目整理为本地任务"}\n{"title":"迁移外部项目"}\n', { encoding: 'utf8', flag: 'w' })
    const candidates = await discoverTasksInSelectedRoot({ providerId: 'codex', providerLabel: 'Codex', root: sourceRoot })
    expect(candidates).toHaveLength(1)

    const ledger = new TaskLedger(join(directory, 'runtime', 'xyai', 'task-ledger.json'))
    await ledger.load()
    const first = await importExternalTask(ledger, candidates[0]!)
    const repeat = await importExternalTask(ledger, candidates[0]!)
    expect(first.imported).toBe(true)
    expect(repeat.imported).toBe(false)
    await writeFile(sourceFile, '{"role":"user","content":"把外部项目整理为本地任务，并增加交接说明"}\n{"title":"迁移外部项目"}\n', 'utf8')
    const updatedCandidates = await discoverTasksInSelectedRoot({ providerId: 'codex', providerLabel: 'Codex', root: sourceRoot })
    const update = await importExternalTask(ledger, updatedCandidates[0]!)
    expect(update.updated).toBe(true)
    expect(ledger.list()).toHaveLength(1)
    await rm(sourceRoot, { recursive: true, force: true })

    const restored = new TaskLedger(join(directory, 'runtime', 'xyai', 'task-ledger.json'))
    await restored.load()
    const imported = restored.list()[0]
    expect(imported?.title).toBe('迁移外部项目')
    expect(imported?.events).toHaveLength(2)
    expect(imported?.events[0]?.detail).toMatchObject({ rawChatCopied: false })
  })

  it('keeps an XYAI handoff when a development runtime is switched or restarted', async () => {
    const directory = await temporaryDirectory()
    const ledger = new TaskLedger(join(directory, 'runtime', 'xyai', 'task-ledger.json'))
    await ledger.load()
    const task = await ledger.create({ projectId: 'demo', title: '会话恢复', goal: '不依赖某个 Harness 的私有历史' })
    await ledger.mutate(task.id, (mutable) => addTaskFact(mutable, { statement: '交接摘要只包含确认事实。', source: 'test' }))
    const sessionsPath = join(directory, 'runtime', 'xyai', 'development-sessions.json')
    const sessions = new DevelopmentSessionRegistry(sessionsPath, ledger)
    await sessions.load()
    const created = await sessions.create({ taskId: task.id, title: 'DSH 开发会话' })
    await sessions.bindDshSession(created.id, 'dsh-session-1')
    const switched = await sessions.switchRuntime(created.id, 'local-model')
    expect(switched.handoff.facts[0]?.statement).toBe('交接摘要只包含确认事实。')
    const restored = new DevelopmentSessionRegistry(sessionsPath, ledger)
    await restored.load()
    expect(restored.list()[0]).toMatchObject({ runtimeId: 'local-model', dshSessionId: 'dsh-session-1' })
    expect(restored.list()[0]?.handoffs).toHaveLength(1)
  })

  it('copies explicitly selected knowledge into XYAI storage without retaining a source dependency', async () => {
    const directory = await temporaryDirectory()
    const sourceDirectory = join(directory, 'chosen-knowledge')
    const sourceFile = join(sourceDirectory, 'notes', 'brief.md')
    await mkdir(dirname(sourceFile), { recursive: true })
    await writeFile(sourceFile, '只保留到 XYAI 受控资产中', 'utf8')
    const runtimeDirectory = join(directory, 'runtime', 'xyai')
    const store = new KnowledgeAssetStore(join(runtimeDirectory, 'knowledge-assets.json'), join(runtimeDirectory, 'knowledge-content'))
    const asset = await store.importSelected(sourceDirectory)
    expect(asset.files).toHaveLength(1)
    expect(asset.files[0]?.path).toBe('notes/brief.md')
    await rm(sourceDirectory, { recursive: true, force: true })
    const restored = new KnowledgeAssetStore(join(runtimeDirectory, 'knowledge-assets.json'), join(runtimeDirectory, 'knowledge-content'))
    await restored.load()
    const saved = restored.list()[0]
    expect(saved?.name).toBe('chosen-knowledge')
    expect(JSON.stringify(saved)).not.toContain(sourceDirectory)
    expect(await readFile(join(runtimeDirectory, 'knowledge-content', asset.id, 'files', 'notes', 'brief.md'), 'utf8')).toBe('只保留到 XYAI 受控资产中')
  })

  it('keeps MCP metadata inert until an explicit recorded review', async () => {
    const directory = await temporaryDirectory()
    const registry = new McpReviewRegistry(join(directory, 'runtime', 'xyai', 'mcp-review.json'))
    await registry.load()
    const registered = await registry.register({ name: '本地文档工具', command: 'mcp-docs', args: ['--stdio'], credentialNames: ['DOCS_TOKEN'] })
    expect(registered.status).toBe('pending-review')
    const reviewed = await registry.review(registered.id, { reviewer: 'admin', approved: true, note: '本机审查通过' })
    expect(reviewed.status).toBe('approved')
    expect(JSON.stringify(reviewed)).not.toContain('DOCS_TOKEN=')
  })

  it('binds production tracking to a task and enforces stage dependencies', async () => {
    const directory = await temporaryDirectory()
    const ledger = new TaskLedger(join(directory, 'runtime', 'xyai', 'task-ledger.json'))
    await ledger.load()
    const task = await ledger.create({ projectId: 'demo', title: '生产追踪', goal: '记录可恢复的生产阶段' })
    const tracker = new ProductionTracker(join(directory, 'runtime', 'xyai', 'production-runs.json'), ledger)
    await tracker.load()
    const run = await tracker.create(task.id, '构建交付物', ['data', 'model'])
    await expect(tracker.updateStage(run.id, 'model', 'running')).rejects.toThrow('dependencies')
    await tracker.updateStage(run.id, 'data', 'running')
    await tracker.updateStage(run.id, 'data', 'completed')
    const updated = await tracker.updateStage(run.id, 'model', 'running')
    expect(updated.stages.model.status).toBe('running')
    expect(ledger.list()[0]?.events.some(event => event.type === 'production-stage-updated')).toBe(true)
  })
})
