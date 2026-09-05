import { Router } from "express";
import { dbRun, dbGet, dbAll } from "../db";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware";

export const analyticsRoutes = Router();

// ===== 公开接口：页面访问记录（无需认证） =====

// 生成或获取 Session ID（前端使用 Cookie）
analyticsRoutes.post("/track/pageview", (req, res) => {
  try {
    const { session_id, page_url, page_title, referrer, screen_width, screen_height, timezone, language } = req.body;
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "";
    const now = new Date().toISOString();

    // 更新或创建会话
    const existingSession = dbGet("SELECT id FROM visitor_sessions WHERE session_id = ?", [session_id]);
    if (existingSession) {
      dbRun(
        `UPDATE visitor_sessions SET last_active_at = ?, page_views = page_views + 1 WHERE session_id = ?`,
        [now, session_id]
      );
    } else {
      dbRun(
        `INSERT INTO visitor_sessions (session_id, ip_address, user_agent, screen_size, timezone, language, referrer, first_visit_at, last_active_at, page_views)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [session_id, ip, userAgent, `${screen_width}x${screen_height}`, timezone, language, referrer || "", now, now]
      );
    }

    // 记录页面访问
    dbRun(
      `INSERT INTO visitor_pageviews (session_id, page_url, page_title, referrer, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [session_id, page_url, page_title || "", referrer || "", now]
    );

    // 更新页面停留时间（前一页）
    if (req.body.prev_page_url) {
      dbRun(
        `UPDATE visitor_pageviews SET dwell_seconds = ? WHERE session_id = ? AND page_url = ? AND id = (SELECT MAX(id) FROM visitor_pageviews WHERE session_id = ? AND page_url = ?)`,
        [req.body.dwell_seconds || 0, session_id, req.body.prev_page_url, session_id, req.body.prev_page_url]
      );
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[Analytics] track error:", e.message);
    res.json({ success: false, error: e.message });
  }
});

// 页面离开时更新停留时间
analyticsRoutes.post("/track/pageleave", (req, res) => {
  try {
    const { session_id, page_url, dwell_seconds } = req.body;
    dbRun(
      `UPDATE visitor_pageviews SET dwell_seconds = ? WHERE session_id = ? AND page_url = ? AND id = (SELECT MAX(id) FROM visitor_pageviews WHERE session_id = ? AND page_url = ?)`,
      [dwell_seconds || 0, session_id, page_url, session_id, page_url]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.json({ success: false });
  }
});

// ===== 管理员接口：访问统计分析 =====

analyticsRoutes.use(authenticate);

// 获取访问统计概览
analyticsRoutes.get("/stats/overview", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const totalSessions = dbGet("SELECT COUNT(*) as count FROM visitor_sessions") as any;
    const totalPageviews = dbGet("SELECT COUNT(*) as count FROM visitor_pageviews") as any;
    const todaySessions = dbGet(
      "SELECT COUNT(*) as count FROM visitor_sessions WHERE date(first_visit_at) = date('now', 'localtime')"
    ) as any;
    const todayPageviews = dbGet(
      "SELECT COUNT(*) as count FROM visitor_pageviews WHERE date(timestamp) = date('now', 'localtime')"
    ) as any;
    const activeNow = dbGet(
      "SELECT COUNT(*) as count FROM visitor_sessions WHERE last_active_at > datetime('now', '-5 minutes')"
    ) as any;
    const avgDwell = dbGet(
      "SELECT ROUND(AVG(dwell_seconds), 1) as avg_seconds FROM visitor_pageviews WHERE dwell_seconds > 0"
    ) as any;
    const totalDwell = dbGet(
      "SELECT ROUND(SUM(dwell_seconds)/60.0, 1) as total_minutes FROM visitor_pageviews WHERE dwell_seconds > 0"
    ) as any;

    res.json({
      total_sessions: totalSessions?.count || 0,
      total_pageviews: totalPageviews?.count || 0,
      today_sessions: todaySessions?.count || 0,
      today_pageviews: todayPageviews?.count || 0,
      active_now: activeNow?.count || 0,
      avg_dwell_seconds: avgDwell?.avg_seconds || 0,
      total_dwell_minutes: totalDwell?.total_minutes || 0
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取页面访问排行
analyticsRoutes.get("/stats/pages", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const pages = dbAll(
      `SELECT page_url, page_title, COUNT(*) as visit_count, ROUND(AVG(dwell_seconds), 1) as avg_dwell
       FROM visitor_pageviews GROUP BY page_url, page_title ORDER BY visit_count DESC LIMIT 20`
    );
    res.json(pages || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取每日访问趋势（最近30天）
analyticsRoutes.get("/stats/daily", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const daily = dbAll(
      `SELECT date(timestamp) as date, COUNT(DISTINCT session_id) as sessions, COUNT(*) as pageviews
       FROM visitor_pageviews WHERE timestamp > datetime('now', '-30 days')
       GROUP BY date(timestamp) ORDER BY date DESC`
    );
    res.json(daily || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取地域分布（基于IP前缀）
analyticsRoutes.get("/stats/geo", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const geo = dbAll(
      `SELECT ip_address, COUNT(*) as visit_count, MAX(last_active_at) as last_seen
       FROM visitor_sessions GROUP BY ip_address ORDER BY visit_count DESC LIMIT 50`
    );
    res.json(geo || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取访问时段分布
analyticsRoutes.get("/stats/hourly", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const hourly = dbAll(
      `SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as pageviews
       FROM visitor_pageviews GROUP BY hour ORDER BY hour`
    );
    res.json(hourly || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取设备/浏览器分布
analyticsRoutes.get("/stats/devices", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const devices = dbAll(
      `SELECT user_agent, COUNT(*) as count FROM visitor_sessions GROUP BY user_agent ORDER BY count DESC LIMIT 20`
    );
    res.json(devices || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取重复访问用户（同一session多次访问）
analyticsRoutes.get("/stats/repeat", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const repeats = dbAll(
      `SELECT session_id, page_views, first_visit_at, last_active_at
       FROM visitor_sessions WHERE page_views >= 3 ORDER BY page_views DESC LIMIT 30`
    );
    res.json(repeats || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 获取最近访问记录
analyticsRoutes.get("/stats/recent", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const recent = dbAll(
      `SELECT vs.session_id, vs.ip_address, vp.page_url, vp.page_title, vp.dwell_seconds, vp.timestamp
       FROM visitor_pageviews vp JOIN visitor_sessions vs ON vs.session_id = vp.session_id
       ORDER BY vp.timestamp DESC LIMIT ?`, [limit]
    );
    res.json(recent || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
