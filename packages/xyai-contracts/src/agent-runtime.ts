/** Agent Runtime 契约 — 启动/停止/发送/事件流；与具体 Harness 解耦 */

import type { SessionId, TaskId } from './session.js';

export type AgentEventType =
  | 'session.started'
  | 'message.delta'
  | 'message.completed'
  | 'tool.call'
  | 'tool.result'
  | 'approval.requested'
  | 'error'
  | 'session.stopped';

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  sessionId: SessionId;
  taskId?: TaskId;
  payload?: unknown;
}

export interface StartSessionOptions {
  sessionId: SessionId;
  harnessId: string;
  modelId?: string;
  cwd?: string;
}

export interface SendMessageOptions {
  sessionId: SessionId;
  taskId: TaskId;
  content: string;
}

/**
 * Harness Adapter 必须实现的最小运行时接口。
 * 事件流为 AsyncIterable，便于测试与真实二进制接线。
 */
export interface AgentRuntime {
  readonly harnessId: string;
  start(options: StartSessionOptions): Promise<void>;
  stop(sessionId: SessionId): Promise<void>;
  send(options: SendMessageOptions): AsyncIterable<AgentEvent>;
}
