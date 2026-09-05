/**
 * 雄元智脑XYOS — 功能门禁（按套餐限额校验）
 *
 * 依据 tenants.max_users / max_ai_employees / max_tokens_monthly 校验业务动作。
 * 调用点：创建用户/邀请成员、创建 AI 员工、Token 用量入账前。
 * 返回 true = 放行；否则返回 { allowed:false, message }。
 */
import { getTenantSubscriptionStatus } from "./subscription";

export interface GateResult {
  allowed: boolean;
  message?: string;
}

/** 校验用户数限额（创建用户/邀请成员前调用）。 */
export function assertUserLimit(tenantId: number, extra = 0): GateResult {
  const s = getTenantSubscriptionStatus(tenantId);
  if (!s) return { allowed: true };
  if (s.max_users >= 0 && s.current_users + extra >= s.max_users) {
    return {
      allowed: false,
      message: `当前套餐（${s.plan_name}）用户数已达上限 ${s.max_users} 人，请升级套餐`,
    };
  }
  return { allowed: true };
}

/** 校验 AI 员工数限额（创建 AI 数字员工前调用）。 */
export function assertAiEmployeeLimit(tenantId: number, extra = 0): GateResult {
  const s = getTenantSubscriptionStatus(tenantId);
  if (!s) return { allowed: true };
  if (s.max_ai_employees >= 0 && s.current_ai_employees + extra >= s.max_ai_employees) {
    return {
      allowed: false,
      message: `当前套餐（${s.plan_name}）AI 员工数已达上限 ${s.max_ai_employees} 名，请升级套餐`,
    };
  }
  return { allowed: true };
}

/** 校验月度 Token 用量限额（AI 调用记账后调用）。返回是否超限（不阻断但告警）或阻断（超限拒绝）。 */
export function assertTokenLimit(tenantId: number, incoming = 0): GateResult {
  const s = getTenantSubscriptionStatus(tenantId);
  if (!s) return { allowed: true };
  if (s.max_tokens_monthly >= 0 && s.tokens_used + incoming > s.max_tokens_monthly) {
    return {
      allowed: false,
      message: `本月 Token 用量已达套餐上限（${s.max_tokens_monthly.toLocaleString()}），请升级套餐或等待下月重置`,
    };
  }
  return { allowed: true };
}

/** 套餐是否可用某功能（features_json 标记）。 */
export function planHasFeature(tenantId: number, feature: string): boolean {
  const s = getTenantSubscriptionStatus(tenantId);
  if (!s) return false;
  const plan = require("./subscription").getPlanBySlug(s.plan_slug);
  return Boolean(plan?.features?.[feature]);
}
