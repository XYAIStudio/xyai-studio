/** XYAI AI Team Host adapter over DSH Agent Teams and durable settings. */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import type { TeamTaskId, UpdateTeamTaskRequest } from '@deepseek-ai/dsh-experimental-agent-team'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  AI_TEAM_CHANNEL,
  type AiTeamAnswer,
  type EmployeeLibrary,
  type EmployeeRecord,
  type EmployeeSettings,
  type TeamOutcome,
  type TeamStartResult,
} from './protocol.ts'

const MAX_DOCUMENT_BYTES = 1_000_000
const MAX_EMPLOYEES_PER_TEAM = 6
const MAX_OUTCOMES = 200

const defaults = (instructions: string, knowledge: string[], tools: string[]): EmployeeSettings => ({
  instructions,
  memory: '',
  skills: [],
  routines: [],
  integrations: [],
  knowledge,
  tools,
})

/** Built-in employee library available before the operator creates custom roles. */
export const DEFAULT_EMPLOYEES: readonly EmployeeRecord[] = [
  { id: 'architect', name: '架构师', category: '研发', description: '拆解系统、审查接口并控制技术风险', source: 'builtin', revision: 1, published: defaults('你是 XYAI 架构师。先明确验收标准，再拆解系统、审查接口、记录风险，并产出可执行设计。', ['系统架构', 'DSH 插件'], ['filesystem', 'shell']) },
  { id: 'fullstack', name: '全站全能开发大师', category: '研发', description: '实现前后端功能并完成验证', source: 'builtin', revision: 1, published: defaults('你是 XYAI 全站开发负责人。根据任务实现真实可运行功能，完成必要测试，并清楚报告验证证据。', ['Web', 'Electron', 'Node.js'], ['filesystem', 'shell', 'browser']) },
  { id: 'product', name: '产品经理', category: '产品', description: '澄清目标、流程与验收条件', source: 'builtin', revision: 1, published: defaults('你是 XYAI 产品经理。把目标转成逐步用户流程、边界条件和可验证验收项。', ['产品规划', '交互流程'], ['filesystem']) },
  { id: 'qa', name: '质量审计员', category: '质量', description: '设计回归、审计证据并阻断虚假完成', source: 'builtin', revision: 1, published: defaults('你是 XYAI 质量审计员。按风险设计测试，复核实际运行证据，对未验证能力明确判定。', ['测试', '发布门禁'], ['filesystem', 'shell', 'browser']) },
  { id: 'operations', name: '运营增长官', category: '运营', description: '规划内容、渠道和增长实验', source: 'builtin', revision: 1, published: defaults('你是 XYAI 运营增长官。制定可衡量的内容、渠道和增长实验，并跟踪结果。', ['运营', '增长'], ['web']) },
  { id: 'research', name: '研究分析师', category: '研究', description: '检索资料、交叉验证并形成结论', source: 'builtin', revision: 1, published: defaults('你是 XYAI 研究分析师。优先使用一手资料，区分事实和推断，并给出可追溯证据。', ['研究', '信息检索'], ['web', 'filesystem']) },
]

interface AiTeamSection {
  revision?: number
  employeesJson?: string
  singleChatsJson?: string
  outcomesJson?: string
}

const sectionSchema: z<AiTeamSection> = z.object({
  revision: z.natural().default(0),
  employeesJson: z.string().max(MAX_DOCUMENT_BYTES).default(''),
  singleChatsJson: z.string().max(MAX_DOCUMENT_BYTES).default('{}'),
  outcomesJson: z.string().max(MAX_DOCUMENT_BYTES).default('[]'),
})

function fieldsOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requiredString(fields: Record<string, unknown>, key: string, max = 20_000): string {
  const value = fields[key]
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`invalid ${key}`)
  return value.trim()
}

function strings(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length > 64 || value.some(item => typeof item !== 'string' || item.length > 200)) {
    throw new Error(`invalid ${key}`)
  }
  return [...new Set(value.map(item => item.trim()).filter(Boolean))]
}

function parseSettings(value: unknown): EmployeeSettings {
  const fields = fieldsOf(value)
  return {
    instructions: requiredString(fields, 'instructions'),
    memory: typeof fields.memory === 'string' && fields.memory.length <= 20_000 ? fields.memory : '',
    skills: strings(fields.skills, 'skills'),
    routines: strings(fields.routines, 'routines'),
    integrations: strings(fields.integrations, 'integrations'),
    knowledge: strings(fields.knowledge, 'knowledge'),
    tools: strings(fields.tools, 'tools'),
  }
}

