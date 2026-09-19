/** Model gateway plan — stream-only vs AgentRuntime(Codex). Not an Agent Loop. */

import type { CatalogProtocol } from './model-catalog.js';
import type { TurnCapability } from './turn-capability.js';

/** How aggressively chat lifts onto the write runtime. */
export type GatewayLift = 'auto' | 'always' | 'never';

export type GatewayMode = 'stream' | 'agent';

export type GatewayStreamKind = 'ollama' | 'openai-compat';

export interface GatewayStreamPlan {
  kind: GatewayStreamKind;
  modelId: string;
  providerId?: string;
}

export interface GatewayAgentPlan {
  runtime: 'codex';
  modelId: string;
  oss?: boolean;
  localProvider?: 'ollama';
  /** Custom/cloud provider to inject via Codex `--config` + env. */
  injectProviderId?: string;
}

/** Protocols that cannot drive Codex tools yet. */
export type GatewayGap = 'anthropic-messages';

export interface GatewayPlan {
  mode: GatewayMode;
  capability: TurnCapability;
  modelRef: string;
  stream?: GatewayStreamPlan;
  agent?: GatewayAgentPlan;
  gap?: GatewayGap;
}

export interface PlanModelGatewayInput {
  modelRef: string;
  capability: TurnCapability;
  /** Default `auto`: chat stays on stream; tools/planning lift to Codex. */
  lift?: GatewayLift;
  /** When true, `ollama:*` chat also uses Codex `--oss`. */
  ollamaViaHarness?: boolean;
  /** Wire protocol of the selected model (from catalog / saved provider). */
  protocol?: CatalogProtocol;
}

/**
 * Chat Completions, Responses, Ollama, and builtin Codex can drive the tools path.
 * Anthropic Messages cannot (no Messages→Codex adapter in this connect layer).
 * @param protocol Catalog / provider protocol
 */
export function protocolDrivesCodexTools(protocol: CatalogProtocol): boolean {
  return protocol !== 'anthropic-messages';
}
