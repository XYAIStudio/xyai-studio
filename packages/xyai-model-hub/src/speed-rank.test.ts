import { describe, expect, it } from 'vitest';
import {
  compareHubSpeedRows,
  formatSpeedChip,
  hubSpeedRowForEntry,
  isSpeedEligibleChatModel,
  sortByHubSpeed,
} from './speed-rank.js';

describe('isSpeedEligibleChatModel', () => {
  it('allows a live chat tag', () => {
    expect(
      isSpeedEligibleChatModel({
        id: 'ollama:qwen3:1.7b',
        displayName: 'qwen3:1.7b',
        role: 'chat',
        installed: true,
      }),
    ).toBe(true);
  });

  it('rejects mmproj, embeddings, and catalog-only tags', () => {
    expect(
      isSpeedEligibleChatModel({
        displayName: 'mmproj-f16.gguf',
        role: 'vision',
        installed: true,
      }),
    ).toBe(false);
    expect(
      isSpeedEligibleChatModel({
        displayName: 'nomic-embed-text',
        role: 'embedding',
        installed: true,
      }),
    ).toBe(false);
    expect(
      isSpeedEligibleChatModel({
        id: 'ollama:qwen3:8b',
        displayName: 'qwen3:8b',
        availableInOllama: false,
      }),
    ).toBe(false);
  });

  it('still allows live VL chat models (not projectors)', () => {
    expect(
      isSpeedEligibleChatModel({
        id: 'ollama:qwen2.5vl:3b',
        displayName: 'qwen2.5vl:3b',
        role: 'vision',
        installed: true,
      }),
    ).toBe(true);
  });
});

describe('sortByHubSpeed', () => {
  it('orders fastest scored chat first, then pending, 未测速, then ineligible', () => {
    const rows = [
      { id: 'proj', eligible: false, rank: undefined },
      { id: 'slow', eligible: true, rank: { tokensPerSec: 8 } },
      { id: 'none', eligible: true, rank: undefined },
      { id: 'fast', eligible: true, rank: { tokensPerSec: 40 } },
      { id: 'pend', eligible: true, rank: { pending: true } },
    ];
    expect(sortByHubSpeed(rows, (r) => r).map((r) => r.id)).toEqual([
      'fast',
      'slow',
      'pend',
      'none',
      'proj',
    ]);
  });

  it('keeps a previous score ahead of pending-only rows while retesting', () => {
    expect(
      compareHubSpeedRows(
        { eligible: true, rank: { tokensPerSec: 12, pending: true } },
        { eligible: true, rank: { pending: true } },
      ),
    ).toBeLessThan(0);
  });
});

describe('hubSpeedRowForEntry', () => {
  it('sorts live scored chat models ahead of disk-only GGUF', () => {
    const scores: Record<string, { ok: boolean; tokensPerSec?: number }> = {
      'ollama:qwen3:1.7b': { ok: true, tokensPerSec: 36 },
    };
    const rows = sortByHubSpeed(
      [
        {
          id: 'gguf:Qwen3-8B',
          displayName: 'Qwen3-8B.gguf',
          installed: false,
        },
        {
          id: 'ollama:qwen3:8b',
          displayName: 'qwen3:8b',
          installed: true,
          role: 'chat',
        },
        {
          id: 'ollama:qwen3:1.7b',
          displayName: 'qwen3:1.7b',
          installed: true,
          role: 'chat',
        },
      ],
      (entry) =>
        hubSpeedRowForEntry(
          { ...entry, availableInOllama: entry.installed === true },
          (ref) => (ref ? scores[ref] : undefined),
        ),
    );
    expect(rows.map((r) => r.id)).toEqual([
      'ollama:qwen3:1.7b',
      'ollama:qwen3:8b',
      'gguf:Qwen3-8B',
    ]);
  });
});

describe('formatSpeedChip', () => {
  it('hides chips for ineligible rows and labels the rest in Chinese', () => {
    expect(formatSpeedChip({ tokensPerSec: 12.34 }, false)).toBeNull();
    expect(formatSpeedChip({ tokensPerSec: 12.34 }, true)).toEqual({
      text: '12.3 tok/s',
      kind: 'score',
    });
    expect(formatSpeedChip({ pending: true, tokensPerSec: 12 }, true)).toEqual({
      text: '测速中',
      kind: 'pending',
    });
    expect(formatSpeedChip(undefined, true)).toEqual({
      text: '未测速',
      kind: 'none',
    });
  });
});
