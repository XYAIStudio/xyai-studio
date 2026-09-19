/**
 * Which AgentRuntime drives a session.
 * Aligns with assembly harness ids: Codex first; `dsh` / `claude` are stubs.
 */

export type AgentKind = 'codex' | 'dsh' | 'claude';

export const AGENT_KINDS = ['codex', 'dsh', 'claude'] as const;

/**
 * @param v Unknown harness id or persisted value
 * @returns Whether `v` is a known AgentKind
 */
export function isAgentKind(v: unknown): v is AgentKind {
  return v === 'codex' || v === 'dsh' || v === 'claude';
}

/**
 * @param v Unknown harness id or persisted value
 * @returns A valid AgentKind; unknown values become `codex`
 */
export function normalizeAgentKind(v: unknown): AgentKind {
  return isAgentKind(v) ? v : 'codex';
}
