/**
 * Live session wrapper around AgentRuntime.
 * Distinct from {@link Session}, which is the persisted record.
 */

import type { AgentEvent, StartSessionOptions } from './agent-runtime.js';
import type { AgentKind } from './agent-kind.js';
import type { PermissionMode } from './permission.js';
import type { SessionId, TaskId } from './session.js';

export interface SessionFacade {
  readonly id: SessionId;
  readonly agentKind: AgentKind;
  readonly permissionMode: PermissionMode;
  /**
   * Bind the wrapped AgentRuntime. Safe to call more than once.
   * @param options Overlay for the adapter start options (sessionId stays this.id)
   */
  start(options?: Partial<StartSessionOptions>): Promise<void>;
  /**
   * Send one user turn. Yields adapter events and fans them out to {@link on} / {@link events}.
   * @param content User text
   * @param options Optional task id and per-turn model override
   */
  send(
    content: string,
    options?: { taskId?: TaskId; modelId?: string },
  ): AsyncIterable<AgentEvent>;
  /** Abort the in-flight turn without disposing the session. */
  abort(): void;
  /** Abort, stop the runtime session, and drop listeners. */
  dispose(): Promise<void>;
  /**
   * Subscribe to events from {@link send} / lifecycle.
   * @param listener Called for each event
   * @returns Disposer
   */
  on(listener: (event: AgentEvent) => void): () => void;
  /** Async iterator of the same fan-out as {@link on}. */
  events(): AsyncIterable<AgentEvent>;
}
