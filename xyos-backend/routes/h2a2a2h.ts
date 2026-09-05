/**
 * V0.70 R2 H2A2A2H 路由
 *
 * POST /api/h2a2a2h/tasks            — 创建任务
 * POST /api/h2a2a2h/tasks/:id/claim   — 认领任务
 * POST /api/h2a2a2h/tasks/:id/execute — 开始执行
 * POST /api/h2a2a2h/tasks/:id/submit  — 提交审核
 * POST /api/h2a2a2h/tasks/:id/review  — 审核（通过/驳回）
 * POST /api/h2a2a2h/tasks/:id/dispute — 发起争议
 * POST /api/h2a2a2h/tasks/:id/arbitrate — 仲裁
 * GET  /api/h2a2a2h/tasks/:id         — 查看任务详情+状态
 * GET  /api/h2a2a2h/tasks             — 列出任务（按状态筛选）
 */

import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbGet, dbAll, dbRun } from "../db";
import { H2A2A2HStateMachine, raiseDispute, arbitrateDispute } from "../services/h2a2a2h-state-machine";
import type { H2A2A2HState } from "../services/h2a2a2h-state-machine";
import { assembleH2A2A2HSnapshot } from "../services/h2a2a2h-snapshot";

export const h2a2a2hRoutes = Router();
h2a2a2hRoutes.use(authenticate);

// 创建任务
h2a2a2hRoutes.post("/tasks", (req: AuthRequest, res) => {
  try {
    const { title, description, reviewer_id } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });

    const result = dbRun(
      "INSERT INTO h2a2a2h_tasks (title, description, created_by, reviewer_id, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [title, description || "", req.user!.id, reviewer_id || null, req.user!.tenant_id]
    );

    res.json({ success: true, data: { id: result.lastInsertRowid, state: "created" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 认领
h2a2a2hRoutes.post("/tasks/:id/claim", (req: AuthRequest, res) => {
  try {
    H2A2A2HStateMachine.transition(parseInt(req.params.id), "claimed", req.user!.id, {
      claimUserId: req.user!.id,
    });
    res.json({ success: true, state: "claimed" });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 开始执行
h2a2a2hRoutes.post("/tasks/:id/execute", (req: AuthRequest, res) => {
  try {
    H2A2A2HStateMachine.transition(parseInt(req.params.id), "executing", req.user!.id);
    res.json({ success: true, state: "executing" });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 提交
h2a2a2hRoutes.post("/tasks/:id/submit", (req: AuthRequest, res) => {
  try {
    H2A2A2HStateMachine.transition(parseInt(req.params.id), "submitted", req.user!.id);
    res.json({ success: true, state: "submitted" });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 审核
h2a2a2hRoutes.post("/tasks/:id/review", (req: AuthRequest, res) => {
  try {
    const { action } = req.body; // "approve" | "reject"
    const taskId = parseInt(req.params.id);
    // 提交后需先进入"审核中"，再裁决（submitted → reviewing → completed/rejected）
    const task = dbGet("SELECT state FROM h2a2a2h_tasks WHERE id = ?", [taskId]) as any;
    if (task?.state === "submitted") {
      H2A2A2HStateMachine.transition(taskId, "reviewing", req.user!.id);
    }
    const toState: H2A2A2HState = action === "reject" ? "rejected" : "completed";
    H2A2A2HStateMachine.transition(taskId, toState, req.user!.id);
    res.json({ success: true, state: toState });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 争议
h2a2a2hRoutes.post("/tasks/:id/dispute", (req: AuthRequest, res) => {
  try {
    const { reason } = req.body;
    raiseDispute(parseInt(req.params.id), req.user!.id, reason || "");
    res.json({ success: true, state: "disputed" });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 仲裁
h2a2a2hRoutes.post("/tasks/:id/arbitrate", (req: AuthRequest, res) => {
  try {
    const { result, note } = req.body; // result: "completed" | "rejected"
    arbitrateDispute(parseInt(req.params.id), req.user!.id, result || "completed", note || "");
    res.json({ success: true, state: result });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

// 查看详情
h2a2a2hRoutes.get("/tasks/:id", (req: AuthRequest, res) => {
  const task = dbGet(
    "SELECT * FROM h2a2a2h_tasks WHERE id = ? AND tenant_id = ?",
    [req.params.id, req.user!.tenant_id]
  );
  if (!task) return res.status(404).json({ success: false, error: "任务不存在" });
  const log = dbAll(
    "SELECT * FROM h2a2a2h_state_log WHERE task_id = ? ORDER BY created_at",
    [req.params.id]
  );
  res.json({ success: true, data: { ...task as any, stateLog: log } });
});

// 列表
h2a2a2hRoutes.get("/tasks", (req: AuthRequest, res) => {
  const state = req.query.state;
  let sql = "SELECT * FROM h2a2a2h_tasks WHERE tenant_id = ?";
  const params: any[] = [req.user!.tenant_id];
  if (state) { sql += " AND state = ?"; params.push(state); }
  sql += " ORDER BY updated_at DESC LIMIT 50";
  res.json({ success: true, data: dbAll(sql, params) });
});

// 群聊活动快照（第二步可视化：影子账本 → 结构化快照，前端活动面板消费）
h2a2a2hRoutes.get("/chats/:chatId/snapshot", (req: AuthRequest, res) => {
  try {
    const snapshot = assembleH2A2A2HSnapshot(parseInt(req.params.chatId));
    res.json({ success: true, data: snapshot });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
