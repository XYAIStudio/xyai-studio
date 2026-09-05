import { dbGet, dbAll, dbRun } from "../db";

export interface Goal {
  id: number;
  tenant_id: number;
  parent_id: number | null;
  title: string;
  description: string;
  goal_type: string;
  owner_id: number | null;
  owner_type: string;
  department_id: number | null;
  cycle: string;
  status: string;
  progress: number;
  start_date: string;
  end_date: string;
}

// 创建目标
export function createGoal(data: Partial<Goal>): number {
  const result = dbRun(
    `INSERT INTO goals (tenant_id, parent_id, title, description, goal_type, owner_id, owner_type, department_id, cycle, status, progress, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.parent_id || null,
      data.title,
      data.description || '',
      data.goal_type || 'company',
      data.owner_id || null,
      data.owner_type || 'human',
      data.department_id || null,
      data.cycle || 'Q2-2026',
      data.status || 'active',
      data.progress || 0,
      data.start_date || null,
      data.end_date || null,
    ]
  );
  return result.lastInsertRowid;
}

// 获取目标列表
export function getGoals(tenantId: number, filters?: { cycle?: string; goal_type?: string; status?: string }): Goal[] {
  let sql = "SELECT * FROM goals WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.cycle) { sql += " AND cycle = ?"; params.push(filters.cycle); }
  if (filters?.goal_type) { sql += " AND goal_type = ?"; params.push(filters.goal_type); }
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as Goal[];
}

// 获取目标详情
export function getGoal(id: number, tenantId: number): Goal | undefined {
  return dbGet("SELECT * FROM goals WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Goal | undefined;
}

// 更新目标
export function updateGoal(id: number, tenantId: number, data: Partial<Goal>): void {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.title) { updates.push("title = ?"); params.push(data.title); }
  if (data.description !== undefined) { updates.push("description = ?"); params.push(data.description); }
  if (data.status) { updates.push("status = ?"); params.push(data.status); }
  if (data.progress !== undefined) { updates.push("progress = ?"); params.push(data.progress); }
  if (data.owner_id) { updates.push("owner_id = ?"); params.push(data.owner_id); }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id, tenantId);
    dbRun(`UPDATE goals SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
  }
}

// 删除目标
export function deleteGoal(id: number, tenantId: number): void {
  // 先删除子目标
  dbRun("DELETE FROM goals WHERE parent_id = ? AND tenant_id = ?", [id, tenantId]);
  // 删除关联任务的目标ID
  dbRun("UPDATE tasks SET goal_id = NULL WHERE goal_id = ? AND tenant_id = ?", [id, tenantId]);
  // 删除目标
  dbRun("DELETE FROM goals WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 获取目标树形结构
export function getGoalTree(tenantId: number): any[] {
  const goals = dbAll(
    "SELECT * FROM goals WHERE tenant_id = ? ORDER BY goal_type, created_at",
    [tenantId]
  ) as Goal[];

  // 构建树
  const map = new Map<number, any>();
  const roots: any[] = [];

  for (const goal of goals) {
    map.set(goal.id, { ...goal, children: [] });
  }

  for (const goal of goals) {
    const node = map.get(goal.id)!;
    if (goal.parent_id && map.has(goal.parent_id)) {
      map.get(goal.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 计算进度（子目标平均值）
  function calculateProgress(node: any): number {
    if (node.children.length === 0) return node.progress;
    const childProgress = node.children.map((c: any) => calculateProgress(c));
    return Math.round(childProgress.reduce((a: number, b: number) => a + b, 0) / childProgress.length);
  }

  for (const root of roots) {
    root.progress = calculateProgress(root);
  }

  return roots;
}

// 关联任务到目标
export function linkTaskToGoal(taskId: number, goalId: number, tenantId: number): void {
  dbRun("UPDATE tasks SET goal_id = ? WHERE id = ? AND tenant_id = ?", [goalId, taskId, tenantId]);
}

// 获取目标关联的任务
export function getGoalTasks(goalId: number, tenantId: number): any[] {
  return dbAll(
    "SELECT * FROM tasks WHERE goal_id = ? AND tenant_id = ? ORDER BY created_at DESC",
    [goalId, tenantId]
  );
}

// 自动计算目标进度（基于关联任务完成率）
export function autoCalculateGoalProgress(goalId: number, tenantId: number): number {
  const tasks = getGoalTasks(goalId, tenantId);
  if (tasks.length === 0) return 0;

  const completed = tasks.filter((t: any) => t.status === 'done').length;
  return Math.round((completed / tasks.length) * 100);
}
