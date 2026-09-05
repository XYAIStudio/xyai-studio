import { Router } from "express";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware";
import { dbRun, dbGet, dbAll, getDb, initDatabase, saveDb } from "../db";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const adminRoutes = Router();

// ============ 访客追踪 API ============

// POST /visitor-log — 记录访客事件（公开接口，无需认证）
adminRoutes.post("/visitor-log", (req, res) => {
  try {
    const { event_type, tenant_id, user_id, page_path, referrer, metadata } = req.body;
    const ip = req.ip || req.socket.remoteAddress || "";
    const ua = (req.headers["user-agent"] || "").substring(0, 500);

    dbRun(
      `INSERT INTO visitor_logs (event_type, tenant_id, user_id, ip_address, user_agent, page_path, referrer, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [event_type || "page_view", tenant_id || null, user_id || null, ip, ua, page_path || null, referrer || null, metadata || null]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 超级管理员统计 API ============

// GET /stats/overview — 跨租户总览
adminRoutes.get("/stats/overview", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const totalTenants = dbGet("SELECT COUNT(*) as count FROM tenants");
    const totalUsers = dbGet("SELECT COUNT(*) as count FROM users");
    const totalEmployees = dbGet("SELECT COUNT(*) as count FROM employees");
    const totalTokens = dbGet("SELECT COALESCE(SUM(total_tokens),0) as total FROM token_usage");
    const todayVisitors = dbGet(
      "SELECT COUNT(DISTINCT ip_address) as count FROM visitor_logs WHERE date(created_at) = date('now','localtime')"
    );
    const todayLogins = dbGet(
      "SELECT COUNT(*) as count FROM visitor_logs WHERE event_type='login' AND date(created_at) = date('now','localtime')"
    );
    const todayRegs = dbGet(
      "SELECT COUNT(*) as count FROM visitor_logs WHERE event_type='register' AND date(created_at) = date('now','localtime')"
    );

    res.json({
      success: true,
      data: {
        total_tenants: totalTenants?.count || 0,
        total_users: totalUsers?.count || 0,
        total_employees: totalEmployees?.count || 0,
        total_tokens: totalTokens?.total || 0,
        today_visitors: todayVisitors?.count || 0,
        today_logins: todayLogins?.count || 0,
        today_registrations: todayRegs?.count || 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /stats/visitors — 访客趋势数据
adminRoutes.get("/stats/visitors", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    // 每日访客趋势
    const trend = dbAll(
      `SELECT date(created_at) as day, event_type, COUNT(*) as count
       FROM visitor_logs
       WHERE created_at >= datetime('now','localtime','-' || ? || ' days')
       GROUP BY date(created_at), event_type
       ORDER BY day ASC`,
      [days]
    );

    // 事件类型分布
    const distribution = dbAll(
      `SELECT event_type, COUNT(*) as count
       FROM visitor_logs GROUP BY event_type ORDER BY count DESC`
    );

    // 最近访客
    const recent = dbAll(
      `SELECT vl.*, u.email, t.name as tenant_name
       FROM visitor_logs vl
       LEFT JOIN users u ON vl.user_id = u.id
       LEFT JOIN tenants t ON vl.tenant_id = t.id
       ORDER BY vl.created_at DESC LIMIT 50`
    );

    res.json({ success: true, data: { trend, distribution, recent } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /stats/trials — 试用数据统计
adminRoutes.get("/stats/trials", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    // 试用租户概览
    const trialSummary = dbGet(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'trial' AND trial_ends_at > datetime('now','localtime') THEN 1 ELSE 0 END) as active_trials,
        SUM(CASE WHEN status = 'trial' AND trial_ends_at <= datetime('now','localtime') THEN 1 ELSE 0 END) as expired_trials,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_tenants
       FROM tenants`
    );

    // 试用租户详情
    const trials = dbAll(
      `SELECT t.id, t.name, t.slug, t.status, t.plan, t.trial_ends_at,
        t.created_at, t.max_users, t.max_ai_employees, t.max_tokens_monthly,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT e.id) as employee_count
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id
       LEFT JOIN employees e ON e.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );

    // 每日注册统计
    const dailyRegs = dbAll(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM tenants
       WHERE created_at >= datetime('now','localtime','-30 days')
       GROUP BY date(created_at) ORDER BY day ASC`
    );

    // 每日登录统计
    const dailyLogins = dbAll(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM visitor_logs
       WHERE event_type='login' AND created_at >= datetime('now','localtime','-30 days')
       GROUP BY date(created_at) ORDER BY day ASC`
    );

    // Token消耗排行
    const tokenRanking = dbAll(
      `SELECT t.name, t.slug, COALESCE(SUM(tu.total_tokens),0) as total_tokens
       FROM tenants t
       LEFT JOIN token_usage tu ON tu.tenant_id = t.id
       GROUP BY t.id ORDER BY total_tokens DESC LIMIT 10`
    );

    res.json({
      success: true,
      data: { trialSummary, trials, dailyRegs, dailyLogins, tokenRanking },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /tenants — 列出所有租户（含试用信息）
adminRoutes.get("/tenants", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const tenants = dbAll(
      `SELECT t.*,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT e.id) as employee_count
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id
       LEFT JOIN employees e ON e.tenant_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    );
    res.json({ success: true, data: tenants });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /tenants/:id/trial — 设置租户试用期
adminRoutes.put("/tenants/:id/trial", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { trial_ends_at, status, plan } = req.body;

    if (trial_ends_at) {
      dbRun("UPDATE tenants SET trial_ends_at = ? WHERE id = ?", [trial_ends_at, id]);
    }
    if (status) {
      dbRun("UPDATE tenants SET status = ? WHERE id = ?", [status, id]);
    }
    if (plan) {
      dbRun("UPDATE tenants SET plan = ? WHERE id = ?", [plan, id]);
    }

    const tenant = dbGet("SELECT * FROM tenants WHERE id = ?", [id]);
    res.json({ success: true, data: tenant });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ V4: 数据库备份管理 ============

// 获取数据库路径
function getDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // admin.ts 在 routes/ 目录下，数据库在 backend/data/
  return path.join(__dirname, "..", "data", "xiongyuan.db");
}

function getBackupDir(): string {
  const dir = path.join(path.dirname(getDbPath()), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// GET /database/backups — 列出所有备份
adminRoutes.get("/database/backups", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(".db"))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          size_display: stats.size > 1024 * 1024
            ? `${(stats.size / 1024 / 1024).toFixed(1)} MB`
            : `${(stats.size / 1024).toFixed(1)} KB`,
          created_at: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    // 获取当前数据库信息
    const dbPath = getDbPath();
    const dbStats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;

    res.json({
      success: true,
      data: {
        backups: files,
        current: dbStats ? {
          size: dbStats.size,
          size_display: dbStats.size > 1024 * 1024
            ? `${(dbStats.size / 1024 / 1024).toFixed(1)} MB`
            : `${(dbStats.size / 1024).toFixed(1)} KB`,
          path: dbPath,
          updated_at: dbStats.mtime.toISOString(),
        } : null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /database/backup — 创建备份
adminRoutes.post("/database/backup", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    // 1. 确保数据库保存到磁盘
    saveDb();

    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return res.status(400).json({ success: false, error: "数据库文件不存在" });
    }

    // 2. 生成备份文件名
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const backupName = req.body.name
      ? `xiongyuan_${req.body.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")}_${timestamp}.db`
      : `xiongyuan_backup_${timestamp}.db`;

    // 3. 复制数据库文件
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, backupName);
    fs.copyFileSync(dbPath, backupPath);

    const backupStats = fs.statSync(backupPath);

    res.json({
      success: true,
      data: {
        filename: backupName,
        size: backupStats.size,
        size_display: backupStats.size > 1024 * 1024
          ? `${(backupStats.size / 1024 / 1024).toFixed(1)} MB`
          : `${(backupStats.size / 1024).toFixed(1)} KB`,
        created_at: backupStats.mtime.toISOString(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /database/restore — 恢复备份
adminRoutes.post("/database/restore", authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: "请指定要恢复的备份文件名" });
    }

    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, filename);

    // 安全检查：防止路径遍历
    if (!backupPath.startsWith(backupDir) || !fs.existsSync(backupPath)) {
      return res.status(400).json({ success: false, error: "备份文件不存在或路径不合法" });
    }

    // 1. 恢复前先自动备份当前数据库
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      const autoBackupName = `xiongyuan_auto_before_restore_${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      fs.copyFileSync(dbPath, path.join(backupDir, autoBackupName));
    }

    // 2. 复制备份文件到数据库路径
    fs.copyFileSync(backupPath, dbPath);

    // 3. 重新加载数据库
    try {
      await initDatabase();
      res.json({
        success: true,
        data: {
          restored_from: filename,
          message: "数据库已恢复，服务正常运行",
        },
      });
    } catch (reloadErr: any) {
      res.status(500).json({
        success: false,
        error: `备份文件已复制，但重新加载数据库失败: ${reloadErr.message}。请手动重启服务。`,
      });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /database/backups/:filename — 删除备份
adminRoutes.delete("/database/backups/:filename", authenticate, requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, filename);

    // 安全检查
    if (!backupPath.startsWith(backupDir) || !fs.existsSync(backupPath)) {
      return res.status(400).json({ success: false, error: "备份文件不存在或路径不合法" });
    }

    fs.unlinkSync(backupPath);
    res.json({ success: true, data: { deleted: filename } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default adminRoutes;
