import { dbRun, dbGet, dbAll } from "../db";

export class EfficiencyEngine {
  static calculateTaskEfficiency(tenantId: number): number {
    const total = dbGet("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ?", [tenantId]) as any;
    const completed = dbGet("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ? AND status = 'done'", [tenantId]) as any;
    return total.c > 0 ? Math.round((completed.c / total.c) * 10000) / 100 : 0;
  }

  static calculateCollaborationEfficiency(tenantId: number): number {
    const result = dbGet(
      `SELECT AVG(julianday(updated_at) - julianday(created_at)) * 24 as avg_hours
       FROM tasks WHERE tenant_id = ? AND status = 'done'`,
      [tenantId]
    ) as any;
    return Math.round((result.avg_hours || 0) * 100) / 100;
  }

  static calculateKnowledgeEfficiency(tenantId: number): number {
    const messages = dbGet(
      `SELECT COUNT(*) as c FROM messages m
       JOIN chat_members cm ON m.chat_id = cm.chat_id
       WHERE cm.user_id IN (SELECT id FROM users WHERE tenant_id = ?) AND m.sender_type = 'user'`,
      [tenantId]
    ) as any;
    const knowledge = dbGet("SELECT COUNT(*) as c FROM knowledge_notes WHERE tenant_id = ?", [tenantId]) as any;
    return messages.c > 0 ? Math.round((knowledge.c / messages.c) * 10000) / 100 : 0;
  }

  static calculateCostEfficiency(tenantId: number): number {
    const humans = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'human'", [tenantId]) as any;
    const ais = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'ai'", [tenantId]) as any;
    const humanCost = humans.c * 10000;
    const aiCost = ais.c * 100;
    return humanCost > 0 ? Math.round(((humanCost - aiCost) / humanCost) * 10000) / 100 : 0;
  }

  static calculateGovernanceEfficiency(tenantId: number): number {
    const totalOps = dbGet("SELECT COUNT(*) as c FROM org_behavior_audit WHERE tenant_id = ?", [tenantId]) as any;
    const governedOps = dbGet("SELECT COUNT(*) as c FROM org_behavior_audit WHERE tenant_id = ? AND governance_result IS NOT NULL", [tenantId]) as any;
    return totalOps.c > 0 ? Math.round((governedOps.c / totalOps.c) * 10000) / 100 : 0;
  }

  static calculateDailyMetrics(tenantId: number) {
    const today = new Date().toISOString().split("T")[0];
    const metrics = {
      taskCompletionRate: this.calculateTaskEfficiency(tenantId),
      collaborationEfficiency: this.calculateCollaborationEfficiency(tenantId),
      knowledgeSedimentRate: this.calculateKnowledgeEfficiency(tenantId),
      costSavingRate: this.calculateCostEfficiency(tenantId),
      governanceCoverageRate: this.calculateGovernanceEfficiency(tenantId),
      totalTasks: (dbGet("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ?", [tenantId]) as any).c,
      completedTasks: (dbGet("SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ? AND status = 'done'", [tenantId]) as any).c,
      totalAgents: (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ?", [tenantId]) as any).c,
      activeAgents: (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND status = 'active'", [tenantId]) as any).c,
    };

    dbRun(
      `INSERT OR REPLACE INTO org_efficiency_metrics
       (tenant_id, metric_date, task_completion_rate, collaboration_efficiency, knowledge_sediment_rate, cost_saving_rate, governance_coverage_rate, total_tasks, completed_tasks, total_agents, active_agents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, today, metrics.taskCompletionRate, metrics.collaborationEfficiency, metrics.knowledgeSedimentRate, metrics.costSavingRate, metrics.governanceCoverageRate, metrics.totalTasks, metrics.completedTasks, metrics.totalAgents, metrics.activeAgents]
    );

    return metrics;
  }

  static getDashboard(tenantId: number) {
    const latest = dbGet("SELECT * FROM org_efficiency_metrics WHERE tenant_id = ? ORDER BY metric_date DESC LIMIT 1", [tenantId]);
    const trends = dbAll("SELECT * FROM org_efficiency_metrics WHERE tenant_id = ? ORDER BY metric_date DESC LIMIT 30", [tenantId]);
    const deptEfficiency = dbAll(
      `SELECT d.name as dept_name, COUNT(e.id) as emp_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to IN (SELECT id FROM employees WHERE department_id = d.id) AND tenant_id = ?) as task_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to IN (SELECT id FROM employees WHERE department_id = d.id) AND status = 'done' AND tenant_id = ?) as done_count
       FROM departments d LEFT JOIN employees e ON e.department_id = d.id AND e.tenant_id = ?
       WHERE d.tenant_id = ? GROUP BY d.id HAVING emp_count > 0`,
      [tenantId, tenantId, tenantId, tenantId]
    );

    // 增强统计：任务状态分布
    const taskStatusDist = dbAll(
      `SELECT status, COUNT(*) as count FROM tasks WHERE tenant_id = ? GROUP BY status`,
      [tenantId]
    );

    // 增强统计：AI员工效能排名
    const agentPerformance = dbAll(
      `SELECT e.name, e.role, 
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'done') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id) as total_tasks,
        (SELECT COUNT(*) FROM messages WHERE sender_id = e.id AND sender_type = 'employee') as message_count
       FROM employees e WHERE e.tenant_id = ? AND e.employee_type = 'ai'
       ORDER BY completed_tasks DESC LIMIT 10`,
      [tenantId]
    );

    // 增强统计：协作网络（聊天室数量和参与度）
    const chatStats = dbGet(
      `SELECT COUNT(DISTINCT chat_id) as chat_count,
        COUNT(DISTINCT user_id) as active_users
       FROM chat_members cm
       LEFT JOIN users u ON cm.user_id = u.id AND u.tenant_id = ?`,
      [tenantId]
    );

    return { latest, trends, deptEfficiency, taskStatusDist, agentPerformance, chatStats };
  }
}
