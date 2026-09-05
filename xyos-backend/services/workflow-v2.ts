// ============================================================
// WorkFlow V2 引擎核心
// DAG 节点+边模型 | 5种审批人模式 | 完整状态机
// ============================================================

import { dbRun, dbGet, dbAll } from "../db";
import type {
  FlowDefinition, FlowNode, FlowEdge, FlowNodeType,
  ApproverMode, SignMode, RejectStrategy,
  ApproverConfig, ApprovalNodeConfig, ConditionNodeConfig,
  EndNodeConfig, NodeConfig, ConditionBranch,
  // @ts-expect-error R0-P0-09: WorkflowDefRow/InstanceRow/TaskRow 定义在 V0.60 中补全
  WorkflowDefRow, WorkflowInstanceRow, WorkflowTaskRow,
  ResolvedApprover, TaskActionResult, TimelineEntry,
} from "./workflow-types";

// ============================================================
// 工具函数
// ============================================================

type DbRow = Record<string, any>;

function toNum(v: any): number { return Number(v); }
function toJson(v: any): string { return JSON.stringify(v); }
function fromJson(v: string | null | undefined): any {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

// ============================================================
// 兼容性检查 & 转换
// ============================================================

/** 检测并转换旧格式 (version:1 / steps[]) 到 DAG */
function normalizeDefinition(raw: string): FlowDefinition {
  const parsed = fromJson(raw);
  if (!parsed) throw new Error("流程定义解析失败");

  // V2 DAG 格式
  if (parsed.version === 2 && parsed.nodes && parsed.edges) {
    return parsed as FlowDefinition;
  }

  // V1 旧格式: { steps: [...] }
  if (parsed.steps && Array.isArray(parsed.steps)) {
    const nodes: FlowNode[] = parsed.steps.map((s: any, i: number) => ({
      id: s.id || `step_${i}`,
      type: s.type || "approval",
      title: s.title || `步骤 ${i + 1}`,
      config: s.type === "approval" ? {
        signMode: "all",
        approvers: s.approver_ids
          ? s.approver_ids.map((uid: number) => ({ mode: "specific" as ApproverMode, value: uid, label: `用户${uid}` }))
          : [{ mode: "department_head" as ApproverMode, value: "", label: "部门负责人" }],
        rejectStrategy: "back_to_start" as RejectStrategy,
        allowDelegate: false,
        allowAddSign: false,
      } : {},
    }));
    const edges: FlowEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }
    return { version: 2, nodes, edges };
  }

  throw new Error("无法识别的流程定义格式");
}

/** 根据 edges 找出某个节点的所有下游节点 */
function getNextNodeIds(def: FlowDefinition, nodeId: string, variables?: Record<string, any>): string[] {
  const node = def.nodes.find(n => n.id === nodeId);
  if (!node) return [];

  // 条件节点：评估分支
  if (node.type === "condition") {
    const cfg = node.config as ConditionNodeConfig;
    const fieldValue = variables?.[cfg.field];
    for (const branch of cfg.branches) {
      if (evaluateCondition(fieldValue, branch.op, branch.value)) {
        return [branch.nextNodeId];
      }
    }
    // 无匹配走默认分支
    if (cfg.defaultNextNodeId) return [cfg.defaultNextNodeId];
    return cfg.branches.length > 0 ? [cfg.branches[0].nextNodeId] : [];
  }

  // 普通节点
  return def.edges.filter(e => e.from === nodeId).map(e => e.to);
}

/** 条件求值 */
function evaluateCondition(fieldValue: any, op: string, expected: any): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;
  switch (op) {
    case "eq": return fieldValue == expected;
    case "gt": return Number(fieldValue) > Number(expected);
    case "gte": return Number(fieldValue) >= Number(expected);
    case "lt": return Number(fieldValue) < Number(expected);
    case "lte": return Number(fieldValue) <= Number(expected);
    case "contains": return String(fieldValue).includes(String(expected));
    case "in": return Array.isArray(expected) ? expected.includes(fieldValue) : fieldValue == expected;
    default: return false;
  }
}

// ============================================================
// 审批人解析引擎
// ============================================================

