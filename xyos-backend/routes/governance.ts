import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { GovernanceEngine } from "../services/governance";

export const governanceRoutes = Router();
governanceRoutes.use(authenticate);

// 获取治理统计概览
governanceRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const data = GovernanceEngine.getGovernanceStats(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.get("/permissions", (req: AuthRequest, res) => {
  try {
    const data = GovernanceEngine.getPermissionMatrix(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.get("/comm-rules", (req: AuthRequest, res) => {
  try {
    const data = GovernanceEngine.getCommRules(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.get("/templates", (req: AuthRequest, res) => {
  try {
    const data = GovernanceEngine.getProcessTemplates(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.get("/logs", (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit as string) : 50;
    const data = GovernanceEngine.getGovernanceLogs(req.user!.tenant_id, limit);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.post("/permissions", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { rules } = req.body;
    if (!rules || !Array.isArray(rules)) return res.status(400).json({ success: false, error: "rules数组必填" });
    GovernanceEngine.updatePermissionMatrix(req.user!.tenant_id, rules);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.post("/comm-rules", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { rules } = req.body;
    if (!rules || !Array.isArray(rules)) return res.status(400).json({ success: false, error: "rules数组必填" });
    GovernanceEngine.updateCommRules(req.user!.tenant_id, rules);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 创建流程模板
governanceRoutes.post("/templates", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, description, template_type, steps_json, is_default } = req.body;
    if (!name || !template_type || !steps_json) {
      return res.status(400).json({ success: false, error: "name/template_type/steps_json必填" });
    }
    GovernanceEngine.createProcessTemplate(req.user!.tenant_id, {
      name, description, template_type, steps_json, is_default
    });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新流程模板
governanceRoutes.put("/templates/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    GovernanceEngine.updateProcessTemplate(req.user!.tenant_id, id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除流程模板
governanceRoutes.delete("/templates/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    GovernanceEngine.deleteProcessTemplate(req.user!.tenant_id, id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.post("/validate", (req: AuthRequest, res) => {
  try {
    const { actor_level, action_type, target_type } = req.body;
    const result = GovernanceEngine.validateAction({
      tenantId: req.user!.tenant_id,
      actorLevel: actor_level,
      actorType: req.user!.role,
      actionType: action_type,
      targetType: target_type,
    });
    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 级联否决校验
governanceRoutes.post("/cascade-validate", (req: AuthRequest, res) => {
  try {
    const { actor_level, action_type, sender_level, receiver_level, comm_type, target_type } = req.body;
    const result = GovernanceEngine.cascadeValidation({
      tenantId: req.user!.tenant_id,
      actorLevel: actor_level,
      actionType: action_type,
      senderLevel: sender_level,
      receiverLevel: receiver_level,
      commType: comm_type,
      targetType: target_type,
    });
    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

governanceRoutes.post("/smart-route", (req: AuthRequest, res) => {
  try {
    const { task_complexity, team_has_manager } = req.body;
    const result = GovernanceEngine.smartRoute({
      tenantId: req.user!.tenant_id,
      taskComplexity: task_complexity || "simple",
      teamHasManager: team_has_manager || false,
    });
    res.json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
