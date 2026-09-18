/**
 * 「使用权限」chip — default | auto | full, persisted via settings IPC.
 */

export type AccessMode = 'default' | 'auto' | 'full';

export const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  default: '默认权限',
  auto: '自动审批',
  full: '完全访问',
};

const ORDER: AccessMode[] = ['default', 'auto', 'full'];

export function normalizeAccessMode(v: unknown): AccessMode {
  if (v === 'default' || v === 'auto' || v === 'full') return v;
  return 'default';
}

export type AccessModeApi = {
  get: () => AccessMode;
  set: (mode: AccessMode) => Promise<void>;
  syncFromSettings: () => Promise<void>;
};

export function createAccessModeControl(opts: {
  chipBtn: HTMLButtonElement;
}): AccessModeApi {
  const { chipBtn } = opts;
  let mode: AccessMode = 'default';
  let menu: HTMLDivElement | null = null;

  function updateLabel(): void {
    chipBtn.textContent = ACCESS_MODE_LABELS[mode];
    chipBtn.dataset.mode = mode;
    chipBtn.title = `使用权限：${ACCESS_MODE_LABELS[mode]}`;
    chipBtn.setAttribute('aria-label', chipBtn.title);
  }

  function closeMenu(): void {
    menu?.remove();
    menu = null;
    chipBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu(): void {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'access-menu';
    menu.setAttribute('role', 'menu');
    for (const m of ORDER) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'access-menu-item' + (m === mode ? ' active' : '');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', m === mode ? 'true' : 'false');
      item.textContent = ACCESS_MODE_LABELS[m];
      item.addEventListener('click', () => {
        void set(m);
        closeMenu();
      });
      menu.appendChild(item);
    }
    const parent = chipBtn.parentElement || chipBtn;
    if (getComputedStyle(parent).position === 'static') {
      (parent as HTMLElement).style.position = 'relative';
    }
    parent.appendChild(menu);
    chipBtn.setAttribute('aria-expanded', 'true');
  }

  async function persist(next: AccessMode): Promise<void> {
    if (!window.xyai.setSettings) return;
    try {
      await window.xyai.setSettings({ accessMode: next });
    } catch {
      /* ignore */
    }
  }

  async function set(next: AccessMode): Promise<void> {
    mode = next;
    updateLabel();
    await persist(next);
  }

  async function syncFromSettings(): Promise<void> {
    try {
      const res = await window.xyai.getSettings?.();
      if (res?.settings && 'accessMode' in res.settings) {
        mode = normalizeAccessMode(
          (res.settings as { accessMode?: unknown }).accessMode,
        );
      } else if (res?.status && 'accessMode' in (res.status as object)) {
        mode = normalizeAccessMode(
          (res.status as { accessMode?: unknown }).accessMode,
        );
      }
    } catch {
      /* keep current */
    }
    updateLabel();
  }

  chipBtn.type = 'button';
  chipBtn.setAttribute('aria-haspopup', 'menu');
  chipBtn.setAttribute('aria-expanded', 'false');
  chipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) closeMenu();
    else openMenu();
  });
  document.addEventListener('click', (e) => {
    if (!menu) return;
    if (e.target instanceof Node && (chipBtn.contains(e.target) || menu.contains(e.target))) {
      return;
    }
    closeMenu();
  });

  updateLabel();

  return {
    get: () => mode,
    set,
    syncFromSettings,
  };
}
