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