function parseOutcomes(json: string): TeamOutcome[] {
  const decoded: unknown = JSON.parse(json)
  if (!Array.isArray(decoded) || decoded.length > MAX_OUTCOMES) throw new Error('invalid outcome document')
  return decoded.map(value => {
    const fields = fieldsOf(value)
    const status = fields.status
    if (status !== 'draft' && status !== 'returned' && status !== 'accepted') throw new Error('invalid outcome status')
    return {
      id: requiredString(fields, 'id', 100), sessionId: requiredString(fields, 'sessionId', 200),
      revision: typeof fields.revision === 'number' && Number.isSafeInteger(fields.revision) && fields.revision > 0 ? fields.revision : 1,
      title: requiredString(fields, 'title', 200), content: requiredString(fields, 'content', 20_000), status,
      sync: 'not_requested', ...(typeof fields.receipt === 'string' ? { receipt: fields.receipt } : {}),
    }
  })
}

function cloneDefaults(): EmployeeRecord[] {
  return DEFAULT_EMPLOYEES.map(employee => ({ ...employee, published: { ...employee.published, skills: [...employee.published.skills], routines: [], integrations: [], knowledge: [...employee.published.knowledge], tools: [...employee.published.tools] } }))
}

function parseEmployees(json: string): EmployeeRecord[] {
  if (json === '') return cloneDefaults()
  const decoded: unknown = JSON.parse(json)
  if (!Array.isArray(decoded) || decoded.length > 200) throw new Error('invalid employee document')
  return decoded.map((value) => {
    const fields = fieldsOf(value)
    const source = fields.source
    if (source !== 'builtin' && source !== 'local' && source !== 'market') throw new Error('invalid employee source')
    return {
      id: requiredString(fields, 'id', 80),
      name: requiredString(fields, 'name', 80),
      category: requiredString(fields, 'category', 80),
      description: requiredString(fields, 'description', 500),
      source,
      revision: typeof fields.revision === 'number' && Number.isSafeInteger(fields.revision) && fields.revision > 0 ? fields.revision : 1,
      published: parseSettings(fields.published),
      ...(fields.draft === undefined ? {} : { draft: parseSettings(fields.draft) }),
    }
  })
}

function successful<T>(value: T): ConnectionRpcResult<AiTeamAnswer<T>> {
  return { ok: true, value: { ok: true, value } }
}

function refused(code: string, message: string): ConnectionRpcResult<AiTeamAnswer> {
  return { ok: true, value: { ok: false, error: { code, message } } }
}

/** Host owner for employee configuration and DSH Agent Team operations. */
export class AiTeamBackend {
  private readonly section: SettingsScope<AiTeamSection>
  private writes: Promise<void> = Promise.resolve()

  /** @param ctx - Host context providing settings, live agents, and Agent Teams. */
  constructor(private readonly ctx: Context) {
    this.section = ctx.settings.register('xyai-ai-team', sectionSchema)
  }

  /** Dispatch one validated browser request. */
  async dispatch(endpoint: string, payload: unknown): Promise<ConnectionRpcResult<AiTeamAnswer>> {
    try {
      switch (endpoint) {
        case 'employees/list': return successful(this.library())
        case 'employees/save-draft': return successful(await this.mutateEmployee(payload, 'draft'))
        case 'employees/discard-draft': return successful(await this.mutateEmployee(payload, 'discard'))
        case 'employees/publish': return successful(await this.mutateEmployee(payload, 'publish'))
        case 'chats/single-get': return successful(this.singleChat(payload))
        case 'chats/single-bind': return successful(await this.bindSingleChat(payload))
        case 'team/view': return successful(this.teamView(payload))
        case 'team/start': return successful(await this.start(payload))
        case 'team/send': return successful(await this.send(payload))
        case 'tasks/create': return successful(await this.createTask(payload))
        case 'tasks/update': return successful(await this.updateTask(payload))
        case 'outcomes/list': return successful(this.outcomes(payload))
        case 'outcomes/create': return successful(await this.createOutcome(payload))
        case 'outcomes/update': return successful(await this.updateOutcome(payload))
        default: return refused('ai-team/unknown-endpoint', `unknown AI Team endpoint ${JSON.stringify(endpoint)}`)
      }
    } catch (error) {
      return refused('ai-team/rejected', error instanceof Error ? error.message : String(error))
    }
  }

  private library(): EmployeeLibrary {
    const section = this.section.get()
    return { revision: section.revision ?? 0, employees: parseEmployees(section.employeesJson ?? '') }
  }

