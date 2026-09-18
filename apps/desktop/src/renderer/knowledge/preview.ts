/**
 * Knowledge file preview pane — 简介 + 原文/预览 (office-style).
 */

import type { KbPreviewResult } from '../xyai-api.js';

export type PreviewSelection = {
  path: string;
  relativePath: string;
  ext: string;
  sizeBytes: number;
  parseStatusText: string;
};

export type KnowledgePreviewApi = {
  root: HTMLElement;
  setEmpty: () => void;
  setLoading: (sel: PreviewSelection) => void;
  render: (sel: PreviewSelection, result: KbPreviewResult) => void;
  clearBlob: () => void;
};

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

export function mountKnowledgePreview(container: HTMLElement): KnowledgePreviewApi {
  let blobUrl: string | null = null;

  container.innerHTML = `
    <div class="kb-preview-pane card">
      <div class="kb-preview-empty" id="kb-preview-empty">点击左侧文件名预览</div>
      <div class="kb-preview-body" id="kb-preview-body" hidden>
        <header class="kb-preview-header" id="kb-preview-header"></header>
        <div class="kb-preview-tabs" role="tablist">
          <button type="button" class="kb-preview-tab active" data-tab="intro" role="tab" aria-selected="true">简介</button>
          <button type="button" class="kb-preview-tab" data-tab="source" role="tab" aria-selected="false">原文/预览</button>
        </div>
        <div class="kb-preview-panels">
          <div class="kb-preview-panel active" id="kb-preview-intro" role="tabpanel"></div>
          <div class="kb-preview-panel" id="kb-preview-source" role="tabpanel" hidden></div>
        </div>
      </div>
    </div>
  `;

  const emptyEl = container.querySelector('#kb-preview-empty') as HTMLElement;
  const bodyEl = container.querySelector('#kb-preview-body') as HTMLElement;
  const headerEl = container.querySelector('#kb-preview-header') as HTMLElement;
  const introEl = container.querySelector('#kb-preview-intro') as HTMLElement;
  const sourceEl = container.querySelector('#kb-preview-source') as HTMLElement;
  const tabs = container.querySelectorAll('.kb-preview-tab');

  function clearBlob(): void {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }

  function showTab(name: 'intro' | 'source'): void {
    tabs.forEach((t) => {
      const btn = t as HTMLButtonElement;
      const on = btn.dataset.tab === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    introEl.hidden = name !== 'intro';
    sourceEl.hidden = name !== 'source';
    introEl.classList.toggle('active', name === 'intro');
    sourceEl.classList.toggle('active', name === 'source');
  }

  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const name = (t as HTMLButtonElement).dataset.tab;
      if (name === 'intro' || name === 'source') showTab(name);
    });
  });

  function renderHeader(sel: PreviewSelection, extra?: string): void {
    headerEl.innerHTML = `
      <div class="kb-preview-title" title="${escapeHtml(sel.path)}">${escapeHtml(sel.relativePath)}</div>
      <div class="kb-preview-meta meta">
        <span>${escapeHtml(sel.ext || '—')}</span>
        <span>·</span>
        <span>${formatSize(sel.sizeBytes)}</span>
        <span>·</span>
        <span>${escapeHtml(sel.parseStatusText || '—')}</span>
        ${extra ? `<span>·</span><span>${escapeHtml(extra)}</span>` : ''}
      </div>
    `;
  }

  function setChrome(empty: boolean): void {
    emptyEl.hidden = !empty;
    bodyEl.hidden = empty;
    emptyEl.style.display = empty ? '' : 'none';
    bodyEl.style.display = empty ? 'none' : '';
  }

  function setEmpty(): void {
    clearBlob();
    setChrome(true);
    introEl.innerHTML = '';
    sourceEl.innerHTML = '';
  }

  function setLoading(sel: PreviewSelection): void {
    clearBlob();
    setChrome(false);
    renderHeader(sel);
    introEl.innerHTML = '<div class="meta">加载简介…</div>';
    sourceEl.innerHTML = '<div class="meta">加载预览…</div>';
    showTab('source');
  }

  function render(sel: PreviewSelection, result: KbPreviewResult): void {
    clearBlob();
    setChrome(false);
    const size = result.sizeBytes || sel.sizeBytes;
    renderHeader(
      { ...sel, sizeBytes: size, ext: result.ext || sel.ext },
      result.warn || result.message,
    );

    if (result.summary && result.summary.trim()) {
      introEl.innerHTML = `<div class="kb-preview-summary">${escapeHtml(result.summary).replace(/\n/g, '<br/>')}</div>`;
    } else {
      introEl.innerHTML =
        '<div class="meta">暂无简介。完成「开始解析」后，将显示本地模型静默摘要或首段提取。</div>';
    }

    if (!result.ok && result.kind === 'error') {
      sourceEl.innerHTML = `<div class="kb-preview-error">${escapeHtml(result.message || '预览失败')}</div>`;
      showTab('source');
      return;
    }

    if (result.kind === 'pdf') {
      const openBtn = result.openPath
        ? `<div class="kb-preview-actions"><button type="button" class="kb-preview-open-sys" data-path="${escapeHtml(result.openPath)}">用系统默认应用打开</button></div>`
        : '';
      const wireOpen = () => {
        const btn = sourceEl.querySelector('.kb-preview-open-sys') as HTMLButtonElement | null;
        btn?.addEventListener('click', () => {
          const p = btn.getAttribute('data-path') || result.openPath || '';
          if (p && window.xyai?.kbOpenCitation) {
            void window.xyai.kbOpenCitation({ sourcePath: p });
          }
        });
      };
      if (result.previewUrl) {
        sourceEl.innerHTML =
          `<div class="kb-preview-pdf-wrap">` +
          `<iframe class="kb-preview-pdf" title="PDF 预览" src="${escapeHtml(result.previewUrl)}"></iframe>` +
          openBtn +
          `</div>`;
        wireOpen();
        showTab('source');
        return;
      }
      if (result.base64) {
        try {
          const binary = atob(result.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], {
            type: result.mime || 'application/pdf',
          });
          blobUrl = URL.createObjectURL(blob);
          sourceEl.innerHTML =
            `<div class="kb-preview-pdf-wrap">` +
            `<iframe class="kb-preview-pdf" title="PDF 预览" src="${blobUrl}"></iframe>` +
            openBtn +
            `</div>`;
          wireOpen();
        } catch {
          sourceEl.innerHTML =
            `<div class="kb-preview-error">PDF 预览解码失败</div>${openBtn}`;
          wireOpen();
        }
        showTab('source');
        return;
      }
      sourceEl.innerHTML =
        `<div class="kb-preview-error">无法加载 PDF 预览</div>${openBtn}`;
      wireOpen();
      showTab('source');
      return;
    }

    if (result.html) {
      sourceEl.innerHTML = `<div class="kb-preview-html">${result.html}</div>`;
      showTab('source');
      return;
    }

    if (result.text) {
      sourceEl.innerHTML = `<pre class="kb-preview-pre">${escapeHtml(result.text)}</pre>`;
      showTab('source');
      return;
    }

    sourceEl.innerHTML =
      '<div class="meta">无法生成预览</div>';
    showTab('source');
  }

  setEmpty();

  return {
    root: container,
    setEmpty,
    setLoading,
    render,
    clearBlob,
  };
}
