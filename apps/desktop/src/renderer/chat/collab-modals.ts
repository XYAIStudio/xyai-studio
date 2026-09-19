/**
 * Lightweight modal helpers for project / task / assign-work flows.
 */

import { DEV_AGENTS } from './agents.js';
import type { SessionKind } from './collab-types.js';

export type ProjectFormResult = { name: string; cwd: string } | null;
export type TaskFormResult = { name: string } | null;
export type AssignFormResult = {
  agentIds: string[];
  kind: SessionKind;
  groupName: string;
} | null;

function ensureModalRoot(): HTMLElement {
  let root = document.getElementById('collab-modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'collab-modal-root';
    document.body.appendChild(root);
  }
  return root;
}

function openShell(title: string): {
  root: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
} {
  const root = ensureModalRoot();
  root.innerHTML = '';
  root.hidden = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'collab-modal-backdrop';
  const panel = document.createElement('div');
  panel.className = 'collab-modal';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const head = document.createElement('div');
  head.className = 'collab-modal-head';
  const h = document.createElement('h3');
  h.textContent = title;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'collab-modal-close';
  x.textContent = '×';
  head.appendChild(h);
  head.appendChild(x);

  const body = document.createElement('div');
  body.className = 'collab-modal-body';
  const footer = document.createElement('div');
  footer.className = 'collab-modal-footer';

  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(footer);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  const close = (): void => {
    root.hidden = true;
    root.innerHTML = '';
  };
  x.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  return { root, body, footer, close };
}

export function promptProject(opts: {
  title: string;
  name?: string;
  cwd?: string;
  onBrowse?: () => Promise<string | null>;
}): Promise<ProjectFormResult> {
  return new Promise((resolve) => {
    const { body, footer, close } = openShell(opts.title);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'collab-field';
    nameLabel.innerHTML = '<span>项目名称</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = opts.name || '';
    nameInput.placeholder = '例如：官网改版';
    nameLabel.appendChild(nameInput);

    const cwdLabel = document.createElement('label');
    cwdLabel.className = 'collab-field';
    cwdLabel.innerHTML = '<span>本地工作目录</span>';
    const cwdRow = document.createElement('div');
    cwdRow.className = 'collab-cwd-row';
    const cwdInput = document.createElement('input');
    cwdInput.type = 'text';
    cwdInput.value = opts.cwd || '';
    cwdInput.placeholder = '/path/to/workdir';
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'ghost-btn';
    browse.textContent = '浏览…';
    cwdRow.appendChild(cwdInput);
    cwdRow.appendChild(browse);
    cwdLabel.appendChild(cwdRow);

    body.appendChild(nameLabel);
    body.appendChild(cwdLabel);

    browse.addEventListener('click', () => {
      void (async () => {
        if (!opts.onBrowse) return;
        const p = await opts.onBrowse();
        if (p) cwdInput.value = p;
      })();
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost-btn';
    cancel.textContent = '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = '保存';
    footer.appendChild(cancel);
    footer.appendChild(ok);

    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
    ok.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      close();
      resolve({ name, cwd: cwdInput.value.trim() });
    });
    nameInput.focus();
  });
}

export function promptTask(opts: {
  title: string;
  name?: string;
}): Promise<TaskFormResult> {
  return new Promise((resolve) => {
    const { body, footer, close } = openShell(opts.title);
    const nameLabel = document.createElement('label');
    nameLabel.className = 'collab-field';
    nameLabel.innerHTML = '<span>任务名称</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = opts.name || '';
    nameInput.placeholder = '例如：落地页文案';
    nameLabel.appendChild(nameInput);
    body.appendChild(nameLabel);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost-btn';
    cancel.textContent = '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = '保存';
    footer.appendChild(cancel);
    footer.appendChild(ok);

    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
    ok.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      close();
      resolve({ name });
    });
    nameInput.focus();
  });
}

