/**
 * Right collapsible sidebar — 打开文件 | 审查 | 后台任务 | 浏览器 | 终端
 */

import type { CollabRailState } from './collab-types.js';
import type { ChatMsg } from './types.js';

export type OpenedFile = {
  path: string;
  name: string;
};

export type RightSidebarApi = {
  setCollapsed: (collapsed: boolean) => void;
  isCollapsed: () => boolean;
  setOpenedFiles: (files: OpenedFile[]) => void;
  setReviewStub: (msgs: ChatMsg[]) => void;
  setCollab: (collab: CollabRailState) => void;
  appendTerminal: (line: string) => void;
  focusFile: (path: string) => void;
  wire: (handlers: {
    onRemoveFile: (path: string) => void;
    onOpenExternal: (url: string) => void | Promise<void>;
    onSelectTask?: (taskId: string) => void;
  }) => void;
};

type PaneId = 'files' | 'review' | 'tasks' | 'browser' | 'terminal';

const LS_KEY = 'xyai.rightSidebar.collapsed';
const LS_WIDTH_KEY = 'xyai.rightSidebar.width';
/** Default / clamp for --right-sidebar-width (px). Center keeps ≥ CHAT_CENTER_MIN. */
const WIDTH_DEFAULT = 280;
const WIDTH_MIN = 180;
const WIDTH_MAX = 480;
const CHAT_CENTER_MIN = 280;

const TABS: { id: PaneId; icon: string; label: string }[] = [
  { id: 'files', icon: '📄', label: '打开文件' },
  { id: 'review', icon: '🔍', label: '审查' },
  { id: 'tasks', icon: '⚙️', label: '后台任务' },
  { id: 'browser', icon: '🌐', label: '浏览器' },
  { id: 'terminal', icon: '⌘', label: '终端' },
];

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

