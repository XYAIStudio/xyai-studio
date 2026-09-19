import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHAT_NOTE_SUBDIR, writeChatNote } from './kb-save-note.js';

describe('writeChatNote', () => {
  it('writes markdown under destDir', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chat-note-'));
    const destDir = path.join(root, CHAT_NOTE_SUBDIR);
    const res = writeChatNote({
      destDir,
      filename: 'hello.md',
      markdown: '# 摘录\n\n**正文**\n',
      allowedRoot: root,
    });
    expect(res.ok).toBe(true);
    expect(res.path).toBe(path.join(destDir, 'hello.md'));
    expect(readFileSync(res.path!, 'utf8')).toContain('**正文**');
  });

  it('rejects empty body', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chat-note-empty-'));
    const res = writeChatNote({
      destDir: root,
      filename: 'x.md',
      markdown: '   ',
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/没有可保存/);
  });

  it('jails dest inside allowedRoot', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chat-note-jail-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'chat-note-out-'));
    const res = writeChatNote({
      destDir: outside,
      filename: 'x.md',
      markdown: 'hi',
      allowedRoot: root,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/知识库文件夹内/);
  });

  it('strips path segments from filename', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chat-note-name-'));
    mkdirSync(root, { recursive: true });
    const res = writeChatNote({
      destDir: root,
      filename: '../escape.md',
      markdown: 'ok',
      allowedRoot: root,
    });
    expect(res.ok).toBe(true);
    expect(res.path).toBe(path.join(root, 'escape.md'));
  });
});
