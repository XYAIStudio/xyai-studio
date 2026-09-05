/**
 * XYAI-owned adaptation of the legacy four-category agent production contract.
 * A blueprint is not a chat prompt: it carries the gates that must be met
 * before it can enter the system line or be sent to the bundled XYOS generator.
 */
export type AgentProductionType = 'advisor' | 'workflow' | 'research' | 'team'
export interface AgentProductionGate { readonly id: string; readonly label: string; readonly passed: boolean; readonly action: string }
export interface WorkflowNode { readonly id: string; readonly title: string; readonly inputSpec: string; readonly outputSpec: string; readonly acceptanceCriteria: string; readonly onFailure: string; readonly dependsOn: readonly string[] }
export interface TeamMember { readonly name: string; readonly role: string; readonly responsibility: string }
export interface AgentBlueprint { readonly schemaVersion: 'xyai.production-line.v1'; readonly productionType: AgentProductionType; readonly name: string; readonly industry: string; readonly description: string; readonly productionSpec: Readonly<Record<string, string>>; readonly productionGates: readonly AgentProductionGate[]; readonly workflow?: { readonly nodes: readonly WorkflowNode[] }; readonly team?: { readonly members: readonly TeamMember[]; readonly coordination: 'serial' | 'parallel' | 'hybrid' } }

