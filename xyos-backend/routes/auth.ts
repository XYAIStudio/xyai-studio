/**
 * V0.60 R1 认证路由 — 通过 AuthProvider 接口实现
 */

import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { LTSProvider, getAuthProvider } from "../services/auth-provider";
import { dbGet, dbRun } from "../db";
import { createTenant } from "../services/tenant";
import bcrypt from "bcryptjs";

export const authRoutes = Router();

// POST /register — 用户注册（SaaS：自动创建专属租户，免费版 + 14 天试用，注册人为租户管理员）
authRoutes.post("/register", async (req, res) => {
  try {
    if (process.env.PUBLIC_REGISTRATION_ENABLED !== "true") {
      return res.status(403).json({ success: false, error: "公开注册已关闭，请使用管理员邀请或桌面端本地注册入口" });
    }
    const { email, password, nickname, company } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "邮箱和密码必填" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "密码至少6位" });
    }

    const existing = dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(409).json({ success: false, error: "该邮箱已注册" });
    }

    // 创建专属租户（免费版、14 天试用期）
    const displayName = nickname || email.split("@")[0];
    const tenant = createTenant({
      name: company || `${displayName}的组织`,
      plan: "free",
    });

    const hash = bcrypt.hashSync(password, 10);
    dbRun(
      "INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, 'admin', ?)",
      [email, hash, displayName, tenant.id]
    );

    // 自动登录
    const provider = getAuthProvider();
    const result = await provider.authenticate({ email, password });
    if (!result.success) {
      return res.status(500).json({ success: false, error: "注册成功但登录失败，请手动登录" });
    }

    res.json({ success: true, data: { user: result.user, tokens: result.tokens, tenant } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /login — 凭据认证 → access + refresh token
authRoutes.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const provider = getAuthProvider();
    const result = await provider.authenticate({ email, password });

    if (!result.success) {
      const status = result.code === "TENANT_SUSPENDED" ? 403 : 401;
      return res.status(status).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /refresh — 刷新令牌对
authRoutes.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: "refreshToken 必填" });
    }

    const provider = getAuthProvider();
    const result = await provider.refreshAccessToken(refreshToken);

    if (!result.success) {
      return res.status(401).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: { tokens: result.tokens } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// GET /me — 当前用户信息
authRoutes.get("/me", authenticate, (req: AuthRequest, res) => {
  const user = dbGet("SELECT id, email, nickname, role, tenant_id FROM users WHERE id = ?", [req.user!.id]);
  if (!user) return res.status(404).json({ success: false, error: "用户不存在" });
  res.json({ success: true, data: user });
});

// POST /revoke — 撤销当前用户的所有令牌（需认证）
authRoutes.post("/revoke", authenticate, async (req: AuthRequest, res) => {
  try {
    const provider = getAuthProvider();
    await provider.revokeUserTokens(req.user!.id);
    res.json({ success: true, message: "令牌已撤销" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});
