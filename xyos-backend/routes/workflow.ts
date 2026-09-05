import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { WorkflowEngine } from "../services/workflow";
import { normalizeWorkflowDefinition } from "../services/workflow-canonical";

export const workflowRoutes = Router();
workflowRoutes.use(authenticate);

// 获取流程统计
workflowRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngine.getStats(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 流程定义相关
workflowRoutes.get("/definitions", (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const data = WorkflowEngine.getDefinitions(req.user!.tenant_id, status);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.get("/definitions/:id", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = WorkflowEngine.getDefinition(req.user!.tenant_id, id);
    if (!data) return res.status(404).json({ success: false, error: "流程定义不存在" });
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.get("/definitions/:id/canonical", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = WorkflowEngine.getDefinition(req.user!.tenant_id, id) as any;
    if (!data) return res.status(404).json({ success: false, error: "流程定义不存在" });
    res.json({
      success: true,
      data: normalizeWorkflowDefinition({
        id: data.id,
        name: data.name,
        description: data.description,
        definition: data.definition,
        formSchema: data.form_schema,
      }),
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.post("/definitions", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, description, definition, status } = req.body;
    if (!name || !definition) return res.status(400).json({ success: false, error: "name和definition必填" });
    const id = WorkflowEngine.createDefinition({
      tenant_id: req.user!.tenant_id,
      name,
      description,
      definition: typeof definition === "string" ? definition : JSON.stringify(definition),
      created_by: req.user!.id,
      status,
    });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.put("/definitions/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, definition, status } = req.body;
    WorkflowEngine.updateDefinition(req.user!.tenant_id, id, {
      name,
      description,
      definition: definition ? (typeof definition === "string" ? definition : JSON.stringify(definition)) : undefined,
      status,
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.delete("/definitions/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    WorkflowEngine.deleteDefinition(req.user!.tenant_id, id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 流程实例相关
workflowRoutes.get("/instances", (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const data = WorkflowEngine.getInstances(req.user!.tenant_id, status);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.get("/instances/:id", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const instance = WorkflowEngine.getInstance(req.user!.tenant_id, id);
    if (!instance) return res.status(404).json({ success: false, error: "流程实例不存在" });
    const tasks = WorkflowEngine.getInstanceTasks(req.user!.tenant_id, id);
    res.json({ success: true, data: { ...instance, tasks } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.post("/instances", (req: AuthRequest, res) => {
  try {
    const { workflow_id, title, variables } = req.body;
    if (!workflow_id) return res.status(400).json({ success: false, error: "workflow_id必填" });
    const id = WorkflowEngine.createInstance({
      tenant_id: req.user!.tenant_id,
      workflow_id,
      title,
      variables,
      started_by: req.user!.id,
    });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 流程任务相关
workflowRoutes.get("/tasks", (req: AuthRequest, res) => {
  try {
    const data = WorkflowEngine.getMyTasks(req.user!.tenant_id, req.user!.id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

workflowRoutes.post("/tasks/:id/complete", (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { result, comment } = req.body;
    if (!result || !["approve", "reject"].includes(result)) {
      return res.status(400).json({ success: false, error: "result必须是approve或reject" });
    }
    const data = WorkflowEngine.completeTask(req.user!.tenant_id, id, {
      result,
      comment,
      completed_by: req.user!.id,
    });
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
