/**
 * Composer — textarea, Enter/Shift+Enter/IME, Send↔Stop morph, focus unlock.
 * §8.2 busy ≡ isStreaming; Stop optimistic leave then IPC.
 * §8.3 busy Enter = ignore send (no queue).
 * Phase C: tall frosted card + toolbar (0.4 InputBar IA).
 * Quote: WeChat-style chip above the input (full text in state, not textarea).
 */

import {
  buildQuoteChip,
  prependQuoteForSend,
  type QuoteChipModel,
} from './message-actions.js';

export type ComposerBusyApi = {
  isBusy: () => boolean;
  setBusy: (busy: boolean) => void;
};

export type ComposerHandlers = {
  onSend: (text: string) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  /** When true, allow Send with empty textarea (e.g. attachments only). */
  canSendEmpty?: () => boolean;
};

export type ComposerApi = ComposerBusyApi & {
  wire: (handlers: ComposerHandlers) => void;
  unlockInput: () => void;
  focus: () => void;
  clear: () => void;
  getValue: () => string;
  /** Insert text at the caret (or append) and focus. */
  insertDraft: (text: string) => void;
  /** Set WeChat-style quote chip (does not paste into textarea). */
  setQuote: (input: { text: string; role?: string | null }) => void;
  clearQuote: () => void;
  getQuoteText: () => string;
};

const ICON_SEND =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_STOP =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

export function createComposer(opts: {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  primaryBtn: HTMLButtonElement;
  /** Optional; falls back to #composer-quote inside root. */
  quoteBar?: HTMLElement | null;
}): ComposerApi {
  const { root, input, primaryBtn } = opts;
  const quoteBar =
    opts.quoteBar ||
    (root.querySelector('#composer-quote') as HTMLElement | null);
  let busy = false;
  let wired = false;
  let quote: QuoteChipModel | null = null;

  function applyNoDrag(): void {
    const mark = (el: Element | null) => {
      if (!el) return;
      (el as HTMLElement).style.setProperty('-webkit-app-region', 'no-drag');
    };
    mark(root);
    mark(input);
    mark(primaryBtn);
    mark(quoteBar);
    root.querySelectorAll('*').forEach(mark);
  }

  function unlockInput(): void {
    input.removeAttribute('disabled');
    input.removeAttribute('readonly');
    input.readOnly = false;
    input.disabled = false;
    input.tabIndex = 0;
    input.style.pointerEvents = 'auto';
    input.style.userSelect = 'text';
    input.style.setProperty('-webkit-user-select', 'text');
    applyNoDrag();
  }

  function syncPrimary(): void {
    primaryBtn.classList.toggle('is-stop', busy);
    primaryBtn.classList.toggle('is-send', !busy);
    primaryBtn.innerHTML = busy ? ICON_STOP : ICON_SEND;
    primaryBtn.title = busy ? '停止生成' : '发送';
    primaryBtn.setAttribute('aria-label', busy ? '停止' : '发送');
    primaryBtn.disabled = false;
  }

  function renderQuote(): void {
    if (!quoteBar) return;
    if (!quote) {
      quoteBar.hidden = true;
      quoteBar.innerHTML = '';
      return;
    }
    quoteBar.hidden = false;
    quoteBar.innerHTML = '';
    quoteBar.className = 'composer-quote';
    quoteBar.setAttribute('role', 'status');
    quoteBar.setAttribute('aria-label', '引用');

    const bar = document.createElement('div');
    bar.className = 'composer-quote-bar';

    const role = document.createElement('span');
    role.className = 'composer-quote-role';
    role.textContent = quote.roleLabel;

    const preview = document.createElement('span');
    preview.className = 'composer-quote-preview';
    preview.textContent = quote.preview;
    preview.title = quote.text;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'composer-quote-clear';
    clearBtn.title = '取消引用';
    clearBtn.setAttribute('aria-label', '取消引用');
    clearBtn.textContent = '×';
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearQuote();
      focus();
    });

    bar.append(role, preview, clearBtn);
    quoteBar.appendChild(bar);
    applyNoDrag();
  }

  function clearQuote(): void {
    quote = null;
    renderQuote();
  }

  function setQuote(input: { text: string; role?: string | null }): void {
    quote = buildQuoteChip(input);
    renderQuote();
  }

  function setBusy(next: boolean): void {
    busy = next;
    syncPrimary();
    // Input stays editable while busy (§8.3); Enter will ignore send.
    unlockInput();
  }

  function focus(): void {
    unlockInput();
    input.focus();
  }

  function emitSend(handlers: ComposerHandlers, typed: string): void {
    const quoteText = quote?.text || '';
    const outbound = quoteText
      ? prependQuoteForSend(quoteText, typed)
      : typed;
    if (
      !outbound.trim() &&
      !(handlers.canSendEmpty?.() ?? false) &&
      !quoteText
    ) {
      return;
    }
    clearQuote();
    void handlers.onSend(outbound);
  }

  function wire(handlers: ComposerHandlers): void {
    if (wired) return;
    wired = true;
    unlockInput();
    syncPrimary();
    renderQuote();

    primaryBtn.addEventListener('click', () => {
      if (busy) {
        void handlers.onStop();
        return;
      }
      const text = input.value.trim();
      if (!text && !quote && !(handlers.canSendEmpty?.() ?? false)) return;
      emitSend(handlers, text);
    });

    root.addEventListener('pointerdown', () => {
      unlockInput();
    });
    input.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      unlockInput();
      input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // IME: composition in progress or keyCode 229
      if (e.isComposing || e.keyCode === 229) return;
      if (e.shiftKey) return; // newline
      // Busy: ignore send (do not queue) — prefer ignore
      if (busy) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const text = input.value.trim();
      if (!text && !quote && !(handlers.canSendEmpty?.() ?? false)) return;
      emitSend(handlers, text);
    });
  }

  return {
    isBusy: () => busy,
    setBusy,
    wire,
    unlockInput,
    focus,
    clear: () => {
      input.value = '';
    },
    getValue: () => input.value,
    insertDraft: (text: string) => {
      if (!text) return;
      unlockInput();
      const cur = input.value;
      const start = input.selectionStart ?? cur.length;
      const end = input.selectionEnd ?? cur.length;
      input.value = cur.slice(0, start) + text + cur.slice(end);
      const caret = start + text.length;
      input.selectionStart = caret;
      input.selectionEnd = caret;
      input.focus();
    },
    setQuote,
    clearQuote,
    getQuoteText: () => quote?.text || '',
  };
}
