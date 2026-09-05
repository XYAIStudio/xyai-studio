import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { WorkflowEngineV2, getSnapshot } from "../services/workflow-v2";
import { dbGet } from "../db";

export const workflowV2Routes = Router();
workflowV2Routes.use(authenticate);

// ============================================================
// 分类管理 (集团超管)
// ============================================================

// 获取分类树
workflowV2Routes.get("/categories", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngineV2.getCategoryTree();
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 创建分类 (超管)
workflowV2Routes.post("/categories", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, parentId, icon, formSchema, sortOrder } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "分类名必填" });
    const id = WorkflowEngineV2.createCategory({ name, parentId, icon, formSchema, sortOrder });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取租户分类设置
workflowV2Routes.get("/tenant-categories", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngineV2.getTenantCategories(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 设置租户分类
workflowV2Routes.put("/tenant-categories/:categoryId", requireAdmin, (req: AuthRequest, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const { enabled, visibleDepts, defaultCcRoles } = req.body;
    WorkflowEngineV2.setTenantCategory(req.user!.tenant_id, categoryId, { enabled, visibleDepts, defaultCcRoles });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// 模板 CRUD
// ============================================================

// 统计
workflowV2Routes.get("/stats", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngineV2.getStats(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取模板列表
workflowV2Routes.get("/definitions", (req: AuthRequest, res) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const status = req.query.status as string | undefined;
    const data = WorkflowEngineV2.getDefinitions(req.user!.tenant_id, categoryId, status);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取单个模板 (含解析后的 DAG)
workflowV2Routes.get("/definitions/:id", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = WorkflowEngineV2.getDefinition(req.user!.tenant_id, id);
    if (!data) return res.status(404).json({ success: false, error: "模板不存在" });
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 创建模板
workflowV2Routes.post("/definitions", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, description, categoryId, schemeName, icon, definition, status } = req.body;
    if (!name || !definition) return res.status(400).json({ success: false, error: "name 和 definition 必填" });
    const id = WorkflowEngineV2.createDefinition({
      tenantId: req.user!.tenant_id,
      name,
      description,
      categoryId,
      schemeName,
      icon,
      definition: typeof definition === "string" ? JSON.parse(definition) : definition,
      createdBy: req.user!.id,
      status,
    });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新模板
workflowV2Routes.put("/definitions/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, definition, status, categoryId, schemeName } = req.body;
    WorkflowEngineV2.updateDefinition({
      tenantId: req.user!.tenant_id,
      id,
      userId: req.user!.id,
      name,
      description,
      status,
      definition: definition ? (typeof definition === "string" ? JSON.parse(definition) : definition) : undefined,
      categoryId,
      schemeName,
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除模板
workflowV2Routes.delete("/definitions/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    WorkflowEngineV2.deleteDefinition(req.user!.tenant_id, id, req.user!.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 克隆模板
workflowV2Routes.post("/definitions/:id/clone", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;
    const newId = WorkflowEngineV2.cloneDefinition(req.user!.tenant_id, id, req.user!.id, name || "副本");
    res.json({ success: true, data: { id: newId } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// 流程实例
// ============================================================

// 获取实例列表
workflowV2Routes.get("/instances", (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const data = WorkflowEngineV2.getInstances(req.user!.tenant_id, status);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取实例详情 + 任务列表 + 时间线 + 流程定义 + 提交人
workflowV2Routes.get("/instances/:id", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const instance = WorkflowEngineV2.getInstance(req.user!.tenant_id, id);
    if (!instance) return res.status(404).json({ success: false, error: "实例不存在" });
    const tasks = WorkflowEngineV2.getInstanceTasks(req.user!.tenant_id, id);
    const timeline = WorkflowEngineV2.getTimeline(id);

    // 获取流程定义（优先快照）
    let flowDef: any = null;
    if ((instance as any).definition_snapshot_id) {
      flowDef = getSnapshot((instance as any).definition_snapshot_id);
    }
    if (!flowDef) {
      const defRow = dbGet("SELECT definition FROM workflow_definitions WHERE id = ?", [instance.workflow_id]) as any;
      if (defRow) {
        try { flowDef = JSON.parse(defRow.definition); } catch {}
      }
    }

    // 获取提交人名称
    let submitter: any = null;
    if (instance.started_by) {
      const user = dbGet("SELECT id, nickname FROM users WHERE id = ?", [instance.started_by]) as any;
      if (user) submitter = user;
    }

    // 解析 variables 便于前端展示
    let parsedVars: any = {};
    try { parsedVars = JSON.parse((instance as any).variables || "{}"); } catch {}

    res.json({ success: true, data: { ...instance, tasks, timeline, flowDef, submitter, variables: parsedVars } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 发起流程
workflowV2Routes.post("/instances", (req: AuthRequest, res) => {
  try {
    const { workflowId, title, variables, nodeAssignments } = req.body;
    if (!workflowId) return res.status(400).json({ success: false, error: "workflowId 必填" });
    const data = WorkflowEngineV2.createInstance({
      tenantId: req.user!.tenant_id,
      workflowId,
      title,
      variables,
      startedBy: req.user!.id,
      nodeAssignments,
    });
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 撤回流程
workflowV2Routes.post("/instances/:id/cancel", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = WorkflowEngineV2.cancelInstance(id, req.user!.id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 打回后重新提交
workflowV2Routes.post("/instances/:id/resubmit", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { variables } = req.body;
    const data = WorkflowEngineV2.resubmitInstance(id, req.user!.id, variables);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 管理员强制关闭
workflowV2Routes.post("/instances/:id/force-close", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: "关闭原因必填" });
    const data = WorkflowEngineV2.forceCloseInstance(id, req.user!.id, reason);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// 任务操作
// ============================================================

// 我的待办
workflowV2Routes.get("/tasks", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngineV2.getMyTasks(req.user!.tenant_id, req.user!.id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 同意
workflowV2Routes.post("/tasks/:id/approve", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { comment } = req.body;
    const data = WorkflowEngineV2.approveTask(id, req.user!.id, comment);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 否决
workflowV2Routes.post("/tasks/:id/reject", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { comment } = req.body;
    const data = WorkflowEngineV2.rejectTask(id, req.user!.id, comment);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 打回修改
workflowV2Routes.post("/tasks/:id/return", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { comment } = req.body;
    const data = WorkflowEngineV2.returnTask(id, req.user!.id, comment);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 转签
workflowV2Routes.post("/tasks/:id/delegate", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { delegateToId, reason } = req.body;
    if (!delegateToId) return res.status(400).json({ success: false, error: "delegateToId 必填" });
    const data = WorkflowEngineV2.delegateTask(id, req.user!.id, delegateToId, reason);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 加签
workflowV2Routes.post("/tasks/:id/add-sign", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { userId: newUserId, reason } = req.body;
    if (!newUserId) return res.status(400).json({ success: false, error: "userId 必填" });
    const data = WorkflowEngineV2.addSigner(id, req.user!.id, newUserId, reason);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================
// 知会通知
// ============================================================

workflowV2Routes.get("/notifications", (req: AuthRequest, res) => {
  try {
    const unreadOnly = req.query.unread === "1";
    const data = WorkflowEngineV2.getMyNotifications(req.user!.tenant_id, req.user!.id, unreadOnly);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowV2Routes.post("/notifications/:id/read", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    WorkflowEngineV2.markNotificationRead(id, req.user!.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