/** 根据配置解析审批人 userId 列表 */
function resolveApprover(
  config: ApproverConfig,
  initiatorId: number,
  tenantId: number,
  nodeAssignments?: Record<string, number>, // 发起人自选
  nodeId?: string,
): number | null {
  switch (config.mode) {
    case "specific": {
      const uid = Number(config.value);
      const exists = dbGet("SELECT id FROM users WHERE id = ?", [uid]) as DbRow;
      return exists ? uid : null;
    }

    case "role": {
      const roleName = String(config.value);
      // 尝试通过 user_id 链接查找
      const rows = dbAll(
        "SELECT u.id FROM users u JOIN employees e ON u.id = e.user_id WHERE u.tenant_id = ? AND e.role = ? LIMIT 1",
        [tenantId, roleName]
      ) as DbRow[];
      if (rows.length > 0) return toNum(rows[0].id);
      // 回退: 无 user_id 链接时，返回发起人自己作为审批人（演示模式）
      return initiatorId;
    }

    case "position": {
      const positionName = String(config.value);
      // employees 表用 role 字段存储职位（无 position 列）
      const rows = dbAll(
        "SELECT u.id FROM users u JOIN employees e ON u.id = e.user_id WHERE u.tenant_id = ? AND e.role = ? LIMIT 1",
        [tenantId, positionName]
      ) as DbRow[];
      if (rows.length > 0) return toNum(rows[0].id);
      // 回退: 没有 user_id 链接时，直接按 role 找员工
      const emp = dbGet(
        "SELECT e.id FROM employees e WHERE e.tenant_id = ? AND e.role = ? LIMIT 1",
        [tenantId, positionName]
      ) as DbRow;
      if (emp) return initiatorId; // 返回发起人自己（无关联用户时）
      return null;
    }

    case "department_head": {
      let deptId = null;
      // 先尝试通过 user_id 链接查找部门
      const initiator = dbGet(
        "SELECT e.department_id FROM employees e WHERE e.user_id = ?",
        [initiatorId]
      ) as DbRow;
      if (initiator?.department_id) {
        deptId = initiator.department_id;
      } else {
        // 回退: 无 user_id 链接时，返回发起人自己作为审批人
        return initiatorId;
      }
      // 第一优先: 查找该部门有「负责人/经理/主管/部长/主任/总监」头衔的员工（排除发起人自己）
      let head = dbGet(
        `SELECT u.id FROM users u
         JOIN employees e ON u.id = e.user_id
         WHERE u.tenant_id = ? AND e.department_id = ? AND u.id != ?
         AND (e.role LIKE '%负责人%' OR e.role LIKE '%经理%' OR e.role LIKE '%主管%'
              OR e.role LIKE '%部长%' OR e.role LIKE '%主任%' OR e.role LIKE '%总监%')
         LIMIT 1`,
        [tenantId, deptId, initiatorId]
      ) as DbRow;
      if (head) return toNum(head.id);
      // 第二回退: 找该部门任意员工（排除发起人自己）
      head = dbGet(
        `SELECT u.id FROM users u
         JOIN employees e ON u.id = e.user_id
         WHERE u.tenant_id = ? AND e.department_id = ? AND u.id != ?
         ORDER BY e.id ASC LIMIT 1`,
        [tenantId, deptId, initiatorId]
      ) as DbRow;
      if (head) return toNum(head.id);
      // 最后回退: 发起人自己
      return initiatorId;
    }

    case "org_escalation": {
      // 组织逐级: 从发起人部门开始向上查找，直到找到匹配角色或达到顶级
      const targetRole = config.value as string;
      const initiator = dbGet(
        "SELECT e.department_id FROM employees e WHERE e.user_id = ?",
        [initiatorId]
      ) as DbRow;
      if (!initiator?.department_id) return null;

      let deptId = initiator.department_id;
      let level = 0;
      const MaxLevel = 10;

      while (deptId && level < MaxLevel) {
        const approver = dbGet(
          `SELECT u.id FROM users u
           JOIN employees e ON u.id = e.user_id
           WHERE u.tenant_id = ? AND e.department_id = ?
           AND (e.role = ? OR e.position = ?)
           LIMIT 1`,
          [tenantId, deptId, targetRole, targetRole]
        ) as DbRow;
        if (approver) return toNum(approver.id);

        const parent = dbGet("SELECT parent_id FROM departments WHERE id = ?", [deptId]) as DbRow;
        deptId = parent?.parent_id || null;
        level++;
      }
      return null;
    }

    case "initiator_choice": {
      if (nodeAssignments && nodeId && nodeAssignments[nodeId]) {
        return nodeAssignments[nodeId];
      }
      // 回退: 无指定时，由发起人自己审批（测试/演示模式）
      return initiatorId;
    }

    default:
      return null;
  }
}

/** 解析一个审批节点的所有审批人 */
function resolveNodeApprovers(
  node: FlowNode,
  initiatorId: number,
  tenantId: number,
  nodeAssignments?: Record<string, number>,
): ResolvedApprover[] {
  if (node.type !== "approval" && node.type !== "task") return [];

  const cfg = node.config as ApprovalNodeConfig;
  const results: ResolvedApprover[] = [];

  for (const ac of cfg.approvers) {
    const uid = resolveApprover(ac, initiatorId, tenantId, nodeAssignments, node.id);
    if (uid !== null) {
      const user = dbGet("SELECT nickname FROM users WHERE id = ?", [uid]) as DbRow;
      results.push({
        userId: uid,
        userName: user?.nickname || `用户${uid}`,
        source: ac.mode,
      });
    }
  }

  return results;
}

// ============================================================
// 任务管理
// ============================================================

