import { dbGet, dbAll, dbRun } from "../db";
import { callLLM, AIMessage } from "./ai";
import { GovernanceEngine } from "./governance";
import { FEATURE_FLAGS } from "../config/features";

// 任务编排引擎

// 敏感操作类型（需强制人工确认）
const SENSITIVE_ACTIONS = [
  "审批", "approval", "财务", "finance", "支付", "payment",
  "数据删除", "data_delete", "系统配置", "system_config",
  "人事任免", "personnel", "合同签署", "contract_sign",
];

export interface OrchestrationTask {
  id: number;
  title: string;
  description: string;
  goal: string;
  status: 'pending' | 'analyzing' | 'decomposing' | 'matching' | 'executing' | 'reviewing' | 'completed' | 'failed';
  created_by: number;
  tenant_id: number;
  idempotency_key?: string;
  plan_snapshot?: string;
  execution_snapshot?: string;
  version?: number;
}

export interface SubTask {
  id: number;
  orchestration_id: number;
  title: string;
  description: string;
  required_skills: string;
  assigned_to: number | null;
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed';
  depends_on: string;
  result: string;
  sort_order: number;
  requires_human_review?: boolean;
  node_id?: string;
  dependency_ids?: string;
}

export interface CreateOrchestrationOptions {
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

function stableNodeId(orchestrationId: number, index: number): string {
  return `orch-${orchestrationId}-node-${index + 1}`;
}

function parseDependsOn(dependsOn: unknown, titleToNodeId: Map<string, string>): string[] {
  if (!dependsOn) return [];
  const raw = Array.isArray(dependsOn) ? dependsOn : String(dependsOn).split(/[,，]/);
  return raw.map((item) => String(item).trim()).filter(Boolean).map((item) => titleToNodeId.get(item) || item);
}

function savePlanSnapshot(orchestrationId: number, snapshot: Record<string, unknown>): void {
  dbRun(
    "UPDATE orchestration_tasks SET plan_snapshot = ?, version = COALESCE(version, 1) + 1 WHERE id = ?",
    [JSON.stringify(snapshot), orchestrationId]
  );
}

function saveExecutionSnapshot(orchestrationId: number, snapshot: Record<string, unknown>): void {
  dbRun(
    "UPDATE orchestration_tasks SET execution_snapshot = ?, version = COALESCE(version, 1) + 1 WHERE id = ?",
    [JSON.stringify(snapshot), orchestrationId]
  );
}

/**
 * 检测子任务是否属于敏感操作
 */
function isSensitiveAction(subtaskTitle: string, subtaskDescription: string): boolean {
  const text = `${subtaskTitle} ${subtaskDescription}`.toLowerCase();
  return SENSITIVE_ACTIONS.some(keyword => text.includes(keyword.toLowerCase()));
}

// 创建编排任务
export function createOrchestration(title: string, description: string, goal: string, createdBy: number, tenantId: number, options: CreateOrchestrationOptions = {}): number {
  if (options.idempotencyKey) {
    const existing = dbGet(
      "SELECT id FROM orchestration_tasks WHERE tenant_id = ? AND created_by = ? AND idempotency_key = ?",
      [tenantId, createdBy, options.idempotencyKey]
    ) as any;
    if (existing?.id) return existing.id;
  }
  const result = dbRun(
    `INSERT INTO orchestration_tasks (title, description, goal, status, idempotency_key, plan_snapshot, created_by, tenant_id)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      title,
      description,
      goal,
      options.idempotencyKey || null,
      JSON.stringify({ createdAt: new Date().toISOString(), metadata: options.metadata || {}, status: "pending" }),
      createdBy,
      tenantId,
    ]
  );
  return result.lastInsertRowid;
}

// 分析任务
export async function analyzeTask(orchestrationId: number): Promise<any> {
  const task = dbGet("SELECT * FROM orchestration_tasks WHERE id = ?", [orchestrationId]) as any;
  if (!task) throw new Error("编排任务不存在");

  // [V4.1] 治理校验：检查任务创建者是否有权发起编排
  if (FEATURE_FLAGS.ENABLE_GOVERNANCE_ORCHESTRATION) {
    // 动态获取创建者的实际层级（employees.position_level_id，users 表无 ai_level 列）
    const creator = dbGet("SELECT e.position_level_id AS ai_level FROM employees e WHERE e.user_id = ? AND e.tenant_id = ?", [task.created_by, task.tenant_id]) as any;
    const actorLevel = creator?.ai_level || 1;

    const governanceResult = GovernanceEngine.validateAction({
      tenantId: task.tenant_id,
      actorType: "human",
      actorId: task.created_by,
      actorLevel,
      targetType: "orchestration",
      targetId: orchestrationId,
      action: "create_orchestration",
    });

    GovernanceEngine.logGovernance({
      tenantId: task.tenant_id,
      actionId: `orch_${orchestrationId}`,
      actorType: "human",
      actorId: task.created_by,
      actorLevel,
      targetType: "orchestration",
      targetId: orchestrationId,
      permissionCheck: governanceResult.allowed ? "allow" : "deny",
      commRuleCheck: governanceResult.allowed ? "allow" : "deny",
      processCheck: governanceResult.allowed ? "allow" : "deny",
      result: governanceResult.allowed ? "allow" : "deny",
      reason: governanceResult.reason,
    });

    if (!governanceResult.allowed) {
      dbRun("UPDATE orchestration_tasks SET status = 'failed' WHERE id = ?", [orchestrationId]);
      throw new Error(`治理校验未通过: ${governanceResult.reason}`);
    }
  }

  // 更新状态
  dbRun("UPDATE orchestration_tasks SET status = 'analyzing' WHERE id = ?", [orchestrationId]);

  // 获取可用员工
  const employees = dbAll(
    "SELECT * FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active'",
    [task.tenant_id]
  ) as any[];

  const employeeInfo = employees.map(e => `${e.name}(${e.role}，技能:${e.skills || '通用'})`).join('\n');

  // AI分析任务
  const messages: AIMessage[] = [
    { role: "system", content: `你是任务分析专家。请分析以下任务，输出JSON格式：
{
  "subtasks": [
    {"title": "子任务标题", "description": "详细描述", "required_skills": "需要的技能", "depends_on": "依赖的子任务标题或空"}
  ],
  "required_roles": ["需要的角色类型"]
}` },
    { role: "user", content: `任务: ${task.title}\n描述: ${task.description}\n目标: ${task.goal}\n\n可用员工:\n${employeeInfo}` }
  ];

  const response = await callLLM(messages, 0.5, 1024);

  // 解析结果
  let analysis;
  try {
    const codeBlockMatch = response.content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    let jsonString = '';
    
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    } else {
      const jsonMatch = response.content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
    }
    
    analysis = jsonString ? JSON.parse(jsonString) : { subtasks: [], required_roles: [] };
  } catch {
    analysis = { subtasks: [], required_roles: [] };
  }

  // 创建子任务
  if (analysis.subtasks) {
    const titleToNodeId = new Map<string, string>();
    analysis.subtasks.forEach((sub: any, i: number) => {
      titleToNodeId.set(String(sub.title || `子任务 ${i + 1}`), stableNodeId(orchestrationId, i));
    });
    for (let i = 0; i < analysis.subtasks.length; i++) {
      const sub = analysis.subtasks[i];
      const needsReview = isSensitiveAction(sub.title, sub.description);
      const nodeId = stableNodeId(orchestrationId, i);
      const dependencyIds = parseDependsOn(sub.depends_on, titleToNodeId);
      dbRun(
        `INSERT INTO sub_tasks (orchestration_id, title, description, required_skills, depends_on, sort_order, node_id, dependency_ids, requires_human_review, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orchestrationId, sub.title, sub.description, sub.required_skills || '', sub.depends_on || '', i, nodeId, JSON.stringify(dependencyIds), needsReview ? 1 : 0, task.tenant_id]
      );

      // [V4.1] 敏感操作自动写入待审核表
      if (needsReview && FEATURE_FLAGS.ENABLE_HUMAN_IN_THE_LOOP) {
        dbRun(
          `INSERT INTO pending_reviews (tenant_id, review_type, initiator_user_id, ai_content, structured_data, status)
           VALUES (?, 'task_assignment', ?, ?, ?, 'pending')`,
          [task.tenant_id, task.created_by, `子任务"${sub.title}"涉及敏感操作，需要人工审核确认`, JSON.stringify(sub)]
        );
      }
    }
  }

  // 更新状态
  dbRun("UPDATE orchestration_tasks SET status = 'decomposing' WHERE id = ?", [orchestrationId]);
  const persistedSubtasks = dbAll(
    "SELECT id, node_id, title, description, required_skills, depends_on, dependency_ids, requires_human_review, sort_order FROM sub_tasks WHERE orchestration_id = ? ORDER BY sort_order",
    [orchestrationId]
  );
  savePlanSnapshot(orchestrationId, {
    schemaVersion: "xyai.orchestration.plan.v1",
    orchestrationId,
    generatedAt: new Date().toISOString(),
    requiredRoles: analysis.required_roles || [],
    subtasks: persistedSubtasks,
    qualityGates: ["dependency-check", "skill-match", "governance-check", "human-review-for-sensitive-actions"],
  });

  return { task, subtasks: analysis.subtasks || [] };
}

