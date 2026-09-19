/** Dev ↔ biz asset registry — shared discovery over existing stores. Not an Agent Loop. */

import { normalizeForgeAssetKind, type ForgeAssetKind } from './forge.js';
import type { InteropAssetKind } from './xyos-bridge.js';

/** Product space an indexed asset lives in. */
export type AssetSpace = 'dev' | 'biz';

/** Host store that produced the row. Registry does not invent a fourth store. */
export type AssetRegistryOrigin = 'personalize' | 'workspace' | 'openxyos';

/** Catalog kind: Forge kinds plus OpenXYOS interop kinds. */
export type AssetRegistryKind = ForgeAssetKind | InteropAssetKind;

export const ASSET_SPACES: readonly AssetSpace[] = ['dev', 'biz'] as const;

export const ASSET_REGISTRY_ORIGINS: readonly AssetRegistryOrigin[] = [
  'personalize',
  'workspace',
  'openxyos',
] as const;

/** One indexed row. `ref` / `sourceId` point at the host-owned record. */
export interface AssetRegistryEntry {
  id: string;
  space: AssetSpace;
  kind: AssetRegistryKind;
  name: string;
  origin: AssetRegistryOrigin;
  /** Id in personalize, workspace discovery, or interop. */
  sourceId: string;
  /** Path, mount uri, or interop package ref. */
  ref?: string;
  description?: string;
  /** Counterpart registry id in the other space when linked. */
  linkedId?: string;
}

export interface AssetRegistryListFilter {
  space?: AssetSpace;
  kind?: string;
  origin?: AssetRegistryOrigin;
}

export interface AssetLinkResult {
  ok: boolean;
  noop?: boolean;
  entry?: AssetRegistryEntry;
  counterpart?: AssetRegistryEntry;
  message?: string;
}

export interface AssetPromoteResult {
  ok: boolean;
  /** True when biz root is absent, the row is already biz, or id is missing. */
  noop?: boolean;
  entry?: AssetRegistryEntry;
  message?: string;
}

/**
 * Dual-space catalog. Implementations index host snapshots; they do not persist.
 */
export interface AssetRegistry {
  /**
   * Indexed rows, optionally filtered by space / kind / origin.
   * @param filter Optional space, kind alias, or origin
   */
  list(filter?: AssetRegistryListFilter): AssetRegistryEntry[];
  /**
   * @param id Registry id (`dev:personalize:…`)
   * @returns Row or `undefined`
   */
  get(id: string): AssetRegistryEntry | undefined;
  /**
   * Record a cross-space pair in memory. Missing ids are a successful no-op.
   * @param devId Dev-space registry id
   * @param bizId Biz-space registry id
   */
  link(devId: string, bizId: string): AssetLinkResult;
  /**
   * Push a dev row toward biz. Without a biz root this is a successful no-op.
   * @param id Registry id
   */
  promote(id: string): Promise<AssetPromoteResult>;
}

const EXTRA_KIND_ALIASES: Record<string, AssetRegistryKind> = {
  'knowledge-mount': 'knowledge-mount',
  knowledgemount: 'knowledge-mount',
  知识挂接: 'knowledge-mount',
  'model-provider': 'model-provider',
  modelprovider: 'model-provider',
  connector: 'connector',
  connectors: 'connector',
};

/**
 * @param v Unknown kind from IPC, personalize, interop, or folder name
 * @returns Canonical registry kind, or `undefined` when unrecognized
 */
export function normalizeAssetRegistryKind(
  v: unknown,
): AssetRegistryKind | undefined {
  const forge = normalizeForgeAssetKind(v);
  if (forge) return forge;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return (
    EXTRA_KIND_ALIASES[trimmed.toLowerCase()] ?? EXTRA_KIND_ALIASES[trimmed]
  );
}

/**
 * @param v Unknown value
 * @returns True when `v` is {@link AssetSpace}
 */
export function isAssetSpace(v: unknown): v is AssetSpace {
  return v === 'dev' || v === 'biz';
}

/**
 * @param v Unknown value
 * @returns True when `v` is {@link AssetRegistryOrigin}
 */
export function isAssetRegistryOrigin(v: unknown): v is AssetRegistryOrigin {
  return v === 'personalize' || v === 'workspace' || v === 'openxyos';
}

/**
 * Stable registry id from space + origin + host source id.
 * @param space Dev or biz
 * @param origin Host store
 * @param sourceId Id in that store
 */
export function assetRegistryId(
  space: AssetSpace,
  origin: AssetRegistryOrigin,
  sourceId: string,
): string {
  return `${space}:${origin}:${sourceId}`;
}
