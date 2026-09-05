import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { upload } from "../middleware/upload";

export const orgRoutes = Router();
orgRoutes.use(authenticate);

orgRoutes.get("/tree", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const departments = dbAll("SELECT * FROM departments WHERE tenant_id = ? ORDER BY sort_order", [tid]);
    const employees = dbAll("SELECT * FROM employees WHERE tenant_id = ? AND status = 'active' ORDER BY id", [tid]);

    // Online status: AI employees always online, human employees only if their user account logged in recently
    const onlineMap = new Map<number, boolean>();
    // Get users who logged in within last 30 minutes
    const onlineUsers = dbAll(
      "SELECT id FROM users WHERE last_login IS NOT NULL AND last_login > datetime('now', '-30 minutes')",
      []
    );
    const onlineUserIds = new Set(onlineUsers.map((u: any) => Number(u.id)));

    for (const emp of employees as any[]) {
      if (emp.employee_type === "ai") {
        onlineMap.set(Number(emp.id), true);
      } else {
        // Human employee: only online if their specific user account has recent login
        // Map employee to user by checking if there's a user with matching nickname or email in tenant
        const linkedUser = dbGet(
          "SELECT u.id FROM users u WHERE u.tenant_id = ? AND (u.nickname = ? OR u.email LIKE ?) AND u.last_login IS NOT NULL AND u.last_login > datetime('now', '-30 minutes')",
          [emp.tenant_id, emp.name, `%${emp.name}%`]
        );
        onlineMap.set(Number(emp.id), !!linkedUser);
      }
    }

    const deptMap = new Map<number, any>();
    const roots: any[] = [];

    for (const d of departments as any[]) {
      deptMap.set(d.id, { ...d, children: [], employees: [] });
    }
    for (const d of departments as any[]) {
      const node = deptMap.get(d.id)!;
      if (d.parent_id && deptMap.has(d.parent_id)) {
        deptMap.get(d.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    for (const e of employees as any[]) {
      const dept = deptMap.get(e.department_id);
      if (dept) {
        const isOnline = onlineMap.get(Number(e.id)) || false;
        dept.employees.push({ ...e, is_online: isOnline });
      }
    }

    res.json({ success: true, data: roots });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.get("/departments", (req: AuthRequest, res) => {
  try {
    const departments = dbAll("SELECT * FROM departments WHERE tenant_id = ? ORDER BY sort_order", [req.user!.tenant_id]);
    res.json({ success: true, data: departments });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.post("/departments", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, parent_id, sort_order, description, department_code, cost_center, budget_allocation, headcount, function_type, level } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "部门名称必填" });

    const result = dbRun(
      `INSERT INTO departments (company_id, name, parent_id, sort_order, description, department_code, cost_center, budget_allocation, headcount, function_type, level, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, name, parent_id || null, sort_order || 0, description || "", department_code || null, cost_center || null, budget_allocation || 0, headcount || 0, function_type || "functional", level || 1, req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.put("/departments/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, parent_id, sort_order, description, department_code, cost_center, budget_allocation, headcount, function_type, level } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push("name = ?"); params.push(name); }
    if (parent_id !== undefined) { updates.push("parent_id = ?"); params.push(parent_id); }
    if (sort_order !== undefined) { updates.push("sort_order = ?"); params.push(sort_order); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (department_code !== undefined) { updates.push("department_code = ?"); params.push(department_code); }
    if (cost_center !== undefined) { updates.push("cost_center = ?"); params.push(cost_center); }
    if (budget_allocation !== undefined) { updates.push("budget_allocation = ?"); params.push(budget_allocation); }
    if (headcount !== undefined) { updates.push("headcount = ?"); params.push(headcount); }
    if (function_type !== undefined) { updates.push("function_type = ?"); params.push(function_type); }
    if (level !== undefined) { updates.push("level = ?"); params.push(level); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE departments SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.delete("/departments/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const employees = dbAll("SELECT COUNT(*) as c FROM employees WHERE department_id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    if (employees[0]?.c > 0) {
      return res.status(400).json({ success: false, error: "部门下还有员工，无法删除" });
    }

    dbRun("DELETE FROM departments WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.put("/departments/reorder", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, error: "参数错误" });

    for (const item of items) {
      dbRun("UPDATE departments SET sort_order = ?, parent_id = ? WHERE id = ? AND tenant_id = ?",
        [item.sort_order, item.parent_id || null, item.id, req.user!.tenant_id]);
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 员工信息编辑（超级管理员可跨租户，管理员可改本租户，普通用户仅可改自己）
orgRoutes.put("/employees/:id", (req: AuthRequest, res) => {
  try {
    const eid = req.params.id;
    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    const isAdmin = user.role === "admin";

    // 按角色权限获取员工：超级管理员可查任意，管理员查本租户，普通用户仅查自己
    let emp: any;
    if (isSuperAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ?", [eid]);
    } else if (isAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ?", [eid, user.tenant_id]);
    } else {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ? AND user_id = ?", [eid, user.tenant_id, user.id]);
    }
    if (!emp) return res.status(404).json({ success: false, error: "员工不存在或无权限" });

    const { name, role, description, skills, agent_type, department_id, employee_type, avatar_emoji, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push("name = ?"); params.push(name); }
    if (role !== undefined) { updates.push("role = ?"); params.push(role); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (skills !== undefined) { updates.push("skills = ?"); params.push(skills); }
    if (agent_type !== undefined) { updates.push("agent_type = ?"); params.push(agent_type || null); }
    if (department_id !== undefined) { updates.push("department_id = ?"); params.push(department_id); }
    if (employee_type !== undefined) { updates.push("employee_type = ?"); params.push(employee_type); }
    if (avatar_emoji !== undefined) { updates.push("avatar_emoji = ?"); params.push(avatar_emoji); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    // 更新时保持原有 tenant 约束：超级管理员用 emp 的 tenant，管理员/普通用户用自己的 tenant
    const targetTenant = isSuperAdmin ? emp.tenant_id : user.tenant_id;
    params.push(eid, targetTenant);
    dbRun(`UPDATE employees SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 员工形象照上传（管理员或本人可上传；超级管理员可跨租户）
orgRoutes.post("/employees/:id/avatar", upload.single("file"), (req: AuthRequest, res) => {
  try {
    const eid = req.params.id;
    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    const isAdmin = user.role === "admin";

    // 按角色权限获取员工
    let emp: any;
    if (isSuperAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ?", [eid]);
    } else if (isAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ?", [eid, user.tenant_id]);
    } else {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ? AND user_id = ?", [eid, user.tenant_id, user.id]);
    }
    if (!emp) return res.status(404).json({ success: false, error: "员工不存在或无权限" });

    if (!req.file) return res.status(400).json({ success: false, error: "请选择图片文件" });

    // 允许的图片格式
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, error: "仅支持 PNG/JPG/WebP/GIF/SVG 格式图片" });
    }

    const filename = req.file.filename;

    // 超级管理员更新任意员工；管理员/普通用户仅更新有权限的员工
    if (isSuperAdmin) {
      dbRun("UPDATE employees SET avatar_url = ? WHERE id = ?", [filename, eid]);
    } else {
      dbRun("UPDATE employees SET avatar_url = ? WHERE id = ? AND tenant_id = ?", [filename, eid, user.tenant_id]);
    }

    res.json({ success: true, data: { avatar_url: `/uploads/${filename}` } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 53张序号系统预设头像
const PRESET_AVATARS = [
  "/avatars/preset-01.webp",
  "/avatars/preset-02.webp",
  "/avatars/preset-03.webp",
  "/avatars/preset-04.webp",
  "/avatars/preset-05.webp",
  "/avatars/preset-06.webp",
  "/avatars/preset-07.webp",
  "/avatars/preset-08.webp",
  "/avatars/preset-09.webp",
  "/avatars/preset-10.webp",
  "/avatars/preset-11.webp",
  "/avatars/preset-12.webp",
  "/avatars/preset-13.webp",
  "/avatars/preset-14.webp",
  "/avatars/preset-15.webp",
  "/avatars/preset-16.webp",
  "/avatars/preset-17.webp",
  "/avatars/preset-18.webp",
  "/avatars/preset-19.webp",
  "/avatars/preset-20.webp",
  "/avatars/preset-21.webp",
  "/avatars/preset-22.webp",
  "/avatars/preset-23.webp",
  "/avatars/preset-24.webp",
  "/avatars/preset-25.webp",
  "/avatars/preset-26.webp",
  "/avatars/preset-27.webp",
  "/avatars/preset-28.webp",
  "/avatars/preset-29.webp",
  "/avatars/preset-30.webp",
  "/avatars/preset-31.webp",
  "/avatars/preset-32.webp",
  "/avatars/preset-33.webp",
  "/avatars/preset-34.webp",
  "/avatars/preset-35.webp",
  "/avatars/preset-36.webp",
  "/avatars/preset-37.webp",
  "/avatars/preset-38.webp",
  "/avatars/preset-39.webp",
  "/avatars/preset-40.webp",
  "/avatars/preset-41.webp",
  "/avatars/preset-42.webp",
  "/avatars/preset-43.webp",
  "/avatars/preset-44.webp",
  "/avatars/preset-45.webp",
  "/avatars/preset-46.webp",
  "/avatars/preset-47.webp",
  "/avatars/preset-48.webp",
  "/avatars/preset-49.webp",
  "/avatars/preset-50.webp",
  "/avatars/preset-51.webp",
  "/avatars/preset-52.webp",
  "/avatars/preset-53.webp",
];

// 选择系统预设头像（管理员或本人可操作；超级管理员可跨租户）
orgRoutes.post("/employees/:id/avatar-preset", (req: AuthRequest, res) => {
  try {
    const eid = req.params.id;
    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    const isAdmin = user.role === "admin";

    // 按角色权限获取员工
    let emp: any;
    if (isSuperAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ?", [eid]);
    } else if (isAdmin) {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ?", [eid, user.tenant_id]);
    } else {
      emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ? AND user_id = ?", [eid, user.tenant_id, user.id]);
    }

    if (!emp) return res.status(404).json({ success: false, error: "员工不存在或无权限" });

    const { avatar_url } = req.body;
    if (!avatar_url || !PRESET_AVATARS.includes(avatar_url)) {
      return res.status(400).json({ success: false, error: "无效的预设头像" });
    }

    // 超级管理员更新任意员工；管理员/普通用户仅更新有权限的员工
    if (isSuperAdmin) {
      dbRun("UPDATE employees SET avatar_url = ? WHERE id = ?", [avatar_url, eid]);
    } else {
      dbRun("UPDATE employees SET avatar_url = ? WHERE id = ? AND tenant_id = ?", [avatar_url, eid, user.tenant_id]);
    }

    res.json({ success: true, data: { avatar_url } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.post("/employees", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, role, skills, agent_type, department_id, employee_type, avatar_emoji } = req.body;
    if (!name || !department_id) return res.status(400).json({ success: false, error: "姓名和部门必填" });

    const result = dbRun(
      "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [1, department_id, name, role || "", agent_type || null, employee_type || "human", skills || "", avatar_emoji || "👤", req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.delete("/employees/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    dbRun("UPDATE employees SET status = 'inactive' WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取员工汇报关系
orgRoutes.get("/employees/:id/reporting-lines", (req: AuthRequest, res) => {
  try {
    const lines = dbAll(
      `SELECT rl.*, e.name as manager_name, e.role as manager_role
       FROM reporting_lines rl
       LEFT JOIN employees e ON rl.manager_id = e.id
       WHERE rl.employee_id = ? AND rl.tenant_id = ?`,
      [req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: lines });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 添加汇报关系
orgRoutes.post("/reporting-lines", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { employee_id, manager_id, line_type, effective_date } = req.body;
    if (!employee_id || !manager_id) {
      return res.status(400).json({ success: false, error: "员工ID和上级ID必填" });
    }
    
    const result = dbRun(
      "INSERT INTO reporting_lines (employee_id, manager_id, line_type, effective_date, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [employee_id, manager_id, line_type || "solid", effective_date || new Date().toISOString(), req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除汇报关系
orgRoutes.delete("/reporting-lines/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    dbRun("DELETE FROM reporting_lines WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取职级列表
orgRoutes.get("/position-levels", (req: AuthRequest, res) => {
  try {
    const levels = dbAll(
      "SELECT * FROM position_levels WHERE tenant_id = ? ORDER BY sequence, level",
      [req.user!.tenant_id]
    );
    res.json({ success: true, data: levels });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新员工职级
orgRoutes.put("/employees/:id/position", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { position_level_id, position_sequence } = req.body;
    dbRun(
      "UPDATE employees SET position_level_id = ?, position_sequence = ? WHERE id = ? AND tenant_id = ?",
      [position_level_id || null, position_sequence || null, req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取技能库
orgRoutes.get("/skills", (req: AuthRequest, res) => {
  try {
    const { category } = req.query;
    let sql = "SELECT * FROM skills WHERE tenant_id = ? AND enabled = 1";
    const params: any[] = [req.user!.tenant_id];
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    sql += " ORDER BY category, install_count DESC, name";
    const skills = dbAll(sql, params);
    res.json({ success: true, data: skills });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取技能分类列表
orgRoutes.get("/skills/categories", (req: AuthRequest, res) => {
  try {
    const categories = dbAll(
      "SELECT DISTINCT category, COUNT(*) as count FROM skills WHERE tenant_id = ? AND enabled = 1 GROUP BY category ORDER BY count DESC",
      [req.user!.tenant_id]
    );
    res.json({ success: true, data: categories });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取员工技能
orgRoutes.get("/employees/:id/skills", (req: AuthRequest, res) => {
  try {
    const skills = dbAll(
      `SELECT es.*, sl.name, sl.category, sl.tags
       FROM employee_skills es
       JOIN skills sl ON es.skill_id = sl.id
       WHERE es.employee_id = ? AND es.tenant_id = ?
       ORDER BY sl.category, sl.name`,
      [req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: skills });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 设置员工技能（全量替换）
orgRoutes.post("/employees/:id/skills", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { skill_ids } = req.body;
    if (!Array.isArray(skill_ids)) return res.status(400).json({ success: false, error: "skill_ids必须是数组" });

    const eid = req.params.id;
    const tid = req.user!.tenant_id;

    // 删除旧关联
    dbRun("DELETE FROM employee_skills WHERE employee_id = ? AND tenant_id = ?", [eid, tid]);

    // 插入新关联
    for (const skillId of skill_ids) {
      dbRun(
        "INSERT INTO employee_skills (tenant_id, employee_id, skill_id, source) VALUES (?, ?, ?, 'manual')",
        [tid, eid, skillId]
      );
    }

    // 同步更新employees.skills字段（逗号分隔）
    if (skill_ids.length > 0) {
      const placeholders = skill_ids.map(() => "?").join(",");
      const skillNames = dbAll(
        `SELECT name FROM skills WHERE id IN (${placeholders}) AND tenant_id = ?`,
        [...skill_ids, tid]
      );
      const skillsStr = skillNames.map((s: any) => s.name).join(",");
      dbRun("UPDATE employees SET skills = ? WHERE id = ? AND tenant_id = ?", [skillsStr, eid, tid]);
    } else {
      dbRun("UPDATE employees SET skills = '' WHERE id = ? AND tenant_id = ?", [eid, tid]);
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 智能补齐：根据agent_type模板自动生成
orgRoutes.post("/employees/:id/auto-fill", requireAdmin, (req: AuthRequest, res) => {
  try {
    const emp = dbGet("SELECT * FROM employees WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    if (!emp) return res.status(404).json({ success: false, error: "员工不存在" });

    // 动态导入模板
    const { getAgentTemplate } = require("../data/agent-templates");
    const template = getAgentTemplate(emp.agent_type);
    if (!template) {
      return res.status(400).json({ success: false, error: `未找到agent_type "${emp.agent_type}" 的模板` });
    }

    // 更新员工信息
    const updates: string[] = [];
    const params: any[] = [];

    if (!emp.role || emp.role === "未设置") {
      updates.push("role = ?");
      params.push(template.role);
    }
    if (!emp.description) {
      updates.push("description = ?");
      params.push(template.description);
    }
    if (!emp.skills) {
      updates.push("skills = ?");
      params.push(template.skills.join(","));
    }

    if (updates.length > 0) {
      params.push(emp.id, emp.tenant_id);
      dbRun(`UPDATE employees SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    }

    // 自动关联技能库中的技能
    const existingSkills = dbAll(
      "SELECT skill_id FROM employee_skills WHERE employee_id = ? AND tenant_id = ?",
      [emp.id, emp.tenant_id]
    );
    if (existingSkills.length === 0) {
      for (const skillName of template.skills) {
        const skill = dbGet(
          "SELECT id FROM skills WHERE name = ? AND tenant_id = ?",
          [skillName, emp.tenant_id]
        ) as any;
        if (skill) {
          dbRun(
            "INSERT OR IGNORE INTO employee_skills (tenant_id, employee_id, skill_id, source) VALUES (?, ?, ?, 'auto')",
            [emp.tenant_id, emp.id, skill.id]
          );
        }
      }
    }

    res.json({
      success: true,
      filled: {
        role: updates.includes("role = ?") ? template.role : null,
        description: updates.includes("description = ?") ? template.description : null,
        skills: updates.includes("skills = ?") ? template.skills : null,
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取agent_type模板列表
orgRoutes.get("/agent-templates", (req: AuthRequest, res) => {
  try {
    const { getAgentTypeOptions } = require("../data/agent-templates");
    res.json({ success: true, data: getAgentTypeOptions() });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 组织架构版本管理 =====

orgRoutes.get("/versions", (req: AuthRequest, res) => {
  try {
    const versions = dbAll(
      "SELECT * FROM org_versions WHERE tenant_id = ? ORDER BY created_at DESC",
      [req.user!.tenant_id]
    );
    res.json({ success: true, data: versions });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.post("/versions", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { version_number, description, effective_date } = req.body;
    if (!version_number) return res.status(400).json({ success: false, error: "版本号必填" });
    const result = dbRun(
      "INSERT INTO org_versions (version_number, description, created_by, effective_date, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [version_number, description || "", req.user!.id, effective_date || null, req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.get("/versions/:id/changes", (req: AuthRequest, res) => {
  try {
    const changes = dbAll(
      "SELECT * FROM org_changes WHERE version_id = ? AND tenant_id = ? ORDER BY created_at",
      [req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: changes });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

orgRoutes.put("/versions/:id/status", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: "状态必填" });
    dbRun(
      "UPDATE org_versions SET status = ?, approved_by = ? WHERE id = ? AND tenant_id = ?",
      [status, status === "approved" ? req.user!.id : null, req.params.id, req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
