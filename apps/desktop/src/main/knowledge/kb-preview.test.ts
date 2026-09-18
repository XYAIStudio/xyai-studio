import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  buildKbPreview,
  detectPreviewKind,
  markdownToSafeHtml,
  pickFileSummary,
} from './kb-preview.js';
import type { ChunkRecord } from '@xyai/knowledge';

describe('kb-preview', () => {
  it('detectPreviewKind maps office + text', () => {
    expect(detectPreviewKind('a.PDF')).toBe('pdf');
    expect(detectPreviewKind('a.docx')).toBe('docx');
    expect(detectPreviewKind('a.doc')).toBe('unsupported');
    expect(detectPreviewKind('a.xlsx')).toBe('xlsx');
    expect(detectPreviewKind('a.md')).toBe('markdown');
    expect(detectPreviewKind('a.txt')).toBe('text');
  });

  it('pickFileSummary prefers silent-LLM summary chunk', () => {
    const chunks: ChunkRecord[] = [
      {
        id: '1',
        kbId: 'k',
        sourcePath: '/s/a.md',
        relativePath: 'a.md',
        sourceKind: 'local',
        title: 'a.md',
        text: 'body extract here',
        startOffset: 0,
        endOffset: 10,
      },
      {
        id: '2',
        kbId: 'k',
        sourcePath: '/s/a.md',
        relativePath: 'a.md',
        sourceKind: 'local',
        title: 'a.md · 本地模型摘要',
        text: '[本地模型 tiny 静默解析摘要]\n这是摘要内容',
        startOffset: 0,
        endOffset: 0,
      },
    ];
    expect(pickFileSummary(chunks, 'a.md')).toBe('这是摘要内容');
  });

  it('markdownToSafeHtml escapes and renders headings', () => {
    const html = markdownToSafeHtml('# Hello\n<script>x</script>\n**bold**');
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('<script>');
  });

  it('buildKbPreview rejects path outside sourceRoot', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kb-prev-'));
    const outside = path.join(tmpdir(), `kb-prev-outside-${Date.now()}.txt`);
    writeFileSync(outside, 'nope', 'utf8');
    const res = await buildKbPreview({
      absolutePath: outside,
      sourceRoot: root,
    });
    expect(res.ok).toBe(false);
    expect(res.kind).toBe('error');
    expect(String(res.message || '')).toMatch(/源目录|拒绝/);
  });

  it('buildKbPreview renders txt under sourceRoot', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kb-prev-'));
    const file = path.join(root, 'note.txt');
    writeFileSync(file, 'hello preview', 'utf8');
    const res = await buildKbPreview({
      absolutePath: file,
      sourceRoot: root,
      relativePath: 'note.txt',
      chunks: [
        {
          id: '1',
          kbId: 'k',
          sourcePath: file,
          relativePath: 'note.txt',
          sourceKind: 'local',
          title: 'note.txt · 本地模型摘要',
          text: '[本地模型 x 静默解析摘要]\n简介一二三',
          startOffset: 0,
          endOffset: 0,
        },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('text');
    expect(res.summary).toBe('简介一二三');
    expect(res.html || res.text || '').toContain('hello preview');
  });

  it('buildKbPreview shows legacy doc message', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kb-prev-'));
    const file = path.join(root, 'old.doc');
    writeFileSync(file, 'legacy', 'utf8');
    const res = await buildKbPreview({
      absolutePath: file,
      sourceRoot: root,
      relativePath: 'old.doc',
    });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('unsupported');
    expect(String(res.warn || res.html || '')).toMatch(/\.doc/);
  });
});

describe('buildKbPreview PDF protocol', () => {
  it('returns previewUrl (not giant base64) for large PDF', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kb-prev-pdf-'));
    const file = path.join(root, 'big.pdf');
    // Minimal PDF header + pad to >2MiB without being a valid full PDF
    const pad = Buffer.alloc(2.5 * 1024 * 1024, 0x20);
    writeFileSync(file, Buffer.concat([Buffer.from('%PDF-1.4\n'), pad]));
    const res = await buildKbPreview({
      absolutePath: file,
      sourceRoot: root,
      relativePath: 'big.pdf',
    });
    expect(res.ok).toBe(true);
    expect(res.kind).toBe('pdf');
    expect(res.previewUrl).toMatch(/^xyai-kb-preview:/);
    expect(res.base64).toBeUndefined();
    expect(res.openPath).toBe(file);
  });
});
