/** Shared knowledge-base types for XYAI Studio 0.5. */

export type KbKind = 'local' | 'cloud';

export type ParseFileStatus =
  | 'queued'
  | 'progress'
  | 'done'
  | 'failed'
  | 'warn'
  | 'skipped';

export type CloudProviderId = 'ima' | 'http';

export type LocalKbMount = {
  id: string;
  kind: 'local';
  name: string;
  /** Absolute source directory — NEVER written to by the indexer. */
  sourceRoot: string;
  /** User-chosen index output root (parent). Artifacts go under indexRoot/<kbId>/. */
  indexRoot: string;
  createdAt: string;
  updatedAt: string;
};

export type CloudKbMount = {
  id: string;
  kind: 'cloud';
  name: string;
  provider: CloudProviderId;
  /** Opaque config (baseUrl, apiKey ref, etc.) — secrets live in userData only. */
  config: CloudProviderConfig;
  indexRoot: string;
  createdAt: string;
  updatedAt: string;
};

export type KbMount = LocalKbMount | CloudKbMount;

export type CloudProviderConfig = {
  /** OpenAPI base; ima default https://ima.qq.com/openapi/wiki/v1 */
  baseUrl?: string;
  /** ima: Client ID from https://ima.qq.com/agent-interface */
  clientId?: string;
  /** ima API Key / generic HTTP bearer token */
  apiKey?: string;
  /** ima: selected knowledge base id */
  knowledgeBaseId?: string;
  /** Provider-specific free-form fields (e.g. HTTP listPath). */
  extra?: Record<string, string>;
  /** When true, listCloud returns mock entries (labeled stub). Only if user opts in. */
  useMock?: boolean;
};

export type KnowledgeStoresState = {
  version: 1;
  mounts: KbMount[];
  /** Default index parent directory (user-chosen). */
  defaultIndexRoot: string;
};

export type ParseableFile = {
  path: string;
  relativePath: string;
  name: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
};

export type FileParseRecord = {
  path: string;
  relativePath: string;
  status: ParseFileStatus;
  message?: string;
  chunkCount?: number;
  updatedAt: string;
};

export type ParseJobState = {
  kbId: string;
  running: boolean;
  stopRequested: boolean;
  total: number;
  completed: number;
  failed: number;
  warned: number;
  currentFile: string | null;
  files: FileParseRecord[];
  startedAt: string | null;
  finishedAt: string | null;
  /** Ollama reachable at parse start. */
  ollamaAvailable?: boolean;
  /** Embedding model when present (optional). */
  embedModel?: string | null;
  /** Fastest local chat model used for silent LLM summarize during parse. */
  chatModel?: string | null;
  /** Live banner for UI, e.g. 正在用本地模型 xxx 静默解析 */
  statusMessage?: string | null;
};

export type ChunkRecord = {
  id: string;
  kbId: string;
  sourcePath: string;
  relativePath: string;
  sourceKind: 'local' | 'cloud';
  /** Cloud URL when available. */
  sourceUrl?: string;
  title: string;
  text: string;
  startOffset: number;
  endOffset: number;
  /** Optional embedding vector (when Ollama embed succeeded). */
  embedding?: number[];
};

export type IndexMeta = {
  version: 1;
  kbId: string;
  sourceRoot?: string;
  kind: KbKind;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  chunkCount: number;
  cancelled?: boolean;
  ollamaUsed?: boolean;
  embedModel?: string | null;
  chatModel?: string | null;
};

export type SearchHit = {
  chunk: ChunkRecord;
  score: number;
};

export type Citation = {
  id: string;
  kbId: string;
  title: string;
  relativePath: string;
  /** Local absolute path or cloud URL. */
  sourcePath: string;
  sourceUrl?: string;
  /** file:// for local; https for cloud. */
  openHref: string;
  snippet: string;
};

export type CloudRemoteFile = {
  id: string;
  name: string;
  path: string;
  url?: string;
  sizeBytes?: number;
  mock?: boolean;
};
