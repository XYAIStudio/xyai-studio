import { dbGet, dbAll, dbRun } from "../db";

export interface Routine {
  id: number;
  tenant_id: number;
  name: string;
  description: string;
  routine_type: string;
  cron_expression: string | null;
  interval_minutes: number | null;
  assigned_to: number | null;
  assigned_type: string;
  payload: string | null;
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface RoutineLog {
  id: number;
  routine_id: number;
  tenant_id: number;
  status: string;
  result: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

// 创建例行任务
export function createRoutine(data: Partial<Routine>): number {
  const result = dbRun(
    `INSERT INTO routines (tenant_id, name, description, routine_type, cron_expression, interval_minutes, assigned_to, assigned_type, payload, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.name,
      data.description || '',
      data.routine_type || 'task',
      data.cron_expression || null,
      data.interval_minutes || null,
      data.assigned_to || null,
      data.assigned_type || 'ai',
      data.payload || null,
      data.status || 'active',
    ]
  );
  return result.lastInsertRowid;
}

// 获取例行任务列表
export function getRoutines(tenantId: number, filters?: { routine_type?: string; status?: string }): Routine[] {
  let sql = "SELECT * FROM routines WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.routine_type) { sql += " AND routine_type = ?"; params.push(filters.routine_type); }
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as Routine[];
}

// 获取例行任务详情
export function getRoutine(id: number, tenantId: number): Routine | undefined {
  return dbGet("SELECT * FROM routines WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Routine | undefined;
}

// 更新例行任务
export function updateRoutine(id: number, tenantId: number, data: Partial<Routine>): void {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.name) { updates.push("name = ?"); params.push(data.name); }
  if (data.description !== undefined) { updates.push("description = ?"); params.push(data.description); }
  if (data.cron_expression !== undefined) { updates.push("cron_expression = ?"); params.push(data.cron_expression); }
  if (data.interval_minutes !== undefined) { updates.push("interval_minutes = ?"); params.push(data.interval_minutes); }
  if (data.assigned_to !== undefined) { updates.push("assigned_to = ?"); params.push(data.assigned_to); }
  if (data.payload !== undefined) { updates.push("payload = ?"); params.push(data.payload); }
  if (data.status) { updates.push("status = ?"); params.push(data.status); }
  if (data.last_run_at) { updates.push("last_run_at = ?"); params.push(data.last_run_at); }
  if (data.next_run_at) { updates.push("next_run_at = ?"); params.push(data.next_run_at); }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id, tenantId);
    dbRun(`UPDATE routines SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
  }
}

// 删除例行任务
export function deleteRoutine(id: number, tenantId: number): void {
  dbRun("DELETE FROM routine_logs WHERE routine_id = ? AND tenant_id = ?", [id, tenantId]);
  dbRun("DELETE FROM routines WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 记录执行日志
export function logRoutineExecution(data: Partial<RoutineLog>): number {
  const result = dbRun(
    `INSERT INTO routine_logs (routine_id, tenant_id, status, result, error, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.routine_id,
      data.tenant_id || 1,
      data.status || 'success',
      data.result || null,
      data.error || null,
      data.started_at || new Date().toISOString(),
      data.completed_at || null,
    ]
  );
  return result.lastInsertRowid;
}

// 获取执行日志
export function getRoutineLogs(routineId: number, tenantId: number, limit?: number): RoutineLog[] {
  const sql = "SELECT * FROM routine_logs WHERE routine_id = ? AND tenant_id = ? ORDER BY started_at DESC" +
              (limit ? ` LIMIT ${limit}` : '');
  return dbAll(sql, [routineId, tenantId]) as RoutineLog[];
}

// 获取所有例行任务的执行日志
export function getAllRoutineLogs(tenantId: number, limit?: number): RoutineLog[] {
  const sql = "SELECT rl.*, r.name as routine_name FROM routine_logs rl LEFT JOIN routines r ON rl.routine_id = r.id WHERE rl.tenant_id = ? ORDER BY rl.started_at DESC" +
              (limit ? ` LIMIT ${limit}` : '');
  return dbAll(sql, [tenantId]) as any[];
}

// 更新例行任务执行状态
export function updateRoutineLastRun(routineId: number, tenantId: number): void {
  dbRun(
    "UPDATE routines SET last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [routineId, tenantId]
  );
}
