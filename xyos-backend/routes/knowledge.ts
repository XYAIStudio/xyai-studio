import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import { logActivity } from "../services/notification";
import { UPLOAD_DIR } from "../middleware/upload";
import path from "path";
import fs from "fs";
import iconv from "iconv-lite";
import crypto from "crypto";
import multer from "multer";
import { scanFileBuffer } from "../services/file-security";

export const knowledgeRoutes = Router();
knowledgeRoutes.use(authenticate);

const KNOWLEDGE_FILE_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
  ".txt", ".md", ".csv", ".json", ".xml", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".rar",
]);

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, KNOWLEDGE_FILE_EXTENSIONS.has(ext));
  },
});

function resolveStoredFile(filePath: string, tenantId: number): string | null {
  const root = path.resolve(UPLOAD_DIR, "tenants", String(tenantId)) + path.sep;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(root) ? resolved : null;
}

function safeDownloadName(name: string): string {
  return path.basename(name).replace(/[\r\n"]/g, "_") || "download";
}

function normalizeFolder(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 240 || value.includes("\0")) return null;
  if (value.replace(/\\/g, "/").split("/").some(segment => segment === "..")) return null;
  const normalized = path.posix.normalize(`/${value.replace(/\\/g, "/")}`).replace(/\/+$/, "") || "/";
  return normalized;
}

function hasPrefix(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isTextLike(buffer: Buffer, ext: string): boolean {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 32 * 1024)).toString("utf8");
  if (sample.includes("\uFFFD")) return false;
  return ext !== ".xml" || !/<!DOCTYPE|<!ENTITY/i.test(sample);
}

