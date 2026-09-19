import { describe, expect, it } from 'vitest';
import {
  AGENT_HANDOFF_GAP,
  chatNoteFilename,
  chatNoteMarkdown,
  formatAgentHandoff,
  formatForwardDraft,
  formatQuoteBlock,
  formatTranscriptTurns,
  pickActionText,
} from './message-actions.js';
import type { ChatMsg } from './types.js';

describe('pickActionText', () => {
  it('prefers a non-empty selection', () => {
    expect(pickActionText('  选中  ', '整段')).toBe('选中');
  });

  it('falls back to the message body', () => {
    expect(pickActionText('', '整段\r\n两行')).toBe('整段\n两行');
  });
});

describe('formatQuoteBlock', () => {
  it('prefixes each line with >', () => {
    expect(formatQuoteBlock('一、目的\n**加粗**')).toBe(
      '> 一、目的\n> **加粗**\n\n',
    );
  });
});

describe('formatForwardDraft', () => {
  it('wraps a single message', () => {
    const out = formatForwardDraft({
      scope: 'message',
      text: 'hello',
      fromTitle: '与通用智能体',
    });
    expect(out).toContain('【转发自「与通用智能体」】');
    expect(out).toContain('hello');
    expect(out).not.toMatch(/高级引擎/);
  });

  it('formats history turns', () => {
    const messages: ChatMsg[] = [
      { id: '1', role: 'user', text: '问' },
      { id: '2', role: 'assistant', text: '答' },
      { id: '3', role: 'system', text: '忽略' },
    ];
    const out = formatForwardDraft({
      scope: 'history',
      text: '',
      messages,
      fromTitle: 'A',
    });
    expect(out).toContain('你：\n问');
    expect(out).toContain('助手：\n答');
    expect(out).not.toContain('忽略');
  });
});

describe('formatAgentHandoff', () => {
  it('labels the draft as 派活 without claiming a peer runtime', () => {
    const out = formatAgentHandoff({
      payload: '请审阅',
      fromTitle: '会话甲',
      agentName: '通用智能体',
    });
    expect(out).toContain('【派活】');
    expect(out).toContain('对象：通用智能体');
    expect(out).toContain('来源：会话甲');
    expect(out).toContain('请审阅');
    expect(out).not.toMatch(/高级引擎|Grok|harness/i);
  });
});

describe('formatTranscriptTurns', () => {
  it('skips error rows', () => {
    expect(
      formatTranscriptTurns([
        { id: 'e', role: 'error', text: 'boom' },
        { id: 'u', role: 'user', text: 'hi' },
      ]),
    ).toBe('你：\nhi');
  });
});

describe('chatNoteMarkdown / filename', () => {
  it('embeds title and source', () => {
    const md = chatNoteMarkdown({
      title: '摘录',
      body: '**正文**',
      fromTitle: '会话',
      at: new Date('2026-09-19T08:00:00.000Z'),
    });
    expect(md).toContain('# 摘录');
    expect(md).toContain('来自对话「会话」');
    expect(md).toContain('**正文**');
  });

  it('strips path punctuation from the filename', () => {
    const name = chatNoteFilename('a/b:c*', new Date('2026-09-19T01:02:03'));
    expect(name).toMatch(/\.md$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name).toContain('a b c');
  });
});

describe('gap copy', () => {
  it('explains draft-only agent notify', () => {
    expect(AGENT_HANDOFF_GAP).toMatch(/草稿/);
    expect(AGENT_HANDOFF_GAP).not.toMatch(/高级引擎/);
  });
});
