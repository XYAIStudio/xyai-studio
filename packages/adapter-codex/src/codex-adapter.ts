/**
 * Codex Adapter — real `codex exec --json` when a native binary is available,
 * otherwise MOCK (or when XYAI_CODEX_MOCK=1 / forceMock).
 * DO NOT download or ship Codex binaries from this package; depend on @openai/codex.
 */

import { spawn } from 'node:child_process';
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

export class CodexAdapter implements AgentRuntime {
  readonly harnessId = 'codex';
  readonly isMock: boolean;

  /** Resolved binary info (null path when mock / missing) */
  readonly binary: ResolveCodexBinaryResult;

  private readonly options: CodexAdapterOptions;
  private readonly active = new Map<SessionId, SessionState>();

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
    });
  }

  async stop(sessionId: SessionId): Promise<void> {
    this.active.delete(sessionId);
  }

  async *send(options: SendMessageOptions): AsyncIterable<AgentEvent> {
    if (this.isMock) {
      yield* mockCodexSend(options, new Set(this.active.keys()));
      return;
    }
    yield* this.sendReal(options);
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
    const cwd =
      session?.cwd || this.options.cwd || process.cwd();
    const sandbox = this.options.sandbox ?? 'read-only';

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
      content,
    ];

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
    }

    const exitCode = await exitPromise;

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
