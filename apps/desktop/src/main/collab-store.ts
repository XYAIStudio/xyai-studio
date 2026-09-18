/**
 * Collab rail persistence — projects / tasks / session metadata.
 * File: userData/collab-rail.json
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type SessionKind = 'dm' | 'group';

export type CollabSessionMeta = {
  sessionId: string;
  kind: SessionKind;
  projectId: string;
  taskId: string;
  agentIds: string[];
  /** Display title override (esp. group chats). */
  title?: string;
};

export type CollabTask = {
  id: string;
  projectId: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CollabProject = {
  id: string;
  name: string;
  /** Local working directory path (string; may be empty). */
  cwd: string;
  createdAt: string;
  updatedAt: string;
};

export type CollabRailState = {
  version: 1;
  projects: CollabProject[];
  tasks: CollabTask[];
  sessions: CollabSessionMeta[];
  /** Collapsed project ids */
  collapsedProjects: string[];
  /** Collapsed task ids */
  collapsedTasks: string[];
};

export const DEFAULT_PROJECT_ID = 'proj-default';
export const DEFAULT_TASK_ID = 'task-general';

let overrideUserData: string | null = null;

export function setCollabUserDataDir(dir: string): void {
  overrideUserData = dir;
}

function filePath(): string {
  const base = overrideUserData || process.cwd();
  return path.join(base, 'collab-rail.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyCollabState(): CollabRailState {
  const t = nowIso();
  return {
    version: 1,
    projects: [
      {
        id: DEFAULT_PROJECT_ID,
        name: '默认项目',
        cwd: '',
        createdAt: t,
        updatedAt: t,
      },
    ],
    tasks: [
      {
        id: DEFAULT_TASK_ID,
        projectId: DEFAULT_PROJECT_ID,
        name: '通用对话',
        archived: false,
        createdAt: t,
        updatedAt: t,
      },
    ],
    sessions: [],
    collapsedProjects: [],
    collapsedTasks: [],
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function normalizeState(raw: unknown): CollabRailState {
  const base = emptyCollabState();
  const r = asRecord(raw);
  if (!r) return base;

  const projects: CollabProject[] = Array.isArray(r.projects)
    ? (r.projects as unknown[])
        .map((p) => {
          const o = asRecord(p);
          if (!o || typeof o.id !== 'string' || typeof o.name !== 'string') {
            return null;
          }
          return {
            id: o.id,
            name: o.name,
            cwd: typeof o.cwd === 'string' ? o.cwd : '',
            createdAt:
              typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
            updatedAt:
              typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
          } satisfies CollabProject;
        })
        .filter((x): x is CollabProject => Boolean(x))
    : base.projects;

  if (!projects.some((p) => p.id === DEFAULT_PROJECT_ID)) {
    projects.unshift(base.projects[0]!);
  }

  const tasks: CollabTask[] = Array.isArray(r.tasks)
    ? (r.tasks as unknown[])
        .map((t) => {
          const o = asRecord(t);
          if (
            !o ||
            typeof o.id !== 'string' ||
            typeof o.name !== 'string' ||
            typeof o.projectId !== 'string'
          ) {
            return null;
          }
          return {
            id: o.id,
            projectId: o.projectId,
            name: o.name,
            archived: o.archived === true,
            createdAt:
              typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
            updatedAt:
              typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
          } satisfies CollabTask;
        })
        .filter((x): x is CollabTask => Boolean(x))
    : base.tasks;

  if (!tasks.some((t) => t.id === DEFAULT_TASK_ID)) {
    tasks.unshift(base.tasks[0]!);
  }

  const sessions: CollabSessionMeta[] = [];
  if (Array.isArray(r.sessions)) {
    for (const s of r.sessions as unknown[]) {
      const o = asRecord(s);
      if (
        !o ||
        typeof o.sessionId !== 'string' ||
        typeof o.projectId !== 'string' ||
        typeof o.taskId !== 'string'
      ) {
        continue;
      }
      const kind: SessionKind = o.kind === 'group' ? 'group' : 'dm';
      const agentIds = Array.isArray(o.agentIds)
        ? o.agentIds.filter((a): a is string => typeof a === 'string')
        : ['agent-general'];
      const meta: CollabSessionMeta = {
        sessionId: o.sessionId,
        kind,
        projectId: o.projectId,
        taskId: o.taskId,
        agentIds: agentIds.length ? agentIds : ['agent-general'],
      };
      if (typeof o.title === 'string') meta.title = o.title;
      sessions.push(meta);
    }
  }

  return {
    version: 1,
    projects,
    tasks,
    sessions,
    collapsedProjects: Array.isArray(r.collapsedProjects)
      ? r.collapsedProjects.filter((x): x is string => typeof x === 'string')
      : [],
    collapsedTasks: Array.isArray(r.collapsedTasks)
      ? r.collapsedTasks.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

let cache: CollabRailState | null = null;

export function loadCollabState(): CollabRailState {
  if (cache) return cache;
  const file = filePath();
  if (!existsSync(file)) {
    cache = emptyCollabState();
    persist(cache);
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    cache = normalizeState(raw);
  } catch {
    cache = emptyCollabState();
  }
  return cache;
}

function persist(state: CollabRailState): void {
  cache = state;
  const file = filePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function saveCollabState(next: CollabRailState): CollabRailState {
  const normalized = normalizeState(next);
  persist(normalized);
  return normalized;
}

export function mutateCollab(
  fn: (state: CollabRailState) => void,
): CollabRailState {
  const state = structuredClone(loadCollabState());
  fn(state);
  return saveCollabState(state);
}

export function createProject(input: {
  name: string;
  cwd?: string;
}): CollabRailState {
  return mutateCollab((s) => {
    const t = nowIso();
    s.projects.push({
      id: `proj-${randomUUID()}`,
      name: input.name.trim() || '未命名项目',
      cwd: (input.cwd || '').trim(),
      createdAt: t,
      updatedAt: t,
    });
  });
}

export function updateProject(
  id: string,
  patch: { name?: string; cwd?: string },
): CollabRailState {
  return mutateCollab((s) => {
    const p = s.projects.find((x) => x.id === id);
    if (!p) return;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      p.name = patch.name.trim();
    }
    if (typeof patch.cwd === 'string') p.cwd = patch.cwd.trim();
    p.updatedAt = nowIso();
  });
}

export function deleteProject(id: string): CollabRailState {
  if (id === DEFAULT_PROJECT_ID) return loadCollabState();
  return mutateCollab((s) => {
    s.projects = s.projects.filter((p) => p.id !== id);
    const removedTasks = new Set(
      s.tasks.filter((t) => t.projectId === id).map((t) => t.id),
    );
    s.tasks = s.tasks.filter((t) => t.projectId !== id);
    s.sessions = s.sessions.filter((sess) => {
      if (sess.projectId === id || removedTasks.has(sess.taskId)) {
        // Remap orphan sessions to default
        sess.projectId = DEFAULT_PROJECT_ID;
        sess.taskId = DEFAULT_TASK_ID;
      }
      return true;
    });
    s.collapsedProjects = s.collapsedProjects.filter((x) => x !== id);
  });
}

export function createTask(input: {
  projectId: string;
  name: string;
}): CollabRailState {
  return mutateCollab((s) => {
    if (!s.projects.some((p) => p.id === input.projectId)) return;
    const t = nowIso();
    s.tasks.push({
      id: `task-${randomUUID()}`,
      projectId: input.projectId,
      name: input.name.trim() || '未命名任务',
      archived: false,
      createdAt: t,
      updatedAt: t,
    });
  });
}

export function updateTask(
  id: string,
  patch: { name?: string; archived?: boolean },
): CollabRailState {
  return mutateCollab((s) => {
    const task = s.tasks.find((x) => x.id === id);
    if (!task) return;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      task.name = patch.name.trim();
    }
    if (typeof patch.archived === 'boolean') task.archived = patch.archived;
    task.updatedAt = nowIso();
  });
}

export function deleteTask(id: string): CollabRailState {
  if (id === DEFAULT_TASK_ID) return loadCollabState();
  return mutateCollab((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== id);
    for (const sess of s.sessions) {
      if (sess.taskId === id) {
        sess.taskId = DEFAULT_TASK_ID;
        sess.projectId = DEFAULT_PROJECT_ID;
      }
    }
    s.collapsedTasks = s.collapsedTasks.filter((x) => x !== id);
  });
}

export function upsertSessionMeta(meta: CollabSessionMeta): CollabRailState {
  return mutateCollab((s) => {
    const i = s.sessions.findIndex((x) => x.sessionId === meta.sessionId);
    if (i >= 0) s.sessions[i] = meta;
    else s.sessions.push(meta);
  });
}

export function removeSessionMeta(sessionId: string): CollabRailState {
  return mutateCollab((s) => {
    s.sessions = s.sessions.filter((x) => x.sessionId !== sessionId);
  });
}

export function setCollapsed(input: {
  projectId?: string;
  taskId?: string;
  collapsed: boolean;
}): CollabRailState {
  return mutateCollab((s) => {
    if (input.projectId) {
      const set = new Set(s.collapsedProjects);
      if (input.collapsed) set.add(input.projectId);
      else set.delete(input.projectId);
      s.collapsedProjects = [...set];
    }
    if (input.taskId) {
      const set = new Set(s.collapsedTasks);
      if (input.collapsed) set.add(input.taskId);
      else set.delete(input.taskId);
      s.collapsedTasks = [...set];
    }
  });
}

export function getCollabFilePath(): string {
  return filePath();
}
