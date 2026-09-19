/**
 * SessionFacade over an AgentRuntime: subscribe, send, abort, stall hook.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  AgentKind,
  AgentRuntime,
  PermissionMode,
  SessionFacade,
  SessionId,
  StartSessionOptions,
  TaskId,
} from '@xyai/contracts';
import { normalizeAgentKind } from '@xyai/contracts';
import { inferTurnCapability } from './infer-capability.js';
import {
  createStallWatchdog,
  stallTimeoutForCapability,
  type StallWatchdog,
} from './stall-watchdog.js';

export interface RuntimeSessionOptions {
  id: SessionId;
  runtime: AgentRuntime;
  agentKind?: AgentKind;
  permissionMode?: PermissionMode;
  cwd?: string;
  modelId?: string;
  /** Override inferred stall timeout for every send. */
  stallTimeoutMs?: number;
  /** Extra hook when the stall timer fires (abort always runs). */
  onStall?: () => void;
}

/**
 * Thin live session: Core connect layer, not an Agent Loop.
 */
export class RuntimeSession implements SessionFacade {
  readonly id: SessionId;
  readonly agentKind: AgentKind;
  readonly permissionMode: PermissionMode;

  private readonly runtime: AgentRuntime;
  private readonly startDefaults: StartSessionOptions;
  private readonly stallTimeoutMs?: number;
  private readonly onStall?: () => void;
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly eventBuffer: AgentEvent[] = [];
  private eventWaiters: Array<(event: AgentEvent | null) => void> = [];
  private watchdog: StallWatchdog | null = null;
  private started = false;
  private disposed = false;

  constructor(options: RuntimeSessionOptions) {
    this.id = options.id;
    this.runtime = options.runtime;
    this.agentKind =
      options.agentKind ?? normalizeAgentKind(options.runtime.harnessId);
    this.permissionMode = options.permissionMode ?? 'default';
    this.stallTimeoutMs = options.stallTimeoutMs;
    this.onStall = options.onStall;
    this.startDefaults = {
      sessionId: options.id,
      harnessId: this.agentKind,
      modelId: options.modelId,
      cwd: options.cwd,
    };
  }

  /**
   * @param options Overlay for the adapter start options
   */
  async start(options?: Partial<StartSessionOptions>): Promise<void> {
    this.assertOpen();
    await this.runtime.start({
      ...this.startDefaults,
      ...options,
      sessionId: this.id,
      harnessId: options?.harnessId ?? this.agentKind,
    });
    this.started = true;
  }

  /**
   * @param content User text
   * @param options Optional task id and per-turn model
   */
  async *send(
    content: string,
    options?: { taskId?: TaskId; modelId?: string },
  ): AsyncIterable<AgentEvent> {
    this.assertOpen();
    if (!this.started) await this.start();
    const taskId = options?.taskId ?? `task-${randomUUID()}`;
    const timeoutMs =
      this.stallTimeoutMs ??
      stallTimeoutForCapability(inferTurnCapability(content));
    const dog = createStallWatchdog({
      timeoutMs,
      onStall: () => {
        this.onStall?.();
        this.abort();
      },
    });
    this.watchdog = dog;
    try {
      for await (const ev of this.runtime.send({
        sessionId: this.id,
        taskId,
        content,
        modelId: options?.modelId,
      })) {
        dog.reset();
        this.emit(ev);
        yield ev;
      }
    } finally {
      dog.dispose();
      if (this.watchdog === dog) this.watchdog = null;
    }
  }

  abort(): void {
    this.watchdog?.dispose();
    this.watchdog = null;
    this.runtime.abort(this.id);
  }

  async dispose(): Promise<void> {
    this.abort();
    this.disposed = true;
    this.listeners.clear();
    const waiters = this.eventWaiters.splice(0);
    for (const w of waiters) w(null);
    await this.runtime.stop(this.id);
  }

  /**
   * @param listener Called for each fanned-out event
   * @returns Disposer
   */
  on(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async *events(): AsyncIterable<AgentEvent> {
    while (!this.disposed) {
      if (this.eventBuffer.length > 0) {
        yield this.eventBuffer.shift()!;
        continue;
      }
      const ev = await new Promise<AgentEvent | null>((resolve) => {
        if (this.disposed) {
          resolve(null);
          return;
        }
        this.eventWaiters.push(resolve);
      });
      if (!ev) return;
      yield ev;
    }
  }

  private emit(ev: AgentEvent): void {
    for (const listener of this.listeners) listener(ev);
    const waiter = this.eventWaiters.shift();
    if (waiter) waiter(ev);
    else this.eventBuffer.push(ev);
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error('session disposed');
  }
}
