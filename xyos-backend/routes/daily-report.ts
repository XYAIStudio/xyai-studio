import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbAll, dbGet, dbRun } from "../db";

export const dailyReportRoutes = Router();
dailyReportRoutes.use(authenticate);

/** 日报/周报列表 */
dailyReportRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const reportType = req.query.report_type as string;
    const departmentId = req.query.department_id as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    let whereClauses = ["dr.tenant_id = ?"];
    let params: any[] = [tenantId];

    if (!isAdmin) {
      // 非管理员只能看自己和下属的日报
      whereClauses.push("dr.employee_id = ?");
      params.push(userId);
    } else if (departmentId) {
      whereClauses.push("dr.department_id = ?");
      params.push(parseInt(departmentId));
    }

    if (reportType) {
      whereClauses.push("dr.report_type = ?");
      params.push(reportType);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM daily_reports dr WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT dr.*, e.name as employee_name, d.name as department_name,
              (SELECT COUNT(*) FROM daily_report_comments WHERE report_id = dr.id) as comment_count
       FROM daily_reports dr
       LEFT JOIN employees e ON dr.employee_id = e.id
       LEFT JOIN departments d ON dr.department_id = d.id
       WHERE ${where}
       ORDER BY dr.report_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { list: rows, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 提交日报/周报 */
dailyReportRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { report_type, report_date, title, work_summary, tomorrow_plan, issues_blockers, attachments } = req.body;

    if (!report_type || !report_date || !work_summary) {
      return res.status(400).json({ success: false, error: "缺少必填字段" });
    }

    const validTypes = ["daily", "weekly"];
    if (!validTypes.includes(report_type)) {
      return res.status(400).json({ success: false, error: "无效的报告类型" });
    }

    // 获取申请人部门
    const emp = dbGet("SELECT department_id FROM employees WHERE id = ?", [userId]);
    const deptId = emp?.department_id || null;

    // 计算周数
    let weekNumber = null;
    if (report_type === "weekly") {
      const date = new Date(report_date);
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      weekNumber = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    }

    // 检查是否重复提交
    const existing = dbGet(
      "SELECT id FROM daily_reports WHERE employee_id = ? AND report_type = ? AND report_date = ?",
      [userId, report_type, report_date]
    );
    if (existing) {
      // 更新而非报错
      dbRun(
        `UPDATE daily_reports SET title = ?, work_summary = ?, tomorrow_plan = ?, issues_blockers = ?, attachments = ?, submit_status = 'submitted' WHERE id = ?`,
        [title || null, work_summary, tomorrow_plan || null, issues_blockers || null, attachments ? JSON.stringify(attachments) : null, (existing as any).id]
      );
      return res.json({ success: true, message: "日报/周报已更新", data: { id: (existing as any).id } });
    }

    const result = dbRun(
      `INSERT INTO daily_reports (tenant_id, employee_id, department_id, report_type, report_date, week_number, title, work_summary, tomorrow_plan, issues_blockers, attachments, submit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [tenantId, userId, deptId, report_type, report_date, weekNumber, title || null, work_summary, tomorrow_plan || null, issues_blockers || null, attachments ? JSON.stringify(attachments) : null]
    );

    res.json({ success: true, message: "日报/周报已提交", data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取日报/周报详情（含评论） */
dailyReportRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);

    const report = dbGet(
      `SELECT dr.*, e.name as employee_name, d.name as department_name
       FROM daily_reports dr
       LEFT JOIN employees e ON dr.employee_id = e.id
       LEFT JOIN departments d ON dr.department_id = d.id
       WHERE dr.id = ? AND dr.tenant_id = ?`,
      [id, tenantId]
    );

    if (!report) return res.status(404).json({ success: false, error: "报告不存在" });

    const comments = dbAll(
      `SELECT drc.*, e.name as commenter_name
       FROM daily_report_comments drc
       LEFT JOIN employees e ON drc.commenter_id = e.id
       WHERE drc.report_id = ?
       ORDER BY drc.created_at ASC`,
      [id]
    );

    res.json({ success: true, data: { ...report, comments } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 添加评论 */
dailyReportRoutes.post("/:id/comments", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: "评论内容不能为空" });
    }

    const report = dbGet("SELECT id FROM daily_reports WHERE id = ? AND tenant_id = ?", [id, tenantId]);
    if (!report) return res.status(404).json({ success: false, error: "报告不存在" });

    const result = dbRun(
      `INSERT INTO daily_report_comments (report_id, commenter_id, content) VALUES (?, ?, ?)`,
      [id, userId, content.trim()]
    );

    res.json({ success: true, message: "评论已添加", data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 删除评论（仅评论者本人） */
dailyReportRoutes.delete("/comments/:commentId", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const commentId = parseInt(req.params.commentId);

    const comment = dbGet("SELECT * FROM daily_report_comments WHERE id = ?", [commentId]);
    if (!comment) return res.status(404).json({ success: false, error: "评论不存在" });
    if ((comment as any).commenter_id !== userId) return res.status(403).json({ success: false, error: "无权删除此评论" });

    dbRun("DELETE FROM daily_report_comments WHERE id = ?", [commentId]);
    res.json({ success: true, message: "评论已删除" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取团队日报汇总（部门主管用） */
dailyReportRoutes.get("/summary/team", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const reportDate = req.query.report_date as string;
    const departmentId = req.query.department_id as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    if (!reportDate) return res.status(400).json({ success: false, error: "缺少 report_date 参数" });

    let where = "dr.tenant_id = ? AND dr.report_type = 'daily' AND dr.report_date = ?";
    let params: any[] = [tenantId, reportDate];

    if (departmentId) {
      where += " AND dr.department_id = ?";
      params.push(parseInt(departmentId));
    } else if (!isAdmin) {
      // 非管理员只能看自己部门的
      const emp = dbGet("SELECT department_id FROM employees WHERE id = ?", [req.user!.id]);
      if (emp?.department_id) {
        where += " AND dr.department_id = ?";
        params.push(emp.department_id);
      }
    }

    const reports = dbAll(
      `SELECT dr.*, e.name as employee_name, d.name as department_name
       FROM daily_reports dr
       LEFT JOIN employees e ON dr.employee_id = e.id
       LEFT JOIN departments d ON dr.department_id = d.id
       WHERE ${where}
       ORDER BY dr.employee_id`,
      params
    );

    const total = reports.length;
    const submitted = reports.filter(r => (r as any).submit_status === "submitted").length;
    const draft = reports.filter(r => (r as any).submit_status === "draft").length;

    res.json({ success: true, data: { reports, summary: { total, submitted, draft } } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取周报列表（按周聚合） */
dailyReportRoutes.get("/weekly/list", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    let where = "dr.tenant_id = ? AND dr.report_type = 'weekly'";
    let params: any[] = [tenantId];

    if (!isAdmin) {
      where += " AND dr.employee_id = ?";
      params.push(userId);
    }

    const rows = dbAll(
      `SELECT dr.week_number, dr.report_date, dr.title, dr.submit_status,
              e.name as employee_name, d.name as department_name,
              dr.work_summary
       FROM daily_reports dr
       LEFT JOIN employees e ON dr.employee_id = e.id
       LEFT JOIN departments d ON dr.department_id = d.id
       WHERE ${where}
       ORDER BY dr.report_date DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
