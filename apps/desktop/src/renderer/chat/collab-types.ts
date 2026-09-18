/** Renderer-side collab rail types (mirrors main collab-store). */

export type SessionKind = 'dm' | 'group';

export type CollabSessionMeta = {
  sessionId: string;
  kind: SessionKind;
  projectId: string;
  taskId: string;
  agentIds: string[];
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
  cwd: string;
  createdAt: string;
  updatedAt: string;
};

export type CollabRailState = {
  version: 1;
  projects: CollabProject[];
  tasks: CollabTask[];
  sessions: CollabSessionMeta[];
  collapsedProjects: string[];
  collapsedTasks: string[];
};

export const DEFAULT_PROJECT_ID = 'proj-default';
export const DEFAULT_TASK_ID = 'task-general';

export function emptyCollabState(): CollabRailState {
  const t = new Date().toISOString();
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