function matchesKnowledgeFileSignature(buffer: Buffer, ext: string): boolean {
  if (buffer.length === 0) return false;
  if ([".txt", ".md", ".csv", ".json", ".xml"].includes(ext)) return isTextLike(buffer, ext);
  if (ext === ".pdf") return hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (ext === ".png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if ([".jpg", ".jpeg"].includes(ext)) return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (ext === ".gif") return hasPrefix(buffer, [0x47, 0x49, 0x46, 0x38]);
  if (ext === ".webp") return hasPrefix(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if ([".docx", ".xlsx", ".pptx", ".zip"].includes(ext)) return hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if ([".doc", ".xls", ".ppt"].includes(ext)) return hasPrefix(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (ext === ".rar") return hasPrefix(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
  return false;
}

function createTenantStoragePath(tenantId: number, ext: string): string {
  const tenantDir = path.join(UPLOAD_DIR, "tenants", String(tenantId));
  fs.mkdirSync(tenantDir, { recursive: true, mode: 0o750 });
  return path.join(tenantDir, `${crypto.randomUUID()}${ext}`);
}

// ===== 笔记 CRUD =====
knowledgeRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const { search, tags } = req.query;
    let sql = "SELECT * FROM knowledge_notes WHERE tenant_id = ?";
    const params: any[] = [req.user!.tenant_id];
    if (search) { sql += " AND (title LIKE ? OR content LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    if (tags) { sql += " AND tags LIKE ?"; params.push(`%${tags}%`); }
    sql += " ORDER BY created_at DESC";
    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

knowledgeRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const note = dbGet("SELECT * FROM knowledge_notes WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    if (!note) return res.status(404).json({ success: false, error: "笔记不存在" });
    res.json({ success: true, data: note });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

knowledgeRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const { title, content, tags, source } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });
    const result = dbRun(
      "INSERT INTO knowledge_notes (title, content, tags, source, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [title, content || "", tags || "", source || "", req.user!.tenant_id]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

knowledgeRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    const { title, content, tags } = req.body;
    const updates: string[] = []; const params: any[] = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (content !== undefined) { updates.push("content = ?"); params.push(content); }
    if (tags !== undefined) { updates.push("tags = ?"); params.push(tags); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: "无更新内容" });
    params.push(req.params.id, req.user!.tenant_id);
    dbRun(`UPDATE knowledge_notes SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

knowledgeRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    dbRun("DELETE FROM knowledge_notes WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 文件管理 =====

// 上传文件
knowledgeRoutes.post("/files/upload", requireAdmin, knowledgeUpload.single("file"), async (req: AuthRequest, res) => {
  let storedPath: string | null = null;
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: "请选择文件" });

    // 修复中文文件名编码
    let originalName = file.originalname;
    try {
      // multer 可能将 UTF-8 文件名存为 latin1 编码，尝试修复
      const buf = Buffer.from(originalName, "latin1");
      const utf8 = buf.toString("utf-8");
      if (utf8.includes("\ufffd")) throw new Error("not latin1");
      if (/[\u4e00-\u9fff]/.test(utf8) || !/[^\x00-\x7F]/.test(utf8)) originalName = utf8;
    } catch { /* keep original */ }

    const folder = normalizeFolder(req.body.folder || "/");
    if (!folder) return res.status(400).json({ success: false, error: "知识文件夹路径无效" });
    const fileType = path.extname(file.originalname).toLowerCase();
    if (!KNOWLEDGE_FILE_EXTENSIONS.has(fileType) || !matchesKnowledgeFileSignature(file.buffer, fileType)) {
      return res.status(415).json({ success: false, error: "文件扩展名与内容不匹配，或文件类型不受支持" });
    }
    const scan = await scanFileBuffer(file.buffer);
    if (scan.verdict === "blocked") {
      const statusCode = scan.reason === "infected" ? 422 : 503;
      return res.status(statusCode).json({ success: false, error: scan.reason === "infected" ? "文件安全扫描未通过" : "文件安全扫描服务不可用，上传已拒绝" });
    }
    const sizeKB = Math.round(file.size / 1024);

    // 检查存储限额
    const limitSetting = dbGet(
      "SELECT setting_value FROM company_settings WHERE setting_key = 'knowledge_storage_limit_kb' AND tenant_id = ?",
      [req.user!.tenant_id]
    ) as any;
    const limitKB = limitSetting ? parseInt(limitSetting.setting_value) : 1048576; // 默认1GB
    const usedKB = (dbGet("SELECT SUM(file_size) as total FROM knowledge_files WHERE tenant_id = ?", [req.user!.tenant_id]) as any)?.total || 0;
    if (usedKB + sizeKB > limitKB) {
      const usedMB = (usedKB / 1024).toFixed(0);
      const limitMB = (limitKB / 1024).toFixed(0);
      return res.status(413).json({ success: false, error: `存储空间不足：已用 ${usedMB}MB / ${limitMB}MB` });
    }

    storedPath = createTenantStoragePath(req.user!.tenant_id, fileType);
    fs.writeFileSync(storedPath, file.buffer, { mode: 0o640 });

    // 同步解析
    let status = "pending";
    let contentExtracted = "";
    let summary = "";
    let keywords = "";
    try {
      if ([".txt", ".md", ".csv", ".json", ".xml", ".html"].includes(fileType)) {
        const raw = readFileSmart(storedPath);
        contentExtracted = raw.slice(0, 10000);
        summary = raw.slice(0, 300).replace(/\n/g, " ");
        keywords = extractKeywords(raw);
        status = "parsed";
      } else {
        summary = `文件 · ${new Date().toLocaleDateString()} 上传`;
        status = "parsed";
      }
    } catch (e: any) {
      status = "failed";
      summary = `解析失败: ${e.message}`;
    }

    const result = dbRun(
      `INSERT INTO knowledge_files (tenant_id, name, original_name, file_path, file_size, file_type, folder, status, content_extracted, extracted_summary, keywords, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user!.tenant_id, path.basename(storedPath), originalName, storedPath, sizeKB, fileType, folder, status, contentExtracted, summary, keywords, req.user!.id]
    );

    logActivity({
      userId: req.user!.id,
      action: "knowledge_file_uploaded",
      entityType: "knowledge_file",
      entityId: result.lastInsertRowid,
      details: JSON.stringify({ fileType, sizeKB, scan }),
      tenantId: req.user!.tenant_id,
    });

    res.json({ success: true, data: { id: result.lastInsertRowid, name: originalName, size: sizeKB, type: fileType, status } });
  } catch (err: any) {
    if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 文件列表
knowledgeRoutes.get("/files/list", (req: AuthRequest, res) => {
  try {
    const { folder, status } = req.query;
    let sql = "SELECT * FROM knowledge_files WHERE tenant_id = ?";
    const params: any[] = [req.user!.tenant_id];
    if (folder) { sql += " AND folder = ?"; params.push(folder); }
    if (status) { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY created_at DESC";
    res.json({ success: true, data: dbAll(sql, params) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 文件统计
knowledgeRoutes.get("/files/stats", (req: AuthRequest, res) => {
  try {
    const tid = req.user!.tenant_id;
    const total = dbGet("SELECT COUNT(*) as c FROM knowledge_files WHERE tenant_id = ?", [tid]) as any;
    const parsed = dbGet("SELECT COUNT(*) as c FROM knowledge_files WHERE tenant_id = ? AND status = 'parsed'", [tid]) as any;
    const pending = dbGet("SELECT COUNT(*) as c FROM knowledge_files WHERE tenant_id = ? AND status IN ('pending','parsing')", [tid]) as any;
    const totalSize = dbGet("SELECT SUM(file_size) as total FROM knowledge_files WHERE tenant_id = ?", [tid]) as any;
    const byType = dbAll("SELECT file_type, COUNT(*) as count FROM knowledge_files WHERE tenant_id = ? GROUP BY file_type ORDER BY count DESC", [tid]);
    const limitSetting = dbGet("SELECT setting_value FROM company_settings WHERE setting_key = 'knowledge_storage_limit_kb' AND tenant_id = ?", [tid]) as any;
    const limitKB = limitSetting ? parseInt(limitSetting.setting_value) : 1048576;
    res.json({ success: true, data: { total: total.c, parsed: parsed.c, pending: pending.c, totalSizeKB: totalSize.total || 0, limitKB, byType } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 私有知识文件必须经租户和文件记录校验后下载，不能再按物理文件名直接访问。
knowledgeRoutes.get("/files/:id/download", (req: AuthRequest, res) => {
  try {
    const file = dbGet(
      "SELECT * FROM knowledge_files WHERE id = ? AND tenant_id = ?",
      [req.params.id, req.user!.tenant_id]
    ) as any;
    if (!file) return res.status(404).json({ success: false, error: "文件不存在或无访问权限" });
    const storedPath = resolveStoredFile(file.file_path || "", req.user!.tenant_id);
    if (!storedPath || !fs.existsSync(storedPath)) return res.status(404).json({ success: false, error: "文件内容不存在" });
    logActivity({ userId: req.user!.id, action: "knowledge_file_downloaded", entityType: "knowledge_file", entityId: file.id, tenantId: req.user!.tenant_id });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    return res.download(storedPath, safeDownloadName(file.original_name || file.name));
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

// 删除文件
knowledgeRoutes.delete("/files/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const file = dbGet("SELECT * FROM knowledge_files WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    if (!file) return res.status(404).json({ success: false, error: "文件不存在" });
    // 删除物理文件
    const fpath = resolveStoredFile((file as any).file_path || "", req.user!.tenant_id);
    if (fpath && fs.existsSync(fpath)) fs.unlinkSync(fpath);
    dbRun("DELETE FROM knowledge_files WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 重新解析
knowledgeRoutes.post("/files/:id/reparse", requireAdmin, (req: AuthRequest, res) => {
  try {
    const file = dbGet("SELECT * FROM knowledge_files WHERE id = ? AND tenant_id = ?", [req.params.id, req.user!.tenant_id]);
    if (!file) return res.status(404).json({ success: false, error: "文件不存在" });

    const f = file as any;
    try {
      const storedPath = resolveStoredFile(f.file_path || "", req.user!.tenant_id);
      if (!storedPath || !fs.existsSync(storedPath)) throw new Error("文件内容不存在或路径无效");
      const raw = readFileSmart(storedPath);
      dbRun(
        "UPDATE knowledge_files SET status = 'parsed', content_extracted = ?, extracted_summary = ?, keywords = ?, parsed_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
        [raw.slice(0, 10000), raw.slice(0, 300).replace(/\n/g, " "), extractKeywords(raw), f.id, req.user!.tenant_id]
      );
    } catch (e: any) {
      dbRun("UPDATE knowledge_files SET status = 'failed', extracted_summary = ? WHERE id = ? AND tenant_id = ?",
        [`解析失败: ${e.message}`, f.id, req.user!.tenant_id]);
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 文件夹列表
knowledgeRoutes.get("/files/folders", (req: AuthRequest, res) => {
  try {
    // 合并数据库中的文件夹 + 文件中实际使用的文件夹
    const dbFolders = dbAll(
      "SELECT name, parent_folder FROM knowledge_folders WHERE tenant_id = ? ORDER BY created_at",
      [req.user!.tenant_id]
    );
    const fileFolders = dbAll(
      "SELECT DISTINCT folder FROM knowledge_files WHERE tenant_id = ? AND folder != '/'",
      [req.user!.tenant_id]
    );

    const folderSet = new Set<string>();
    folderSet.add("/");
    for (const f of dbFolders as any[]) {
      const full = f.parent_folder === "/" ? `/${f.name}` : `${f.parent_folder}/${f.name}`;
      folderSet.add(full);
    }
    for (const f of fileFolders as any[]) {
      folderSet.add((f as any).folder);
    }

    res.json({ success: true, data: Array.from(folderSet).sort() });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 新建文件夹
knowledgeRoutes.post("/files/folder", (req: AuthRequest, res) => {
  try {
    const { name, parent } = req.body;
    if (typeof name !== "string" || !name.trim() || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      return res.status(400).json({ success: false, error: "文件夹名称无效" });
    }

    const parentFolder = normalizeFolder(parent || "/");
    if (!parentFolder) return res.status(400).json({ success: false, error: "父文件夹路径无效" });
    // 检查是否已存在
    const existing = dbGet(
      "SELECT id FROM knowledge_folders WHERE tenant_id = ? AND parent_folder = ? AND name = ?",
      [req.user!.tenant_id, parentFolder, name]
    );
    if (existing) return res.json({ success: true, data: { folder: parentFolder === "/" ? `/${name}` : `${parentFolder}/${name}` } });

    dbRun(
      "INSERT INTO knowledge_folders (tenant_id, name, parent_folder) VALUES (?, ?, ?)",
      [req.user!.tenant_id, name, parentFolder]
    );
    const fullPath = parentFolder === "/" ? `/${name}` : `${parentFolder}/${name}`;
    res.json({ success: true, data: { folder: fullPath } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除文件夹
knowledgeRoutes.delete("/files/folder", (req: AuthRequest, res) => {
  try {
    const { folder } = req.body;
    const normalizedFolder = normalizeFolder(folder);
    if (!normalizedFolder || normalizedFolder === "/") return res.status(400).json({ success: false, error: "不能删除根目录或路径无效" });

    // 提取文件夹名
    const parts = normalizedFolder.split("/").filter(Boolean);
    const name = parts.pop() || "";
    const parent = "/" + parts.join("/") || "/";

    dbRun("DELETE FROM knowledge_folders WHERE tenant_id = ? AND parent_folder = ? AND name = ?",
      [req.user!.tenant_id, parent, name]);
    // 将文件夹内文件移到根目录
    dbRun("UPDATE knowledge_files SET folder = '/' WHERE tenant_id = ? AND folder = ?",
      [req.user!.tenant_id, normalizedFolder]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 移动文件
knowledgeRoutes.put("/files/:id/move", (req: AuthRequest, res) => {
  try {
    const { folder } = req.body;
    const normalizedFolder = normalizeFolder(folder);
    if (!normalizedFolder) return res.status(400).json({ success: false, error: "目标文件夹路径无效" });
    dbRun("UPDATE knowledge_files SET folder = ? WHERE id = ? AND tenant_id = ?",
      [normalizedFolder, req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 语料库检索 =====
knowledgeRoutes.get("/corpus/search", (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });

    const tid = req.user!.tenant_id;
    // 搜索已解析文件内容和笔记
    const results = dbAll(
      `SELECT 'file' as source_type, id, name as title, extracted_summary as snippet, file_type, parsed_at as created_at
       FROM knowledge_files WHERE tenant_id = ? AND status = 'parsed' AND (content_extracted LIKE ? OR extracted_summary LIKE ? OR keywords LIKE ?)
       UNION ALL
       SELECT 'note' as source_type, id, title, substr(content, 1, 200) as snippet, 'text' as file_type, created_at
       FROM knowledge_notes WHERE tenant_id = ? AND (title LIKE ? OR content LIKE ?)
       ORDER BY created_at DESC LIMIT 20`,
      [tid, `%${q}%`, `%${q}%`, `%${q}%`, tid, `%${q}%`, `%${q}%`]
    );
    res.json({ success: true, data: results });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 智能编码读取 =====
function readFileSmart(filePath: string): string {
  const buf = fs.readFileSync(filePath);

  // BOM 检测
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return iconv.decode(buf.slice(3), "utf-8");
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return iconv.decode(buf.slice(2), "utf-16le");
  }

  // 尝试多种常见中文编码
  const encodings = ["utf-8", "gbk", "gb2312", "gb18030"];
  let bestText = "";
  let bestScore = -1;

  for (const enc of encodings) {
    try {
      const text = iconv.decode(buf, enc);
      // 计分：中文字符密度 + 无替换字符
      let cjk = 0;
      let ff = 0;
      for (let i = 0; i < Math.min(text.length, 2000); i++) {
        const code = text.charCodeAt(i);
        if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) cjk++;
        if (code === 0xFFFD) ff++;
      }
      const score = cjk - ff * 5; // 替换字符严重扣分
      if (score > bestScore) { bestScore = score; bestText = text; }
    } catch { /* skip unsupported */ }
  }

  return bestText || buf.toString("utf-8");
}

// ===== AI解析引擎 =====

function extractKeywords(text: string): string {
  const stopWords = new Set(["的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这"]);
  const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ").split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) { freq[w] = (freq[w] || 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]).join(",");
}
