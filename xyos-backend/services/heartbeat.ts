import { dbGet, dbAll, dbRun } from "../db";
import { saveShortMemory } from "./memory";
import { callLLM } from "./ai";
import { getUpcomingPayments, recordAlertSent } from "./contract";
import { sendPaymentAlert } from "./feishu";
import { getAlertConfig } from "./contract";
import { createNotification } from "./notification";
import { AuditTrailEngine } from "./audit-trail";

// 心跳执行引擎
let heartbeatTimer: NodeJS.Timeout | null = null;

export function startHeartbeatEngine(): void {
  if (heartbeatTimer) return;
  
  console.log("[心跳] 引擎启动");
  
  // 每60秒检查一次
  heartbeatTimer = setInterval(async () => {
    try {
      await executeHeartbeats();
    } catch (err) {
      console.error("[心跳] 执行错误:", err);
    }
  }, 60000);
  
  // 立即执行一次
  executeHeartbeats();
}

export function stopHeartbeatEngine(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log("[心跳] 引擎停止");
  }
}

// 执行所有到期的心跳
async function executeHeartbeats(): Promise<void> {
  const now = new Date().toISOString();
  
  // 获取所有到期的心跳计划
  const schedules = dbAll(
    `SELECT hs.*, e.name as agent_name, e.agent_type, e.tenant_id
     FROM heartbeat_schedules hs
     INNER JOIN employees e ON hs.agent_id = e.id
     WHERE hs.enabled = 1 AND hs.next_run <= ?
     ORDER BY hs.next_run`,
    [now]
  ) as any[];
  
  for (const schedule of schedules) {
    await executeSingleHeartbeat(schedule);
  }
}

// 执行单个心跳
async function executeSingleHeartbeat(schedule: any): Promise<void> {
  const startTime = Date.now();
  let result = '';
  let action = '';
  
  try {
    switch (schedule.task_type) {
      case 'check_tasks':
        action = '检查任务队列';
        result = await checkAndClaimTask(schedule.agent_id, schedule.tenant_id);
        break;
      
      case 'auto_execute':
        action = '自动执行任务';
        result = await autoExecuteTask(schedule.agent_id, schedule.agent_type, schedule.tenant_id);
        break;
      
      case 'dream':
        action = 'Dream记忆整合';
        result = '跳过（手动触发）';
        break;
      
      case 'patrol':
        action = '系统巡检';
        result = await systemPatrol(schedule.tenant_id);
        break;

      case 'contract_payment_alert':
        action = '合同进度款预警';
        result = await contractPaymentAlert(schedule.tenant_id);
        break;
      
      default:
        action = schedule.task_type;
        result = '未知任务类型';
    }
    
    // 记录日志
    const duration = Date.now() - startTime;
    dbRun(
      `INSERT INTO heartbeat_logs (agent_id, schedule_id, action, result, duration_ms, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schedule.agent_id, schedule.id, action, result, duration, schedule.tenant_id]
    );
    
    // 更新下次执行时间
    const nextRun = calculateNextRun(schedule.cron_expression);
    dbRun(
      "UPDATE heartbeat_schedules SET last_run = ?, next_run = ? WHERE id = ?",
      [new Date().toISOString(), nextRun, schedule.id]
    );
    
  } catch (err: any) {
    console.error(`[心跳] 执行失败 agent=${schedule.agent_id}:`, err.message);
    
    dbRun(
      `INSERT INTO heartbeat_logs (agent_id, schedule_id, action, result, duration_ms, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schedule.agent_id, schedule.id, '执行失败', err.message, Date.now() - startTime, schedule.tenant_id]
    );
  }
}

// 检查并领取任务
async function checkAndClaimTask(agentId: number, tenantId: number): Promise<string> {
  // 查找未锁定的任务
  const task = dbGet(
    `SELECT * FROM tasks 
     WHERE tenant_id = ? AND status = 'todo' AND (locked_by IS NULL OR locked_at < datetime('now', '-1 hour'))
     ORDER BY 
       CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       created_at ASC
     LIMIT 1`,
    [tenantId]
  ) as any;
  
  if (!task) {
    return '无待处理任务';
  }
  
  // 锁定任务
  dbRun(
    "UPDATE tasks SET locked_by = ?, locked_at = datetime('now') WHERE id = ?",
    [agentId, task.id]
  );
  
  // 保存到记忆
  saveShortMemory(agentId, 'task_context', `领取任务: ${task.title}`, undefined, { task_id: task.id }, tenantId);
  
  return `领取任务: ${task.title}`;
}

