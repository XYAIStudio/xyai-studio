import { describe, expect, it } from 'vitest';
import { createClaudeAdapter } from './index.js';

describe('@xyai/adapter-claude stub', () => {
  it('implements AgentRuntime and yields a soft Chinese tip', async () => {
    const adapter = createClaudeAdapter();
    expect(adapter.harnessId).toBe('claude');
    expect(adapter.isStub).toBe(true);
    await adapter.start({ sessionId: 's1', harnessId: 'claude' });
    const events = [];
    for await (const ev of adapter.send({
      sessionId: 's1',
      taskId: 't1',
      content: 'hello',
    })) {
      events.push(ev);
    }
    expect(events[0]?.type).toBe('error');
    const payload = events[0]?.payload as {
      message?: string;
      code?: string;
      soft?: boolean;
    };
    expect(payload.soft).toBe(true);
    expect(payload.code).toBe('HARNESS_STUB');
    expect(payload.message).toMatch(/[\u4e00-\u9fff]/);
    adapter.abort('s1');
    await adapter.stop('s1');
  });
});
