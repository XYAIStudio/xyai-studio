/**
 * Dev-space agents (AI智能助手) — flat list, no org tree.
 * Only after push to 业务空间 / openXYOS + org assignment do they become AI员工.
 * See apps/desktop/AGENT-RAIL.md.
 */

export type DevAgent = {
  id: string;
  name: string;
  subtitle: string;
  /** Small badge text, e.g. "AI" */
  badge: string;
  /** Online-style status for the blue theme rail */
  status: 'online' | 'offline';
};

/** Hardcoded default general agent for 开发空间. */
export const DEFAULT_AGENT: DevAgent = {
  id: 'agent-general',
  name: '通用智能体',
  subtitle: 'AI智能助手',
  badge: 'AI',
  status: 'online',
};

export const DEV_AGENTS: readonly DevAgent[] = [DEFAULT_AGENT];

export function getAgentById(id: string): DevAgent | undefined {
  return DEV_AGENTS.find((a) => a.id === id);
}
