import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";

export const skillsRoutes = Router();
skillsRoutes.use(authenticate);

skillsRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const total = (dbGet("SELECT COUNT(*) as count FROM skills WHERE tenant_id = ? AND enabled = 1", [tid]) as any)?.count || 0;
    const disabled = (dbGet("SELECT COUNT(*) as count FROM skills WHERE tenant_id = ? AND enabled = 0", [tid]) as any)?.count || 0;
    const cats = dbAll("SELECT category, COUNT(*) as count FROM skills WHERE tenant_id = ? AND enabled = 1 GROUP BY category", [tid]);
    const learned = (dbGet("SELECT COUNT(*) as count FROM employee_skills WHERE tenant_id = ?", [tid]) as any)?.count || 0;
    res.json({ success: true, data: { total_skills: total, disabled, categories: cats, total_learned: learned } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.get("/marketplace", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    const offset = (page - 1) * pageSize;
    const total = (dbGet("SELECT COUNT(*) as count FROM skills WHERE tenant_id = ? AND enabled = 1", [tid]) as any)?.count || 0;
    const skills = dbAll("SELECT * FROM skills WHERE tenant_id = ? AND enabled = 1 ORDER BY install_count DESC LIMIT ? OFFSET ?", [tid, pageSize, offset]);
    res.json({ success: true, data: skills, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const { category } = req.query;
    let sql = "SELECT * FROM skills WHERE tenant_id = ? AND enabled = 1";
    const params: any[] = [tid];
    if (category) { sql += " AND category = ?"; params.push(category); }
    sql += " ORDER BY install_count DESC, rating DESC";
    const skills = dbAll(sql, params);
    res.json({ success: true, data: skills, total: skills.length });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.get("/employee/:employeeId", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const eid = parseInt(req.params.employeeId as string);
    if (isNaN(eid)) return res.status(400).json({ success: false, error: "无效的员工ID" });
    const skills = dbAll(
      `SELECT s.*, es.learned_at, es.proficiency_level
       FROM employee_skills es
       INNER JOIN skills s ON es.skill_id = s.id
       WHERE es.employee_id = ? AND es.tenant_id = ?
       ORDER BY es.learned_at DESC`, [eid, tid]);
    res.json({ success: true, data: skills, total: skills.length });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, error: "无效的技能ID" });
    const skill = dbGet("SELECT * FROM skills WHERE id = ? AND tenant_id = ?", [id, tid]);
    if (!skill) return res.status(404).json({ success: false, error: "技能不存在" });
    res.json({ success: true, data: skill });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/learn", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const { employee_id, skill_id } = req.body;
    if (!employee_id || !skill_id) return res.status(400).json({ success: false, error: "employee_id 和 skill_id 必填" });
    const skill = dbGet("SELECT id FROM skills WHERE id = ? AND tenant_id = ? AND enabled = 1", [skill_id, tid]);
    if (!skill) return res.status(404).json({ success: false, error: "技能不存在或已禁用" });
    const emp = dbGet("SELECT id FROM employees WHERE id = ? AND tenant_id = ?", [employee_id, tid]);
    if (!emp) return res.status(404).json({ success: false, error: "员工不存在" });
    const existing = dbGet("SELECT id FROM employee_skills WHERE employee_id = ? AND skill_id = ?", [employee_id, skill_id]);
    if (existing) return res.status(409).json({ success: false, error: "该员工已学习过此技能" });
    dbRun("INSERT INTO employee_skills (employee_id, skill_id, tenant_id) VALUES (?, ?, ?)", [employee_id, skill_id, tid]);
    dbRun("UPDATE skills SET install_count = install_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?", [skill_id]);
    res.status(201).json({ success: true, message: "技能学习记录已创建" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const { name, slug, category, description, icon, tags, content } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "name 必填" });
    const result = dbRun(
      `INSERT INTO skills (tenant_id, company_id, name, slug, category, description, icon, tags, content, source, version, author, install_count, rating, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', '1.0.0', '本地', 0, 0, 1)`,
      [tid, 1, name, slug || name.toLowerCase().replace(/\s+/g, '-'), category || '其他', description || null, icon || '🛠️', tags || null, content || null]
    );
    const skill = dbGet("SELECT * FROM skills WHERE id = ?", [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: skill, message: "技能创建成功" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const id = parseInt(req.params.id as string);
    const existing = dbGet("SELECT * FROM skills WHERE id = ? AND tenant_id = ?", [id, tid]);
    if (!existing) return res.status(404).json({ success: false, error: "技能不存在" });
    const { name, category, description, icon, enabled, tags, content } = req.body;
    const fields: string[] = [], vals: any[] = [];
    if (name !== undefined) { fields.push("name = ?"); vals.push(name); }
    if (category !== undefined) { fields.push("category = ?"); vals.push(category); }
    if (description !== undefined) { fields.push("description = ?"); vals.push(description); }
    if (icon !== undefined) { fields.push("icon = ?"); vals.push(icon); }
    if (enabled !== undefined) { fields.push("enabled = ?"); vals.push(enabled); }
    if (tags !== undefined) { fields.push("tags = ?"); vals.push(tags); }
    if (content !== undefined) { fields.push("content = ?"); vals.push(content); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: "没有要更新的字段" });
    fields.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(id);
    dbRun(`UPDATE skills SET ${fields.join(", ")} WHERE id = ?`, vals);
    const updated = dbGet("SELECT * FROM skills WHERE id = ?", [id]);
    res.json({ success: true, data: updated, message: "技能已更新" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const id = parseInt(req.params.id as string);
    const existing = dbGet("SELECT * FROM skills WHERE id = ? AND tenant_id = ?", [id, tid]);
    if (!existing) return res.status(404).json({ success: false, error: "技能不存在" });
    dbRun("DELETE FROM employee_skills WHERE skill_id = ? AND tenant_id = ?", [id, tid]);
    dbRun("DELETE FROM skills WHERE id = ? AND tenant_id = ?", [id, tid]);
    res.json({ success: true, message: "技能已删除" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/:id/toggle", requireAdmin, (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const id = parseInt(req.params.id as string);
    const existing = dbGet("SELECT * FROM skills WHERE id = ? AND tenant_id = ?", [id, tid]);
    if (!existing) return res.status(404).json({ success: false, error: "技能不存在" });
    const newEnabled = (existing as any).enabled ? 0 : 1;
    dbRun("UPDATE skills SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newEnabled, id]);
    res.json({ success: true, data: { id, enabled: !!newEnabled }, message: newEnabled ? "技能已启用" : "技能已禁用" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/batch-toggle", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { ids, enabled } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, error: "ids 数组必填" });
    const val = enabled ? 1 : 0;
    for (const id of ids) {
      dbRun("UPDATE skills SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [val, id]);
    }
    res.json({ success: true, message: `已${enabled ? '启用' : '禁用'} ${ids.length} 个技能` });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/:id/rate", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: "评分范围1-5" });
    dbRun("UPDATE skills SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [parseFloat(rating.toFixed(1)), id]);
    res.json({ success: true, message: "评分已提交" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

skillsRoutes.post("/import", requireAdmin, (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "content 必填" });
    const fm: Record<string, string> = {};
    let body = content;
    const fmMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
    if (fmMatch) {
      fmMatch[1].split(/\r?\n/).forEach((line: string) => {
        const m = line.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.+)$/);
        if (m) { let val = m[2].trim(); if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1); fm[m[1]] = val; }
      });
      body = fmMatch[2];
    }
    const name = fm.name || fm.slug || "导入技能";
    const slug = fm.slug || name.toLowerCase().replace(/\s+/g, '-');
    const category = fm.category || guessCategory(slug, name, body);
    const description = fm.description || body.substring(0, 200).replace(/\n/g, ' ').trim();
    const tags = fm.tags || "";
    const version = fm.version || "1.0.0";
    const author = fm.author || "导入";
    const result = dbRun(
      `INSERT INTO skills (tenant_id, company_id, name, slug, category, description, tags, content, icon, source, version, author, file_size, install_count, rating, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '📦', 'import', ?, ?, ?, 0, 0, 1)`,
      [tid, 1, name, slug, category, description.substring(0, 500), tags, body.substring(0, 50000), version, author, content.length]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid, name, category }, message: "技能导入成功" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

function guessCategory(slug: string, name: string, content: string): string {
  const text = ((slug || '') + ' ' + (name || '') + ' ' + (content || '').substring(0, 500)).toLowerCase();
  if (/amazon|ebay|shopify|1688|aliex|dropship|fba|跨境|电商|etsy/.test(text)) return '电商与跨境';
  if (/seo|marketing|广告|增长|douyin|tiktok|千川|竞品|analytics|roi/.test(text)) return '营销与增长';
  if (/视频|video|脚本|image|设计|design|slide|ppt|创作|直播/.test(text)) return '内容与创作';
  if (/data|数据|stock|股票|金融|quant|量化|financial/.test(text)) return '数据与金融';
  if (/合同|法务|专利|legal|contract|patent/.test(text)) return '法务与合规';
  if (/论文|学术|academic|research|教育|教案/.test(text)) return '学术与教育';
  if (/飞书|feishu|企业微信|wecom|微信|chat|slack|wechat|lark/.test(text)) return '沟通与协作';
  if (/rag|wiki|skill|prompt|ontology|knowledge/.test(text)) return 'AI增强与知识';
  if (/fitness|health|nutrition|健身|adhd|food|recipe/.test(text)) return '生活与健康';
  if (/react|node|python|docker|kubernetes|api|typescript|数据库/.test(text)) return '开发与技术';
  return '其他';
}
