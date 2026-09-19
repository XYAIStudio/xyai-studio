import { describe, expect, it } from 'vitest';
import { findCatalogEntry, mapCatalogProtocol, normalizeGatewayCatalog } from './catalog.js';

describe('normalizeGatewayCatalog', () => {
  it('lists local Ollama + cloud custom + builtin in one list', () => {
    const rows = normalizeGatewayCatalog({
      local: [
        {
          id: 'ollama:qwen3:8b',
          displayName: 'qwen3:8b',
          installed: true,
          role: 'chat',
          source: 'ollama',
        },
        {
          id: 'ollama:nomic-embed-text',
          displayName: 'nomic-embed-text',
          installed: true,
          role: 'embedding',
        },
        {
          id: 'ollama:stale',
          displayName: 'stale',
          installed: false,
          role: 'chat',
        },
      ],
      custom: [
        {
          id: 'ds',
          name: 'DeepSeek',
          protocol: 'chat-completions',
          models: [
            { id: 'deepseek-chat', label: 'DeepSeek Chat' },
            { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
          ],
        },
        {
          id: 'anth',
          name: 'Anthropic',
          protocol: 'anthropic-messages',
          models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
        },
      ],
      builtin: [{ id: 'gpt-5', displayName: 'GPT-5' }],
    });

    expect(rows).toEqual([
      {
        id: 'ollama:qwen3:8b',
        displayName: 'qwen3:8b',
        source: 'local',
        protocol: 'ollama',
      },
      {
        id: 'custom:ds/deepseek-chat',
        displayName: 'DeepSeek Chat',
        source: 'cloud',
        protocol: 'chat-completions',
      },
      {
        id: 'custom:ds/deepseek-v4-flash',
        displayName: 'DeepSeek V4 Flash',
        source: 'cloud',
        protocol: 'chat-completions',
      },
      {
        id: 'custom:anth/claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        source: 'cloud',
        protocol: 'anthropic-messages',
      },
      {
        id: 'codex:gpt-5',
        displayName: 'GPT-5',
        source: 'cloud',
        protocol: 'codex',
      },
    ]);
  });

  it('maps unknown protocol to chat-completions and finds by modelRef', () => {
    expect(mapCatalogProtocol('weird')).toBe('chat-completions');
    expect(mapCatalogProtocol('openai-responses')).toBe('openai-responses');
    const rows = normalizeGatewayCatalog({
      custom: [
        {
          id: 'oa',
          name: 'OpenAI',
          protocol: 'openai-responses',
          models: [{ id: 'gpt-4o' }],
        },
      ],
    });
    expect(findCatalogEntry(rows, 'custom:oa/gpt-4o')).toEqual({
      id: 'custom:oa/gpt-4o',
      displayName: 'gpt-4o',
      source: 'cloud',
      protocol: 'openai-responses',
    });
  });
});