export function promptAssignWork(opts: {
  taskName: string;
  defaultAgentId?: string;
}): Promise<AssignFormResult> {
  return new Promise((resolve) => {
    const { body, footer, close } = openShell(`安排工作 · ${opts.taskName}`);

    const agentsField = document.createElement('div');
    agentsField.className = 'collab-field';
    agentsField.innerHTML = '<span>选择智能体（可多选）</span>';
    const agentBox = document.createElement('div');
    agentBox.className = 'collab-agent-checks';
    for (const a of DEV_AGENTS) {
      const lab = document.createElement('label');
      lab.className = 'collab-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = a.id;
      cb.checked =
        !opts.defaultAgentId || a.id === opts.defaultAgentId || DEV_AGENTS.length === 1;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(` ${a.name}`));
      agentBox.appendChild(lab);
    }
    agentsField.appendChild(agentBox);

    const kindField = document.createElement('div');
    kindField.className = 'collab-field';
    kindField.innerHTML = '<span>会话类型</span>';
    const kindRow = document.createElement('div');
    kindRow.className = 'collab-kind-row';
    const dmLab = document.createElement('label');
    dmLab.className = 'collab-check';
    const dmRadio = document.createElement('input');
    dmRadio.type = 'radio';
    dmRadio.name = 'assign-kind';
    dmRadio.value = 'dm';
    dmRadio.checked = true;
    dmLab.appendChild(dmRadio);
    dmLab.appendChild(document.createTextNode(' 单聊（每位智能体各建一会话）'));
    const gLab = document.createElement('label');
    gLab.className = 'collab-check';
    const gRadio = document.createElement('input');
    gRadio.type = 'radio';
    gRadio.name = 'assign-kind';
    gRadio.value = 'group';
    gLab.appendChild(gRadio);
    gLab.appendChild(document.createTextNode(' 群聊（多智能体共享一会话）'));
    kindRow.appendChild(dmLab);
    kindRow.appendChild(gLab);
    kindField.appendChild(kindRow);

    const groupLabel = document.createElement('label');
    groupLabel.className = 'collab-field';
    groupLabel.innerHTML = '<span>群聊名称</span>';
    const groupInput = document.createElement('input');
    groupInput.type = 'text';
    groupInput.placeholder = '例如：改版协作群';
    groupInput.disabled = true;
    groupLabel.appendChild(groupInput);

    const syncGroup = (): void => {
      groupInput.disabled = !gRadio.checked;
      if (gRadio.checked) groupInput.focus();
    };
    dmRadio.addEventListener('change', syncGroup);
    gRadio.addEventListener('change', syncGroup);

    body.appendChild(agentsField);
    body.appendChild(kindField);
    body.appendChild(groupLabel);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost-btn';
    cancel.textContent = '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = '创建会话';
    footer.appendChild(cancel);
    footer.appendChild(ok);

    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
    ok.addEventListener('click', () => {
      const agentIds = [...agentBox.querySelectorAll('input[type=checkbox]')]
        .filter((el) => (el as HTMLInputElement).checked)
        .map((el) => (el as HTMLInputElement).value);
      if (!agentIds.length) {
        alert('请至少选择一位智能体');
        return;
      }
      const kind: SessionKind = gRadio.checked ? 'group' : 'dm';
      const groupName = groupInput.value.trim();
      if (kind === 'group' && !groupName) {
        groupInput.focus();
        return;
      }
      close();
      resolve({ agentIds, kind, groupName });
    });
  });
}

export type ChoiceItem = { id: string; label: string; hint?: string };

export type RadioOption = { value: string; label: string; checked?: boolean };

/**
 * Single-select list with optional radio group (forward scope, etc.).
 *
 * @param opts.title - Dialog title
 * @param opts.items - Rows; empty list still shows hint + cancel
 * @returns Selected id and radio value, or null if cancelled
 */
export function promptChoice(opts: {
  title: string;
  hint?: string;
  items: ChoiceItem[];
  confirmLabel?: string;
  emptyText?: string;
  radios?: { legend: string; options: RadioOption[] };
}): Promise<{ id: string; radio?: string } | null> {
  return new Promise((resolve) => {
    const { body, footer, close } = openShell(opts.title);

    if (opts.hint) {
      const hint = document.createElement('p');
      hint.className = 'collab-choice-hint';
      hint.textContent = opts.hint;
      body.appendChild(hint);
    }

    let radioName = '';
    if (opts.radios && opts.radios.options.length) {
      radioName = 'choice-radio-' + Math.random().toString(36).slice(2, 8);
      const field = document.createElement('div');
      field.className = 'collab-field';
      const legend = document.createElement('span');
      legend.textContent = opts.radios.legend;
      field.appendChild(legend);
      const row = document.createElement('div');
      row.className = 'collab-kind-row';
      for (const opt of opts.radios.options) {
        const lab = document.createElement('label');
        lab.className = 'collab-check';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = radioName;
        r.value = opt.value;
        r.checked = Boolean(opt.checked);
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(' ' + opt.label));
        row.appendChild(lab);
      }
      field.appendChild(row);
      body.appendChild(field);
    }

    const list = document.createElement('div');
    list.className = 'collab-choice-list';
    list.setAttribute('role', 'listbox');
    if (!opts.items.length) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.textContent = opts.emptyText || '暂无选项';
      list.appendChild(empty);
    }
    let selectedId = opts.items[0]?.id || '';
    for (const item of opts.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'collab-choice-item' + (item.id === selectedId ? ' selected' : '');
      btn.dataset.id = item.id;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', item.id === selectedId ? 'true' : 'false');
      const name = document.createElement('span');
      name.className = 'collab-choice-label';
      name.textContent = item.label;
      btn.appendChild(name);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'collab-choice-item-hint';
        hint.textContent = item.hint;
        btn.appendChild(hint);
      }
      btn.addEventListener('click', () => {
        selectedId = item.id;
        list.querySelectorAll('.collab-choice-item').forEach((el) => {
          const on = (el as HTMLElement).dataset.id === selectedId;
          el.classList.toggle('selected', on);
          el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      });
      btn.addEventListener('dblclick', () => {
        if (!selectedId) return;
        const radio = radioName
          ? (
              body.querySelector(
                `input[name="${radioName}"]:checked`,
              ) as HTMLInputElement | null
            )?.value
          : undefined;
        close();
        resolve({ id: selectedId, radio });
      });
      list.appendChild(btn);
    }
    body.appendChild(list);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost-btn';
    cancel.textContent = '取消';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = opts.confirmLabel || '确定';
    footer.appendChild(cancel);
    footer.appendChild(ok);

    cancel.addEventListener('click', () => {
      close();
      resolve(null);
    });
    ok.addEventListener('click', () => {
      if (!selectedId) {
        return;
      }
      const radio = radioName
        ? (
            body.querySelector(
              `input[name="${radioName}"]:checked`,
            ) as HTMLInputElement | null
          )?.value
        : undefined;
      close();
      resolve({ id: selectedId, radio });
    });
  });
}
