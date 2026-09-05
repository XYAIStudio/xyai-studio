import { Router } from "express";
import fs from "fs";
import path from "path";
import { dbAll, dbGet, dbRun, getDb, saveDb } from "../db";
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from "../middleware";
import { fileURLToPath } from "node:url";
import { hasDesktopCredentialBroker, readTenantLlmCredential, writeTenantLlmCredential } from "../services/credential-broker";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据库备份目录
const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");

export const settingsRoutes = Router();
settingsRoutes.use(authenticate);

const tenantConfigKey = (tenantId: number, key: string) => `tenant:${tenantId}:${key}`;
const AI_CONFIG_KEYS = new Set([
  "llm_provider", "llm_api_base", "llm_api_key", "llm_model",
  "ai_reply_enabled", "ai_reply_delay",
]);

const CONFIGURABLE_MODULE_IDS = new Set([
  "dashboard", "announcements", "organization", "employees", "skills", "industry-agent",
  "chat", "tasks", "workflows", "contracts", "assets", "attendance", "leave", "expense",
  "daily-report", "goals", "budgets", "performance", "efficiency", "reflections", "knowledge",
  "governance", "audit", "admin", "payments", "subscription",
]);

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ===== 数据库管理 API（仅超级管理员） =====

// 获取数据库信息
settingsRoutes.get("/database/info", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    const db = getDb();
    // 获取表数量和行数统计
    const tables = dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    let totalRows = 0;
    const tableStats: Record<string, number> = {};
    for (const t of tables as any[]) {
      try {
        const r = dbGet(`SELECT COUNT(*) as c FROM [${t.name}]`);
        const c = r?.c || 0;
        totalRows += c;
        tableStats[t.name] = c;
      } catch {}
    }

    // 数据库文件大小
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "xiongyuan.db");
    let fileSizeBytes = 0;
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      fileSizeBytes = stat.size;
    }

    // 备份列表
    let backups: any[] = [];
    if (fs.existsSync(BACKUP_DIR)) {
      backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith(".db"))
        .map(f => {
          const fp = path.join(BACKUP_DIR, f);
          const stat = fs.statSync(fp);
          return { filename: f, size: stat.size, created_at: stat.birthtime.toISOString() };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    res.json({
      success: true,
      data: {
        dialect: "sqlite",
        file_size_bytes: fileSizeBytes,
        file_size_human: formatBytes(fileSizeBytes),
        table_count: tables.length,
        total_rows: totalRows,
        table_stats: tableStats,
        backups_count: backups.length,
        latest_backup: backups[0]?.created_at || null,
        backups: backups.slice(0, 10), // 最近10个备份
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建数据库备份
settingsRoutes.post("/database/backup", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const data = db.export();
    const buffer = Buffer.from(data);

    // 文件名格式：xyos-YYYYMMDD-HHMMSS.db
    const now = new Date();
    const ts = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, "0")
      + String(now.getDate()).padStart(2, "0") + "-"
      + String(now.getHours()).padStart(2, "0")
      + String(now.getMinutes()).padStart(2, "0")
      + String(now.getSeconds()).padStart(2, "0");
    const filename = `xyos-${ts}.db`;
    const filePath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    // 限制备份文件数量（最多保留20个）
    cleanupBackups(20);

    res.json({
      success: true,
      data: {
        filename,
        size: buffer.length,
        size_human: formatBytes(buffer.length),
        path: filePath,
        message: "数据库备份成功",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 列出所有备份
settingsRoutes.get("/database/backups", requireSuperAdmin, (_req: AuthRequest, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".db") || f.endsWith(".db.bak"))
      .map(f => {
        const fp = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fp);
        return {
          filename: f,
          size: stat.size,
          size_human: formatBytes(stat.size),
          created_at: stat.birthtime.toISOString(),
          modified_at: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    res.json({ success: true, data: files });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 恢复数据库备份
settingsRoutes.post("/database/restore", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: "请指定要恢复的备份文件名" });
    }

    // 安全检查：防止路径穿越
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ success: false, error: "非法的文件名" });
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: "备份文件不存在" });
    }

    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "xiongyuan.db");

    // 先创建当前数据库的自动备份（安全回滚点）
    const preRestoreBackup = `pre-restore-${Date.now()}.bak`;
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(BACKUP_DIR, preRestoreBackup));
    }

    // 执行恢复：覆盖主数据库文件
    fs.copyFileSync(backupPath, dbPath);

    res.json({
      success: true,
      data: {
        message: "数据库恢复成功，将在下次重启后生效（或点击立即重载）",
        restored_from: filename,
        safety_backup: preRestoreBackup,
        note: "建议重启后端服务以确保数据完全加载",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除备份文件
settingsRoutes.delete("/database/backups/:filename", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ success: false, error: "非法的文件名" });
    }

    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "文件不存在" });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, data: { message: "备份已删除" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 工具函数 =====
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function cleanupBackups(maxKeep: number): void {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("xyos-") && f.endsWith(".db"))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  while (files.length > maxKeep) {
    const old = files.pop();
    if (old) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, old.name)); } catch {}
    }
  }
}

