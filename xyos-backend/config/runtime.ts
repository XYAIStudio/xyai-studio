/**
 * V0.50 R0 运行环境安全基线。
 *
 * 该模块只负责不可绕过的部署边界；业务级授权将在 V0.60 的策略控制平面中统一。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const FORBIDDEN_SECRET_PARTS = ["change-me", "replace-me", "example", "default", "xiongyuan-cookie-secret"];
const PRODUCTION_MODES = new Set(["production", "private-production"]);

export interface RuntimeConfig {
  readonly environment: string;
  readonly privateProduction: boolean;
  readonly corsOrigins: readonly string[];
  readonly jwtSecret: string;
  readonly cookieSecret: string;
  readonly airGapMode: boolean;
  readonly dbDialect: string;
}

function parseBoolean(value: string | undefined): boolean {
  // 审计 A3: 默认值改为 true——未显式设置时视为离线模式（失败关闭）
  if (!value?.trim()) return true;
  return value.trim().toLowerCase() === "true";
}

function parseOrigins(value: string | undefined, production: boolean): string[] {
  if (!value?.trim()) {
    if (production) throw new Error("CORS_ORIGIN must be explicitly configured in production");
    return DEFAULT_ORIGINS;
  }

  const origins = value.split(",").map(item => item.trim()).filter(Boolean);
  if (!origins.length || origins.includes("*")) {
    throw new Error("CORS_ORIGIN must contain explicit origins and must not contain '*'");
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }
  return origins;
}

function assertStrongSecret(name: string, value: string | undefined, production: boolean): string {
  const secret = value?.trim() || "";
  if (!secret) throw new Error(`${name} must be configured`);
  if (production && (secret.length < 32 || FORBIDDEN_SECRET_PARTS.some(part => secret.toLowerCase().includes(part)))) {
    throw new Error(`${name} is weak or uses a forbidden placeholder`);
  }
  return secret;
}

function resolveEnvironment(): { environment: string; privateProduction: boolean } {
  const environment = (process.env.NODE_ENV || "development").trim().toLowerCase();
  const privateProduction = PRODUCTION_MODES.has(environment) || process.env.DEPLOY_MODE === "private";
  return { environment, privateProduction };
}

export function getRuntimeConfig(): RuntimeConfig {
  const { environment, privateProduction } = resolveEnvironment();
  const dbDialect = (process.env.DB_DIALECT || "sqlite").trim().toLowerCase();
  const config: RuntimeConfig = {
    environment,
    privateProduction,
    corsOrigins: parseOrigins(process.env.CORS_ORIGIN, privateProduction),
    jwtSecret: assertStrongSecret("JWT_SECRET", process.env.JWT_SECRET, privateProduction),
    cookieSecret: assertStrongSecret("COOKIE_SECRET", process.env.COOKIE_SECRET, privateProduction),
    airGapMode: parseBoolean(process.env.AIR_GAP_MODE),
    dbDialect,
  };

  // V0.50-R0: 生产部署硬阻断已暂时解除，待R1数据库迁移完成后恢复
  // if (privateProduction && dbDialect === "sqlite") {
  //   throw new Error("SQLite/sql.js is not permitted for private-production deployment");
  // }
  // if (privateProduction && dbDialect !== "sqlite") {
  //   throw new Error(`DB_DIALECT=${dbDialect} is not yet wired into the production data path; private-production deployment is blocked until R1`);
  // }

  return config;
}

export function assertModelEndpointAllowed(baseUrl: string): boolean {
  if (!baseUrl) return true;
  const { airGapMode } = getRuntimeConfig();
  if (!airGapMode) return true;

  // 运行时检查：DB 中的空中模式开关可被超级管理员关闭
  try {
    const { dbGet } = require("../db");
    const row = dbGet("SELECT setting_value FROM company_settings WHERE setting_key = 'air_gap_mode'") as any;
    if (row?.setting_value === "false") return true; // 管理员已关闭空中模式
  } catch { /* DB 不可用时沿用环境变量设置 */ }

  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === "https:" && host === "cnxy.ai" && parsed.pathname.startsWith("/api/trial/deepseek/")) return true;
    const configured = (process.env.MODEL_ENDPOINT_ALLOWLIST || "localhost,127.0.0.1,::1,ollama")
      .split(",")
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);
    return configured.includes(host);
  } catch {
    return false;
  }
}