// AI自动执行任务
async function autoExecuteTask(agentId: number, agentType: string, tenantId: number): Promise<string> {
  // 查找分配给该AI员工的待处理或进行中的任务
  const task = dbGet(
    `SELECT * FROM tasks 
     WHERE assigned_to = ? AND tenant_id = ? AND status IN ('todo', 'in_progress')
     ORDER BY 
       CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       created_at ASC
     LIMIT 1`,
    [agentId, tenantId]
  ) as any;

  if (!task) {
    return '无待执行任务';
  }

  // 获取员工信息
  const employee = dbGet("SELECT * FROM employees WHERE id = ?", [agentId]) as any;
  if (!employee) return '员工不存在';

  // 获取任务的子任务和评论
  const subtasks = dbAll("SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order", [task.id]) as any[];
  const comments = dbAll("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 5", [task.id]) as any[];

  const subtaskInfo = subtasks.length > 0 
    ? `\n子任务:\n${subtasks.map((s: any, i: number) => `${i+1}. [${s.completed ? '✓' : '○'}] ${s.title}`).join('\n')}`
    : '';
  
  const commentInfo = comments.length > 0
    ? `\n最近评论:\n${comments.map((c: any) => `- ${c.content.substring(0, 100)}`).join('\n')}`
    : '';

  // 使用LLM生成任务执行方案
  const prompt = `你是${employee.name}，角色是${employee.role || agentType}。

你被分配了一个任务，请分析任务并给出具体的执行方案。

任务信息:
- 标题: ${task.title}
- 描述: ${task.description || '无描述'}
- 优先级: ${task.priority}
- 状态: ${task.status}
${subtaskInfo}
${commentInfo}

请给出:
1. 任务分析（理解任务目标和要求）
2. 执行方案（具体的步骤和方法）
3. 预期产出（完成后的交付物）
4. 所需资源（如果需要其他部门配合请说明）

回复要专业、具体、可执行。`;

  const result = await callLLM([
    { role: "system", content: `你是${employee.name}，${employee.role || ''}。请认真分析任务并给出专业方案。` },
    { role: "user", content: prompt }
  ], 0.7, 1500);

  // 添加执行方案为评论
  dbRun(
    `INSERT INTO task_comments (task_id, employee_id, content, comment_type, tenant_id)
     VALUES (?, ?, ?, 'ai_analysis', ?)`,
    [task.id, agentId, result.content, tenantId]
  );

  // 更新任务状态为进行中
  if (task.status === 'todo') {
    dbRun("UPDATE tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [task.id]);
  }

  // 记录到记忆
  saveShortMemory(agentId, 'task_execution', `执行任务: ${task.title}`, undefined, { task_id: task.id, analysis: result.content.substring(0, 200) }, tenantId);

  return `已分析任务「${task.title}」并生成执行方案`;
}

// 系统巡检
async function systemPatrol(tenantId: number): Promise<string> {
  const issues: string[] = [];
  
  // 检查过期任务
  const overdueTasks = dbGet(
    "SELECT COUNT(*) as c FROM tasks WHERE tenant_id = ? AND status = 'in_progress' AND updated_at < datetime('now', '-7 days')",
    [tenantId]
  ) as any;
  if (overdueTasks?.c > 0) issues.push(`${overdueTasks.c}个任务超过7天未更新`);
  
  // 检查未读消息
  const unreadMsgs = dbGet(
    "SELECT COUNT(*) as c FROM messages WHERE tenant_id = ? AND created_at > datetime('now', '-1 day')",
    [tenantId]
  ) as any;
  
  return issues.length > 0 ? `发现: ${issues.join('; ')}` : '系统正常';
}

// 计算下次运行时间（简化版，只支持分钟级间隔）
function calculateNextRun(cronExpression: string): string {
  // 解析 */N 格式
  const match = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (match) {
    const minutes = parseInt(match[1]);
    const next = new Date(Date.now() + minutes * 60 * 1000);
    return next.toISOString();
  }
  
  // 默认30分钟后
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

// 创建心跳计划
export function createHeartbeatSchedule(agentId: number, taskType: string, cronExpression: string = '*/30 * * * *', tenantId: number = 1): number {
  const nextRun = calculateNextRun(cronExpression);
  
  const result = dbRun(
    `INSERT INTO heartbeat_schedules (agent_id, cron_expression, task_type, next_run, tenant_id)
     VALUES (?, ?, ?, ?, ?)`,
    [agentId, cronExpression, taskType, nextRun, tenantId]
  );
  
  return result.lastInsertRowid;
}

// 获取心跳计划列表
export function getHeartbeatSchedules(tenantId: number = 1): any[] {
  return dbAll(
    `SELECT hs.*, e.name as agent_name, e.agent_type
     FROM heartbeat_schedules hs
     INNER JOIN employees e ON hs.agent_id = e.id
     WHERE hs.tenant_id = ?
     ORDER BY hs.next_run`,
    [tenantId]
  );
}

// 获取心跳日志
export function getHeartbeatLogs(agentId?: number, tenantId: number = 1, limit: number = 50): any[] {
  if (agentId) {
    return dbAll(
      "SELECT * FROM heartbeat_logs WHERE agent_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?",
      [agentId, tenantId, limit]
    );
  }
  return dbAll(
    "SELECT * FROM heartbeat_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
    [tenantId, limit]
  );
}

// 更新心跳计划
export function updateHeartbeatSchedule(id: number, data: { enabled?: number; cron_expression?: string }): void {
  const updates: string[] = [];
  const params: any[] = [];
  
  if (data.enabled !== undefined) { updates.push("enabled = ?"); params.push(data.enabled); }
  if (data.cron_expression) { updates.push("cron_expression = ?"); params.push(data.cron_expression); }
  
  if (updates.length > 0) {
    params.push(id);
    dbRun(`UPDATE heartbeat_schedules SET ${updates.join(", ")} WHERE id = ?`, params);
  }
}

// 删除心跳计划
export function deleteHeartbeatSchedule(id: number): void {
  dbRun("DELETE FROM heartbeat_schedules WHERE id = ?", [id]);
}

// 手动触发心跳
export async function triggerHeartbeat(agentId: number, tenantId: number = 1): Promise<string> {
  const agent = dbGet("SELECT * FROM employees WHERE id = ?", [agentId]) as any;
  if (!agent) throw new Error("员工不存在");
  
  // 先尝试自动执行
  const execResult = await autoExecuteTask(agentId, agent.agent_type || '', tenantId);
  if (!execResult.includes('无待执行任务')) {
    return execResult;
  }
  
  // 如果没有待执行任务，尝试领取新任务
  return await checkAndClaimTask(agentId, tenantId);
}

// ===== 合同进度款预警 =====
async function contractPaymentAlert(tenantId: number): Promise<string> {
  try {
    const payments = getUpcomingPayments(tenantId);
    if (payments.length === 0) return "无待预警的进度款";

    const config = getAlertConfig(tenantId);
    const today = new Date().toISOString().split("T")[0];
    let alertedCount = 0;

    for (const p of payments) {
      // V4: 去重 — 今天已预警过的跳过
      if (p.last_alerted_at && p.last_alerted_at.startsWith(today)) {
        continue;
      }

      const directionLabel = p.direction === "payable" ? "应付" : "应收";
      const daysLabel = p.days_left < 0
        ? `已逾期${Math.abs(p.days_left)}天`
        : `还有${p.days_left}天到期`;
      const urgencyEmoji = p.days_left < 0 ? "🔴" : p.days_left <= 3 ? "🟠" : "🟡";
      const actionSuggestion = p.direction === "payable"
        ? "请尽快安排付款，避免合同违约"
        : "请及时跟进收款，确保资金回笼";

      const notificationContent = [
        `${urgencyEmoji} 【${p.contract_no}】${p.contract_title}`,
        `节点：${p.label}`,
        `金额：¥${(p.amount / 10000).toFixed(2)}万元`,
        `对方：${p.party_b}`,
        `到期日：${p.due_date}（${daysLabel}）`,
        `💡 ${actionSuggestion}`,
      ].join("\n");

      // 站内通知
      try {
        createNotification({
          userId: p.created_by || 0,
          type: "contract_payment_due",
          title: `${urgencyEmoji} ${directionLabel}预警 — ${p.contract_title}`,
          content: notificationContent,
          link: `/contracts`,
          tenantId,
        });
      } catch (e) { /* 通知失败不影响流程 */ }

      // 飞书推送
      if (config.enable_feishu && config.feishu_webhook) {
        try {
          await sendPaymentAlert(config.feishu_webhook, {
            contractTitle: p.contract_title,
            contractNo: p.contract_no,
            direction: p.direction as "receivable" | "payable",
            partyB: p.party_b,
            paymentLabel: p.label,
            amount: p.amount,
            dueDate: p.due_date,
            daysLeft: p.days_left,
          });
        } catch (e) { /* 飞书失败不影响流程 */ }
      }

      // V4: 记录预警发送
      try {
        recordAlertSent(p.id);
      } catch (e) { /* 记录失败不影响 */ }

      // 审计日志
      try {
        AuditTrailEngine.logOrgBehavior({
          tenantId,
          actorType: "system",
          actorId: 0,
          actorName: "预警引擎",
          actionType: "payment_alert",
          actionDetail: `合同进度款预警: ${p.contract_title} - ${p.label} ${daysLabel}`,
          targetType: "payment",
          targetId: p.id,
          targetName: `${p.contract_title} - ${p.label}`,
          context: JSON.stringify({ days_left: p.days_left, amount: p.amount, alert_count: p.alert_count + 1 }),
        });
      } catch (e) { /* 审计失败不影响流程 */ }

      alertedCount++;
    }

    return alertedCount > 0
      ? `已发送 ${alertedCount} 条预警 (${payments.map(p => p.label).join(", ")})`
      : "今日无新预警";
  } catch (err: any) {
    return `预警执行失败: ${err.message}`;
  }
}
