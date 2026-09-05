/**
 * H2A2A2H 第二步 · 快照组装（对齐 dsh-agent-teams 的 assembleTeamSnapshot 思想）
 *
 * 把影子账本落库的 h2a2a2h_tasks（父/子任务 + 依赖 + 12 态）+ h2a2a2h_state_log（轨迹）
 * 组装成前端活动面板直接消费的结构化快照，前端不读消息流（真相源分离）。
 *
 * @module dsh-agent-teams 借鉴 · XYOS 落地
 */
import { dbAll } from "../db";

export type VisualState = "blocked" | "open" | "running" | "completed";

export interface H2A2A2HTaskView {
  id: number;
  title: string;
  state: string;
  visualState: VisualState;
  depth: number;
  dependencies: number[];
  employeeId?: number;
  employeeName?: string;
  output?: string;
}

export interface H2A2A2HStateLogView {
  taskId: number;
  fromState: string;
  toState: string;
  createdAt: string;
}

export interface H2A2A2HSnapshot {
  chatId: number;
  parent: { id: number; title: string; state: string } | null;
  tasks: H2A2A2HTaskView[];
  stateLog: H2A2A2HStateLogView[];
}

/** 12 态 → 视觉态（completed=完成 / executing=进行中 / 有未完成依赖=阻塞 / 其余=待处理）。 */
export function taskVisualState(state: string, deps: number[], tasks: H2A2A2HTaskView[]): VisualState {
  if (state === "completed") return "completed";
  if (state === "executing") return "running";
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const openDep = deps.some((d) => {
    const dep = byId.get(d);
    return dep !== undefined && dep.state !== "completed";
  });
  return openDep ? "blocked" : "open";
}

/** 最长依赖路径深度（每个 depth = 依赖图一列泳道），照搬 dsh taskDepthsById。 */
export function taskDepthsById(tasks: H2A2A2HTaskView[]): Map<number, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depths = new Map<number, number>();
  const visiting = new Set<number>();
  const depthOf = (id: number): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    const t = byId.get(id);
    if (t === undefined) return 0;
    visiting.add(id);
    const deps = t.dependencies.filter((d) => byId.has(d)).sort((a, b) => a - b);
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depthOf));
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };
  for (const t of tasks) depthOf(t.id);
  return depths;
}

/** 组装一个群聊的 H2A2A2H 活动快照；无影子数据时返回 null（前端据此隐藏面板）。 */
export function assembleH2A2A2HSnapshot(chatId: number): H2A2A2HSnapshot | null {
  const rows = dbAll(
    "SELECT t.*, e.name AS employee_name FROM h2a2a2h_tasks t LEFT JOIN employees e ON t.employee_id = e.id WHERE t.chat_id = ? ORDER BY t.id",
    [chatId]
  ) as any[];
  if (rows.length === 0) return null;

  // 取最新一轮协作（id 最大的父任务），只返回它的子任务，避免多轮任务混在一起
  const parents = rows.filter((r) => r.parent_id === null || r.parent_id === undefined);
  const parentRow = parents.length > 0 ? parents[parents.length - 1] : undefined;
  const childRows = parentRow ? rows.filter((r) => r.parent_id === parentRow.id) : [];

  const tasks: H2A2A2HTaskView[] = childRows.map((r) => ({
    id: r.id,
    title: r.title,
    state: r.state,
    visualState: "open",
    depth: 0,
    dependencies: parseDeps(r.dependencies),
    employeeId: r.employee_id ?? undefined,
    employeeName: r.employee_name ?? undefined,
    output: extractOutput(r.description),
  }));

  const depths = taskDepthsById(tasks);
  for (const t of tasks) {
    t.depth = depths.get(t.id) ?? 0;
    t.visualState = taskVisualState(t.state, t.dependencies, tasks);
  }

  const logRows = dbAll(
    "SELECT * FROM h2a2a2h_state_log WHERE task_id IN (SELECT id FROM h2a2a2h_tasks WHERE chat_id = ?) ORDER BY id",
    [chatId]
  ) as any[];
  const stateLog: H2A2A2HStateLogView[] = logRows.map((r) => ({
    taskId: r.task_id,
    fromState: r.from_state,
    toState: r.to_state,
    createdAt: r.created_at,
  }));

  return {
    chatId,
    parent: parentRow ? { id: parentRow.id, title: parentRow.title, state: parentRow.state } : null,
    tasks,
    stateLog,
  };
}

function parseDeps(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function extractOutput(desc: string | null | undefined): string | undefined {
  if (!desc) return undefined;
  const m = desc.match(/\[产出\]\s*([\s\S]*)$/);
  return m ? m[1].slice(0, 300) : undefined;
}
