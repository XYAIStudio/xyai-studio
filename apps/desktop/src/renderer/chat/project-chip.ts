/**
 * Codex-like project chip — shows current session project / 程序工作区;
 * popover with name, resolved cwd, 编辑项目, and switch/create project.
 */

import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TASK_ID,
  STUDIO_WORKSPACE_LABEL,
  projectChipLabel,
  projectUsesStudioWorkspace,
  type CollabProject,
  type CollabRailState,
} from './collab-types.js';

export type ProjectChipHandlers = {
  onEditProject: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
};

export type ProjectChipApi = {
  sync: (
    collab: CollabRailState,
    projectId: string,
    studioWorkspacePath: string,
  ) => void;
  close: () => void;
};

export function createProjectChip(opts: {
  chipBtn: HTMLButtonElement;
  handlers: ProjectChipHandlers;
}): ProjectChipApi {
  const { chipBtn, handlers } = opts;
  let menu: HTMLDivElement | null = null;
  let currentProjectId = DEFAULT_PROJECT_ID;
  let collab: CollabRailState | null = null;
  let studioPath = '';

  function currentProject(): CollabProject | undefined {
    return collab?.projects.find((p) => p.id === currentProjectId);
  }

  function resolvedPath(project: CollabProject | undefined): string {
    if (projectUsesStudioWorkspace(project)) {
      return studioPath || STUDIO_WORKSPACE_LABEL;
    }
    return project!.cwd.trim();
  }

  function updateChip(): void {
    const project = currentProject();
    const label = projectChipLabel(project);
    chipBtn.textContent = label;
    chipBtn.dataset.projectId = currentProjectId;
    const path = resolvedPath(project);
    chipBtn.title = `项目：${project?.name || label}\n${path}`;
    chipBtn.setAttribute('aria-label', `当前项目：${label}`);
  }

  function closeMenu(): void {
    menu?.remove();
    menu = null;
    chipBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu(): void {
    closeMenu();
    const project = currentProject();
    menu = document.createElement('div');
    menu.className = 'project-popover';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', '项目');

    const nameRow = document.createElement('div');
    nameRow.className = 'project-popover-name';
    nameRow.textContent = project?.name || '默认项目';
    menu.appendChild(nameRow);

    const pathRow = document.createElement('div');
    pathRow.className = 'project-popover-path';
    const path = resolvedPath(project);
    if (projectUsesStudioWorkspace(project)) {
      pathRow.innerHTML = '';
      const tag = document.createElement('span');
      tag.className = 'project-popover-tag';
      tag.textContent = STUDIO_WORKSPACE_LABEL;
      pathRow.appendChild(tag);
      if (studioPath) {
        const p = document.createElement('span');
        p.className = 'project-popover-path-text';
        p.textContent = studioPath;
        p.title = studioPath;
        pathRow.appendChild(p);
      }
    } else {
      pathRow.textContent = path;
      pathRow.title = path;
    }
    menu.appendChild(pathRow);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'project-popover-edit';
    editBtn.textContent = '编辑项目';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      handlers.onEditProject(currentProjectId);
    });
    menu.appendChild(editBtn);

    const divider = document.createElement('div');
    divider.className = 'project-popover-divider';
    menu.appendChild(divider);

    const listLabel = document.createElement('div');
    listLabel.className = 'project-popover-section';
    listLabel.textContent = '切换项目';
    menu.appendChild(listLabel);

    const list = document.createElement('div');
    list.className = 'project-popover-list';
    list.setAttribute('role', 'listbox');
    const projects = [...(collab?.projects || [])].sort((a, b) => {
      if (a.id === DEFAULT_PROJECT_ID) return -1;
      if (b.id === DEFAULT_PROJECT_ID) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    for (const p of projects) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className =
        'project-popover-item' + (p.id === currentProjectId ? ' active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute(
        'aria-selected',
        p.id === currentProjectId ? 'true' : 'false',
      );
      const title = document.createElement('span');
      title.className = 'project-popover-item-title';
      title.textContent = projectChipLabel(p);
      item.appendChild(title);
      if (p.name !== projectChipLabel(p)) {
        const sub = document.createElement('span');
        sub.className = 'project-popover-item-sub';
        sub.textContent = p.name;
        item.appendChild(sub);
      } else if (p.cwd.trim()) {
        const sub = document.createElement('span');
        sub.className = 'project-popover-item-sub';
        sub.textContent = p.cwd;
        sub.title = p.cwd;
        item.appendChild(sub);
      }
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        if (p.id !== currentProjectId) handlers.onSelectProject(p.id);
      });
      list.appendChild(item);
    }
    menu.appendChild(list);

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'project-popover-new';
    newBtn.textContent = '新建项目…';
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      handlers.onNewProject();
    });
    menu.appendChild(newBtn);

    const wrap = chipBtn.closest('.project-chip-wrap') || chipBtn.parentElement || chipBtn;
    if (getComputedStyle(wrap as Element).position === 'static') {
      (wrap as HTMLElement).style.position = 'relative';
    }
    wrap.appendChild(menu);
    chipBtn.setAttribute('aria-expanded', 'true');
  }

  chipBtn.type = 'button';
  chipBtn.setAttribute('aria-haspopup', 'dialog');
  chipBtn.setAttribute('aria-expanded', 'false');
  chipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) closeMenu();
    else openMenu();
  });
  document.addEventListener('click', (e) => {
    if (!menu) return;
    if (
      e.target instanceof Node &&
      (chipBtn.contains(e.target) || menu.contains(e.target))
    ) {
      return;
    }
    closeMenu();
  });

  updateChip();

  return {
    sync(nextCollab, projectId, studioWorkspacePath) {
      collab = nextCollab;
      currentProjectId = projectId || DEFAULT_PROJECT_ID;
      studioPath = studioWorkspacePath || '';
      updateChip();
      if (menu) {
        // refresh open popover
        openMenu();
      }
    },
    close: closeMenu,
  };
}

/** Pick a task under projectId (prefer DEFAULT_TASK_ID when it belongs). */
export function pickTaskForProject(
  collab: CollabRailState,
  projectId: string,
): string {
  if (
    projectId === DEFAULT_PROJECT_ID &&
    collab.tasks.some((t) => t.id === DEFAULT_TASK_ID)
  ) {
    return DEFAULT_TASK_ID;
  }
  const under = collab.tasks.filter(
    (t) => t.projectId === projectId && !t.archived,
  );
  if (under.some((t) => t.id === DEFAULT_TASK_ID)) return DEFAULT_TASK_ID;
  return under[0]?.id || DEFAULT_TASK_ID;
}
