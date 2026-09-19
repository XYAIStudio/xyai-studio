/**
 * Internal harness router (product never surfaces brand names).
 * Picks which AgentRuntime drives a turn; always keeps a streaming path.
 */
export type CapabilityNeed =
  | 'chat' // 真流式对话资格线
  | 'tools' // 工具 / 改文件
  | 'planning'; // 长任务规划

export type HarnessCandidate = 'codex' | 'dsh' | 'local-stream';

export interface RouteDecision {
  harness: HarnessCandidate;
  reason: string;
}

export interface HarnessHealth {
  codexReady: boolean;
  dshReady: boolean;
  localStreamReady: boolean;
}

/** Prefer mature harness when healthy; never block chat on missing binaries. */
export function chooseHarness(
  need: CapabilityNeed,
  health: HarnessHealth,
): RouteDecision {
  if (need === 'chat') {
    if (health.codexReady) return { harness: 'codex', reason: 'codex healthy' };
    if (health.dshReady) return { harness: 'dsh', reason: 'dsh healthy' };
    return { harness: 'local-stream', reason: 'stream qualification path' };
  }
  if (health.codexReady) return { harness: 'codex', reason: 'tools/planning via codex' };
  if (health.dshReady) return { harness: 'dsh', reason: 'tools/planning via dsh' };
  return { harness: 'local-stream', reason: 'degrade to stream, soft tip upstream' };
}
