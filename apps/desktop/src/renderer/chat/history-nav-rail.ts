/**
 * History scrub bar (历史横杠) — Cindy MessageNavRail IA, vanilla thin Electron.
 * Left-edge ticks per user turn; hover tooltip; click jumps to bubble.
 */

import type { ChatMsg } from './types.js';

export type HistoryNavEntry = {
  messageId: string;
  summary: string;
  answerExcerpt: string;
};

export type HistoryNavRailApi = {
  sync: (msgs: ChatMsg[]) => void;
  setActive: (messageId: string | null) => void;
  destroy: () => void;
};

const MIN_TURNS = 3;
const Q_LEN = 40;
const A_LEN = 80;

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

export function deriveHistoryEntries(msgs: ChatMsg[]): HistoryNavEntry[] {
  const out: HistoryNavEntry[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.role !== 'user') continue;
    let answer = '';
    for (let j = i + 1; j < msgs.length; j++) {
      const next = msgs[j]!;
      if (next.role === 'user') break;
      if (next.role === 'assistant' && next.text.trim()) {
        answer = next.text;
        break;
      }
    }
    out.push({
      messageId: m.id,
      summary: clip(m.text || '', Q_LEN) || '（空消息）',
      answerExcerpt: clip(answer, A_LEN),
    });
  }
  return out;
}

export function createHistoryNavRail(opts: {
  mountParent: HTMLElement;
  transcriptEl: HTMLElement;
}): HistoryNavRailApi {
  const { mountParent, transcriptEl } = opts;

  const rail = document.createElement('nav');
  rail.className = 'history-nav-rail';
  rail.setAttribute('aria-label', '历史横杠');
  rail.hidden = true;

  const ticksEl = document.createElement('div');
  ticksEl.className = 'history-nav-ticks';
  rail.appendChild(ticksEl);

  const tip = document.createElement('div');
  tip.className = 'history-nav-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  const tipQ = document.createElement('div');
  tipQ.className = 'history-nav-tip-q';
  const tipA = document.createElement('div');
  tipA.className = 'history-nav-tip-a';
  tip.appendChild(tipQ);
  tip.appendChild(tipA);
  rail.appendChild(tip);

  // Ensure relative positioning on wrap
  if (getComputedStyle(mountParent).position === 'static') {
    mountParent.style.position = 'relative';
  }
  mountParent.insertBefore(rail, transcriptEl);

  let entries: HistoryNavEntry[] = [];
  let lastMsgs: ChatMsg[] = [];
  let activeId: string | null = null;
  let idleTimer: number | null = null;
  let dimmed = false;

  function roomAllows(): boolean {
    return mountParent.clientHeight >= 160 && mountParent.clientWidth >= 280;
  }

  function hideTip(): void {
    tip.hidden = true;
  }

  function showTip(entry: HistoryNavEntry, tickEl: HTMLElement): void {
    tipQ.textContent = entry.summary;
    tipA.textContent = entry.answerExcerpt || '（暂无回复）';
    tip.hidden = false;
    const railRect = rail.getBoundingClientRect();
    const tickRect = tickEl.getBoundingClientRect();
    const top = tickRect.top - railRect.top + tickRect.height / 2;
    tip.style.top = `${Math.max(8, top - 28)}px`;
  }

  function jumpTo(messageId: string): void {
    const bubble = transcriptEl.querySelector(
      `.bubble[data-id="${CSS.escape(messageId)}"]`,
    ) as HTMLElement | null;
    if (!bubble) return;
    bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(messageId);
  }

  function scheduleIdleDim(): void {
    if (idleTimer != null) window.clearTimeout(idleTimer);
    rail.classList.remove('is-dim');
    dimmed = false;
    idleTimer = window.setTimeout(() => {
      rail.classList.add('is-dim');
      dimmed = true;
      idleTimer = null;
    }, 2200);
  }

  function renderTicks(): void {
    ticksEl.innerHTML = '';
    const n = entries.length;
    entries.forEach((entry, i) => {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'history-nav-tick';
      tick.dataset.id = entry.messageId;
      tick.setAttribute('aria-label', `跳转到：${entry.summary}`);
      const y = n <= 1 ? 50 : (i / (n - 1)) * 100;
      tick.style.top = `${y}%`;
      if (entry.messageId === activeId) tick.classList.add('is-active');

      tick.addEventListener('mouseenter', () => {
        if (dimmed) {
          rail.classList.remove('is-dim');
          dimmed = false;
        }
        showTip(entry, tick);
        scheduleIdleDim();
      });
      tick.addEventListener('mouseleave', () => hideTip());
      tick.addEventListener('click', () => {
        hideTip();
        jumpTo(entry.messageId);
        scheduleIdleDim();
      });
      ticksEl.appendChild(tick);
    });
  }

  function sync(msgs: ChatMsg[]): void {
    lastMsgs = msgs;
    entries = deriveHistoryEntries(msgs);
    const show = entries.length >= MIN_TURNS && roomAllows();
    rail.hidden = !show;
    if (!show) {
      hideTip();
      return;
    }
    if (activeId && !entries.some((e) => e.messageId === activeId)) {
      activeId = entries.length ? entries[entries.length - 1]!.messageId : null;
    } else if (!activeId && entries.length) {
      activeId = entries[entries.length - 1]!.messageId;
    }
    renderTicks();
    scheduleIdleDim();
  }

  function setActive(messageId: string | null): void {
    activeId = messageId;
    ticksEl.querySelectorAll('.history-nav-tick').forEach((el) => {
      el.classList.toggle(
        'is-active',
        (el as HTMLElement).dataset.id === messageId,
      );
    });
  }

  const onResize = (): void => {
    sync(lastMsgs);
  };
  window.addEventListener('resize', onResize);

  rail.addEventListener('mouseenter', () => {
    rail.classList.remove('is-dim');
    dimmed = false;
    if (idleTimer != null) window.clearTimeout(idleTimer);
  });
  rail.addEventListener('mouseleave', () => {
    hideTip();
    scheduleIdleDim();
  });

  return {
    sync,
    setActive,
    destroy: () => {
      window.removeEventListener('resize', onResize);
      if (idleTimer != null) window.clearTimeout(idleTimer);
      rail.remove();
    },
  };
}
