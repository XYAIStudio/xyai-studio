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

/** Chip / path label when project.cwd is empty (Studio default workspace). */
export const STUDIO_WORKSPACE_LABEL = '程序工作区';

export function projectUsesStudioWorkspace(
  project: CollabProject | undefined | null,
): boolean {
  return !project || !project.cwd.trim();
}

/** Composer chip label: empty cwd → 程序工作区, else project name. */
export function projectChipLabel(
  project: CollabProject | undefined | null,
): string {
  if (projectUsesStudioWorkspace(project)) return STUDIO_WORKSPACE_LABEL;
  return project!.name;
}
