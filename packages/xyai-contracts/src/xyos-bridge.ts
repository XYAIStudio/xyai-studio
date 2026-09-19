/** OpenXYOS 宿主侧桥接契约 */

export interface XyosHealthStatus {
  ok: boolean;
  reason?: string;
  version?: string;
  details?: Record<string, unknown>;
}

export interface XyosBridge {
  healthCheck(): Promise<XyosHealthStatus>;
}

/** Dev ↔ Biz asset interop (Studio local bridge MVP). */
export type InteropAssetKind =
  | 'agent'
  | 'knowledge-mount'
  | 'model-provider'
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'connector';

export type InteropDirection = 'dev-to-biz' | 'biz-to-dev';

export type InteropAssetStatus = 'pending' | 'installed' | 'selected';

export interface InteropAsset {
  id: string;
  kind: InteropAssetKind;
  name: string;
  description?: string;
  /** Opaque package payload (agent meta, mount snapshot, provider meta, personalize manifest). */
  payload: Record<string, unknown>;
  direction: InteropDirection;
  status: InteropAssetStatus;
  createdAt: string;
  updatedAt: string;
  /** Origin space label for UI. */
  sourceSpace: 'dev' | 'biz';
}

export interface XyosInteropBridge {
  listOutgoingAssets(): Promise<InteropAsset[]>;
  listIncomingAssets(): Promise<InteropAsset[]>;
  pushToBiz(asset: Omit<InteropAsset, 'id' | 'direction' | 'status' | 'createdAt' | 'updatedAt' | 'sourceSpace'> & {
    id?: string;
  }): Promise<InteropAsset>;
  pullInstallFromBiz(assetId: string): Promise<InteropAsset>;
  registerInDev(assetId: string): Promise<InteropAsset>;
  installIncoming(assetId: string): Promise<InteropAsset>;
  selectAsset(assetId: string, space: 'dev' | 'biz'): Promise<InteropAsset>;
}

/** Personalize kinds that sync via /api/xyai/personalize (+ file bridge). */
export const INTEROP_PERSONALIZE_KINDS: readonly InteropAssetKind[] = [
  'skill',
  'plugin',
  'mcp',
  'connector',
] as const;

export function isInteropPersonalizeKind(
  kind: string,
): kind is 'skill' | 'plugin' | 'mcp' | 'connector' {
  return (
    kind === 'skill' ||
    kind === 'plugin' ||
    kind === 'mcp' ||
    kind === 'connector'
  );
}
