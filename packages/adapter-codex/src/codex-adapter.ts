/**
 * MOCK Codex Adapter — 实现 AgentRuntime 契约，返回确定性 mock 事件流。
 * 明确标记：在真实 Codex 二进制接线前仅用于测试与冒烟；请勿当作生产路径。
 * DO NOT download or ship Codex binaries from this package.
 */

import type {
  AgentEvent,
  AgentRuntime,
  SendMessageOptions,
  SessionId,
  StartSessionOptions,
} from '@xyai/contracts';

const MOCK_MARKER = '[MOCK-CODEX]' as const;

export class CodexAdapter implements AgentRuntime {
  readonly harnessId = 'codex';
  /** true until a real Codex binary is wired */
  readonly isMock = true;

  private readonly active = new Set<SessionId>();

  async start(options: StartSessionOptions): Promise<void> {
    this.active.add(options.sessionId);
  }

  async stop(sessionId: SessionId): Promise<void> {
    this.active.delete(sessionId);
  }

  async *send(options: SendMessageOptions): AsyncIterable<AgentEvent> {
    const { sessionId, taskId, content } = options;
    const now = () => new Date().toISOString();

    if (!this.active.has(sessionId)) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { message: `${MOCK_MARKER} session not started` },
      };
      return;
    }

    yield {
      type: 'session.started',
      timestamp: now(),
      sessionId,
      taskId,
      payload: { mock: true, marker: MOCK_MARKER },
    };

    const reply = `${MOCK_MARKER} echo: ${content}`;
    yield {
      type: 'message.delta',
      timestamp: now(),
      sessionId,
      taskId,
      payload: { text: reply },
    };

    yield {
      type: 'message.completed',
      timestamp: now(),
      sessionId,
      taskId,
      payload: { text: reply, mock: true },
    };
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter();
}

export { MOCK_MARKER };
