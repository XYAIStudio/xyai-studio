/**
 * V0.60 R1 WP-604 身份源抽象接口
 *
 * AuthProvider 定义了认证、令牌签发、令牌验证、令牌刷新的标准契约。
 * 当前实现：LTSProvider（本地凭据存储，email+password）
 * 预留实现：SSOProvider（OAuth/OIDC/SAML stub）、LDAPProvider
 */

import { dbGet, dbRun } from "../db";
import { getRuntimeConfig } from "../config/runtime";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// ============================================================
// 类型定义
// ============================================================

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 秒
}

export interface TokenClaims {
  id: number;
  email: string;
  nickname: string;
  role: string;
  tenant_id: number;
  department_id?: number;
  token_version?: number;
}

export interface AuthResult {
  success: boolean;
  user?: TokenClaims;
  tokens?: TokenPair;
  error?: string;
  code?: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "TENANT_SUSPENDED" | "TOKEN_EXPIRED";
}

// ============================================================
// AuthProvider 接口
// ============================================================

export interface AuthProvider {
  readonly name: string;

  /** 凭据认证，成功返回令牌对 */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;

  /** 验证 access token */
  validateAccessToken(token: string): Promise<AuthResult>;

  /** 使用 refresh token 刷新令牌对 */
  refreshAccessToken(refreshToken: string): Promise<AuthResult>;

  /** 撤销指定用户的所有令牌 */
  revokeUserTokens(userId: number): Promise<void>;
}

// ============================================================
// LTSProvider: 本地凭据存储实现
// ============================================================

const ACCESS_TOKEN_TTL = "1h";
const REFRESH_TOKEN_TTL = "24h";

export class LTSProvider implements AuthProvider {
  readonly name = "lts";

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const { email, password } = credentials;
    if (!email || !password) {
      return { success: false, error: "邮箱和密码必填", code: "INVALID_CREDENTIALS" };
    }

    const row = dbGet(
      `SELECT u.*, t.status as tenant_status
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = ?`,
      [email]
    ) as any;

    if (!row) {
      return { success: false, error: "邮箱或密码错误", code: "INVALID_CREDENTIALS" };
    }

    const valid = bcrypt.compareSync(password, row.password_hash);
    // V0.60 审计 AUTH-01: 登录性能非关键路径，保留 compareSync 避免阻塞策略变更
    // 未来迁移到 async compare 需要处理异常流。当前 bcrypt 成本因子默认 10，
    // 配合 login 10/min 限流，阻塞风险可控。
    if (!valid) {
      return { success: false, error: "邮箱或密码错误", code: "INVALID_CREDENTIALS" };
    }

    if (row.tenant_status !== "active" && row.tenant_status !== "trial") {
      return { success: false, error: "租户已停用", code: "TENANT_SUSPENDED" };
    }

    // 更新最后登录时间
    dbRun("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);

    const user: TokenClaims = {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      role: row.role,
      tenant_id: row.tenant_id,
      token_version: row.token_version ?? 0,
    };

    const tokens = this.issueTokens(user);

    return { success: true, user, tokens };
  }

  async validateAccessToken(token: string): Promise<AuthResult> {
    try {
      const secret = getRuntimeConfig().jwtSecret;
      const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenClaims;

      // 检查用户/租户状态
      const principal = dbGet(
        `SELECT u.id, u.nickname, u.role, u.tenant_id, u.token_version, t.status as tenant_status
         FROM users u INNER JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = ?`,
        [decoded.id]
      ) as any;

      if (!principal || (principal.tenant_status !== "active" && principal.tenant_status !== "trial")) {
        return { success: false, error: "账户或租户已停用", code: "ACCOUNT_LOCKED" };
      }

      // 令牌版本号校验——如果用户的 token_version 大于令牌中的值，说明令牌已撤销
      if (principal.token_version > (decoded.token_version ?? 0)) {
        return { success: false, error: "令牌已撤销", code: "TOKEN_EXPIRED" };
      }

      return {
        success: true,
        user: {
          id: decoded.id,
          email: decoded.email,
          nickname: principal.nickname,
          role: principal.role,
          tenant_id: decoded.tenant_id,
          department_id: decoded.department_id,
          token_version: principal.token_version,
        },
      };
    } catch {
      return { success: false, error: "令牌无效或已过期", code: "TOKEN_EXPIRED" };
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    try {
      const secret = getRuntimeConfig().jwtSecret;
      const decoded = jwt.verify(refreshToken, secret, { algorithms: ["HS256"] }) as any;

      if (decoded.type !== "refresh") {
        return { success: false, error: "非法的刷新令牌", code: "TOKEN_EXPIRED" };
      }

      // 验证用户仍然活跃
      const principal = dbGet(
        `SELECT u.id, u.nickname, u.role, u.tenant_id, u.token_version, t.status as tenant_status
         FROM users u INNER JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = ?`,
        [decoded.id]
      ) as any;

      if (!principal || (principal.tenant_status !== "active" && principal.tenant_status !== "trial")) {
        return { success: false, error: "账户已停用", code: "ACCOUNT_LOCKED" };
      }

      if (principal.token_version > (decoded.token_version ?? 0)) {
        return { success: false, error: "令牌已撤销", code: "TOKEN_EXPIRED" };
      }

      const user: TokenClaims = {
        id: decoded.id,
        email: decoded.email,
        nickname: principal.nickname,
        role: principal.role,
        tenant_id: principal.tenant_id,
        token_version: principal.token_version,
      };

      const tokens = this.issueTokens(user);

      return { success: true, user, tokens };
    } catch {
      return { success: false, error: "刷新令牌无效或已过期", code: "TOKEN_EXPIRED" };
    }
  }

  async revokeUserTokens(userId: number): Promise<void> {
    dbRun("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
  }

  // ── 内部方法 ──

  private issueTokens(user: TokenClaims): TokenPair {
    const secret = getRuntimeConfig().jwtSecret;

    // Access token: 1 小时
    const accessToken = jwt.sign(
      { ...user },
      secret,
      { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL }
    );

    // Refresh token: 24 小时
    const refreshToken = jwt.sign(
      { id: user.id, type: "refresh", token_version: user.token_version ?? 0 },
      secret,
      { algorithm: "HS256", expiresIn: REFRESH_TOKEN_TTL }
    );

    return { accessToken, refreshToken, expiresIn: 3600 };
  }
}

// ============================================================
// AuthProvider 工厂
// ============================================================

let currentProvider: AuthProvider = new LTSProvider();

export function getAuthProvider(): AuthProvider {
  return currentProvider;
}

export function setAuthProvider(provider: AuthProvider): void {
  currentProvider = provider;
}
