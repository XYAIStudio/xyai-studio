/**
 * TranscriptView — delta coalesce into one in-progress bubble; flush on stop/done/error.
 * Cindy-aligned thin vanilla (no makerChatStore port).
 * Phase C: Stop/ABORTED is not an error (no red banner).
 */

import type { AgentEvent, ChatMsg, ChatMsgAction } from './types.js';

const OLLAMA_NOT_RUNNING_CODE = 'OLLAMA_NOT_RUNNING';
const START_OLLAMA_ACTION: ChatMsgAction = {
  id: 'start-ollama',
  label: '启动 Ollama',
};
import { mountEmptyMascot } from './mascot.js';

export type TranscriptApi = {
  ensure: (sessionId: string) => ChatMsg[];
  getActiveId: () => string;
  setActiveId: (id: string) => void;
  clearSession: (id: string) => void;
  appendUser: (text: string) => void;
  appendError: (text: string, action?: ChatMsgAction) => void;
  appendSystem: (text: string) => void;
  onAction: (cb: (action: ChatMsgAction) => void) => void;
  /** Coalesce deltas / complete / error into transcript. */
  handleEvent: (ev: AgentEvent) => void;
  /** Optimistic flush of in-progress streaming bubble (Stop UX §8.2). */
  flushStreaming: (sessionId?: string) => void;
  render: () => void;
  getStreamingId: () => string | null;
  resetStreaming: () => void;
  /** Active session messages (copy). */
  getMessages: () => ChatMsg[];
  /** Called after each render of the active session. */
  onAfterRender: (cb: (msgs: ChatMsg[]) => void) => void;
  /** Attach citations to the latest assistant message (or create a note row). */
  setLastAssistantCitations: (citations: ChatMsg['citations']) => void;
};

