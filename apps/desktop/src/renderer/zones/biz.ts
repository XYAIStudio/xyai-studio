import { MASCOT_POSES, mascotSrc, type MascotPose } from '../chat/mascot.js';

/**
 * 业务空间 — embed installed OpenXYOS via <webview>, with status fallback + 刷新 / 重启前后端.
 */

let mounted = false;
let loadedOnce = false;
let loadGeneration = 0;

export function mountBizZone(root: HTMLElement): { activate: () => void } {
  if (!mounted) {
    mounted = true;
    root.innerHTML = '';
    root.classList.add('zone-embed', 'biz-zone');

    const toolbar = document.createElement('div');
    toolbar.className = 'biz-toolbar';
    toolbar.innerHTML =
      '<button type="button" class="capsule-btn" id="biz-restart-services" title="重启前后端服务">重启前后端服务</button>' +
      '<button type="button" class="capsule-btn" id="biz-refresh" title="刷新">刷新</button>' +
      '<button type="button" class="capsule-btn" id="biz-interop" title="资产互通">资产互通</button>';

    const stage = document.createElement('div');
    stage.className = 'biz-stage';

    const status = document.createElement('div');
    status.className = 'zone-status';
    status.id = 'biz-status';
    status.innerHTML = '<p>正在定位 OpenXYOS…</p>';

    const webview = document.createElement('webview') as HTMLElement & {
      src: string;
      setAttribute(name: string, value: string): void;
      reload?: () => void;
      addEventListener(type: string, listener: EventListener): void;
      removeEventListener(type: string, listener: EventListener): void;
    };
    webview.id = 'biz-webview';
    webview.className = 'zone-webview';
    webview.setAttribute('partition', 'persist:openxyos');
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=yes');
    webview.style.display = 'none';

    stage.appendChild(status);
    stage.appendChild(webview);
    root.appendChild(toolbar);
    root.appendChild(stage);

    document.getElementById('biz-refresh')!.addEventListener('click', () => {
      void refresh();
    });
    document.getElementById('biz-restart-services')!.addEventListener('click', () => {
      void restartServices();
    });
    document.getElementById('biz-interop')!.addEventListener('click', () => {
      void openInteropPanel();
    });

    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showBizContextMenu(e.clientX, e.clientY, () => void refresh());
    });
  }

  function showStatusCard(
    message: string,
    canOpenFolder: boolean,
    rootPath?: string,
    opts?: { offerRestart?: boolean },
  ): void {
    const status = document.getElementById('biz-status');
    const webview = document.getElementById('biz-webview');
    if (!status) return;
    if (webview) (webview as HTMLElement).style.display = 'none';
    status.style.display = 'flex';
    const openBtn = canOpenFolder
      ? '<button type="button" class="capsule-btn" id="biz-open-folder">打开目录</button>'
      : '';
    const restartBtn = opts?.offerRestart
      ? '<button type="button" class="capsule-btn" id="biz-retry-restart">重试重启</button>'
      : '';
    const meta = rootPath
      ? `<p class="meta">路径：<code>${escapeHtml(rootPath)}</code></p>`
      : '';
    status.innerHTML = `
        <div class="zone-status-card">
          <h2>业务空间 · OpenXYOS</h2>
          <p>${escapeHtml(message)}</p>
          ${meta}
          <div class="zone-status-actions">
            <button type="button" class="capsule-btn" id="biz-retry">刷新</button>
            ${restartBtn}
            ${openBtn}
          </div>
        </div>`;
    document.getElementById('biz-retry')?.addEventListener('click', () => void refresh());
    document.getElementById('biz-retry-restart')?.addEventListener('click', () => {
      void restartServices();
    });
    document.getElementById('biz-open-folder')?.addEventListener('click', () => {
      void window.xyai.openXyosOpenFolder?.();
    });
  }

  function bindWebviewLoad(
    webview: HTMLElement & {
      src: string;
      reload?: () => void;
      addEventListener(type: string, listener: EventListener): void;
      removeEventListener(type: string, listener: EventListener): void;
    },
    status: HTMLElement,
    gen: number,
  ): void {
    const LOAD_TIMEOUT_MS = 20_000;

    const cleanup = (): void => {
      webview.removeEventListener('did-finish-load', onFinish);
      webview.removeEventListener('did-fail-load', onFail);
      clearTimeout(timer);
    };

    const onFinish = (): void => {
      if (gen !== loadGeneration) return;
      cleanup();
      status.style.display = 'none';
      webview.style.display = 'flex';
      loadedOnce = true;
    };

    const onFail = (ev: Event): void => {
      if (gen !== loadGeneration) return;
      const detail = ev as Event & { errorCode?: number; errorDescription?: string };
      // -3 = ERR_ABORTED (navigation superseded) — ignore
      if (detail.errorCode === -3) return;
      cleanup();
      const desc = detail.errorDescription || detail.errorCode != null
        ? `（${detail.errorDescription || `code ${detail.errorCode}`}）`
        : '';
      showStatusCard(`OpenXYOS 页面加载失败${desc}。请点击刷新重试。`, true, undefined, {
        offerRestart: true,
      });
      loadedOnce = false;
    };

    const timer = setTimeout(() => {
      if (gen !== loadGeneration) return;
      cleanup();
      showStatusCard('OpenXYOS 加载超时（20s）。请检查本地服务后点击刷新，或重启前后端服务。', true, undefined, {
        offerRestart: true,
      });
      loadedOnce = false;
    }, LOAD_TIMEOUT_MS);

    webview.addEventListener('did-finish-load', onFinish);
    webview.addEventListener('did-fail-load', onFail);
  }

  type WebviewEl = HTMLElement & {
    src: string;
    reload?: () => void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  };

  async function applyUrlToWebview(
    webview: WebviewEl,
    status: HTMLElement,
    gen: number,
    url: string,
    loadingText: string,
  ): Promise<void> {
    status.style.display = 'flex';
    status.innerHTML = `<p>${loadingText}</p>`;
    webview.style.display = 'none';

    bindWebviewLoad(webview, status, gen);

    if (webview.getAttribute('src') === url) {
      try {
        webview.reload?.();
      } catch {
        webview.src = url;
      }
    } else {
      webview.src = url;
    }
  }

  async function resolveAndLoad(statusText: string): Promise<void> {
    const status = document.getElementById('biz-status');
    const webview = document.getElementById('biz-webview') as WebviewEl | null;
    if (!status || !webview) return;

    const gen = ++loadGeneration;

    status.style.display = 'flex';
    status.innerHTML = `<p>${statusText}</p>`;
    webview.style.display = 'none';

    try {
      const res = await window.xyai.openXyosResolve?.();
      if (gen !== loadGeneration) return;

      if (!res) {
        showStatusCard('openXyosResolve 不可用，请重建桌面端。', false);
        return;
      }
      if (res.ok && res.url) {
        // static-http has no /api — auto-start full stack so login works without manual restart
        if (res.mode === 'static-http') {
          await restartServices();
          return;
        }
        // Prefer verifying API before showing page
        await applyUrlToWebview(webview, status, gen, res.url, '正在加载 OpenXYOS…');
        return;
      }
      // No URL: try auto-start full services once
      await restartServices();
    } catch (err) {
      if (gen !== loadGeneration) return;
      const msg = err instanceof Error ? err.message : String(err);
      showStatusCard(`加载失败：${msg}`, false, undefined, { offerRestart: true });
    }
  }

  async function restartServices(): Promise<void> {
    const status = document.getElementById('biz-status');
    const webview = document.getElementById('biz-webview') as WebviewEl | null;
    if (!status || !webview) return;

    const gen = ++loadGeneration;
    loadedOnce = false;
    setBizToolbarBusy(true);

    const stopProgress = showRestartProgress(status, webview);
    webview.style.display = 'none';

    try {
      const res = await window.xyai.openXyosRestartServices?.();
      if (gen !== loadGeneration) return;

      if (!res) {
        stopProgress();
        showStatusCard('openXyosRestartServices 不可用，请重建桌面端。', false);
        return;
      }
      if (res.ok && res.url) {
        stopProgress({
          finalStep: 4,
          line: '好了！马上打开业务空间～',
          detail: '前后端已就绪，正在加载可登录注册的页面。',
        });
        status.style.display = 'flex';
        await applyUrlToWebview(
          webview,
          status,
          gen,
          res.url,
          '前后端已就绪，正在加载页面…',
        );
        return;
      }
      stopProgress();
      showStatusCard(res.message, res.canOpenFolder, res.root, { offerRestart: true });
    } catch (err) {
      if (gen !== loadGeneration) return;
      stopProgress();
      const msg = err instanceof Error ? err.message : String(err);
      showStatusCard(`重启失败：${msg}`, false, undefined, { offerRestart: true });
    } finally {
      if (gen === loadGeneration) setBizToolbarBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    loadedOnce = false;
    await resolveAndLoad('正在刷新…');
  }

  async function activate(): Promise<void> {
    const status = document.getElementById('biz-status');
    const webview = document.getElementById('biz-webview') as
      | (HTMLElement & { src: string })
      | null;
    if (!status || !webview) return;

    const src = webview.getAttribute('src') || '';
    if (loadedOnce && src) {
      // If last load was static-only (:3921), force full stack so login works
      if (/:3921\b/.test(src) || src.includes('static')) {
        loadedOnce = false;
        await restartServices();
        return;
      }
      status.style.display = 'none';
      webview.style.display = 'flex';
      return;
    }

    await resolveAndLoad('正在加载 OpenXYOS…');
  }


  async function openInteropPanel(): Promise<void> {
    const pending =
      (await window.xyai.interopListPendingBiz?.()) || [];
    const installed =
      (await window.xyai.interopListInstalledBiz?.()) || [];
    const overlay = document.createElement('div');
    overlay.className = 'interop-overlay';
    overlay.innerHTML = `
      <div class="interop-panel card" role="dialog" aria-label="资产互通">
        <header class="interop-header">
          <h2>资产互通</h2>
          <button type="button" class="capsule-btn" id="interop-close">关闭</button>
        </header>
        <p class="hint">开发空间推送的 AI智能助手会自动进入 OpenXYOS 人机资源（人才市场 + 备选员工）；此处可再安装/选用。知识库仍为互通清单安装包。</p>
        <section>
          <h3>待安装</h3>
          <div id="interop-pending" class="interop-list"></div>
        </section>
        <section>
          <h3>已安装 / 可选用</h3>
          <div id="interop-installed" class="interop-list"></div>
        </section>
      </div>`;
    document.body.appendChild(overlay);
    const pendingEl = overlay.querySelector('#interop-pending') as HTMLElement;
    const installedEl = overlay.querySelector(
      '#interop-installed',
    ) as HTMLElement;

    function renderList(
      el: HTMLElement,
      items: {
        id: string;
        name: string;
        kind: string;
        status: string;
        description?: string;
      }[],
      mode: 'pending' | 'installed',
    ): void {
      el.innerHTML = '';
      if (!items.length) {
        el.innerHTML = '<p class="meta">暂无</p>';
        return;
      }
      for (const a of items) {
        const row = document.createElement('div');
        row.className = 'interop-row';
        const kindLabel =
          a.kind === 'agent'
            ? 'AI智能助手 → AI员工候选'
            : a.kind === 'knowledge-mount'
              ? '知识库安装包'
              : '模型供应商';
        row.innerHTML = `<div><strong>${escapeHtml(a.name)}</strong>
          <span class="meta">${escapeHtml(kindLabel)} · ${escapeHtml(a.status)}</span>
          ${a.description ? `<div class="meta">${escapeHtml(a.description)}</div>` : ''}</div>`;
        const actions = document.createElement('div');
        actions.className = 'interop-actions';
        if (mode === 'pending') {
          const installBtn = document.createElement('button');
          installBtn.type = 'button';
          installBtn.className = 'capsule-btn primary';
          installBtn.textContent = '安装/注册';
          installBtn.addEventListener('click', () => {
            void (async () => {
              const res = await window.xyai.interopInstall?.(a.id);
              if (!res?.ok) {
                alert(res?.message || '安装失败');
                return;
              }
              const tip =
                (res as { publishMessage?: string }).publishMessage ||
                (a.kind === 'agent'
                  ? '已安装。可在 OpenXYOS 人机资源 → 人才市场 / 备选员工 中查看该 AI 智能助手。'
                  : '已安装到业务空间。');
              alert(tip);
              overlay.remove();
              void openInteropPanel();
            })();
          });
          actions.appendChild(installBtn);
        } else {
          const selectBtn = document.createElement('button');
          selectBtn.type = 'button';
          selectBtn.className = 'capsule-btn';
          selectBtn.textContent = a.status === 'selected' ? '已选用' : '选用';
          selectBtn.disabled = a.status === 'selected';
          selectBtn.addEventListener('click', () => {
            void (async () => {
              const res = await window.xyai.interopSelect?.(a.id, 'biz');
              if (!res?.ok) {
                alert(res?.message || '选用失败');
                return;
              }
              const tip =
                (res as { publishMessage?: string }).publishMessage ||
                (a.kind === 'agent'
                  ? '已选用。请在 OpenXYOS 人机资源 → 备选员工 中查看。'
                  : '已选用。');
              alert(tip);
              overlay.remove();
              void openInteropPanel();
            })();
          });
          actions.appendChild(selectBtn);
        }
        row.appendChild(actions);
        el.appendChild(row);
      }
    }

    renderList(pendingEl, pending as any, 'pending');
    renderList(installedEl, installed as any, 'installed');
    overlay.querySelector('#interop-close')?.addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  return { activate: () => void activate() };
}


type RestartNarration = {
  pose: MascotPose;
  line: string;
  detail: string;
};

const RESTART_NARRATION: RestartNarration[] = [
  {
    pose: 'wave',
    line: '我先帮你把旧服务停掉～',
    detail: '正在停止旧的 OpenXYOS 进程，请稍候。',
  },
  {
    pose: 'think',
    line: '正在找 OpenXYOS 工程目录…',
    detail: '会优先使用本机完整源码目录，好启动前后端。',
  },
  {
    pose: 'idea',
    line: '开始拉起后端和前端啦！',
    detail: '正在启动 API 与页面服务，通常需要几十秒。',
  },
  {
    pose: 'thumbs',
    line: '服务快好了，请再耐心等一下～',
    detail: '正在等待本机端口就绪，不要关闭窗口。',
  },
  {
    pose: 'hearts',
    line: '好了！马上打开业务空间～',
    detail: '前后端已就绪，正在加载可登录注册的页面。',
  },
];

function setBizToolbarBusy(busy: boolean): void {
  for (const id of ['biz-restart-services', 'biz-refresh']) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = busy;
  }
}

