/**
 * XYAI-owned adaptation of the verified legacy seven-line production graph.
 * Unlike the legacy DSH plugin, every project and generated file lives under
 * the desktop user's data root.  No source directory selected during import is
 * retained as a runtime dependency.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { FACTORY_ARCHITECTURE, FACTORY_LINES, previousFactoryLine, type FactoryLine } from './production-architecture.ts'
import { KnowledgeAssetStore } from './knowledge-asset-store.ts'
import { McpReviewRegistry } from './mcp-review-registry.ts'
import { evaluateAgentBlueprint } from './agent-production.ts'

export type FactoryAssetStatus = 'ready' | 'awaiting-training' | 'awaiting-build' | 'ready-for-review' | 'needs-improvement' | 'needs-revalidation'
export interface FactoryProject { readonly id: string; readonly name: string; readonly goal: string; readonly systemBase: 'xyos' | 'standalone'; readonly createdAt: string; readonly updatedAt: string }
export interface FactoryContract { readonly goal: string; readonly deliverable: string; readonly acceptance: string; readonly privacy: 'local' | 'hybrid'; readonly hardwareTier: 'basic' | 'professional' | 'workstation'; readonly revision: number; readonly updatedAt: string }
export interface FactoryAsset { readonly id: string; readonly projectId: string; readonly line: FactoryLine; readonly name: string; readonly status: FactoryAssetStatus; readonly inputIds: readonly string[]; readonly reference: string; readonly metadata: Readonly<Record<string, unknown>>; readonly createdAt: string; readonly updatedAt: string }
export interface FactoryEvent { readonly id: string; readonly assetId: string; readonly line: FactoryLine; readonly kind: 'created' | 'completed' | 'feedback'; readonly message: string; readonly createdAt: string }
export interface FactoryProjectState { readonly project: FactoryProject; readonly contract?: FactoryContract; readonly assets: readonly FactoryAsset[]; readonly events: readonly FactoryEvent[] }
interface StoredState { readonly schemaVersion: 1; readonly projects: readonly FactoryProject[]; readonly contracts: Readonly<Record<string, FactoryContract>>; readonly assets: readonly FactoryAsset[]; readonly events: readonly FactoryEvent[] }

function stamp(): string { return new Date().toISOString() }
function clean(value: unknown, label: string, maximum: number): string { const result = typeof value === 'string' ? value.trim() : ''; if (!result) throw new Error(`${label}不能为空`); if (result.length > maximum) throw new Error(`${label}过长`); return result }
function ownPath(root: string, projectId: string, ...parts: string[]): string { return join(root, projectId, ...parts) }
async function atomic(path: string, value: StoredState): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, path) }

export class ProductionFactory {
  private state: StoredState = { schemaVersion: 1, projects: [], contracts: {}, assets: [], events: [] }
  constructor(private readonly filePath: string, private readonly workspaceRoot: string, private readonly knowledge: KnowledgeAssetStore, private readonly reviews: McpReviewRegistry) {}

  async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<StoredState>
      if (value.schemaVersion !== 1 || !Array.isArray(value.projects) || !Array.isArray(value.assets) || !Array.isArray(value.events) || value.contracts === undefined || typeof value.contracts !== 'object') throw new Error('unsupported production factory state')
      this.state = value as StoredState
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  listProjects(): readonly FactoryProject[] { return [...this.state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  projectState(projectId: string): FactoryProjectState {
    const project = this.requireProject(projectId)
    return { project, ...(this.state.contracts[projectId] === undefined ? {} : { contract: structuredClone(this.state.contracts[projectId]) }), assets: this.state.assets.filter(item => item.projectId === projectId).map(item => structuredClone(item)), events: this.state.events.filter(item => this.state.assets.some(asset => asset.id === item.assetId && asset.projectId === projectId)).map(item => structuredClone(item)) }
  }

  async createProject(input: { readonly name?: unknown; readonly goal?: unknown; readonly systemBase?: unknown }): Promise<FactoryProject> {
    const now = stamp(); const id = randomUUID(); const systemBase = input.systemBase === 'xyos' ? 'xyos' : 'standalone'
    const project: FactoryProject = { id, name: clean(input.name, '项目名称', 120), goal: typeof input.goal === 'string' ? input.goal.trim().slice(0, 1000) : '', systemBase, createdAt: now, updatedAt: now }
    const root = ownPath(this.workspaceRoot, id)
    await Promise.all([mkdir(join(root, '.xyai'), { recursive: true }), mkdir(join(root, 'src'), { recursive: true }), mkdir(join(root, 'docs'), { recursive: true }), mkdir(join(root, 'data'), { recursive: true }), mkdir(join(root, 'artifacts'), { recursive: true })])
    await writeFile(join(root, 'README.md'), `# ${project.name}\n\n${project.goal || '本项目由 XYAI Founders 创建。'}\n\n- 系统基座：${systemBase === 'xyos' ? 'XYOS 扩展' : '独立本地系统'}\n- 工作区：XYAI Studio 应用自有目录\n`, { encoding: 'utf8', flag: 'wx' })
    this.state = { ...this.state, projects: [project, ...this.state.projects] }; await this.save(); return structuredClone(project)
  }

  async saveContract(projectId: string, input: { readonly goal?: unknown; readonly deliverable?: unknown; readonly acceptance?: unknown; readonly privacy?: unknown; readonly hardwareTier?: unknown }): Promise<FactoryContract> {
    this.requireProject(projectId)
    const previous = this.state.contracts[projectId]
    const privacy = input.privacy === 'hybrid' ? 'hybrid' : 'local'
    const hardwareTier = input.hardwareTier === 'basic' || input.hardwareTier === 'workstation' ? input.hardwareTier : 'professional'
    const contract: FactoryContract = { goal: clean(input.goal, '生产目标', 500), deliverable: clean(input.deliverable, '交付物', 500), acceptance: clean(input.acceptance, '验收标准', 1000), privacy, hardwareTier, revision: (previous?.revision ?? 0) + 1, updatedAt: stamp() }
    this.state = { ...this.state, contracts: { ...this.state.contracts, [projectId]: contract } }; await this.save(); return structuredClone(contract)
  }

  async createAsset(projectId: string, input: { readonly line?: unknown; readonly name?: unknown; readonly inputIds?: unknown; readonly knowledgeAssetId?: unknown; readonly baseModel?: unknown }): Promise<FactoryAsset> {
    const project = this.requireProject(projectId)
    const line = this.line(input.line); const name = clean(input.name, '产物名称', 160); const inputs = this.inputs(projectId, input.inputIds)
    const dependency = previousFactoryLine(line)
    if (dependency !== undefined && !inputs.some(item => item.line === dependency && item.status === 'ready')) throw new Error(`必须先选择已验收的${FACTORY_ARCHITECTURE[dependency].label}产物`)
    const id = randomUUID(); const createdAt = stamp(); const directory = ownPath(this.workspaceRoot, projectId, '.xyai', 'production-lines', line, id); await mkdir(directory, { recursive: true })
    let reference = join(directory, 'manifest.json'); let status: FactoryAssetStatus = 'ready'; let metadata: Record<string, unknown> = {}
    if (line === 'knowledge') {
      const knowledgeAssetId = clean(input.knowledgeAssetId, '知识资产', 180); const asset = this.knowledge.list().find(item => item.id === knowledgeAssetId)
      if (asset === undefined) throw new Error('所选知识资产不存在；请先导入知识文件')
      metadata = { knowledgeAssetId: asset.id, files: asset.files.length, totalBytes: asset.totalBytes, importedAt: asset.importedAt }
    } else if (line === 'data') {
      const source = inputs.find(item => item.line === 'knowledge')!; const knowledgeAssetId = String(source.metadata.knowledgeAssetId ?? '')
      const corpus = await this.knowledge.exportTextCorpus(knowledgeAssetId); const seen = new Set<string>(); const records = corpus.map(item => ({ id: createHash('sha256').update(`${knowledgeAssetId}:${item.path}`).digest('hex'), instruction: `请依据《${item.path}》准确说明关键知识，并保留条件、数值和限制。`, output: item.text, source: { knowledgeAssetId, path: item.path } })).filter(item => item.output.length >= 8).filter(item => { const key = createHash('sha256').update(item.output).digest('hex'); if (seen.has(key)) return false; seen.add(key); return true })
      if (records.length === 0) throw new Error('知识资产没有可用于数据生产线的文本内容；支持 txt、md、json、csv、tsv、yaml')
      const evaluation = records.filter(item => Number.parseInt(item.id.slice(0, 2), 16) % 10 === 0); const evaluationIds = new Set(evaluation.map(item => item.id)); const training = records.filter(item => !evaluationIds.has(item.id));
      await writeFile(join(directory, 'train.jsonl'), `${(training.length ? training : records).map(item => JSON.stringify(item)).join('\n')}\n`, 'utf8'); await writeFile(join(directory, 'evaluation.jsonl'), evaluation.length ? `${evaluation.map(item => JSON.stringify(item)).join('\n')}\n` : '', 'utf8')
      metadata = { format: 'xyai-instruction-jsonl', sourceKnowledgeAssetId: knowledgeAssetId, records: records.length, trainingRecords: training.length || records.length, evaluationRecords: evaluation.length, qualityGate: { deduplicated: true, sourceTraceable: true, expertReviewRequired: true } }
    } else if (line === 'model') {
      const baseModel = clean(input.baseModel, '基础模型', 240); status = 'awaiting-training'; metadata = { baseModel, method: 'QLoRA', quantization: '4-bit', trainingRuntime: 'on-demand', datasetAssetId: inputs.find(item => item.line === 'data')!.id }
    } else if (line === 'capability') {
      const approved = this.reviews.list().filter(item => item.status === 'approved').map(item => ({ id: item.id, name: item.name, credentialNames: item.credentialNames, reviewedAt: item.reviewedAt }))
      metadata = { modelAssetId: inputs.find(item => item.line === 'model')?.id ?? null, reviewedMcpCapabilities: approved, skillSources: ['project', 'approved-plugins'] }
    } else if (line === 'agent') {
      status = 'awaiting-build'; metadata = { capabilityAssetId: inputs.find(item => item.line === 'capability')!.id, knowledgeAssetIds: this.state.assets.filter(item => item.projectId === projectId && item.line === 'knowledge' && item.status === 'ready').map(item => item.id), customization: 'XYOS industry-agent generator' }
    } else if (line === 'system') {
      const systemRoot = ownPath(this.workspaceRoot, projectId, 'artifacts', 'system'); await mkdir(systemRoot, { recursive: true }); await writeFile(join(systemRoot, 'README.md'), `# ${project.name} 系统产物\n\n基座：${project.systemBase}\n智能体资产：${inputs.find(item => item.line === 'agent')!.id}\n`, 'utf8'); reference = join(systemRoot, 'manifest.json'); metadata = { agentAssetId: inputs.find(item => item.line === 'agent')!.id, systemBase: project.systemBase, systemRoot }
    } else {
      status = 'ready-for-review'; metadata = { systemAssetId: inputs.find(item => item.line === 'system')!.id, reviewGate: 'required', assetSnapshot: this.state.assets.filter(item => item.projectId === projectId).map(item => ({ id: item.id, line: item.line, status: item.status })) }
    }
    const asset: FactoryAsset = { id, projectId, line, name, status, inputIds: inputs.map(item => item.id), reference, metadata, createdAt, updatedAt: createdAt }
    await writeFile(reference, `${JSON.stringify({ schema: 'xyai.production-asset.v1', asset }, null, 2)}\n`, 'utf8')
    const event: FactoryEvent = { id: randomUUID(), assetId: id, line, kind: 'created', message: `已生成${FACTORY_ARCHITECTURE[line].label}产物：${name}`, createdAt }
    this.state = { ...this.state, assets: [...this.state.assets, asset], events: [...this.state.events, event], projects: this.state.projects.map(item => item.id === projectId ? { ...item, updatedAt: createdAt } : item) }; await this.save(); return structuredClone(asset)
  }

  /** Build a governed four-category agent blueprint from a ready capability asset.
   * It has an actual, versioned blueprint file; it does not claim a model run. */
  async createAgentBlueprint(projectId: string, input: unknown): Promise<FactoryAsset> {
    const project = this.requireProject(projectId); const value = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
    const capabilityId = clean(value.capabilityAssetId, '已验收能力产物', 180)
    const capability = this.state.assets.find(asset => asset.id === capabilityId && asset.projectId === projectId && asset.line === 'capability' && asset.status === 'ready')
    if (capability === undefined) throw new Error('必须选择当前项目已验收的能力生产线产物')
    const blueprint = evaluateAgentBlueprint(value); const now = stamp(); const id = randomUUID(); const directory = ownPath(this.workspaceRoot, projectId, '.xyai', 'production-lines', 'agent', id); await mkdir(directory, { recursive: true })
    const reference = join(directory, 'agent-blueprint.json'); const metadata = { capabilityAssetId: capability.id, productionType: blueprint.productionType, industry: blueprint.industry, gateCount: blueprint.productionGates.length, gatePassed: true, customization: 'xyai-governed-agent-blueprint' }
    const asset: FactoryAsset = { id, projectId, line: 'agent', name: blueprint.name, status: 'ready', inputIds: [capability.id], reference, metadata, createdAt: now, updatedAt: now }
    await writeFile(reference, `${JSON.stringify({ ...blueprint, asset }, null, 2)}\n`, 'utf8')
    const event: FactoryEvent = { id: randomUUID(), assetId: id, line: 'agent', kind: 'created', message: `已生成${blueprint.productionType}智能体生产蓝图：${blueprint.name}`, createdAt: now }
    this.state = { ...this.state, assets: [...this.state.assets, asset], events: [...this.state.events, event], projects: this.state.projects.map(item => item.id === project.id ? { ...item, updatedAt: now } : item) }; await this.save(); return structuredClone(asset)
  }

  async feedback(projectId: string, assetId: string, message: unknown): Promise<void> {
    clean(message, '反馈内容', 1000); this.requireProject(projectId); const asset = this.state.assets.find(item => item.id === assetId && item.projectId === projectId); if (asset === undefined) throw new Error('生产线资产不存在')
    const upstream = new Set<string>([assetId]); const downstream = new Set<string>(); const visitUp = (id: string): void => { const item = this.state.assets.find(candidate => candidate.id === id); for (const parent of item?.inputIds ?? []) if (!upstream.has(parent)) { upstream.add(parent); visitUp(parent) } }; const visitDown = (id: string): void => { for (const item of this.state.assets.filter(candidate => candidate.projectId === projectId && candidate.inputIds.includes(id))) if (!downstream.has(item.id)) { downstream.add(item.id); visitDown(item.id) } }; visitUp(assetId); visitDown(assetId)
    const now = stamp(); this.state = { ...this.state, assets: this.state.assets.map(item => item.projectId !== projectId ? item : upstream.has(item.id) ? { ...item, status: 'needs-improvement', updatedAt: now } : downstream.has(item.id) ? { ...item, status: 'needs-revalidation', updatedAt: now } : item), events: [...this.state.events, { id: randomUUID(), assetId, line: asset.line, kind: 'feedback', message: String(message).trim(), createdAt: now }] }; await this.save()
  }

  private requireProject(projectId: string): FactoryProject { const project = this.state.projects.find(item => item.id === projectId); if (project === undefined) throw new Error('生产项目不存在'); return project }
  private line(value: unknown): FactoryLine { if (typeof value !== 'string' || !FACTORY_LINES.includes(value as FactoryLine)) throw new Error('无效生产线'); return value as FactoryLine }
  private inputs(projectId: string, value: unknown): FactoryAsset[] { const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; return [...new Set(ids)].map(id => { const asset = this.state.assets.find(item => item.id === id && item.projectId === projectId); if (asset === undefined) throw new Error(`上游资产不存在：${id}`); return asset }) }
  private async save(): Promise<void> { await atomic(this.filePath, this.state) }
}
