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
  /** When true, Codex uses local OSS provider (`codex exec --oss`). */
  oss?: boolean;
  /** Local inference provider for OSS mode (Ollama / LM Studio). */
  localProvider?: 'ollama' | 'lmstudio';
  /** Codex `-s` sandbox (e.g. workspace-write). Ignored by other adapters. */
  sandbox?: string;
  /** Codex `-a` approval policy (e.g. never). Ignored by other adapters. */
  approval?: string;
  /** Extra writable roots passed as Codex `--add-dir`. */
  addDirs?: string[];
  /** Extra child env (API keys / base URL). Never log these. */
  extraEnv?: Record<string, string>;
  /** Repeatable Codex `--config key=value` overrides (custom OpenAI-compat). */
  configOverrides?: string[];
}

export interface SendMessageOptions {
  sessionId: SessionId;
  taskId: TaskId;
  content: string;
  /** Optional model override for this turn (Codex -m / local id). */
  modelId?: string;
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
  /** Abort the in-flight turn without disposing the session. */
  abort(sessionId?: SessionId): void;
}
