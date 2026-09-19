import { describe, expect, it } from 'vitest';
import {
  emptyIndexReasonFromMeta,
  formatAttachedKbBanner,
  formatContextBlock,
  formatEmptyIndexNote,
  isOverviewHits,
  scoreKeyword,
  searchChunks,
  tokenize,
} from './search.js';
import type { ChunkRecord } from './types.js';

function chunk(partial: Partial<ChunkRecord> & { text: string }): ChunkRecord {
  return {
    id: partial.id || 'c1',
    kbId: partial.kbId || 'kb1',
    sourcePath: partial.sourcePath || '/tmp/a.pdf',
    relativePath: partial.relativePath || 'a.pdf',
    sourceKind: partial.sourceKind || 'local',
    title: partial.title || 'doc',
    text: partial.text,
    startOffset: partial.startOffset ?? 0,
    endOffset: partial.endOffset ?? partial.text.length,
  };
}

describe('tokenize / scoreKeyword (Chinese-friendly)', () => {
  it('keeps CJK runs and bigrams', () => {
    const toks = tokenize('政策文件');
    expect(toks).toContain('政策文件');
    expect(toks).toContain('政策');
    expect(toks).toContain('策文');
    expect(toks).toContain('文件');
  });

  it('scores full-query substring for Chinese', () => {
    const c = chunk({ text: '本公司关于政策文件的说明如下。' });
    expect(scoreKeyword(c, tokenize('政策'), '政策')).toBeGreaterThan(0);
    expect(scoreKeyword(c, tokenize('政策文件'), '政策文件')).toBeGreaterThan(0);
  });
});

describe('searchChunks overview fallback', () => {
  it('returns first N chunks when keyword misses', () => {
    const chunks = [
      chunk({ id: '1', text: 'alpha one' }),
      chunk({ id: '2', text: 'beta two' }),
      chunk({ id: '3', text: 'gamma three' }),
    ];
    const hits = searchChunks(chunks, '完全不相关的中文查询', {
      limit: 8,
      overviewLimit: 2,
    });
    expect(hits).toHaveLength(2);
    expect(hits[0]!.chunk.id).toBe('1');
    expect(isOverviewHits(hits)).toBe(true);
    const block = formatContextBlock(hits, '政策');
    expect(block).toContain('知识库概览');
    expect(block).toContain('alpha one');
  });

  it('returns real hits when keyword matches', () => {
    const chunks = [
      chunk({ id: '1', text: '无关内容' }),
      chunk({ id: '2', text: '这里有政策条款' }),
    ];
    const hits = searchChunks(chunks, '政策');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.chunk.id).toBe('2');
    expect(isOverviewHits(hits)).toBe(false);
  });
});

describe('attached KB banners', () => {
  it('formats banner and empty-index notes by reason', () => {
    expect(formatAttachedKbBanner(['政策', '手册'])).toContain('政策');
    expect(emptyIndexReasonFromMeta(null)).toBe('never-parsed');
    expect(emptyIndexReasonFromMeta({ chunkCount: 0 })).toBe(
      'no-searchable-text',
    );
    expect(formatEmptyIndexNote('政策')).toContain('尚未有可用索引');
    expect(formatEmptyIndexNote('制度', 'no-searchable-text')).toContain(
      '解析未产生可检索正文',
    );
    expect(formatEmptyIndexNote('制度', 'no-searchable-text')).toContain(
      '请重新解析或换可读文件',
    );
  });
});
