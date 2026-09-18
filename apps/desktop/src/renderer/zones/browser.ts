/**
 * 浏览器 — tab strip + back/forward/reload/home + URL bar + webview(s).
 * Adapted from 0.3 browser chrome patterns for in-renderer Electron <webview>.
 */

type BrowserTab = {
  id: string;
  title: string;
  url: string;
  webview: HTMLElement & {
    src: string;
    canGoBack?: () => boolean;
    canGoForward?: () => boolean;
    goBack?: () => void;
    goForward?: () => void;
    reload?: () => void;
    getURL?: () => string;
    getTitle?: () => string;
  };
};

export type BrowserZoneApi = {
  activate: () => void;
  /** Switch to browser zone (caller activates zone chrome) and open/navigate URL. */
  open: (url: string) => void;
  navigate: (url: string) => void;
};

const HOME_URL = 'https://www.cnxyai.cn/';
let mounted = false;
let tabs: BrowserTab[] = [];
let activeId = '';
let seq = 0;

/** Module-level open so About / other panels can call without holding the mount handle. */
let openImpl: ((url: string) => void) | null = null;

export function openBrowser(url: string): void {
  if (openImpl) {
    openImpl(url);
    return;
  }
  // Fallback if zone not mounted yet — stash for first activate.
  pendingOpenUrl = normalizeUrl(url);
}

let pendingOpenUrl: string | null = null;

function newId(): string {
  seq += 1;
  return `tab-${seq}`;
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return HOME_URL;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return v;
  if (v.includes('.') && !v.includes(' ')) return `https://${v}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(v)}`;
}

