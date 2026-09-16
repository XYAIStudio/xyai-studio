import { describe, expect, it } from 'vitest';
import { parseCodexJsonlRawLine } from './parse-codex-jsonl.js';

const PONG_JSONL = [
  '{"type":"thread.started","thread_id":"thr_test"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"skill budget warning"}}',
  '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"PONG"}}',
  '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
];

describe('parse-codex-jsonl', () => {
  it('maps PONG sample JSONL to AgentEvents', () => {
    const ctx = {
      sessionId: 's1',
      taskId: 't1',
      sessionStarted: false,
    };
    const all = [];
    for (const line of PONG_JSONL) {
      const events = parseCodexJsonlRawLine(line, ctx);
      if (!events) continue;
      for (const ev of events) {
        if (ev.type === 'session.started') ctx.sessionStarted = true;
        all.push(ev);
      }
    }

    expect(all.map((e) => e.type)).toEqual([
      'session.started',
      'error',
      'message.delta',
      'message.completed',
    ]);

    const started = all[0];
    expect((started?.payload as { threadId?: string; harness?: string })?.threadId).toBe(
      'thr_test',
    );
    expect((started?.payload as { harness?: string })?.harness).toBe('codex');

    const err = all[1];
    expect(String((err?.payload as { message?: string })?.message)).toContain(
      'skill budget',
    );
    expect((err?.payload as { nonFatal?: boolean })?.nonFatal).toBe(true);

    const completed = all[3];
    expect((completed?.payload as { text?: string })?.text).toBe('PONG');
  });

  it('ignores unknown and invalid lines', () => {
    const ctx = { sessionId: 's', taskId: 't' };
    expect(parseCodexJsonlRawLine('', ctx)).toBeNull();
    expect(parseCodexJsonlRawLine('not-json', ctx)).toBeNull();
    expect(
      parseCodexJsonlRawLine('{"type":"weird.unknown"}', ctx),
    ).toBeNull();
  });
});
