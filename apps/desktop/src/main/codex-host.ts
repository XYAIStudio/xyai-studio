/**
 * Main-process Codex host — multi-session registry + harness factory.
 * Turn routing via Core model gateway (stream vs Codex) + turn-controller.
 * Renderer never imports adapters; all turns go through IPC.
 */

import { randomUUID } from 'node:crypto';
import { listHarnesses, SessionRegistry } from '@xyai/core';
import {
  CODEX_ERROR_CODE,
  isHarnessUnavailablePayload,
  mapCodexUserError,
  resolveCodexBinary,
  type CodexAdapter,
  type CodexBinarySource,
} from '@xyai/adapter-codex';
import {
  createCodexHostAdapter,
  DEFAULT_STUDIO_ASSEMBLY,
} from './harness/index.js';
import type { EngineMode } from './engine-mode.js';
import type { AgentEvent } from '@xyai/contracts';
import { normalizeModelRef } from '@xyai/contracts';
import { watchStall } from '@xyai/core-runtime';
import { maybeAttachKnowledgeContext } from './knowledge-turn.js';
import {
  loadUnifiedModelCatalog,
  toStatusModelLists,
} from './model-catalog-facade.js';
import {
  planTurn,
  resolveTurnRoute,
  runCustomProviderTurn,
  runOllamaTurn,
  TurnAbortBag,
  type TurnRoute,
} from './turn-controller.js';
import {
  customProviderCodexInjection,
  openaiCompatDrivesCodexTools,
} from './custom-provider-codex.js';
import { installWorkspacePlugins } from './install-workspace-plugins.js';
import {
  effectiveCwd,
  getWorkspaceUserDataDir,
  setWorkspaceUserDataDir,
  workspaceToolPreamble,
} from './studio-workspace.js';
import {
  DEFAULT_PROJECT_ID,
  loadCollabState,
} from './collab-store.js';
import {
  classifyToolsFallback,
  shouldShowWriteFallbackTip,
  toolsFallbackPayload,
} from './turn-fallback.js';
import {
  CHAT_ONLY_NO_WRITE_SYSTEM,
  CHAT_ONLY_NO_WRITE_TIP,
  isToolCapability,
} from './turn-intent.js';
import {
  emptySessionMemory,
  harvestFactsFromTurn,
  packMessagesForTurn,
  type ChatMessage,
  type SessionMemoryState,
} from './context-pack.js';
import {
  loadDurableFacts,
  mergeDurableFacts,
  setMemoryUserDataDir,
} from './memory-store.js';
import {
  loadSession,
  saveSession,
  setSessionUserDataDir,
} from './session-store.js';
import {
  ensureOllamaRunning,
  OLLAMA_NOT_RUNNING_CODE,
  OLLAMA_NOT_RUNNING_MESSAGE,
} from '@xyai/model-hub';
import {
  DEFAULT_MODELS,
  loadSettings,
  saveSettings,
  type XyaiSettings,
} from './settings.js';
import { missingCloudApiKeyForModelRef } from './cloud-api-key.js';
import {
  customModelsForStatus,
  findCustomProvider,
  type CustomProvider,
} from './custom-providers.js';

export interface HostSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodexHostStatus {
  isMock: boolean;
  binarySource: CodexBinarySource | null;
  binaryPath: string | null;
  activeSessionId: string | null;
  sessions: HostSessionSummary[];
  isSending: boolean;
  /** Canonical modelRef (settings.modelId may hold modelRef). */
  modelId: string;
  forceMock: boolean;
  codexBin: string;
  /** Default `auto`: ollama:* is true local stream. */
  engineMode: EngineMode;
  /** Derived: true only when engineMode is `codex-oss`. */
  localModelViaHarness: boolean;
  /** Assembly harness rows (id + enabled) for Settings. */
  harnesses: { id: string; enabled: boolean }[];
  models: { id: string; label: string; hint?: string }[];
  localModels: { id: string; label: string; hint?: string }[];
  cloudProviders: XyaiSettings['cloudProviders'];
  customProviders: CustomProvider[];
  accessMode: XyaiSettings['accessMode'];
}

