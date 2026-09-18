/** 会话与任务契约 — 跨 Harness 连续的任务身份 */

export type SessionId = string;
export type TaskId = string;

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Session {
  id: SessionId;
  title: string;
  createdAt: string;
  updatedAt: string;
  harnessId: string;
  /** Unified model ref (codex:… / ollama:…). Optional in 0.5 Phase A. */
  modelRef?: string;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: TaskId;
  sessionId: SessionId;
  status: TaskStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  resultSummary?: string;
}
