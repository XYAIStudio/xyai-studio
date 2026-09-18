import { describe, expect, it } from 'vitest';
import {
  formatSpeedTestMessage,
  ollamaNameForRegister,
  speedTestPreconditions,
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

describe('speedTestPreconditions', () => {
  it('refuses recommended tags that are not in the live list', () => {
    const miss = speedTestPreconditions('ollama:qwen3:8b', ['qwen3:1.7b']);
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.message).toMatch(/没有模型/);
  });

  it('refuses mmproj even when the tag exists', () => {
    const proj = speedTestPreconditions('mmproj-f16:latest', [
      'mmproj-f16:latest',
    ]);
    expect(proj.ok).toBe(false);
    if (!proj.ok) expect(proj.message).toMatch(/投影器/);
  });

  it('allows a live chat tag', () => {
    expect(speedTestPreconditions('qwen3:1.7b', ['qwen3:1.7b'])).toEqual({
      ok: true,
      model: 'qwen3:1.7b',
    });
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
