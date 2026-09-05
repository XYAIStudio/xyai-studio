import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, AuthRequest } from "../middleware";
import { notifyTaskAssigned, notifyTaskStatusChanged, logActivity } from "../services/notification";
import { AuditTrailEngine } from "../services/audit-trail";

export const taskRoutes = Router();
taskRoutes.use(authenticate);

function getScopedTask(req: AuthRequest, rawTaskId: unknown): any | null {
  const taskId = Number(rawTaskId);
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return null;
  return dbGet("SELECT * FROM tasks WHERE id = ? AND tenant_id = ?", [taskId, req.user!.tenant_id]) as any | null;
}

taskRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const { status, priority, assigned_to, search } = req.query;
    let sql = `SELECT t.*, e.name as assignee_name, e.avatar_emoji as assignee_avatar, e.avatar_url as assignee_avatar_url,
      (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id) as subtask_count,
      (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id AND completed = 1) as subtask_done,
      (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) as comment_count
      FROM tasks t LEFT JOIN employees e ON t.assigned_to = e.id AND e.tenant_id = t.tenant_id WHERE t.tenant_id = ?`;
    const params: any[] = [req.user!.tenant_id];

    if (status && status !== "all") { sql += " AND t.status = ?"; params.push(status); }
    if (priority) { sql += " AND t.priority = ?"; params.push(priority); }
    if (assigned_to) { sql += " AND t.assigned_to = ?"; params.push(assigned_to); }
    if (search) { sql += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

    sql += " ORDER BY t.created_at DESC";
    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const rows = dbAll("SELECT status, COUNT(*) as count FROM tasks WHERE tenant_id = ? GROUP BY status", [req.user!.tenant_id]) as any[];
    const stats: Record<string, number> = { total: 0, todo: 0, in_progress: 0, done: 0, review: 0 };
    for (const r of rows) { stats[r.status] = r.count; stats.total += r.count; }
    res.json({ success: true, data: stats });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const task = dbGet(
      `SELECT t.*, e.name as assignee_name, e.avatar_emoji as assignee_avatar, e.avatar_url as assignee_avatar_url,
        u.nickname as creator_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id AND e.tenant_id = t.tenant_id
       LEFT JOIN users u ON t.created_by = u.id AND u.tenant_id = t.tenant_id
       WHERE t.id = ? AND t.tenant_id = ?`,
      [req.params.id, req.user!.tenant_id]
    );
    if (!task) return res.status(404).json({ success: false, error: "任务不存在" });

    const subtasks = dbAll(
      "SELECT * FROM task_subtasks WHERE task_id = ? AND tenant_id = ? ORDER BY sort_order",
      [req.params.id, req.user!.tenant_id]
    );

    const comments = dbAll(
      `SELECT tc.*,
        CASE WHEN tc.user_id IS NOT NULL THEN (SELECT nickname FROM users WHERE id = tc.user_id AND tenant_id = tc.tenant_id) ELSE NULL END as user_name,
        CASE WHEN tc.employee_id IS NOT NULL THEN (SELECT name FROM employees WHERE id = tc.employee_id AND tenant_id = tc.tenant_id) ELSE NULL END as employee_name,
        CASE WHEN tc.employee_id IS NOT NULL THEN (SELECT avatar_emoji FROM employees WHERE id = tc.employee_id AND tenant_id = tc.tenant_id) ELSE NULL END as employee_avatar
       FROM task_comments tc WHERE tc.task_id = ? AND tc.tenant_id = ? ORDER BY tc.created_at`,
      [req.params.id, req.user!.tenant_id]
    );

    const attachments = dbAll(
      "SELECT * FROM task_attachments WHERE task_id = ? AND tenant_id = ? ORDER BY created_at",
      [req.params.id, req.user!.tenant_id]
    );

    res.json({ success: true, data: { ...task, subtasks, comments, attachments } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, due_date } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });
    if (assigned_to && !dbGet("SELECT 1 FROM employees WHERE id = ? AND tenant_id = ? AND status = 'active'", [assigned_to, req.user!.tenant_id])) {
      return res.status(400).json({ success: false, error: "受派员工不存在、未启用或不属于当前集团" });
    }

    const result = dbRun(
      "INSERT INTO tasks (title, description, priority, assigned_to, tenant_id, status, created_by) VALUES (?, ?, ?, ?, ?, 'todo', ?)",
      [title, description || "", priority || "medium", assigned_to || null, req.user!.tenant_id, req.user!.id]
    );

    logActivity({
      userId: req.user!.id,
      action: "task_created",
      entityType: "task",
      entityId: result.lastInsertRowid,
      details: JSON.stringify({ title, priority }),
      tenantId: req.user!.tenant_id,
    });

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id,
      actorType: "user",
      actorId: req.user!.id,
      actorName: req.user!.nickname,
      actionType: "task",
      actionDetail: "create",
      targetType: "task",
      targetId: result.lastInsertRowid,
      targetName: title,
    });

    if (assigned_to) {
      notifyTaskAssigned(result.lastInsertRowid, title, assigned_to, req.user!.nickname);
    }

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, due_date } = req.body;
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    if (assigned_to !== undefined && assigned_to !== null && !dbGet("SELECT 1 FROM employees WHERE id = ? AND tenant_id = ? AND status = 'active'", [assigned_to, req.user!.tenant_id])) {
      return res.status(400).json({ success: false, error: "受派员工不存在、未启用或不属于当前集团" });
    }
    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (priority !== undefined) { updates.push("priority = ?"); params.push(priority); }
    if (assigned_to !== undefined) { updates.push("assigned_to = ?"); params.push(assigned_to); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.id, req.user!.tenant_id);

    dbRun(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);

    logActivity({
      userId: req.user!.id,
      action: "task_updated",
      entityType: "task",
      entityId: parseInt(req.params.id as string),
      details: JSON.stringify(req.body),
      tenantId: req.user!.tenant_id,
    });

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id,
      actorType: "user",
      actorId: req.user!.id,
      actorName: req.user!.nickname,
      actionType: "task",
      actionDetail: "update",
      targetType: "task",
      targetId: parseInt(req.params.id as string),
      afterState: req.body,
    });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    dbRun("DELETE FROM task_subtasks WHERE task_id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    dbRun("DELETE FROM task_comments WHERE task_id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    dbRun("DELETE FROM task_attachments WHERE task_id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    dbRun("DELETE FROM tasks WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);

    logActivity({
      userId: req.user!.id,
      action: "task_deleted",
      entityType: "task",
      entityId: parseInt(req.params.id as string),
      tenantId: req.user!.tenant_id,
    });

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id,
      actorType: "user",
      actorId: req.user!.id,
      actorName: req.user!.nickname,
      actionType: "task",
      actionDetail: "delete",
      targetType: "task",
      targetId: parseInt(req.params.id as string),
    });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.post("/:id/transition", (req: AuthRequest, res) => {
  try {
    const { to } = req.body;
    if (!["todo", "in_progress", "review", "done"].includes(to)) return res.status(400).json({ success: false, error: "无效状态" });

    const task = dbGet("SELECT * FROM tasks WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    if (!task) return res.status(404).json({ success: false, error: "任务不存在" });

    dbRun("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?", [to, req.params.id, req.user!.tenant_id]);

    logActivity({
      userId: req.user!.id,
      action: "task_status_changed",
      entityType: "task",
      entityId: parseInt(req.params.id as string),
      details: JSON.stringify({ from: task.status, to }),
      tenantId: req.user!.tenant_id,
    });

    AuditTrailEngine.logOrgBehavior({
      tenantId: req.user!.tenant_id,
      actorType: "user",
      actorId: req.user!.id,
      actorName: req.user!.nickname,
      actionType: "task",
      actionDetail: "status_change",
      targetType: "task",
      targetId: parseInt(req.params.id as string),
      targetName: task.title,
      beforeState: { status: task.status },
      afterState: { status: to },
    });

    if (task.created_by && task.created_by !== req.user!.id) {
      notifyTaskStatusChanged(parseInt(req.params.id as string), task.title, to, task.created_by, req.user!.nickname);
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.post("/:id/subtasks", (req: AuthRequest, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });

    const maxOrder = dbGet("SELECT MAX(sort_order) as m FROM task_subtasks WHERE task_id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    const result = dbRun(
      "INSERT INTO task_subtasks (task_id, title, sort_order, tenant_id) VALUES (?, ?, ?, ?)",
      [req.params.id, title, (maxOrder?.m || 0) + 1, req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.put("/:id/subtasks/:subtaskId", (req: AuthRequest, res) => {
  try {
    const { title, completed } = req.body;
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (completed !== undefined) { updates.push("completed = ?"); params.push(completed ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    params.push(req.params.subtaskId, req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE task_subtasks SET ${updates.join(", ")} WHERE id = ? AND task_id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.delete("/:id/subtasks/:subtaskId", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    dbRun("DELETE FROM task_subtasks WHERE id = ? AND task_id = ? AND tenant_id = ?", [req.params.subtaskId, req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.post("/:id/comments", (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "内容必填" });
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });

    const result = dbRun(
      "INSERT INTO task_comments (task_id, user_id, content, comment_type, tenant_id) VALUES (?, ?, ?, 'user', ?)",
      [req.params.id, req.user!.id, content, req.user!.tenant_id]
    );

    const comment = dbGet(
      `SELECT tc.*, u.nickname as user_name
       FROM task_comments tc LEFT JOIN users u ON tc.user_id = u.id AND u.tenant_id = tc.tenant_id
       WHERE tc.id = ? AND tc.tenant_id = ?`,
      [result.lastInsertRowid, req.user!.tenant_id]
    );

    res.json({ success: true, data: comment });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.delete("/:id/comments/:commentId", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    dbRun("DELETE FROM task_comments WHERE id = ? AND task_id = ? AND user_id = ? AND tenant_id = ?", [req.params.commentId, req.params.id, req.user!.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.get("/:id/attachments", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    const attachments = dbAll(
      "SELECT * FROM task_attachments WHERE task_id = ? AND tenant_id = ? ORDER BY created_at",
      [req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: attachments });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.post("/:id/attachments", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    // A client-controlled physical file path is never an acceptable attachment
    // contract. R0 keeps this write endpoint closed until controlled upload,
    // scanning and authorized download are implemented together.
    res.status(409).json({ success: false, error: "任务附件受控上传将在后续安全工作包启用" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

taskRoutes.delete("/:id/attachments/:attachmentId", (req: AuthRequest, res) => {
  try {
    if (!getScopedTask(req, req.params.id)) return res.status(404).json({ success: false, error: "任务不存在或无访问权限" });
    dbRun("DELETE FROM task_attachments WHERE id = ? AND task_id = ? AND tenant_id = ?", [req.params.attachmentId, req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
