import { dbGet, dbAll, dbRun } from "../db";

export interface PerformanceReview {
  id: number;
  tenant_id: number;
  employee_id: number;
  employee_type: string;
  review_period: string;
  overall_score: number;
  task_completion_score: number;
  quality_score: number;
  efficiency_score: number;
  collaboration_score: number;
  innovation_score: number;
  review_notes: string | null;
  reviewed_by: number | null;
  status: string;
}

export interface PerformanceMetric {
  id: number;
  tenant_id: number;
  employee_id: number;
  employee_type: string;
  metric_type: string;
  metric_value: number;
  metric_unit: string | null;
  period: string | null;
}

// 创建绩效评估
export function createReview(data: Partial<PerformanceReview>): number {
  const result = dbRun(
    `INSERT INTO performance_reviews (tenant_id, employee_id, employee_type, review_period, overall_score, task_completion_score, quality_score, efficiency_score, collaboration_score, innovation_score, review_notes, reviewed_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.employee_id,
      data.employee_type || 'ai',
      data.review_period,
      data.overall_score || 0,
      data.task_completion_score || 0,
      data.quality_score || 0,
      data.efficiency_score || 0,
      data.collaboration_score || 0,
      data.innovation_score || 0,
      data.review_notes || null,
      data.reviewed_by || null,
      data.status || 'draft',
    ]
  );
  return result.lastInsertRowid;
}

// 获取绩效评估列表
export function getReviews(tenantId: number, filters?: { employee_id?: number; employee_type?: string; review_period?: string }): PerformanceReview[] {
  let sql = "SELECT * FROM performance_reviews WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.employee_id) { sql += " AND employee_id = ?"; params.push(filters.employee_id); }
  if (filters?.employee_type) { sql += " AND employee_type = ?"; params.push(filters.employee_type); }
  if (filters?.review_period) { sql += " AND review_period = ?"; params.push(filters.review_period); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as PerformanceReview[];
}

// 获取绩效评估详情
export function getReview(id: number, tenantId: number): PerformanceReview | undefined {
  return dbGet("SELECT * FROM performance_reviews WHERE id = ? AND tenant_id = ?", [id, tenantId]) as PerformanceReview | undefined;
}

// 更新绩效评估
export function updateReview(id: number, tenantId: number, data: Partial<PerformanceReview>): void {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.overall_score !== undefined) { updates.push("overall_score = ?"); params.push(data.overall_score); }
  if (data.task_completion_score !== undefined) { updates.push("task_completion_score = ?"); params.push(data.task_completion_score); }
  if (data.quality_score !== undefined) { updates.push("quality_score = ?"); params.push(data.quality_score); }
  if (data.efficiency_score !== undefined) { updates.push("efficiency_score = ?"); params.push(data.efficiency_score); }
  if (data.collaboration_score !== undefined) { updates.push("collaboration_score = ?"); params.push(data.collaboration_score); }
  if (data.innovation_score !== undefined) { updates.push("innovation_score = ?"); params.push(data.innovation_score); }
  if (data.review_notes !== undefined) { updates.push("review_notes = ?"); params.push(data.review_notes); }
  if (data.status) { updates.push("status = ?"); params.push(data.status); }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id, tenantId);
    dbRun(`UPDATE performance_reviews SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
  }
}