function renderRestartProgressHtml(activeStep: number, override?: Partial<RestartNarration>): string {
  const n = RESTART_NARRATION[Math.min(activeStep, RESTART_NARRATION.length - 1)]!;
  const pose = override?.pose ?? n.pose;
  const line = override?.line ?? n.line;
  const detail = override?.detail ?? n.detail;
  const steps = RESTART_NARRATION.map((item, i) => {
    let cls = 'biz-progress-step';
    if (i < activeStep) cls += ' done';
    else if (i === activeStep) cls += ' active';
    const mark = i < activeStep ? '✓' : i === activeStep ? '●' : '○';
    return `<li class="${cls}"><span class="biz-progress-mark">${mark}</span><span>${item.detail}</span></li>`;
  }).join('');
  return `
    <div class="biz-progress-card" role="status" aria-live="polite">
      <div class="biz-mascot-host" aria-hidden="true">
        <div class="biz-mascot-stage mascot-stage">
           ${MASCOT_POSES.map(
            (p) =>
              `<img class="mascot-frame${p === pose ? ' is-active' : ''}" src="${mascotSrc(p)}" alt="" draggable="false" data-pose="${p}" />`,
          ).join('')}
        </div>
        <div class="biz-mascot-bubble">
          <p class="biz-mascot-line">${line}</p>
          <p class="biz-mascot-detail">${detail}</p>
          <p class="biz-mascot-wait">请耐心等待，小精灵正在干活中…</p>
        </div>
      </div>
      <div class="biz-progress-spinner" aria-hidden="true"></div>
      <h2>正在重启前后端服务</h2>
      <ol class="biz-progress-steps">${steps}</ol>
    </div>`;
}

