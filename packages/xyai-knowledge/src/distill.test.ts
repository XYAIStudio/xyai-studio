import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { distillChunks } from './distill.js';
import type { ChunkRecord } from './types.js';

describe('distillChunks', () => {
  it('writes extract digest without ollama', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kb-distill-'));
    try {
      const chunks: ChunkRecord[] = [
        {
          id: 'c1',
          kbId: 'kb1',
          sourcePath: '/tmp/a.md',
          relativePath: 'a.md',
          sourceKind: 'local',
          title: 'a.md',
          text: 'hello world knowledge base distill test content',
          startOffset: 0,
          endOffset: 40,
        },
      ];
      const res = await distillChunks({
        chunks,
        outDir: dir,
        kbName: 'demo',
        forceExtract: true,
      });
      expect(res.ok).toBe(true);
      expect(res.mode).toBe('extract');
      const digest = readFileSync(res.digestPath, 'utf8');
      expect(digest).toContain('蒸馏成果');
      expect(digest).toContain('a.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
