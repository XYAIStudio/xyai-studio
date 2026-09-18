import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ParseEngine } from './parse-engine.js';
import { NO_LOCAL_MODEL_HINT } from './ollama-kb.js';
import type { ParseJobState, ParseableFile } from './types.js';

const temps: string[] = [];

afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeFixture(): {
  sourceRoot: string;
  indexRoot: string;
  files: ParseableFile[];
} {
  const root = mkdtempSync(path.join(tmpdir(), 'xyai-parse-'));
  temps.push(root);
  const sourceRoot = path.join(root, 'src');
  const indexRoot = path.join(root, 'index');
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(indexRoot, { recursive: true });
  const name = 'sample.txt';
  const full = path.join(sourceRoot, name);
  writeFileSync(full, 'hello knowledge base parse engine\n'.repeat(20), 'utf8');
  const files: ParseableFile[] = [
    {
      path: full,
      relativePath: name,
      name,
      ext: '.txt',
      sizeBytes: 100,
      mtimeMs: Date.now(),
    },
  ];
  return { sourceRoot, indexRoot, files };
}

describe('ParseEngine.startLocalParse', () => {
  it('returns immediately while job.running is true before completion', async () => {
    const { sourceRoot, indexRoot, files } = makeFixture();
    const engine = new ParseEngine();
    const progress: ParseJobState[] = [];

    const returned = await engine.startLocalParse({
      kbId: 'kb-test-1',
      sourceRoot,
      indexRoot,
      files,
      requireLocalModel: false,
      modelOverride: {
        ollamaAvailable: false,
        chatModel: null,
        embedModel: null,
      },
      onProgress: (j) => progress.push(j),
    });

    expect(returned.running).toBe(true);
    expect(returned.kbId).toBe('kb-test-1');
    expect(returned.files[0]?.status).toBe('queued');
    expect(progress.length).toBeGreaterThanOrEqual(1);

    await engine.waitForJob('kb-test-1');

    const final = engine.getJob('kb-test-1');
    expect(final?.running).toBe(false);
    expect(final?.completed).toBe(1);
    const st = final?.files[0]?.status;
    expect(st === 'done' || st === 'warn').toBe(true);
  });

  it('fails all files with install hint when no local model (requireLocalModel)', async () => {
    const { sourceRoot, indexRoot, files } = makeFixture();
    const engine = new ParseEngine();
    const returned = await engine.startLocalParse({
      kbId: 'kb-no-model',
      sourceRoot,
      indexRoot,
      files,
      requireLocalModel: true,
      modelOverride: {
        ollamaAvailable: false,
        chatModel: null,
        embedModel: null,
      },
    });
    expect(returned.running).toBe(true);
    await engine.waitForJob('kb-no-model');
    const final = engine.getJob('kb-no-model');
    expect(final?.running).toBe(false);
    expect(final?.files[0]?.status).toBe('failed');
    expect(final?.statusMessage).toContain('Ollama');
    expect(final?.files[0]?.message).toBe(NO_LOCAL_MODEL_HINT);
  });

  it('exposes chatModel on job when modelOverride provides one', async () => {
    const { sourceRoot, indexRoot, files } = makeFixture();
    const engine = new ParseEngine();
    // Chat model name set but live Ollama summarize will fail soft — extract still indexes
    const returned = await engine.startLocalParse({
      kbId: 'kb-chat',
      sourceRoot,
      indexRoot,
      files,
      requireLocalModel: true,
      modelOverride: {
        ollamaAvailable: true,
        chatModel: 'gemma-3-270m-it-q4_k_m',
        embedModel: null,
      },
    });
    expect(returned.running).toBe(true);
    expect(returned.chatModel).toBe('gemma-3-270m-it-q4_k_m');
    await engine.waitForJob('kb-chat');
    const final = engine.getJob('kb-chat');
    expect(final?.chatModel).toBe('gemma-3-270m-it-q4_k_m');
    expect(final?.running).toBe(false);
  });

  it('marks files failed when indexRoot is under source (path safety)', async () => {
    const { sourceRoot, files } = makeFixture();
    const engine = new ParseEngine();
    const returned = await engine.startLocalParse({
      kbId: 'kb-bad-index',
      sourceRoot,
      indexRoot: sourceRoot,
      files,
      requireLocalModel: false,
      modelOverride: {
        ollamaAvailable: false,
        chatModel: null,
        embedModel: null,
      },
    });
    expect(returned.running).toBe(true);
    await engine.waitForJob('kb-bad-index');
    const final = engine.getJob('kb-bad-index');
    expect(final?.running).toBe(false);
    expect(final?.failed).toBeGreaterThan(0);
    expect(final?.files[0]?.status).toBe('failed');
    expect(final?.files[0]?.message).toMatch(/refused|index/i);
  });
});
