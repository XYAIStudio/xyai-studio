/**
 * V0.50 R0-P0-02 受控文件下载路由
 *
 * 统一文件下载入口：
 *   GET /api/files/:id/token        — 换取短期下载令牌（需认证）
 *   GET /api/files/:id/download     — 凭令牌下载文件（无需认证，令牌自验证）
 *
 * 知识文件、合同附件、聊天附件等统一通过此路由下载，
 * 取代直读物理路径的模式。
 */

import { Router } from "express";
import fs from "fs";
import path from "path";
import { dbGet } from "../db";
import { authenticate, AuthRequest } from "../middleware";
import {
  generateDownloadToken,
  verifyDownloadToken,
} from "../services/download-token";
import { logActivity } from "../services/notification";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOAD_DIR = path.resolve(__dirname, "..", "..", "uploads");

export const fileRoutes = Router();

/**
 * 安全解析存储文件路径（防止路径穿越）
 */
function resolveStoredFile(filePath: string, tenantId: number): string | null {
  const root = path.resolve(UPLOAD_DIR, "tenants", String(tenantId)) + path.sep;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(root) ? resolved : null;
}

/**
 * 安全下载文件名
 */
function safeDownloadName(name: string): string {
  return path.basename(name).replace(/[\r\n"]/g, "_") || "download";
}

/**
 * 可用文件类型映射表（扩展名 → MIME）
 * 用于覆盖 Express res.download 推导的 Content-Type，
 * 避免浏览器嗅探执行非预期类型。
 */
const SAFE_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
};

/**
 * POST /api/files/:id/token — 换取短期下载令牌
 * 认证用户获取文件记录的所有权验证后，签发 HMAC 令牌
 */
fileRoutes.post("/:id/token", authenticate, (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      return res.status(400).json({ success: false, error: "无效文件 ID" });
    }

    // 从知识文件表查询文件记录（可扩展为统一文件索引表）
    const file = dbGet(
      "SELECT * FROM knowledge_files WHERE id = ? AND tenant_id = ?",
      [fileId, req.user!.tenant_id]
    ) as any;

    if (!file) {
      return res.status(404).json({ success: false, error: "文件不存在或无访问权限" });
    }

    const token = generateDownloadToken(fileId, req.user!.id, req.user!.tenant_id);

    return res.json({
      success: true,
      token,
      expiresInSeconds: 5 * 60,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/files/:id/download — 凭短期令牌下载文件
 * 无需认证（令牌自验证），但必须携带有效 token 查询参数
 */
fileRoutes.get("/:id/download", (req: AuthRequest, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ success: false, error: "缺少下载令牌" });
    }

    // 验证令牌
    const payload = verifyDownloadToken(token);
    if (!payload) {
      return res.status(403).json({ success: false, error: "下载令牌无效或已过期" });
    }

    const fileId = parseInt(req.params.id);
    if (payload.fid !== fileId) {
      return res.status(403).json({ success: false, error: "令牌与文件不匹配" });
    }

    // 查询文件记录
    const file = dbGet(
      "SELECT * FROM knowledge_files WHERE id = ? AND tenant_id = ?",
      [fileId, payload.tid]
    ) as any;

    if (!file) {
      return res.status(404).json({ success: false, error: "文件不存在" });
    }

    // 安全解析存储路径
    const storedPath = resolveStoredFile(file.file_path || "", payload.tid);
    if (!storedPath || !fs.existsSync(storedPath)) {
      return res.status(404).json({ success: false, error: "文件内容不存在" });
    }

    // 审计日志
    logActivity({
      userId: payload.uid,
      action: "file_downloaded",
      entityType: "knowledge_file",
      entityId: fileId,
      tenantId: payload.tid,
    });

    // 安全响应头
    const ext = path.extname(file.original_name || file.name || "").toLowerCase();
    const contentType = SAFE_MIME[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeDownloadName(file.original_name || file.name))}"`);
    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");

    const readStream = fs.createReadStream(storedPath);
    readStream.pipe(res);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
