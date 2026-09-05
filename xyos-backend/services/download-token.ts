/**
 * V0.50 R0-P0-02 受控文件下载令牌服务
 *
 * 短期、可撤销的下载令牌，HMAC 签名。
 *
 * 令牌结构（JSON → Base64URL + HMAC-SHA256）：
 *   { fid, uid, tid, exp, ver }
 *
 * 撤权状态持久化到 users.token_version 和 tenants.token_version，
 * 服务重启后撤权状态不丢失。
 */

import crypto from "crypto";
import { getRuntimeConfig } from "../config/runtime";
import { dbGet, dbRun } from "../db";

const TOKEN_TTL_SECONDS = 5 * 60;

export interface DownloadTokenPayload {
  fid: number;
  uid: number;
  tid: number;
  exp: number;
  ver: number;
}

function getSigningKey(): string {
  const secret = getRuntimeConfig().jwtSecret;
  if (!secret || secret.length < 16) {
    throw new Error("[download-token] InternalError: signing key unavailable");
  }
  return `dt-${secret.slice(0, 32)}`;
}

/**
 * 从数据库读取用户+租户的当前令牌版本号（取较大者）
 */
function getCurrentTokenVersion(tenantId: number, userId: number): number {
  const user = dbGet(
    "SELECT token_version FROM users WHERE id = ?",
    [userId]
  ) as { token_version: number } | undefined;
  const tenant = dbGet(
    "SELECT token_version FROM tenants WHERE id = ?",
    [tenantId]
  ) as { token_version: number } | undefined;
  return Math.max(user?.token_version ?? 0, tenant?.token_version ?? 0);
}

export function generateDownloadToken(
  fileId: number,
  userId: number,
  tenantId: number
): string {
  const key = getSigningKey();
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const ver = getCurrentTokenVersion(tenantId, userId);

  const payload: DownloadTokenPayload = { fid: fileId, uid: userId, tid: tenantId, exp, ver };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", key).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [b64, sig] = parts;
    const key = getSigningKey();
    const expectedSig = crypto.createHmac("sha256", key).update(b64).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload: DownloadTokenPayload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf-8")
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    const currentVer = getCurrentTokenVersion(payload.tid, payload.uid);
    if (payload.ver < currentVer) return null;

    return payload;
  } catch {
    return null;
  }
}

/** 撤销指定用户令牌（递增用户级版本号，持久化到 DB） */
export function revokeUserTokens(tenantId: number, userId: number): void {
  dbRun("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
}

/** 撤销指定租户令牌（递增租户级版本号，持久化到 DB） */
export function revokeTenantTokens(tenantId: number): void {
  dbRun("UPDATE tenants SET token_version = token_version + 1 WHERE id = ?", [tenantId]);
}
