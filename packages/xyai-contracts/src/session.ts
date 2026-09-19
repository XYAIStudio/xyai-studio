/** 会话与任务契约 — 跨 Harness 连续的任务身份 */

import type { AgentKind } from './agent-kind.js';
import type { PermissionMode } from './permission.js';

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
  /** Same vocabulary as {@link AgentKind}; optional on older records. */
  agentKind?: AgentKind;
  /** Approval policy only; never used to infer chat vs tools. */
  permissionMode?: PermissionMode;
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
