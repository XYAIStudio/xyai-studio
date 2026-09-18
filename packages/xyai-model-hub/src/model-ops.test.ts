import { describe, expect, it } from 'vitest';
import {
  formatSpeedTestMessage,
  ollamaNameForRegister,
  tokensPerSecFromOllamaGenerate,
} from './model-ops.js';

describe('tokensPerSecFromOllamaGenerate', () => {
  it('uses eval_count / eval_duration', () => {
    const r = tokensPerSecFromOllamaGenerate({
      eval_count: 16,
      eval_duration: 2_000_000_000,
    });
    expect(r).toEqual({
      tokensPerSec: 8,
      elapsedMs: 2000,
      evalCount: 16,
    });
    expect(formatSpeedTestMessage(r!)).toMatch(/8\.0 tok\/s/);
  });
});

describe('ollamaNameForRegister', () => {
  it('strips gguf prefix and extension', () => {
    expect(
      ollamaNameForRegister({
        id: 'gguf:Qwen3-1.7B-Q4_K_M.gguf',
        displayName: 'Qwen3-1.7B-Q4_K_M.gguf',
      }),
    ).toBe('qwen3-1.7b-q4_k_m');
  });
});