  private async mutateEmployee(payload: unknown, action: 'draft' | 'discard' | 'publish'): Promise<EmployeeLibrary> {
    let answer: EmployeeLibrary | undefined
    let failure: unknown
    const run = async (): Promise<void> => {
      try {
        const fields = fieldsOf(payload)
        const expectedRevision = fields.expectedRevision
        const current = this.library()
        if (expectedRevision !== current.revision) throw new Error(`employee library changed: expected ${String(expectedRevision)}, current ${current.revision}`)
        const id = requiredString(fields, 'employeeId', 80)
        const index = current.employees.findIndex(employee => employee.id === id)
        if (index < 0) throw new Error(`unknown employee ${JSON.stringify(id)}`)
        const employee = current.employees[index]!
        const withoutDraft = (): EmployeeRecord => {
          const { draft: _draft, ...published } = employee
          return action === 'publish' && employee.draft !== undefined
            ? { ...published, revision: employee.revision + 1, published: employee.draft }
            : published
        }
        const next: EmployeeRecord = action === 'draft'
          ? { ...employee, draft: parseSettings(fields.settings) }
          : withoutDraft()
        current.employees[index] = next
        answer = { revision: current.revision + 1, employees: current.employees }
        await this.section.update({ revision: answer.revision, employeesJson: JSON.stringify(answer.employees) })
      } catch (error) { failure = error }
    }
    this.writes = this.writes.then(run, run)
    await this.writes
    if (failure !== undefined) throw failure
    return answer!
  }

  private agent(payload: unknown): Agent {
    const id = requiredString(fieldsOf(payload), 'sessionId', 200)
    // `sessionId` was validated at this wire boundary; branding adds no runtime conversion.
    const agent = this.ctx.agents.get(id as SessionId)
    if (agent === undefined) throw new Error(`session ${JSON.stringify(id)} has no live agent`)
    return agent
  }

  private singleChat(payload: unknown): { sessionId: string | null } {
    const employeeId = requiredString(fieldsOf(payload), 'employeeId', 80)
    const chats = fieldsOf(JSON.parse(this.section.get().singleChatsJson ?? '{}'))
    return { sessionId: typeof chats[employeeId] === 'string' ? chats[employeeId] : null }
  }

  private async bindSingleChat(payload: unknown): Promise<{ sessionId: string }> {
    const fields = fieldsOf(payload)
    const employeeId = requiredString(fields, 'employeeId', 80)
    const sessionId = requiredString(fields, 'sessionId', 200)
    let answer: string | undefined
    let failure: unknown
    const run = async (): Promise<void> => {
      try {
        const chats = fieldsOf(JSON.parse(this.section.get().singleChatsJson ?? '{}'))
        answer = typeof chats[employeeId] === 'string' ? chats[employeeId] : sessionId
        if (chats[employeeId] === undefined) {
          await this.section.update({ singleChatsJson: JSON.stringify({ ...chats, [employeeId]: sessionId }) })
        }
      } catch (error) { failure = error }
    }
    this.writes = this.writes.then(run, run)
    await this.writes
    if (failure !== undefined) throw failure
    return { sessionId: answer! }
  }

  private teamView(payload: unknown) {
    const agent = this.agent(payload)
    return { members: this.ctx.agentTeams.listMembers(agent), tasks: this.ctx.agentTeams.listTasks(agent) }
  }

  private async start(payload: unknown): Promise<TeamStartResult> {
    const fields = fieldsOf(payload)
    const agent = this.agent(payload)
    const ids = strings(fields.employeeIds, 'employeeIds')
    if (ids.length < 1 || ids.length > MAX_EMPLOYEES_PER_TEAM) throw new Error('select between 1 and 6 employees')
    const context = fields.context === 'fork' ? 'fork' : 'fresh'
    const library = this.library()
    const byId = new Map(library.employees.map(employee => [employee.id, employee]))
    const existingNames = new Set(this.ctx.agentTeams.listMembers(agent).map(member => member.name))
    const result: TeamStartResult = { started: [], existing: [], failed: [] }
    for (const id of ids) {
      const employee = byId.get(id)
      if (employee === undefined) { result.failed.push({ employeeId: id, message: 'employee not found' }); continue }
      if (existingNames.has(employee.id)) { result.existing.push(id); continue }
      const settings = employee.published
      const prompt = [settings.instructions, settings.memory && `项目记忆：\n${settings.memory}`, settings.skills.length > 0 && `优先技能：${settings.skills.join('、')}`, settings.routines.length > 0 && `例行职责：${settings.routines.join('；')}`, settings.integrations.length > 0 && `可用集成：${settings.integrations.join('、')}`].filter(Boolean).join('\n\n')
      try {
        await this.ctx.agentTeams.spawnTeammate(agent, { name: employee.id, description: employee.description, prompt: [{ type: 'text', text: prompt }], context, provider: context === 'fork' ? 'fork' : 'spawn', signal: AbortSignal.timeout(60_000) })
        result.started.push(id); existingNames.add(employee.id)
      } catch (error) { result.failed.push({ employeeId: id, message: error instanceof Error ? error.message : String(error) }) }
    }
    return result
  }