/** 创建单个审批任务 */
function createTask(params: {
  instanceId: number;
  tenantId: number;
  nodeId: string;
  stepIndex: number;
  title: string;
  type: string;
  assigneeId: number;
  assigneeType?: string;
  signOrder?: number;
  isAddedSign?: number;
  dueDate?: string;
}): number {
  const result = dbRun(
    `INSERT INTO workflow_tasks
     (instance_id, tenant_id, node_id, step_index, title, type, status,
      assignee_id, assignee_type, sign_order, is_added_sign, due_date)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      params.instanceId, params.tenantId, params.nodeId, params.stepIndex,
      params.title, params.type, params.assigneeId, params.assigneeType || "user",
      params.signOrder || 0, params.isAddedSign || 0, params.dueDate || null,
    ]
  );
  return toNum(result.lastInsertRowid);
}

/** 为一个节点创建所有审批任务 */
function createTasksForNode(
  instanceId: number,
  tenantId: number,
  node: FlowNode,
  resolved: ResolvedApprover[],
  stepIndex: number,
  dueDate?: string,
): number[] {
  const cfg = (node.config as ApprovalNodeConfig) || {};
  const timeoutMs = cfg.timeoutHours ? cfg.timeoutHours * 3600000 : undefined;
  const taskDue = timeoutMs ? new Date(Date.now() + timeoutMs).toISOString() : (dueDate || null);

  const taskIds: number[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const tid = createTask({
      instanceId,
      tenantId,
      nodeId: node.id,
      stepIndex,
      title: node.title,
      type: node.type === "task" ? "task" : "approval",
      assigneeId: resolved[i].userId,
      signOrder: i,
      dueDate: taskDue ?? undefined,
    });
    taskIds.push(tid);
  }
  return taskIds;
}

/** 取消实例中指定节点的所有待处理任务 */
function cancelPendingTasksInNode(instanceId: number, nodeId: string) {
  dbRun(
    "UPDATE workflow_tasks SET status = 'cancelled', cancelled_reason = '流程推进/终止' WHERE instance_id = ? AND node_id = ? AND status = 'pending'",
    [instanceId, nodeId]
  );
}

/** 取消实例中所有待处理任务 */
function cancelAllPendingTasks(instanceId: number) {
  dbRun(
    "UPDATE workflow_tasks SET status = 'cancelled', cancelled_reason = '流程终止' WHERE instance_id = ? AND status = 'pending'",
    [instanceId]
  );
}

/** 检查某节点所有任务是否全部完成 */
function isNodeComplete(instanceId: number, nodeId: string): boolean {
  const pending = dbGet(
    "SELECT COUNT(*) as cnt FROM workflow_tasks WHERE instance_id = ? AND node_id = ? AND status = 'pending'",
    [instanceId, nodeId]
  ) as DbRow;
  return toNum(pending.cnt) === 0;
}

/** 检查节点是否有被否决/打回的任务 */
function getNodeNegativeAction(instanceId: number, nodeId: string): { rejected: boolean; returned: boolean; task: DbRow | null } {
  const tasks = dbAll(
    "SELECT * FROM workflow_tasks WHERE instance_id = ? AND node_id = ? AND status = 'completed' ORDER BY completed_at DESC",
    [instanceId, nodeId]
  ) as DbRow[];
  for (const t of tasks) {
    if (t.result === "rejected") return { rejected: true, returned: false, task: t };
    if (t.result === "returned") return { rejected: false, returned: true, task: t };
  }
  return { rejected: false, returned: false, task: null };
}

// ============================================================
// 通知/知会
// ============================================================

/** 创建知会通知 */
function createNotifications(instanceId: number, tenantId: number, instanceTitle: string, notifyRoles: string[]) {
  if (!notifyRoles || notifyRoles.length === 0) return;

  for (const role of notifyRoles) {
    const users = dbAll(
      `SELECT u.id FROM users u
       JOIN employees e ON u.id = e.user_id
       WHERE u.tenant_id = ? AND (e.role LIKE ? OR e.department_id IN
         (SELECT id FROM departments WHERE name LIKE ? AND tenant_id = ?))`,
      [tenantId, `%${role}%`, `%${role}%`, tenantId]
    ) as DbRow[];

    for (const u of users) {
      dbRun(
        "INSERT INTO workflow_notifications (instance_id, tenant_id, user_id, title) VALUES (?, ?, ?, ?)",
        [instanceId, tenantId, u.id, instanceTitle]
      );
    }
  }
}

// ============================================================
// 快照管理
// ============================================================

function createSnapshot(definitionId: number, def: FlowDefinition): number {
  const existing = dbGet(
    "SELECT MAX(version) as max_ver FROM workflow_definition_snapshots WHERE definition_id = ?",
    [definitionId]
  ) as DbRow;
  const newVersion = toNum(existing?.max_ver || 0) + 1;
  const result = dbRun(
    "INSERT INTO workflow_definition_snapshots (definition_id, version, definition) VALUES (?, ?, ?)",
    [definitionId, newVersion, toJson(def)]
  );
  return toNum(result.lastInsertRowid);
}

export function getSnapshot(snapshotId: number): FlowDefinition | null {
  const row = dbGet("SELECT definition FROM workflow_definition_snapshots WHERE id = ?", [snapshotId]) as DbRow;
  if (!row) return null;
  return normalizeDefinition(row.definition);
}

// ============================================================
// 引擎主类
// ============================================================

export class WorkflowEngineV2 {

  // ========================
  // 模板 CRUD
  // ========================

  static createDefinition(params: {
    tenantId: number;
    name: string;
    description?: string;
    categoryId?: number;
    schemeName?: string;
    icon?: string;
    definition: FlowDefinition;
    createdBy: number;
    status?: string;
  }): number {
    const defStr = toJson(params.definition);
    const snapId = createSnapshot(0, params.definition); // 先建快照，后面关联

    const result = dbRun(
      `INSERT INTO workflow_definitions
       (tenant_id, name, description, version, status, definition,
        category_id, scheme_name, icon, created_by)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [params.tenantId, params.name, params.description || null,
       params.status || "draft", defStr,
       params.categoryId || null, params.schemeName || null,
       params.icon || null, params.createdBy]
    );
    const defId = toNum(result.lastInsertRowid);

    // 更新快照关联
    dbRun("UPDATE workflow_definition_snapshots SET definition_id = ? WHERE id = ?", [defId, snapId]);

    // 审计日志
    dbRun(
      "INSERT INTO workflow_audit_log (tenant_id, user_id, action, target_type, target_id, new_value) VALUES (?, ?, 'create', 'definition', ?, ?)",
      [params.tenantId, params.createdBy, defId, defStr]
    );

    return defId;
  }

  static updateDefinition(params: {
    tenantId: number;
    id: number;
    userId: number;
    name?: string;
    description?: string;
    status?: string;
    definition?: FlowDefinition;
    categoryId?: number;
    schemeName?: string;
  }): void {
    const old = dbGet("SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?", [params.tenantId, params.id]) as DbRow;
    if (!old) throw new Error("流程模板不存在");

    const fields: string[] = [];
    const values: any[] = [];
    let newDef: FlowDefinition | null = null;

    if (params.name !== undefined) { fields.push("name = ?"); values.push(params.name); }
    if (params.description !== undefined) { fields.push("description = ?"); values.push(params.description); }
    if (params.status !== undefined) { fields.push("status = ?"); values.push(params.status); }
    if (params.definition !== undefined) {
      fields.push("definition = ?"); values.push(toJson(params.definition));
      newDef = params.definition;
    }
    if (params.categoryId !== undefined) { fields.push("category_id = ?"); values.push(params.categoryId); }
    if (params.schemeName !== undefined) { fields.push("scheme_name = ?"); values.push(params.schemeName); }
    fields.push("updated_at = CURRENT_TIMESTAMP");

    if (fields.length === 1) return; // 只有 updated_at 无实际变更

    values.push(params.tenantId, params.id);
    dbRun(`UPDATE workflow_definitions SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);

    // 如果 definition 变更，创建新快照 + 版本号递增
    if (newDef) {
      createSnapshot(params.id, newDef);

      // 检查有无运行中实例 → 不升级版本号，让运行实例继续用旧快照
      const runningCount = dbGet(
        "SELECT COUNT(*) as cnt FROM workflow_instances WHERE workflow_id = ? AND status IN ('running','pending','revising')",
        [params.id]
      ) as DbRow;
      if (toNum(runningCount.cnt) === 0) {
        dbRun("UPDATE workflow_definitions SET version = version + 1 WHERE id = ?", [params.id]);
      }
    }

    // 审计
    dbRun(
      "INSERT INTO workflow_audit_log (tenant_id, user_id, action, target_type, target_id, old_value, new_value) VALUES (?, ?, 'update', 'definition', ?, ?, ?)",
      [params.tenantId, params.userId, params.id, old.definition, newDef ? toJson(newDef) : old.definition]
    );
  }

  static getDefinition(tenantId: number, id: number): (WorkflowDefRow & { flowDef: FlowDefinition }) | null {
    const row = dbGet(
      "SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?",
      [tenantId, id]
    ) as WorkflowDefRow | null;
    if (!row) return null;

    const flowDef = normalizeDefinition(row.definition);
    return { ...row, flowDef };
  }

  static getDefinitions(tenantId: number, categoryId?: number, status?: string): (WorkflowDefRow & { flowDef: FlowDefinition })[] {
    let sql = "SELECT * FROM workflow_definitions WHERE tenant_id = ?";
    const args: any[] = [tenantId];
    if (categoryId !== undefined) { sql += " AND category_id = ?"; args.push(categoryId); }
    if (status) { sql += " AND status = ?"; args.push(status); }
    sql += " ORDER BY sort_order, updated_at DESC";

    const rows = dbAll(sql, args) as WorkflowDefRow[];
    return rows.map(r => ({ ...r, flowDef: normalizeDefinition(r.definition) }));
  }

  static deleteDefinition(tenantId: number, id: number, userId: number): void {
    const old = dbGet("SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?", [tenantId, id]) as DbRow;
    if (!old) throw new Error("模板不存在");

    const running = dbGet("SELECT COUNT(*) as cnt FROM workflow_instances WHERE workflow_id = ? AND status IN ('running','pending','revising')", [id]) as DbRow;
    if (toNum(running.cnt) > 0) throw new Error("有运行中的流程实例，无法删除");

    dbRun("DELETE FROM workflow_definitions WHERE tenant_id = ? AND id = ?", [tenantId, id]);

    // 审计
    dbRun(
      "INSERT INTO workflow_audit_log (tenant_id, user_id, action, target_type, target_id, old_value) VALUES (?, ?, 'delete', 'definition', ?, ?)",
      [tenantId, userId, id, old.definition]
    );
  }

  static cloneDefinition(tenantId: number, sourceId: number, userId: number, newName: string): number {
    const source = dbGet(
      "SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?",
      [tenantId, sourceId]
    ) as DbRow;
    if (!source) throw new Error("源模板不存在");

    const def = normalizeDefinition(source.definition);
    return this.createDefinition({
      tenantId,
      name: newName,
      description: source.description,
      categoryId: source.category_id,
      definition: def,
      createdBy: userId,
      status: "draft",
    });
  }

  // ========================
  // 流程发起
  // ========================

  static createInstance(params: {
    tenantId: number;
    workflowId: number;
    title?: string;
    variables?: Record<string, any>;
    startedBy: number;
    nodeAssignments?: Record<string, number>;  // 发起人自选的审批人
  }): { instanceId: number; resolvedNodes: NodeResolvedState[] } {
    const def = dbGet(
      "SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?",
      [params.tenantId, params.workflowId]
    ) as DbRow;
    if (!def) throw new Error("流程模板不存在");
    if (def.status !== "active") throw new Error("流程模板未启用");

    const flowDef = normalizeDefinition(def.definition);
    const vars = params.variables || {};

    // 创建快照（冻结当前版本）
    const snapshotId = createSnapshot(params.workflowId, flowDef);

    // 创建实例
    const result = dbRun(
      `INSERT INTO workflow_instances
       (tenant_id, workflow_id, title, status, variables, definition_snapshot_id, current_node_ids, started_by)
       VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
      [params.tenantId, params.workflowId, params.title || null,
       toJson(vars), snapshotId, "[]", params.startedBy]
    );
    const instanceId = toNum(result.lastInsertRowid);

    // 获取 start 节点 → 推送到第一个审批节点
    const startNode = flowDef.nodes.find(n => n.type === "start");
    if (!startNode) throw new Error("流程定义缺少开始节点");

    const firstNodeIds = getNextNodeIds(flowDef, startNode.id, vars);
    if (firstNodeIds.length === 0) throw new Error("流程定义缺少后续节点");

    const resolvedNodes: NodeResolvedState[] = [];
    let stepIndex = 0;

    for (const nodeId of firstNodeIds) {
      const node = flowDef.nodes.find(n => n.id === nodeId);
      if (!node || node.type === "end") continue;

      const resolved = resolveNodeApprovers(node, params.startedBy, params.tenantId, params.nodeAssignments);
      if (resolved.length === 0) {
        // 解析不到审批人 → 跳过该节点（或标记警告）
        console.warn(`[WorkFlow] 节点 ${node.title} 未能解析审批人，跳过`);
        const nextIds = getNextNodeIds(flowDef, nodeId, vars);
        for (const nid of nextIds) {
          const nn = flowDef.nodes.find(n => n.id === nid);
          if (nn && nn.type !== "end") {
            const res = resolveNodeApprovers(nn, params.startedBy, params.tenantId, params.nodeAssignments);
            if (res.length > 0) {
              createTasksForNode(instanceId, params.tenantId, nn, res, stepIndex++);
              resolvedNodes.push({ nodeId: nid, approvers: res, signMode: (nn.config as ApprovalNodeConfig).signMode || "all" });
            }
          }
        }
        continue;
      }

      createTasksForNode(instanceId, params.tenantId, node, resolved, stepIndex++);
      resolvedNodes.push({
        nodeId,
        approvers: resolved,
        signMode: (node.config as ApprovalNodeConfig).signMode || "all",
      });
    }

    // 更新实例 current_node_ids
    dbRun(
      "UPDATE workflow_instances SET current_node_ids = ? WHERE id = ?",
      [toJson(resolvedNodes.map(r => r.nodeId)), instanceId]
    );

    return { instanceId, resolvedNodes };
  }

  // ========================
  // 审批操作
  // ========================

  /** 同意 */
  static approveTask(taskId: number, userId: number, comment?: string): TaskActionResult {
    const [task, instance, flowDef] = this._validateAndLoad(taskId, userId);
    const node = flowDef.nodes.find(n => n.id === task.node_id);
    if (!node) throw new Error("节点定义丢失");

    this._markTaskComplete(task, "approved", comment);
    return this._progressAfterApproval(task, instance, flowDef, node);
  }

  /** 否决 */
  static rejectTask(taskId: number, userId: number, comment?: string): TaskActionResult {
    const [task, instance, flowDef] = this._validateAndLoad(taskId, userId);
    if (task.status !== "pending") throw new Error("任务已完成");

    this._markTaskComplete(task, "rejected", comment);

    // 读取节点配置的驳回策略
    const node = task.node_id ? flowDef.nodes.find(n => n.id === task.node_id) : null;
    const cfg = (node?.config as ApprovalNodeConfig) || null;
    const strategy = cfg?.rejectStrategy || "back_to_start";

    if (strategy === "back_to_prev") {
      // 退回上一节点：取消当前节点任务，回到上游节点
      cancelPendingTasksInNode(instance.id, task.node_id || "");
      const prevEdges = flowDef.edges.filter(e => e.to === task.node_id);
      if (prevEdges.length > 0) {
        const prevNodeId = prevEdges[0].from;
        const prevNode = flowDef.nodes.find(n => n.id === prevNodeId);
        if (prevNode && prevNode.type !== "start") {
          const resolved = resolveNodeApprovers(prevNode, instance.started_by, instance.tenant_id);
          createTasksForNode(instance.id, instance.tenant_id, prevNode, resolved, task.step_index);
          dbRun("UPDATE workflow_instances SET status = 'running', current_node_ids = ? WHERE id = ?",
            [toJson([prevNodeId]), instance.id]);
          return { flowStatus: "returned", message: `已退回上一节点${comment ? ': ' + comment : ''}` };
        }
      }
      // 没有上一节点就退回发起人
    }

    if (strategy === "to_specified" && cfg?.rejectTargetNodeId) {
      const targetNode = flowDef.nodes.find(n => n.id === cfg.rejectTargetNodeId);
      if (targetNode && targetNode.type !== "start") {
        cancelPendingTasksInNode(instance.id, task.node_id || "");
        const resolved = resolveNodeApprovers(targetNode, instance.started_by, instance.tenant_id);
        createTasksForNode(instance.id, instance.tenant_id, targetNode, resolved, task.step_index);
        dbRun("UPDATE workflow_instances SET status = 'running', current_node_ids = ? WHERE id = ?",
          [toJson([cfg.rejectTargetNodeId]), instance.id]);
        return { flowStatus: "returned", message: `已退回指定节点${comment ? ': ' + comment : ''}` };
      }
    }

    // back_to_start / 默认：终止流程
    cancelAllPendingTasks(instance.id);
    dbRun(
      "UPDATE workflow_instances SET status = 'rejected', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [instance.id]
    );

    this._notifyEnd(instance.id, instance.tenant_id, instance.title || "流程审批", flowDef);

    return { flowStatus: "rejected", message: "流程已被否决" };
  }

  /** 打回修改 */
  static returnTask(taskId: number, userId: number, comment?: string): TaskActionResult {
    const [task, instance, flowDef] = this._validateAndLoad(taskId, userId);
    if (task.status !== "pending") throw new Error("任务已完成");

    this._markTaskComplete(task, "returned", comment);

    // 取消当前节点其余 pending 任务
    if (task.node_id) cancelPendingTasksInNode(instance.id, task.node_id);

    // 标记实例为待修订
    dbRun(
      `UPDATE workflow_instances
       SET status = 'revising', return_node_id = ?, returned_by = ?, return_reason = ?, revision_count = revision_count + 1
       WHERE id = ?`,
      [task.node_id, userId, comment || "", instance.id]
    );

    // 给发起人创建修订任务
    createTask({
      instanceId: instance.id,
      tenantId: instance.tenant_id,
      nodeId: "return_revise",
      stepIndex: 0,
      title: "请修改后重新提交",
      type: "revise",
      assigneeId: instance.started_by,
    });

    this._notifyEnd(instance.id, instance.tenant_id, instance.title || "流程审批", flowDef);

    return { flowStatus: "returned", message: comment ? `已打回: ${comment}` : "已打回修改" };
  }

  /** 转签 */
  static delegateTask(taskId: number, userId: number, delegateToId: number, reason?: string): TaskActionResult {
    const [task, instance] = this._validateAndLoad(taskId, userId);
    if (task.status !== "pending") throw new Error("任务已完成");

    // 标记原任务为已转签
    dbRun(
      "UPDATE workflow_tasks SET status = 'delegated', comment = ? WHERE id = ?",
      [`转签给用户${delegateToId}${reason ? ': ' + reason : ''}`, taskId]
    );

    // 创建新任务给接手人
    const newTaskId = createTask({
      instanceId: instance.id,
      tenantId: instance.tenant_id,
      nodeId: task.node_id || "",
      stepIndex: task.step_index,
      title: task.title,
      type: task.type,
      assigneeId: delegateToId,
      signOrder: task.sign_order,
    });

    // 记录转签来源
    dbRun("UPDATE workflow_tasks SET delegated_from = ? WHERE id = ?", [userId, newTaskId]);

    return { flowStatus: "waiting", message: `已转签给用户${delegateToId}` };
  }

  /** 加签 (在并行节点中增加一个审批人) */
  static addSigner(taskId: number, userId: number, newUserId: number, reason?: string): TaskActionResult {
    const [task, instance] = this._validateAndLoad(taskId, userId);
    if (task.status !== "pending") throw new Error("任务已完成");
    if (!task.node_id) throw new Error("任务缺少节点关联");

    // 在同一个节点创建加签任务
    const existingTasks = dbAll(
      "SELECT MAX(sign_order) as max_order FROM workflow_tasks WHERE instance_id = ? AND node_id = ?",
      [instance.id, task.node_id]
    ) as DbRow[];

    const newOrder = toNum(existingTasks[0]?.max_order || 0) + 1;
    const newUser = dbGet("SELECT nickname FROM users WHERE id = ?", [newUserId]) as DbRow;

    createTask({
      instanceId: instance.id,
      tenantId: instance.tenant_id,
      nodeId: task.node_id,
      stepIndex: task.step_index,
      title: `${task.title} (加签: ${newUser?.nickname || '用户' + newUserId})`,
      type: task.type,
      assigneeId: newUserId,
      signOrder: newOrder,
      isAddedSign: 1,
    });

    // 记录日志
    dbRun(
      "INSERT INTO workflow_audit_log (tenant_id, user_id, action, target_type, target_id, new_value) VALUES (?, ?, 'add_sign', 'task', ?, ?)",
      [instance.tenant_id, userId, taskId, toJson({ addedUserId: newUserId, reason })]
    );

    return { flowStatus: "waiting", message: `已加签给 ${newUser?.nickname || '用户' + newUserId}` };
  }

  // ========================
  // 发起人操作
  // ========================

  /** 撤回 (首个节点无人操作前) */
  static cancelInstance(instanceId: number, userId: number): TaskActionResult {
    const instance = dbGet(
      "SELECT * FROM workflow_instances WHERE id = ? AND started_by = ?",
      [instanceId, userId]
    ) as DbRow;
    if (!instance) throw new Error("实例不存在或非你发起");

    if (instance.status !== "running" && instance.status !== "pending") {
      throw new Error("流程状态不允许撤回");
    }

    // 检查是否已有审批操作
    const acted = dbGet(
      "SELECT COUNT(*) as cnt FROM workflow_tasks WHERE instance_id = ? AND status = 'completed'",
      [instanceId]
    ) as DbRow;
    if (toNum(acted.cnt) > 0) throw new Error("已有审批记录，无法撤回");

    cancelAllPendingTasks(instanceId);
    dbRun("UPDATE workflow_instances SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [instanceId]);

    return { flowStatus: "cancelled", message: "流程已撤回" };
  }

  /** 发起人修订后重新提交 */
  static resubmitInstance(instanceId: number, userId: number, updatedVariables?: Record<string, any>): TaskActionResult {
    const instance = dbGet(
      "SELECT * FROM workflow_instances WHERE id = ? AND started_by = ? AND status = 'revising'",
      [instanceId, userId]
    ) as DbRow;
    if (!instance) throw new Error("实例不存在或状态不允许重新提交");

    const snapshotId = instance.definition_snapshot_id;
    const flowDef = snapshotId ? getSnapshot(snapshotId) : null;
    if (!flowDef) throw new Error("流程定义快照丢失");

    const returnNodeId = instance.return_node_id;
    const vars = { ...fromJson(instance.variables), ...(updatedVariables || {}) };

    // 清除打回标记
    dbRun(
      "UPDATE workflow_instances SET status = 'running', variables = ?, return_node_id = NULL, returned_by = NULL, return_reason = NULL WHERE id = ?",
      [toJson(vars), instanceId]
    );

    // 清除之前的修订任务
    dbRun("UPDATE workflow_tasks SET status = 'cancelled' WHERE instance_id = ? AND node_id = 'return_revise' AND status = 'pending'", [instanceId]);

    // 清除旧任务的退回标记，防止 getNodeNegativeAction 误判
    if (returnNodeId) {
      dbRun(
        "UPDATE workflow_tasks SET result = 'returned_handled' WHERE instance_id = ? AND node_id = ? AND result = 'returned'",
        [instanceId, returnNodeId]
      );
    }

    // 从被打回节点重新创建任务
    if (returnNodeId) {
      const node = flowDef.nodes.find(n => n.id === returnNodeId);
      if (node) {
        const resolved = resolveNodeApprovers(node, instance.started_by, instance.tenant_id);
        createTasksForNode(instanceId, instance.tenant_id, node, resolved, 0);
        dbRun("UPDATE workflow_instances SET current_node_ids = ? WHERE id = ?",
          [toJson([returnNodeId]), instanceId]);
      }
    }

    return { flowStatus: "progressing", message: "已重新提交" };
  }

  // ========================
  // 管理员操作
  // ========================

  static forceCloseInstance(instanceId: number, adminId: number, reason: string): TaskActionResult {
    const instance = dbGet("SELECT * FROM workflow_instances WHERE id = ?", [instanceId]) as DbRow;
    if (!instance) throw new Error("实例不存在");
    if (instance.status === "completed" || instance.status === "rejected" || instance.status === "cancelled") {
      throw new Error("流程已结束，无法强制关闭");
    }

    cancelAllPendingTasks(instanceId);
    dbRun(
      "UPDATE workflow_instances SET status = 'closed', completed_at = CURRENT_TIMESTAMP, closed_by = ?, close_reason = ? WHERE id = ?",
      [adminId, reason, instanceId]
    );

    dbRun(
      "INSERT INTO workflow_audit_log (tenant_id, user_id, action, target_type, target_id, new_value) VALUES (?, ?, 'force_close', 'instance', ?, ?)",
      [instance.tenant_id, adminId, instanceId, toJson({ reason })]
    );

    return { flowStatus: "cancelled", message: `管理员已强制关闭: ${reason}` };
  }

  // ========================
  // 查询
  // ========================

  static getMyTasks(tenantId: number, userId: number): WorkflowTaskRow[] {
    return dbAll(
      `SELECT t.*, i.title as instance_title, d.name as workflow_name
       FROM workflow_tasks t
       JOIN workflow_instances i ON t.instance_id = i.id
       JOIN workflow_definitions d ON i.workflow_id = d.id
       WHERE t.tenant_id = ? AND t.assignee_id = ? AND t.status = 'pending'
       ORDER BY t.created_at DESC`,
      [tenantId, userId]
    ) as WorkflowTaskRow[];
  }

  static getInstance(tenantId: number, id: number): WorkflowInstanceRow | null {
    return dbGet(
      "SELECT i.*, d.name as workflow_name FROM workflow_instances i LEFT JOIN workflow_definitions d ON i.workflow_id = d.id WHERE i.tenant_id = ? AND i.id = ?",
      [tenantId, id]
    ) as WorkflowInstanceRow | null;
  }

  static getInstances(tenantId: number, status?: string): WorkflowInstanceRow[] {
    let sql = `SELECT i.*, d.name as workflow_name FROM workflow_instances i LEFT JOIN workflow_definitions d ON i.workflow_id = d.id WHERE i.tenant_id = ?`;
    const args: any[] = [tenantId];
    if (status) { sql += " AND i.status = ?"; args.push(status); }
    sql += " ORDER BY i.started_at DESC";
    return dbAll(sql, args) as WorkflowInstanceRow[];
  }

  static getInstanceTasks(tenantId: number, instanceId: number): WorkflowTaskRow[] {
    return dbAll(
      "SELECT * FROM workflow_tasks WHERE tenant_id = ? AND instance_id = ? ORDER BY sign_order, created_at",
      [tenantId, instanceId]
    ) as WorkflowTaskRow[];
  }

  static getTimeline(instanceId: number): TimelineEntry[] {
    const tasks = dbAll(
      `SELECT t.*, u.nickname as user_name
       FROM workflow_tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.instance_id = ? AND t.status IN ('completed','delegated')
       ORDER BY t.completed_at ASC`,
      [instanceId]
    ) as DbRow[];

    return tasks.map(t => ({
      nodeId: t.node_id || "",
      nodeTitle: t.title || "",
      userId: t.assignee_id,
      userName: t.user_name || "",
      action: t.result || t.status,
      comment: t.comment,
      createdAt: t.completed_at || t.created_at,
    }));
  }

  static getMyNotifications(tenantId: number, userId: number, unreadOnly?: boolean) {
    let sql = "SELECT n.*, i.title as instance_title FROM workflow_notifications n JOIN workflow_instances i ON n.instance_id = i.id WHERE n.tenant_id = ? AND n.user_id = ?";
    if (unreadOnly) sql += " AND n.read_at IS NULL";
    sql += " ORDER BY n.created_at DESC LIMIT 50";
    return dbAll(sql, [tenantId, userId]);
  }

  static markNotificationRead(notificationId: number, userId: number) {
    dbRun("UPDATE workflow_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [notificationId, userId]);
  }

  static getStats(tenantId: number) {
    return {
      definitions: {
        total: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_definitions WHERE tenant_id = ?", [tenantId]) as DbRow)?.cnt || 0),
        active: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_definitions WHERE tenant_id = ? AND status = 'active'", [tenantId]) as DbRow)?.cnt || 0),
      },
      instances: {
        total: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_instances WHERE tenant_id = ?", [tenantId]) as DbRow)?.cnt || 0),
        running: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_instances WHERE tenant_id = ? AND status = 'running'", [tenantId]) as DbRow)?.cnt || 0),
        completed: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_instances WHERE tenant_id = ? AND status = 'completed'", [tenantId]) as DbRow)?.cnt || 0),
      },
      tasks: {
        pending: toNum((dbGet("SELECT COUNT(*) as cnt FROM workflow_tasks WHERE tenant_id = ? AND status = 'pending'", [tenantId]) as DbRow)?.cnt || 0),
      },
    };
  }

  // ========================
  // 分类管理
  // ========================

  static createCategory(params: { name: string; parentId?: number; icon?: string; formSchema?: any; sortOrder?: number }): number {
    const r = dbRun(
      "INSERT INTO workflow_categories (name, parent_id, icon, sort_order, form_schema) VALUES (?, ?, ?, ?, ?)",
      [params.name, params.parentId || null, params.icon || null, params.sortOrder || 0, params.formSchema ? toJson(params.formSchema) : null]
    );
    return toNum(r.lastInsertRowid);
  }

  static getCategories(parentId?: number | null) {
    let sql = "SELECT * FROM workflow_categories";
    const args: any[] = [];
    if (parentId !== undefined) {
      sql += " WHERE parent_id" + (parentId === null ? " IS NULL" : " = ?");
      if (parentId !== null) args.push(parentId);
    }
    sql += " ORDER BY sort_order, id";
    return dbAll(sql, args);
  }

  static getCategoryTree() {
    const all = dbAll("SELECT * FROM workflow_categories ORDER BY sort_order, id") as DbRow[];
    const map = new Map<number, any>();
    const roots: any[] = [];

    for (const row of all) {
      map.set(row.id, { ...row, children: [] });
    }
    for (const row of all) {
      const node = map.get(row.id);
      if (row.parent_id && map.has(row.parent_id)) {
        map.get(row.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  // ========================
  // 租户分类设置
  // ========================

  static setTenantCategory(tenantId: number, categoryId: number, settings: { enabled?: boolean; visibleDepts?: string[]; defaultCcRoles?: string[] }) {
    dbRun(
      `INSERT INTO tenant_category_settings (tenant_id, category_id, enabled, visible_depts, default_cc_roles)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, category_id) DO UPDATE SET
       enabled = COALESCE(?, enabled),
       visible_depts = COALESCE(?, visible_depts),
       default_cc_roles = COALESCE(?, default_cc_roles)`,
      [
        tenantId, categoryId,
        settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : 1,
        settings.visibleDepts ? toJson(settings.visibleDepts) : null,
        settings.defaultCcRoles ? toJson(settings.defaultCcRoles) : null,
        settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : null,
        settings.visibleDepts ? toJson(settings.visibleDepts) : null,
        settings.defaultCcRoles ? toJson(settings.defaultCcRoles) : null,
      ]
    );
  }

  static getTenantCategories(tenantId: number) {
    return dbAll(
      `SELECT c.*, tcs.enabled, tcs.visible_depts, tcs.default_cc_roles
       FROM workflow_categories c
       LEFT JOIN tenant_category_settings tcs ON c.id = tcs.category_id AND tcs.tenant_id = ?
       ORDER BY c.sort_order, c.id`,
      [tenantId]
    );
  }

  // ========================
  // 内部辅助
  // ========================

  private static _validateAndLoad(
    taskId: number, userId: number
  ): [WorkflowTaskRow, WorkflowInstanceRow, FlowDefinition] {
    const task = dbGet("SELECT * FROM workflow_tasks WHERE id = ?", [taskId]) as WorkflowTaskRow;
    if (!task) throw new Error("任务不存在");
    if (task.assignee_id !== userId) throw new Error("不是你的审批任务");

    const instance = dbGet("SELECT * FROM workflow_instances WHERE id = ?", [task.instance_id]) as WorkflowInstanceRow;
    if (!instance) throw new Error("流程实例不存在");

    let flowDef: FlowDefinition;
    if (instance.definition_snapshot_id) {
      const snap = getSnapshot(instance.definition_snapshot_id);
      if (!snap) throw new Error("流程定义快照丢失");
      flowDef = snap;
    } else {
      const def = dbGet("SELECT definition FROM workflow_definitions WHERE id = ?", [instance.workflow_id]) as DbRow;
      if (!def) throw new Error("流程模板不存在");
      flowDef = normalizeDefinition(def.definition);
    }

    return [task, instance, flowDef];
  }

  private static _markTaskComplete(task: WorkflowTaskRow, result: string, comment?: string) {
    dbRun(
      `UPDATE workflow_tasks
       SET status = 'completed', result = ?, comment = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result, comment || null, task.id]
    );
  }

  /** 从流程定义中提取 end 节点的通知角色，统一发送通知 */
  private static _notifyEnd(instanceId: number, tenantId: number, title: string, flowDef: FlowDefinition) {
    const endNode = flowDef.nodes.find(n => n.type === "end");
    const notifyRoles = (endNode?.config as EndNodeConfig)?.notifyRoles || ["audit_supervision", "it"];
    createNotifications(instanceId, tenantId, title, notifyRoles);
  }

  /** 审批通过后的进度推进 */
  private static _progressAfterApproval(
    task: WorkflowTaskRow,
    instance: WorkflowInstanceRow,
    flowDef: FlowDefinition,
    node: FlowNode,
  ): TaskActionResult {
    // 先检查同节点是否有否决/打回
    if (task.node_id) {
      const neg = getNodeNegativeAction(task.instance_id, task.node_id);
      if (neg.rejected) {
        cancelAllPendingTasks(task.instance_id);
        dbRun("UPDATE workflow_instances SET status = 'rejected', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [task.instance_id]);
        this._notifyEnd(task.instance_id, instance.tenant_id, instance.title || "流程审批", flowDef);
        return { flowStatus: "rejected", message: "流程已被否决" };
      }
      if (neg.returned) {
        return { flowStatus: "returned", message: "流程已被打回修改" };
      }
    }

    // 检查节点是否全部完成
    if (task.node_id && !isNodeComplete(task.instance_id, task.node_id)) {
      return { flowStatus: "waiting", message: "等待其他审批人" };
    }

    // 节点完成，推进到下一个
    const vars = fromJson(instance.variables) || {};
    const nextNodeIds = getNextNodeIds(flowDef, node.id, vars);

    // 收集所有非 end 节点的下一个审批节点
    const nextApprovalNodeIds: string[] = [];
    for (const nid of nextNodeIds) {
      const nextNode = flowDef.nodes.find(n => n.id === nid);
      if (!nextNode) continue;

      if (nextNode.type === "end") {
        // end 节点：完成流程
        dbRun(
          "UPDATE workflow_instances SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_node_ids = ? WHERE id = ?",
          [toJson(["end"]), task.instance_id]
        );
        this._notifyEnd(task.instance_id, instance.tenant_id, instance.title || "流程审批", flowDef);
        return { flowStatus: "completed", message: "流程已完成" };
      }

      if (nextNode.type === "condition") {
        // 条件节点自动跳转
        const afterCond = getNextNodeIds(flowDef, nextNode.id, vars);
        for (const acId of afterCond) {
          const acNode = flowDef.nodes.find(n => n.id === acId);
          if (acNode && acNode.type !== "end" && !nextApprovalNodeIds.includes(acId)) {
            nextApprovalNodeIds.push(acId);
          }
        }
      } else if (nextNode.type === "approval" || nextNode.type === "task") {
        nextApprovalNodeIds.push(nid);
      }
    }

    if (nextApprovalNodeIds.length === 0) {
      // 无下一个审批节点 → 完成
      dbRun(
        "UPDATE workflow_instances SET status = 'completed', completed_at = CURRENT_TIMESTAMP, current_node_ids = ? WHERE id = ?",
        [toJson(["end"]), task.instance_id]
      );
      this._notifyEnd(task.instance_id, instance.tenant_id, instance.title || "流程审批", flowDef);
      return { flowStatus: "completed", message: "流程已完成" };
    }

    // 为下一个节点创建任务
    let stepIndex = (dbGet(
      "SELECT MAX(step_index) as max_step FROM workflow_tasks WHERE instance_id = ?",
      [task.instance_id]
    ) as DbRow)?.max_step || 0;

    for (const nid of nextApprovalNodeIds) {
      stepIndex++;
      const nextNode = flowDef.nodes.find(n => n.id === nid);
      if (!nextNode) continue;

      const resolved = resolveNodeApprovers(nextNode, instance.started_by, instance.tenant_id);
      if (resolved.length > 0) {
        createTasksForNode(task.instance_id, instance.tenant_id, nextNode, resolved, stepIndex);
      }
    }

    dbRun(
      "UPDATE workflow_instances SET current_node_ids = ? WHERE id = ?",
      [toJson(nextApprovalNodeIds), task.instance_id]
    );

    return { flowStatus: "progressing", nextNodeIds: nextApprovalNodeIds, message: "已推进到下一节点" };
  }
}

// 重新导出，避免重复导入
interface NodeResolvedState {
  nodeId: string;
  approvers: ResolvedApprover[];
  signMode: SignMode;
}