function uid(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function payloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  for (const k of ['delta', 'text', 'content', 'message']) {
    const v = p[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

function isAbortPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  const code = typeof p.code === 'string' ? p.code : '';
  const message = typeof p.message === 'string' ? p.message : '';
  return code === 'ABORTED' || message === 'cancelled' || message === '已停止';
}

export function createTranscript(root: HTMLElement): TranscriptApi {
  const transcripts = new Map<string, ChatMsg[]>();
  let activeSessionId = '';
  let streamingId: string | null = null;
  let afterRender: ((msgs: ChatMsg[]) => void) | null = null;
  let disposeEmpty: (() => void) | null = null;
  let actionHandler: ((action: ChatMsgAction) => void) | null = null;

  function ensure(sessionId: string): ChatMsg[] {
    if (!transcripts.has(sessionId)) transcripts.set(sessionId, []);
    return transcripts.get(sessionId)!;
  }

  function render(): void {
    disposeEmpty?.();
    disposeEmpty = null;
    root.innerHTML = '';
    const msgs = ensure(activeSessionId);
    if (!msgs.length) {
      const empty = document.createElement('div');
      disposeEmpty = mountEmptyMascot(empty);
      root.appendChild(empty);
      afterRender?.([]);
      return;
    }
    const col = document.createElement('div');
    col.className = 'transcript-col';
    for (const m of msgs) {
      const bubble = document.createElement('div');
      bubble.className =
        'bubble ' + m.role + (m.streaming ? ' streaming' : '');
      bubble.dataset.id = m.id;
      if (m.role === 'system') {
        bubble.textContent = m.text;
      } else {
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent =
          m.role === 'user' ? '你' : m.role === 'error' ? '错误' : '助手';
        bubble.appendChild(meta);
        bubble.appendChild(
          document.createTextNode(m.text || (m.streaming ? '…' : '')),
        );
        if (m.role === 'assistant' && m.citations && m.citations.length) {
          const label = document.createElement('div');
          label.className = 'citation-label';
          label.textContent = '引用文件链接';
          bubble.appendChild(label);
          const row = document.createElement('div');
          row.className = 'citation-row';
          for (const c of m.citations) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'citation-chip';
            chip.title = c.sourcePath || c.openHref;
            chip.textContent = c.title || c.relativePath;
            chip.addEventListener('click', () => {
              void window.xyai.kbOpenCitation?.({
                sourcePath: c.sourcePath,
                openHref: c.openHref,
              });
            });
            chip.addEventListener('contextmenu', (ev) => {
              ev.preventDefault();
              void window.xyai.kbOpenCitation?.({
                sourcePath: c.sourcePath,
                openHref: c.openHref,
                showInFolder: true,
              });
            });
            row.appendChild(chip);
          }
          bubble.appendChild(row);
        }
        if (m.role === 'error' && m.action) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'capsule-btn error-action';
          btn.textContent = m.action.label;
          const action = m.action;
          btn.addEventListener('click', () => {
            actionHandler?.(action);
          });
          bubble.appendChild(btn);
        }
      }
      col.appendChild(bubble);
    }
    root.appendChild(col);
    root.scrollTop = root.scrollHeight;
    afterRender?.(msgs.slice());
  }

  function flushStreaming(sessionId?: string): void {
    const sid = sessionId || activeSessionId;
    const msgs = ensure(sid);
    if (streamingId) {
      const cur = msgs.find((m) => m.id === streamingId);
      if (cur) cur.streaming = false;
      streamingId = null;
    }
    if (sid === activeSessionId) render();
  }

  function handleEvent(ev: AgentEvent): void {
    const sid = ev.sessionId || activeSessionId;
    const msgs = ensure(sid);

    if (ev.type === 'message.delta') {
      const delta = payloadText(ev.payload);
      if (!streamingId) {
        streamingId = uid();
        msgs.push({
          id: streamingId,
          role: 'assistant',
          text: delta,
          streaming: true,
        });
      } else {
        const cur = msgs.find((m) => m.id === streamingId);
        if (cur) cur.text += delta;
      }
      if (sid === activeSessionId) render();
      return;
    }

    if (ev.type === 'message.completed') {
      const text = payloadText(ev.payload);
      if (streamingId) {
        const cur = msgs.find((m) => m.id === streamingId);
        if (cur) {
          if (text && !cur.text) cur.text = text;
          else if (text && text.length > cur.text.length) cur.text = text;
          cur.streaming = false;
        }
        streamingId = null;
      } else if (text) {
        msgs.push({ id: uid(), role: 'assistant', text });
      }
      if (sid === activeSessionId) render();
      return;
    }

    if (ev.type === 'error') {
      // Phase C: Stop / abort must NOT look like an error (no red「错误」).
      if (isAbortPayload(ev.payload)) {
        flushStreaming(sid);
        // Prefer silent flush (partial assistant kept). No system chip by default.
        if (sid === activeSessionId) render();
        return;
      }
      const p = (ev.payload || {}) as Record<string, unknown>;
      const message =
        typeof p.message === 'string' ? p.message : 'unknown error';
      const code = typeof p.code === 'string' ? p.code : '';
      if (p.soft === true || code === 'HARNESS_SOFT_FALLBACK') {
        msgs.push({ id: uid(), role: 'system', text: message });
        if (sid === activeSessionId) render();
        return;
      }
      const looksDown =
        code === OLLAMA_NOT_RUNNING_CODE ||
        /fetch failed|Ollama 服务未运行|Ollama 未运行/i.test(message);
      flushStreaming(sid);
      msgs.push({
        id: uid(),
        role: 'error',
        text: looksDown && /fetch failed/i.test(message)
          ? 'Ollama 服务未运行。请点击「启动 Ollama」后重试。'
          : message,
        action: looksDown ? START_OLLAMA_ACTION : undefined,
      });
      if (sid === activeSessionId) render();
    }
  }

  return {
    ensure,
    getActiveId: () => activeSessionId,
    setActiveId: (id) => {
      activeSessionId = id;
    },
    clearSession: (id) => {
      transcripts.delete(id);
    },
    appendUser: (text) => {
      ensure(activeSessionId).push({ id: uid(), role: 'user', text });
      render();
    },
    appendError: (text, action) => {
      const looksDown =
        action?.id === 'start-ollama' ||
        /fetch failed|Ollama 服务未运行|Ollama 未运行/i.test(text);
      ensure(activeSessionId).push({
        id: uid(),
        role: 'error',
        text: looksDown && /fetch failed/i.test(text)
          ? 'Ollama 服务未运行。请点击「启动 Ollama」后重试。'
          : text,
        action: action || (looksDown ? START_OLLAMA_ACTION : undefined),
      });
      render();
    },
    appendSystem: (text) => {
      ensure(activeSessionId).push({ id: uid(), role: 'system', text });
      render();
    },
    onAction: (cb) => {
      actionHandler = cb;
    },
    handleEvent,
    flushStreaming,
    render,
    getStreamingId: () => streamingId,
    resetStreaming: () => {
      streamingId = null;
    },
    getMessages: () => ensure(activeSessionId).slice(),
    onAfterRender: (cb) => {
      afterRender = cb;
    },
    setLastAssistantCitations: (citations) => {
      if (!citations || !citations.length) return;
      const msgs = ensure(activeSessionId);
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]!;
        if (m.role === 'assistant') {
          m.citations = citations;
          render();
          return;
        }
      }
    },
  };
}