// 删除绩效评估
export function deleteReview(id: number, tenantId: number): void {
  dbRun("DELETE FROM performance_reviews WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// 记录绩效指标
export function recordMetric(data: Partial<PerformanceMetric>): number {
  const result = dbRun(
    `INSERT INTO performance_metrics (tenant_id, employee_id, employee_type, metric_type, metric_value, metric_unit, period)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tenant_id || 1,
      data.employee_id,
      data.employee_type || 'ai',
      data.metric_type,
      data.metric_value || 0,
      data.metric_unit || null,
      data.period || null,
    ]
  );
  return result.lastInsertRowid;
}

// 获取绩效指标
export function getMetrics(tenantId: number, filters?: { employee_id?: number; metric_type?: string; period?: string }): PerformanceMetric[] {
  let sql = "SELECT * FROM performance_metrics WHERE tenant_id = ?";
  const params: any[] = [tenantId];

  if (filters?.employee_id) { sql += " AND employee_id = ?"; params.push(filters.employee_id); }
  if (filters?.metric_type) { sql += " AND metric_type = ?"; params.push(filters.metric_type); }
  if (filters?.period) { sql += " AND period = ?"; params.push(filters.period); }

  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as PerformanceMetric[];
}

// 获取员工绩效汇总（增强版）
export function getEmployeePerformanceSummary(employeeId: number, tenantId: number): any {
  const latestReview = dbGet(
    "SELECT * FROM performance_reviews WHERE employee_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1",
    [employeeId, tenantId]
  ) as PerformanceReview | undefined;

  const metrics = dbAll(
    "SELECT metric_type, AVG(metric_value) as avg_value, COUNT(*) as count FROM performance_metrics WHERE employee_id = ? AND tenant_id = ? GROUP BY metric_type",
    [employeeId, tenantId]
  ) as any[];

  // Task stats
  const taskStats = dbGet(
    `SELECT COUNT(*) as total, 
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
            SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high
     FROM tasks WHERE assigned_to = ? AND tenant_id = ?`,
    [employeeId, tenantId]
  ) as any;

  // Chat activity stats
  const chatStats = dbGet(
    `SELECT COUNT(DISTINCT cm.chat_id) as chat_count, COUNT(m.id) as message_count
     FROM chat_members cm
     LEFT JOIN messages m ON m.chat_id = cm.chat_id AND m.sender_type = 'employee'
     WHERE cm.employee_id = ? AND cm.role = 'member'`,
    [employeeId]
  ) as any;

  // Skill count
  const skillCount = dbGet(
    "SELECT COUNT(*) as count FROM employee_skills WHERE employee_id = ? AND tenant_id = ?",
    [employeeId, tenantId]
  ) as any;

  // Reflection count
  const reflectionCount = dbGet(
    "SELECT COUNT(*) as count FROM reflections WHERE employee_id = ? AND tenant_id = ?",
    [employeeId, tenantId]
  ) as any;

  // Auto-calculate scores
  const total = taskStats?.total || 0;
  const completed = taskStats?.completed || 0;
  const taskCompletionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Quality score: based on task priority mix
  const criticalDone = taskStats?.critical || 0;
  const highDone = taskStats?.high || 0;
  const qualityScore = completed > 0 ? Math.min(100, Math.round(60 + (criticalDone * 5) + (highDone * 3) + (taskCompletionRate * 0.2))) : 0;

  // Efficiency score: based on in-progress vs total
  const inProgress = taskStats?.in_progress || 0;
  const efficiencyScore = total > 0 ? Math.round(((completed + inProgress * 0.5) / total) * 100) : 0;

  // Collaboration score: based on chat activity
  const chatCount = chatStats?.chat_count || 0;
  const collaborationScore = Math.min(100, Math.round(chatCount * 10 + (chatStats?.message_count || 0) * 2));

  // Overall score
  const overallScore = Math.round(taskCompletionRate * 0.4 + qualityScore * 0.25 + efficiencyScore * 0.2 + collaborationScore * 0.15);

  return {
    latest_review: latestReview,
    metrics: metrics,
    task_stats: {
      ...taskStats,
      completion_rate: taskCompletionRate,
    },
    chat_stats: chatStats || { chat_count: 0, message_count: 0 },
    skill_count: skillCount?.count || 0,
    reflection_count: reflectionCount?.count || 0,
    scores: {
      task_completion: taskCompletionRate,
      quality: qualityScore,
      efficiency: efficiencyScore,
      collaboration: collaborationScore,
      overall: overallScore,
    },
    completion_rate: taskCompletionRate,
  };
}

// 自动计算绩效分数
export function calculatePerformanceScore(employeeId: number, tenantId: number, period: string): Partial<PerformanceReview> {
  const taskStats = dbGet(
    `SELECT COUNT(*) as total, 
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'done' AND updated_at > datetime(created_at, '+1 day') THEN 1 ELSE 0 END) as late_completed
     FROM tasks WHERE assigned_to = ? AND tenant_id = ? AND created_at >= ?`,
    [employeeId, tenantId, period]
  ) as any;

  const total = taskStats?.total || 0;
  const completed = taskStats?.completed || 0;
  const lateCompleted = taskStats?.late_completed || 0;

  const taskCompletionScore = total > 0 ? Math.round((completed / total) * 100) : 0;
  const efficiencyScore = completed > 0 ? Math.round(((completed - lateCompleted) / completed) * 100) : 0;
  const qualityScore = Math.round((taskCompletionScore + efficiencyScore) / 2);

  const overallScore = Math.round(taskCompletionScore * 0.4 + qualityScore * 0.3 + efficiencyScore * 0.3);

  return {
    task_completion_score: taskCompletionScore,
    quality_score: qualityScore,
    efficiency_score: efficiencyScore,
    overall_score: overallScore,
  };
}
