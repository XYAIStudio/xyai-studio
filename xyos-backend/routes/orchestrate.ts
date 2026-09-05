import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createOrchestration, analyzeTask, matchAgents,
  getOrchestrationStatus, updateSubTaskStatus, getOrchestrations
} from "../services/orchestrator";

export const orchestrateRoutes = Router();
orchestrateRoutes.use(authenticate);

// 获取编排任务列表
orchestrateRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tasks = getOrchestrations(req.user!.tenant_id);
    res.json({ success: true, data: tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建编排任务
orchestrateRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { title, description, goal } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });

    const idempotencyKey = String(req.headers["idempotency-key"] || req.body?.idempotencyKey || "").trim() || undefined;
    const id = createOrchestration(title, description || '', goal || '', req.user!.id, req.user!.tenant_id, {
      idempotencyKey,
      metadata: req.body?.metadata,
    });
    res.json({ success: true, data: { id, idempotencyKey: idempotencyKey || null } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 分析任务
orchestrateRoutes.post("/:id/analyze", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await analyzeTask(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 能力匹配
orchestrateRoutes.post("/:id/match", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const assignments = await matchAgents(parseInt(req.params.id));
    res.json({ success: true, data: assignments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取任务状态
orchestrateRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const status = getOrchestrationStatus(parseInt(req.params.id));
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取编排计划快照：用于 DSH+ 展示拆解依据、依赖、质检门槛和派工结果
orchestrateRoutes.get("/:id/plan", (req: AuthRequest, res) => {
  try {
    const status = getOrchestrationStatus(parseInt(req.params.id));
    if (!status?.task) return res.status(404).json({ success: false, error: "编排任务不存在" });
    const task = status.task;
    const parse = (value: unknown) => {
      if (typeof value !== "string") return value || null;
      try { return JSON.parse(value); } catch { return value; }
    };
    res.json({
      success: true,
      data: {
        orchestrationId: task.id,
        status: task.status,
        version: task.version || 1,
        planSnapshot: parse(task.plan_snapshot),
        executionSnapshot: parse(task.execution_snapshot),
        subtasks: status.subtasks,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新子任务状态
orchestrateRoutes.put("/subtask/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { status, result } = req.body;
    updateSubTaskStatus(parseInt(req.params.id), status, result);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
