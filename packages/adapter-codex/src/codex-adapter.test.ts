import { describe, expect, it } from 'vitest';
import { createCodexAdapter, MOCK_MARKER } from './codex-adapter.js';

describe('@xyai/adapter-codex mock', () => {
  it('returns deterministic mock event stream for one turn', async () => {
    const adapter = createCodexAdapter();
    expect(adapter.isMock).toBe(true);
    await adapter.start({ sessionId: 's1', harnessId: 'codex' });

    const events = [];
    for await (const ev of adapter.send({
      sessionId: 's1',
      taskId: 't1',
      content: 'hello',
    })) {
      events.push(ev);
    }

    expect(events.map((e) => e.type)).toEqual([
      'session.started',
      'message.delta',
      'message.completed',
    ]);
    const completed = events[2];
    expect(String((completed?.payload as { text?: string })?.text)).toContain(MOCK_MARKER);
    expect(String((completed?.payload as { text?: string })?.text)).toContain('hello');

    await adapter.stop('s1');
  });
});
