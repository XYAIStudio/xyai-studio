/**
 * 知识库 subtab — mounts, tree/file list, Chinese parse statuses, distill, cloud.
 */

import type {
  KbMount,
  KnowledgeStoresState,
  KbParseableFile,
} from '../xyai-api.js';
import {
  mountKnowledgePreview,
  type PreviewSelection,
} from './preview.js';

type ParseJobLike = {
  kbId: string;
  running: boolean;
  stopRequested: boolean;
  total: number;
  completed: number;
  failed: number;
  warned: number;
  currentFile: string | null;
  files?: { path: string; relativePath?: string; status: string; message?: string }[];
  ollamaAvailable?: boolean;
  embedModel?: string | null;
  chatModel?: string | null;
  statusMessage?: string | null;
};

type SkippedFile = { path: string; reason: string };

export type KnowledgePanelApi = {
  refresh: () => Promise<void>;
  getMountedKbs: () => KbMount[];
};

/** Normalize path separators for Windows/Unix job↔file matching. */
function normPathKey(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/** Locked Chinese labels for the parse column. */
function mapParseStatus(input: {
  jobStatus?: string;
  indexed?: boolean;
  unsupported?: boolean;
  isCurrent?: boolean;
}): { text: string; cls: string } {
  if (input.unsupported) return { text: '无法解析', cls: 'kb-st-failed' };
  const st = input.jobStatus;
  if (st === 'progress' || (input.isCurrent && (!st || st === 'queued'))) {
    return { text: '正在解析', cls: 'kb-st-progress' };
  }
  if (st === 'done' || st === 'warn') return { text: '已解析', cls: 'kb-st-done' };
  if (st === 'failed') return { text: '无法解析', cls: 'kb-st-failed' };
  if (st === 'queued' || st === 'skipped') return { text: '待解析', cls: 'kb-st-queued' };
  if (input.indexed) return { text: '已解析', cls: 'kb-st-done' };
  return { text: '待解析', cls: 'kb-st-queued' };
}

export function mountKnowledgePanel(root: HTMLElement): KnowledgePanelApi {
  let state: KnowledgeStoresState = {
    version: 1,
    mounts: [],
    defaultIndexRoot: '',
  };
  let selectedId: string | null = null;
  let files: KbParseableFile[] = [];
  let skipped: SkippedFile[] = [];
  let indexedRelativePaths = new Set<string>();
  let cloudFiles: {
    id: string;
    name: string;
    path: string;
    url?: string;
    mock?: boolean;
  }[] = [];
  let cloudNote = '';
  let job: ParseJobLike | null = null;
  let unsubProgress: (() => void) | null = null;

  root.innerHTML = `
    <div class="kb-layout">
      <aside class="kb-sidebar card">
        <div class="kb-sidebar-top">
          <h2>已挂接</h2>
          <div class="kb-actions">
            <button type="button" class="primary" id="kb-btn-mount-local">挂接本机目录</button>
            <button type="button" id="kb-btn-mount-ima">挂接 ima</button>
            <button type="button" id="kb-btn-mount-http">挂接 HTTP API</button>
          </div>
        </div>
        <div id="kb-mount-list" class="kb-mount-list" role="list"></div>
        <div class="kb-sidebar-bottom">
          <div class="kb-index-dir">
            <label>默认索引目录
              <input type="text" id="kb-index-root" readonly />
            </label>
            <button type="button" id="kb-btn-pick-index">选择索引目录</button>
          </div>
          <p class="hint">源文件只读；索引只写入上方目录下的 &lt;kbId&gt;/。未设置时默认使用 userData 知识库索引目录，不阻塞列目录。</p>
        </div>
      </aside>
      <section class="kb-main">
        <div class="card kb-toolbar">
          <div id="kb-selected-title" class="kb-selected-title">选择左侧知识库</div>
          <div class="kb-toolbar-actions">
            <button type="button" id="kb-btn-refresh-files">刷新文件</button>
            <button type="button" class="primary" id="kb-btn-start-parse">开始解析</button>
            <button type="button" id="kb-btn-stop-parse">停止解析</button>
            <button type="button" id="kb-btn-save-distill">蒸馏成果保存</button>
            <button type="button" id="kb-btn-push-biz">推送到业务空间</button>
            <button type="button" id="kb-btn-unmount">卸载</button>
          </div>
          <div id="kb-parse-status" class="kb-parse-status meta"></div>
        </div>
        <div class="kb-workspace">
          <div class="card kb-files-pane">
            <h2>可解析文件</h2>
            <div id="kb-file-table" class="kb-file-table"></div>
          </div>
          <div class="kb-split-handle" id="kb-split-handle" title="拖动调整预览宽度" role="separator" aria-orientation="vertical"></div>
          <div id="kb-preview-root" class="kb-preview-root"></div>
        </div>
      </section>
    </div>
  `;

  const mountListEl = root.querySelector('#kb-mount-list') as HTMLElement;
  const indexRootInput = root.querySelector('#kb-index-root') as HTMLInputElement;
  const selectedTitleEl = root.querySelector('#kb-selected-title') as HTMLElement;
  const fileTableEl = root.querySelector('#kb-file-table') as HTMLElement;
  const parseStatusEl = root.querySelector('#kb-parse-status') as HTMLElement;
  const previewRoot = root.querySelector('#kb-preview-root') as HTMLElement;
  const preview = mountKnowledgePreview(previewRoot);
  const workspaceEl = root.querySelector('.kb-workspace') as HTMLElement;
  let selectedFilePath: string | null = null;
  let previewSeq = 0;

  function wireSplit(): void {
    const handle = root.querySelector('#kb-split-handle') as HTMLElement | null;
    if (!handle || !workspaceEl) return;
    let dragging = false;
    handle.addEventListener('pointerdown', (ev) => {
      dragging = true;
      handle.setPointerCapture((ev as PointerEvent).pointerId);
      document.body.classList.add('kb-splitting');
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const rect = workspaceEl.getBoundingClientRect();
      const x = (ev as PointerEvent).clientX - rect.left;
      const pct = Math.min(72, Math.max(28, (x / rect.width) * 100));
      workspaceEl.style.gridTemplateColumns = `minmax(180px, ${pct}%) 6px minmax(200px, 1fr)`;
    });
    const end = () => {
      dragging = false;
      document.body.classList.remove('kb-splitting');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  wireSplit();

  async function loadPreview(sel: PreviewSelection): Promise<void> {
    const m = selected();
    if (!m || m.kind !== 'local' || !window.xyai.kbPreviewFile) {
      preview.setEmpty();
      return;
    }
    selectedFilePath = sel.path;
    const seq = ++previewSeq;
    preview.setLoading(sel);
    try {
      const result = await window.xyai.kbPreviewFile({
        kbId: m.id,
        path: sel.path,
        relativePath: sel.relativePath,
        parseStatus: sel.parseStatusText,
      });
      if (seq !== previewSeq || selectedFilePath !== sel.path) return;
      preview.render(sel, result);
    } catch (err) {
      if (seq !== previewSeq) return;
      preview.render(sel, {
        ok: false,
        kind: 'error',
        filename: sel.relativePath,
        relativePath: sel.relativePath,
        ext: sel.ext,
        sizeBytes: sel.sizeBytes,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function selected(): KbMount | undefined {
    return state.mounts.find((m) => m.id === selectedId);
  }

  function renderMounts(): void {
    mountListEl.innerHTML = '';
    if (!state.mounts.length) {
      mountListEl.innerHTML = '<div class="meta">尚未挂接知识库</div>';
      return;
    }
    for (const m of state.mounts) {
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('role', 'listitem');
      row.className =
        'kb-mount-item' +
        (m.id === selectedId ? ' active' : '') +
        (m.kind === 'local' ? ' is-local' : ' is-cloud');
      const providerLabel =
        m.provider === 'ima' ? 'ima' : m.provider === 'http' ? 'http' : m.provider || '云';
      const tag =
        m.kind === 'local'
          ? '<span class="kb-tag kb-tag-local">本机</span>'
          : `<span class="kb-tag kb-tag-cloud">云·${escapeHtml(providerLabel)}</span>`;
      const sub =
        m.kind === 'local'
          ? escapeHtml(m.sourceRoot || '')
          : escapeHtml(
              m.provider === 'ima'
                ? '腾讯 ima 知识库'
                : m.provider === 'http'
                  ? 'HTTP API 知识库'
                  : '云端知识库',
            );
      row.innerHTML = `<div class="kb-mount-top"><div class="kb-mount-name">${escapeHtml(m.name)}</div>${tag}</div>
        <div class="meta kb-mount-sub" title="${sub}">${sub || '—'}</div>`;
      row.addEventListener('click', () => {
        if (selectedId !== m.id) {
          selectedId = m.id;
          // Parse banner / file statuses must belong to this kb only
          if (job && job.kbId !== m.id) job = null;
        }
        renderMounts();
        void refreshSelection();
      });
      mountListEl.appendChild(row);
    }
  }

  function renderFiles(): void {
    fileTableEl.innerHTML = '';
    const m = selected();
    if (!m) {
      fileTableEl.innerHTML = '<div class="meta">—</div>';
      return;
    }
    if (m.kind === 'cloud') {
      if (cloudNote) {
        const note = document.createElement('div');
        note.className = 'hint';
        note.textContent = cloudNote;
        fileTableEl.appendChild(note);
      }
      if (!cloudFiles.length) {
        fileTableEl.appendChild(elMeta('无远程文件'));
        return;
      }
      for (const f of cloudFiles) {
        const row = document.createElement('div');
        row.className = 'list-item';
        const tag = f.mock
          ? '<span class="chip-stub">stub</span>'
          : '<span class="chip-cloud">云端</span>';
        row.innerHTML = `<div><div>${escapeHtml(f.name)} ${tag}</div>
          <div class="meta">${escapeHtml(f.path)}${f.url ? ' · ' + escapeHtml(f.url) : ''}</div></div>`;
        fileTableEl.appendChild(row);
      }
      return;
    }

    type Row = {
      path: string;
      relativePath: string;
      ext: string;
      sizeBytes: number;
      unsupported: boolean;
    };
    const jobFiles = job?.files || [];
    const statusByPath = new Map(
      jobFiles.map((f) => [normPathKey(f.path), f] as const),
    );
    const statusByRel = new Map(
      jobFiles
        .filter((f) => f.relativePath)
        .map((f) => [normPathKey(f.relativePath!), f] as const),
    );
    const currentRel = job?.currentFile
      ? normPathKey(job.currentFile)
      : '';
    const rows: Row[] = files.map((f) => ({
      path: f.path,
      relativePath: f.relativePath,
      ext: f.ext,
      sizeBytes: f.sizeBytes,
      unsupported: false,
    }));
    for (const s of skipped) {
      if (s.reason !== 'unsupported') continue;
      if (rows.some((r) => r.path === s.path)) continue;
      const base = s.path.split(/[/\\]/).pop() || s.path;
      const ext = base.includes('.') ? '.' + base.split('.').pop()!.toLowerCase() : '';
      const src = m.sourceRoot || '';
      let rel = base;
      if (src && s.path.startsWith(src)) {
        rel = s.path.slice(src.length).replace(/^[/\\]+/, '');
      }
      rows.push({
        path: s.path,
        relativePath: rel.replace(/\\/g, '/'),
        ext,
        sizeBytes: 0,
        unsupported: true,
      });
    }
    rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    if (!rows.length) {
      fileTableEl.appendChild(elMeta('未找到可解析文件'));
      return;
    }

    const dirs = new Set<string>();
    for (const r of rows) {
      const parts = r.relativePath.split('/');
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
        dirs.add(acc);
      }
    }
    const sortedDirs = [...dirs].sort((a, b) => a.localeCompare(b));
    if (sortedDirs.length) {
      const tree = document.createElement('div');
      tree.className = 'kb-tree';
      const head = document.createElement('div');
      head.className = 'kb-tree-head meta';
      head.textContent = '子目录';
      tree.appendChild(head);
      for (const d of sortedDirs) {
        const depth = d.split('/').length - 1;
        const el = document.createElement('div');
        el.className = 'kb-tree-dir';
        el.style.paddingLeft = `${8 + depth * 14}px`;
        el.textContent = '📁 ' + d;
        tree.appendChild(el);
      }
      fileTableEl.appendChild(tree);
    }

    const table = document.createElement('table');
    table.className = 'kb-table';
    table.innerHTML =
      '<thead><tr><th>相对路径</th><th>类型</th><th>大小</th><th>解析</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const f of rows) {
      const tr = document.createElement('tr');
      const st =
        statusByPath.get(normPathKey(f.path)) ||
        statusByRel.get(normPathKey(f.relativePath));
      const isCurrent =
        !!currentRel &&
        (normPathKey(f.relativePath) === currentRel ||
          normPathKey(f.path).endsWith('/' + currentRel) ||
          normPathKey(f.path) === currentRel);
      const mapped = mapParseStatus({
        jobStatus: st?.status,
        indexed: indexedRelativePaths.has(f.relativePath),
        unsupported: f.unsupported,
        isCurrent,
      });
      const msg = st?.message ? ' · ' + escapeHtml(st.message) : '';
      tr.className =
        'kb-file-row' +
        (selectedFilePath && normPathKey(selectedFilePath) === normPathKey(f.path)
          ? ' selected'
          : '');
      tr.dataset.path = f.path;
      tr.innerHTML = `<td class="kb-file-name" title="${escapeHtml(f.path)}"><button type="button" class="kb-file-link">${escapeHtml(f.relativePath)}</button></td>
        <td>${escapeHtml(f.ext || '—')}</td>
        <td>${f.unsupported ? '—' : formatSize(f.sizeBytes)}</td>
        <td class="${mapped.cls}">${escapeHtml(mapped.text)}${msg}</td>`;
      const openPreview = () => {
        if (f.unsupported) return;
        selectedFilePath = f.path;
        // highlight without full re-render of table contents
        tbody.querySelectorAll('.kb-file-row').forEach((r) => {
          r.classList.toggle(
            'selected',
            normPathKey((r as HTMLElement).dataset.path || '') ===
              normPathKey(f.path),
          );
        });
        void loadPreview({
          path: f.path,
          relativePath: f.relativePath,
          ext: f.ext,
          sizeBytes: f.sizeBytes,
          parseStatusText: mapped.text,
        });
      };
      tr.addEventListener('click', openPreview);
      tr.querySelector('.kb-file-link')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openPreview();
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    fileTableEl.appendChild(table);
  }

  function renderParseStatus(): void {
    const m = selected();
    if (!m) {
      parseStatusEl.textContent = '';
      selectedTitleEl.textContent = '选择左侧知识库';
      return;
    }
    selectedTitleEl.textContent =
      m.name +
      (m.kind === 'local'
        ? ` · ${m.sourceRoot || ''}`
        : ` · ${m.provider || 'cloud'}`);
    if (!job || job.kbId !== m.id) {
      parseStatusEl.textContent =
        m.kind === 'local'
          ? '解析：未开始（需本地 Ollama 对话/嵌入模型；将用最快本地模型静默解析）'
          : '云端列表 · 解析索引为后续能力';
      return;
    }
    if (job.statusMessage && !job.running) {
      parseStatusEl.textContent = job.statusMessage;
      return;
    }
    const pct =
      job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
    const modelBanner = job.chatModel
      ? `正在用本地模型 ${job.chatModel} 静默解析` +
        (job.embedModel ? `（嵌入：${job.embedModel}）` : '')
      : job.embedModel
        ? `正在用本地嵌入模型 ${job.embedModel} 解析`
        : job.statusMessage || '';
    parseStatusEl.textContent = job.running
      ? `${modelBanner || '解析中'} · ${job.completed}/${job.total}（${pct}%）${job.currentFile ? ' · ' + job.currentFile : ''}${job.stopRequested ? ' · 停止中（完成当前文件）' : ''}`
      : job.statusMessage ||
        `解析结束 · 完成 ${job.completed} · 失败 ${job.failed} · 警告 ${job.warned}`;
  }

  async function refresh(): Promise<void> {
    if (!window.xyai.kbGetState) return;
    state = await window.xyai.kbGetState();
    indexRootInput.value = state.defaultIndexRoot || '';
    if (selectedId && !state.mounts.some((m) => m.id === selectedId)) {
      selectedId = null;
    }
    if (!selectedId && state.mounts[0]) selectedId = state.mounts[0].id;
    renderMounts();
    await refreshSelection();
  }

  async function refreshSelection(): Promise<void> {
    files = [];
    skipped = [];
    indexedRelativePaths = new Set();
    cloudFiles = [];
    cloudNote = '';
    selectedFilePath = null;
    previewSeq += 1;
    preview.setEmpty();
    const m = selected();
    if (!m) {
      renderFiles();
      renderParseStatus();
      return;
    }
    if (m.kind === 'local' && window.xyai.kbListFiles) {
      const res = await window.xyai.kbListFiles(m.id);
      files = res.files || [];
      skipped = res.skipped || [];
      indexedRelativePaths = new Set(res.indexedRelativePaths || []);
      if (res.statusTip) {
        parseStatusEl.textContent = res.statusTip;
      }
      if (window.xyai.kbParseJob) {
        job = (await window.xyai.kbParseJob(m.id)) as ParseJobLike | null;
      }
    } else if (m.kind === 'cloud' && window.xyai.kbListCloud) {
      const res = await window.xyai.kbListCloud(m.id);
      cloudFiles = res.files || [];
      cloudNote = [
        res.stub ? '（stub/mock — 未走真实 API）' : '',
        res.message || '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    renderFiles();
    renderParseStatus();
  }

  function wireProgress(): void {
    unsubProgress?.();
    unsubProgress =
      window.xyai.onKbParseProgress?.((raw) => {
        const j = raw as ParseJobLike;
        if (j.kbId !== selectedId) return;
        job = j;
        renderParseStatus();
        renderFiles();
      }) || null;
  }

  async function selectNewestMount(beforeIds: Set<string>): Promise<void> {
    await refresh();
    const created = state.mounts.find((x) => !beforeIds.has(x.id));
    if (created) {
      selectedId = created.id;
      renderMounts();
      await refreshSelection();
    }
  }

  root.querySelector('#kb-btn-mount-local')?.addEventListener('click', () => {
    void (async () => {
      const pick = await window.xyai.kbPickDirectory?.('选择要挂接的本机目录');
      if (!pick?.ok || !pick.path) return;
      const beforeIds = new Set(state.mounts.map((x) => x.id));
      await window.xyai.kbMountLocal?.({
        sourceRoot: pick.path,
        indexRoot: state.defaultIndexRoot || undefined,
      });
      await selectNewestMount(beforeIds);
    })();
  });

  root.querySelector('#kb-btn-pick-index')?.addEventListener('click', () => {
    void (async () => {
      const pick = await window.xyai.kbPickDirectory?.('选择默认索引目录');
      if (!pick?.ok || !pick.path) return;
      const res = await window.xyai.kbSetIndexDir?.({ indexRoot: pick.path });
      if (res && res.ok === false) {
        alert(res.message || '索引目录不能设在知识库源文件夹内');
        return;
      }
      await refresh();
    })();
  });

  root.querySelector('#kb-btn-mount-ima')?.addEventListener('click', () => {
    const beforeIds = new Set(state.mounts.map((x) => x.id));
    openImaMountDialog(async () => {
      await selectNewestMount(beforeIds);
    });
  });

  root.querySelector('#kb-btn-mount-http')?.addEventListener('click', () => {
    const beforeIds = new Set(state.mounts.map((x) => x.id));
    openHttpMountDialog(async () => {
      await selectNewestMount(beforeIds);
    });
  });

  root.querySelector('#kb-btn-refresh-files')?.addEventListener('click', () => {
    void refreshSelection();
  });

  root.querySelector('#kb-btn-start-parse')?.addEventListener('click', () => {
    void (async () => {
      let m = selected();
      if (!m || m.kind !== 'local') {
        const firstLocal = state.mounts.find((x) => x.kind === 'local');
        if (firstLocal) {
          selectedId = firstLocal.id;
          renderMounts();
          await refreshSelection();
          m = firstLocal;
        }
      }
      if (!m || m.kind !== 'local') {
        alert('请先挂接本机知识库后再解析');
        return;
      }
      parseStatusEl.textContent = '开始解析…（探测本地 Ollama 模型）';
      const res = await window.xyai.kbStartParse?.(m.id);
      if (res && typeof res === 'object' && res !== null && 'error' in res) {
        const err = String((res as { error: string }).error);
        parseStatusEl.textContent = err;
        alert(err);
        return;
      }
      job = res as ParseJobLike;
      if (job?.statusMessage) {
        parseStatusEl.textContent = job.statusMessage;
      }
      renderParseStatus();
      renderFiles();
    })();
  });

  root.querySelector('#kb-btn-stop-parse')?.addEventListener('click', () => {
    void (async () => {
      const m = selected();
      if (!m) return;
      job = (await window.xyai.kbStopParse?.(m.id)) as ParseJobLike | null;
      renderParseStatus();
    })();
  });

  root.querySelector('#kb-btn-save-distill')?.addEventListener('click', () => {
    void (async () => {
      const m = selected();
      if (!m || m.kind !== 'local') {
        alert('请选择本机知识库后再保存蒸馏成果');
        return;
      }
      const pick = await window.xyai.kbPickDirectory?.(
        '选择蒸馏成果保存目录（取消则不另存）',
      );
      if (!pick?.ok || !pick.path) {
        parseStatusEl.textContent =
          '已取消蒸馏另存；解析索引仍只写入索引目录。';
        return;
      }
      if (!window.xyai.kbSaveDistill) {
        alert('当前版本未暴露 kbSaveDistill');
        return;
      }
      parseStatusEl.textContent = '正在生成蒸馏成果…';
      const res = await window.xyai.kbSaveDistill(m.id, pick.path);
      parseStatusEl.textContent = res.ok
        ? `蒸馏已保存到 ${res.outDir || pick.path}${res.message ? ' · ' + res.message : ''}`
        : `蒸馏失败：${res.message || '未知错误'}`;
    })();
  });

  root.querySelector('#kb-btn-push-biz')?.addEventListener('click', () => {
    void (async () => {
      const m = selected();
      if (!m) {
        alert('请先选择知识库');
        return;
      }
      const res = await window.xyai.interopPushToBiz?.({
        kind: 'knowledge-mount',
        name: m.name,
        payload: {
          kbId: m.id,
          mountKind: m.kind,
          sourceRoot: m.kind === 'local' ? m.sourceRoot : undefined,
          indexRoot: m.indexRoot,
          provider: m.kind === 'cloud' ? m.provider : undefined,
        },
      });
      if (!res?.ok) {
        alert(res?.message || '推送失败');
        return;
      }
      parseStatusEl.textContent = `已推送到业务空间：${m.name}（待安装）`;
      alert(`已推送到业务空间：${m.name}\n可在业务空间「资产互通」中安装/选用`);
    })();
  });

  root.querySelector('#kb-btn-unmount')?.addEventListener('click', () => {
    void (async () => {
      const m = selected();
      if (!m) return;
      if (!confirm(`卸载「${m.name}」？索引文件不会自动删除。`)) return;
      await window.xyai.kbUnmount?.(m.id);
      selectedId = null;
      await refresh();
    })();
  });

  wireProgress();

  return {
    refresh,
    getMountedKbs: () => state.mounts.slice(),
  };
}

function openHttpMountDialog(onMounted: () => Promise<void>): void {
  document.getElementById('kb-http-modal-root')?.remove();
  const root = document.createElement('div');
  root.id = 'kb-http-modal-root';
  root.innerHTML = `
    <div class="collab-modal-backdrop" data-http-backdrop>
      <div class="collab-modal kb-ima-modal" role="dialog" aria-modal="true" aria-label="挂接 HTTP API">
        <div class="collab-modal-head">
          <h3>挂接 HTTP API</h3>
          <button type="button" class="collab-modal-close" data-http-close aria-label="关闭">×</button>
        </div>
        <div class="collab-modal-body">
          <p class="hint">填写远程文件列表 API。有 baseUrl 时真实拉取；仅勾选 stub 时使用模拟数据。</p>
          <label class="kb-ima-field">名称
            <input type="text" id="kb-http-name" value="HTTP 知识库" autocomplete="off" />
          </label>
          <label class="kb-ima-field">baseUrl
            <input type="text" id="kb-http-base-url" placeholder="https://api.example.com" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field">apiKey（可选）
            <input type="password" id="kb-http-api-key" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field">listPath（可选，默认 /files）
            <input type="text" id="kb-http-list-path" placeholder="/files" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field kb-ima-check">
            <input type="checkbox" id="kb-http-use-mock" />
            使用 stub / mock（不请求真实 API）
          </label>
          <div id="kb-http-error" class="kb-ima-error" hidden></div>
        </div>
        <div class="collab-modal-footer">
          <button type="button" data-http-close>取消</button>
          <button type="button" class="primary" id="kb-http-confirm">确认挂接</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const nameInput = root.querySelector('#kb-http-name') as HTMLInputElement;
  const baseUrlInput = root.querySelector('#kb-http-base-url') as HTMLInputElement;
  const apiKeyInput = root.querySelector('#kb-http-api-key') as HTMLInputElement;
  const listPathInput = root.querySelector('#kb-http-list-path') as HTMLInputElement;
  const useMockInput = root.querySelector('#kb-http-use-mock') as HTMLInputElement;
  const errEl = root.querySelector('#kb-http-error') as HTMLElement;

  const dismiss = (): void => {
    root.remove();
  };
  const showError = (msg: string): void => {
    errEl.hidden = !msg;
    errEl.textContent = msg;
  };

  root.querySelectorAll('[data-http-close]').forEach((el) => {
    el.addEventListener('click', () => dismiss());
  });
  root.querySelector('[data-http-backdrop]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) dismiss();
  });

  root.querySelector('#kb-http-confirm')?.addEventListener('click', () => {
    void (async () => {
      showError('');
      const name = nameInput.value.trim() || 'HTTP 知识库';
      const baseUrl = baseUrlInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      const listPath = listPathInput.value.trim();
      const useMock = useMockInput.checked;
      if (!useMock && !baseUrl) {
        showError('请填写 baseUrl，或勾选「使用 stub / mock」');
        return;
      }
      try {
        await window.xyai.kbMountCloud?.({
          name,
          provider: 'http',
          config: {
            baseUrl,
            apiKey,
            useMock,
            extra: listPath ? { listPath } : {},
          },
        });
        dismiss();
        await onMounted();
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    })();
  });
}

function openImaMountDialog(onMounted: () => Promise<void>): void {
  document.getElementById('kb-ima-modal-root')?.remove();
  const root = document.createElement('div');
  root.id = 'kb-ima-modal-root';
  root.innerHTML = `
    <div class="collab-modal-backdrop" data-ima-backdrop>
      <div class="collab-modal kb-ima-modal" role="dialog" aria-modal="true" aria-label="挂接 ima">
        <div class="collab-modal-head">
          <h3>挂接 ima</h3>
          <button type="button" class="collab-modal-close" data-ima-close aria-label="关闭">×</button>
        </div>
        <div class="collab-modal-body">
          <p class="hint">在 <a href="https://ima.qq.com/agent-interface" data-ima-portal>https://ima.qq.com/agent-interface</a> 获取 Client ID 与 API Key（凭证仅存本机 userData）</p>
          <label class="kb-ima-field">Client ID
            <input type="text" id="kb-ima-client-id" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field">API Key
            <input type="password" id="kb-ima-api-key" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field">Knowledge Base ID（可选，可先拉取列表再选）
            <input type="text" id="kb-ima-kb-id" autocomplete="off" spellcheck="false" />
          </label>
          <label class="kb-ima-field">显示名称（可选）
            <input type="text" id="kb-ima-name" placeholder="ima 知识库" autocomplete="off" />
          </label>
          <div class="kb-ima-list-actions">
            <button type="button" id="kb-ima-fetch-bases">拉取知识库列表</button>
          </div>
          <div id="kb-ima-base-list" class="kb-ima-base-list"></div>
          <div id="kb-ima-error" class="kb-ima-error" hidden></div>
        </div>
        <div class="collab-modal-footer">
          <button type="button" data-ima-close>取消</button>
          <button type="button" class="primary" id="kb-ima-confirm">确认挂接</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const clientIdInput = root.querySelector('#kb-ima-client-id') as HTMLInputElement;
  const apiKeyInput = root.querySelector('#kb-ima-api-key') as HTMLInputElement;
  const kbIdInput = root.querySelector('#kb-ima-kb-id') as HTMLInputElement;
  const nameInput = root.querySelector('#kb-ima-name') as HTMLInputElement;
  const baseList = root.querySelector('#kb-ima-base-list') as HTMLElement;
  const errEl = root.querySelector('#kb-ima-error') as HTMLElement;
  let selectedBaseTitle = '';

  function dismiss(): void {
    root.remove();
  }
  function showError(msg: string): void {
    errEl.hidden = !msg;
    errEl.textContent = msg;
  }

  root.querySelectorAll('[data-ima-close]').forEach((el) => {
    el.addEventListener('click', () => dismiss());
  });
  root.querySelector('[data-ima-backdrop]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) dismiss();
  });
  root.querySelector('[data-ima-portal]')?.addEventListener('click', (e) => {
    e.preventDefault();
    void window.xyai.openExternal?.('https://ima.qq.com/agent-interface');
  });

  root.querySelector('#kb-ima-fetch-bases')?.addEventListener('click', () => {
    void (async () => {
      showError('');
      baseList.innerHTML = '<div class="meta">拉取中…</div>';
      const clientId = clientIdInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      if (!clientId || !apiKey) {
        baseList.innerHTML = '';
        showError('请先填写 Client ID 与 API Key（https://ima.qq.com/agent-interface）');
        return;
      }
      if (!window.xyai.kbListImaBases) {
        baseList.innerHTML = '';
        showError('当前版本未暴露 kbListImaBases');
        return;
      }
      const res = await window.xyai.kbListImaBases({ clientId, apiKey, query: '' });
      if (!res.ok) {
        baseList.innerHTML = '';
        showError(res.message || '拉取失败');
        return;
      }
      if (!res.bases.length) {
        baseList.innerHTML = '<div class="meta">未返回知识库（空列表）</div>';
        return;
      }
      baseList.innerHTML = '';
      for (const b of res.bases) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'kb-ima-base-item' + (kbIdInput.value === b.id ? ' active' : '');
        btn.innerHTML = `<div class="kb-mount-name">${escapeHtml(b.title)}</div>
          <div class="meta">${escapeHtml(b.id)}</div>`;
        btn.addEventListener('click', () => {
          kbIdInput.value = b.id;
          selectedBaseTitle = b.title;
          baseList
            .querySelectorAll('.kb-ima-base-item')
            .forEach((n) => n.classList.remove('active'));
          btn.classList.add('active');
          showError('');
        });
        baseList.appendChild(btn);
      }
    })();
  });

  root.querySelector('#kb-ima-confirm')?.addEventListener('click', () => {
    void (async () => {
      showError('');
      const clientId = clientIdInput.value.trim();
      const apiKey = apiKeyInput.value.trim();
      const knowledgeBaseId = kbIdInput.value.trim();
      if (!clientId || !apiKey) {
        showError('请填写 Client ID 与 API Key（https://ima.qq.com/agent-interface）');
        return;
      }
      if (!knowledgeBaseId) {
        showError('请填写或从列表选择 Knowledge Base ID');
        return;
      }
      const name =
        nameInput.value.trim() ||
        selectedBaseTitle ||
        `ima · ${knowledgeBaseId}`;
      try {
        if (window.xyai.kbMountIma) {
          await window.xyai.kbMountIma({
            name,
            clientId,
            apiKey,
            knowledgeBaseId,
          });
        } else {
          await window.xyai.kbMountCloud?.({
            name,
            provider: 'ima',
            config: {
              clientId,
              apiKey,
              knowledgeBaseId,
              baseUrl: 'https://ima.qq.com/openapi/wiki/v1',
              useMock: false,
            },
          });
        }
        dismiss();
        await onMounted();
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    })();
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function elMeta(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'meta';
  d.textContent = text;
  return d;
}
