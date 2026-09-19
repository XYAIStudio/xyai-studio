/**
 * 个性化 subtab (P2) — local scan / import / install / enable.
 * OpenXYOS interop (P3) and agent wizard (P4) remain empty/hint.
 */

export type PersonalizeKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'connector'
  | 'agent'
  | 'doc'
  | 'system';

export type PersonalizeSource = 'studio' | 'local' | 'openxyos';

export type PersonalizePanelApi = {
  refresh: () => Promise<void>;
};

type AssetRow = {
  id?: string;
  kind?: string;
  name?: string;
  status?: string;
  originApp?: string;
  pathOrRef?: string;
  description?: string;
  source?: string;
  version?: string;
};

const MODULES: {
  kind: PersonalizeKind;
  label: string;
  desc: string;
}[] = [
  { kind: 'skill', label: '技能', desc: '可复用技能包与命令' },
  { kind: 'plugin', label: '插件', desc: '扩展与插件清单' },
  { kind: 'mcp', label: 'MCP', desc: 'MCP 服务与工具注册' },
  { kind: 'connector', label: '连接器', desc: '外部系统连接配置' },
  { kind: 'agent', label: '智能体定制', desc: '四类工位蓝图（P4）' },
  { kind: 'doc', label: '文档', desc: '对话沉淀的文档' },
  { kind: 'system', label: '管理系统', desc: '对话沉淀的业务系统' },
];

const SOURCES: { id: PersonalizeSource; label: string }[] = [
  { id: 'studio', label: 'Studio 已装' },
  { id: 'local', label: '本机发现' },
  { id: 'openxyos', label: 'OpenXYOS 可装' },
];

const ORIGIN_LABEL: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  workbuddy: 'Workbuddy',
  other: '其他',
  xyai: 'XYAI',
  openxyos: 'OpenXYOS',
};

const STATUS_LABEL: Record<string, string> = {
  discovered: '已发现',
  imported: '已导入',
  installed: '已安装',
  enabled: '已启用',
  disabled: '已停用',
};

