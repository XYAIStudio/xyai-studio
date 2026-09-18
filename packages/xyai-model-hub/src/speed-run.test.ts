import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./model-ops.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./model-ops.js')>();
  return {
    ...actual,
    speedTestOllamaModel: vi.fn(),
  };
});

import { speedTestOllamaModel } from './model-ops.js';
import { LocalSpeedCache } from './speed-cache.js';
import { runPersistedSpeedTest } from './speed-run.js';

describe('runPersistedSpeedTest', () => {
  it('returns the cached success without calling Ollama', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyai-speed-run-'));
    const cache = new LocalSpeedCache(dir);
    cache.putFromTest('qwen3:1.7b', {
      ok: true,
      message: 'ok',
      tokensPerSec: 21,
      elapsedMs: 700,
      evalCount: 16,
    });
    const mocked = vi.mocked(speedTestOllamaModel);
    mocked.mockClear();
    const hit = await runPersistedSpeedTest(dir, 'ollama:qwen3:1.7b');
    expect(hit.cached).toBe(true);
    expect(hit.tokensPerSec).toBe(21);
    expect(mocked).not.toHaveBeenCalled();
  });

  it('re-runs and overwrites when force is set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyai-speed-run-'));
    const cache = new LocalSpeedCache(dir);
    cache.putFromTest('qwen3:1.7b', {
      ok: true,
      message: 'ok',
      tokensPerSec: 21,
      elapsedMs: 700,
      evalCount: 16,
    });
    const mocked = vi.mocked(speedTestOllamaModel);
    mocked.mockResolvedValue({
      ok: true,
      message: '测速完成：40.0 tok/s（16 tokens / 0.40s）',
      tokensPerSec: 40,
      elapsedMs: 400,
      evalCount: 16,
    });
    const hit = await runPersistedSpeedTest(dir, 'qwen3:1.7b', { force: true });
    expect(hit.cached).toBe(false);
    expect(hit.tokensPerSec).toBe(40);
    expect(cache.get('qwen3:1.7b')).toEqual(
      expect.objectContaining({ ok: true, tokensPerSec: 40 }),
    );
  });
});
