/**
 * Map one Codex `exec --json` JSONL object → AgentEvent[] (or null to ignore).
 */

import type { AgentEvent, SessionId, TaskId } from '@xyai/contracts';

export interface ParseCodexJsonlContext {
  sessionId: SessionId;
  taskId: TaskId;
  /** Whether session.started was already emitted for this turn */
  sessionStarted?: boolean;
}

function now(): string {
  return new Date().toISOString();
}

function base(
  type: AgentEvent['type'],
  ctx: ParseCodexJsonlContext,
  payload?: unknown,
): AgentEvent {
  return {
    type,
    timestamp: now(),
    sessionId: ctx.sessionId,
    taskId: ctx.taskId,
    payload,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse a single JSONL line (already JSON.parsed) into zero or more AgentEvents.
 * Returns null when the line should be ignored entirely.
 */
export function parseCodexJsonlLine(
  line: unknown,
  ctx: ParseCodexJsonlContext,
): AgentEvent[] | null {
  if (!isRecord(line) || typeof line.type !== 'string') {
    return null;
  }

  switch (line.type) {
    case 'thread.started': {
      return [
        base('session.started', ctx, {
          threadId: line.thread_id ?? line.threadId,
          harness: 'codex',
        }),
      ];
    }

    case 'turn.started': {
      if (ctx.sessionStarted) return [];
      return [
        base('session.started', ctx, {
          harness: 'codex',
          from: 'turn.started',
        }),
      ];
    }

    case 'item.completed': {
      const item = line.item;
      if (!isRecord(item) || typeof item.type !== 'string') {
        return null;
      }

      if (item.type === 'agent_message') {
        const text = typeof item.text === 'string' ? item.text : '';
        return [
          base('message.delta', ctx, { text, itemId: item.id }),
          base('message.completed', ctx, { text, itemId: item.id }),
        ];
      }

      if (item.type === 'error') {
        const message =
          typeof item.message === 'string' ? item.message : 'Codex item error';
        const soft =
          /skill.?budget|warning|budget/i.test(message) ||
          /non.?fatal/i.test(message);
        return [
          base('error', ctx, {
            message,
            itemId: item.id,
            // In-band item errors are non-fatal so agent_message may still follow
            nonFatal: true,
            severity: soft ? 'warning' : 'error',
          }),
        ];
      }

      // Best-effort tool mapping
      if (
        item.type === 'tool_call' ||
        item.type === 'function_call' ||
        item.type === 'command_execution'
      ) {
        return [
          base('tool.call', ctx, {
            itemId: item.id,
            name: item.name ?? item.tool ?? item.type,
            arguments: item.arguments ?? item.command ?? item,
          }),
        ];
      }

      if (
        item.type === 'tool_result' ||
        item.type === 'function_call_output' ||
        item.type === 'command_execution_result'
      ) {
        return [
          base('tool.result', ctx, {
            itemId: item.id,
            name: item.name ?? item.tool ?? item.type,
            result: item.result ?? item.output ?? item,
          }),
        ];
      }

      return null;
    }

    case 'turn.completed': {
      // Usage can be attached by the adapter to a prior message.completed;
      // no required event here.
      return [];
    }

    default:
      return null;
  }
}

/**
 * Parse a raw stdout line string. Invalid JSON → null.
 */
export function parseCodexJsonlRawLine(
  raw: string,
  ctx: ParseCodexJsonlContext,
): AgentEvent[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return parseCodexJsonlLine(JSON.parse(trimmed) as unknown, ctx);
  } catch {
    return null;
  }
}
