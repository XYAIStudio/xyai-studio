/** DeepSeek Harness adapter stub — implements AgentRuntime; not wired yet. */
import type {
  AgentRuntime,
  SendMessageOptions,
  SessionId,
  StartSessionOptions,
} from '@xyai/contracts';

export class DshAdapter implements AgentRuntime {
  readonly harnessId = 'dsh';

  async start(_options: StartSessionOptions): Promise<void> {
    /* scaffold */
  }

  async stop(_sessionId: SessionId): Promise<void> {
    /* scaffold */
  }

  async *send(_options: SendMessageOptions): AsyncIterable<import('@xyai/contracts').AgentEvent> {
    yield {
      type: 'error',
      timestamp: new Date().toISOString(),
      sessionId: _options.sessionId,
      taskId: _options.taskId,
      payload: {
        message: 'DeepSeek Harness 适配器建设中，请先使用本机流式对话或 Codex 引擎。',
        soft: true,
      },
    };
  }
}

export function createDshAdapter(): DshAdapter {
  return new DshAdapter();
}