/** 当前租户的模块显隐配置；所有已登录用户读取同一租户配置。 */
settingsRoutes.get("/modules", (req: AuthRequest, res) => {
  try {
    const row = dbGet(
      "SELECT setting_value FROM company_settings WHERE tenant_id = ? AND setting_key = 'hidden_modules' ORDER BY id DESC LIMIT 1",
      [req.user!.tenant_id],
    ) as { setting_value?: string } | undefined;
    let hiddenModules: string[] = [];
    if (row?.setting_value) {
      const parsed: unknown = JSON.parse(row.setting_value);
      if (Array.isArray(parsed)) {
        hiddenModules = [...new Set(parsed.filter((value): value is string => typeof value === "string" && CONFIGURABLE_MODULE_IDS.has(value)))];
      }
    }
    res.json({ success: true, data: { hiddenModules } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 管理员保存模块显隐配置，按租户持久化到本地 XYOS 数据库。 */
settingsRoutes.put("/modules", requireAdmin, (req: AuthRequest, res) => {
  try {
    if (!Array.isArray(req.body?.hiddenModules)) {
      return res.status(400).json({ success: false, error: "hiddenModules 必须是数组" });
    }
    const hiddenModules = [...new Set(
      req.body.hiddenModules.filter((value: unknown): value is string =>
        typeof value === "string" && CONFIGURABLE_MODULE_IDS.has(value),
      ),
    )];
    const company = dbGet("SELECT id FROM companies WHERE tenant_id = ? ORDER BY id LIMIT 1", [req.user!.tenant_id]) as { id?: number } | undefined;
    if (!company?.id) return res.status(404).json({ success: false, error: "当前租户未配置公司" });

    dbRun("DELETE FROM company_settings WHERE tenant_id = ? AND setting_key = 'hidden_modules'", [req.user!.tenant_id]);
    dbRun(
      "INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id, updated_at) VALUES (?, 'hidden_modules', ?, ?, CURRENT_TIMESTAMP)",
      [company.id, JSON.stringify(hiddenModules), req.user!.tenant_id],
    );
    saveDb();
    res.json({ success: true, data: { hiddenModules } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.get("/registration", (req: AuthRequest, res) => {
  try {
    const setting = dbGet("SELECT setting_value FROM company_settings WHERE setting_key = 'registration_enabled'") as any;
    const enabled = setting ? setting.setting_value === "true" : true;
    res.json({ success: true, data: { enabled } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.put("/registration", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { enabled } = req.body;
    dbRun(
      "INSERT OR REPLACE INTO company_settings (company_id, setting_key, setting_value, tenant_id, updated_at) VALUES (1, 'registration_enabled', ?, ?, CURRENT_TIMESTAMP)",
      [enabled ? "true" : "false", req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.get("/company", (req: AuthRequest, res) => {
  try {
    const company = dbGet("SELECT * FROM companies WHERE tenant_id = ?", [req.user!.tenant_id]);
    const settings = dbAll("SELECT * FROM company_settings WHERE tenant_id = ?", [req.user!.tenant_id]);
    const settingsMap: Record<string, string> = {};
    for (const s of settings as any[]) {
      settingsMap[s.setting_key] = s.setting_value;
    }
    res.json({ success: true, data: { company, settings: settingsMap } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.put("/company", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, settings } = req.body;
    if (name) {
      dbRun("UPDATE companies SET name = ? WHERE tenant_id = ?", [name, req.user!.tenant_id]);
    }
    if (settings && typeof settings === "object") {
      for (const [key, value] of Object.entries(settings)) {
        dbRun(
          "INSERT OR REPLACE INTO company_settings (company_id, setting_key, setting_value, tenant_id, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
          [1, key, value, req.user!.tenant_id]
        );
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.get("/ai", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const configs = dbAll("SELECT * FROM ai_config WHERE tenant_id = ?", [tenantId]);
    // 新版的租户命名空间必须优先于 v0.3 的裸 key；SQLite 返回顺序
    // 不应决定用户最终读取到哪一份模型配置。
    const scopedConfigMap: Record<string, string> = {};
    const legacyConfigMap: Record<string, string> = {};
    for (const c of configs as any[]) {
      const prefix = `tenant:${tenantId}:`;
      const storedKey = String(c.key || "");
      const isScoped = storedKey.startsWith(prefix);
      const key = isScoped ? storedKey.slice(prefix.length) : storedKey;
      if (!AI_CONFIG_KEYS.has(key)) continue;
      if (isScoped) {
        scopedConfigMap[key] = c.value;
      } else if (tenantId === 1) {
        // 仅兼容老的默认租户数据，绝不将旧的全局值泄露给其他租户。
        legacyConfigMap[key] = c.value;
      }
    }
    const configMap: Record<string, string> = { ...legacyConfigMap, ...scopedConfigMap };
    // 密钥只能写入，绝不回显给浏览器；空值保存时会保留已存密钥。
    const legacyKey = configMap.llm_api_key || "";
    const storedKey = hasDesktopCredentialBroker()
      ? await readTenantLlmCredential(tenantId)
      : legacyKey;
    configMap.llm_api_key = "";
    (configMap as any).llm_api_key_configured = Boolean(storedKey);
    res.json({ success: true, data: configMap });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.put("/ai", requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Accept both { configs: {...} } and flat { key: value } formats
    const entries = { ...(req.body.configs || req.body) };
    if (entries && typeof entries === "object") {
      const tenantId = req.user!.tenant_id;
      const current = dbAll("SELECT key, value FROM ai_config WHERE tenant_id = ?", [tenantId]) as any[];
      const readCurrent = (key: string) => current.find((item) => item.key === tenantConfigKey(tenantId, key))?.value
        || (tenantId === 1 ? current.find((item) => item.key === key)?.value : undefined)
        || "";
      const apiBase = String(entries.llm_api_base ?? readCurrent("llm_api_base")).trim().replace(/\/+$/, "");
      const model = String(entries.llm_model ?? readCurrent("llm_model")).trim();
      const suppliedApiKey = String(entries.llm_api_key || "").trim();
      const legacyApiKey = readCurrent("llm_api_key");
      let brokerApiKey = "";
      if (hasDesktopCredentialBroker()) brokerApiKey = (await readTenantLlmCredential(tenantId) || "").trim();
      const apiKey = suppliedApiKey || brokerApiKey || legacyApiKey;
      if (!apiBase || !model || !apiKey) {
        return res.status(400).json({ success: false, error: "请完整填写 API 地址、API Key 和模型名称" });
      }
      let endpoint: URL;
      try { endpoint = new URL(apiBase); } catch {
        return res.status(400).json({ success: false, error: "API 地址格式不正确" });
      }
      const isLocal = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
      if (endpoint.protocol !== "https:" && !(isLocal && endpoint.protocol === "http:")) {
        return res.status(400).json({ success: false, error: "远程 API 地址必须使用 HTTPS" });
      }
      entries.llm_api_base = apiBase;
      entries.llm_model = model;
      // Desktop builds keep API keys in OS-encrypted storage.  Saving any AI
      // setting also migrates an older SQLite key after the vault write succeeds.
      if (hasDesktopCredentialBroker()) {
        await writeTenantLlmCredential(tenantId, apiKey);
        dbRun(
          "DELETE FROM ai_config WHERE key = ? OR (tenant_id = ? AND key = ?)",
          [tenantConfigKey(tenantId, "llm_api_key"), tenantId, tenantId === 1 ? "llm_api_key" : "__no_legacy_key__"],
        );
        delete entries.llm_api_key;
      } else if (suppliedApiKey) {
        entries.llm_api_key = apiKey;
      } else {
        delete entries.llm_api_key;
      }
      for (const [key, value] of Object.entries(entries)) {
        if (AI_CONFIG_KEYS.has(key) && value !== undefined && value !== null) {
          dbRun(
            "INSERT OR REPLACE INTO ai_config (key, value, tenant_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            [tenantConfigKey(tenantId, key), String(value), tenantId]
          );
        }
      }
    }
    res.json({ success: true, message: "模型配置已保存" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.get("/roles", (req: AuthRequest, res) => {
  try {
    const roles = dbAll("SELECT * FROM roles WHERE tenant_id = ?", [req.user!.tenant_id]);
    res.json({ success: true, data: roles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.post("/roles", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name || !permissions) return res.status(400).json({ success: false, error: "名称和权限必填" });
    const result = dbRun(
      "INSERT INTO roles (name, permissions, tenant_id) VALUES (?, ?, ?)",
      [name, JSON.stringify(permissions), req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.put("/roles/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, permissions } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (name) { updates.push("name = ?"); params.push(name); }
    if (permissions) { updates.push("permissions = ?"); params.push(JSON.stringify(permissions)); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });
    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE roles SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.delete("/roles/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    dbRun("DELETE FROM roles WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    dbRun("DELETE FROM user_roles WHERE role_id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.get("/users", requireAdmin, (req: AuthRequest, res) => {
  try {
    const users = dbAll(
      `SELECT u.*, GROUP_CONCAT(r.name) as role_names
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.tenant_id = ?
       GROUP BY u.id`,
      [req.user!.tenant_id]
    );
    res.json({ success: true, data: users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.post("/users", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { email, password, nickname, role } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "邮箱和密码必填" });

    const existing = dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) return res.status(400).json({ success: false, error: "邮箱已注册" });

    const bcrypt = require("bcryptjs");
    const hash = bcrypt.hashSync(password, 10);
    const userRole = role || "user";

    if (userRole === "super_admin" && req.user!.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "只有超级管理员可以创建超级管理员" });
    }

    const result = dbRun(
      "INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [email, hash, nickname || email.split("@")[0], userRole, req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.put("/users/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { nickname, role, password } = req.body;
    const targetUser = dbGet("SELECT * FROM users WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    if (!targetUser) return res.status(404).json({ success: false, error: "用户不存在" });

    if (targetUser.role === "super_admin" && req.user!.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "只有超级管理员可以修改超级管理员" });
    }

    if (role === "super_admin" && req.user!.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "只有超级管理员可以设置超级管理员角色" });
    }

    const updates: string[] = [];
    const params: any[] = [];
    if (nickname) { updates.push("nickname = ?"); params.push(nickname); }
    if (role) { updates.push("role = ?"); params.push(role); }
    if (password) {
      const bcrypt = require("bcryptjs");
      updates.push("password_hash = ?");
      params.push(bcrypt.hashSync(password, 10));
    }

    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });

    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE users SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.delete("/users/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const targetUser = dbGet("SELECT * FROM users WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]) as any;
    if (!targetUser) return res.status(404).json({ success: false, error: "用户不存在" });

    if (targetUser.role === "super_admin") {
      return res.status(403).json({ success: false, error: "不能删除超级管理员" });
    }

    if (targetUser.id === req.user!.id) {
      return res.status(400).json({ success: false, error: "不能删除自己" });
    }

    dbRun("DELETE FROM users WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    dbRun("DELETE FROM user_roles WHERE user_id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.post("/users/:userId/roles", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { roleId } = req.body;
    if (!roleId) return res.status(400).json({ success: false, error: "角色ID必填" });
    dbRun(
      "INSERT OR IGNORE INTO user_roles (user_id, role_id, tenant_id) VALUES (?, ?, ?)",
      [req.params.userId, roleId, req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

settingsRoutes.delete("/users/:userId/roles/:roleId", requireAdmin, (req: AuthRequest, res) => {
  try {
    dbRun(
      "DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND tenant_id = ?",
      [req.params.userId, req.params.roleId, req.user!.tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 空中模式（私有化策略）开关 =====

// 获取当前空中模式状态
settingsRoutes.get("/air-gap", requireAdmin, (_req: AuthRequest, res) => {
  try {
    const row = dbGet("SELECT setting_value FROM company_settings WHERE setting_key = 'air_gap_mode'") as any;
    const enabled = row?.setting_value === "true";
    res.json({ success: true, data: { airGapMode: enabled } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 切换空中模式
settingsRoutes.post("/air-gap", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { enabled } = req.body;
    const value = enabled ? "true" : "false";
    const existing = dbGet("SELECT id FROM company_settings WHERE setting_key = 'air_gap_mode'") as any;
    if (existing) {
      dbRun("UPDATE company_settings SET setting_value = ? WHERE setting_key = 'air_gap_mode'", [value]);
    } else {
      dbRun("INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id) VALUES (1, 'air_gap_mode', ?, 1)", [value]);
    }
    saveDb();
    res.json({ success: true, data: { airGapMode: enabled } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
