/** Knowledge gateway — local + cloud retrieval into Session send. Not an Agent Loop. */

/** Indexed workspace/local mount or a configured remote knowledge base. */
export type KnowledgeSourceKind = 'local' | 'cloud';

/** Ranked snippet from one knowledge source. */
export interface KnowledgeHit {
  id: string;
  sourceKind: KnowledgeSourceKind;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  uri?: string;
}

/** Retrieval request. `sourceIds` empty means search every mounted source. */
export interface KnowledgeQuery {
  text: string;
  sourceIds?: string[];
  limit?: number;
}

/** Optional ingest payload. Core does not index; hosts own parse/upload. */
export interface KnowledgeIngestRequest {
  sourceKind: KnowledgeSourceKind;
  sourceId?: string;
  uri?: string;
  title?: string;
  text?: string;
}

export interface KnowledgeIngestResult {
  ok: boolean;
  /** True when no live indexer ran (Core stub or host without ingest). */
  stub?: boolean;
  message?: string;
}

/**
 * Dual-source retrieval contract. Concrete backends stay thin adapters
 * (`@xyai/knowledge` local index, ima/HTTP cloud, OpenXYOS import).
 */
export interface KnowledgeGateway {
  /**
   * Ranked snippets for a query. An empty list is a successful no-op.
   * @param query Text plus optional source ids / hit cap
   */
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>;
  /**
   * Optional ingest. Core ships a stub; hosts that index documents implement this.
   * @param request Source kind plus optional uri/text
   */
  ingest?(request: KnowledgeIngestRequest): Promise<KnowledgeIngestResult>;
}