export function configureChatPersistence(userDataDir: string): void {
  setMemoryUserDataDir(userDataDir);
  setSessionUserDataDir(userDataDir);
  setWorkspaceUserDataDir(userDataDir);
}

/** Resolve CollabProject.cwd for a chat session (empty → studio workspace). */
export function resolveSessionProjectCwd(sessionId: string): string {
  const state = loadCollabState();
  const meta = state.sessions.find((s) => s.sessionId === sessionId);
  const projectId = meta?.projectId || DEFAULT_PROJECT_ID;
  const project = state.projects.find((x) => x.id === projectId);
  return effectiveCwd(project?.cwd ?? '');
}


export class CodexHost {
  private readonly registry = new SessionRegistry();
  private adapter: CodexAdapter;
  private readonly profile = DEFAULT_STUDIO_ASSEMBLY;
  private activeSessionId: string | null = null;
  private sending = false;
  private readonly aborts = new TurnAbortBag();
  /** Full session transcripts (user/assistant). */
  private readonly histories = new Map<string, ChatMessage[]>();
  /** Per-session rolling handoff memory. */
  private readonly sessionMem = new Map<string, SessionMemoryState>();
  /** Full transcript kept on disk; model sees packed window only. */
  private localModels: { id: string; label: string; hint?: string }[] = [];
  private catalogModels: { id: string; label: string; hint?: string }[] =
    DEFAULT_MODELS.map((m) => ({
      id: normalizeModelRef(m.id),
      label: m.label,
    }));
  private settings: XyaiSettings;

  constructor() {
    this.settings = loadSettings();
    // Ensure modelId is a canonical modelRef
    this.settings = {
      ...this.settings,
      modelId: normalizeModelRef(this.settings.modelId),
    };
    this.adapter = this.buildAdapter();
    const first = this.createSession('新对话');
    this.activeSessionId = first.id;
  }

  /** Current session modelRef (Phase A: mirrored in settings.modelId). */
  get modelRef(): string {
    return normalizeModelRef(this.settings.modelId);
  }

  private buildAdapter(): CodexAdapter {
    return createCodexHostAdapter({
      forceMock: this.settings.forceMock,
      binaryPath: this.settings.codexBin.trim() || undefined,
      profile: this.profile,
    });
  }

  private routeOpts() {
    return {
      engineMode: this.settings.engineMode,
      localModelViaHarness: this.settings.localModelViaHarness === true,
    };
  }

  private resolveRoute() {
    return resolveTurnRoute(this.modelRef, this.routeOpts());
  }

  private startSessionOpts(sessionId: string) {
    const route = this.resolveRoute();
    const cwd = resolveSessionProjectCwd(sessionId);
    if (route.kind === 'codex') {
      return {
        sessionId,
        harnessId: 'codex' as const,
        modelId: route.modelId,
        oss: route.oss === true,
        localProvider: route.localProvider,
        cwd,
      };
    }
    return {
      sessionId,
      harnessId: 'codex' as const,
      modelId: toFallbackCodexId(),
      cwd,
    };
  }

  /** Rebuild adapter when forceMock / codexBin change. */
  async applySettings(partial: Partial<XyaiSettings>): Promise<XyaiSettings> {
    const prevBin = this.settings.codexBin;
    const prevMock = this.settings.forceMock;
    const patched =
      partial.modelId !== undefined
        ? { ...partial, modelId: normalizeModelRef(partial.modelId) }
        : partial;
    this.settings = saveSettings(patched);
    if (partial.modelId !== undefined || partial.customProviders !== undefined) {
      await this.refreshLocalModels();
    }
    this.settings = {
      ...this.settings,
      modelId: normalizeModelRef(this.settings.modelId),
    };
    if (
      this.settings.codexBin !== prevBin ||
      this.settings.forceMock !== prevMock
    ) {
      void this.adapter.abort();
      this.adapter = this.buildAdapter();
      for (const s of this.registry.list()) {
        void this.adapter.start(this.startSessionOpts(s.id));
      }
    }
    return this.settings;
  }

