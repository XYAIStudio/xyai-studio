import { describe, expect, it, vi } from 'vitest'
import { AGENT_TEAMS_UNAVAILABLE, AiTeamBackend } from '../src/index.ts'
import type { AiTeamAnswer, EmployeeLibrary, TeamOutcome } from '../src/protocol.ts'

function bench() {
  let section: { revision?: number; employeesJson?: string; outcomesJson?: string } = {}
  const replace = vi.fn(async (next: object) => { section = next })
  const update = vi.fn(async (next: object) => { section = { ...section, ...next } })
  const lead = { id: 'lead' }
  const members = [{ id: 'lead', name: 'Lead', role: 'lead', status: 'idle', diagnostics: [] }]
  const spawnTeammate = vi.fn(async (_agent, request) => ({ member: { id: request.name, name: request.name, role: 'teammate', status: 'idle', diagnostics: [] } }))
  const sendMessage = vi.fn(async () => ({ messageId: 'm1', status: 'accepted' }))
  const createTask = vi.fn(async (_agent, request) => ({ id: '1', revision: 1, status: 'pending', blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [], ...request }))
  const updateTask = vi.fn(async (_agent, request) => ({ id: request.taskId, revision: request.expectedRevision + 1, status: request.action === 'complete' ? 'completed' : 'pending', subject: 'Ship', description: 'Pass gates', blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [] }))
  const ctx = {
    settings: { register: vi.fn(() => ({ get: () => section, replace, update })) },
    agents: { get: vi.fn((id: string) => id === 'lead' ? lead : undefined) },
    agentTeams: { listMembers: vi.fn(() => members), listTasks: vi.fn(() => []), spawnTeammate, sendMessage, createTask, updateTask },
  }
  return { backend: new AiTeamBackend(ctx as never), replace, update, spawnTeammate, sendMessage, createTask, updateTask }
}

async function value<T>(promise: ReturnType<AiTeamBackend['dispatch']>): Promise<T> {
  const wire = await promise
  expect(wire.ok).toBe(true)
  if (!wire.ok) throw new Error(wire.error.message)
  const answer = wire.value as AiTeamAnswer<T>
  expect(answer.ok).toBe(true)
  if (!answer.ok) throw new Error(answer.error.message)
  return answer.value
}

