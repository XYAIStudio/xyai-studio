/**
 * Codex Adapter — real `codex exec --json` when a native binary is available,
 * otherwise MOCK (or when XYAI_CODEX_MOCK=1 / forceMock).
 * DO NOT download or ship Codex binaries from this package; depend on @openai/codex.
 *
 * Abort: track ChildProcess per sessionId; public abort() / stop() kill active turns
 * and yield error { message: 'cancelled', code: 'ABORTED' } (contracts have no task.cancelled).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  AgentEvent,
  AgentRuntime,
  SendMessageOptions,
  SessionId,
  StartSessionOptions,
} from '@xyai/contracts';
import { mockCodexSend, MOCK_MARKER } from './mock-codex.js';
import {
  parseCodexJsonlRawLine,
  type ParseCodexJsonlContext,
} from './parse-codex-jsonl.js';
import {
  resolveCodexBinary,
  type CodexBinarySource,
  type ResolveCodexBinaryResult,
} from './resolve-codex-bin.js';

export interface CodexAdapterOptions {
  /** Force mock even if binary exists */
  forceMock?: boolean;
  /** Override binary path */
  binaryPath?: string;
  /** Default cwd for -C */
  cwd?: string;
  /** Sandbox mode for -s, default 'read-only' */
  sandbox?: string;
}

interface SessionState {
  cwd?: string;
  modelId?: string;
}

function envWantsMock(): boolean {
  const v = process.env.XYAI_CODEX_MOCK;
  return v === '1' || v === 'true' || v === 'yes';
}

