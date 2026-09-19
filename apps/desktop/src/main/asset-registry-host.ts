/**
 * Desktop adapter for the Core dual-space registry.
 * Indexes personalize + workspace Forge outputs + OpenXYOS interop when present.
 * Does not invent a store.
 */

import type { AssetRegistryEntry, InteropAsset, InteropAssetKind } from '@xyai/contracts';
import {
  createAssetRegistry,
  type AssetPromoteFn,
  type AssetRegistrySnapshot,
  type AssetRegistrySourceRow,
  type ThinAssetRegistry,
} from '@xyai/core-runtime';
import type { PersonalAsset } from './personalize/types.js';

/**
 * @param assets Personalize catalog rows
 * @returns Snapshot rows for the Core indexer
 */
export function rowsFromPersonalize(
  assets: PersonalAsset[],
): AssetRegistrySourceRow[] {
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    ref: a.pathOrRef,
    description: a.description,
    linkedId: a.interopId,
  }));
}

/**
 * @param assets Workspace Forge discovery rows (same catalog fields)
 * @returns Snapshot rows tagged later as `origin: workspace`
 */
export function rowsFromWorkspace(
  assets: PersonalAsset[],
): AssetRegistrySourceRow[] {
  return rowsFromPersonalize(assets);
}

/**
 * @param assets OpenXYOS interop inbox/outbox rows
 * @returns Snapshot rows tagged later as `origin: openxyos`
 */
export function rowsFromInterop(
  assets: InteropAsset[],
): AssetRegistrySourceRow[] {
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    ref:
      typeof a.payload.pathOrRef === 'string'
        ? a.payload.pathOrRef
        : undefined,
    description: a.description,
  }));
}

export type AssetRegistrySnapshotLoader = () =>
  | AssetRegistrySnapshot
  | Promise<AssetRegistrySnapshot>;

let loadSnapshot: AssetRegistrySnapshotLoader | null = null;
let registry: ThinAssetRegistry = createAssetRegistry();

/**
 * @param next Snapshot loader + optional `pushToBiz` hook; null resets to empty
 */
export function configureAssetRegistry(
  next: {
    loadSnapshot: AssetRegistrySnapshotLoader;
    promote?: AssetPromoteFn;
  } | null,
): void {
  if (!next) {
    loadSnapshot = null;
    registry = createAssetRegistry();
    return;
  }
  loadSnapshot = next.loadSnapshot;
  registry = createAssetRegistry({ promote: next.promote });
}

/**
 * Re-index from the configured host stores.
 * Unconfigured / empty biz is a successful empty list.
 * @returns Current indexed rows
 */
export async function refreshAssetRegistry(): Promise<AssetRegistryEntry[]> {
  if (!loadSnapshot) {
    return registry.refresh({});
  }
  const snapshot = await loadSnapshot();
  return registry.refresh(snapshot);
}

/**
 * @returns Live in-memory registry (may be stale until {@link refreshAssetRegistry})
 */
export function getAssetRegistry(): ThinAssetRegistry {
  return registry;
}

/**
 * Map a registry kind onto the existing interop push kind.
 * @param kind Indexed kind
 * @returns Interop kind (`doc` → `knowledge-mount`)
 */
export function interopKindForRegistry(
  kind: AssetRegistryEntry['kind'],
): InteropAssetKind {
  return kind === 'doc' ? 'knowledge-mount' : kind;
}
