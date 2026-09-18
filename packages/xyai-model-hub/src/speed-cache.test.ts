import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LocalSpeedCache,
  lookupSpeedResult,
  speedModelKey,
} from './speed-cache.js';

describe('speedModelKey', () => {
  it('matches ollama: prefix and :latest', () => {
    expect(speedModelKey('ollama:qwen3:1.7b')).toBe('qwen3:1.7b');
    expect(speedModelKey('Qwen3:1.7b:latest')).toBe('qwen3:1.7b');
  });
});

describe('LocalSpeedCache', () => {
  it('round-trips a successful result and looks it up by alias refs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyai-speed-'));
    const cache = new LocalSpeedCache(dir);
    cache.putFromTest('ollama:qwen3:1.7b', {
      ok: true,
      message: 'ok',
      tokensPerSec: 33.3,
      elapsedMs: 480,
      evalCount: 16,
    });
    const hit = cache.get('qwen3:1.7b:latest');
    expect(hit?.ok).toBe(true);
    if (hit?.ok) expect(hit.tokensPerSec).toBe(33.3);
    const map = cache.load();
    expect(lookupSpeedResult(map, 'ollama:qwen3:1.7b')?.ok).toBe(true);
  });

  it('stores a failed run without inventing tok/s', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyai-speed-'));
    const cache = new LocalSpeedCache(dir);
    cache.putFromTest('qwen3:8b', {
      ok: false,
      message: '本地 Ollama 中没有模型「qwen3:8b」。',
    });
    const hit = cache.get('ollama:qwen3:8b');
    expect(hit).toEqual(
      expect.objectContaining({
        ok: false,
        modelKey: 'qwen3:8b',
      }),
    );
  });
});
