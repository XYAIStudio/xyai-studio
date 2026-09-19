/**
 * Thin dual-space asset index. Hosts supply personalize / workspace / OpenXYOS
 * snapshots; Core does not invent a store or an Agent Loop.
 */

import {
  assetRegistryId,
  normalizeAssetRegistryKind,
  type AssetLinkResult,
  type AssetPromoteResult,
  type AssetRegistry,
  type AssetRegistryEntry,
  type AssetRegistryKind,
  type AssetRegistryListFilter,
  type AssetRegistryOrigin,
  type AssetSpace,
} from '@xyai/contracts';

export type {
  AssetLinkResult,
  AssetPromoteResult,
  AssetRegistry,
  AssetRegistryEntry,
  AssetRegistryKind,
  AssetRegistryListFilter,
  AssetRegistryOrigin,
  AssetSpace,
};

/** Loose host row before index (personalize, workspace folder, interop). */
export interface AssetRegistrySourceRow {
  id: string;
  name: string;
  kind?: string;
  ref?: string;
  description?: string;
  linkedId?: string;
}

/**
 * Snapshot of existing stores. `openxyos` omitted/empty when the biz root
 * is absent; `bizRootPresent` false makes {@link AssetRegistry.promote} a no-op.
 */
export interface AssetRegistrySnapshot {
  personalize?: AssetRegistrySourceRow[];
  workspace?: AssetRegistrySourceRow[];
  openxyos?: AssetRegistrySourceRow[];
  links?: Array<{ devId: string; bizId: string }>;
  bizRootPresent?: boolean;
}

/** Host hook that actually calls interop `pushToBiz`. */
export type AssetPromoteFn = (
  entry: AssetRegistryEntry,
) => Promise<unknown> | unknown;

export interface CreateAssetRegistryInput {
  snapshot?: AssetRegistrySnapshot;
  promote?: AssetPromoteFn;
}

/** In-memory registry plus `refresh` so the host can re-index after writes. */
export interface ThinAssetRegistry extends AssetRegistry {
  /**
   * Replace the index from a new host snapshot. In-memory links survive.
   * @param snapshot Personalize + workspace + optional OpenXYOS rows
   */
  refresh(snapshot: AssetRegistrySnapshot): AssetRegistryEntry[];
}

const ORIGIN_SPACE: Record<AssetRegistryOrigin, AssetSpace> = {
  personalize: 'dev',
  workspace: 'dev',
  openxyos: 'biz',
};

const ORIGIN_ORDER: Record<AssetRegistryOrigin, number> = {
  personalize: 0,
  workspace: 1,
  openxyos: 2,
};

function asRow(
  row: AssetRegistrySourceRow,
  origin: AssetRegistryOrigin,
): AssetRegistryEntry | null {
  const sourceId = (row.id || '').trim();
  const name = (row.name || '').trim();
  const kind = normalizeAssetRegistryKind(row.kind);
  if (!sourceId || !name || !kind) return null;
  const space = ORIGIN_SPACE[origin];
  const ref = (row.ref || '').trim();
  const description = (row.description || '').trim();
  const linkedHint = (row.linkedId || '').trim();
  return {
    id: assetRegistryId(space, origin, sourceId),
    space,
    kind,
    name,
    origin,
    sourceId,
    ...(ref ? { ref } : {}),
    ...(description ? { description } : {}),
    ...(linkedHint ? { linkedId: linkedHint } : {}),
  };
}

function collect(
  rows: AssetRegistrySourceRow[] | undefined,
  origin: AssetRegistryOrigin,
  seen: Set<string>,
  out: AssetRegistryEntry[],
): void {
  for (const row of rows ?? []) {
    const entry = asRow(row, origin);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
}

function applyLink(
  byId: Map<string, AssetRegistryEntry>,
  devId: string,
  bizId: string,
): void {
  const dev = byId.get(devId);
  const biz = byId.get(bizId);
  if (!dev || !biz) return;
  if (dev.space !== 'dev' || biz.space !== 'biz') return;
  dev.linkedId = biz.id;
  biz.linkedId = dev.id;
}

function sortEntries(entries: AssetRegistryEntry[]): AssetRegistryEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.space !== b.space) return a.space === 'dev' ? -1 : 1;
    if (a.origin !== b.origin) {
      return ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin];
    }
    return a.name.localeCompare(b.name, 'zh');
  });
}

/**
 * Merge personalize + workspace (dev) and OpenXYOS (biz) into one list.
 * Same `sourceId` across spaces is auto-linked. Empty input is an empty list.
 * @param snapshot Host store rows; OpenXYOS omitted when the biz root is absent
 */