// 能力匹配
export async function matchAgents(orchestrationId: number): Promise<any[]> {
  const subtasks = dbAll(
    "SELECT * FROM sub_tasks WHERE orchestration_id = ? AND assigned_to IS NULL ORDER BY sort_order",
    [orchestrationId]
  ) as any[];

  const task = dbGet("SELECT * FROM orchestration_tasks WHERE id = ?", [orchestrationId]) as any;
  const employees = dbAll(
    "SELECT * FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active'",
    [task.tenant_id]
  ) as any[];

  const assignments = [];

  for (const subtask of subtasks) {
    // [V4.1] 治理校验：每个子任务分配前校验 AI 员工权限
    let bestAgent = null;
    let bestScore = -1;

    for (const emp of employees) {
      // 治理引擎权限校验
      if (FEATURE_FLAGS.ENABLE_GOVERNANCE_ORCHESTRATION) {
        const govCheck = GovernanceEngine.validateAction({
          tenantId: task.tenant_id,
          actorType: "ai",
          actorId: emp.id,
          actorLevel: emp.position_level_id || 1,
          targetType: "subtask",
          targetId: subtask.id,
          action: `execute_${subtask.title}`,
        });

        if (!govCheck.allowed) {
          // 该 AI 员工无权限执行此子任务，跳过
          continue;
        }
      }

      // 技能匹配度
      const empSkills = (emp.skills || '').toLowerCase().split(',');
      const requiredSkills = (subtask.required_skills || '').toLowerCase().split(',');
      const skillMatch = requiredSkills.filter((s: any) => empSkills.some((es: any) => es.includes(s.trim()) || s.trim().includes(es))).length / Math.max(requiredSkills.length, 1);

      // 负载（当前任务数）
      const activeTasks = dbGet(
        "SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status IN ('todo', 'in_progress')",
        [emp.id]
      ) as any;
      const loadScore = 1 - Math.min((activeTasks?.c || 0) / 5, 1);

      // 历史质量（完成率）
      const totalTasks = dbGet("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ?", [emp.id]) as any;
      const completedTasks = dbGet("SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'done'", [emp.id]) as any;
      const qualityScore = totalTasks?.c > 0 ? (completedTasks?.c || 0) / totalTasks.c : 0.7;

      const totalScore = skillMatch * 0.6 + loadScore * 0.2 + qualityScore * 0.2;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestAgent = emp;
      }
    }

    if (bestAgent) {
      // [V4.1] 敏感操作强制人工确认节点
      if (isSensitiveAction(subtask.title, subtask.description) && FEATURE_FLAGS.ENABLE_HUMAN_IN_THE_LOOP) {
        dbRun(
          `INSERT INTO pending_reviews (tenant_id, review_type, initiator_user_id, ai_content, structured_data, status)
           VALUES (?, 'task_assignment', ?, ?, ?, 'pending')`,
          [task.tenant_id, task.created_by, `子任务"${subtask.title}"已匹配AI员工"${bestAgent.name}"，涉及敏感操作需人工确认后执行`, JSON.stringify({ subtask, agent: bestAgent.name })]
        );
        assignments.push({ subtask: subtask.title, nodeId: subtask.node_id, agent: bestAgent.name, score: bestScore.toFixed(2), requiresReview: true });
        // 暂不分配，等待人工审核
        continue;
      }

      dbRun("UPDATE sub_tasks SET assigned_to = ?, status = 'assigned' WHERE id = ?", [bestAgent.id, subtask.id]);
      assignments.push({ subtask: subtask.title, nodeId: subtask.node_id, agent: bestAgent.name, score: bestScore.toFixed(2) });
    }
  }

  dbRun("UPDATE orchestration_tasks SET status = 'executing' WHERE id = ?", [orchestrationId]);
  saveExecutionSnapshot(orchestrationId, {
    schemaVersion: "xyai.orchestration.execution.v1",
    orchestrationId,
    matchedAt: new Date().toISOString(),
    assignments,
    pendingReviewCount: assignments.filter((item: any) => item.requiresReview).length,
  });

  return assignments;
}

// 获取编排任务状态
export function getOrchestrationStatus(orchestrationId: number): any {
  const task = dbGet("SELECT * FROM orchestration_tasks WHERE id = ?", [orchestrationId]) as any;
  const subtasks = dbAll(
    `SELECT st.*, e.name as assignee_name, e.role as assignee_role
     FROM sub_tasks st
     LEFT JOIN employees e ON st.assigned_to = e.id
     WHERE st.orchestration_id = ?
     ORDER BY st.sort_order`,
    [orchestrationId]
  );

  return { task, subtasks };
}

// 更新子任务状态
export function updateSubTaskStatus(subTaskId: number, status: string, result?: string): void {
  const updates = ["status = ?"];
  const params: any[] = [status];
  if (result) { updates.push("result = ?"); params.push(result); }
  params.push(subTaskId);
  dbRun(`UPDATE sub_tasks SET ${updates.join(", ")} WHERE id = ?`, params);
}

// 获取编排任务列表
export function getOrchestrations(tenantId: number): any[] {
  return dbAll(
    "SELECT * FROM orchestration_tasks WHERE tenant_id = ? ORDER BY created_at DESC",
    [tenantId]
  );
}