/** Animated mascot narration while restart IPC runs. */
function showRestartProgress(
  status: HTMLElement,
  webview: HTMLElement,
): (opts?: { finalStep?: number; line?: string; detail?: string }) => void {
  webview.style.display = 'none';
  status.style.display = 'flex';
  let step = 0;
  status.innerHTML = renderRestartProgressHtml(step);
  const timer = window.setInterval(() => {
    if (step < RESTART_NARRATION.length - 2) {
      step += 1;
      status.innerHTML = renderRestartProgressHtml(step);
    }
  }, 4200);
  return (opts) => {
    window.clearInterval(timer);
    if (opts && typeof opts.finalStep === 'number') {
      status.innerHTML = renderRestartProgressHtml(opts.finalStep, {
        pose: 'hearts',
        line: opts.line,
        detail: opts.detail,
      });
    }
  };
}


function showBizContextMenu(x: number, y: number, onRefresh: () => void): void {
  document.getElementById('biz-ctx-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'biz-ctx-menu';
  menu.className = 'biz-ctx-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = '刷新';
  item.addEventListener('click', () => {
    menu.remove();
    onRefresh();
  });
  menu.appendChild(item);
  document.body.appendChild(menu);
  const dismiss = () => {
    menu.remove();
    window.removeEventListener('click', dismiss);
  };
  setTimeout(() => window.addEventListener('click', dismiss), 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
