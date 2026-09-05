import { dbRun, dbGet, dbAll } from "../db";

export interface WorkflowDefinition {
  id?: number;
  tenant_id: number;
  name: string;
  description?: string;
  version?: number;
  status?: string;
  definition: string;
  created_by: number;
}

export interface WorkflowStep {
  id: string;
  type: "start" | "approval" | "task" | "condition" | "end";
  title: string;
  assignee_type?: "user" | "employee" | "role";
  assignee_id?: number;
  approver_ids?: number[];
  next_step?: string;
  conditions?: { field: string; operator: string; value: string }[];
}

export class WorkflowEngine {
  // 创建流程定义
  static createDefinition(params: WorkflowDefinition): number {
    const result = dbRun(
      `INSERT INTO workflow_definitions (tenant_id, name, description, version, status, definition, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [params.tenant_id, params.name, params.description || null, params.version || 1, params.status || "draft", params.definition, params.created_by]
    );
    return result.lastInsertRowid;
  }

  // 获取流程定义列表
  static getDefinitions(tenantId: number, status?: string) {
    let sql = "SELECT * FROM workflow_definitions WHERE tenant_id = ?";
    const args: any[] = [tenantId];
    if (status) {
      sql += " AND status = ?";
      args.push(status);
    }
    sql += " ORDER BY updated_at DESC";
    return dbAll(sql, args);
  }

  // 获取单个流程定义
  static getDefinition(tenantId: number, id: number) {
    return dbGet("SELECT * FROM workflow_definitions WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  }

  // 更新流程定义
  static updateDefinition(tenantId: number, id: number, params: Partial<WorkflowDefinition>) {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (params.name !== undefined) { fields.push("name = ?"); values.push(params.name); }
    if (params.description !== undefined) { fields.push("description = ?"); values.push(params.description); }
    if (params.status !== undefined) { fields.push("status = ?"); values.push(params.status); }
    if (params.definition !== undefined) { fields.push("definition = ?"); values.push(params.definition); }
    fields.push("updated_at = CURRENT_TIMESTAMP");
    
    if (fields.length === 0) return;
    
    values.push(tenantId, id);
    dbRun(`UPDATE workflow_definitions SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
  }

  // 删除流程定义
  static deleteDefinition(tenantId: number, id: number) {
    dbRun("DELETE FROM workflow_definitions WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  }

  // 启动流程实例
  static createInstance(params: {
    tenant_id: number;
    workflow_id: number;
    title?: string;
    variables?: any;
    started_by: number;
  }): number {
    const result = dbRun(
      `INSERT INTO workflow_instances (tenant_id, workflow_id, title, status, variables, current_step, started_by)
       VALUES (?, ?, ?, 'running', ?, 0, ?)`,
      [params.tenant_id, params.workflow_id, params.title || null, JSON.stringify(params.variables || {}), params.started_by]
    );
    const instanceId = result.lastInsertRowid;
    
    // 创建第一个任务
    const definition = dbGet("SELECT definition FROM workflow_definitions WHERE id = ?", [params.workflow_id]);
    if (definition) {
      const def = JSON.parse((definition as any).definition);
      if (def.steps && def.steps.length > 0) {
        const firstStep = def.steps[0];
        this.createTask({
          instance_id: instanceId,
          tenant_id: params.tenant_id,
          step_index: 0,
          title: firstStep.title,
          description: firstStep.description,
          type: firstStep.type,
          assignee_id: firstStep.assignee_id,
          assignee_type: firstStep.assignee_type,
          approver_ids: firstStep.approver_ids,
        });
      }
    }
    
    return instanceId;
  }

  // 获取流程实例列表
  static getInstances(tenantId: number, status?: string, started_by?: number) {
    let sql = `SELECT i.*, d.name as workflow_name 
               FROM workflow_instances i 
               LEFT JOIN workflow_definitions d ON i.workflow_id = d.id 
               WHERE i.tenant_id = ?`;
    const args: any[] = [tenantId];
    if (status) {
      sql += " AND i.status = ?";
      args.push(status);
    }
    if (started_by) {
      sql += " AND i.started_by = ?";
      args.push(started_by);
    }
    sql += " ORDER BY i.started_at DESC";
    return dbAll(sql, args);
  }

  // 获取单个流程实例
  static getInstance(tenantId: number, id: number) {
    return dbGet(
      `SELECT i.*, d.name as workflow_name, d.definition 
       FROM workflow_instances i 
       LEFT JOIN workflow_definitions d ON i.workflow_id = d.id 
       WHERE i.tenant_id = ? AND i.id = ?`,
      [tenantId, id]
    );
  }

  // 获取流程实例的任务列表
  static getInstanceTasks(tenantId: number, instanceId: number) {
    return dbAll(
      "SELECT * FROM workflow_tasks WHERE tenant_id = ? AND instance_id = ? ORDER BY step_index",
      [tenantId, instanceId]
    );
  }

  // 创建流程任务
  static createTask(params: {
    instance_id: number;
    tenant_id: number;
    step_index: number;
    title: string;
    description?: string;
    type?: string;
    assignee_id?: number;
    assignee_type?: string;
    approver_ids?: number[];
    due_date?: string;
  }): number {
    const result = dbRun(
      `INSERT INTO workflow_tasks (instance_id, tenant_id, step_index, title, description, type, status, assignee_id, assignee_type, approver_ids, due_date)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        params.instance_id,
        params.tenant_id,
        params.step_index,
        params.title,
        params.description || null,
        params.type || "approval",
        params.assignee_id || null,
        params.assignee_type || "user",
        params.approver_ids ? JSON.stringify(params.approver_ids) : null,
        params.due_date || null,
      ]
    );
    return result.lastInsertRowid;
  }

  // 获取我的任务
  static getMyTasks(tenantId: number, userId: number) {
    return dbAll(
      `SELECT t.*, i.title as instance_title, d.name as workflow_name
       FROM workflow_tasks t
       LEFT JOIN workflow_instances i ON t.instance_id = i.id
       LEFT JOIN workflow_definitions d ON i.workflow_id = d.id
       WHERE t.tenant_id = ? AND (t.assignee_id = ? OR t.approver_ids LIKE ?) AND t.status = 'pending'
       ORDER BY t.created_at DESC`,
      [tenantId, userId, `%${userId}%`]
    );
  }

  // 完成任务
  static completeTask(tenantId: number, taskId: number, params: {
    result: "approve" | "reject";
    comment?: string;
    completed_by: number;
  }) {
    const task = dbGet("SELECT * FROM workflow_tasks WHERE tenant_id = ? AND id = ?", [tenantId, taskId]);
    if (!task) throw new Error("任务不存在");
    if ((task as any).status !== "pending") throw new Error("任务已完成");

    // 更新任务状态
    dbRun(
      `UPDATE workflow_tasks SET status = 'completed', result = ?, comment = ?, completed_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [params.result, params.comment || null, tenantId, taskId]
    );

    // 如果是拒绝，终止流程
    if (params.result === "reject") {
      dbRun(
        "UPDATE workflow_instances SET status = 'rejected', completed_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id = ?",
        [tenantId, (task as any).instance_id]
      );
      return { next: false, status: "rejected" };
    }

    // 获取流程定义，确定下一步
    const instance = dbGet("SELECT * FROM workflow_instances WHERE tenant_id = ? AND id = ?", [tenantId, (task as any).instance_id]);
    if (!instance) return { next: false, status: "completed" };

    const definition = dbGet("SELECT definition FROM workflow_definitions WHERE id = ?", [(instance as any).workflow_id]);
    if (!definition) return { next: false, status: "completed" };

    const def = JSON.parse((definition as any).definition);
    const currentStep = (task as any).step_index;
    const nextStepIndex = currentStep + 1;

    // 检查是否还有下一步
    if (!def.steps || nextStepIndex >= def.steps.length) {
      // 流程完成
      dbRun(
        "UPDATE workflow_instances SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id = ?",
        [tenantId, (task as any).instance_id]
      );
      return { next: false, status: "completed" };
    }

    // 创建下一步任务
    const nextStep = def.steps[nextStepIndex];
    this.createTask({
      instance_id: (task as any).instance_id,
      tenant_id: tenantId,
      step_index: nextStepIndex,
      title: nextStep.title,
      description: nextStep.description,
      type: nextStep.type,
      assignee_id: nextStep.assignee_id,
      assignee_type: nextStep.assignee_type,
      approver_ids: nextStep.approver_ids,
    });

    // 更新实例当前步骤
    dbRun(
      "UPDATE workflow_instances SET current_step = ? WHERE tenant_id = ? AND id = ?",
      [nextStepIndex, tenantId, (task as any).instance_id]
    );

    return { next: true, nextStep, status: "running" };
  }

  // 获取流程统计
  static getStats(tenantId: number) {
    const totalDefinitions = dbGet("SELECT COUNT(*) as count FROM workflow_definitions WHERE tenant_id = ?", [tenantId])?.count || 0;
    const activeDefinitions = dbGet("SELECT COUNT(*) as count FROM workflow_definitions WHERE tenant_id = ? AND status = 'active'", [tenantId])?.count || 0;
    const totalInstances = dbGet("SELECT COUNT(*) as count FROM workflow_instances WHERE tenant_id = ?", [tenantId])?.count || 0;
    const runningInstances = dbGet("SELECT COUNT(*) as count FROM workflow_instances WHERE tenant_id = ? AND status = 'running'", [tenantId])?.count || 0;
    const completedInstances = dbGet("SELECT COUNT(*) as count FROM workflow_instances WHERE tenant_id = ? AND status = 'completed'", [tenantId])?.count || 0;
    const pendingTasks = dbGet("SELECT COUNT(*) as count FROM workflow_tasks WHERE tenant_id = ? AND status = 'pending'", [tenantId])?.count || 0;

    return {
      definitions: { total: totalDefinitions, active: activeDefinitions },
      instances: { total: totalInstances, running: runningInstances, completed: completedInstances },
      tasks: { pending: pendingTasks },
    };
  }
}