function emptyHint(kind: PersonalizeKind, source: PersonalizeSource): string {
  if (kind === 'agent') {
    if (source === 'studio') {
      return '暂无定制蓝图。对话创建的智能体会出现在这里；四类工位向导将在后续版本提供。';
    }
    if (source === 'local') {
      return '智能体模板本机扫描未启用（P4）。';
    }
    return '业务空间模板互通尚未启用（P3）。';
  }
  if (source === 'studio') {
    return '暂无已安装项。对话创建或「本机发现」导入后会出现在这里。';
  }
  if (source === 'local') {
    return '未发现本机资产。已探测 Claude / Codex·Cursor / Gemini / Workbuddy 等常见目录；未安装对应软件时列表为空属正常。';
  }
  return 'OpenXYOS 资产互通列表尚未启用（P3）。';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountPersonalizePanel(root: HTMLElement): PersonalizePanelApi {
  let selectedKind: PersonalizeKind = 'skill';
  let selectedSource: PersonalizeSource = 'studio';
  let loading = false;
  let statusMsg = '';

  root.innerHTML = `
    <div class="pz-layout">
      <aside class="pz-sidebar card" aria-label="个性化子模块">
        <div class="pz-sidebar-top">
          <h2>个性化</h2>
          <p class="hint">管理技能、插件、MCP、连接器与智能体定制。</p>
        </div>
        <div id="pz-module-list" class="pz-module-list" role="list"></div>
      </aside>
      <section class="pz-main">
        <div class="card pz-toolbar">
          <div class="pz-toolbar-row">
            <div>
              <div id="pz-selected-title" class="pz-selected-title"></div>
              <p id="pz-selected-desc" class="pz-selected-desc meta"></p>
            </div>
            <div class="pz-toolbar-actions">
              <button type="button" class="btn secondary" id="pz-btn-scan">扫描本机</button>
            </div>
          </div>
          <p id="pz-status" class="pz-status meta" hidden></p>
        </div>
        <div class="card pz-workspace">
          <div class="pz-source-tabs" role="tablist" aria-label="资产来源"></div>
          <div id="pz-source-body" class="pz-source-body" role="tabpanel">
            <div id="pz-asset-list" class="pz-asset-list" role="list"></div>
            <div id="pz-empty" class="pz-empty"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  const moduleListEl = root.querySelector('#pz-module-list') as HTMLElement;
  const titleEl = root.querySelector('#pz-selected-title') as HTMLElement;
  const descEl = root.querySelector('#pz-selected-desc') as HTMLElement;
  const tabsEl = root.querySelector('.pz-source-tabs') as HTMLElement;
  const assetListEl = root.querySelector('#pz-asset-list') as HTMLElement;
  const emptyEl = root.querySelector('#pz-empty') as HTMLElement;
  const statusEl = root.querySelector('#pz-status') as HTMLElement;
  const scanBtn = root.querySelector('#pz-btn-scan') as HTMLButtonElement;

  function setStatus(msg: string): void {
    statusMsg = msg;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function renderModules(): void {
    moduleListEl.innerHTML = '';
    for (const m of MODULES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className =
        'pz-module-item' + (m.kind === selectedKind ? ' active' : '');
      item.setAttribute('role', 'listitem');
      item.dataset.kind = m.kind;
      item.innerHTML = `<span class="pz-module-label">${m.label}</span><span class="pz-module-desc">${m.desc}</span>`;
      item.addEventListener('click', () => {
        selectedKind = m.kind;
        selectedSource = 'studio';
        renderModules();
        void refresh();
      });
      moduleListEl.appendChild(item);
    }
  }

  function renderSourceTabs(): void {
    tabsEl.innerHTML = '';
    for (const s of SOURCES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'pz-source-tab' + (s.id === selectedSource ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute(
        'aria-selected',
        s.id === selectedSource ? 'true' : 'false',
      );
      btn.dataset.source = s.id;
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        selectedSource = s.id;
        renderSourceTabs();
        void refresh();
      });
      tabsEl.appendChild(btn);
    }
  }

  function showEmpty(): void {
    assetListEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.innerHTML = `
      <div class="pz-empty-card">
        <div class="pz-empty-title">暂无内容</div>
        <p class="pz-empty-hint">${emptyHint(selectedKind, selectedSource)}</p>
      </div>
    `;
  }

  function actionButtons(it: AssetRow): string {
    const id = esc(String(it.id || ''));
    const st = it.status || '';
    if (selectedSource === 'openxyos' || selectedKind === 'agent') {
      return '';
    }
    if (selectedSource === 'local') {
      if (st === 'discovered' || !st) {
        return `<button type="button" class="btn secondary pz-act" data-act="import" data-id="${id}">一键导入</button>
                <button type="button" class="btn primary pz-act" data-act="install" data-id="${id}">安装</button>`;
      }
      if (st === 'imported') {
        return `<button type="button" class="btn primary pz-act" data-act="install" data-id="${id}">安装</button>
                <span class="pz-badge">已导入</span>`;
      }
      if (st === 'installed' || st === 'disabled') {
        return `<button type="button" class="btn primary pz-act" data-act="enable" data-id="${id}">启用</button>
                <span class="pz-badge">${STATUS_LABEL[st] || st}</span>`;
      }
      if (st === 'enabled') {
        return `<button type="button" class="btn secondary pz-act" data-act="disable" data-id="${id}">停用</button>
                <span class="pz-badge">已启用</span>`;
      }
    }
    // studio tab
    if (st === 'imported') {
      return `<button type="button" class="btn primary pz-act" data-act="install" data-id="${id}">安装</button>`;
    }
    if (st === 'installed' || st === 'disabled') {
      return `<button type="button" class="btn primary pz-act" data-act="enable" data-id="${id}">启用</button>
              <button type="button" class="btn secondary pz-act" data-act="disable" data-id="${id}">停用</button>`;
    }
    if (st === 'enabled') {
      return `<button type="button" class="btn secondary pz-act" data-act="disable" data-id="${id}">停用</button>`;
    }
    return '';
  }

  function renderRows(items: AssetRow[]): void {
    if (!items.length) {
      showEmpty();
      return;
    }
    emptyEl.hidden = true;
    assetListEl.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'pz-asset-row';
      row.setAttribute('role', 'listitem');
      const origin =
        ORIGIN_LABEL[String(it.originApp || '')] || it.originApp || '';
      const status = STATUS_LABEL[String(it.status || '')] || it.status || '';
      const pathShow = String(it.pathOrRef || '');
      row.innerHTML = `
        <div class="pz-asset-main">
          <div class="pz-asset-name">${esc(String(it.name || '未命名'))}</div>
          <div class="pz-asset-meta">
            ${origin ? `<span class="pz-chip">${esc(origin)}</span>` : ''}
            ${status ? `<span class="pz-chip">${esc(status)}</span>` : ''}
            ${it.version ? `<span class="pz-chip">v${esc(String(it.version))}</span>` : ''}
          </div>
          ${it.description ? `<div class="pz-asset-desc">${esc(String(it.description))}</div>` : ''}
          ${pathShow ? `<div class="pz-asset-path" title="${esc(pathShow)}">来源：${esc(pathShow)}</div>` : ''}
        </div>
        <div class="pz-asset-actions">${actionButtons(it)}</div>
      `;
      assetListEl.appendChild(row);
    }
    assetListEl.querySelectorAll('.pz-act').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLButtonElement;
        const act = el.dataset.act || '';
        const id = el.dataset.id || '';
        void onAction(act, id);
      });
    });
  }

  async function onAction(act: string, id: string): Promise<void> {
    if (!id || loading) return;
    loading = true;
    setStatus('处理中…');
    try {
      let res: { ok?: boolean; message?: string; asset?: unknown } | undefined;
      if (act === 'import') {
        res = await window.xyai?.personalizeImport?.({ id });
      } else if (act === 'install') {
        res = await window.xyai?.personalizeInstall?.({ id });
      } else if (act === 'enable') {
        res = await window.xyai?.personalizeSetEnabled?.({ id, enabled: true });
      } else if (act === 'disable') {
        res = await window.xyai?.personalizeSetEnabled?.({
          id,
          enabled: false,
        });
      }
      if (res && res.ok === false) {
        setStatus(res.message || '操作失败');
      } else {
        setStatus(
          act === 'import'
            ? '已导入到 Studio'
            : act === 'install'
              ? '已安装'
              : act === 'enable'
                ? '已启用'
                : act === 'disable'
                  ? '已停用'
                  : '完成',
        );
      }
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      loading = false;
    }
  }

  async function refresh(): Promise<void> {
    const mod = MODULES.find((m) => m.kind === selectedKind) || MODULES[0];
    titleEl.textContent = mod.label;
    descEl.textContent = mod.desc;
    renderSourceTabs();
    scanBtn.hidden = selectedSource !== 'local' || selectedKind === 'agent';

    if (selectedSource === 'openxyos' || selectedKind === 'agent') {
      showEmpty();
      return;
    }

    try {
      if (selectedSource === 'local') {
        // Prefer scan IPC so discoveries are fresh; merge statuses via list
        const scanned = await window.xyai?.personalizeScan?.({
          kind: selectedKind,
        });
        const listed = await window.xyai?.personalizeList?.({
          kind: selectedKind,
          source: 'local',
        });
        const items =
          (listed?.items as AssetRow[]) ||
          (scanned?.items as AssetRow[]) ||
          [];
        renderRows(items);
        if (scanned && typeof scanned.scannedAt === 'string') {
          const n = items.length;
          if (!statusMsg || statusMsg === '处理中…') {
            setStatus(
              n
                ? `本机发现 ${n} 项（只读扫描，默认不启用）`
                : '本机扫描完成，未发现资产',
            );
          }
        }
        return;
      }

      const list = await window.xyai?.personalizeList?.({
        kind: selectedKind,
        source: selectedSource,
      });
      renderRows((list?.items as AssetRow[]) || []);
    } catch {
      showEmpty();
    }
  }

  scanBtn.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    setStatus('正在扫描本机…');
    selectedSource = 'local';
    try {
      const scanned = await window.xyai?.personalizeScan?.({
        kind: selectedKind,
      });
      const n = Array.isArray(scanned?.items) ? scanned!.items.length : 0;
      setStatus(
        n
          ? `扫描完成：发现 ${n} 项（只读，来源路径已展示）`
          : '扫描完成：未发现资产（未安装对应 AI 软件时属正常）',
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      loading = false;
    }
  });

  renderModules();
  void refresh();

  return {
    refresh: () => refresh(),
  };
}
