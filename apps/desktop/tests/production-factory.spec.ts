import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FACTORY_ARCHITECTURE, FACTORY_LINES, previousFactoryLine } from '../src/xyai-core/production-architecture.ts'
import { KnowledgeAssetStore } from '../src/xyai-core/knowledge-asset-store.ts'
import { McpReviewRegistry } from '../src/xyai-core/mcp-review-registry.ts'
import { ProductionFactory } from '../src/xyai-core/production-factory.ts'

describe('migrated seven-line production factory', () => {
  it('keeps the verified legacy dependency contract and explicit quality gates', () => {
    expect(FACTORY_LINES).toEqual(['knowledge', 'data', 'model', 'capability', 'agent', 'system', 'deployment'])
    expect(previousFactoryLine('knowledge')).toBeUndefined()
    expect(previousFactoryLine('data')).toBe('knowledge')
    expect(previousFactoryLine('model')).toBe('data')
    expect(previousFactoryLine('capability')).toBeUndefined()
    expect(previousFactoryLine('agent')).toBe('capability')
    expect(previousFactoryLine('system')).toBe('agent')
    expect(previousFactoryLine('deployment')).toBe('system')
    for (const line of FACTORY_LINES) expect(FACTORY_ARCHITECTURE[line].stages.length).toBeGreaterThanOrEqual(4)
  })

  it('materializes owned knowledge/data/capability assets and cascades feedback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xyai-factory-'))
    const source = join(root, 'source.md')
    await writeFile(source, '# 泵站规程\n循环水泵启动前检查入口阀门和联锁状态。', 'utf8')
    const knowledge = new KnowledgeAssetStore(join(root, 'assets.json'), join(root, 'knowledge-content'))
    await knowledge.load()
    const imported = await knowledge.importSelected(source)
    const reviews = new McpReviewRegistry(join(root, 'mcp.json'))
    await reviews.load()
    const factory = new ProductionFactory(join(root, 'factory.json'), join(root, 'projects'), knowledge, reviews)
    await factory.load()
    const project = await factory.createProject({ name: '泵站经验系统', goal: '形成可追溯的运行知识', systemBase: 'standalone' })
    await mkdir(join(root, 'sentinel'))
    const knowledgeLine = await factory.createAsset(project.id, { line: 'knowledge', name: '泵站知识', knowledgeAssetId: imported.id })
    const dataLine = await factory.createAsset(project.id, { line: 'data', name: '泵站训练语料', inputIds: [knowledgeLine.id] })
    const modelLine = await factory.createAsset(project.id, { line: 'model', name: '泵站模型配方', inputIds: [dataLine.id], baseModel: 'Qwen 3B' })
    const capability = await factory.createAsset(project.id, { line: 'capability', name: '泵站能力包' })
    const agent = await factory.createAsset(project.id, { line: 'agent', name: '泵站运行顾问', inputIds: [capability.id] })
    expect(dataLine.metadata).toMatchObject({ format: 'xyai-instruction-jsonl', sourceKnowledgeAssetId: imported.id })
    expect(modelLine.status).toBe('awaiting-training')
    expect(agent.status).toBe('awaiting-build')
    await factory.feedback(project.id, modelLine.id, '需要补充联锁异常样本')
    const state = factory.projectState(project.id)
    expect(state.assets.find(asset => asset.id === knowledgeLine.id)?.status).toBe('needs-improvement')
    expect(state.assets.find(asset => asset.id === dataLine.id)?.status).toBe('needs-improvement')
    expect(state.assets.find(asset => asset.id === modelLine.id)?.status).toBe('needs-improvement')
    expect(state.events.at(-1)).toMatchObject({ kind: 'feedback', message: '需要补充联锁异常样本' })
  })
})
