/**
 * V0.50 R0-P0-04 WebSocket 短期票据路由
 *
 * POST /api/ws/ticket  — 用 auth JWT 换取 5 分钟有效的 WS 连接票据
 *
 * 撤权状态持久化到 users.token_version 和 tenants.token_version，
 * 服务重启后撤权状态不丢失。
 */

import { Router } from "express";
import crypto from "crypto";
import { authenticate, AuthRequest } from "../middleware";
import { getRuntimeConfig } from "../config/runtime";
import { dbGet, dbRun } from "../db";

const WS_TICKET_TTL_SECONDS = 5 * 60;

export const wsTicketRoutes = Router();

// ── 版本号读写（DB 持久化） ──

function getWsVersion(tid: number, uid: number): number {
  const user = dbGet("SELECT token_version FROM users WHERE id = ?", [uid]) as { token_version: number } | undefined;
  const tenant = dbGet("SELECT token_version FROM tenants WHERE id = ?", [tid]) as { token_version: number } | undefined;
  return Math.max(user?.token_version ?? 0, tenant?.token_version ?? 0);
}

export function generateWsTicket(userId: number, tenantId: number): string {
  const secret = getRuntimeConfig().jwtSecret;
  const key = `ws-${secret.slice(0, 32)}`;

  const payload = {
    uid: userId,
    tid: tenantId,
    exp: Math.floor(Date.now() / 1000) + WS_TICKET_TTL_SECONDS,
    ver: getWsVersion(tenantId, userId),
  };

  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", key).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyWsTicket(ticket: string): {
  uid: number; tid: number; exp: number; ver: number;
} | null {
  try {
    const parts = ticket.split(".");
    if (parts.length !== 2) return null;

    const [b64, sig] = parts;
    const secret = getRuntimeConfig().jwtSecret;
    const key = `ws-${secret.slice(0, 32)}`;

    const expectedSig = crypto.createHmac("sha256", key).update(b64).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    const currentVer = getWsVersion(payload.tid, payload.uid);
    if (payload.ver < currentVer) return null;

    return payload;
  } catch {
    return null;
  }
}

/** 撤销指定用户 WS 票据（持久化） */
export function revokeUserWsTicket(tenantId: number, userId: number): void {
  dbRun("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
}

/** 撤销指定租户 WS 票据（持久化） */
export function revokeTenantWsTicket(tenantId: number): void {
  dbRun("UPDATE tenants SET token_version = token_version + 1 WHERE id = ?", [tenantId]);
}

// ── 路由 ──

wsTicketRoutes.post("/ticket", authenticate, (req: AuthRequest, res) => {
  try {
    const ticket = generateWsTicket(req.user!.id, req.user!.tenant_id);
    return res.json({
      success: true,
      ticket,
      expiresInSeconds: WS_TICKET_TTL_SECONDS,
      endpoint: `${req.protocol === "https" ? "wss" : "ws"}://${req.get("host")}/ws`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
