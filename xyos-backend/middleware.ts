import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { dbGet } from "./db";

// P0安全：JWT密钥必须从环境变量获取，不允许硬编码默认值
const configuredJwtSecret = process.env.JWT_SECRET;
if (!configuredJwtSecret) {
  console.error("[FATAL] JWT_SECRET 环境变量未设置，系统拒绝启动。请在 .env 中设置高强度随机密钥（至少32位）。");
  process.exit(1);
}
const JWT_SECRET: string = configuredJwtSecret;

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  role: string;
  tenant_id: number;
  department_id?: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const LOCAL_GUEST_SESSION_HEADER = "x-xyai-guest-session";
const GUEST_SESSION_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * A guest session is never a network identity.  It only scopes a local Studio
 * draft to one desktop browser profile, and is rejected from non-loopback
 * clients before any route can use it for ownership.
 */
export function readLocalGuestSession(req: Request): string | undefined {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return undefined;
  const origin = req.get("origin");
  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") return undefined;
    } catch {
      return undefined;
    }
  }
  const value = req.get(LOCAL_GUEST_SESSION_HEADER)?.trim() ?? "";
  return GUEST_SESSION_PATTERN.test(value) ? value : undefined;
}

/**
 * Attach a verified account when one is supplied, but do not make an account a
 * prerequisite for a route.  Guest-capable local routes use this to keep the
 * normal JWT and tenant checks intact for signed-in users.
 */
export function authenticateOptional(req: AuthRequest, res: Response, next: NextFunction) {
  // 优先 Authorization: Bearer 头；下载类 window.open 请求无法带自定义头，兼容 ?token= 查询参数
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (typeof req.query.token === "string" && req.query.token ? req.query.token : null);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as AuthUser;
    const tenant = dbGet("SELECT status FROM tenants WHERE id = ?", [decoded.tenant_id]) as { status?: string } | undefined;
    // 免费测试版注册创建的是 trial 租户。认证提供器同样允许 active / trial，
    // 这里必须保持一致，否则用户会出现“登录成功但所有业务接口立即 401”的首用死路。
    if (!tenant || !["active", "trial"].includes(tenant.status ?? "")) {
      return res.status(401).json({ success: false, error: "租户不可用或已停用" });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "登录已过期" });
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  return authenticateOptional(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "未登录" });
    }
    next();
  });
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ success: false, error: "需要超级管理员权限" });
  }
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.role || !["super_admin", "admin"].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: "需要管理员权限" });
  }
  next();
}
