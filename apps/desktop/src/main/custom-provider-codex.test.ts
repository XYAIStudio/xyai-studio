import { describe, expect, it } from 'vitest';
import {
  CODEX_CUSTOM_ENV_KEY,
  CODEX_CUSTOM_PROVIDER_ID,
  customProviderCodexInjection,
  normalizeOpenAiCompatBaseUrl,
} from './custom-provider-codex.js';
import { normalizeCustomProvider } from './custom-providers.js';

describe('normalizeOpenAiCompatBaseUrl', () => {
  it('appends /v1 when missing', () => {
    expect(normalizeOpenAiCompatBaseUrl('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1',
    );
    expect(
      normalizeOpenAiCompatBaseUrl(
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      ),
    ).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });
});

describe('customProviderCodexInjection', () => {
  it('injects DeepSeek key + chat wire_api config', () => {
    const provider = normalizeCustomProvider({
      id: 'ds',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      protocol: 'chat-completions',
      apiKey: 'sk-test',
      models: [{ id: 'deepseek-chat', label: 'Chat' }],
    })!;
    const inj = customProviderCodexInjection(provider, 'deepseek-chat');
    expect(inj.extraEnv[CODEX_CUSTOM_ENV_KEY]).toBe('sk-test');
    expect(inj.configOverrides).toEqual(
      expect.arrayContaining([
        `model_provider="${CODEX_CUSTOM_PROVIDER_ID}"`,
        'model="deepseek-chat"',
        `model_providers.${CODEX_CUSTOM_PROVIDER_ID}.base_url="https://api.deepseek.com/v1"`,
        `model_providers.${CODEX_CUSTOM_PROVIDER_ID}.wire_api="chat"`,
        `model_providers.${CODEX_CUSTOM_PROVIDER_ID}.env_key="${CODEX_CUSTOM_ENV_KEY}"`,
      ]),
    );
  });
});