function timeoutMs(): number {
  const raw = process.env.XYAI_CODEX_TIMEOUT_MS;
  if (!raw) return 180_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CodexAdapter implements AgentRuntime {
  readonly harnessId = 'codex';
  readonly isMock: boolean;

  /** Resolved binary info (null path when mock / missing) */
  readonly binary: ResolveCodexBinaryResult;

  private readonly options: CodexAdapterOptions;
  private readonly active = new Map<SessionId, SessionState>();
  /** Live child processes keyed by sessionId */
  private readonly children = new Map<SessionId, ChildProcess>();
  /** Sessions whose turn was aborted (mock + real) */
  private readonly abortFlags = new Map<SessionId, boolean>();

  constructor(options: CodexAdapterOptions = {}) {
    this.options = options;
    const resolved = resolveCodexBinary({
      binaryPath: options.binaryPath,
    });
    this.binary = resolved;

    const forceMock = options.forceMock === true || envWantsMock();
    this.isMock = forceMock || !resolved.path;
  }

  get binarySource(): CodexBinarySource | null {
    return this.binary.source;
  }

  async start(options: StartSessionOptions): Promise<void> {
    this.active.set(options.sessionId, {
      cwd: options.cwd,
      modelId: options.modelId,
    });
  }

  /**
   * Kill the active child for one session (or all). Safe if nothing is running.
   */
  abort(sessionId?: SessionId): void {
    const ids = sessionId
      ? [sessionId]
      : [
          ...new Set([
            ...this.children.keys(),
            ...this.abortFlags.keys(),
            ...this.active.keys(),
          ]),
        ];
    for (const id of ids) {
      this.abortFlags.set(id, true);
      const child = this.children.get(id);
      if (child && !child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
    }
  }

  async stop(sessionId: SessionId): Promise<void> {
    this.abort(sessionId);
    this.active.delete(sessionId);
    this.children.delete(sessionId);
    this.abortFlags.delete(sessionId);
  }

  async *send(options: SendMessageOptions): AsyncIterable<AgentEvent> {
    this.abortFlags.delete(options.sessionId);
    if (this.isMock) {
      yield* this.sendMock(options);
      return;
    }
    yield* this.sendReal(options);
  }

  private abortedEvent(
    sessionId: SessionId,
    taskId: string,
  ): AgentEvent {
    return {
      type: 'error',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      payload: { message: 'cancelled', code: 'ABORTED' },
    };
  }

  private async *sendMock(
    options: SendMessageOptions,
  ): AsyncIterable<AgentEvent> {
    const { sessionId, taskId } = options;
    for await (const ev of mockCodexSend(
      options,
      new Set(this.active.keys()),
    )) {
      if (this.abortFlags.get(sessionId)) {
        this.abortFlags.delete(sessionId);
        yield this.abortedEvent(sessionId, taskId);
        return;
      }
      yield ev;
      // Allow abort() between fast mock yields
      await sleep(8);
      if (this.abortFlags.get(sessionId)) {
        this.abortFlags.delete(sessionId);
        yield this.abortedEvent(sessionId, taskId);
        return;
      }
    }
  }

  private async *sendReal(
    options: SendMessageOptions,
  ): AsyncIterable<AgentEvent> {
    const { sessionId, taskId, content } = options;
    const now = () => new Date().toISOString();

    if (!this.active.has(sessionId)) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { message: 'session not started' },
      };
      return;
    }

    const bin = this.binary.path;
    if (!bin) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { message: 'Codex binary not resolved' },
      };
      return;
    }

    const session = this.active.get(sessionId);
    const cwd = session?.cwd || this.options.cwd || process.cwd();
    const sandbox = this.options.sandbox ?? 'read-only';
    const modelId = session?.modelId;

    // IMPORTANT: prompt is ONE argv token; do not join args into a single string.
    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '-s',
      sandbox,
      '-C',
      cwd,
    ];
    if (modelId) {
      args.push('-m', modelId);
    }
    args.push(content);

    const ctx: ParseCodexJsonlContext = {
      sessionId,
      taskId,
      sessionStarted: false,
    };

    let sawAgentMessage = false;
    const spawnState: { error: Error | null } = { error: null };

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    });
    this.children.set(sessionId, child);

    // Codex may print "Reading additional input from stdin..." on stderr — ignore.
    child.stderr?.on('data', () => {
      /* intentionally ignored */
    });

    const exitPromise = new Promise<number | null>((resolve) => {
      child.once('error', (err: Error) => {
        spawnState.error = err;
        resolve(null);
      });
      child.once('exit', (code) => resolve(code));
    });

    const limitMs = timeoutMs();
    const killer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, limitMs);

    const rl = createInterface({ input: child.stdout! });

    try {
      for await (const rawLine of rl) {
        if (this.abortFlags.get(sessionId)) {
          break;
        }
        const events = parseCodexJsonlRawLine(rawLine, ctx);
        if (!events) continue;
        for (const ev of events) {
          if (ev.type === 'session.started') {
            ctx.sessionStarted = true;
          }
          if (ev.type === 'message.completed') {
            sawAgentMessage = true;
          }
          yield ev;
        }
      }
    } finally {
      clearTimeout(killer);
      this.children.delete(sessionId);
    }

    const exitCode = await exitPromise;

    if (this.abortFlags.get(sessionId)) {
      this.abortFlags.delete(sessionId);
      yield this.abortedEvent(sessionId, taskId);
      return;
    }

    if (spawnState.error) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: {
          message: `Codex spawn failed: ${spawnState.error.message}`,
          code: 'SPAWN_ERROR',
        },
      };
      return;
    }

    if ((exitCode ?? 0) !== 0 && !sawAgentMessage) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: {
          message: `Codex exited with code ${exitCode ?? 'unknown'} and no agent_message`,
          exitCode,
        },
      };
    }
  }
}

export function createCodexAdapter(
  options?: CodexAdapterOptions,
): CodexAdapter {
  return new CodexAdapter(options);
}

export { MOCK_MARKER };
export type { ResolveCodexBinaryResult, CodexBinarySource };
export { resolveCodexBinary } from './resolve-codex-bin.js';
export {
  parseCodexJsonlLine,
  parseCodexJsonlRawLine,
} from './parse-codex-jsonl.js';
