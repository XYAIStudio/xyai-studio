/**
 * Cindy-style compat: point Codex at an OpenAI-compatible endpoint
 * (DeepSeek etc.) via --config + env, without a full local proxy.
 */

import type { CustomProvider } from './custom-providers.js';

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
