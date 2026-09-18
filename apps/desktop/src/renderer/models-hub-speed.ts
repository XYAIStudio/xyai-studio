/**
 * Local hub list: rank by last 测速 (fastest first) and Chinese chips.
 * Mirrors @xyai/model-hub speed-rank — renderer stays free of Node packages.
 */

import { isProjectorModel, type HubModelView } from './models-hub-actions.js';

export type SpeedRank = {
  tokensPerSec?: number;
  pending?: boolean;
};

export type StoredSpeedView = {
  ok: boolean;
  tokensPerSec?: number;
};

export type HubSpeedRow = {
  eligible: boolean;
  rank?: SpeedRank;
};

export function speedModelKey(modelRef: string): string {
  return modelRef.replace(/^ollama:/i, '').replace(/:latest$/i, '').toLowerCase();
}

export function lookupStoredSpeed(
  results: Record<string, StoredSpeedView>,
  ...refs: Array<string | undefined>
): StoredSpeedView | undefined {
  for (const ref of refs) {
    if (!ref) continue;
    const hit = results[speedModelKey(ref)];
    if (hit) return hit;
  }
  return undefined;
}

export function isSpeedEligibleChatModel(
  view: HubModelView & { role?: string },
): boolean {
  if (view.availableInOllama !== true) return false;
  if (view.role === 'embedding' || view.role === 'rerank') return false;
  return !isProjectorModel(view);
}

export function compareSpeedRanks(
  a: SpeedRank | undefined,
  b: SpeedRank | undefined,
): number {
  const aScore = a?.tokensPerSec;
  const bScore = b?.tokensPerSec;
  const aHas = aScore != null && Number.isFinite(aScore);
  const bHas = bScore != null && Number.isFinite(bScore);
  if (aHas && bHas && aScore !== bScore) return bScore - aScore;
  if (aHas !== bHas) return aHas ? -1 : 1;
  const aPend = Boolean(a?.pending);
  const bPend = Boolean(b?.pending);
  if (aPend !== bPend) return aPend ? -1 : 1;
  return 0;
}

export function compareHubSpeedRows(a: HubSpeedRow, b: HubSpeedRow): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  return compareSpeedRanks(a.rank, b.rank);
}

export function sortByHubSpeed<T>(
  items: T[],
  rowOf: (item: T) => HubSpeedRow,
): T[] {
  return [...items].sort((left, right) =>
    compareHubSpeedRows(rowOf(left), rowOf(right)),
  );
}

export function formatSpeedChip(
  rank: SpeedRank | undefined,
  eligible: boolean,
): { text: string; kind: 'score' | 'pending' | 'none' } | null {
  if (!eligible) return null;
  if (rank?.pending) return { text: '测速中', kind: 'pending' };
  if (rank?.tokensPerSec != null && Number.isFinite(rank.tokensPerSec)) {
    return { text: `${rank.tokensPerSec.toFixed(1)} tok/s`, kind: 'score' };
  }
  return { text: '未测速', kind: 'none' };
}

export function rankFromStored(
  stored: StoredSpeedView | undefined,
  pending: boolean,
): SpeedRank | undefined {
  if (stored?.ok && stored.tokensPerSec != null) {
    return { tokensPerSec: stored.tokensPerSec, pending };
  }
  return pending ? { pending: true } : undefined;
}

export function refsNeedingAutoSpeed(
  views: Array<HubModelView & { modelRef: string; role?: string }>,
  results: Record<string, StoredSpeedView>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const view of views) {
    if (!isSpeedEligibleChatModel(view)) continue;
    const key = speedModelKey(view.modelRef);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = lookupStoredSpeed(results, view.modelRef, view.id, view.displayName);
    if (hit?.ok) continue;
    out.push(view.modelRef);
  }
  return out;
}
