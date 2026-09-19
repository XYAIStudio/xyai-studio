/**
 * Per-message action payloads (copy / quote / forward / KB / agent handoff).
 * UI labels stay Chinese; formatters are pure so tests do not need DOM.
 */

import type { ChatMsg } from './types.js';

export type BubbleActionKind =
  | 'copy'
  | 'quote'
  | 'forward'
  | 'save-kb'
  | 'notify-agent';

export type ForwardScope = 'message' | 'history';

export type ActionTargetSession = { id: string; title: string };
export type ActionTargetAgent = { id: string; name: string; hint?: string };
export type ActionTargetKb = {
  id: string;
  name: string;
  kind: 'local' | 'cloud';
};

/** Prefer in-bubble selection; otherwise the whole message. */
export function pickActionText(selection: string, messageText: string): string {
  const sel = selection.replace(/\u00a0/g, ' ').trim();
  if (sel) return sel;
  return messageText.replace(/\r\n/g, '\n');
}

/**
 * Composer quote block (Grok-style `>` lines, trailing blank line).
 *
 * @param text - Selected or full message markdown
 * @returns Quote ready to insert into the composer
 */
export function formatQuoteBlock(text: string): string {
  const body = text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!body) return '';
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${quoted}\n\n`;
}

/**
 * Forward / handoff payload for another session composer.
 *
 * @param input.scope - One bubble or the whole transcript
 * @param input.text - Message body when scope is `message`
 * @param input.messages - Transcript when scope is `history`
 * @param input.fromTitle - Source session title
 * @returns Markdown draft
 */
export function formatForwardDraft(input: {
  scope: ForwardScope;
  text: string;
  messages?: ChatMsg[];
  fromTitle?: string;
}): string {
  const from = (input.fromTitle || '').trim();
  const header = from ? `【转发自「${from}」】` : '【转发】';
  if (input.scope === 'history') {
    const turns = formatTranscriptTurns(input.messages || []);
    return `${header}\n\n${turns}`.trim() + '\n';
  }
  return `${header}\n\n${input.text.replace(/\r\n/g, '\n').trim()}\n`;
}

/**
 * Draft posted into an agent session. Not a live peer runtime.
 *
 * @param input.payload - Message or history markdown
 * @param input.fromTitle - Source session title
 * @param input.agentName - Target agent display name
 * @returns Handoff markdown
 */
export function formatAgentHandoff(input: {
  payload: string;
  fromTitle?: string;
  agentName?: string;
}): string {
  const who = (input.agentName || '').trim();
  const from = (input.fromTitle || '').trim();
  const lines = ['【派活】请根据以下内容继续处理。'];
  if (who) lines.push(`对象：${who}`);
  if (from) lines.push(`来源：${from}`);
  lines.push('');
  lines.push(input.payload.replace(/\r\n/g, '\n').trim());
  return lines.join('\n').trim() + '\n';
}

export function formatTranscriptTurns(messages: ChatMsg[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(`你：\n${m.text.trim()}`);
    } else if (m.role === 'assistant') {
      parts.push(`助手：\n${m.text.trim()}`);
    }
  }
  return parts.join('\n\n');
}

export function chatNoteMarkdown(input: {
  title: string;
  body: string;
  fromTitle?: string;
  at?: Date;
}): string {
  const when = (input.at ?? new Date()).toISOString();
  const from = (input.fromTitle || '').trim();
  const lines = [`# ${input.title.trim() || '对话摘录'}`, ''];
  if (from) lines.push(`> 来自对话「${from}」 · ${when}`, '');
  else lines.push(`> 保存于 ${when}`, '');
  lines.push(input.body.replace(/\r\n/g, '\n').trim(), '');
  return lines.join('\n');
}

/** Safe file stem: strip path punctuation, keep CJK, cap length. */
export function chatNoteFilename(title: string, at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const slug = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return slug ? `${stamp}-${slug}.md` : `${stamp}.md`;
}

export const AGENT_HANDOFF_GAP =
  '将打开该智能体的对话并写入草稿；发送后才会进入该会话。智能体之间尚无自动协同运行时。';
