/**
 * User-initiated chat note write into a folder (local KB source or picked dir).
 * Indexer still never writes source; this is an explicit save from the chat UI.
 */

import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isPathInside } from '@xyai/knowledge';

export const CHAT_NOTE_MAX_CHARS = 1_000_000;
export const CHAT_NOTE_SUBDIR = '对话摘录';

export type SaveChatNoteInput = {
  destDir: string;
  filename: string;
  markdown: string;
  /** When set, destDir must resolve inside this root (local KB source). */
  allowedRoot?: string;
};

export type SaveChatNoteResult = {
  ok: boolean;
  path?: string;
  message?: string;
};

function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[\\/:*?"<>|]+/g, ' ').trim();
  if (!base.toLowerCase().endsWith('.md')) {
    return `${base || 'note'}.md`;
  }
  return base || 'note.md';
}

/**
 * Write a markdown note under destDir.
 *
 * @param input.destDir - Absolute destination folder
 * @param input.filename - `.md` file name (basename only)
 * @param input.markdown - Note body
 * @param input.allowedRoot - Optional path jail (KB sourceRoot)
 * @returns Path on success
 */
export function writeChatNote(input: SaveChatNoteInput): SaveChatNoteResult {
  if (!input.destDir || !input.destDir.trim()) {
    return { ok: false, message: '未指定保存目录' };
  }
  const destDir = path.resolve(input.destDir);
  if (input.allowedRoot) {
    const root = path.resolve(input.allowedRoot);
    if (!isPathInside(root, destDir)) {
      return { ok: false, message: '保存路径必须位于所选知识库文件夹内' };
    }
  }
  const markdown = input.markdown ?? '';
  if (!markdown.trim()) {
    return { ok: false, message: '没有可保存的内容' };
  }
  if (markdown.length > CHAT_NOTE_MAX_CHARS) {
    return { ok: false, message: '内容过长，请缩短后再保存' };
  }
  const filename = safeFilename(input.filename || 'note.md');
  const dest = path.resolve(destDir, filename);
  if (!isPathInside(destDir, dest) || dest === destDir) {
    return { ok: false, message: '文件名不合法' };
  }
  if (input.allowedRoot && !isPathInside(path.resolve(input.allowedRoot), dest)) {
    return { ok: false, message: '保存路径必须位于所选知识库文件夹内' };
  }
  try {
    mkdirSync(destDir, { recursive: true });
    writeFileSync(dest, markdown, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
  return { ok: true, path: dest };
}
