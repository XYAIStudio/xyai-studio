/** Host plugin for local distillation, read-only cloud knowledge and conversation retrieval. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { ImaClient } from './ima.ts'
import { OllamaModelRunner } from './local-model.ts'
import { CHANNEL, type Limits } from './protocol.ts'
import { KnowledgeStore } from './store.ts'

/** Required Host services. */
export const inject = ['settings', 'connection', 'credentials', 'tools']
/** Validated deployment settings. Empty artifactRoot means `$DSH_HOME/xyai-studio/knowledge/v1`. */
export const Config = z.object({
  maxFileBytes: z.number().min(1).max(128_000_000).default(16_000_000), maxFiles: z.number().min(1).max(1_000_000).default(100_000), artifactRoot: z.string().default(''),
  ollamaEndpoint: z.string().default('http://127.0.0.1:11434'), modelTimeoutMs: z.number().min(1_000).max(3_600_000).default(300_000), benchmarkTimeoutMs: z.number().min(1_000).max(600_000).default(90_000), distillChunkChars: z.number().min(500).max(100_000).default(12_000), maxBenchmarkModels: z.number().min(1).max(100).default(12),
  cloudEndpoint: z.string().default('https://ima.qq.com/openapi/wiki/v1'), cloudTimeoutMs: z.number().min(1_000).max(300_000).default(20_000), cloudPageSize: z.number().min(1).max(100).default(50), cloudContentBytes: z.number().min(1_024).max(16_000_000).default(1_000_000), cloudHydrateLimit: z.number().min(1).max(20).default(5),
})

function field(raw: unknown, key: string): string { if (!raw || typeof raw !== 'object' || !(key in raw)) throw new Error(`MISSING_FIELD: ${key}`); const value = (raw as Record<string, unknown>)[key]; if (typeof value !== 'string' || !value.trim() || value.length > 8_192) throw new Error(`INVALID_FIELD: ${key}`); return value }
function optional(raw: unknown, key: string): string | undefined { if (!raw || typeof raw !== 'object') return undefined; const value = (raw as Record<string, unknown>)[key]; return typeof value === 'string' && value.trim() ? value : undefined }

/** Dispatch validated Client operations. */
export async function dispatch(store: KnowledgeStore, endpoint: string, raw: unknown): Promise<unknown> {
  switch (endpoint) {
    case 'snapshot': return store.snapshot()
    case 'precheck': return store.precheck(field(raw, 'path'))
    case 'mountLocal': return store.addLocal(field(raw, 'path'), optional(raw, 'output'))
    case 'scan': await store.scan(field(raw, 'id')); return null
    case 'retry': await store.scan(field(raw, 'id'), true); return null
    case 'rename': await store.update(field(raw, 'id'), field(raw, 'name')); return null
    case 'unmount': await store.update(field(raw, 'id'), null); return null
    case 'tree': return store.tree(field(raw, 'id'), optional(raw, 'path') ?? '')
    case 'preview': return store.preview(field(raw, 'id'), field(raw, 'documentId'), optional(raw, 'view') === 'semantic')
    case 'imaTest': return store.testIma(field(raw, 'clientId'), field(raw, 'apiKey'))
    case 'mountIma': return store.addIma({ name: field(raw, 'name'), knowledgeBaseId: field(raw, 'knowledgeBaseId'), clientId: field(raw, 'clientId'), apiKey: field(raw, 'apiKey') })
    case 'refreshIma': await store.refreshIma(field(raw, 'id')); return null
    case 'cloudList': return store.listImaFolder(field(raw, 'id'), optional(raw, 'folderId'))
    default: throw new Error('UNKNOWN_OPERATION')
  }
}

/** Register durable providers, RPC operations and the model-visible search tool. */
export function apply(ctx: Context, config: Omit<Limits, 'artifactRoot'> & { artifactRoot: string }): void {
  const limits: Limits = { ...config, artifactRoot: config.artifactRoot.trim() || dshHomePath('xyai-studio', 'knowledge', 'v1') }
  const scope = ctx.settings.register('xyai-knowledge', z.object({ registry: z.string().default('{"schemaVersion":2,"mounts":[]}') }))
  const store = new KnowledgeStore(
    { read: () => scope.get().registry, write: async registry => { await scope.update({ registry }) } }, limits,
    new OllamaModelRunner({ endpoint: limits.ollamaEndpoint.replace(/\/$/, ''), benchmarkTimeoutMs: limits.benchmarkTimeoutMs, modelTimeoutMs: limits.modelTimeoutMs, chunkChars: limits.distillChunkChars, maxBenchmarkModels: limits.maxBenchmarkModels }),
    new ImaClient({ endpoint: limits.cloudEndpoint.replace(/\/$/, ''), timeoutMs: limits.cloudTimeoutMs, pageSize: limits.cloudPageSize, contentBytes: limits.cloudContentBytes, hydrateLimit: limits.cloudHydrateLimit }),
    { get: async name => (await ctx.credentials.resolve(credentialRef(name)))?.value, set: (name, value) => ctx.credentials.set(credentialRef(name), value), unset: name => ctx.credentials.unset(credentialRef(name)) },
  )
  ctx.effect(() => { const off = ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => { try { return { ok: true, value: await dispatch(store, endpoint, payload) } } catch (error) { return { ok: false, error: { code: 'xyai-knowledge/operation-failed', message: error instanceof Error ? error.message : String(error), details: { endpoint } } } } }); return async () => { off(); await store.dispose() } }, 'xyai-knowledge: providers and rpc')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'knowledge_search',
    description: 'Search mounted XYAI knowledge. Local sources use application-owned extracted text. ima sources are queried remotely on demand and return snippets without downloading or locally parsing cloud files.',
    parameters: { query: { type: 'string', required: true, description: 'Specific words or question to search for.' }, mount_id: { type: 'string', description: 'Optional mounted source id. Omit to search all mounted sources.' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { hits: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { mountId: { type: 'string', required: true }, mountName: { type: 'string', required: true }, provider: { type: 'string', required: true, enum: ['local', 'ima'] }, documentId: { type: 'string', required: true }, title: { type: 'string', required: true }, snippet: { type: 'string', required: true }, path: { type: 'string', required: true } } } } } },
      render: (_args, value) => [{ type: 'text', text: value.hits.length === 0 ? 'No mounted knowledge matched the query.' : value.hits.map((hit, index) => `[${index + 1}] ${hit.mountName} / ${hit.title}\n${hit.snippet}`).join('\n\n') }],
      presentationMeta: (_args, value) => ({ kind: 'xyai-knowledge-search', count: value.hits.length }),
    },
    timeoutMs: Math.max(limits.cloudTimeoutMs, limits.modelTimeoutMs),
    async execute(args, exec) { return { hits: await store.search(args.query, args.mount_id, exec.signal) } },
  })), 'xyai-knowledge: conversation search tool')
}
