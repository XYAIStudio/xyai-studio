/** Wire data shared by the knowledge Host and Client. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Knowledge mount identifier, independent of its provider address. */
export type MountId = Branded<'KnowledgeMount'>
/** Document identifier within one mounted source. */
export type DocumentId = Branded<'KnowledgeDocument'>
/** Connection channel owned by the plugin. */
export const CHANNEL = '/xyai-knowledge'

/** Locally extracted document and its optional model distillation. */
export interface LocalDocumentRecord { id: DocumentId; path: string; size: number; modified: number; state: 'extracted' | 'distilling' | 'ready' | 'failed'; error?: string; characters: number; model?: string }
/** Measured Ollama model choice used for one local source. */
export interface LocalModelSelection { name: string; measuredAt: string; tokensPerSecond: number | null; durationMs: number }
/** Read-only metadata returned by a cloud provider. */
export interface CloudDocumentRecord { id: string; title: string; parentId?: string; directory: boolean }
/** Local source registration and application-owned artifacts. */
export interface LocalMount { kind: 'local'; id: MountId; name: string; root: string; output: string; documents: LocalDocumentRecord[]; selectedModel?: LocalModelSelection; scannedAt?: string; error?: string }
/** ima source registration. Credentials remain in the Host credential service. */
export interface CloudMount { kind: 'ima'; id: MountId; name: string; knowledgeBaseId: string; documents: CloudDocumentRecord[]; refreshedAt?: string; error?: string }
/** Any knowledge source shown by the page and query tool. */
export type Mount = LocalMount | CloudMount
/** Host state returned to the authenticated client. */
export interface Snapshot { mounts: Mount[]; busy: MountId | null; processed: number; error: string | null; artifactRoot: string }
/** One lazily loaded local directory entry. */
export interface TreeEntry { name: string; path: string; directory: boolean }
/** Deployment choices for extraction, model work and cloud calls. */
export interface Limits { maxFileBytes: number; maxFiles: number; artifactRoot: string; ollamaEndpoint: string; modelTimeoutMs: number; benchmarkTimeoutMs: number; distillChunkChars: number; maxBenchmarkModels: number; cloudEndpoint: string; cloudTimeoutMs: number; cloudPageSize: number; cloudContentBytes: number; cloudHydrateLimit: number }
/** One source returned to the conversation tool. */
export interface KnowledgeSearchHit { mountId: string; mountName: string; provider: 'local' | 'ima'; documentId: string; title: string; snippet: string; path: string }
