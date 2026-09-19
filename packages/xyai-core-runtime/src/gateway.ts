/**
 * Model gateway: modelRef + TurnCapability → stream vs AgentRuntime(Codex).
 * Does not run an Agent Loop; the host injects the provider and starts the adapter.
 */

import {
  isToolCapability,
  normalizeModelRef,
  parseCustomModelRef,
  protocolDrivesCodexTools,
  toCodexModelId,
  toOllamaModelName,
  type CatalogProtocol,
  type GatewayLift,
  type GatewayPlan,
  type PlanModelGatewayInput,
} from '@xyai/contracts';

/**
 * Infer protocol from the modelRef kind when the catalog did not supply one.
 * Custom refs default to Chat Completions (DeepSeek / OpenAI-compat).
 * @param modelRef Canonical or legacy model id
 */
export function inferProtocolFromRef(modelRef: string): CatalogProtocol {
  const custom = parseCustomModelRef(modelRef);
  if (custom) return 'chat-completions';
  if (toOllamaModelName(modelRef)) return 'ollama';
  return 'codex';
}

/**
 * Single routing plan for local + cloud models.
 * PermissionMode is not an input: approval never chooses stream vs tools.
 * @param input modelRef, text-inferred capability, optional lift / protocol
 * @returns Stream plan or Codex agent plan (plus Anthropic tools gap when needed)
 */
export function planModelGateway(input: PlanModelGatewayInput): GatewayPlan {
  const capability = input.capability;
  const modelRef = normalizeModelRef(input.modelRef);
  const lift: GatewayLift = input.lift ?? 'auto';
  const toolsWanted = isToolCapability(capability);
  const protocol = input.protocol ?? inferProtocolFromRef(modelRef);

  const custom = parseCustomModelRef(modelRef);
  if (custom) {
    // Chat / knowledge Q&A always stream for OpenAI-compat (DeepSeek etc.) —
    // never Codex tools-first then write-fallback tip. Tools turns may still lift.
    const wantsAgent = lift !== 'never' && toolsWanted;
    const stream = {
      kind: 'openai-compat' as const,
      modelId: custom.modelId,
      providerId: custom.providerId,
    };
    if (wantsAgent && !protocolDrivesCodexTools(protocol)) {
      return {
        mode: 'stream',
        capability,
        modelRef,
        stream,
        gap: 'anthropic-messages',
      };
    }
    if (wantsAgent) {
      return {
        mode: 'agent',
        capability,
        modelRef,
        agent: {
          runtime: 'codex',
          modelId: custom.modelId,
          injectProviderId: custom.providerId,
        },
      };
    }
    return { mode: 'stream', capability, modelRef, stream };
  }

  const ollama = toOllamaModelName(modelRef);
  if (ollama) {
    const wantsAgent =
      lift === 'always' ? true : lift === 'never' ? false : toolsWanted;
    if (wantsAgent || input.ollamaViaHarness === true) {
      return {
        mode: 'agent',
        capability,
        modelRef,
        agent: {
          runtime: 'codex',
          modelId: ollama,
          oss: true,
          localProvider: 'ollama',
        },
      };
    }
    return {
      mode: 'stream',
      capability,
      modelRef,
      stream: { kind: 'ollama', modelId: ollama },
    };
  }

  return {
    mode: 'agent',
    capability,
    modelRef,
    agent: { runtime: 'codex', modelId: toCodexModelId(modelRef) },
  };
}
