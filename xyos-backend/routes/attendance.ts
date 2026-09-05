import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbAll, dbGet, dbRun } from "../db";

export const attendanceRoutes = Router();
attendanceRoutes.use(authenticate);

/** 获取考勤记录列表 */
attendanceRoutes.get("/records", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const checkDate = req.query.check_date as string;
    const employeeId = req.query.employee_id as string;
    const status = req.query.status as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    let whereClauses = ["ar.tenant_id = ?"];
    let params: any[] = [tenantId];

    // 非管理员只能查看自己
    if (!isAdmin) {
      whereClauses.push("ar.employee_id = ?");
      params.push(userId);
    } else if (employeeId) {
      whereClauses.push("ar.employee_id = ?");
      params.push(parseInt(employeeId));
    }

    if (checkDate) {
      whereClauses.push("ar.check_date = ?");
      params.push(checkDate);
    }
    if (status) {
      whereClauses.push("ar.status = ?");
      params.push(status);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM attendance_records ar WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT ar.*, e.name as employee_name, e.pid as employee_pid, d.name as department_name
       FROM attendance_records ar
       LEFT JOIN employees e ON ar.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE ${where}
       ORDER BY ar.check_date DESC, ar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { list: rows, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取今日考勤状态 */
attendanceRoutes.get("/today", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split("T")[0];

    const record = dbGet(
      `SELECT ar.*, e.name as employee_name
       FROM attendance_records ar
       LEFT JOIN employees e ON ar.employee_id = e.id
       WHERE ar.employee_id = ? AND ar.check_date = ?`,
      [userId, today]
    );

    res.json({ success: true, data: record || null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 签到 */
attendanceRoutes.post("/check-in", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { latitude, longitude, location } = req.body;
    const now = new Date().toISOString();
    const today = now.split("T")[0];

    // 检查今日是否已有记录
    const existing = dbGet("SELECT id FROM attendance_records WHERE employee_id = ? AND check_date = ?", [userId, today]);
    if (existing) {
      return res.status(400).json({ success: false, error: "今日已签到，请勿重复签到" });
    }

    // 获取排班时间
    const schedule = dbGet(
      `SELECT * FROM attendance_schedules WHERE tenant_id = ? AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?) LIMIT 1`,
      [tenantId, today, today]
    );

    let status = "normal";
    if (schedule) {
      const checkInTime = now.split("T")[1].substring(0, 5);
      const [sh, sm] = schedule.work_start.split(":").map(Number);
      const [ch, cm] = checkInTime.split(":").map(Number);
      const schedMins = sh * 60 + sm + (schedule.flexible_minutes || 0);
      const currMins = ch * 60 + cm;
      if (currMins > schedMins) {
        status = "late";
      }
    }

    dbRun(
      `INSERT INTO attendance_records (tenant_id, employee_id, check_date, check_in_time, check_in_lat, check_in_lng, check_in_location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, userId, today, now, latitude || null, longitude || null, location || null, status]
    );

    res.json({ success: true, message: "签到成功", data: { status } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 签退 */
attendanceRoutes.post("/check-out", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { latitude, longitude, location } = req.body;
    const now = new Date().toISOString();
    const today = now.split("T")[0];

    const record = dbGet("SELECT * FROM attendance_records WHERE employee_id = ? AND check_date = ?", [userId, today]);
    if (!record) {
      return res.status(400).json({ success: false, error: "今日尚未签到" });
    }
    if (record.check_out_time) {
      return res.status(400).json({ success: false, error: "今日已签退，请勿重复签退" });
    }

    // 计算工作时长
    const inTime = new Date(record.check_in_time as string).getTime();
    const outTime = new Date(now).getTime();
    const workHours = Math.round(((outTime - inTime) / (1000 * 60 * 60)) * 100) / 100;

    // 检查是否早退
    let newStatus = record.status as string;
    const schedule = dbGet(
      `SELECT * FROM attendance_schedules WHERE tenant_id = ? AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?) LIMIT 1`,
      [record.tenant_id, today, today]
    );
    if (schedule && workHours < 7.5) {
      newStatus = newStatus === "late" ? "late_early_leave" : "early_leave";
    }

    dbRun(
      `UPDATE attendance_records SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_location = ?, work_hours = ?, status = ? WHERE id = ?`,
      [now, latitude || null, longitude || null, location || null, workHours, newStatus, record.id]
    );

    res.json({ success: true, message: "签退成功", data: { work_hours: workHours, status: newStatus } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 考勤统计 */
attendanceRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const month = req.query.month as string; // YYYY-MM
    const employeeId = req.query.employee_id as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    if (!month) {
      return res.status(400).json({ success: false, error: "缺少 month 参数（格式：YYYY-MM）" });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    let whereClause = "tenant_id = ? AND check_date >= ? AND check_date <= ?";
    let params: any[] = [tenantId, startDate, endDate];

    if (!isAdmin) {
      // 非管理员只能查看自己的数据，忽略 employeeId 参数
      whereClause += " AND employee_id = ?";
      params.push(userId);
    } else if (employeeId) {
      // 管理员可以查看指定员工的数据
      whereClause += " AND employee_id = ?";
      params.push(parseInt(employeeId));
    }

    const stats = dbGet(
      `SELECT
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) as normal_days,
        SUM(CASE WHEN status = 'late' OR status = 'late_early_leave' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'early_leave' OR status = 'late_early_leave' THEN 1 ELSE 0 END) as early_leave_days,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_days,
        SUM(work_hours) as total_work_hours,
        AVG(work_hours) as avg_work_hours
       FROM attendance_records WHERE ${whereClause}`,
      params
    );

    // 补卡申请统计
    let suppWhere = "tenant_id = ? AND check_date >= ? AND check_date <= ?";
    let suppParams: any[] = [tenantId, startDate, endDate];
    if (!isAdmin) {
      suppWhere += " AND employee_id = ?";
      suppParams.push(userId);
    } else if (employeeId) {
      suppWhere += " AND employee_id = ?";
      suppParams.push(parseInt(employeeId));
    }
    const suppStats = dbGet(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending FROM attendance_supplements WHERE ${suppWhere}`,
      suppParams
    );

    res.json({
      success: true,
      data: {
        month,
        attendance: stats,
        supplements: suppStats,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 补卡申请列表（管理员） */
attendanceRoutes.get("/supplements", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let whereClauses = ["asup.tenant_id = ?"];
    let params: any[] = [tenantId];

    if (!isAdmin) {
      whereClauses.push("asup.employee_id = ?");
      params.push(req.user!.id);
    }
    if (status) {
      whereClauses.push("asup.status = ?");
      params.push(status);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM attendance_supplements asup WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT asup.*, e.name as employee_name, e.pid as employee_pid, d.name as department_name
       FROM attendance_supplements asup
       LEFT JOIN employees e ON asup.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE ${where}
       ORDER BY asup.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { list: rows, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 提交补卡申请 */
attendanceRoutes.post("/supplements", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { check_date, supplement_type, reason } = req.body;

    if (!check_date || !supplement_type) {
      return res.status(400).json({ success: false, error: "缺少必填字段" });
    }

    const validTypes = ["check_in", "check_out", "both"];
    if (!validTypes.includes(supplement_type)) {
      return res.status(400).json({ success: false, error: "无效的补卡类型" });
    }

    // 限制补卡日期不能是未来日期
    const today = new Date().toISOString().split("T")[0];
    if (check_date > today) {
      return res.status(400).json({ success: false, error: "补卡日期不能是未来日期" });
    }

    // 检查是否已有补卡申请
    const existing = dbGet(
      "SELECT id FROM attendance_supplements WHERE employee_id = ? AND check_date = ? AND status != 'cancelled'",
      [userId, check_date]
    );
    if (existing) {
      return res.status(400).json({ success: false, error: "该日期已有补卡申请" });
    }

    // 检查是否已有考勤记录
    const record = dbGet("SELECT id FROM attendance_records WHERE employee_id = ? AND check_date = ?", [userId, check_date]);
    if (record) {
      return res.status(400).json({ success: false, error: "该日期已有考勤记录，无需补卡" });
    }

    dbRun(
      `INSERT INTO attendance_supplements (tenant_id, employee_id, check_date, supplement_type, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [tenantId, userId, check_date, supplement_type, reason || null]
    );

    res.json({ success: true, message: "补卡申请已提交" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 审批补卡申请（管理员） */
attendanceRoutes.put("/supplements/:id/review", (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "无权限审批补卡申请" });
    }

    const id = parseInt(req.params.id);
    const { status, review_comment } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "无效的审批状态" });
    }

    const record = dbGet("SELECT * FROM attendance_supplements WHERE id = ?", [id]);
    if (!record) {
      return res.status(404).json({ success: false, error: "补卡申请不存在" });
    }
    if (record.status !== "pending") {
      return res.status(400).json({ success: false, error: "该申请已处理" });
    }

    dbRun(
      `UPDATE attendance_supplements SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_comment = ? WHERE id = ?`,
      [status, req.user!.id, review_comment || null, id]
    );

    // 审批通过后，自动补全考勤记录
    if (status === "approved") {
      const now = new Date().toISOString();
      dbRun(
        `INSERT OR IGNORE INTO attendance_records (tenant_id, employee_id, check_date, check_in_time, check_out_time, status, work_hours)
         VALUES (?, ?, ?, ?, ?, 'normal', 8.0)`,
        [record.tenant_id, record.employee_id, record.check_date,
         record.supplement_type === "check_out" ? null : now,
         record.supplement_type === "check_in" ? null : now]
      );
    }

    res.json({ success: true, message: `补卡申请已${status === "approved" ? "通过" : "驳回"}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