describe('AiTeamBackend', () => {
  it('persists draft and publish transitions with document revisions', async () => {
    const b = bench()
    const initial = await value<EmployeeLibrary>(b.backend.dispatch('employees/list', null))
    expect(initial.employees).toHaveLength(6)
    const settings = { ...initial.employees[0]!.published, instructions: 'Deliver reviewed architecture.' }
    const drafted = await value<EmployeeLibrary>(b.backend.dispatch('employees/save-draft', { employeeId: 'architect', expectedRevision: 0, settings }))
    expect(drafted.revision).toBe(1)
    expect(drafted.employees[0]!.draft?.instructions).toBe(settings.instructions)
    const published = await value<EmployeeLibrary>(b.backend.dispatch('employees/publish', { employeeId: 'architect', expectedRevision: 1 }))
    expect(published.revision).toBe(2)
    expect(published.employees[0]!.published.instructions).toBe(settings.instructions)
    expect(published.employees[0]!.draft).toBeUndefined()
    expect(b.update).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale employee write without replacing settings', async () => {
    const b = bench()
    const initial = await value<EmployeeLibrary>(b.backend.dispatch('employees/list', null))
    const wire = await b.backend.dispatch('employees/save-draft', { employeeId: 'architect', expectedRevision: 9, settings: initial.employees[0]!.published })
    expect(wire.ok && (wire.value as AiTeamAnswer).ok).toBe(false)
    expect(b.update).not.toHaveBeenCalled()
  })

  it('spawns selected employees through DSH and sends durable peer messages', async () => {
    const b = bench()
    const started = await value<{ started: string[] }>(b.backend.dispatch('team/start', { sessionId: 'lead', employeeIds: ['architect', 'qa'], context: 'fork' }))
    expect(started.started).toEqual(['architect', 'qa'])
    expect(b.spawnTeammate).toHaveBeenCalledTimes(2)
    expect(b.spawnTeammate.mock.calls[0]![1]).toMatchObject({ name: 'architect', context: 'fork', provider: 'fork' })
    expect(b.spawnTeammate.mock.calls[0]![1].prompt[0].text).toContain('XYAI 架构师')
    await value(b.backend.dispatch('team/send', { sessionId: 'lead', target: 'architect', message: '审查接口' }))
    expect(b.sendMessage.mock.calls[0]![1]).toMatchObject({ target: 'architect', content: [{ type: 'text', text: '审查接口' }] })
  })

  it('creates and mutates shared DSH team tasks', async () => {
    const b = bench()
    await value(b.backend.dispatch('tasks/create', { sessionId: 'lead', subject: 'Ship', description: 'Pass gates', writeScopes: ['packages-xyai'] }))
    await value(b.backend.dispatch('tasks/update', { sessionId: 'lead', taskId: '1', expectedRevision: 1, action: 'complete' }))
    expect(b.createTask).toHaveBeenCalledOnce()
    expect(b.updateTask).toHaveBeenCalledWith(expect.anything(), { taskId: '1', expectedRevision: 1, action: 'complete' })
  })

  it('binds one persistent Session per employee', async () => {
    const b = bench()
    expect(await value(b.backend.dispatch('chats/single-get', { employeeId: 'architect' }))).toEqual({ sessionId: null })
    expect(await value(b.backend.dispatch('chats/single-bind', { employeeId: 'architect', sessionId: 'one' }))).toEqual({ sessionId: 'one' })
    expect(await value(b.backend.dispatch('chats/single-bind', { employeeId: 'architect', sessionId: 'two' }))).toEqual({ sessionId: 'one' })
  })

  it('persists revisable outcomes and rejects stale acceptance', async () => {
    const b = bench()
    const created = await value<TeamOutcome>(b.backend.dispatch('outcomes/create', { sessionId: 'lead', title: '架构评审', content: '接口与验收已审查' }))
    expect(created).toMatchObject({ sessionId: 'lead', revision: 1, status: 'draft', sync: 'not_requested' })
    const returned = await value<TeamOutcome>(b.backend.dispatch('outcomes/update', { sessionId: 'lead', outcomeId: created.id, expectedRevision: 1, action: 'return' }))
    expect(returned).toMatchObject({ revision: 2, status: 'returned' })
    const revised = await value<TeamOutcome>(b.backend.dispatch('outcomes/update', { sessionId: 'lead', outcomeId: created.id, expectedRevision: 2, action: 'edit', title: '架构评审修订稿', content: '补充风险清单' }))
    expect(revised).toMatchObject({ revision: 3, status: 'draft', title: '架构评审修订稿' })
    const stale = await b.backend.dispatch('outcomes/update', { sessionId: 'lead', outcomeId: created.id, expectedRevision: 2, action: 'accept' })
    expect(stale.ok && (stale.value as AiTeamAnswer).ok).toBe(false)
    const accepted = await value<TeamOutcome>(b.backend.dispatch('outcomes/update', { sessionId: 'lead', outcomeId: created.id, expectedRevision: 3, action: 'accept' }))
    expect(accepted).toMatchObject({ revision: 4, status: 'accepted' })
    expect(await value<TeamOutcome[]>(b.backend.dispatch('outcomes/list', { sessionId: 'lead' }))).toEqual([accepted])
  })

  it('serves the employee library without Agent Teams and refuses team operations', async () => {
    let section: { revision?: number; employeesJson?: string; outcomesJson?: string } = {}
    const lead = { id: 'lead' }
    const backend = new AiTeamBackend({
      settings: { register: vi.fn(() => ({ get: () => section, replace: vi.fn(), update: vi.fn(async (next: object) => { section = { ...section, ...next } }) })) },
      agents: { get: vi.fn((id: string) => id === 'lead' ? lead : undefined) },
    } as never)
    const library = await value<EmployeeLibrary>(backend.dispatch('employees/list', null))
    expect(library.employees).toHaveLength(6)
    const started = await backend.dispatch('team/start', { sessionId: 'lead', employeeIds: ['architect'], context: 'fork' })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error.message)
    const answer = started.value as AiTeamAnswer
    expect(answer.ok).toBe(false)
    if (answer.ok) throw new Error('expected refusal')
    expect(answer.error.message).toBe(AGENT_TEAMS_UNAVAILABLE)
  })
})
