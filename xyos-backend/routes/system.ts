/**
 * V1.0 H2A2A2H 迭代接口 — 版本 / Feature Flags / 治理规则可视化
 *
 * GET /api/system/version      版本 + feature flags + 启用模块
 * GET /api/system/governance   治理规则全景（四级授权 + 敏感清单 + 错误码 + 矩阵统计）
 * GET /api/system/h2a2a2h      状态机全景（12 态 + 转换表 + 看门狗配置）
 */
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbGet, dbAll } from "../db";
import { CURRENT_VERSION } from "../config/version";
import { FEATURE_FLAGS, getEnabledModules, getFeatureVersion } from "../config/features";
import { SENSITIVE_ACTION_REGISTRY, AUTHZ_LEVEL_LABEL } from "../services/authorization";
import { ALL_XYOS_ERROR_CODES } from "../services/error-taxonomy";
import { H2A2A2H_STATES, isValidTransition, runWatchdog } from "../services/h2a2a2h-state-machine";

export const systemRoutes = Router();
systemRoutes.use(authenticate);

// ── 版本 + Feature Flags ──
systemRoutes.get("/version", (req: AuthRequest, res) => {
  const featureFlags = Object.entries(FEATURE_FLAGS).map(([key, value]) => ({ key, value }));
  res.json({
    success: true,
    data: {
      version: CURRENT_VERSION,
      featureVersion: getFeatureVersion(),
      enabledModules: getEnabledModules(),
      featureFlags,
      governance: {
        hitl: FEATURE_FLAGS.ENABLE_HUMAN_IN_THE_LOOP,
        governanceOrchestration: FEATURE_FLAGS.ENABLE_GOVERNANCE_ORCHESTRATION,
      },
    },
  });
});

// ── 治理规则全景（可视化）──
systemRoutes.get("/governance", (req: AuthRequest, res) => {
  const tenantId = req.user!.tenant_id;
  const permCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_permission_matrix WHERE tenant_id = ?", [tenantId])?.c ?? 0;
  const commCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_comm_rules WHERE tenant_id = ?", [tenantId])?.c ?? 0;
  const tplCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_process_templates WHERE tenant_id = ?", [tenantId])?.c ?? 0;
  const pendingReviewCount = dbGet("SELECT COUNT(*) as c FROM pending_reviews WHERE tenant_id = ? AND status = 'pending'", [tenantId])?.c ?? 0;
  const auditCount = dbGet("SELECT COUNT(*) as c FROM h2a2a_governance_log WHERE tenant_id = ?", [tenantId])?.c ?? 0;

  res.json({
    success: true,
    data: {
      authorizationLevels: Object.entries(AUTHZ_LEVEL_LABEL).map(([level, label]) => ({ level: Number(level), label })),
      sensitiveActionRegistry: SENSITIVE_ACTION_REGISTRY.map(c => ({
        category: c.category,
        level: c.level,
        levelLabel: AUTHZ_LEVEL_LABEL[c.level],
        keywordCount: c.keywords.length,
      })),
      errorCodes: ALL_XYOS_ERROR_CODES,
      counts: { permissionMatrix: permCount, commRules: commCount, processTemplates: tplCount, pendingReviews: pendingReviewCount, auditLogs: auditCount },
      matrix: dbAll("SELECT role_level, permission_type, scope, target_type FROM h2a2a_permission_matrix WHERE tenant_id = ? ORDER BY role_level, permission_type", [tenantId]),
      commRules: dbAll("SELECT sender_level, receiver_level, comm_type, is_allowed, require_approval, approval_level FROM h2a2a_comm_rules WHERE tenant_id = ? ORDER BY sender_level, receiver_level", [tenantId]),
    },
  });
});

// ── 状态机全景（12 态 + 转换表）──
systemRoutes.get("/h2a2a2h", (_req: AuthRequest, res) => {
  const transitions = H2A2A2H_STATES.map(from => ({
    from,
    to: H2A2A2H_STATES.filter(to => isValidTransition(from, to)),
  }));
  res.json({
    success: true,
    data: {
      states: H2A2A2H_STATES,
      transitions,
      watchdog: "已启用（created 30m / claimed 1h / executing 1h / submitted 30m / reviewing 24h）",
    },
  });
});

// ── 手动触发看门狗巡检（管理员诊断用）──
systemRoutes.post("/h2a2a2h/watchdog", (req: AuthRequest, res) => {
  if (req.user!.role !== "super_admin" && req.user!.role !== "admin") {
    return res.status(403).json({ success: false, error: "仅管理员可触发看门狗" });
  }
  const timedOut = runWatchdog();
  res.json({ success: true, data: { timedOutIds: timedOut } });
});
