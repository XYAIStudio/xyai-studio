/**
 * TurnController helpers — modelRef routing for chat turns.
 * CodexHost owns sessions / IPC; this module decides Codex vs Ollama
 * and runs the Ollama stream with a shared abort bag.
 */

import type { AgentEvent, PermissionMode } from '@xyai/contracts';
import {
  accessModeToPermissionMode,
  stallTimeoutForCapability,
} from '@xyai/core-runtime';
import {
  normalizeModelRef,
  parseCustomModelRef,
  toCodexModelId,
  toOllamaModelName,
} from '@xyai/contracts';
import type { CodexAdapter } from '@xyai/adapter-codex';
import {
  ensureOllamaRunning,
  listOllamaModelsFromApi,
  missingOllamaModelMessage,
  OLLAMA_NOT_RUNNING_CODE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  ollamaTagsIncludeModel,
  streamOllamaChat,
  type OllamaChatMessage,
} from '@xyai/model-hub';
import { streamOpenAiChatCompletions } from './openai-compat.js';
import type { CustomProvider } from './custom-providers.js';
import type { EngineMode } from './engine-mode.js';
import type { AccessMode } from './settings.js';
import {
  ollamaTurnUsesHarness,
  turnUsesHarness,
  type CapabilityNeed,
} from './harness/router.js';
import { inferCapabilityNeed } from './turn-intent.js';
import {
  accessModeToCodexSandbox,
  ensureStudioWorkspace,
  studioPersonalizeDir,
  type CodexSandboxSpec,
} from './studio-workspace.js';

export type CodexLocalProvider = 'ollama' | 'lmstudio';

export type TurnRoute =
  | { kind: 'ollama'; model: string }
  | {
      kind: 'codex';
      modelId: string;
      /** Local OSS inference via `codex exec --oss`. */
      oss?: boolean;
      localProvider?: CodexLocalProvider;
      /** Lift custom/cloud OpenAI-compat brain through Codex tools. */
      customProviderId?: string;
    }
  | { kind: 'custom'; providerId: string; modelId: string };

export interface ResolveTurnRouteOptions {
  /**
   * When true, `ollama:*` routes through Codex OSS harness (agent enhancement).
   * When false (product default), direct `runOllamaTurn` NDJSON stream.
   */
  localModelViaHarness?: boolean;
  /** Preferred: capability/engine selector. Overrides the boolean when set. */
  engineMode?: EngineMode;
  /** tools/planning lifts custom + local models onto Codex. Default chat. */
  capabilityNeed?: CapabilityNeed;
}

export interface PlanTurnInput {
  modelRef: string;
  userText: string;
  engineMode?: EngineMode;
  localModelViaHarness?: boolean;
  accessMode?: AccessMode;
  userDataDir?: string;
}

export interface TurnPlan {
  capabilityNeed: CapabilityNeed;
  /** Approval policy only; never changes capabilityNeed. */
  permissionMode: PermissionMode;
  stallTimeoutMs: number;
  route: TurnRoute;
  sandbox: CodexSandboxSpec;
  cwd: string;
  addDirs: string[];
}

/** Resolve send route from a modelRef (settings.modelId may hold modelRef). */
export function resolveTurnRoute(
  modelRef: string,
  opts: ResolveTurnRouteOptions = {},
): TurnRoute {
  const ref = normalizeModelRef(modelRef);
  const need = opts.capabilityNeed ?? 'chat';
  const custom = parseCustomModelRef(ref);
  if (custom) {
    const viaHarness =
      opts.engineMode !== undefined
        ? turnUsesHarness(opts.engineMode, need)
        : need !== 'chat';
    if (viaHarness) {
      return {
        kind: 'codex',
        modelId: custom.modelId,
        customProviderId: custom.providerId,
      };
    }
    return {
      kind: 'custom',
      providerId: custom.providerId,
      modelId: custom.modelId,
    };
  }
  const ollama = toOllamaModelName(ref);
  if (ollama) {
    const viaHarness =
      opts.engineMode !== undefined
        ? ollamaTurnUsesHarness(opts.engineMode, need)
        : opts.localModelViaHarness === true || need !== 'chat';
    if (viaHarness) {
      return {
        kind: 'codex',
        modelId: ollama,
        oss: true,
        localProvider: 'ollama',
      };
    }
    return { kind: 'ollama', model: ollama };
  }
  return { kind: 'codex', modelId: toCodexModelId(ref) };
}

/**
 * Single send-time plan: text-only intent + route + accessMode sandbox.
 * accessMode never changes capabilityNeed.
 */
export function planTurn(input: PlanTurnInput): TurnPlan {
  const accessMode = input.accessMode ?? 'default';
  const permissionMode = accessModeToPermissionMode(accessMode);
  const capabilityNeed = inferCapabilityNeed(input.userText);
  const route = resolveTurnRoute(input.modelRef, {
    engineMode: input.engineMode,
    localModelViaHarness: input.localModelViaHarness,
    capabilityNeed,
  });
  const userDataDir = input.userDataDir;
  const cwd = userDataDir
    ? ensureStudioWorkspace(userDataDir)
    : ensureStudioWorkspace();
  const personalize = userDataDir
    ? studioPersonalizeDir(userDataDir)
    : studioPersonalizeDir();
  return {
    capabilityNeed,
    permissionMode,
    stallTimeoutMs: stallTimeoutForCapability(capabilityNeed),
    route,
    sandbox: accessModeToCodexSandbox(accessMode),
    cwd,
    addDirs: [personalize],
  };
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

    try {
      const installed = await listOllamaModelsFromApi();
      const names = installed.map((m) => m.displayName);
      if (!ollamaTagsIncludeModel(names, model)) {
        yield {
          type: 'error',
          timestamp: now(),
          sessionId,
          taskId,
          payload: {
            message: missingOllamaModelMessage(model),
          },
        };
        return;
      }
    } catch {
      /* listing threw; stream maps fetch failed / HTTP not-found */
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
