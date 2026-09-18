import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appendChunksStaging,
  commitStaging,
  clearStaging,
  ensureKbIndexDir,
  readChunks,
} from './index-io.js';
import type { ChunkRecord } from './types.js';

function chunk(partial: Partial<ChunkRecord> & { relativePath: string; text: string }): ChunkRecord {
  return {
    id: partial.id || `c-${Math.random().toString(16).slice(2)}`,
    kbId: 'kb1',
    sourcePath: partial.sourcePath || `/src/${partial.relativePath}`,
    relativePath: partial.relativePath,
    sourceKind: 'local',
    title: partial.title || partial.relativePath,
    text: partial.text,
    startOffset: 0,
    endOffset: partial.text.length,
  };
}

describe('commitStaging replaces by relativePath', () => {
  let indexRoot: string;
  const sourceRoots = ['/tmp/xyai-src-never'];
  beforeEach(() => {
    indexRoot = mkdtempSync(path.join(tmpdir(), 'xyai-idx-'));
  });
  afterEach(() => {
    rmSync(indexRoot, { recursive: true, force: true });
  });

  it('drops old junk chunks for same relativePath on re-parse', () => {
    ensureKbIndexDir(indexRoot, 'kb1', sourceRoots);
    appendChunksStaging(
      indexRoot,
      'kb1',
      [chunk({ relativePath: '政策.pdf', text: '<?xpacket begin junk meta' })],
      sourceRoots,
    );
    commitStaging(indexRoot, 'kb1', sourceRoots);
    expect(readChunks(indexRoot, 'kb1').some((c) => c.text.includes('xpacket'))).toBe(true);

    appendChunksStaging(
      indexRoot,
      'kb1',
      [chunk({ relativePath: '政策.pdf', text: '国务院办公厅关于绿色低碳发展的意见条款正文' })],
      sourceRoots,
    );
    commitStaging(indexRoot, 'kb1', sourceRoots);
    const all = readChunks(indexRoot, 'kb1');
    expect(all).toHaveLength(1);
    expect(all[0]!.text).toContain('绿色低碳');
    expect(all[0]!.text).not.toMatch(/xpacket/i);
  });
});
