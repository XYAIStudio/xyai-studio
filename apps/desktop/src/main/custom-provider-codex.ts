/**
 * Cindy-style compat: point Codex at an OpenAI-compatible endpoint
 * (DeepSeek etc.) via --config + env. A full loopback proxy is not required:
 * Chat Completions / Responses brains inject into the same AgentRuntime.
 */

import type { CustomProvider, CustomProviderProtocol } from './custom-providers.js';

export const CODEX_CUSTOM_PROVIDER_ID = 'xyai';
export const CODEX_CUSTOM_ENV_KEY = 'OPENAI_API_KEY';

export interface CodexProviderInjection {
  extraEnv: Record<string, string>;
  configOverrides: string[];
}

function tomlQuoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Codex model_providers.base_url should end with /v1.
 * DashScope / Ollama presets already include it.
 */
export function normalizeOpenAiCompatBaseUrl(url: string): string {
  const t = (url || '').trim().replace(/\/+$/, '');
  if (!t) return t;
  if (/\/v1$/i.test(t)) return t;
  return `${t}/v1`;
}

/**
 * @param provider Saved custom provider (base URL + API key)
 * @param modelId Bare model id for Codex `-m` / config model=
 */
export function customProviderCodexInjection(
  provider: CustomProvider,
  modelId: string,
): CodexProviderInjection {
  const baseUrl = normalizeOpenAiCompatBaseUrl(provider.baseUrl);
  const extraEnv: Record<string, string> = {};
  const key = (provider.apiKey || '').trim();
  if (key) extraEnv[CODEX_CUSTOM_ENV_KEY] = key;

  const wireApi =
    provider.protocol === 'openai-responses' ? 'responses' : 'chat';
  const id = CODEX_CUSTOM_PROVIDER_ID;
  const configOverrides = [
    `model_provider=${tomlQuoted(id)}`,
    `model=${tomlQuoted(modelId)}`,
    `model_providers.${id}.name=${tomlQuoted(provider.name || 'custom')}`,
    `model_providers.${id}.base_url=${tomlQuoted(baseUrl)}`,
    `model_providers.${id}.env_key=${tomlQuoted(CODEX_CUSTOM_ENV_KEY)}`,
    `model_providers.${id}.wire_api=${tomlQuoted(wireApi)}`,
  ];
  return { extraEnv, configOverrides };
}

/**
 * Chat Completions and Responses can drive Codex tools via injection.
 * Anthropic Messages has no Codex wire in this connect layer.
 * @param protocol Saved custom-provider protocol
 */
export function openaiCompatDrivesCodexTools(
  protocol: CustomProviderProtocol,
): boolean {
  return protocol === 'chat-completions' || protocol === 'openai-responses';
}

const DEEPSEEK_STRICT_RE =
  /deepseek-v4|deepseek-chat|deepseek-reasoner|^deepseek\//i;

/**
 * DeepSeek V4 (and current `deepseek-chat` / `deepseek-reasoner` aliases)
 * reject unnamed Codex tools such as `tool_search` / `web_search`.
 * Cindy's `codex-proxy-host` sanitizes the same class of tools before forward.
 * @param tools Request `tools` array (OpenAI-compat / Responses)
 * @param modelId Bare model id; non-DeepSeek ids are left unchanged
 */
export function sanitizeDeepSeekV4CustomTools(
  tools: unknown,
  modelId?: string,
): unknown {
  if (!Array.isArray(tools)) return tools;
  if (modelId && !DEEPSEEK_STRICT_RE.test(modelId.trim())) return tools;
  return tools.filter((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const rec = tool as Record<string, unknown>;
    if (typeof rec.name === 'string' && rec.name.trim()) return true;
    const fn = rec.function;
    if (fn && typeof fn === 'object') {
      const name = (fn as Record<string, unknown>).name;
      return typeof name === 'string' && Boolean(name.trim());
    }
    return false;
  });
}
