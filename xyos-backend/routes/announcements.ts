import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbAll, dbGet, dbRun } from "../db";

export const announcementRoutes = Router();
announcementRoutes.use(authenticate);

/** 公告列表（支持分页、类型筛选、搜索） */
announcementRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const type = req.query.type as string;
    const search = req.query.search as string;

    let whereClauses = ["a.tenant_id = ?", "a.deleted_at IS NULL"];
    let params: any[] = [tenantId];

    if (type && type !== "all") {
      whereClauses.push("a.type = ?");
      params.push(type);
    }
    if (search) {
      whereClauses.push("(a.title LIKE ? OR a.content LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM announcements a WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT a.*, u.nickname as creator_name,
        (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) as read_count
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE ${where}
       ORDER BY a.is_pinned DESC, a.published_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // 当前用户的已读状态
    const userId = req.user!.id;
    const myReads = new Set(
      dbAll(`SELECT announcement_id FROM announcement_reads WHERE user_id = ? AND announcement_id IN (${rows.map(r => r.id).join(",") || "0"})`, [userId])
        .map((r: any) => r.announcement_id)
    );

    const totalUsers = dbGet(`SELECT COUNT(*) as count FROM users WHERE tenant_id = ?`, [tenantId])?.count ?? 1;

    const list = rows.map((r: any) => ({
      ...r,
      is_read: myReads.has(r.id),
      read_count: r.read_count ?? 0,
      total_users: totalUsers,
      read_percent: Math.round(((r.read_count ?? 0) / totalUsers) * 100),
    }));

    res.json({ success: true, data: { list, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 置顶公告列表（未过期） */
announcementRoutes.get("/pinned", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = dbAll(
      `SELECT a.*, u.nickname as creator_name
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.is_pinned = 1
       AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
       ORDER BY a.published_at DESC
       LIMIT 5`,
      [tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 公告详情（同时标记已读） */
announcementRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    const row = dbGet(
      `SELECT a.*, u.nickname as creator_name
       FROM announcements a LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );
    if (!row) return res.status(404).json({ success: false, error: "公告不存在或已删除" });

    // 标记已读
    dbRun(
      `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, datetime('now'))`,
      [id, userId]
    );

    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 当前用户未读公告数 */
announcementRoutes.get("/action/unread", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const count = dbGet(
      `SELECT COUNT(*) as count FROM announcements a
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL
       AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
      [tenantId, userId]
    )?.count ?? 0;
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 标记已读 */
announcementRoutes.post("/:id/read", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    dbRun(
      `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, datetime('now'))`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 全部标记已读 */
announcementRoutes.post("/read-all", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const unreadIds = dbAll(
      `SELECT a.id FROM announcements a
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL
       AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
      [tenantId, userId]
    );
    for (const r of unreadIds as any[]) {
      dbRun(`INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, datetime('now'))`, [r.id, userId]);
    }
    res.json({ success: true, data: { marked: unreadIds.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 创建公告（admin+） */
announcementRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ success: false, error: "无权限" });
    }
    const { title, content, type, priority, is_pinned, expires_at } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: "标题和内容不能为空" });
    }
    const result = dbRun(
      `INSERT INTO announcements (tenant_id, title, content, type, priority, is_pinned, expires_at, created_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [req.user!.tenant_id, title, content, type || "notice", priority || "normal", is_pinned ? 1 : 0, expires_at || null, req.user!.id]
    );
    const row = dbGet("SELECT * FROM announcements WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 更新公告（admin+） */
announcementRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ success: false, error: "无权限" });
    }
    const id = parseInt(req.params.id);
    const exists = dbGet("SELECT id FROM announcements WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!exists) return res.status(404).json({ success: false, error: "公告不存在" });

    const { title, content, type, priority, is_pinned, expires_at } = req.body;
    dbRun(
      `UPDATE announcements SET title = ?, content = ?, type = ?, priority = ?, is_pinned = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [title, content, type, priority, is_pinned ? 1 : 0, expires_at || null, id]
    );
    const row = dbGet("SELECT * FROM announcements WHERE id = ?", [id]);
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 软删除公告（admin+） */
announcementRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ success: false, error: "无权限" });
    }
    const id = parseInt(req.params.id);
    dbRun("UPDATE announcements SET deleted_at = datetime('now') WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 切换置顶（admin+） */
announcementRoutes.put("/:id/toggle-pin", (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ success: false, error: "无权限" });
    }
    const id = parseInt(req.params.id);
    const row = dbGet("SELECT is_pinned FROM announcements WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!row) return res.status(404).json({ success: false, error: "公告不存在" });
    const newPinned = (row as any).is_pinned ? 0 : 1;
    dbRun("UPDATE announcements SET is_pinned = ?, updated_at = datetime('now') WHERE id = ?", [newPinned, id]);
    res.json({ success: true, data: { is_pinned: newPinned === 1 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
