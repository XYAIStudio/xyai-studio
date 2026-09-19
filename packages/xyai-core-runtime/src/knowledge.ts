/**
 * Knowledge gateway planner: local + cloud hits → Session send prefix.
 * Does not run retrieval backends or an Agent Loop; the host supplies sources
 * and (when needed) a {@link KnowledgeGateway} adapter.
 */

import type {
  KnowledgeGateway,
  KnowledgeHit,
  KnowledgeIngestRequest,
  KnowledgeIngestResult,
  KnowledgeQuery,
  KnowledgeSourceKind,
} from '@xyai/contracts';

export type {
  KnowledgeGateway,
  KnowledgeHit,
  KnowledgeIngestRequest,
  KnowledgeIngestResult,
  KnowledgeQuery,
  KnowledgeSourceKind,
};

/** Mount snapshot the host already knows about (KnowledgeHost / cloud config). */
export interface KnowledgeSourceInput {
  id: string;
  kind: KnowledgeSourceKind;
  displayName: string;
}

/** Loose hit row before normalize (local index, ima, HTTP, tests). */
export interface KnowledgeHitInput {
  id?: string;
  sourceId?: string;
  title?: string;
  snippet?: string;
  score?: number;
  uri?: string;
}

export interface NormalizeKnowledgeHitsInput {
  local?: KnowledgeHitInput[];
  cloud?: KnowledgeHitInput[];
}

export type KnowledgeContextReason =
  | 'empty-sources'
  | 'not-seeking'
  | 'no-hits'
  | 'already-prefixed'
  | 'attached';

export interface KnowledgeContextPlan {
  attach: boolean;
  prefix: string;
  hits: KnowledgeHit[];
  reason: KnowledgeContextReason;
}

export interface PlanKnowledgeContextInput {
  query: string;
  sources: KnowledgeSourceInput[];
  hits?: KnowledgeHit[];
}

const SNIPPET_CHARS = 800;

/** Banners already injected by Composer `@` or a prior attach. */
export const KNOWLEDGE_PREFIX_RE =
  /【(已挂载知识库|知识库检索|知识库概览|知识库「)/;

const CHITCHAT_RE =
  /^(你好|您好|哈喽|嗨|在吗|早上好|晚上好|中午好|hello|hi+|hey|thanks|thank you|谢谢|好的|ok|嗯+|呀+)$/i;

const SEEKING_RE =
  /(知识库|资料库|文档|手册|说明书|根据.{0,12}(库|文档|资料)|查阅|检索|引用|@知识|look\s*up|knowledge\s*base|\brag\b|according to|documentation)/i;

const QUESTION_RE =
  /(什么是|是什么|有哪些|介绍一下|explain\b|what is|how (?:does|do|can|to)\b)/i;

/**
 * @param query Latest user text (not PermissionMode, not TurnCapability)
 * @returns True when the turn should retrieve, independent of stream vs tools
 */
export function isKnowledgeSeekingQuery(query: string): boolean {
  const text = (query || '').trim();
  if (!text) return false;
  if (CHITCHAT_RE.test(text)) return false;
  if (SEEKING_RE.test(text)) return true;
  return text.length >= 6 && QUESTION_RE.test(text);
}

/**
 * @param text User or outbound message
 * @returns True when a knowledge banner is already present
 */
export function messageHasKnowledgePrefix(text: string): boolean {
  return KNOWLEDGE_PREFIX_RE.test(text || '');
}

function asHit(
  row: KnowledgeHitInput,
  sourceKind: KnowledgeSourceKind,
  index: number,
): KnowledgeHit | null {
  const snippet = (row.snippet || '').trim();
  if (!snippet) return null;
  const sourceId = (row.sourceId || '').trim();
  const id = (row.id || '').trim() || `${sourceKind}:${sourceId || index}`;
  const title = (row.title || '').trim() || sourceId || id;
  const score = typeof row.score === 'number' && Number.isFinite(row.score)
    ? row.score
    : 0;
  const uri = (row.uri || '').trim();
  return {
    id,
    sourceKind,
    sourceId: sourceId || id,
    title,
    snippet: snippet.slice(0, SNIPPET_CHARS),
    score,
    ...(uri ? { uri } : {}),
  };
}

/**
 * Merge local + cloud retrieval rows into one ranked list.
 * Drops empty snippets; first id wins on duplicates.
 * @param input Loose local / cloud hit rows
 * @returns Deduped {@link KnowledgeHit} list, highest score first
 */