  getSettings(): XyaiSettings {
    return this.settings;
  }

    async refreshLocalModels(): Promise<void> {
    try {
      const catalog = await loadUnifiedModelCatalog(
        undefined,
        this.settings.customProviders || [],
      );
      const lists = toStatusModelLists(catalog);
      this.localModels = lists.localModels;
      this.catalogModels = lists.models;
    } catch {
      this.localModels = [];
      this.catalogModels = DEFAULT_MODELS.map((m) => ({
        id: normalizeModelRef(m.id),
        label: m.label,
      }));
      const custom = customModelsForStatus(this.settings.customProviders || []);
      const seen = new Set(this.catalogModels.map((m) => m.id));
      for (const m of custom) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        this.catalogModels.push({ id: m.id, label: `${m.group} · ${m.label}` });
      }
    }
  }


  private historyFor(sessionId: string): ChatMessage[] {
    let h = this.histories.get(sessionId);
    if (!h) {
      const loaded = loadSession(sessionId);
      if (loaded?.messages?.length) {
        h = loaded.messages.filter(
          (m) => m.role === 'user' || m.role === 'assistant',
        );
        this.sessionMem.set(
          sessionId,
          loaded.memory || emptySessionMemory(),
        );
      } else {
        h = [];
      }
      this.histories.set(sessionId, h);
    }
    return h;
  }

  private memoryFor(sessionId: string): SessionMemoryState {
    let m = this.sessionMem.get(sessionId);
    if (!m) {
      const loaded = loadSession(sessionId);
      m = loaded?.memory || emptySessionMemory();
      this.sessionMem.set(sessionId, m);
    }
    return m;
  }

  private persistSession(sessionId: string): void {
    const sess = this.registry.get(sessionId);
    // Persist FULL transcript — never call packForModel here (that would recurse).
    const messages = this.historyFor(sessionId).slice();
    const memory = this.memoryFor(sessionId);
    saveSession({
      id: sessionId,
      title: sess?.title || 'Chat',
      updatedAt: new Date().toISOString(),
      messages,
      memory,
    });
  }

  private async *streamCustomProviderTurn(opts: {
    sessionId: string;
    taskId: string;
    provider: CustomProvider;
    modelId: string;
    userText: string;
    honestyNoWrite: boolean;
    omitUserAppend?: boolean;
  }): AsyncIterable<AgentEvent> {
    if (!opts.omitUserAppend) {
      this.appendHistory(opts.sessionId, 'user', opts.userText);
    }
    const messages = this.packForModel(opts.sessionId);
    if (opts.honestyNoWrite) {
      messages.unshift({
        role: 'system',
        content: CHAT_ONLY_NO_WRITE_SYSTEM,
      });
    }
    const signal = this.aborts.beginCustom();
    let assistantText = '';
    try {
      for await (const ev of runCustomProviderTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        provider: opts.provider,
        modelId: opts.modelId,
        messages,
        signal,
      })) {
        if (ev.type === 'message.delta') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const piece =
            (typeof p.delta === 'string' && p.delta) ||
            (typeof p.text === 'string' && p.text) ||
            '';
          if (piece) assistantText += piece;
        }
        if (ev.type === 'message.completed') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const finalText =
            (typeof p.text === 'string' && p.text.trim()) ||
            assistantText.trim();
          if (finalText) {
            this.appendHistory(opts.sessionId, 'assistant', finalText);
            this.rememberFromTurn(opts.sessionId, opts.userText, finalText);
          }
        }
        yield ev;
      }
    } finally {
      this.aborts.clearOllama();
    }
  }

  private async *streamLocalOllamaTurn(opts: {
    sessionId: string;
    taskId: string;
    model: string;
    userText: string;
    omitUserAppend?: boolean;
    honestyNoWrite?: boolean;
  }): AsyncIterable<AgentEvent> {
    if (!opts.omitUserAppend) {
      this.appendHistory(opts.sessionId, 'user', opts.userText);
    }
    const messages = this.packForModel(opts.sessionId);
    if (opts.honestyNoWrite) {
      messages.unshift({
        role: 'system',
        content: CHAT_ONLY_NO_WRITE_SYSTEM,
      });
    }
    const signal = this.aborts.beginOllama();
    let assistantText = '';
    try {
      for await (const ev of runOllamaTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        model: opts.model,
        messages,
        signal,
      })) {
        if (ev.type === 'message.delta') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const piece =
            (typeof p.delta === 'string' && p.delta) ||
            (typeof p.text === 'string' && p.text) ||
            '';
          if (piece) assistantText += piece;
        }
        if (ev.type === 'message.completed') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const finalText =
            (typeof p.text === 'string' && p.text.trim()) ||
            assistantText.trim();
          if (finalText) {
            this.appendHistory(opts.sessionId, 'assistant', finalText);
            const hist = this.historyFor(opts.sessionId);
            const lastUser = [...hist].reverse().find((m) => m.role === 'user');
            if (lastUser) {
              this.rememberFromTurn(opts.sessionId, lastUser.content, finalText);
            }
          }
        }
        yield ev;
      }
    } finally {
      this.aborts.clearOllama();
    }
  }

  /**
   * Continue a failed tools turn on the matching ollama / custom stream.
   * No-op when the turn has no stream brain (plain cloud modelRef).
   */
  private async *fallbackBrainStream(opts: {
    sessionId: string;
    taskId: string;
    userText: string;
    route: TurnRoute;
    honestyNoWrite: boolean;
    omitUserAppend: boolean;
  }): AsyncIterable<AgentEvent> {
    if (opts.route.kind === 'custom') {
      const provider = findCustomProvider(
        this.settings.customProviders || [],
        opts.route.providerId,
      );
      if (!provider) return;
      yield* this.streamCustomProviderTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        provider,
        modelId: opts.route.modelId,
        userText: opts.userText,
        honestyNoWrite: opts.honestyNoWrite,
        omitUserAppend: opts.omitUserAppend,
      });
      return;
    }
    if (opts.route.kind === 'ollama') {
      yield* this.streamLocalOllamaTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        model: opts.route.model,
        userText: opts.userText,
        honestyNoWrite: opts.honestyNoWrite,
        omitUserAppend: opts.omitUserAppend,
      });
      return;
    }
    if (opts.route.kind === 'codex' && opts.route.customProviderId) {
      const provider = findCustomProvider(
        this.settings.customProviders || [],
        opts.route.customProviderId,
      );
      if (!provider) return;
      yield* this.streamCustomProviderTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        provider,
        modelId: opts.route.modelId,
        userText: opts.userText,
        honestyNoWrite: opts.honestyNoWrite,
        omitUserAppend: opts.omitUserAppend,
      });
      return;
    }
    if (opts.route.kind === 'codex' && opts.route.oss) {
      yield* this.streamLocalOllamaTurn({
        sessionId: opts.sessionId,
        taskId: opts.taskId,
        model: opts.route.modelId,
        userText: opts.userText,
        honestyNoWrite: opts.honestyNoWrite,
        omitUserAppend: opts.omitUserAppend,
      });
    }
  }

  private appendHistory(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    const trimmed = content.trim();
    if (!trimmed) return;
    const h = this.historyFor(sessionId);
    h.push({ role, content: trimmed });
    // No hard drop: full transcript persists; packing compresses for the model.
    this.persistSession(sessionId);
  }

  private clearHistory(sessionId: string): void {
    this.histories.delete(sessionId);
    this.sessionMem.delete(sessionId);
  }

  /** Pack full transcript → model messages (handoff + recent). */
  private packForModel(sessionId: string): ChatMessage[] {
    const full = this.historyFor(sessionId);
    const mem = this.memoryFor(sessionId);
    const { messages, mem: nextMem } = packMessagesForTurn(full, mem, {
      durableFacts: loadDurableFacts(),
      recentCount: 24,
      charBudget: 24_000,
    });
    this.sessionMem.set(sessionId, nextMem);
    this.persistSession(sessionId);
    return messages;
  }

  private rememberFromTurn(
    sessionId: string,
    userText: string,
    assistantText: string,
  ): void {
    const facts = harvestFactsFromTurn(userText, assistantText);
    if (!facts.length) return;
    const mem = this.memoryFor(sessionId);
    mem.sessionFacts = [...(mem.sessionFacts || []), ...facts].slice(-50);
    this.sessionMem.set(sessionId, mem);
    mergeDurableFacts(facts);
    this.persistSession(sessionId);
  }

  listSessions(): HostSessionSummary[] {
    return this.registry
      .list()
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
  }

  createSession(title?: string): HostSessionSummary {
    const session = this.registry.create({
      id: `ui-${randomUUID()}`,
      title: (title && title.trim()) || `对话 ${this.registry.list().length + 1}`,
      harnessId: 'codex',
      modelRef: this.modelRef,
    });
    void this.adapter.start(this.startSessionOpts(session.id));
    this.activeSessionId = session.id;
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  switchSession(id: string): HostSessionSummary | null {
    const s = this.registry.get(id);
    if (!s) return null;
    this.activeSessionId = id;
    void this.ensureStarted();
    return {
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async deleteSession(id: string): Promise<HostSessionSummary[]> {
    if (this.sending && this.activeSessionId === id) {
      this.stopTurn();
    }
    await this.adapter.stop(id);
    this.registry.remove(id);
    this.clearHistory(id);
    if (this.activeSessionId === id) {
      const rest = this.listSessions();
      if (rest.length === 0) {
        const created = this.createSession('新对话');
        this.activeSessionId = created.id;
      } else {
        this.activeSessionId = rest[0]!.id;
        await this.ensureStarted();
      }
    }
    return this.listSessions();
  }

  getStatus(): CodexHostStatus {
    const resolved = resolveCodexBinary({
      binaryPath: this.settings.codexBin.trim() || undefined,
    });
    return {
      isMock: this.adapter.isMock,
      binarySource: this.adapter.binarySource ?? resolved.source,
      binaryPath: this.adapter.binary.path ?? resolved.path,
      activeSessionId: this.activeSessionId,
      sessions: this.listSessions(),
      isSending: this.sending,
      modelId: this.modelRef,
      forceMock: this.settings.forceMock,
      codexBin: this.settings.codexBin,
      engineMode: this.settings.engineMode,
      localModelViaHarness: this.settings.localModelViaHarness === true,
      harnesses: listHarnesses(this.profile).map((h) => ({
        id: h.id,
        enabled: h.enabled,
      })),
      models: (() => {
        const custom = customModelsForStatus(this.settings.customProviders || []);
        if (!custom.length) return this.catalogModels;
        const seen = new Set(this.catalogModels.map((m) => m.id));
        const merged = this.catalogModels.slice();
        for (const m of custom) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          merged.push({ id: m.id, label: `${m.group} · ${m.label}` });
        }
        return merged;
      })(),
      localModels: this.localModels,
      cloudProviders: this.settings.cloudProviders,
      customProviders: this.settings.customProviders || [],
      accessMode: this.settings.accessMode,
    };
  }

  async ensureStarted(): Promise<void> {
    await this.refreshLocalModels();
    const id = this.activeSessionId;
    if (!id) return;
    await this.adapter.start(this.startSessionOpts(id));
  }

  stopTurn(): void {
    this.aborts.stop(this.adapter, this.activeSessionId);
    this.sending = false;
  }

  /** Pulse Core stall watchdog around a turn stream; onStall aborts the host turn. */
  private watched(
    timeoutMs: number,
    iter: AsyncIterable<AgentEvent>,
  ): AsyncIterable<AgentEvent> {
    return watchStall(iter, {
      timeoutMs,
      onStall: () => this.stopTurn(),
    });
  }

  async *sendMessage(content: string): AsyncIterable<AgentEvent> {
    const trimmed = content.trim();
    const sessionId = this.activeSessionId;
    if (!sessionId) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId: 'none',
        payload: { message: 'no active session' },
      };
      return;
    }

    if (!trimmed) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId,
        payload: { message: 'empty message' },
      };
      return;
    }


    // Cloud provider API key gate — ollama / plain codex (mock) never blocked
    {
      const missing = missingCloudApiKeyForModelRef(
        this.modelRef,
        this.settings.cloudProviders,
        this.settings.customProviders || [],
      );
      if (missing) {
        yield {
          type: 'error',
          timestamp: new Date().toISOString(),
          sessionId,
          payload: {
            message: `请先设置 API key（可到「模型」页填写）· 缺少 ${missing} 的密钥`,
          },
        };
        return;
      }
    }

    await this.ensureStarted();

    if (this.sending) {
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId,
        payload: { message: 'busy: wait for current turn' },
      };
      return;
    }

    this.sending = true;
    try {
      const taskId = `task-${randomUUID()}`;
      this.registry.touch(sessionId);
      const sess = this.registry.get(sessionId);
      if (sess && (/^对话\s+\d+$/.test(sess.title) || sess.title === '新对话')) {
        const short =
          trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
        this.registry.create({
          ...sess,
          title: short,
          createdAt: sess.createdAt,
          updatedAt: new Date().toISOString(),
          modelRef: this.modelRef,
        });
      }


      const outbound = await maybeAttachKnowledgeContext(trimmed);
      const collab = loadCollabState();
      const sessMeta = collab.sessions.find((s) => s.sessionId === sessionId);
      const project = collab.projects.find(
        (x) => x.id === (sessMeta?.projectId || DEFAULT_PROJECT_ID),
      );
      const plan = planTurn({
        modelRef: this.modelRef,
        userText: trimmed,
        engineMode: this.settings.engineMode,
        localModelViaHarness: this.settings.localModelViaHarness === true,
        accessMode: this.settings.accessMode,
        userDataDir: getWorkspaceUserDataDir(),
        projectCwd: project?.cwd ?? '',
        customProviders: this.settings.customProviders || [],
      });
      const { route, capabilityNeed, gateway } = plan;
      const toolsNeed = isToolCapability(capabilityNeed);

      if (
        (this.settings.engineMode === 'dsh' ||
          this.settings.engineMode === 'claude') &&
        gateway.mode !== 'agent'
      ) {
        yield {
          type: 'error',
          timestamp: new Date().toISOString(),
          sessionId,
          taskId,
          payload: {
            message: '这项高级能力即将推出，已用本机流式对话继续。',
            code: 'HARNESS_STUB',
            soft: true,
          },
        };
      }
      if (gateway.gap === 'anthropic-messages' && toolsNeed) {
        yield {
          type: 'error',
          timestamp: new Date().toISOString(),
          sessionId,
          taskId,
          payload: {
            message:
              '该云端协议尚不能带工具在本机写文件。请改用 Chat Completions（如 DeepSeek）后再创建/安装。',
          },
        };
        return;
      }
      if (gateway.mode === 'stream') {
        if (gateway.stream?.kind === 'openai-compat') {
          const providerId =
            gateway.stream.providerId ??
            (route.kind === 'custom' ? route.providerId : '');
          const provider = findCustomProvider(
            this.settings.customProviders || [],
            providerId,
          );
          if (!provider) {
            yield {
              type: 'error',
              timestamp: new Date().toISOString(),
              sessionId,
              payload: { message: `未找到自定义供应商：${providerId}` },
            };
            return;
          }
          if (toolsNeed) {
            yield {
              type: 'error',
              timestamp: new Date().toISOString(),
              sessionId,
              taskId,
              payload: {
                message: CHAT_ONLY_NO_WRITE_TIP,
                code: 'CHAT_ONLY_NO_WRITE',
                soft: true,
              },
            };
          }
          yield* this.watched(
            plan.stallTimeoutMs,
            this.streamCustomProviderTurn({
              sessionId,
              taskId,
              provider,
              modelId: gateway.stream.modelId,
              userText: outbound,
              honestyNoWrite: toolsNeed,
            }),
          );
          return;
        }
        if (toolsNeed) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            payload: {
              message: CHAT_ONLY_NO_WRITE_TIP,
              code: 'CHAT_ONLY_NO_WRITE',
              soft: true,
            },
          };
        }
        yield* this.watched(
          plan.stallTimeoutMs,
          this.streamLocalOllamaTurn({
            sessionId,
            taskId,
            model: gateway.stream?.modelId ?? (route.kind === 'ollama' ? route.model : ''),
            userText: outbound,
            honestyNoWrite: toolsNeed,
          }),
        );
        return;
      }

      // AgentRuntime (Codex): local OSS or cloud brain + injection.
      const agent = gateway.agent;
      if (!agent) return;
      const agentRoute: TurnRoute = {
        kind: 'codex',
        modelId: agent.modelId,
        ...(agent.oss
          ? { oss: true, localProvider: agent.localProvider ?? 'ollama' }
          : {}),
        ...(agent.injectProviderId
          ? { customProviderId: agent.injectProviderId }
          : {}),
      };
      if (agent.oss) {
        const ensured = await ensureOllamaRunning({ timeoutMs: 15000 });
        if (!ensured.running) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            payload: {
              message: ensured.message || OLLAMA_NOT_RUNNING_MESSAGE,
              code: OLLAMA_NOT_RUNNING_CODE,
            },
          };
          return;
        }
      }

      if (this.adapter.isMock && !this.settings.forceMock) {
        if (toolsNeed || agent.injectProviderId) {
          if (shouldShowWriteFallbackTip(toolsNeed)) {
            const reason = classifyToolsFallback({
              toolsNeed: true,
              sawUseful: false,
              packagingMissing: true,
            });
            yield {
              type: 'error',
              timestamp: new Date().toISOString(),
              sessionId,
              taskId,
              payload: toolsFallbackPayload(reason ?? 'packaging'),
            };
          }
          yield* this.watched(
            plan.stallTimeoutMs,
            this.fallbackBrainStream({
              sessionId,
              taskId,
              userText: outbound,
              route: agentRoute,
              honestyNoWrite: true,
              omitUserAppend: false,
            }),
          );
          return;
        }
        if (agent.oss) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            payload: {
              ...mapCodexUserError(CODEX_ERROR_CODE.MOCK_WITHOUT_FORCE),
              code: 'HARNESS_SOFT_FALLBACK',
            },
          };
          yield* this.watched(
            plan.stallTimeoutMs,
            this.streamLocalOllamaTurn({
              sessionId,
              taskId,
              model: agent.modelId,
              userText: outbound,
            }),
          );
          return;
        }
      }

      let extraEnv: Record<string, string> | undefined;
      let configOverrides: string[] | undefined;
      const injectId = agent.injectProviderId;
      if (injectId) {
        const provider = findCustomProvider(
          this.settings.customProviders || [],
          injectId,
        );
        if (!provider) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            payload: { message: `未找到自定义供应商：${injectId}` },
          };
          return;
        }
        if (!openaiCompatDrivesCodexTools(provider.protocol)) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            payload: {
              message:
                '该云端协议尚不能带工具在本机写文件。请改用 Chat Completions（如 DeepSeek）后再创建/安装。',
            },
          };
          return;
        }
        const inj = customProviderCodexInjection(
          provider,
          agent.modelId,
        );
        extraEnv = inj.extraEnv;
        configOverrides = inj.configOverrides;
      }

      const prompt = toolsNeed
        ? `${workspaceToolPreamble(plan.cwd)}\n\n${outbound}`
        : outbound;

      await this.adapter.start({
        sessionId,
        harnessId: 'codex',
        modelId: agent.modelId,
        oss: agent.oss === true,
        localProvider: agent.localProvider,
        cwd: plan.cwd,
        sandbox: plan.sandbox.sandbox,
        approval: plan.sandbox.approval,
        addDirs: plan.addDirs,
        extraEnv,
        configOverrides,
      });
      this.appendHistory(sessionId, 'user', outbound);
      let sawUseful = false;
      let fallback = false;
      let assistantText = '';
      for await (const ev of this.watched(
        plan.stallTimeoutMs,
        this.adapter.send({
          sessionId,
          taskId,
          content: prompt,
          modelId: agent.modelId,
        }),
      )) {
        if (ev.type === 'error' && !sawUseful) {
          const payload = (ev.payload || {}) as Record<string, unknown>;
          const timedOut = payload.code === 'TIMEOUT';
          const unavailable = isHarnessUnavailablePayload(ev.payload);
          if (shouldShowWriteFallbackTip(toolsNeed)) {
            const reason = classifyToolsFallback({
              toolsNeed: true,
              sawUseful: false,
              timedOut,
              unavailable,
            });
            yield {
              type: 'error',
              timestamp: new Date().toISOString(),
              sessionId,
              taskId,
              payload: toolsFallbackPayload(reason ?? 'empty'),
            };
            fallback = true;
            break;
          }
          if (agent.oss && (unavailable || timedOut)) {
            yield ev;
            fallback = true;
            break;
          }
        }
        if (ev.type === 'message.delta') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const piece =
            (typeof p.delta === 'string' && p.delta) ||
            (typeof p.text === 'string' && p.text) ||
            '';
          if (piece) {
            sawUseful = true;
            assistantText += piece;
          }
        }
        if (ev.type === 'message.completed') {
          const p = (ev.payload || {}) as Record<string, unknown>;
          const finalText =
            (typeof p.text === 'string' && p.text.trim()) ||
            assistantText.trim();
          if (finalText) {
            sawUseful = true;
            this.appendHistory(sessionId, 'assistant', finalText);
            this.rememberFromTurn(sessionId, trimmed, finalText);
          }
        }
        yield ev;
      }
      if (!fallback && shouldShowWriteFallbackTip(toolsNeed) && !sawUseful) {
        yield {
          type: 'error',
          timestamp: new Date().toISOString(),
          sessionId,
          taskId,
          payload: toolsFallbackPayload('empty'),
        };
        fallback = true;
      }
      if (fallback) {
        try {
          this.adapter.abort(sessionId);
        } catch {
          /* abort is best-effort before stream fallback */
        }
        yield* this.watched(
          plan.stallTimeoutMs,
          this.fallbackBrainStream({
            sessionId,
            taskId,
            userText: outbound,
            route: agentRoute,
            honestyNoWrite: toolsNeed,
            omitUserAppend: true,
          }),
        );
        return;
      }
      if (toolsNeed && sawUseful) {
        try {
          // C3 Forge: workspace plugins|skills|mcp|agents|docs|systems → installAsset
          installWorkspacePlugins(plan.cwd);
        } catch {
          /* ignore: catalog copy failed; workspace files still exist */
        }
      }
    } finally {
      this.sending = false;
    }
  }

  async dispose(): Promise<void> {
    this.aborts.stop(this.adapter, this.activeSessionId);
    this.adapter.abort();
    for (const s of this.registry.list()) {
      await this.adapter.stop(s.id);
    }
  }
}

function toFallbackCodexId(): string {
  return 'gpt-5';
}
