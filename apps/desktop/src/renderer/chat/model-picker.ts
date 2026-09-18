/**
 * ModelPicker — ONE chip + ONE panel; groups「本地已注册」+「Codex」.
 * Selecting writes modelRef (settings.modelId) via setSettings; applies to next send.
 *
 * Panel is portaled to document.body with fixed positioning under the chip so it
 * is never clipped by .composer / .chat-center / right-sidebar stacking.
 */

import type { ModelOption, XyaiStatus } from './types.js';
import { openCustomProviderModal } from './custom-provider-modal.js';

export type ModelPickerApi = {
  applyStatus: (st: XyaiStatus) => void;
  getSelectedId: () => string;
  wire: () => void;
  close: () => void;
};

function labelFor(
  id: string,
  local: ModelOption[],
  codex: ModelOption[],
): string {
  const hit =
    local.find((m) => m.id === id) || codex.find((m) => m.id === id);
  return hit?.label || id || '选择模型';
}

export function createModelPicker(opts: {
  chipBtn: HTMLButtonElement;
  chipLabel: HTMLElement;
  panel: HTMLElement;
  panelBody: HTMLElement;
  searchInput: HTMLInputElement | null;
}): ModelPickerApi {
  const { chipBtn, chipLabel, panel, panelBody, searchInput } = opts;
  let localModels: ModelOption[] = [];
  let codexModels: ModelOption[] = [];
  let selectedId = '';
  let open = false;
  let wired = false;
  let homeParent: HTMLElement | null = null;

  function positionPanel(): void {
    const rect = chipBtn.getBoundingClientRect();
    const width = Math.min(360, Math.max(280, window.innerWidth - 24));
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    // Prefer open upward from chip (composer sits at bottom)
    const maxH = Math.min(320, Math.max(160, window.innerHeight - 24));
    let top = rect.top - 8 - maxH;
    let maxHeight = maxH;
    if (top < 8) {
      // Not enough room above — open downward
      top = rect.bottom + 8;
      maxHeight = Math.min(320, window.innerHeight - top - 8);
    } else {
      // Keep bottom of panel just above chip
      top = Math.max(8, rect.top - 8 - Math.min(maxH, panel.scrollHeight || maxH));
      // Recompute using maxHeight so panel sits above chip
      const h = Math.min(maxH, 320);
      top = rect.top - 8 - h;
      if (top < 8) top = 8;
      maxHeight = Math.min(h, rect.top - 16);
    }
    panel.style.position = 'fixed';
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(8, top))}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.maxHeight = `${Math.round(Math.max(120, maxHeight))}px`;
    panel.style.zIndex = '5000';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function ensurePortaled(): void {
    if (!homeParent) homeParent = panel.parentElement;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    panel.classList.add('model-panel-portaled');
  }

  function restoreHome(): void {
    panel.classList.remove('model-panel-portaled');
    panel.style.position = '';
    panel.style.left = '';
    panel.style.top = '';
    panel.style.width = '';
    panel.style.maxHeight = '';
    panel.style.zIndex = '';
    panel.style.right = '';
    panel.style.bottom = '';
    if (homeParent && panel.parentElement === document.body) {
      homeParent.appendChild(panel);
    }
  }

  function setOpen(next: boolean): void {
    open = next;
    chipBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      ensurePortaled();
      panel.hidden = false;
      positionPanel();
      searchInput?.focus();
      requestAnimationFrame(() => positionPanel());
    } else {
      panel.hidden = true;
      restoreHome();
    }
  }

  function close(): void {
    setOpen(false);
  }

  function renderPanel(filter = ''): void {
    const q = filter.trim().toLowerCase();
    panelBody.innerHTML = '';

    const addGroup = (title: string, items: ModelOption[]) => {
      const filtered = q
        ? items.filter(
            (m) =>
              m.label.toLowerCase().includes(q) ||
              m.id.toLowerCase().includes(q),
          )
        : items;
      if (!filtered.length && items.length === 0) return;
      if (!filtered.length) return;

      const group = document.createElement('div');
      group.className = 'model-group';
      const h = document.createElement('div');
      h.className = 'model-group-title';
      h.textContent = title;
      group.appendChild(h);

      for (const item of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className =
          'model-option' + (item.id === selectedId ? ' selected' : '');
        row.setAttribute('role', 'option');
        row.dataset.modelId = item.id;
        row.setAttribute(
          'aria-selected',
          item.id === selectedId ? 'true' : 'false',
        );
        const name = document.createElement('span');
        name.className = 'model-option-label';
        name.textContent = item.label;
        const idHint = document.createElement('span');
        idHint.className = 'model-option-id';
        idHint.textContent = item.id;
        row.appendChild(name);
        row.appendChild(idHint);
        group.appendChild(row);
      }
      panelBody.appendChild(group);
    };

    addGroup('本地已注册', localModels);
    addGroup('Codex', codexModels);

    if (!panelBody.children.length) {
      const empty = document.createElement('div');
      empty.className = 'model-panel-empty';
      empty.textContent = q ? '无匹配模型' : '暂无可用模型';
      panelBody.appendChild(empty);
    }


    const footer = document.createElement('div');
    footer.className = 'model-panel-footer';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'model-add-btn';
    addBtn.textContent = '+ 添加模型';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      void openAddCustomProvider();
    });
    footer.appendChild(addBtn);
    panelBody.appendChild(footer);
  }

  async function selectModel(id: string): Promise<void> {
    if (!id || id === selectedId) {
      close();
      return;
    }
    selectedId = id;
    chipLabel.textContent = labelFor(id, localModels, codexModels);
    chipBtn.title = id;
    renderPanel(searchInput?.value || '');
    close();
    try {
      await window.xyai.setSettings?.({ modelId: id });
    } catch {
      /* ignore; chip still shows selection for next send attempt */
    }
  }

  function applyStatus(st: XyaiStatus): void {
    localModels = st.localModels || [];
    codexModels = st.models || [];
    selectedId = st.modelId || selectedId;
    chipLabel.textContent = labelFor(selectedId, localModels, codexModels);
    chipBtn.title = selectedId || '';
    if (open) {
      renderPanel(searchInput?.value || '');
      positionPanel();
    }
  }


  async function openAddCustomProvider(): Promise<void> {
    const outcome = await openCustomProviderModal({
      onTest: async (draft) => {
        const res = await window.xyai.testCustomProvider?.(draft);
        return res || { ok: false, message: '测试接口不可用' };
      },
      onFetchModels: async (draft) => {
        const res = await window.xyai.fetchCustomProviderModels?.(draft);
        return (
          res || { ok: false, message: '获取模型接口不可用', models: [] }
        );
      },
    });
    if (outcome.action !== 'save') return;
    try {
      const cur = await window.xyai.getSettings?.();
      const existing = cur?.settings?.customProviders || [];
      const next = [
        ...existing.filter((p) => p.id !== outcome.provider.id),
        outcome.provider,
      ];
      const saved = await window.xyai.setSettings?.({ customProviders: next });
      const st = saved?.status;
      if (st) applyStatus(st);
      // auto-select first model of new provider
      const first = outcome.provider.models[0];
      if (first) {
        const ref = `custom:${outcome.provider.id}/${first.id}`;
        await selectModel(ref);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function wire(): void {
    if (wired) return;
    wired = true;

    chipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open) {
        close();
      } else {
        renderPanel(searchInput?.value || '');
        setOpen(true);
      }
    });

    panelBody.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement | null)?.closest(
        'button.model-option',
      ) as HTMLElement | null;
      if (t?.dataset.modelId) {
        void selectModel(t.dataset.modelId);
      }
    });

    searchInput?.addEventListener('input', () => {
      renderPanel(searchInput.value);
      if (open) positionPanel();
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        chipBtn.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!open) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (chipBtn.contains(t) || panel.contains(t)) return;
      close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) close();
    });

    window.addEventListener(
      'resize',
      () => {
        if (open) positionPanel();
      },
      { passive: true },
    );
    window.addEventListener(
      'scroll',
      () => {
        if (open) positionPanel();
      },
      { passive: true, capture: true },
    );
  }

  return {
    applyStatus,
    getSelectedId: () => selectedId,
    wire,
    close,
  };
}