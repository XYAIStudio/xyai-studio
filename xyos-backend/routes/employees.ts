import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, AuthRequest, requireAdmin } from "../middleware";
import { logActivity } from "../services/notification";
import bcrypt from "bcryptjs";
import { assertUserLimit, assertAiEmployeeLimit } from "../services/plan-gate";

export const employeeRoutes = Router();
employeeRoutes.use(authenticate);

employeeRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const { type, department_id, status, search, category } = req.query;
    let sql = `SELECT e.*, d.name as department_name, u.email as user_email
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.tenant_id = ?`;
    const params: any[] = [req.user!.tenant_id];

    if (type) { sql += " AND e.employee_type = ?"; params.push(type); }
    if (department_id) { sql += " AND e.department_id = ?"; params.push(department_id); }
    if (status) { sql += " AND e.status = ?"; params.push(status); }
    else { sql += " AND e.status = 'active'"; }
    if (search) { sql += " AND (e.name LIKE ? OR e.role LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    if (category) { sql += " AND e.employment_category = ?"; params.push(category); }

    sql += " ORDER BY e.id";
    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const total = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND status = 'active'", [tid]) as any;
    const ai = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active'", [tid]) as any;
    const human = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'human' AND status = 'active'", [tid]) as any;

    const byDepartment = dbAll(
      `SELECT d.name as department, COUNT(*) as count
       FROM employees e JOIN departments d ON e.department_id = d.id
       WHERE e.tenant_id = ? AND e.status = 'active'
       GROUP BY e.department_id`,
      [tid]
    );

    const byRole = dbAll(
      "SELECT role, COUNT(*) as count FROM employees WHERE tenant_id = ? AND status = 'active' GROUP BY role ORDER BY count DESC LIMIT 10",
      [tid]
    );

    res.json({
      success: true,
      data: {
        total: total.c,
        ai: ai.c,
        human: human.c,
        byDepartment,
        byRole,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 按雇佣分类统计
employeeRoutes.get("/stats/by-category", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const internal = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employment_category = 'internal' AND status = 'active'", [tid]) as any;
    const internalAI = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employment_category = 'internal' AND employee_type = 'ai' AND status = 'active'", [tid]) as any;
    const reserve = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employment_category = 'reserve' AND status = 'active'", [tid]) as any;
    const reserveAI = dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employment_category = 'reserve' AND employee_type = 'ai' AND status = 'active'", [tid]) as any;

    res.json({
      success: true,
      data: {
        internal: internal.c,
        internalAI: internalAI.c,
        internalHuman: internal.c - internalAI.c,
        reserve: reserve.c,
        reserveAI: reserveAI.c,
        reserveHuman: reserve.c - reserveAI.c,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 备选员工入职（reserve → internal）
employeeRoutes.post("/:id/onboard", (req: AuthRequest, res) => {
  try {
    const { department_id, role } = req.body;
    const updates: string[] = ["employment_category = 'internal'"];
    const params: any[] = [];

    if (department_id !== undefined) { updates.push("department_id = ?"); params.push(department_id); }
    if (role !== undefined) { updates.push("role = ?"); params.push(role); }

    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE employees SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 内部员工转入备选（internal → reserve）
employeeRoutes.put("/:id/reserve", (req: AuthRequest, res) => {
  try {
    dbRun(
      "UPDATE employees SET employment_category = 'reserve', department_id = NULL WHERE id = ? AND tenant_id = ?",
      [req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 离职预览：查询员工持有资产清单（不执行）
employeeRoutes.get("/:id/offboard-preview", (req: AuthRequest, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const tenantId = req.user!.tenant_id;

    const employee = dbGet(
      "SELECT id, name, department_id FROM employees WHERE id = ? AND tenant_id = ?",
      [employeeId, tenantId]
    );
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在" });

    const assets = dbAll(
      `SELECT a.*, d.name as department_name
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       WHERE a.custodian_id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'in_use'`,
      [employeeId, tenantId]
    );

    res.json({
      success: true,
      data: {
        employee,
        assets,
        holding_count: assets.length,
        holding_value: assets.reduce((sum: number, a: any) => sum + (a.purchase_price || 0), 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 离职清算：归还所有资产 + 标记员工 inactive
employeeRoutes.post("/:id/offboard", (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    if (!["super_admin", "admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: "仅管理员可执行离职清算" });
    }

    const employeeId = parseInt(req.params.id);
    const tenantId = req.user!.tenant_id;

    const employee = dbGet(
      "SELECT * FROM employees WHERE id = ? AND tenant_id = ? AND status = 'active'",
      [employeeId, tenantId]
    );
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在或已离职" });

    // 查询持有资产
    const assets = dbAll(
      "SELECT id FROM assets WHERE custodian_id = ? AND tenant_id = ? AND deleted_at IS NULL AND status = 'in_use'",
      [employeeId, tenantId]
    ) as any[];

    // 归还所有资产
    let cleared = 0;
    for (const a of assets) {
      dbRun(
        `INSERT INTO asset_transactions (asset_id, type, from_user_id, remark, tenant_id, created_by)
         VALUES (?, 'return', ?, ?, ?, ?)`,
        [a.id, employeeId, "员工离职自动归还", tenantId, req.user!.id]
      );
      dbRun(
        "UPDATE assets SET status = 'in_stock', custodian_id = NULL, updated_at = datetime('now') WHERE id = ?",
        [a.id]
      );
      cleared++;
    }

    // 标记员工 inactive
    dbRun("UPDATE employees SET status = 'inactive', department_id = NULL WHERE id = ? AND tenant_id = ?", [employeeId, tenantId]);

    // 结束所有岗位
    dbRun("UPDATE employee_positions SET end_date = datetime('now') WHERE employee_id = ? AND end_date IS NULL", [employeeId]);

    logActivity({
      userId: req.user!.id,
      tenantId,
      action: "employee_offboard",
      details: JSON.stringify({ employee_id: employeeId, employee_name: employee.name, assets_cleared: cleared }),
      targetType: "employee",
      targetId: employeeId,
    });

    res.json({
      success: true,
      data: {
        employee_id: employeeId,
        employee_name: employee.name,
        assets_cleared: cleared,
        message: cleared > 0 ? `已归还 ${cleared} 项资产，员工已标记为离职` : "员工已标记为离职（无持有资产）",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const employee = dbGet(
      `SELECT e.*, d.name as department_name
       FROM employees e LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ? AND e.tenant_id = ?`,
      [req.params.id, req.user!.tenant_id]
    );
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在" });

    const tasks = dbAll(
      "SELECT * FROM tasks WHERE assigned_to = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10",
      [req.params.id, req.user!.tenant_id]
    );

    const performance = dbGet(
      `SELECT
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'done') as completed,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'in_progress') as active,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ?) as total`,
      [req.params.id, req.params.id, req.params.id]
    );

    res.json({ success: true, data: { ...employee, recent_tasks: tasks, performance } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, role, department_id, agent_type, employee_type, skills, avatar_emoji, status, employment_category, description, email } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "姓名必填" });

    // SaaS 套餐门禁：按租户限额校验用户数 / AI 员工数
    const type = employee_type || "ai";
    if (type === "human") {
      const gate = assertUserLimit(req.user!.tenant_id);
      if (!gate.allowed) return res.status(403).json({ success: false, error: gate.message });
    } else {
      const gate = assertAiEmployeeLimit(req.user!.tenant_id);
      if (!gate.allowed) return res.status(403).json({ success: false, error: gate.message });
    }

    // 人类员工必须有邮箱，自动创建用户账号
    let userId: number | null = null;
    if (employee_type === "human" && email) {
      const existingUser = dbGet("SELECT id FROM users WHERE email = ? AND tenant_id = ?", [email, req.user!.tenant_id]);
      if (existingUser) {
        userId = (existingUser as any).id;
      } else {
        const defaultPwd = Math.random().toString(36).slice(-10) + "Xy1";
        const defaultPassword = bcrypt.hashSync(defaultPwd, 10);
        const userResult = dbRun(
          "INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, 'user', ?)",
          [email, defaultPassword, name, req.user!.tenant_id]
        );
        userId = userResult.lastInsertRowid;
      }
    }

    const result = dbRun(
      `INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, employment_category, description, user_id, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, department_id || null, name, role || "", agent_type || null, employee_type || "ai", skills || "", avatar_emoji || "🤖", status || "active", employment_category || "internal", description || "", userId, req.user!.tenant_id]
    );

    logActivity({
      userId: req.user!.id,
      action: "employee_created",
      entityType: "employee",
      entityId: result.lastInsertRowid,
      details: JSON.stringify({ name, role }),
      tenantId: req.user!.tenant_id,
    });

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    const { name, role, department_id, agent_type, skills, avatar_emoji, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push("name = ?"); params.push(name); }
    if (role !== undefined) { updates.push("role = ?"); params.push(role); }
    if (department_id !== undefined) { updates.push("department_id = ?"); params.push(department_id); }
    if (agent_type !== undefined) { updates.push("agent_type = ?"); params.push(agent_type); }
    if (skills !== undefined) { updates.push("skills = ?"); params.push(skills); }
    if (avatar_emoji !== undefined) { updates.push("avatar_emoji = ?"); params.push(avatar_emoji); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE employees SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);

    logActivity({
      userId: req.user!.id,
      action: "employee_updated",
      entityType: "employee",
      entityId: parseInt(req.params.id as string),
      details: JSON.stringify(req.body),
      tenantId: req.user!.tenant_id,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    dbRun("UPDATE employees SET status = 'inactive' WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);

    logActivity({
      userId: req.user!.id,
      action: "employee_deactivated",
      entityType: "employee",
      entityId: parseInt(req.params.id as string),
      tenantId: req.user!.tenant_id,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.get("/:id/tasks", (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    let sql = "SELECT * FROM tasks WHERE assigned_to = ? AND tenant_id = ?";
    const params: any[] = [req.params.id, req.user!.tenant_id];

    if (status) { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY created_at DESC";

    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

employeeRoutes.get("/:id/performance", (req: AuthRequest, res) => {
  try {
    const employee = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在" });

    const stats = dbGet(
      `SELECT
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'done') as completed,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'in_progress') as active,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'todo') as pending,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ?) as total`,
      [req.params.id, req.params.id, req.params.id, req.params.id]
    );

    const messageCount = dbGet(
      "SELECT COUNT(*) as c FROM messages WHERE sender_id = ? AND sender_type = 'employee'",
      [req.params.id]
    ) as any;

    res.json({
      success: true,
      data: {
        employee,
        stats: { ...stats, messages: messageCount?.c || 0 },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
