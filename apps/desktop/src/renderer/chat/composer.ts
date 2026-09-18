/**
 * Composer — textarea, Enter/Shift+Enter/IME, Send↔Stop morph, focus unlock.
 * §8.2 busy ≡ isStreaming; Stop optimistic leave then IPC.
 * §8.3 busy Enter = ignore send (no queue).
 * Phase C: tall frosted card + toolbar (0.4 InputBar IA).
 */

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
};

const ICON_SEND =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_STOP =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

export function createComposer(opts: {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  primaryBtn: HTMLButtonElement;
}): ComposerApi {
  const { root, input, primaryBtn } = opts;
  let busy = false;
  let wired = false;

  function applyNoDrag(): void {
    const mark = (el: Element | null) => {
      if (!el) return;
      (el as HTMLElement).style.setProperty('-webkit-app-region', 'no-drag');
    };
    mark(root);
    mark(input);
    mark(primaryBtn);
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

  function setBusy(next: boolean): void {
    busy = next;
    syncPrimary();
    // Input stays editable while busy (§8.3); Enter will ignore send.
    unlockInput();
  }

  function wire(handlers: ComposerHandlers): void {
    if (wired) return;
    wired = true;
    unlockInput();
    syncPrimary();

    primaryBtn.addEventListener('click', () => {
      if (busy) {
        void handlers.onStop();
        return;
      }
      const text = input.value.trim();
      if (!text && !(handlers.canSendEmpty?.() ?? false)) return;
      void handlers.onSend(text);
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
      if (!text && !(handlers.canSendEmpty?.() ?? false)) return;
      void handlers.onSend(text);
    });
  }

  return {
    isBusy: () => busy,
    setBusy,
    wire,
    unlockInput,
    focus: () => {
      unlockInput();
      input.focus();
    },
    clear: () => {
      input.value = '';
    },
    getValue: () => input.value,
  };
}
