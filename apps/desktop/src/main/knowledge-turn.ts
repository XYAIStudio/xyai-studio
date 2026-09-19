/**
 * Desktop knowledge attach: KnowledgeHost (local index + ima/HTTP) as the
 * Core KnowledgeGateway adapter. Session send stays one path; empty mounts
 * and non-seeking queries (`你好`) are no-ops.
 */

import type {
  KnowledgeGateway,
  KnowledgeHit,
  KnowledgeQuery,
} from '@xyai/contracts';
import {
  applyKnowledgePrefix,
  resolveKnowledgeContext,
  stubKnowledgeIngest,
  type KnowledgeSourceInput,
} from '@xyai/core-runtime';
import type { KnowledgeHost } from './knowledge/knowledge-host.js';

export type KnowledgeTurnProvider = () => {
  gateway: KnowledgeGateway;
  sources: KnowledgeSourceInput[];
};

let provider: KnowledgeTurnProvider | null = null;

/**
 * @param next Factory that reads current KnowledgeHost mounts; null disables attach
 */
export function configureKnowledgeTurn(
  next: KnowledgeTurnProvider | null,
): void {
  provider = next;
}

/**
 * @param mounts KnowledgeHost mounts (local directory or configured cloud KB)
 * @returns Core source snapshots; empty when nothing is mounted
 */
export function sourcesFromMounts(
  mounts: { id: string; kind: 'local' | 'cloud'; name: string }[],
): KnowledgeSourceInput[] {
  return mounts
    .filter((m) => (m.id || '').trim())
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      displayName: m.name,
    }));
}

type StudioSearchHit = {
  score: number;
  chunk: {
    id: string;
    kbId: string;
    sourceKind: 'local' | 'cloud';
    title: string;
    relativePath: string;
    text: string;
    sourcePath: string;
    sourceUrl?: string;
  };
};

/** Minimal host surface so tests do not boot KnowledgeHost + disk stores. */
export interface StudioKnowledgeSearchHost {
  getState(): { mounts: { id: string; kind: 'local' | 'cloud'; name: string }[] };
  search(input: {
    kbIds: string[];
    query: string;
    limit?: number;
  }): Promise<{ hits: StudioSearchHit[] }>;
}

function hitFromStudio(h: StudioSearchHit): KnowledgeHit {
  const c = h.chunk;
  const title = (c.title || c.relativePath || c.id).trim();
  return {
    id: c.id,
    sourceKind: c.sourceKind,
    sourceId: c.kbId,
    title,
    snippet: (c.text || '').slice(0, 800),
    score: h.score,
    uri: c.sourceUrl || c.sourcePath,
  };
}

/**
 * Wrap KnowledgeHost as the Core gateway. Ingest stays a stub; parse/import
 * remain on the knowledge page and OpenXYOS `knowledge-mount` publish.
 * @param host Live KnowledgeHost (or a test double)
 * @returns Gateway whose `search` reads current mounts
 */
export function createStudioKnowledgeGateway(
  host: StudioKnowledgeSearchHost,
): KnowledgeGateway {
  return {
    async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
      const mounts = host.getState().mounts;
      const requested = query.sourceIds?.filter(Boolean) ?? [];
      const kbIds = (requested.length ? requested : mounts.map((m) => m.id)).filter(
        (id) => mounts.some((m) => m.id === id),
      );
      const text = (query.text || '').trim();
      if (!kbIds.length || !text) return [];
      const res = await host.search({
        kbIds,
        query: text,
        limit: query.limit ?? 8,
      });
      return (res.hits || []).map(hitFromStudio);
    },
    ingest: async (request) => stubKnowledgeIngest(request),
  };
}

/**
 * Prepend dual-source snippets onto the Session send payload.
 * Does not change TurnCapability / GatewayPlan.
 * @param query Original user text (or Composer-prefixed outbound)
 * @returns Same string when no-op; prefixed string when hits attach
 */
export async function maybeAttachKnowledgeContext(
  query: string,
): Promise<string> {
  if (!provider) return query;
  try {
    const { gateway, sources } = provider();
    const plan = await resolveKnowledgeContext({ query, sources, gateway });
    return applyKnowledgePrefix(query, plan);
  } catch {
    /* Knowledge adapter/search failure: Session turn continues without prefix. */
    return query;
  }
}

/**
 * Bind a live KnowledgeHost as the Session-turn provider.
 * @param host Desktop KnowledgeHost
 * @returns Gateway plus current mount snapshots
 */
export function knowledgeTurnFromHost(host: KnowledgeHost): {
  gateway: KnowledgeGateway;
  sources: KnowledgeSourceInput[];
} {
  return {
    gateway: createStudioKnowledgeGateway(host),
    sources: sourcesFromMounts(host.getState().mounts),
  };
}
