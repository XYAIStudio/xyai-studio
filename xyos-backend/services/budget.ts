import { dbGet, dbAll, dbRun } from "../db";

export interface Budget {
  id: number;
  tenant_id: number;
  name: string;
  budget_type: string;
  limit_amount: number;
  used_amount: number;
  cycle: string;
  start_date: string;
  end_date: string;
  alert_threshold: number;
  status: string;
}

export interface TokenUsage {
  id: number;
  tenant_id: number;
  user_id: number | null;
  employee_id: number | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  request_type: string;
  created_at: string;
}

// 创建预算
export function createBudget(data: Partial<Budget>): number {
  const result = dbRun(
    `INSERT INTO budgets (tenant_id, name, budget_type, limit_amount, used_amount, cycle, start_date, end_date, alert_threshold, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.name,
      data.budget_type || 'token',
      data.limit_amount || 0,
      data.used_amount || 0,
      data.cycle || 'monthly',
      data.start_date || null,
      data.end_date || null,
      data.alert_threshold || 80,
      data.status || 'active',
    ]
  );
  return result.lastInsertRowid;
}

// 获取预算列表
export function getBudgets(tenantId: number, filters?: { budget_type?: string; status?: string }): Budget[] {
  let sql = "SELECT * FROM budgets WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.budget_type) { sql += " AND budget_type = ?"; params.push(filters.budget_type); }
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as Budget[];
}

// 获取预算详情
export function getBudget(id: number, tenantId: number): Budget | undefined {
  return dbGet("SELECT * FROM budgets WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Budget | undefined;
}

// 更新预算
export function updateBudget(id: number, tenantId: number, data: Partial<Budget>): void {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.name) { updates.push("name = ?"); params.push(data.name); }
  if (data.limit_amount !== undefined) { updates.push("limit_amount = ?"); params.push(data.limit_amount); }
  if (data.used_amount !== undefined) { updates.push("used_amount = ?"); params.push(data.used_amount); }
  if (data.alert_threshold !== undefined) { updates.push("alert_threshold = ?"); params.push(data.alert_threshold); }
  if (data.status) { updates.push("status = ?"); params.push(data.status); }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id, tenantId);
    dbRun(`UPDATE budgets SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
  }
}

// 删除预算
export function deleteBudget(id: number, tenantId: number): void {
  dbRun("DELETE FROM budgets WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 记录Token使用
export function recordTokenUsage(data: Partial<TokenUsage>): number {
  const result = dbRun(
    `INSERT INTO token_usage (tenant_id, user_id, employee_id, model, input_tokens, output_tokens, total_tokens, cost, request_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.user_id || null,
      data.employee_id || null,
      data.model || '',
      data.input_tokens || 0,
      data.output_tokens || 0,
      data.total_tokens || 0,
      data.cost || 0,
      data.request_type || 'chat',
    ]
  );
  return result.lastInsertRowid;
}

// 获取Token使用记录
export function getTokenUsage(tenantId: number, filters?: { user_id?: number; start_date?: string; end_date?: string }): TokenUsage[] {
  let sql = "SELECT * FROM token_usage WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.user_id) { sql += " AND user_id = ?"; params.push(filters.user_id); }
  if (filters?.start_date) { sql += " AND created_at >= ?"; params.push(filters.start_date); }
  if (filters?.end_date) { sql += " AND created_at <= ?"; params.push(filters.end_date); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as TokenUsage[];
}

// 获取Token使用统计
export function getTokenUsageStats(tenantId: number, period?: string): any {
  const groupBy = period === 'daily' ? "date(created_at)" : 
                  period === 'weekly' ? "strftime('%Y-%W', created_at)" : 
                  "strftime('%Y-%m', created_at)";
  
  return dbAll(
    `SELECT ${groupBy} as period,
            SUM(input_tokens) as input_tokens,
            SUM(output_tokens) as output_tokens,
            SUM(total_tokens) as total_tokens,
            SUM(cost) as total_cost,
            COUNT(*) as request_count
     FROM token_usage 
     WHERE tenant_id = ?
     GROUP BY period
     ORDER BY period DESC`,
    [tenantId]
  );
}

// 获取预算预警状态
export function getBudgetAlerts(tenantId: number): any[] {
  const budgets = dbAll(
    "SELECT * FROM budgets WHERE tenant_id = ? AND status = 'active'",
    [tenantId]
  ) as Budget[];

  return budgets.map(budget => {
    const usagePercent = budget.limit_amount > 0 ? (budget.used_amount / budget.limit_amount) * 100 : 0;
    return {
      ...budget,
      usage_percent: Math.round(usagePercent * 100) / 100,
      is_alert: usagePercent >= budget.alert_threshold,
      is_exceeded: usagePercent >= 100,
    };
  });
}

// 更新预算使用量
export function updateBudgetUsage(budgetId: number, tenantId: number, amount: number): void {
  dbRun(
    "UPDATE budgets SET used_amount = used_amount + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [amount, budgetId, tenantId]
  );
}
