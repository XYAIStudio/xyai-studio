import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";

export const talentRoutes = Router();
talentRoutes.use(authenticate);

// 获取人才市场列表
talentRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const { type, skill, source, page, limit } = req.query;
    let sql = "SELECT * FROM talent_pool WHERE tenant_id = ? AND status = 'available'";
    const params: any[] = [req.user!.tenant_id];

    if (type) { sql += " AND talent_type = ?"; params.push(type); }
    if (skill) { sql += " AND (skills LIKE ? OR capabilities LIKE ?)"; params.push(`%${skill}%`, `%${skill}%`); }
    if (source) { sql += " AND source = ?"; params.push(source); }

    sql += " ORDER BY rating DESC, created_at DESC";
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 100;
    sql += ` LIMIT ${l} OFFSET ${(p - 1) * l}`;

    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 人才市场统计
talentRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const total = dbGet("SELECT COUNT(*) as c FROM talent_pool WHERE tenant_id = ? AND status = 'available'", [tid]) as any;
    const ai = dbGet("SELECT COUNT(*) as c FROM talent_pool WHERE tenant_id = ? AND talent_type = 'ai' AND status = 'available'", [tid]) as any;
    const human = dbGet("SELECT COUNT(*) as c FROM talent_pool WHERE tenant_id = ? AND talent_type = 'human' AND status = 'available'", [tid]) as any;
    const byCategory = dbAll(
      "SELECT category, COUNT(*) as count FROM talent_pool WHERE tenant_id = ? AND status = 'available' GROUP BY category ORDER BY count DESC",
      [tid]
    );

    res.json({ success: true, data: { total: total.c, ai: ai.c, human: human.c, byCategory } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 招募人才 → 加入备选员工库（仅管理员）
talentRoutes.post("/:id/recruit", requireAdmin, (req: AuthRequest, res) => {
  try {
    const talent = dbGet("SELECT * FROM talent_pool WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    if (!talent) return res.status(404).json({ success: false, error: "人才不存在" });

    const company = dbGet("SELECT id FROM companies WHERE tenant_id = ? ORDER BY id LIMIT 1", [req.user!.tenant_id]) as { id?: number } | undefined;
    if (!company?.id) return res.status(404).json({ success: false, error: "当前租户未配置公司" });

    // 写入 employees 表（备选状态，尚不进入组织架构与沟通协作）
    const result = dbRun(
      `INSERT INTO employees (company_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, employment_category, description, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'reserve', ?, ?)`,
      [
        company.id,
        (talent as any).name,
        (talent as any).category || "",
        (talent as any).agent_type || null,
        (talent as any).talent_type === "ai" ? "ai" : "human",
        (talent as any).skills || "",
        (talent as any).avatar_emoji || "👤",
        (talent as any).description || "",
        req.user!.tenant_id,
      ]
    );

    // 标记人才市场条目为已招募
    dbRun("UPDATE talent_pool SET status = 'recruited', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);

    res.json({ success: true, data: { employee_id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
