/**
 * Main-process Codex host — multi-session registry + createCodexAdapter.
 * Turn routing (Codex / Ollama) via turn-controller + modelRef.
 * Renderer never imports adapters; all turns go through IPC.
 */

import { randomUUID } from 'node:crypto';
import { SessionRegistry } from '@xyai/core';
import {
  createCodexAdapter,
  resolveCodexBinary,
  type CodexAdapter,
  type CodexBinarySource,
} from '@xyai/adapter-codex';
import type { AgentEvent } from '@xyai/contracts';
import { normalizeModelRef } from '@xyai/contracts';
import {
  loadUnifiedModelCatalog,
  toStatusModelLists,
} from './model-catalog-facade.js';
import {
  resolveTurnRoute,
  runCustomProviderTurn,
  runOllamaTurn,
  TurnAbortBag,
} from './turn-controller.js';
import type { OllamaChatMessage } from '@xyai/model-hub';
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
  models: { id: string; label: string; hint?: string }[];
  localModels: { id: string; label: string; hint?: string }[];
  cloudProviders: XyaiSettings['cloudProviders'];
  customProviders: CustomProvider[];
  accessMode: XyaiSettings['accessMode'];
}

export class CodexHost {
  private readonly registry = new SessionRegistry();
  private adapter: CodexAdapter;
  private activeSessionId: string | null = null;
  private sending = false;
  private readonly aborts = new TurnAbortBag();
  /** Per-session Ollama multi-turn history (user/assistant only). */
  private readonly histories = new Map<string, OllamaChatMessage[]>();
  private static readonly HISTORY_CAP = 40;
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
    return createCodexAdapter({
      forceMock: this.settings.forceMock,
      binaryPath: this.settings.codexBin.trim() || undefined,
    });
  }

  private codexModelId(): string {
    const route = resolveTurnRoute(this.modelRef);
    return route.kind === 'codex' ? route.modelId : toFallbackCodexId();
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
        void this.adapter.start({
          sessionId: s.id,
          harnessId: 'codex',
          modelId: this.codexModelId(),
        });
      }
    }
    return this.settings;
  }

  getSettings(): XyaiSettings {
    return this.settings;
  }

    async refreshLocalModels(): Promise<void> {
    try {
      const catalog = await loadUnifiedModelCatalog();
      const lists = toStatusModelLists(catalog);
      this.localModels = lists.localModels;
      this.catalogModels = lists.models;
    } catch {
      this.localModels = [];
      this.catalogModels = DEFAULT_MODELS.map((m) => ({
        id: normalizeModelRef(m.id),
        label: m.label,
      }));
    }
    const custom = customModelsForStatus(this.settings.customProviders || []);
    if (custom.length) {
      // Append custom models (dedupe by id)
      const seen = new Set(this.catalogModels.map((m) => m.id));
      for (const m of custom) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        this.catalogModels.push({ id: m.id, label: `${m.group} · ${m.label}` });
      }
    }
  }


  private historyFor(sessionId: string): OllamaChatMessage[] {
    let h = this.histories.get(sessionId);
    if (!h) {
      h = [];
      this.histories.set(sessionId, h);
    }
    return h;
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
    while (h.length > CodexHost.HISTORY_CAP) {
      h.shift();
    }
  }

  private clearHistory(sessionId: string): void {
    this.histories.delete(sessionId);
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
    void this.adapter.start({
      sessionId: session.id,
      harnessId: 'codex',
      modelId: this.codexModelId(),
    });
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
    await this.adapter.start({
      sessionId: id,
      harnessId: 'codex',
      modelId: this.codexModelId(),
    });
  }

  stopTurn(): void {
    this.aborts.stop(this.adapter, this.activeSessionId);
    this.sending = false;
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

      
      const route = resolveTurnRoute(this.modelRef);
      if (route.kind === 'custom') {
        const provider = findCustomProvider(
          this.settings.customProviders || [],
          route.providerId,
        );
        if (!provider) {
          yield {
            type: 'error',
            timestamp: new Date().toISOString(),
            sessionId,
            payload: { message: `未找到自定义供应商：${route.providerId}` },
          };
          return;
        }
        this.appendHistory(sessionId, 'user', trimmed);
        const messages = this.historyFor(sessionId).slice();
        const signal = this.aborts.beginCustom();
        let assistantText = '';
        let completedOk = false;
        try {
          for await (const ev of runCustomProviderTurn({
            sessionId,
            taskId,
            provider,
            modelId: route.modelId,
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
                this.appendHistory(sessionId, 'assistant', finalText);
              }
              completedOk = true;
            }
            yield ev;
          }
          void completedOk;
        } finally {
          this.aborts.clearOllama();
        }
        return;
      }
      if (route.kind === 'ollama') {
        this.appendHistory(sessionId, 'user', trimmed);
        const messages = this.historyFor(sessionId).slice();
        const signal = this.aborts.beginOllama();
        let assistantText = '';
        let completedOk = false;
        try {
          for await (const ev of runOllamaTurn({
            sessionId,
            taskId,
            model: route.model,
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
                this.appendHistory(sessionId, 'assistant', finalText);
              }
              completedOk = true;
            }
            yield ev;
          }
          // If stream ended without completed (e.g. abort), do not append assistant.
          void completedOk;
        } finally {
          this.aborts.clearOllama();
        }
        return;
      }

      await this.adapter.start({
        sessionId,
        harnessId: 'codex',
        modelId: route.modelId,
      });
      yield* this.adapter.send({
        sessionId,
        taskId,
        content: trimmed,
        modelId: route.modelId,
      });
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