  private async send(payload: unknown) {
    const fields = fieldsOf(payload)
    return await this.ctx.agentTeams.sendMessage(this.agent(payload), { target: requiredString(fields, 'target', 80), content: [{ type: 'text', text: requiredString(fields, 'message', 65_000) }], signal: AbortSignal.timeout(30_000) })
  }

  private async createTask(payload: unknown) {
    const fields = fieldsOf(payload)
    return await this.ctx.agentTeams.createTask(this.agent(payload), { subject: requiredString(fields, 'subject', 200), description: requiredString(fields, 'description', 4_000), writeScopes: strings(fields.writeScopes ?? [], 'writeScopes') })
  }

  private async updateTask(payload: unknown) {
    const fields = fieldsOf(payload)
    const action = fields.action
    const allowed = ['claim', 'release', 'edit', 'complete', 'reopen', 'delete'] as const
    if (typeof action !== 'string' || !allowed.includes(action as typeof allowed[number])) throw new Error('invalid task action')
    const request: UpdateTeamTaskRequest = {
      taskId: requiredString(fields, 'taskId', 100) as TeamTaskId,
      expectedRevision: typeof fields.expectedRevision === 'number' ? fields.expectedRevision : -1,
      action: action as typeof allowed[number],
      ...(action === 'edit' ? { subject: requiredString(fields, 'subject', 200), description: requiredString(fields, 'description', 4_000) } : {}),
    }
    return await this.ctx.agentTeams.updateTask(this.agent(payload), request)
  }

  private outcomes(payload: unknown): TeamOutcome[] {
    const sessionId = requiredString(fieldsOf(payload), 'sessionId', 200)
    this.agent(payload)
    return parseOutcomes(this.section.get().outcomesJson ?? '[]').filter(outcome => outcome.sessionId === sessionId)
  }

  private async createOutcome(payload: unknown): Promise<TeamOutcome> {
    const fields = fieldsOf(payload)
    const sessionId = requiredString(fields, 'sessionId', 200)
    this.agent(payload)
    let answer: TeamOutcome | undefined
    const run = async () => {
      const outcomes = parseOutcomes(this.section.get().outcomesJson ?? '[]')
      if (outcomes.length >= MAX_OUTCOMES) throw new Error('outcome limit reached')
      answer = { id: randomUUID(), sessionId, revision: 1, title: requiredString(fields, 'title', 200), content: requiredString(fields, 'content', 20_000), status: 'draft', sync: 'not_requested' }
      await this.section.update({ outcomesJson: JSON.stringify([...outcomes, answer]) })
    }
    this.writes = this.writes.then(run, run); await this.writes
    return answer!
  }

  private async updateOutcome(payload: unknown): Promise<TeamOutcome> {
    const fields = fieldsOf(payload)
    const sessionId = requiredString(fields, 'sessionId', 200)
    this.agent(payload)
    const action = fields.action
    if (action !== 'edit' && action !== 'return' && action !== 'accept') throw new Error('invalid outcome action')
    let answer: TeamOutcome | undefined
    const run = async () => {
      const outcomes = parseOutcomes(this.section.get().outcomesJson ?? '[]')
      const index = outcomes.findIndex(outcome => outcome.id === requiredString(fields, 'outcomeId', 100) && outcome.sessionId === sessionId)
      if (index < 0) throw new Error('unknown outcome')
      const current = outcomes[index]!
      if (fields.expectedRevision !== current.revision) throw new Error(`outcome changed: expected ${String(fields.expectedRevision)}, current ${current.revision}`)
      answer = action === 'edit'
        ? { ...current, revision: current.revision + 1, title: requiredString(fields, 'title', 200), content: requiredString(fields, 'content', 20_000), status: 'draft' }
        : { ...current, revision: current.revision + 1, status: action === 'return' ? 'returned' : 'accepted' }
      outcomes[index] = answer
      await this.section.update({ outcomesJson: JSON.stringify(outcomes) })
    }
    this.writes = this.writes.then(run, run); await this.writes
    return answer!
  }
}

/** Services required for employee persistence and executable team operations. */
export const inject = ['connection', 'settings', 'agents', 'agentTeams']

/** Register the AI Team RPC channel on the plugin lifetime. */
export function apply(ctx: Context): void {
  const backend = new AiTeamBackend(ctx)
  ctx.effect(() => ctx.connection.rpc.handle(AI_TEAM_CHANNEL, (endpoint, payload) => backend.dispatch(endpoint, payload)), 'xyai-ai-team: rpc channel')
}
