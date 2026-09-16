/**
 * Renderer — minimal chat UI (vanilla DOM).
 */

import type { XyaiAgentEvent, XyaiStatus } from './xyai-api.js';

const transcript = document.getElementById('transcript') as HTMLElement;
const input = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;

let busy = false;
let streamingEl: HTMLElement | null = null;
let streamingText = '';

function shortPath(p: string | null): string {
  if (!p) return '—';
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return p;
  return `…/${parts.slice(-3).join('/')}`;
}

function renderStatus(s: XyaiStatus): void {
  const mode = s.isMock ? 'MOCK' : '真实 Codex';
  const src = s.binarySource ?? 'none';
  const path = shortPath(s.binaryPath);
  statusEl.textContent = `${mode} · ${src} · ${path}`;
  statusEl.title = `isMock=${s.isMock}\nbinarySource=${s.binarySource}\nbinaryPath=${s.binaryPath ?? ''}`;
  statusEl.classList.toggle('mock', s.isMock);
  statusEl.classList.toggle('real', !s.isMock);
}

function clearEmpty(): void {
  const empty = transcript.querySelector('.empty');
  if (empty) empty.remove();
}

function appendBubble(
  role: 'user' | 'assistant' | 'error',
  text: string,
  meta?: string,
): HTMLElement {
  clearEmpty();
  const el = document.createElement('div');
  el.className = `bubble ${role}`;
  if (meta) {
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = meta;
    el.appendChild(m);
  }
  el.appendChild(document.createTextNode(text));
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function setBusy(next: boolean): void {
  busy = next;
  sendBtn.disabled = next;
  input.disabled = next;
}

function payloadText(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'text' in payload) {
    const t = (payload as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const m = (payload as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

function updateAssistantBubble(text: string): void {
  if (!streamingEl) {
    streamingEl = appendBubble('assistant', text, '助手');
    return;
  }
  streamingEl.textContent = '';
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = '助手';
  streamingEl.appendChild(meta);
  streamingEl.appendChild(document.createTextNode(text));
  transcript.scrollTop = transcript.scrollHeight;
}

function handleEvent(ev: XyaiAgentEvent): void {
  if (ev.type === 'message.delta') {
    const chunk = payloadText(ev.payload);
    streamingText = chunk.startsWith(streamingText)
      ? chunk
      : streamingText + chunk;
    updateAssistantBubble(streamingText);
    return;
  }

  if (ev.type === 'message.completed') {
    const text = payloadText(ev.payload) || streamingText || '(空回复)';
    updateAssistantBubble(text);
    streamingEl = null;
    streamingText = '';
    return;
  }

  if (ev.type === 'error') {
    streamingEl = null;
    streamingText = '';
    appendBubble('error', payloadText(ev.payload) || '未知错误', '错误');
  }
}

async function send(): Promise<void> {
  const content = input.value.trim();
  if (!content || busy) return;
  appendBubble('user', content, '你');
  input.value = '';
  setBusy(true);
  streamingEl = null;
  streamingText = '';
  try {
    await window.xyai.sendMessage(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendBubble('error', msg, '错误');
  } finally {
    setBusy(false);
    input.focus();
  }
}

function boot(): void {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = '发送一条消息开始对话（Codex Adapter）';
  transcript.appendChild(empty);

  if (!window.xyai) {
    statusEl.textContent = '预加载失败（请重装最新安装包）';
    statusEl.classList.add('mock');
    appendBubble('error', 'window.xyai 不可用：preload 未注入', '错误');
    return;
  }

  window.xyai.onEvent(handleEvent);

  const statusTimeout = window.setTimeout(() => {
    if (statusEl.textContent === '状态加载中…' || statusEl.textContent.includes('加载中')) {
      statusEl.textContent = '状态超时（仍可尝试发送）';
      statusEl.classList.add('mock');
    }
  }, 3000);

  void window.xyai.getStatus().then((s) => {
    window.clearTimeout(statusTimeout);
    renderStatus(s);
  }).catch((err: unknown) => {
    window.clearTimeout(statusTimeout);
    statusEl.textContent = '状态不可用';
    statusEl.classList.add('mock');
    console.error(err);
  });

  sendBtn.addEventListener('click', () => {
    void send();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });

  input.focus();
}

boot();
