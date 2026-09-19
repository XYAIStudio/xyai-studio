import { describe, expect, it } from 'vitest';
import {
  customModelRef,
  missingCustomApiKey,
  normalizeCustomProvider,
  normalizeCustomProviders,
  parseCustomModelRef,
} from './custom-providers.js';
import {
  normalizeModelRef,
  parseCustomModelRef as parseCustomFromContracts,
} from '@xyai/contracts';
import { resolveTurnRoute } from './turn-controller.js';
import { normalizeSettings } from './settings.js';

describe('custom providers normalize', () => {
  it('fills defaults and drops invalid rows', () => {
    const list = normalizeCustomProviders([
      {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        protocol: 'chat-completions',
        auth: 'apiKey',
        runtime: 'codex',
        apiKey: 'sk-test',
        models: [
          { id: 'deepseek-chat', label: 'DeepSeek Chat', contextTokens: 65536 },
        ],
      },
      { name: '' },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('DeepSeek');
    expect(list[0]!.runtime).toBe('codex');
    expect(list[0]!.models[0]!.id).toBe('deepseek-chat');
  });

  it('builds and parses custom modelRef', () => {
    const ref = customModelRef('p1', 'deepseek-chat');
    expect(ref).toBe('custom:p1/deepseek-chat');
    expect(parseCustomModelRef(ref)).toEqual({
      providerId: 'p1',
      modelId: 'deepseek-chat',
    });
    expect(normalizeModelRef(ref)).toBe(ref);
    expect(parseCustomFromContracts(ref)?.providerId).toBe('p1');
  });

  it('gates apiKey auth', () => {
    const p = normalizeCustomProvider({
      id: 'p1',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      auth: 'apiKey',
      models: [{ id: 'm1', label: 'M1' }],
    })!;
    expect(missingCustomApiKey('custom:p1/m1', [p])).toBe('DeepSeek');
    p.apiKey = 'sk-x';
    expect(missingCustomApiKey('custom:p1/m1', [p])).toBeNull();
  });
});

describe('custom turn route', () => {
  it('routes custom refs to custom kind', () => {
    expect(resolveTurnRoute('custom:prov/model-a')).toEqual({
      kind: 'custom',
      providerId: 'prov',
      modelId: 'model-a',
    });
  });

  it('lifts custom create/write turns onto Codex', () => {
    expect(
      resolveTurnRoute('custom:prov/model-a', {
        engineMode: 'auto',
        capabilityNeed: 'tools',
      }),
    ).toEqual({
      kind: 'codex',
      modelId: 'model-a',
      customProviderId: 'prov',
    });
  });
});

describe('settings customProviders', () => {
  it('keeps customProviders on normalize', () => {
    const s = normalizeSettings({
      customProviders: [
        {
          id: 'cp1',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          auth: 'apiKey',
          protocol: 'chat-completions',
          runtime: 'codex',
          models: [{ id: 'deepseek-chat', label: 'Chat' }],
        },
      ],
    });
    expect(s.customProviders).toHaveLength(1);
    expect(s.customProviders[0]!.id).toBe('cp1');
  });
});
