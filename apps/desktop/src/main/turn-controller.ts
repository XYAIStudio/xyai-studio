/**
 * TurnController helpers — modelRef routing for chat turns.
 * CodexHost owns sessions / IPC; this module decides Codex vs Ollama
 * and runs the Ollama stream with a shared abort bag.
 */

import type { AgentEvent } from '@xyai/contracts';
import {
  normalizeModelRef,
  parseCustomModelRef,
  toCodexModelId,
  toOllamaModelName,
} from '@xyai/contracts';
import type { CodexAdapter } from '@xyai/adapter-codex';
import {
  ensureOllamaRunning,
  OLLAMA_NOT_RUNNING_CODE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  streamOllamaChat,
  type OllamaChatMessage,
} from '@xyai/model-hub';
import { streamOpenAiChatCompletions } from './openai-compat.js';
import type { CustomProvider } from './custom-providers.js';

export type TurnRoute =
  | { kind: 'ollama'; model: string }
  | { kind: 'codex'; modelId: string }
  | { kind: 'custom'; providerId: string; modelId: string };

/** Resolve send route from a modelRef (settings.modelId may hold modelRef). */
export function resolveTurnRoute(modelRef: string): TurnRoute {
  const ref = normalizeModelRef(modelRef);
  const custom = parseCustomModelRef(ref);
  if (custom) {
    return {
      kind: 'custom',
      providerId: custom.providerId,
      modelId: custom.modelId,
    };
  }
  const ollama = toOllamaModelName(ref);
  if (ollama) return { kind: 'ollama', model: ollama };
  return { kind: 'codex', modelId: toCodexModelId(ref) };
}

/** Abort both Codex adapter turn and in-flight Ollama fetch. */
export class TurnAbortBag {
  private ollamaAbort: AbortController | null = null;

  beginCustom(): AbortSignal {
    return this.beginOllama();
  }

  beginOllama(): AbortSignal {
    try {
      this.ollamaAbort?.abort();
    } catch {
      /* ignore */
    }
    this.ollamaAbort = new AbortController();
    return this.ollamaAbort.signal;
  }

  stop(adapter: CodexAdapter | null, sessionId: string | null): void {
    if (sessionId && adapter) {
      adapter.abort(sessionId);
    }
    try {
      this.ollamaAbort?.abort();
    } catch {
      /* ignore */
    }
    this.ollamaAbort = null;
  }

  clearOllama(): void {
    this.ollamaAbort = null;
  }

  get ollamaSignal(): AbortSignal | null {
    return this.ollamaAbort?.signal ?? null;
  }
}

export async function* runOllamaTurn(options: {
  sessionId: string;
  taskId: string;
  model: string;
  /** @deprecated Prefer `messages` for multi-turn. Kept for single-turn callers. */
  content?: string;
  messages?: OllamaChatMessage[];
  signal: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const { sessionId, taskId, model, content, messages, signal } = options;
  const now = () => new Date().toISOString();

  yield {
    type: 'session.started',
    timestamp: now(),
    sessionId,
    taskId,
  };

  let accumulated = '';
  let completed = false;

  try {
    const ensured = await ensureOllamaRunning({ timeoutMs: 15000 });
    if (!ensured.running) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: {
          message: ensured.message || OLLAMA_NOT_RUNNING_MESSAGE,
          code: OLLAMA_NOT_RUNNING_CODE,
        },
      };
      return;
    }

    for await (const delta of streamOllamaChat({
      model,
      content,
      messages,
      signal,
    })) {
      if (delta.text) {
        accumulated += delta.text;
        yield {
          type: 'message.delta',
          timestamp: now(),
          sessionId,
          taskId,
          payload: { text: delta.text, delta: delta.text },
        };
      }
      if (delta.done) {
        completed = true;
        yield {
          type: 'message.completed',
          timestamp: now(),
          sessionId,
          taskId,
          payload: { text: accumulated },
        };
      }
    }

    // Abort may end the generator without throwing — emit cancelled so UI can
    // treat it as stop (not a red error). Renderer may already have flushed.
    if (!completed && signal.aborted) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { message: 'cancelled', code: 'ABORTED' },
      };
    } else if (!completed && accumulated) {
      // Stream ended without explicit done — still finalize.
      yield {
        type: 'message.completed',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { text: accumulated },
      };
    }
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') || signal.aborted;
    const code =
      !aborted &&
      err instanceof Error &&
      (err as { code?: string }).code === OLLAMA_NOT_RUNNING_CODE
        ? OLLAMA_NOT_RUNNING_CODE
        : undefined;
    yield {
      type: 'error',
      timestamp: now(),
      sessionId,
      taskId,
      payload: aborted
        ? { message: 'cancelled', code: 'ABORTED' }
        : {
            message: err instanceof Error ? err.message : String(err),
            ...(code ? { code } : {}),
          },
    };
  }
}


export async function* runCustomProviderTurn(options: {
  sessionId: string;
  taskId: string;
  provider: CustomProvider;
  modelId: string;
  messages?: OllamaChatMessage[];
  content?: string;
  signal: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const { sessionId, taskId, provider, modelId, content, messages, signal } =
    options;
  const now = () => new Date().toISOString();

  yield {
    type: 'session.started',
    timestamp: now(),
    sessionId,
    taskId,
  };

  let msgs: OllamaChatMessage[] =
    messages && messages.length > 0
      ? messages
          .filter((m) => m && typeof m.content === 'string' && m.content.trim())
          .map((m) => ({
            role:
              m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
            content: m.content.trim(),
          }))
      : [];
  if (msgs.length === 0) {
    const c = (content ?? '').trim();
    if (!c) {
      yield {
        type: 'message.completed',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { text: '' },
      };
      return;
    }
    msgs = [{ role: 'user', content: c }];
  }

  if (provider.protocol === 'anthropic-messages') {
    yield {
      type: 'error',
      timestamp: now(),
      sessionId,
      taskId,
      payload: {
        message:
          'Anthropic Messages 协议将在后续版本接通；请先改用 Chat Completions（XYAI 桥接）',
      },
    };
    return;
  }

  if (provider.protocol === 'openai-responses') {
    // Prefer chat-completions path for OpenAI-compatible gateways (DeepSeek etc.)
    // Responses API wiring can be added later; XYAI bridges via Chat Completions.
  }

  let accumulated = '';
  let completed = false;

  try {
    for await (const delta of streamOpenAiChatCompletions({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      requestPath: provider.requestPath,
      headers: provider.headers,
      model: modelId,
      messages: msgs.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      signal,
    })) {
      if (delta.text) {
        accumulated += delta.text;
        yield {
          type: 'message.delta',
          timestamp: now(),
          sessionId,
          taskId,
          payload: { text: delta.text, delta: delta.text },
        };
      }
      if (delta.done) {
        completed = true;
        yield {
          type: 'message.completed',
          timestamp: now(),
          sessionId,
          taskId,
          payload: { text: accumulated },
        };
      }
    }

    if (!completed && signal.aborted) {
      yield {
        type: 'error',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { message: 'cancelled', code: 'ABORTED' },
      };
    } else if (!completed && accumulated) {
      yield {
        type: 'message.completed',
        timestamp: now(),
        sessionId,
        taskId,
        payload: { text: accumulated },
      };
    }
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') || signal.aborted;
    yield {
      type: 'error',
      timestamp: now(),
      sessionId,
      taskId,
      payload: aborted
        ? { message: 'cancelled', code: 'ABORTED' }
        : {
            message: err instanceof Error ? err.message : String(err),
          },
    };
  }
}