export function normalizeKnowledgeHits(
  input: NormalizeKnowledgeHitsInput,
): KnowledgeHit[] {
  const out: KnowledgeHit[] = [];
  const seen = new Set<string>();
  const pushKind = (
    rows: KnowledgeHitInput[] | undefined,
    kind: KnowledgeSourceKind,
  ): void => {
    for (const [index, row] of (rows ?? []).entries()) {
      const hit = asHit(row, kind, index);
      if (!hit || seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(hit);
    }
  };
  pushKind(input.local, 'local');
  pushKind(input.cloud, 'cloud');
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * @param hits Ranked snippets
 * @param sources Mounts used for the header label
 * @returns Session-send prefix, or empty when there are no hits
 */
export function formatKnowledgePrefix(
  hits: KnowledgeHit[],
  sources: KnowledgeSourceInput[],
): string {
  if (!hits.length) return '';
  const names = sources
    .map((s) => (s.displayName || '').trim())
    .filter(Boolean);
  const label = names.length ? names.join('、') : '知识库';
  const header = `【知识库检索：${label}】\n`;
  const parts = hits.map((h, i) => {
    const title = h.title.trim() || h.sourceId;
    return `[#${i + 1} ${title}]\n${h.snippet.slice(0, SNIPPET_CHARS)}`;
  });
  return header + parts.join('\n\n') + '\n【检索结束】\n';
}

/**
 * Decide whether snippets should prepend the current Session send.
 * Empty sources and non-seeking chitchat (`你好`) are no-ops and do not
 * change stream vs tools routing.
 * @param input Query, mounted sources, optional pre-fetched hits
 * @returns Attach plan; `no-hits` means the host may call {@link KnowledgeGateway.search}
 */
export function planKnowledgeContext(
  input: PlanKnowledgeContextInput,
): KnowledgeContextPlan {
  const query = (input.query || '').trim();
  const sources = (input.sources || []).filter((s) => (s.id || '').trim());
  const empty: KnowledgeContextPlan = {
    attach: false,
    prefix: '',
    hits: [],
    reason: 'empty-sources',
  };
  if (!sources.length) {
    return { ...empty, reason: 'empty-sources' };
  }
  if (messageHasKnowledgePrefix(query)) {
    return { ...empty, reason: 'already-prefixed' };
  }
  if (!isKnowledgeSeekingQuery(query)) {
    return { ...empty, reason: 'not-seeking' };
  }
  const hits = normalizeKnowledgeHits({
    local: (input.hits ?? []).filter((h) => h.sourceKind === 'local'),
    cloud: (input.hits ?? []).filter((h) => h.sourceKind === 'cloud'),
  });
  if (!hits.length) {
    return { ...empty, reason: 'no-hits' };
  }
  return {
    attach: true,
    prefix: formatKnowledgePrefix(hits, sources),
    hits,
    reason: 'attached',
  };
}

/**
 * @param query Original user text
 * @param plan Result of {@link planKnowledgeContext}
 * @returns Prefixed text when `plan.attach`, otherwise the original query
 */
export function applyKnowledgePrefix(
  query: string,
  plan: KnowledgeContextPlan,
): string {
  if (!plan.attach || !plan.prefix) return query;
  return `${plan.prefix}\n${query}`;
}

/**
 * Search when the planner reports `no-hits` and a gateway is provided.
 * @param input Query, sources, optional gateway / pre-fetched hits
 * @returns Final attach plan (still a no-op when search returns nothing)
 */
export async function resolveKnowledgeContext(input: {
  query: string;
  sources: KnowledgeSourceInput[];
  gateway?: KnowledgeGateway;
  hits?: KnowledgeHit[];
}): Promise<KnowledgeContextPlan> {
  const first = planKnowledgeContext({
    query: input.query,
    sources: input.sources,
    hits: input.hits,
  });
  if (first.reason !== 'no-hits' || !input.gateway) return first;
  const sourceIds = input.sources.map((s) => s.id);
  const found = await input.gateway.search({
    text: input.query,
    sourceIds,
    limit: 8,
  });
  return planKnowledgeContext({
    query: input.query,
    sources: input.sources,
    hits: found,
  });
}

/**
 * Core ingest stub. Indexing stays on KnowledgeHost / OpenXYOS import.
 * @param _request Ignored; no Core indexer
 * @returns `stub: true` so hosts can distinguish from a real failure
 */
export function stubKnowledgeIngest(
  _request: KnowledgeIngestRequest,
): KnowledgeIngestResult {
  void _request;
  return {
    ok: false,
    stub: true,
    message: 'Core 不建立索引；解析仍由宿主知识库页完成。',
  };
}

/** Gateway that never retrieves. Useful when no KB is mounted. */
export const emptyKnowledgeGateway: KnowledgeGateway = {
  /**
   * @param _query Ignored
   * @returns Always empty
   */
  async search(_query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    void _query;
    return [];
  },
  /**
   * @param request Forwarded to {@link stubKnowledgeIngest}
   * @returns Stub result
   */
  async ingest(
    request: KnowledgeIngestRequest,
  ): Promise<KnowledgeIngestResult> {
    return stubKnowledgeIngest(request);
  },
};
