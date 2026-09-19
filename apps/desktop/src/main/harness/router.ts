/**
 * Internal harness router (product never surfaces brand names).
 * Picks which AgentRuntime drives a turn; always keeps a streaming path.
 * Respects settings.engineMode; auto never blocks chat on a missing harness.
 */

import type { EngineMode } from '../engine-mode.js';

export type CapabilityNeed =
  | 'chat' // 真流式对话资格线
  | 'tools' // 工具 / 改文件
  | 'planning'; // 长任务规划

export type HarnessCandidate = 'codex' | 'dsh' | 'claude' | 'local-stream';

export interface RouteDecision {
  harness: HarnessCandidate;
  reason: string;
}

export interface HarnessHealth {
  codexReady: boolean;
  dshReady: boolean;
  localStreamReady: boolean;
}

/**
 * Prefer local stream for chat. Tool/create/planning uses Codex when healthy.
 * Auto never blocks chitchat on a missing binary. accessMode is not an input.
 */
export function chooseHarness(
  need: CapabilityNeed,
  health: HarnessHealth,
  engineMode: EngineMode = 'auto',
): RouteDecision {
  if (engineMode === 'local-stream') {
    return { harness: 'local-stream', reason: 'explicit local stream' };
  }

  const wantsTools = need === 'tools' || need === 'planning';

  if (engineMode === 'codex-oss') {
    if (health.codexReady) {
      return { harness: 'codex', reason: 'explicit local engine' };
    }
    return {
      harness: 'local-stream',
      reason: wantsTools
        ? 'explicit local engine missing'
        : 'explicit local engine missing, soft fallback',
    };
  }

  if (engineMode === 'dsh') {
    if (health.dshReady) return { harness: 'dsh', reason: 'explicit dsh' };
    if (wantsTools && health.codexReady) {
      return { harness: 'codex', reason: 'dsh stub, tools via write path' };
    }
    return { harness: 'local-stream', reason: 'dsh stub, soft fallback' };
  }

  if (engineMode === 'claude') {
    if (wantsTools && health.codexReady) {
      return {
        harness: 'codex',
        reason: 'claude stub, tools via advanced engine',
      };
    }
    return { harness: 'local-stream', reason: 'claude stub, soft fallback' };
  }

  // auto
  if (!wantsTools) {
    return { harness: 'local-stream', reason: 'auto: stream qualification' };
  }
  if (health.codexReady) {
    return { harness: 'codex', reason: 'auto: tools/planning via codex' };
  }
  if (health.dshReady) {
    return { harness: 'dsh', reason: 'auto: tools/planning via dsh' };
  }
  return { harness: 'local-stream', reason: 'auto: degrade to stream' };
}

/**
 * Whether this turn should spawn the Codex harness (local OSS or cloud brain).
 * Assumes Codex is packaged; host treats a missing binary as a packaging defect
 * on tool turns instead of silently staying on bare chat.
 */
export function turnUsesHarness(
  engineMode: EngineMode,
  need: CapabilityNeed = 'chat',
): boolean {
  const decision = chooseHarness(
    need,
    { codexReady: true, dshReady: false, localStreamReady: true },
    engineMode,
  );
  return decision.harness === 'codex';
}

/**
 * Whether an ollama:* turn should use Codex --oss.
 * Auto + chat stays on direct stream; tools/planning lift to harness.
 */
export function ollamaTurnUsesHarness(
  engineMode: EngineMode,
  need: CapabilityNeed = 'chat',
): boolean {
  return turnUsesHarness(engineMode, need);
}
