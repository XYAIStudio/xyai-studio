/**
 * Renderer-memory session ↔ agent binding.
 * Prefer minimal: Map sessionId→agentId; new sessions inherit selected agent.
 * Host SessionSummary is unchanged (no contracts change required).
 */

import { DEFAULT_AGENT } from './agents.js';

const sessionAgentMap = new Map<string, string>();

let selectedAgentId: string = DEFAULT_AGENT.id;

export function getSelectedAgentId(): string {
  return selectedAgentId;
}

export function setSelectedAgentId(id: string): void {
  selectedAgentId = id || DEFAULT_AGENT.id;
}

export function bindSessionAgent(sessionId: string, agentId: string): void {
  if (!sessionId) return;
  sessionAgentMap.set(sessionId, agentId || DEFAULT_AGENT.id);
}

export function getSessionAgentId(sessionId: string): string {
  return sessionAgentMap.get(sessionId) || DEFAULT_AGENT.id;
}

/** Ensure every known session has a binding (default → general). */
export function ensureBindings(sessionIds: string[]): void {
  for (const id of sessionIds) {
    if (!sessionAgentMap.has(id)) {
      sessionAgentMap.set(id, DEFAULT_AGENT.id);
    }
  }
}

export function unbindSession(sessionId: string): void {
  sessionAgentMap.delete(sessionId);
}

export function filterSessionIdsByAgent(
  sessionIds: string[],
  agentId: string,
): string[] {
  return sessionIds.filter((id) => getSessionAgentId(id) === agentId);
}
