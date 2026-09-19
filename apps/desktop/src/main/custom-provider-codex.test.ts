import { describe, expect, it } from 'vitest';
import {
  CODEX_CUSTOM_ENV_KEY,
  CODEX_CUSTOM_PROVIDER_ID,
  customProviderCodexInjection,
  normalizeOpenAiCompatBaseUrl,
  openaiCompatDrivesCodexTools,
  sanitizeDeepSeekV4CustomTools,
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

describe('openaiCompatDrivesCodexTools', () => {
  it('allows Chat Completions and Responses; not Anthropic Messages', () => {
    expect(openaiCompatDrivesCodexTools('chat-completions')).toBe(true);
    expect(openaiCompatDrivesCodexTools('openai-responses')).toBe(true);
    expect(openaiCompatDrivesCodexTools('anthropic-messages')).toBe(false);
  });
});

describe('sanitizeDeepSeekV4CustomTools', () => {
  it('drops unnamed tools for DeepSeek V4 / chat aliases', () => {
    const tools = [
      { type: 'function', function: { name: 'write_file' } },
      { type: 'tool_search' },
      { type: 'web_search' },
      { name: 'apply_patch' },
    ];
    expect(sanitizeDeepSeekV4CustomTools(tools, 'deepseek-v4-flash')).toEqual([
      { type: 'function', function: { name: 'write_file' } },
      { name: 'apply_patch' },
    ]);
    expect(sanitizeDeepSeekV4CustomTools(tools, 'deepseek-chat')).toHaveLength(
      2,
    );
  });

  it('leaves non-DeepSeek tools unchanged', () => {
    const tools = [{ type: 'web_search' }];
    expect(sanitizeDeepSeekV4CustomTools(tools, 'gpt-4o')).toEqual(tools);
  });
});
