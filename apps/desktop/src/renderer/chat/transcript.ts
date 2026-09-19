/**
 * TranscriptView — delta coalesce into one in-progress bubble; flush on stop/done/error.
 * Cindy-aligned thin vanilla (no makerChatStore port).
 * Phase C: Stop/ABORTED is not an error (no red banner).
 */

import type { AgentEvent, ChatMsg, ChatMsgAction } from './types.js';
import { markdownToSafeHtml } from './markdown-safe.js';
import type { BubbleActionKind } from './message-actions.js';

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
  /** Toolbar on bubbles: copy / quote / forward / save / notify. */
  onBubbleAction: (
    cb: (ev: {
      kind: BubbleActionKind;
      message: ChatMsg;
      selection: string;
    }) => void,
  ) => void;
  getMessagesFor: (sessionId: string) => ChatMsg[];
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

function nearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

function selectionInside(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  const node = sel.anchorNode;
  if (!node || !el.contains(node)) return '';
  return sel.toString();
}

function fillMarkdown(el: HTMLElement, text: string): void {
  el.innerHTML = markdownToSafeHtml(text || '');
}

function addActionBtn(
  bar: HTMLElement,
  kind: BubbleActionKind,
  label: string,
  msgId: string,
): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bubble-action';
  btn.dataset.msgAction = kind;
  btn.dataset.msgId = msgId;
  btn.textContent = label;
  bar.appendChild(btn);
}

export function createTranscript(root: HTMLElement): TranscriptApi {
  const transcripts = new Map<string, ChatMsg[]>();
  let activeSessionId = '';
  let streamingId: string | null = null;
  let afterRender: ((msgs: ChatMsg[]) => void) | null = null;
  let disposeEmpty: (() => void) | null = null;
  let actionHandler: ((action: ChatMsgAction) => void) | null = null;
  let bubbleActionHandler:
    | ((ev: {
        kind: BubbleActionKind;
        message: ChatMsg;
        selection: string;
      }) => void)
    | null = null;
  let wiredActions = false;

  function ensure(sessionId: string): ChatMsg[] {
    if (!transcripts.has(sessionId)) transcripts.set(sessionId, []);
    return transcripts.get(sessionId)!;
  }

  function restoreScroll(stick: boolean, prevTop: number): void {
    if (stick) root.scrollTop = root.scrollHeight;
    else root.scrollTop = prevTop;
  }

  function mountBubbleBody(bubble: HTMLElement, m: ChatMsg): HTMLElement {
    const body = document.createElement('div');
    body.className = 'bubble-body chat-md';
    const raw = m.text || (m.streaming ? '…' : '');
    fillMarkdown(body, raw);
    bubble.appendChild(body);
    return body;
  }

  function mountActions(bubble: HTMLElement, m: ChatMsg): void {
    if (m.streaming) return;
    if (m.role !== 'assistant' && m.role !== 'user') return;
    const bar = document.createElement('div');
    bar.className = 'bubble-actions';
    addActionBtn(bar, 'copy', '复制', m.id);
    addActionBtn(bar, 'quote', '引用', m.id);
    if (m.role === 'assistant') {
      addActionBtn(bar, 'forward', '转发', m.id);
      addActionBtn(bar, 'save-kb', '保存至知识库', m.id);
      addActionBtn(bar, 'notify-agent', '发给智能体…', m.id);
    }
    bubble.appendChild(bar);
  }

  function render(): void {
    const stick = nearBottom(root);
    const prevTop = root.scrollTop;
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
        if (m.role === 'error') {
          const body = document.createElement('div');
          body.className = 'bubble-body';
          body.textContent = m.text || '';
          bubble.appendChild(body);
        } else {
          mountBubbleBody(bubble, m);
        }
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
        mountActions(bubble, m);
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
    restoreScroll(stick, prevTop);
    afterRender?.(msgs.slice());
  }

  function patchStreaming(): void {
    if (!streamingId) {
      render();
      return;
    }
    const bubble = root.querySelector(
      `.bubble[data-id="${CSS.escape(streamingId)}"]`,
    ) as HTMLElement | null;
    const msgs = ensure(activeSessionId);
    const cur = msgs.find((m) => m.id === streamingId);
    if (!bubble || !cur) {
      render();
      return;
    }
    const stick = nearBottom(root);
    const prevTop = root.scrollTop;
    let body = bubble.querySelector('.bubble-body') as HTMLElement | null;
    if (!body) {
      body = mountBubbleBody(bubble, cur);
    } else {
      fillMarkdown(body, cur.text || '…');
    }
    restoreScroll(stick, prevTop);
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
      if (sid === activeSessionId) {
        const existing = streamingId
          ? root.querySelector(
              `.bubble[data-id="${CSS.escape(streamingId)}"]`,
            )
          : null;
        if (existing) patchStreaming();
        else render();
      }
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
      if (
        p.soft === true ||
        code === 'HARNESS_SOFT_FALLBACK' ||
        code === 'HARNESS_STUB' ||
        code === 'CHAT_ONLY_NO_WRITE' ||
        code === 'HARNESS_PACKAGING' ||
        code === 'TOOLS_STREAM_FALLBACK' ||
        code === 'TIMEOUT' ||
        code === 'EMPTY_TURN' ||
        code === 'CODEX_BIN_MISSING' ||
        code === 'SPAWN_ERROR' ||
        code === 'ENOENT' ||
        code === 'MOCK_WITHOUT_FORCE'
      ) {
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

  if (!wiredActions) {
    wiredActions = true;
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      const btn = t?.closest('[data-msg-action]') as HTMLElement | null;
      if (!btn) return;
      const kind = btn.dataset.msgAction as BubbleActionKind | undefined;
      const id = btn.dataset.msgId;
      if (!kind || !id) return;
      const bubble = btn.closest('.bubble') as HTMLElement | null;
      const msg = ensure(activeSessionId).find((m) => m.id === id);
      if (!msg) return;
      const selection = bubble ? selectionInside(bubble) : '';
      bubbleActionHandler?.({ kind, message: msg, selection });
    });
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
    onBubbleAction: (cb) => {
      bubbleActionHandler = cb;
    },
    handleEvent,
    flushStreaming,
    render,
    getStreamingId: () => streamingId,
    resetStreaming: () => {
      streamingId = null;
    },
    getMessages: () => ensure(activeSessionId).slice(),
    getMessagesFor: (sessionId) => ensure(sessionId).slice(),
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
