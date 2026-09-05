/** Read the audited desktop sample packages as reusable DSH+/XYOS market templates. */

import fs from 'node:fs'
import path from 'node:path'
import type { AssetManifest, ProductionAssetKind } from '../types/production-assets'

const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'json-schema' as const, schema: { type: 'object', properties, required } }
}

export function resolveBuiltinAgentCatalogRoot(): string {
  if (process.env.XYAI_BUILTIN_AGENTS_DIR?.trim()) return process.env.XYAI_BUILTIN_AGENTS_DIR.trim()
  return path.resolve(import.meta.dirname, '../../dsh-plugin-desktop/examples/production-line-samples')
}

function kindFor(productionType: string): ProductionAssetKind {
  if (productionType === 'team') return 'team'
  if (productionType === 'workflow' || productionType === 'research') return 'workflow'
  return 'agent'
}

/** Invalid or absent optional samples do not prevent XYOS from starting. */
export function builtinSampleAssets(root: string = resolveBuiltinAgentCatalogRoot()): AssetManifest[] {
  if (!fs.existsSync(root)) return []
  const assets: AssetManifest[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packageDir = path.join(root, entry.name, 'package')
    const manifestFile = path.join(packageDir, 'manifest.json')
    if (!fs.existsSync(manifestFile)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Record<string, any>
      const id = typeof manifest.id === 'string' ? manifest.id : ''
      if (!PRESET_ID.test(id)) continue
      const productionType = String(manifest.productionType || 'advisor')
      const blueprint = manifest.productionBlueprint && typeof manifest.productionBlueprint === 'object'
        ? manifest.productionBlueprint as Record<string, any>
        : {}
      const draft = {
        name: String(manifest.name || id),
        industry: String(manifest.industry || ''),
        description: String(manifest.description || ''),
        persona: String(manifest.persona || ''),
        scenarios: Array.isArray(manifest.scenarios) ? manifest.scenarios.filter((value: unknown) => typeof value === 'string') : [],
        capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities.filter((value: unknown) => typeof value === 'string') : [],
        agentType: productionType,
        permissions: ['tools'],
        productionSpec: blueprint.productionSpec || manifest.productionSpec || {},
        teamMembers: Array.isArray(blueprint.team?.members) ? blueprint.team.members : [],
        workflowNodes: Array.isArray(blueprint.workflow?.nodes) ? blueprint.workflow.nodes : [],
        coordination: blueprint.team?.coordination || 'hybrid',
        // 这是已验收的官方样板；用户复制后形成自己的草稿，仍需重新试运行和验收。
        releaseStatus: 'draft',
      }
      assets.push({
        schemaVersion: '1.0',
        id: `factory:sample-${id}`,
        kind: kindFor(productionType),
        name: draft.name,
        description: draft.description,
        version: String(manifest.version || '1.0.0'),
        status: 'active',
        riskLevel: productionType === 'advisor' ? 'medium' : 'high',
        input: schema({ task: { type: 'string' }, context: { type: 'object' } }, ['task']),
        output: schema({ result: { type: 'string' }, evidence: { type: 'object' }, artifacts: { type: 'array' } }),
        permissions: ['runtime.run', 'local.files.read'],
        runtimeProviders: ['mock', 'dsh'],
        source: { platform: 'dsh', assetId: id, version: String(manifest.version || '1.0.0') },
        evaluation: { minimumLevel: productionType === 'advisor' ? 'L2' : 'L3' },
        metadata: {
          builtinSample: true,
          productionType,
          reusableAs: productionType === 'team' ? 'team-template' : productionType === 'advisor' ? 'ai-employee-template' : 'workflow-template',
          draft,
          qualityGate: 'four-persona-real-dsh-accepted',
        },
      })
    } catch { /* 单个示例损坏只从市场隐藏，启动验收会另行报错。 */ }
  }
  return assets.sort((left, right) => left.id.localeCompare(right.id))
}
