/**
 * Claude harness adapter stub — implements AgentRuntime.
 * Not enabled in the default assembly profile. Settings may show
 * Settings may show 「云端写文件」as coming soon; never a required brand wall.
 */

import type {
  AgentEvent,
  AgentRuntime,
  SendMessageOptions,
  SessionId,
  StartSessionOptions,
} from '@xyai/contracts';

const STUB_MESSAGE =
  '云端高级能力即将推出，已为你继续本机流式对话。';

export class ClaudeAdapter implements AgentRuntime {
  readonly harnessId = 'claude';
  readonly isStub = true;
  readonly isReady = false;

  async start(_options: StartSessionOptions): Promise<void> {
    /* scaffold — no session state until a real provider is wired */
  }

  abort(_sessionId?: SessionId): void {
    /* no child process */
  }

  async stop(_sessionId: SessionId): Promise<void> {
    /* scaffold */
  }

  async *send(options: SendMessageOptions): AsyncIterable<AgentEvent> {
    yield {
      type: 'error',
      timestamp: new Date().toISOString(),
      sessionId: options.sessionId,
      taskId: options.taskId,
      payload: {
        message: STUB_MESSAGE,
        code: 'HARNESS_STUB',
        soft: true,
      },
    };
  }
}

export function createClaudeAdapter(): ClaudeAdapter {
  return new ClaudeAdapter();
}