const FIELDS: Record<AgentProductionType, readonly [string, string, number][]> = {
  advisor: [['targetUser', '服务对象', 4], ['serviceBoundary', '服务边界', 10], ['escalationRule', '人工升级规则', 10], ['answerStructure', '回答结构', 8]],
  workflow: [['trigger', '触发条件', 8], ['owner', '流程负责人', 4], ['exceptionStrategy', '异常策略', 12], ['retryPolicy', '重试规则', 8], ['idempotencyRule', '幂等规则', 8], ['completionSignal', '完成信号', 8]],
  research: [['researchQuestion', '研究问题', 12], ['timeRange', '时间与样本范围', 6], ['sourceCriteria', '来源准入规则', 12], ['metricDefinitions', '指标口径', 12], ['uncertaintyPolicy', '不确定性披露规则', 12], ['reportAudience', '报告读者与用途', 6]],
  team: [['objective', '共同目标', 12], ['leadRole', '总负责人岗位', 4], ['reviewerRole', '独立复核岗位', 4], ['handoffProtocol', '交接协议', 12], ['conflictProtocol', '冲突处理', 12], ['finalDeliverable', '最终交付物', 10]],
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const validType = (value: unknown): value is AgentProductionType => value === 'advisor' || value === 'workflow' || value === 'research' || value === 'team'

export function productionFields(type: AgentProductionType): readonly [string, string, number][] { return FIELDS[type] }

export function evaluateAgentBlueprint(input: unknown): AgentBlueprint {
  const value = record(input)
  if (!validType(value.productionType)) throw new Error('请选择四类智能体生产工艺')
  const productionType = value.productionType
  const name = text(value.name); const industry = text(value.industry); const description = text(value.description)
  if (!name || !industry || !description) throw new Error('智能体名称、行业与说明不能为空')
  const specRaw = record(value.productionSpec)
  const productionSpec = Object.fromEntries(FIELDS[productionType].map(([key, label, min]) => {
    const item = text(specRaw[key]); if (item.length < min) throw new Error(`分型生产规格未完成：${label}`); return [key, item.slice(0, 1000)]
  }))
  const workflow = productionType === 'workflow' || productionType === 'research' ? normalizeWorkflow(value.workflow, productionType === 'research' ? 5 : 2) : undefined
  const team = productionType === 'team' ? normalizeTeam(value.team, productionSpec) : undefined
  const experience = text(value.experience)
  if (productionType === 'advisor' && (!['[典型案例]', '[边界案例]', '[反例]'].every(marker => experience.includes(marker)) || (experience.match(/专家判定：已通过/g) ?? []).length < 3)) {
    throw new Error('专业顾问须附带典型、边界、反例及三项专家通过证据')
  }
  const gates = gatesFor(productionType, productionSpec, workflow, team, experience)
  if (gates.some(gate => !gate.passed)) throw new Error(`分型质量门禁未通过：${gates.filter(gate => !gate.passed).map(gate => gate.label).join('、')}`)
  return { schemaVersion: 'xyai.production-line.v1', productionType, name: name.slice(0, 160), industry: industry.slice(0, 160), description: description.slice(0, 1000), productionSpec, productionGates: gates, ...(workflow === undefined ? {} : { workflow: { nodes: workflow } }), ...(team === undefined ? {} : { team }) }
}

function normalizeWorkflow(value: unknown, minimum: number): readonly WorkflowNode[] {
  const raw = Array.isArray(record(value).nodes) ? record(value).nodes as unknown[] : []
  if (raw.length < minimum) throw new Error(`该生产工艺至少需要 ${minimum} 个完整节点`)
  const nodes = raw.slice(0, 50).map(item => { const node = record(item); return { id: text(node.id), title: text(node.title), inputSpec: text(node.inputSpec), outputSpec: text(node.outputSpec), acceptanceCriteria: text(node.acceptanceCriteria), onFailure: text(node.onFailure), dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn.map(text).filter(Boolean).slice(0, 20) : [] } })
  const ids = new Set(nodes.map(node => node.id)); if (ids.size !== nodes.length || nodes.some(node => !node.id || !node.title || node.inputSpec.length < 4 || node.outputSpec.length < 4 || node.acceptanceCriteria.length < 4 || node.onFailure.length < 8 || node.dependsOn.some(parent => parent === node.id || !ids.has(parent)))) throw new Error('每个流程节点都必须有唯一标识、输入、输出、验收与失败回退路径')
  const visiting = new Set<string>(); const visited = new Set<string>(); const byId = new Map(nodes.map(node => [node.id, node]))
  const visit = (id: string): void => { if (visiting.has(id)) throw new Error('流程节点依赖存在循环'); if (visited.has(id)) return; visiting.add(id); for (const parent of byId.get(id)?.dependsOn ?? []) visit(parent); visiting.delete(id); visited.add(id) }
  nodes.forEach(node => visit(node.id)); return nodes
}
function normalizeTeam(value: unknown, spec: Readonly<Record<string, string>>): { readonly members: readonly TeamMember[]; readonly coordination: 'serial' | 'parallel' | 'hybrid' } {
  const raw = Array.isArray(record(value).members) ? record(value).members as unknown[] : []
  const members = raw.slice(0, 20).map(item => { const member = record(item); return { name: text(member.name), role: text(member.role), responsibility: text(member.responsibility) } }).filter(member => member.name && member.role && member.responsibility)
  const leadRole = spec.leadRole ?? ''; const reviewerRole = spec.reviewerRole ?? ''
  const roles = new Set(members.map(member => member.role)); if (members.length < 2 || roles.size < 2 || !roles.has(leadRole) || !roles.has(reviewerRole) || leadRole === reviewerRole) throw new Error('团队须有两名以上互补成员，且负责人和独立复核人必须是不同的真实岗位')
  const mode = record(value).coordination; const coordination = mode === 'serial' || mode === 'parallel' ? mode : 'hybrid'; return { members, coordination }
}
function gatesFor(type: AgentProductionType, spec: Readonly<Record<string, string>>, workflow: readonly WorkflowNode[] | undefined, team: { readonly members: readonly TeamMember[] } | undefined, experience: string): readonly AgentProductionGate[] {
  const pass = (key: string, label: string, min = 4): AgentProductionGate => ({ id: key, label, passed: Object.values(spec).some(value => value.length >= min), action: `补充${label}` })
  if (type === 'advisor') return [
    { ...pass('advisor-user', '明确服务对象'), passed: (spec.targetUser?.length ?? 0) >= 4 }, { ...pass('advisor-boundary', '明确服务边界'), passed: (spec.serviceBoundary?.length ?? 0) >= 10 }, { ...pass('advisor-escalation', '高风险升级人工'), passed: (spec.escalationRule?.length ?? 0) >= 10 }, { ...pass('advisor-output', '固定回答结构'), passed: (spec.answerStructure?.length ?? 0) >= 8 },
    { id: 'advisor-experience', label: '经验规则达到可生产状态', passed: experience.length > 0, action: '补充经验规则和案例' }, { id: 'advisor-cases', label: '三类案例均已专家验收', passed: ['[典型案例]', '[边界案例]', '[反例]'].every(marker => experience.includes(marker)) && (experience.match(/专家判定：已通过/g) ?? []).length >= 3, action: '补齐三类案例和专家通过证据' },
  ]
  if (type === 'workflow') return ['trigger','owner','nodes','contracts','failure-paths','exception','retry','idempotency','complete'].map(key => ({ id: `workflow-${key}`, label: `工作流${key}`, passed: key === 'nodes' || key === 'contracts' || key === 'failure-paths' ? workflow !== undefined : true, action: '补齐工作流生产规格' }))
  if (type === 'research') return ['question','range','sources','metrics','uncertainty','audience','nodes','failure-paths'].map(key => ({ id: `research-${key}`, label: `研究${key}`, passed: key === 'nodes' || key === 'failure-paths' ? workflow !== undefined : true, action: '补齐研究生产规格' }))
  return ['objective','members','lead','reviewer','handoff','conflict','deliverable'].map(key => ({ id: `team-${key}`, label: `团队${key}`, passed: key === 'members' || key === 'lead' || key === 'reviewer' ? team !== undefined : true, action: '补齐团队生产规格' }))
}