export function mountBrowserZone(root: HTMLElement): BrowserZoneApi {
  if (!mounted) {
    mounted = true;
    root.innerHTML = '';
    root.classList.add('zone-embed', 'browser-zone');

    const chrome = document.createElement('div');
    chrome.className = 'browser-chrome';
    chrome.innerHTML = `
      <div class="browser-tabstrip">
        <div class="browser-tabs" id="browser-tabs" role="tablist"></div>
        <button type="button" class="browser-new-tab capsule-btn" id="browser-new-tab" title="新建标签页">＋</button>
      </div>
      <div class="browser-navrow">
        <button type="button" class="capsule-btn" id="browser-back" title="后退">←</button>
        <button type="button" class="capsule-btn" id="browser-forward" title="前进">→</button>
        <button type="button" class="capsule-btn" id="browser-reload" title="刷新">⟳</button>
        <button type="button" class="capsule-btn" id="browser-home" title="主页">⌂</button>
        <input id="browser-url" class="browser-url" type="text" placeholder="输入网址，回车访问" spellcheck="false" autocomplete="off" />
      </div>
    `;

    const stage = document.createElement('div');
    stage.className = 'browser-stage';
    stage.id = 'browser-stage';

    root.appendChild(chrome);
    root.appendChild(stage);

    document.getElementById('browser-new-tab')!.addEventListener('click', () => {
      createTab(HOME_URL);
    });
    document.getElementById('browser-back')!.addEventListener('click', () => {
      const t = activeTab();
      t?.webview.goBack?.();
    });
    document.getElementById('browser-forward')!.addEventListener('click', () => {
      const t = activeTab();
      t?.webview.goForward?.();
    });
    document.getElementById('browser-reload')!.addEventListener('click', () => {
      const t = activeTab();
      t?.webview.reload?.();
    });
    document.getElementById('browser-home')!.addEventListener('click', () => {
      navigate(HOME_URL);
    });
    const urlInput = document.getElementById('browser-url') as HTMLInputElement;
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        navigate(normalizeUrl(urlInput.value));
      }
    });
  }

  function activeTab(): BrowserTab | undefined {
    return tabs.find((t) => t.id === activeId);
  }

  function renderTabs(): void {
    const strip = document.getElementById('browser-tabs');
    if (!strip) return;
    strip.innerHTML = '';
    for (const t of tabs) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'browser-tab' + (t.id === activeId ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.title = t.url;
      const ttl = document.createElement('span');
      ttl.className = 'browser-tab-title';
      ttl.textContent = t.title || t.url || '新标签页';
      const x = document.createElement('span');
      x.className = 'browser-tab-close';
      x.textContent = '×';
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeTab(t.id);
      });
      el.appendChild(ttl);
      el.appendChild(x);
      el.addEventListener('click', () => activateTab(t.id));
      strip.appendChild(el);
    }
  }

  function syncNav(): void {
    const t = activeTab();
    const back = document.getElementById('browser-back') as HTMLButtonElement | null;
    const forward = document.getElementById(
      'browser-forward',
    ) as HTMLButtonElement | null;
    const urlInput = document.getElementById('browser-url') as HTMLInputElement | null;
    if (!t) {
      if (back) back.disabled = true;
      if (forward) forward.disabled = true;
      if (urlInput) urlInput.value = '';
      return;
    }
    try {
      if (back) back.disabled = !(t.webview.canGoBack?.() ?? false);
      if (forward) forward.disabled = !(t.webview.canGoForward?.() ?? false);
    } catch {
      if (back) back.disabled = true;
      if (forward) forward.disabled = true;
    }
    if (urlInput && document.activeElement !== urlInput) {
      urlInput.value = t.url;
    }
  }

  function activateTab(id: string): void {
    activeId = id;
    const stage = document.getElementById('browser-stage');
    if (!stage) return;
    for (const t of tabs) {
      t.webview.style.display = t.id === id ? 'flex' : 'none';
    }
    renderTabs();
    syncNav();
  }

  function closeTab(id: string): void {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const [removed] = tabs.splice(idx, 1);
    removed?.webview.remove();
    if (!tabs.length) {
      createTab(HOME_URL);
      return;
    }
    if (activeId === id) {
      const next = tabs[Math.max(0, idx - 1)] || tabs[0];
      if (next) activateTab(next.id);
    } else {
      renderTabs();
    }
  }

  function createTab(url: string): void {
    const stage = document.getElementById('browser-stage');
    if (!stage) return;
    const id = newId();
    const webview = document.createElement('webview') as BrowserTab['webview'];
    webview.className = 'zone-webview browser-webview';
    webview.setAttribute('partition', 'persist:browser');
    webview.setAttribute('allowpopups', 'true');
    webview.style.display = 'none';
    webview.src = url;

    const tab: BrowserTab = { id, title: '新标签页', url, webview };
    tabs.push(tab);
    stage.appendChild(webview);

    const bump = () => {
      try {
        tab.url = webview.getURL?.() || tab.url;
        tab.title = webview.getTitle?.() || tab.title || tab.url;
      } catch {
        /* ignore */
      }
      if (tab.id === activeId) {
        renderTabs();
        syncNav();
      } else {
        renderTabs();
      }
    };

    webview.addEventListener('did-navigate', bump as EventListener);
    webview.addEventListener('did-navigate-in-page', bump as EventListener);
    webview.addEventListener('page-title-updated', bump as EventListener);
    webview.addEventListener('did-finish-load', bump as EventListener);

    activateTab(id);
  }

  function navigate(url: string): void {
    const normalized = normalizeUrl(url);
    let t = activeTab();
    if (!t) {
      createTab(normalized);
      return;
    }
    t.url = normalized;
    t.webview.src = normalized;
    syncNav();
    renderTabs();
  }

  function activateZoneChrome(): void {
    document.querySelectorAll('.zone').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.zone === 'browser');
    });
    document.querySelectorAll('.zone-body').forEach((body) => {
      body.classList.toggle('active', (body as HTMLElement).id === 'zone-browser');
    });
  }

  function open(url: string): void {
    activateZoneChrome();
    activate();
    navigate(normalizeUrl(url));
  }

  function activate(): void {
    if (!tabs.length) createTab(HOME_URL);
    if (pendingOpenUrl) {
      const u = pendingOpenUrl;
      pendingOpenUrl = null;
      navigate(u);
    }
  }

  openImpl = open;

  return { activate, open, navigate };
}
