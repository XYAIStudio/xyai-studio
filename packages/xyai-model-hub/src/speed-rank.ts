/**
 * Rank local hub rows by measured tok/s. Scored chat models first (fastest
 * first); pending / unscored eligible chat next; ineligible (mmproj, embed,
 * not live in Ollama) last.
 */

export type SpeedRank = {
  tokensPerSec?: number;
  pending?: boolean;
};

export type HubSpeedRow = {
  eligible: boolean;
  rank?: SpeedRank;
};

export type SpeedEligibleView = {
  id?: string;
  displayName?: string;
  path?: string;
  role?: string;
  version?: string;
  installed?: boolean;
  availableInOllama?: boolean;
};

export function isSpeedEligibleChatModel(view: SpeedEligibleView): boolean {
  const live = view.availableInOllama === true || view.installed === true;
  if (!live) return false;
  if (view.role === 'embedding' || view.role === 'rerank') return false;
  const blob = `${view.id || ''} ${view.displayName || ''} ${view.path || ''} ${view.version || ''}`;
  return !/mmproj|mm-proj|projector/i.test(blob);
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

export type SpeedLookup = {
  ok: boolean;
  tokensPerSec?: number;
};

/** Snapshot / host helper: rank `ModelEntry`-like rows from a persisted map. */
export function hubSpeedRowForEntry(
  entry: SpeedEligibleView & { id?: string; displayName?: string },
  lookup: (ref: string | undefined) => SpeedLookup | undefined,
): HubSpeedRow {
  const eligible = isSpeedEligibleChatModel(entry);
  const hit = lookup(entry.id) || lookup(entry.displayName);
  return {
    eligible,
    rank: hit?.ok && hit.tokensPerSec != null ? { tokensPerSec: hit.tokensPerSec } : undefined,
  };
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
