/**
 * V0.60 R1 WP-603 PDP (Policy Decision Point) 接口定义
 *
 * 将当前 GovernanceEngine 的 RBAC 矩阵封装为统一决策接口，
 * 支持未来替换为 OPA/Casbin 等外部策略引擎。
 */

// ============================================================
// 核心类型
// ============================================================

export interface AccessRequest {
  /** 操作主体 */
  principal: {
    id: number;
    role: string;
    tenantId: number;
  };
  /** 操作类型（如 create_task, delete_file, read_chat） */
  action: string;
  /** 目标资源 */
  resource: {
    type: string;
    tenantId: number;
    ownerId?: number;
  };
  /** 可选上下文（时间窗口、IP、设备类型等 ABAC 属性预留） */
  context?: {
    ip?: string;
    timeOfDay?: number; // 0-23
    deviceType?: string;
  };
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  /** 建议的补救措施（如 "需要审批"、"需要 MFA"） */
  escalation?: string;
}

// ============================================================
// PDP 接口
// ============================================================

export interface PolicyDecisionPoint {
  /**
   * 评估访问请求。
   * 返回决策结果——允许/拒绝及原因。
   */
  canAccess(request: AccessRequest): Promise<AccessDecision>;

  /**
   * 批量评估（优化：一次查询多个决策）
   */
  canAccessBatch(requests: AccessRequest[]): Promise<AccessDecision[]>;
}

// ============================================================
// 默认 PDP 实现（内嵌 RBAC）
// 基于 h2a2a_permission_matrix 表
// ============================================================

import { dbGet } from "../db";

export class EmbeddedPDP implements PolicyDecisionPoint {
  async canAccess(request: AccessRequest): Promise<AccessDecision> {
    const { principal, action, resource } = request;

    // (1) 租户隔离是硬约束
    if (principal.tenantId !== resource.tenantId) {
      return { allowed: false, reason: "Cross-tenant access denied" };
    }

    // (2) 超级管理员可以访问一切
    if (principal.role === "super_admin") {
      return { allowed: true, reason: "super_admin" };
    }

    // (3) 查询 RBAC 矩阵
    const rule = dbGet(
      `SELECT * FROM h2a2a_permission_matrix
       WHERE tenant_id = ? AND role_level = (
         SELECT COALESCE(pl.level, 0) FROM position_levels pl
         INNER JOIN employees e ON e.position_level_id = pl.id
         INNER JOIN users u ON u.id = e.user_id
         WHERE u.id = ?
       )
       AND permission_type = ?
       AND (target_type = ? OR target_type = 'both')
       LIMIT 1`,
      [principal.tenantId, principal.id, action, resource.type]
    ) as any;

    if (!rule) {
      return { allowed: false, reason: `No matching permission rule for ${action} on ${resource.type}` };
    }

    return { allowed: true, reason: `Rule: ${rule.permission_type}` };
  }

  async canAccessBatch(requests: AccessRequest[]): Promise<AccessDecision[]> {
    // 简单实现：逐个评估
    return Promise.all(requests.map(req => this.canAccess(req)));
  }
}

// ============================================================
// PDP 工厂（策略引擎切换点）
// ============================================================

let defaultPDP: PolicyDecisionPoint = new EmbeddedPDP();

/**
 * 获取当前 PDP 实例（默认内嵌 RBAC，可被替换为 OPA/Casbin）
 */
export function getPDP(): PolicyDecisionPoint {
  return defaultPDP;
}

/**
 * 替换 PDP 实现（用于未来集成 OPA 或其他引擎）
 */
export function setPDP(pdp: PolicyDecisionPoint): void {
  defaultPDP = pdp;
}
