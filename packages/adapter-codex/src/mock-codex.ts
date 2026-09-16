/**
 * MOCK Codex send path — deterministic event stream for tests / CI.
 * Marked clearly; not a production harness path.
 */

import type {
  AgentEvent,
  SendMessageOptions,
  SessionId,
} from '@xyai/contracts';

export const MOCK_MARKER = '[MOCK-CODEX]' as const;

export async function* mockCodexSend(
  options: SendMessageOptions,
  active: ReadonlySet<SessionId>,
): AsyncIterable<AgentEvent> {
  const { sessionId, taskId, content } = options;
  const now = () => new Date().toISOString();

  if (!active.has(sessionId)) {
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
