import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { WorkflowEngine } from "../services/workflow";
import { dbAll, dbGet, dbRun } from "../db";

export const leaveRoutes = Router();
leaveRoutes.use(authenticate);

/** 请假申请列表 */
leaveRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const status = req.query.status as string;
    const leaveType = req.query.leave_type as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    let whereClauses = ["lr.tenant_id = ?"];
    let params: any[] = [tenantId];

    if (!isAdmin) {
      whereClauses.push("lr.employee_id = ?");
      params.push(userId);
    }
    if (status) {
      whereClauses.push("lr.status = ?");
      params.push(status);
    }
    if (leaveType) {
      whereClauses.push("lr.leave_type = ?");
      params.push(leaveType);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM leave_requests lr WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT lr.*, e.name as employee_name, d.name as department_name,
              se.name as substitute_name,
              rev.name as reviewer_name
       FROM leave_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN employees se ON lr.substitute_employee_id = se.id
       LEFT JOIN employees rev ON lr.reviewed_by = rev.id
       WHERE ${where}
       ORDER BY lr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { list: rows, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 提交请假申请 */
leaveRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { leave_type, start_date, end_date, total_days, reason, substitute_employee_id, workflow_id } = req.body;

    if (!leave_type || !start_date || !end_date || !total_days) {
      return res.status(400).json({ success: false, error: "缺少必填字段" });
    }

    const validTypes = ["annual", "sick", "personal", "marriage", "maternity", "bereavement", "other"];
    if (!validTypes.includes(leave_type)) {
      return res.status(400).json({ success: false, error: "无效的请假类型" });
    }

    // 计算总天数
    const days = total_days;
    if (days <= 0 || days > 365) {
      return res.status(400).json({ success: false, error: "请假天数必须在 1-365 天之间" });
    }

    // 获取申请人的部门
    const emp = dbGet("SELECT department_id FROM employees WHERE id = ?", [userId]);
    const departmentId = emp?.department_id || null;

    // 创建请假记录
    const result = dbRun(
      `INSERT INTO leave_requests (tenant_id, employee_id, department_id, leave_type, start_date, end_date, total_days, reason, substitute_employee_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [tenantId, userId, departmentId, leave_type, start_date, end_date, days, reason || null, substitute_employee_id || null]
    );
    const leaveId = result.lastInsertRowid;

    // 如果提供了 workflow_id，创建审批流程
    let workflowInstanceId = null;
    if (workflow_id) {
      workflowInstanceId = WorkflowEngine.createInstance({
        tenant_id: tenantId,
        workflow_id: workflow_id,
        title: `请假申请：${start_date} 至 ${end_date}（${days}天）`,
        variables: { leave_id: leaveId, leave_type, start_date, end_date, total_days: days },
        started_by: userId,
      });
      dbRun("UPDATE leave_requests SET workflow_instance_id = ? WHERE id = ?", [workflowInstanceId, leaveId]);
    }

    res.json({ success: true, message: "请假申请已提交", data: { id: leaveId, workflow_instance_id: workflowInstanceId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取请假申请详情 */
leaveRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    const userId = req.user!.id;

    const record = dbGet(
      `SELECT lr.*, e.name as employee_name, d.name as department_name
       FROM leave_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE lr.id = ? AND lr.tenant_id = ?`,
      [id, tenantId]
    );

    if (!record) return res.status(404).json({ success: false, error: "请假记录不存在" });
    if (!isAdmin && (record as any).employee_id !== userId) {
      return res.status(403).json({ success: false, error: "无权查看此记录" });
    }

    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 撤回请假申请（仅本人，且审批中） */
leaveRoutes.put("/:id/cancel", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);

    const record = dbGet("SELECT * FROM leave_requests WHERE id = ? AND tenant_id = ?", [id, tenantId]);
    if (!record) return res.status(404).json({ success: false, error: "请假记录不存在" });
    if ((record as any).employee_id !== userId) return res.status(403).json({ success: false, error: "无权操作" });
    if ((record as any).status !== "pending") return res.status(400).json({ success: false, error: "只有审批中的申请可以撤回" });

    dbRun("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [id]);
    res.json({ success: true, message: "请假申请已撤回" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取我的请假统计 */
leaveRoutes.get("/stats/summary", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const year = new Date().getFullYear();

    const stats = dbGet(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'approved' AND leave_type = 'annual' THEN total_days ELSE 0 END) as annual_used
       FROM leave_requests
       WHERE tenant_id = ? AND employee_id = ? AND strftime('%Y', start_date) = ?`,
      [tenantId, userId, String(year)]
    );

    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