export function createRightSidebar(opts: {
  chatMain: HTMLElement;
}): RightSidebarApi {
  const { chatMain } = opts;

  let collapsed =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(LS_KEY) === '1';
  let activePane: PaneId = 'files';
  let openedFiles: OpenedFile[] = [];
  let focusedPath: string | null = null;
  let reviewMsgs: ChatMsg[] = [];
  let collab: CollabRailState | null = null;
  let handlers: {
    onRemoveFile: (path: string) => void;
    onOpenExternal: (url: string) => void | Promise<void>;
    onSelectTask?: (taskId: string) => void;
  } | null = null;

  const wrap = document.createElement('div');
  wrap.className = 'chat-right-wrap';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'chat-resize-handle';
  resizeHandle.title = '拖动调整右侧栏宽度';
  resizeHandle.setAttribute('role', 'separator');
  resizeHandle.setAttribute('aria-orientation', 'vertical');
  resizeHandle.setAttribute('aria-label', '调整右侧栏宽度');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'right-sidebar-toggle';
  toggle.title = '折叠右侧栏';
  toggle.setAttribute('aria-label', '折叠右侧栏');
  toggle.textContent = '⟩';

  const aside = document.createElement('aside');
  aside.className = 'right-sidebar';
  aside.setAttribute('aria-label', '右侧面板');

  const tabs = document.createElement('div');
  tabs.className = 'right-sidebar-tabs';
  tabs.setAttribute('role', 'tablist');

  const panes = document.createElement('div');
  panes.className = 'right-sidebar-panes';

  const paneEls = new Map<PaneId, HTMLElement>();
  for (const t of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'right-sidebar-tab';
    btn.dataset.pane = t.id;
    btn.setAttribute('role', 'tab');
    btn.title = t.label;
    btn.innerHTML = `<span class="rs-icon" aria-hidden="true">${t.icon}</span><span class="rs-label">${t.label}</span>`;
    btn.addEventListener('click', () => setPane(t.id));
    tabs.appendChild(btn);

    const pane = document.createElement('div');
    pane.className = 'right-sidebar-pane';
    pane.dataset.pane = t.id;
    pane.setAttribute('role', 'tabpanel');
    pane.hidden = t.id !== activePane;
    panes.appendChild(pane);
    paneEls.set(t.id, pane);
  }

  aside.appendChild(tabs);
  aside.appendChild(panes);
  wrap.appendChild(resizeHandle);
  wrap.appendChild(toggle);
  wrap.appendChild(aside);
  chatMain.appendChild(wrap);

  // Terminal log state
  const termLog: string[] = [];

  function persistCollapsed(): void {
    try {
      localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function applyCollapsed(): void {
    wrap.classList.toggle('is-collapsed', collapsed);
    toggle.textContent = collapsed ? '⟨' : '⟩';
    toggle.title = collapsed ? '展开右侧栏' : '折叠右侧栏';
    toggle.setAttribute('aria-label', toggle.title);
    aside.hidden = collapsed;
  }

  function setPane(id: PaneId): void {
    activePane = id;
    tabs.querySelectorAll('.right-sidebar-tab').forEach((el) => {
      const on = (el as HTMLElement).dataset.pane === id;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    for (const [pid, pane] of paneEls) {
      pane.hidden = pid !== id;
    }
    renderActive();
  }

  function renderFiles(): void {
    const pane = paneEls.get('files')!;
    pane.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rs-pane-head';
    head.textContent = '打开文件';
    pane.appendChild(head);
    if (!openedFiles.length) {
      const empty = document.createElement('div');
      empty.className = 'rs-empty';
      empty.textContent = '暂无打开文件。用「+」选择文件。';
      pane.appendChild(empty);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'rs-file-list';
    for (const f of openedFiles) {
      const li = document.createElement('li');
      li.className =
        'rs-file-item' + (f.path === focusedPath ? ' is-focused' : '');
      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'rs-file-name';
      nameBtn.textContent = f.name || basename(f.path);
      nameBtn.title = f.path;
      nameBtn.addEventListener('click', () => {
        focusedPath = f.path;
        renderFiles();
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rs-file-rm';
      rm.textContent = '×';
      rm.title = '移除';
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers?.onRemoveFile(f.path);
      });
      li.appendChild(nameBtn);
      li.appendChild(rm);
      list.appendChild(li);
    }
    pane.appendChild(list);
  }

  function renderReview(): void {
    const pane = paneEls.get('review')!;
    pane.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rs-pane-head';
    head.textContent = '审查';
    pane.appendChild(head);

    const lastAsst = [...reviewMsgs]
      .reverse()
      .find((m) => m.role === 'assistant' && m.text.trim());
    if (!lastAsst) {
      const empty = document.createElement('div');
      empty.className = 'rs-empty';
      empty.textContent = '暂无审查项';
      pane.appendChild(empty);
      return;
    }

    const stub = document.createElement('div');
    stub.className = 'rs-review-card';
    const title = document.createElement('div');
    title.className = 'rs-review-title';
    title.textContent = '待审查 · 最近助手回复（占位）';
    const body = document.createElement('pre');
    body.className = 'rs-review-diff';
    const excerpt = lastAsst.text.slice(0, 400);
    body.textContent =
      `--- a/reply.md\n+++ b/reply.md\n@@ placeholder @@\n` +
      excerpt.split('\n').map((l) => `+ ${l}`).join('\n');
    const note = document.createElement('div');
    note.className = 'rs-muted';
    note.textContent = '真实 diff / pending review 后续接入。';
    stub.appendChild(title);
    stub.appendChild(body);
    stub.appendChild(note);
    pane.appendChild(stub);
  }

  function renderTasks(): void {
    const pane = paneEls.get('tasks')!;
    pane.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rs-pane-head';
    head.textContent = '后台任务';
    pane.appendChild(head);

    const active = (collab?.tasks || []).filter((t) => !t.archived);
    if (!active.length) {
      const empty = document.createElement('div');
      empty.className = 'rs-empty';
      empty.textContent = '无后台任务';
      pane.appendChild(empty);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'rs-task-list';
    for (const t of active) {
      const li = document.createElement('li');
      li.className = 'rs-task-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rs-task-btn';
      const proj = collab?.projects.find((p) => p.id === t.projectId);
      btn.textContent = `${t.name}${proj ? ` · ${proj.name}` : ''}`;
      btn.title = '在左侧会话栏中查看对应任务';
      btn.addEventListener('click', () => handlers?.onSelectTask?.(t.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
    pane.appendChild(list);
    const hint = document.createElement('div');
    hint.className = 'rs-muted';
    hint.textContent = '点击可跳到左侧任务（若已接线）。';
    pane.appendChild(hint);
  }

  function renderBrowser(): void {
    const pane = paneEls.get('browser')!;
    pane.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rs-pane-head';
    head.textContent = '浏览器';
    pane.appendChild(head);
    const note = document.createElement('p');
    note.className = 'rs-muted';
    note.textContent =
      '内嵌浏览器后续接入。当前可通过系统默认浏览器打开链接。';
    pane.appendChild(note);
    const row = document.createElement('div');
    row.className = 'rs-browser-row';
    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'rs-browser-url';
    input.placeholder = 'https://…';
    input.autocomplete = 'off';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'primary rs-browser-go';
    go.textContent = '打开';
    const open = () => {
      const raw = input.value.trim();
      if (!raw) return;
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      void handlers?.onOpenExternal(url);
    };
    go.addEventListener('click', open);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        open();
      }
    });
    row.appendChild(input);
    row.appendChild(go);
    pane.appendChild(row);
  }

  function renderTerminal(): void {
    const pane = paneEls.get('terminal')!;
    pane.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rs-pane-head';
    head.textContent = '终端';
    pane.appendChild(head);
    const log = document.createElement('pre');
    log.className = 'rs-term-log';
    log.textContent =
      termLog.length > 0
        ? termLog.join('\n')
        : '$ # session event log\n$ # waiting…';
    pane.appendChild(log);
    const foot = document.createElement('div');
    foot.className = 'rs-term-foot';
    foot.textContent = '即将接入真实 PTY';
    pane.appendChild(foot);
    log.scrollTop = log.scrollHeight;
  }

  function renderActive(): void {
    switch (activePane) {
      case 'files':
        renderFiles();
        break;
      case 'review':
        renderReview();
        break;
      case 'tasks':
        renderTasks();
        break;
      case 'browser':
        renderBrowser();
        break;
      case 'terminal':
        renderTerminal();
        break;
    }
  }

  function readStoredWidth(): number {
    try {
      const raw = localStorage.getItem(LS_WIDTH_KEY);
      if (raw == null) return WIDTH_DEFAULT;
      const n = Number(raw);
      if (!Number.isFinite(n)) return WIDTH_DEFAULT;
      return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(n)));
    } catch {
      return WIDTH_DEFAULT;
    }
  }

  let sidebarWidth = readStoredWidth();

  function applyWidth(px: number): void {
    sidebarWidth = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(px)));
    const css = `${sidebarWidth}px`;
    wrap.style.setProperty('--right-sidebar-width', css);
    document.documentElement.style.setProperty('--right-sidebar-width', css);
  }

  function persistWidth(): void {
    try {
      localStorage.setItem(LS_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }

  function clampWidthForMain(desired: number): number {
    const mainW = chatMain.getBoundingClientRect().width;
    // Leave room for center min + handle(~10) + toggle(18)
    const chrome = 10 + 18;
    const maxByCenter = Math.max(WIDTH_MIN, Math.floor(mainW - CHAT_CENTER_MIN - chrome));
    return Math.min(WIDTH_MAX, maxByCenter, Math.max(WIDTH_MIN, desired));
  }

  applyWidth(clampWidthForMain(sidebarWidth));

  let resizing = false;
  let startX = 0;
  let startW = 0;

  const onMove = (e: MouseEvent) => {
    if (!resizing) return;
    // Dragging left increases sidebar (handle is on the left edge of the wrap)
    const delta = startX - e.clientX;
    applyWidth(clampWidthForMain(startW + delta));
  };

  const onUp = () => {
    if (!resizing) return;
    resizing = false;
    resizeHandle.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-chat');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    persistWidth();
  };

  resizeHandle.addEventListener('mousedown', (e) => {
    if (collapsed || e.button !== 0) return;
    e.preventDefault();
    resizing = true;
    startX = e.clientX;
    startW = sidebarWidth;
    resizeHandle.classList.add('is-dragging');
    document.body.classList.add('is-resizing-chat');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    persistCollapsed();
    applyCollapsed();
  });

  applyCollapsed();
  setPane(activePane);

  return {
    setCollapsed: (c) => {
      collapsed = c;
      persistCollapsed();
      applyCollapsed();
    },
    isCollapsed: () => collapsed,
    setOpenedFiles: (files) => {
      openedFiles = files.slice();
      if (activePane === 'files') renderFiles();
    },
    setReviewStub: (msgs) => {
      reviewMsgs = msgs;
      if (activePane === 'review') renderReview();
    },
    setCollab: (c) => {
      collab = c;
      if (activePane === 'tasks') renderTasks();
    },
    appendTerminal: (line) => {
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      termLog.push(`[${ts}] ${line}`);
      if (termLog.length > 200) termLog.splice(0, termLog.length - 200);
      if (activePane === 'terminal') renderTerminal();
    },
    focusFile: (path) => {
      focusedPath = path;
      if (activePane === 'files') renderFiles();
    },
    wire: (h) => {
      handlers = h;
    },
  };
}
