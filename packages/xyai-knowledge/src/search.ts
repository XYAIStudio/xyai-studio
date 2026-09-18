/**
 * Keyword + optional embedding search over chunks.jsonl.
 * Chinese-friendly scoring + overview fallback when keyword/embed hits are empty.
 */

import type { ChunkRecord, Citation, SearchHit } from './types.js';
import { isJunkIndexText } from './extract.js';
import { cosineSimilarity } from './ollama-kb.js';
import { readChunks } from './index-io.js';
import path from 'node:path';

/** Split query into tokens; keep CJK runs and bigrams for Chinese. */
export function tokenize(q: string): string[] {
  const lower = q.toLowerCase().trim();
  if (!lower) return [];
  const out: string[] = [];

  for (const t of lower.split(/[^\p{L}\p{N}]+/u)) {
    if (t.length > 1) out.push(t);
  }

  const cjkRuns = lower.match(/\p{Script=Han}+/gu) ?? [];
  for (const run of cjkRuns) {
    if (run.length >= 2) out.push(run);
    for (let i = 0; i < run.length - 1; i++) {
      out.push(run.slice(i, i + 2));
    }
    // Single CJK chars still help short queries like「政」
    if (run.length === 1) out.push(run);
  }

  return [...new Set(out)];
}

export function scoreKeyword(
  chunk: ChunkRecord,
  tokens: string[],
  query = '',
): number {
  const hay = (chunk.title + '\n' + chunk.text).toLowerCase();
  let score = 0;

  const q = query.trim().toLowerCase();
  // Full-query substring boost (critical for Chinese phrases / PDF rough extract)
  if (q.length >= 2 && hay.includes(q)) {
    score += 2;
  }

  if (!tokens.length) {
    return score > 0 ? score : 0;
  }

  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }
  return score / Math.max(tokens.length, 1);
}

const OVERVIEW_SCORE = 0.001;

export function searchChunks(
  chunks: ChunkRecord[],
  query: string,
  opts: {
    limit?: number;
    queryEmbedding?: number[] | null;
    /** When keyword/embed miss but chunks exist, return first N (overview). Default true. */
    overviewFallback?: boolean;
    overviewLimit?: number;
  } = {},
): SearchHit[] {
  const limit = opts.limit ?? 8;
  const tokens = tokenize(query);
  const hits: SearchHit[] = [];

  for (const chunk of chunks) {
    if (isJunkIndexText(chunk.text)) continue;
    let score = scoreKeyword(chunk, tokens, query);
    if (
      opts.queryEmbedding &&
      chunk.embedding &&
      chunk.embedding.length === opts.queryEmbedding.length
    ) {
      const cos = cosineSimilarity(opts.queryEmbedding, chunk.embedding);
      score = score * 0.4 + Math.max(0, cos) * 0.6;
    }
    if (score > 0) hits.push({ chunk, score });
  }

  hits.sort((a, b) => b.score - a.score);

  if (hits.length) {
    return hits.slice(0, limit);
  }

  const allowOverview = opts.overviewFallback !== false;
  if (allowOverview && chunks.length) {
    const clean = chunks.filter((c) => !isJunkIndexText(c.text));
    const pool = clean.length ? clean : [];
    if (!pool.length) return [];
    const n = Math.min(opts.overviewLimit ?? Math.min(limit, 4), pool.length);
    return pool.slice(0, n).map((chunk, i) => ({
      chunk,
      score: OVERVIEW_SCORE * (n - i),
    }));
  }

  return [];
}

export function searchKb(
  indexRoot: string,
  kbId: string,
  query: string,
  opts: {
    limit?: number;
    queryEmbedding?: number[] | null;
    overviewFallback?: boolean;
    overviewLimit?: number;
  } = {},
): SearchHit[] {
  return searchChunks(readChunks(indexRoot, kbId), query, opts);
}

/** True when hits came from overview fallback (no real keyword/embed match). */
export function isOverviewHits(hits: SearchHit[]): boolean {
  return hits.length > 0 && hits.every((h) => h.score <= OVERVIEW_SCORE * 10);
}

export function hitsToCitations(hits: SearchHit[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const h of hits) {
    const c = h.chunk;
    const key = c.sourcePath;
    if (seen.has(key)) continue;
    seen.add(key);
    const isLocal = c.sourceKind === 'local';
    const openHref = c.sourceUrl
      ? c.sourceUrl
      : isLocal
        ? pathToFileUrl(c.sourcePath)
        : c.sourcePath;
    out.push({
      id: c.id,
      kbId: c.kbId,
      title: c.title || path.basename(c.relativePath),
      relativePath: c.relativePath,
      sourcePath: c.sourcePath,
      sourceUrl: c.sourceUrl,
      openHref,
      snippet: c.text.slice(0, 240),
    });
  }
  return out;
}

export function pathToFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) {
    return 'file:///' + normalized;
  }
  return (
    'file://' + (normalized.startsWith('/') ? normalized : '/' + normalized)
  );
}

export function formatContextBlock(
  hits: SearchHit[],
  kbLabel: string,
): string {
  if (!hits.length) return '';
  const overview = isOverviewHits(hits);
  const header = overview
    ? `【知识库概览：${kbLabel}】（未命中关键词，已附上前若干片段）\n`
    : `【知识库检索：${kbLabel}】\n`;
  const parts = hits.map((h, i) => {
    const c = h.chunk;
    return `[#${i + 1} ${c.relativePath}]\n${c.text.slice(0, 800)}`;
  });
  return header + parts.join('\n\n') + '\n【检索结束】\n';
}

/** Explicit note when a mounted KB has no index chunks at all. */
export function formatEmptyIndexNote(kbName: string): string {
  return `【知识库「${kbName}」尚未有可用索引，请先在知识库页完成解析】\n`;
}

/** Banner naming attached KBs — always prepend when any kbIds selected. */
export function formatAttachedKbBanner(kbNames: string[]): string {
  if (!kbNames.length) return '';
  return `【已挂载知识库：${kbNames.join('、')}】\n`;
}
