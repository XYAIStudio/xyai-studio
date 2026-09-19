import { describe, expect, it, vi } from 'vitest';
import type {
  AgentEvent,
  AgentRuntime,
  SendMessageOptions,
  SessionId,
  StartSessionOptions,
} from '@xyai/contracts';
import { RuntimeSession } from './runtime-session.js';

class MockRuntime implements AgentRuntime {
  readonly harnessId = 'codex';
  started: StartSessionOptions | null = null;
  aborted: SessionId[] = [];
  stopped: SessionId[] = [];
  lastSend: SendMessageOptions | null = null;
  events: AgentEvent[] = [];

  async start(options: StartSessionOptions): Promise<void> {
    this.started = options;
  }

  abort(sessionId?: SessionId): void {
    this.aborted.push(sessionId ?? 'all');
  }

  async stop(sessionId: SessionId): Promise<void> {
    this.stopped.push(sessionId);
  }

  async *send(options: SendMessageOptions): AsyncIterable<AgentEvent> {
    this.lastSend = options;
    for (const ev of this.events) yield ev;
  }
}

function evt(
  type: AgentEvent['type'],
  sessionId: string,
  payload?: unknown,
): AgentEvent {
  return {
    type,
    timestamp: '2026-09-19T00:00:00.000Z',
    sessionId,
    payload,
  };
}

describe('RuntimeSession', () => {
  it('starts, sends, fans out events, then abort/dispose the runtime', async () => {
    const runtime = new MockRuntime();
    runtime.events = [
      evt('message.delta', 's1', { text: 'hi' }),
      evt('message.completed', 's1', { text: 'hi' }),
    ];
    const session = new RuntimeSession({
      id: 's1',
      runtime,
      permissionMode: 'auto',
    });
    expect(session.agentKind).toBe('codex');
    expect(session.permissionMode).toBe('auto');

    const seen: AgentEvent['type'][] = [];
    const off = session.on((e) => seen.push(e.type));

    await session.start({ cwd: '/tmp/ws' });
    expect(runtime.started).toMatchObject({
      sessionId: 's1',
      harnessId: 'codex',
      cwd: '/tmp/ws',
    });

    const yielded: AgentEvent['type'][] = [];
    for await (const ev of session.send('你好', { taskId: 't1' })) {
      yielded.push(ev.type);
    }
    expect(runtime.lastSend).toMatchObject({
      sessionId: 's1',
      taskId: 't1',
      content: '你好',
    });
    expect(yielded).toEqual(['message.delta', 'message.completed']);
    expect(seen).toEqual(['message.delta', 'message.completed']);
    off();

    session.abort();
    await session.dispose();
    expect(runtime.aborted).toContain('s1');
    expect(runtime.stopped).toEqual(['s1']);
  });

  it('defaults agentKind from the runtime harness id', () => {
    const runtime = new MockRuntime();
    (runtime as { harnessId: string }).harnessId = 'dsh';
    const session = new RuntimeSession({ id: 's2', runtime });
    expect(session.agentKind).toBe('dsh');
    expect(session.permissionMode).toBe('default');
  });

  it('events() iterator receives fanned-out send events', async () => {
    const runtime = new MockRuntime();
    runtime.events = [evt('message.completed', 's3', { text: 'ok' })];
    const session = new RuntimeSession({ id: 's3', runtime });
    const collected: string[] = [];
    const reader = (async () => {
      for await (const ev of session.events()) {
        collected.push(ev.type);
        break;
      }
    })();
    for await (const _ of session.send('hello')) {
      void _;
    }
    await reader;
    expect(collected).toEqual(['message.completed']);
    await session.dispose();
  });

  it('rejects send after dispose', async () => {
    const runtime = new MockRuntime();
    const session = new RuntimeSession({ id: 's4', runtime });
    await session.dispose();
    await expect(session.start()).rejects.toThrow(/disposed/);
  });

  it('stall hook calls abort when the runtime stays silent', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const hanging = new Promise<void>((r) => {
      release = r;
    });
    const runtime = new MockRuntime();
    runtime.send = async function* send() {
      await hanging;
    };
    const origAbort = runtime.abort.bind(runtime);
    runtime.abort = (id?: SessionId) => {
      origAbort(id);
      release();
    };
    const onStall = vi.fn();
    const session = new RuntimeSession({
      id: 's5',
      runtime,
      stallTimeoutMs: 10,
      onStall,
    });
    const consume = (async () => {
      for await (const _ of session.send('帮我创建一个插件')) void _;
    })();
    await vi.advanceTimersByTimeAsync(10);
    expect(onStall).toHaveBeenCalled();
    expect(runtime.aborted).toContain('s5');
    await consume;
    vi.useRealTimers();
  });
});
