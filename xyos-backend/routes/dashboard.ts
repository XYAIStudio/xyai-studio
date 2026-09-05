import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, AuthRequest } from "../middleware";
import { getRecentActivities } from "../services/notification";

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);

dashboardRoutes.get("/overview", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }

    const employees = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND status = 'active'", [tid]) as any;
    const aiEmployees = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active'", [tid]) as any;
    const humanEmployees = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'human' AND status = 'active'", [tid]) as any;

    const tasks = dbAll("SELECT status, COUNT(*) as count FROM tasks WHERE tenant_id = ? GROUP BY status", [tid]) as any[];
    const taskStats: Record<string, number> = { total: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of tasks) {
      taskStats[t.status] = t.count;
      taskStats.total += t.count;
    }

    // AI 员工承担的任务数（用于计算 AI 利用率）
    const aiTaskCount = dbGet(
      `SELECT COUNT(*) as c FROM tasks t JOIN employees e ON t.assigned_to = e.id 
       WHERE e.employee_type = 'ai' AND e.status = 'active' AND t.tenant_id = ? AND e.tenant_id = ?`,
      [tid, tid]
    ) as any;

    const chats = dbGet("SELECT COUNT(*) as c FROM chats WHERE tenant_id = ?", [tid]) as any;
    const messages = dbGet("SELECT COUNT(*) as c FROM messages WHERE tenant_id = ?", [tid]) as any;
    const knowledge = dbGet("SELECT COUNT(*) as c FROM knowledge_notes WHERE tenant_id = ?", [tid]) as any;

    const completionRate = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;
    const activeRate = taskStats.total > 0 ? Math.round((taskStats.in_progress / taskStats.total) * 100) : 0;
    // AI 利用率 = 分配给AI的任务数 / AI员工数（表示AI员工被利用的程度）
    const aiUtilization = aiEmployees.c > 0 ? Math.round((aiTaskCount.c / aiEmployees.c) * 100) : 0;

    res.json({
      success: true,
      data: {
        employees: {
          total: employees.c,
          ai: aiEmployees.c,
          human: humanEmployees.c,
        },
        tasks: taskStats,
        chats: chats.c,
        messages: messages.c,
        knowledge: knowledge.c,
        metrics: {
          completionRate,
          activeRate,
          aiUtilization,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/task-trend", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }
    const days = parseInt(req.query.days as string) || 7;

    const trend = dbAll(
      `SELECT DATE(created_at) as date, COUNT(*) as count, status
       FROM tasks 
       WHERE tenant_id = ? AND created_at >= datetime('now', '-${days} days')
       GROUP BY DATE(created_at), status
       ORDER BY date`,
      [tid]
    );

    res.json({ success: true, data: trend });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/employee-performance", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }

    const performance = dbAll(
      `SELECT e.id, e.name, e.role, e.avatar_emoji, e.avatar_url, e.employee_type,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'done' AND tenant_id = e.tenant_id) as completed,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'in_progress' AND tenant_id = e.tenant_id) as active,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND tenant_id = e.tenant_id) as total
       FROM employees e
       WHERE e.tenant_id = ? AND e.status = 'active'
       ORDER BY completed DESC`,
      [tid]
    );

    res.json({ success: true, data: performance });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/priority-distribution", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }
    const distribution = dbAll(
      "SELECT priority, COUNT(*) as count FROM tasks WHERE tenant_id = ? GROUP BY priority",
      [tid]
    );
    res.json({ success: true, data: distribution });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/department-stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }
    const stats = dbAll(
      `SELECT d.id, d.name,
        (SELECT COUNT(*) FROM employees WHERE department_id = d.id AND status = 'active' AND tenant_id = d.tenant_id) as employee_count,
        (SELECT COUNT(*) FROM tasks t JOIN employees e ON t.assigned_to = e.id WHERE e.department_id = d.id AND t.tenant_id = d.tenant_id AND e.tenant_id = d.tenant_id) as task_count,
        (SELECT COUNT(*) FROM tasks t JOIN employees e ON t.assigned_to = e.id WHERE e.department_id = d.id AND t.status = 'done' AND t.tenant_id = d.tenant_id AND e.tenant_id = d.tenant_id) as completed_tasks
       FROM departments d
       WHERE d.tenant_id = ?
       ORDER BY d.sort_order`,
      [tid]
    );
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/activities", (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 30;
    const activities = getRecentActivities(req.user!.tenant_id, limit);
    res.json({ success: true, data: activities });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 模块驾驶舱：一站式获取所有业务模块概览数据 =====
dashboardRoutes.get("/modules", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }

    // 组织架构
    const deptCount = (dbGet("SELECT COUNT(*) as c FROM departments WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const empTotal = (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND status = 'active'", [tid]) as any)?.c || 0;
    const empAI = (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active'", [tid]) as any)?.c || 0;
    const empHuman = (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'human' AND status = 'active'", [tid]) as any)?.c || 0;

    // 技能插件
    const skillsCount = (dbGet("SELECT COUNT(*) as c FROM skills WHERE tenant_id = ? AND enabled = 1", [tid]) as any)?.c || 0;
    const pluginsCount = (dbGet("SELECT COUNT(*) as c FROM plugins WHERE tenant_id = ? AND status = 'active'", [tid]) as any)?.c || 0;
    const talentCount = (dbGet("SELECT COUNT(*) as c FROM talent_pool WHERE tenant_id = ? AND status = 'available'", [tid]) as any)?.c || 0;

    // 沟通协作
    const chatsCount = (dbGet("SELECT COUNT(*) as c FROM chats WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const messagesCount = (dbGet("SELECT COUNT(*) as c FROM messages WHERE tenant_id = ?", [tid]) as any)?.c || 0;

    // 任务管理
    const taskStats = dbAll("SELECT status, COUNT(*) as count FROM tasks WHERE tenant_id = ? GROUP BY status", [tid]) as any[];
    const tasks: Record<string, number> = { total: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of taskStats) { tasks[t.status] = t.count; tasks.total += t.count; }
    const taskCompletionRate = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;

    // 合同管理
    const contractsActive = (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND status IN ('active','in_progress')", [tid]) as any)?.c || 0;
    const contractsTotal = (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const contractsValue = (dbGet("SELECT COALESCE(SUM(amount),0) as v FROM contracts WHERE tenant_id = ? AND status = 'active'", [tid]) as any)?.v || 0;
    const paymentsOverdue = (dbGet(
      "SELECT COUNT(*) as c FROM contract_payments cp JOIN contracts c ON cp.contract_id = c.id WHERE c.tenant_id = ? AND cp.paid = 0 AND cp.due_date < date('now')", [tid]
    ) as any)?.c || 0;

    // 资产管理
    const assetsTotal = (dbGet("SELECT COUNT(*) as c FROM assets WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const assetsValue = (dbGet("SELECT COALESCE(SUM(purchase_price),0) as v FROM assets WHERE tenant_id = ?", [tid]) as any)?.v || 0;
    const assetsInUse = (dbGet("SELECT COUNT(*) as c FROM assets WHERE tenant_id = ? AND status = 'in_use'", [tid]) as any)?.c || 0;
    const assetsIdle = (dbGet("SELECT COUNT(*) as c FROM assets WHERE tenant_id = ? AND status IN ('idle','in_stock')", [tid]) as any)?.c || 0;
    // 资产告警：保险到期30天内
    const vehicleAlerts = (dbGet(
      "SELECT COUNT(*) as c FROM asset_vehicles av JOIN assets a ON av.asset_id = a.id WHERE a.tenant_id = ? AND av.insurance_expire <= date('now','+30 days')", [tid]
    ) as any)?.c || 0;
    // 校准到期30天内
    const calAlerts = (dbGet(
      "SELECT COUNT(*) as c FROM asset_instruments ai JOIN assets a ON ai.asset_id = a.id WHERE a.tenant_id = ? AND ai.next_calibration <= date('now','+30 days')", [tid]
    ) as any)?.c || 0;

    // 目标管理
    const goalsTotal = (dbGet("SELECT COUNT(*) as c FROM goals WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const goalsCompleted = (dbGet("SELECT COUNT(*) as c FROM goals WHERE tenant_id = ? AND progress >= 100", [tid]) as any)?.c || 0;
    const goalsActive = (dbGet("SELECT COUNT(*) as c FROM goals WHERE tenant_id = ? AND status = 'active' AND progress < 100", [tid]) as any)?.c || 0;

    // 预算管理
    const budgetsTotal = (dbGet("SELECT COUNT(*) as c FROM budgets WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const budgetsSum = (dbGet("SELECT COALESCE(SUM(limit_amount),0) as v FROM budgets WHERE tenant_id = ?", [tid]) as any)?.v || 0;

    // 流程管理
    const workflowsTotal = (dbGet("SELECT COUNT(*) as c FROM workflow_instances WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const workflowsActive = (dbGet("SELECT COUNT(*) as c FROM workflow_instances WHERE tenant_id = ? AND status = 'running'", [tid]) as any)?.c || 0;

    // 绩效评估
    const perfReviews = (dbGet("SELECT COUNT(*) as c FROM performance_reviews WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const perfAvg = (dbGet("SELECT COALESCE(ROUND(AVG(overall_score),0),0) as v FROM performance_reviews WHERE tenant_id = ?", [tid]) as any)?.v || 0;

    // 效能指标（routines表 status='active' 表示调度启用，非完成状态）
    const routinesTotal = (dbGet("SELECT COUNT(*) as c FROM routines WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    const routinesActive = (dbGet("SELECT COUNT(*) as c FROM routines WHERE tenant_id = ? AND status = 'active'", [tid]) as any)?.c || 0;

    // 知识库
    const knowledgeCount = (dbGet("SELECT COUNT(*) as c FROM knowledge_notes WHERE tenant_id = ?", [tid]) as any)?.c || 0;

    // 反思引擎
    const reflectionsCount = (dbGet("SELECT COUNT(*) as c FROM reflections WHERE tenant_id = ?", [tid]) as any)?.c || 0;

    // 治理引擎 — 使用实际存在的 h2a2a_governance_log 表
    let governanceLogs = 0;
    try {
      governanceLogs = (dbGet("SELECT COUNT(*) as c FROM h2a2a_governance_log WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    } catch { /* 表可能不存在 */ }

    // 审计追溯 — 使用实际存在的 org_behavior_audit 表
    let auditLogs = 0;
    try {
      auditLogs = (dbGet("SELECT COUNT(*) as c FROM org_behavior_audit WHERE tenant_id = ?", [tid]) as any)?.c || 0;
    } catch { /* 表可能不存在 */ }

    res.json({
      success: true,
      data: {
        org: { departments: deptCount, totalEmployees: empTotal, aiEmployees: empAI, humanEmployees: empHuman },
        skills: { skills: skillsCount, plugins: pluginsCount, talent: talentCount },
        chat: { chats: chatsCount, messages: messagesCount },
        tasks: { ...tasks, completionRate: taskCompletionRate },
        contracts: { total: contractsTotal, active: contractsActive, activeValue: contractsValue, paymentsOverdue },
        assets: { total: assetsTotal, totalValue: assetsValue, inUse: assetsInUse, idle: assetsIdle, alerts: vehicleAlerts + calAlerts },
        goals: { total: goalsTotal, active: goalsActive, completed: goalsCompleted },
        budgets: { total: budgetsTotal, totalAmount: budgetsSum },
        workflows: { total: workflowsTotal, active: workflowsActive },
        performance: { reviews: perfReviews, avgScore: perfAvg },
        efficiency: { routines: routinesTotal, active: routinesActive },
        knowledge: { notes: knowledgeCount },
        reflections: { total: reflectionsCount },
        governance: { rules: governanceLogs },
        audit: { logs: auditLogs },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

dashboardRoutes.get("/ai-stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    if (tid == null) {
      return res.status(400).json({ success: false, error: "租户信息缺失，请重新登录" });
    }

    const aiMessages = dbGet(
      "SELECT COUNT(*) as c FROM messages WHERE sender_type = 'employee' AND tenant_id = ?",
      [tid]
    ) as any;

    const humanMessages = dbGet(
      "SELECT COUNT(*) as c FROM messages WHERE sender_type = 'user' AND tenant_id = ?",
      [tid]
    ) as any;

    const aiTasks = dbGet(
      "SELECT COUNT(*) as c FROM tasks t JOIN employees e ON t.assigned_to = e.id WHERE e.employee_type = 'ai' AND t.tenant_id = ? AND e.tenant_id = ?",
      [tid, tid]
    ) as any;

    const completedAiTasks = dbGet(
      "SELECT COUNT(*) as c FROM tasks t JOIN employees e ON t.assigned_to = e.id WHERE e.employee_type = 'ai' AND t.status = 'done' AND t.tenant_id = ? AND e.tenant_id = ?",
      [tid, tid]
    ) as any;

    res.json({
      success: true,
      data: {
        messages: { ai: aiMessages.c, human: humanMessages.c },
        tasks: { assigned: aiTasks.c, completed: completedAiTasks.c },
        efficiency: aiTasks.c > 0 ? Math.round((completedAiTasks.c / aiTasks.c) * 100) : 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
