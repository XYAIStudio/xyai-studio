/**
 * SessionRail — Project → Task → 单聊/群聊 hierarchy (openXYOS-inspired, blue theme).
 */

import type { CollabRailState, CollabSessionMeta, SessionKind } from './collab-types.js';
import { DEFAULT_PROJECT_ID, DEFAULT_TASK_ID } from './collab-types.js';
import type { SessionSummary } from './types.js';

export type SessionRailHandlers = {
  onSwitch: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onToggleProject: (projectId: string, collapsed: boolean) => void;
  onToggleTask: (taskId: string, collapsed: boolean) => void;
  onNewProject: () => void;
  onEditProject: (projectId: string) => void;
  onNewTask: (projectId: string) => void;
  onEditTask: (taskId: string) => void;
  onArchiveTask: (taskId: string, archived: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onAssignWork: (taskId: string) => void;
  onSelectTask: (projectId: string, taskId: string) => void;
  onNewSession: () => void;
};

export type SessionRailApi = {
  render: (opts: {
    hostSessions: SessionSummary[];
    activeId: string;
    collab: CollabRailState;
    selectedTaskId: string;
  }) => void;
  wire: (handlers: SessionRailHandlers) => void;
};

function kindIcon(kind: SessionKind): string {
  return kind === 'group' ? '#' : '🤖';
}

function kindLabel(kind: SessionKind): string {
  return kind === 'group' ? '群聊' : '单聊';
}

function metaFor(
  collab: CollabRailState,
  sessionId: string,
): CollabSessionMeta {
  const found = collab.sessions.find((s) => s.sessionId === sessionId);
  if (found) return found;
  return {
    sessionId,
    kind: 'dm',
    projectId: DEFAULT_PROJECT_ID,
    taskId: DEFAULT_TASK_ID,
    agentIds: ['agent-general'],
  };
}

export function createSessionRail(opts: {
  listEl: HTMLElement;
  newBtn: HTMLElement | null;
  newProjectBtn?: HTMLElement | null;
}): SessionRailApi {
  const { listEl, newBtn, newProjectBtn } = opts;
  let wired = false;
  let handlers: SessionRailHandlers | null = null;

  function render(optsIn: {
    hostSessions: SessionSummary[];
    activeId: string;
    collab: CollabRailState;
    selectedTaskId: string;
  }): void {
    const { hostSessions, activeId, collab, selectedTaskId } = optsIn;
    listEl.innerHTML = '';

    const hostById = new Map(hostSessions.map((s) => [s.id, s]));
    const collapsedP = new Set(collab.collapsedProjects);
    const collapsedT = new Set(collab.collapsedTasks);

    // Ensure every host session has a place in the tree (orphan → default)
    const metas = new Map<string, CollabSessionMeta>();
    for (const s of hostSessions) {
      metas.set(s.id, metaFor(collab, s.id));
    }
    // Also show meta for sessions that exist in collab but not yet in host (rare)
    for (const m of collab.sessions) {
      if (!metas.has(m.sessionId) && hostById.has(m.sessionId)) {
        metas.set(m.sessionId, m);
      }
    }

    const projects = [...collab.projects].sort((a, b) => {
      if (a.id === DEFAULT_PROJECT_ID) return -1;
      if (b.id === DEFAULT_PROJECT_ID) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    for (const project of projects) {
      const projEl = document.createElement('div');
      projEl.className = 'collab-project';
      projEl.dataset.projectId = project.id;

      const pCollapsed = collapsedP.has(project.id);
      const pHead = document.createElement('div');
      pHead.className =
        'collab-project-head' +
        (selectedTaskId &&
        collab.tasks.some(
          (t) => t.id === selectedTaskId && t.projectId === project.id,
        )
          ? ' has-selected'
          : '');

      const pToggle = document.createElement('button');
      pToggle.type = 'button';
      pToggle.className = 'collab-toggle';
      pToggle.textContent = pCollapsed ? '▸' : '▾';
      pToggle.title = pCollapsed ? '展开项目' : '折叠项目';
      pToggle.dataset.action = 'toggle-project';
      pToggle.dataset.projectId = project.id;
      pToggle.dataset.collapsed = pCollapsed ? '0' : '1';

      const pTitle = document.createElement('button');
      pTitle.type = 'button';
      pTitle.className = 'collab-project-title';
      pTitle.dataset.action = 'toggle-project';
      pTitle.dataset.projectId = project.id;
      pTitle.dataset.collapsed = pCollapsed ? '0' : '1';
      pTitle.innerHTML = `<span class="collab-folder">📁</span><span class="collab-label">${escapeHtml(project.name)}</span>`;

      const pActions = document.createElement('div');
      pActions.className = 'collab-actions';

      const btnEditP = actionBtn('编辑', 'edit-project', { projectId: project.id });
      const btnNewTask = actionBtn('任务', 'new-task', { projectId: project.id });
      pActions.appendChild(btnEditP);
      pActions.appendChild(btnNewTask);

      pHead.appendChild(pToggle);
      pHead.appendChild(pTitle);
      pHead.appendChild(pActions);

      if (project.cwd) {
        const cwd = document.createElement('div');
        cwd.className = 'collab-cwd';
        cwd.title = project.cwd;
        cwd.textContent = project.cwd;
        pHead.appendChild(cwd);
      }

      projEl.appendChild(pHead);

      if (!pCollapsed) {
        const tasks = collab.tasks
          .filter((t) => t.projectId === project.id)
          .sort((a, b) => {
            if (a.archived !== b.archived) return a.archived ? 1 : -1;
            if (a.id === DEFAULT_TASK_ID) return -1;
            if (b.id === DEFAULT_TASK_ID) return 1;
            return a.name.localeCompare(b.name, 'zh-CN');
          });

        for (const task of tasks) {
          const tCollapsed = collapsedT.has(task.id);
          const taskEl = document.createElement('div');
          taskEl.className =
            'collab-task' +
            (task.archived ? ' archived' : '') +
            (task.id === selectedTaskId ? ' selected' : '');
          taskEl.dataset.taskId = task.id;

          const tHead = document.createElement('div');
          tHead.className = 'collab-task-head';

          const tToggle = document.createElement('button');
          tToggle.type = 'button';
          tToggle.className = 'collab-toggle';
          tToggle.textContent = tCollapsed ? '▸' : '▾';
          tToggle.dataset.action = 'toggle-task';
          tToggle.dataset.taskId = task.id;
          tToggle.dataset.collapsed = tCollapsed ? '0' : '1';

          const tTitle = document.createElement('button');
          tTitle.type = 'button';
          tTitle.className = 'collab-task-title';
          tTitle.dataset.action = 'select-task';
          tTitle.dataset.projectId = project.id;
          tTitle.dataset.taskId = task.id;
          const archBadge = task.archived
            ? '<span class="collab-arch-badge">已归档</span>'
            : '';
          tTitle.innerHTML = `<span class="collab-task-icon">☑</span><span class="collab-label">${escapeHtml(task.name)}</span>${archBadge}`;

          const tActions = document.createElement('div');
          tActions.className = 'collab-actions';
          tActions.appendChild(
            actionBtn('安排', 'assign', { taskId: task.id }),
          );
          tActions.appendChild(
            actionBtn('编辑', 'edit-task', { taskId: task.id }),
          );
          tActions.appendChild(
            actionBtn(
              task.archived ? '取消归档' : '归档',
              'archive-task',
              { taskId: task.id, archived: task.archived ? '0' : '1' },
            ),
          );
          if (task.id !== DEFAULT_TASK_ID) {
            tActions.appendChild(
              actionBtn('删除', 'delete-task', { taskId: task.id }),
            );
          }

          tHead.appendChild(tToggle);
          tHead.appendChild(tTitle);
          tHead.appendChild(tActions);
          taskEl.appendChild(tHead);

          if (!tCollapsed) {
            const sessList = document.createElement('div');
            sessList.className = 'collab-sessions';

            const taskSessions = [...metas.values()].filter(
              (m) => m.taskId === task.id && hostById.has(m.sessionId),
            );
            // dm first, then group
            taskSessions.sort((a, b) => {
              if (a.kind !== b.kind) return a.kind === 'dm' ? -1 : 1;
              const ta = hostById.get(a.sessionId)?.title || '';
              const tb = hostById.get(b.sessionId)?.title || '';
              return ta.localeCompare(tb, 'zh-CN');
            });

            if (!taskSessions.length) {
              const empty = document.createElement('div');
              empty.className = 'collab-empty';
              empty.textContent = '暂无会话 · 点「安排」或「新对话」';
              sessList.appendChild(empty);
            }

            for (const meta of taskSessions) {
              const host = hostById.get(meta.sessionId)!;
              const row = document.createElement('div');
              row.className =
                'session-item' +
                (meta.sessionId === activeId ? ' active' : '') +
                (meta.kind === 'group' ? ' is-group' : ' is-dm');

              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'session-row';
              btn.dataset.action = 'switch';
              btn.dataset.sessionId = meta.sessionId;

              const icon = document.createElement('span');
              icon.className = 'session-icon kind-' + meta.kind;
              icon.title = kindLabel(meta.kind);
              icon.textContent = kindIcon(meta.kind);

              const body = document.createElement('span');
              body.className = 'session-body';

              const top = document.createElement('span');
              top.className = 'session-top';
              const title = document.createElement('span');
              title.className = 'title';
              title.textContent =
                meta.title || host.title || kindLabel(meta.kind);
              const badge = document.createElement('span');
              badge.className = 'session-kind-badge';
              badge.textContent = kindLabel(meta.kind);
              top.appendChild(title);
              top.appendChild(badge);

              const preview = document.createElement('span');
              preview.className = 'session-preview';
              const agentHint =
                meta.agentIds.length > 1
                  ? `${meta.agentIds.length} 位智能体`
                  : meta.agentIds[0] === 'agent-general'
                    ? '通用智能体'
                    : meta.agentIds.join(', ');
              preview.textContent = agentHint;

              body.appendChild(top);
              body.appendChild(preview);
              btn.appendChild(icon);
              btn.appendChild(body);

              const del = document.createElement('button');
              del.type = 'button';
              del.className = 'del';
              del.title = '删除会话';
              del.textContent = '×';
              del.dataset.action = 'delete-session';
              del.dataset.sessionId = meta.sessionId;

              row.appendChild(btn);
              row.appendChild(del);
              sessList.appendChild(row);
            }
            taskEl.appendChild(sessList);
          }
          projEl.appendChild(taskEl);
        }
      }
      listEl.appendChild(projEl);
    }

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'rail-empty';
      empty.textContent = '暂无项目，点击「新建项目」开始';
      listEl.appendChild(empty);
    }
  }

  function wire(h: SessionRailHandlers): void {
    if (wired) return;
    wired = true;
    handlers = h;
    newBtn?.addEventListener('click', () => handlers?.onNewSession());
    newProjectBtn?.addEventListener('click', () => handlers?.onNewProject());

    listEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !handlers) return;
      const el = t.closest('[data-action]') as HTMLElement | null;
      if (!el) return;
      const action = el.dataset.action;
      e.stopPropagation();

      switch (action) {
        case 'toggle-project': {
          const id = el.dataset.projectId || '';
          const nextCollapsed = el.dataset.collapsed === '1';
          if (id) handlers.onToggleProject(id, nextCollapsed);
          break;
        }
        case 'toggle-task': {
          const id = el.dataset.taskId || '';
          const nextCollapsed = el.dataset.collapsed === '1';
          if (id) handlers.onToggleTask(id, nextCollapsed);
          break;
        }
        case 'select-task': {
          const projectId = el.dataset.projectId || '';
          const taskId = el.dataset.taskId || '';
          if (projectId && taskId) handlers.onSelectTask(projectId, taskId);
          break;
        }
        case 'edit-project': {
          const id = el.dataset.projectId || '';
          if (id) handlers.onEditProject(id);
          break;
        }
        case 'new-task': {
          const id = el.dataset.projectId || '';
          if (id) handlers.onNewTask(id);
          break;
        }
        case 'edit-task': {
          const id = el.dataset.taskId || '';
          if (id) handlers.onEditTask(id);
          break;
        }
        case 'archive-task': {
          const id = el.dataset.taskId || '';
          const archived = el.dataset.archived === '1';
          if (id) handlers.onArchiveTask(id, archived);
          break;
        }
        case 'delete-task': {
          const id = el.dataset.taskId || '';
          if (id && confirm('删除该任务？其下会话将归入「通用对话」。')) {
            handlers.onDeleteTask(id);
          }
          break;
        }
        case 'assign': {
          const id = el.dataset.taskId || '';
          if (id) handlers.onAssignWork(id);
          break;
        }
        case 'switch': {
          const id = el.dataset.sessionId || '';
          if (id) handlers.onSwitch(id);
          break;
        }
        case 'delete-session': {
          const id = el.dataset.sessionId || '';
          if (id) handlers.onDeleteSession(id);
          break;
        }
        default:
          break;
      }
    });
  }

  return { render, wire };
}

function actionBtn(
  label: string,
  action: string,
  data: Record<string, string>,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'collab-action-btn';
  b.textContent = label;
  b.dataset.action = action;
  for (const [k, v] of Object.entries(data)) {
    b.dataset[k] = v;
  }
  return b;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @deprecated flat apply — prefer collab tree render */
export function applySessionStatus(): never {
  throw new Error('use SessionRailApi.render with collab state');
}