export function indexAssetRegistry(
  snapshot: AssetRegistrySnapshot | undefined,
): AssetRegistryEntry[] {
  if (!snapshot) return [];
  const seen = new Set<string>();
  const out: AssetRegistryEntry[] = [];
  collect(snapshot.personalize, 'personalize', seen, out);
  collect(snapshot.workspace, 'workspace', seen, out);
  collect(snapshot.openxyos, 'openxyos', seen, out);

  const byId = new Map(out.map((e) => [e.id, e]));
  const bySource = new Map<string, AssetRegistryEntry[]>();
  for (const entry of out) {
    const group = bySource.get(entry.sourceId) ?? [];
    group.push(entry);
    bySource.set(entry.sourceId, group);
  }
  for (const group of bySource.values()) {
    const dev = group.find((e) => e.space === 'dev');
    const biz = group.find((e) => e.space === 'biz');
    if (dev && biz) applyLink(byId, dev.id, biz.id);
  }
  for (const pair of snapshot.links ?? []) {
    applyLink(byId, pair.devId, pair.bizId);
  }
  return sortEntries(out);
}

function matchesFilter(
  entry: AssetRegistryEntry,
  filter: AssetRegistryListFilter | undefined,
): boolean {
  if (!filter) return true;
  if (filter.space && entry.space !== filter.space) return false;
  if (filter.origin && entry.origin !== filter.origin) return false;
  if (filter.kind) {
    const kind = normalizeAssetRegistryKind(filter.kind);
    if (kind && entry.kind !== kind) return false;
  }
  return true;
}

class InMemoryAssetRegistry implements ThinAssetRegistry {
  private entries: AssetRegistryEntry[] = [];
  private byId = new Map<string, AssetRegistryEntry>();
  private links = new Map<string, string>();
  private bizRootPresent = false;
  private readonly promoteFn: AssetPromoteFn | undefined;

  constructor(input?: CreateAssetRegistryInput) {
    this.promoteFn = input?.promote;
    this.refresh(input?.snapshot ?? {});
  }

  refresh(snapshot: AssetRegistrySnapshot): AssetRegistryEntry[] {
    this.bizRootPresent = Boolean(snapshot.bizRootPresent);
    const persisted: Array<{ devId: string; bizId: string }> = [];
    for (const [from, to] of this.links) {
      const left = this.byId.get(from);
      if (left?.space === 'dev') persisted.push({ devId: from, bizId: to });
    }
    const indexed = indexAssetRegistry({
      ...snapshot,
      links: [...persisted, ...(snapshot.links ?? [])],
    });
    this.entries = indexed;
    this.byId = new Map(indexed.map((e) => [e.id, e]));
    this.links.clear();
    for (const e of indexed) {
      if (e.linkedId) this.links.set(e.id, e.linkedId);
    }
    return this.list();
  }

  list(filter?: AssetRegistryListFilter): AssetRegistryEntry[] {
    return this.entries.filter((e) => matchesFilter(e, filter));
  }

  get(id: string): AssetRegistryEntry | undefined {
    return this.byId.get((id || '').trim());
  }

  link(devId: string, bizId: string): AssetLinkResult {
    const dev = this.get(devId);
    const biz = this.get(bizId);
    if (!dev || !biz) {
      return { ok: true, noop: true, message: 'missing-entry' };
    }
    if (dev.space !== 'dev' || biz.space !== 'biz') {
      return { ok: true, noop: true, message: 'space-mismatch' };
    }
    applyLink(this.byId, dev.id, biz.id);
    this.links.set(dev.id, biz.id);
    this.links.set(biz.id, dev.id);
    return { ok: true, entry: dev, counterpart: biz };
  }

  async promote(id: string): Promise<AssetPromoteResult> {
    const entry = this.get(id);
    if (!entry) {
      return { ok: true, noop: true, message: 'missing-entry' };
    }
    if (!this.bizRootPresent) {
      return { ok: true, noop: true, entry, message: 'no-biz-root' };
    }
    if (entry.space === 'biz') {
      return { ok: true, noop: true, entry, message: 'already-biz' };
    }
    if (!this.promoteFn) {
      return { ok: true, noop: true, entry, message: 'no-promote-hook' };
    }
    await this.promoteFn(entry);
    return { ok: true, entry };
  }
}

/**
 * In-memory registry over a host snapshot. Empty snapshot → empty list.
 * Promote is a successful no-op when `bizRootPresent` is false.
 * @param input Optional snapshot and host `pushToBiz` hook
 */
export function createAssetRegistry(
  input?: CreateAssetRegistryInput,
): ThinAssetRegistry {
  return new InMemoryAssetRegistry(input);
}
