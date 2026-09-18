import { describe, expect, it } from 'vitest';
import type { HubModelView } from './models-hub-actions.js';
import {
  formatSpeedChip,
  isSpeedEligibleChatModel,
  refsNeedingAutoSpeed,
  sortByHubSpeed,
  speedModelKey,
} from './models-hub-speed.js';

function view(partial: Partial<HubModelView> & { id: string }): HubModelView {
  return {
    displayName: partial.displayName || partial.id,
    registered: true,
    isDefault: false,
    availableInOllama: true,
    ...partial,
  };
}

describe('speedModelKey', () => {
  it('normalizes ollama refs', () => {
    expect(speedModelKey('ollama:qwen3:1.7b')).toBe('qwen3:1.7b');
  });
});

describe('isSpeedEligibleChatModel', () => {
  it('requires a live Ollama chat model', () => {
    expect(
      isSpeedEligibleChatModel(
        view({ id: 'ollama:qwen3:1.7b', displayName: 'qwen3:1.7b' }),
      ),
    ).toBe(true);
    expect(
      isSpeedEligibleChatModel(
        view({
          id: 'gguf:mmproj-f16',
          displayName: 'mmproj-f16.gguf',
          path: '/w/mmproj-f16.gguf',
        }),
      ),
    ).toBe(false);
    expect(
      isSpeedEligibleChatModel(
        view({
          id: 'ollama:qwen3:8b',
          displayName: 'qwen3:8b',
          availableInOllama: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('sortByHubSpeed', () => {
  it('puts the fastest eligible model first', () => {
    const rows = [
      { name: 'disk', eligible: false, rank: undefined },
      { name: 'slow', eligible: true, rank: { tokensPerSec: 9 } },
      { name: 'fast', eligible: true, rank: { tokensPerSec: 44 } },
      { name: 'wait', eligible: true, rank: { pending: true } },
    ];
    expect(sortByHubSpeed(rows, (r) => r).map((r) => r.name)).toEqual([
      'fast',
      'slow',
      'wait',
      'disk',
    ]);
  });
});

describe('refsNeedingAutoSpeed', () => {
  it('skips cached successes, projectors, and catalog-only tags', () => {
    const refs = refsNeedingAutoSpeed(
      [
        {
          ...view({ id: 'ollama:qwen3:1.7b', displayName: 'qwen3:1.7b' }),
          modelRef: 'ollama:qwen3:1.7b',
        },
        {
          ...view({ id: 'ollama:qwen3:8b', displayName: 'qwen3:8b' }),
          modelRef: 'ollama:qwen3:8b',
        },
        {
          ...view({
            id: 'gguf:mmproj',
            displayName: 'mmproj-f16.gguf',
          }),
          modelRef: 'ollama:mmproj-f16',
        },
        {
          ...view({
            id: 'ollama:qwen3:32b',
            displayName: 'qwen3:32b',
            availableInOllama: false,
          }),
          modelRef: 'ollama:qwen3:32b',
        },
      ],
      { 'qwen3:1.7b': { ok: true, tokensPerSec: 30 } },
    );
    expect(refs).toEqual(['ollama:qwen3:8b']);
  });
});

describe('formatSpeedChip', () => {
  it('uses 测速中 / 未测速 for eligible rows without a live score', () => {
    expect(formatSpeedChip({ pending: true }, true)?.text).toBe('测速中');
    expect(formatSpeedChip(undefined, true)?.text).toBe('未测速');
    expect(formatSpeedChip({ tokensPerSec: 8 }, false)).toBeNull();
  });
});
