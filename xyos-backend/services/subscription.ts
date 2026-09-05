/**
 * 雄元智脑XYOS — SaaS 订阅服务
 *
 * 套餐（plans 表）→ 订阅（subscriptions 表）→ 租户限额（tenants.plan/max_*）。
 * 支持：订阅/升级/续费、取消（到期不续）、超管人工开通（对公转账）、到期自动降级。
 */
import { dbGet, dbAll, dbRun } from "../db";

export interface PlanInfo {
  id: number;
  name: string;
  slug: string;
  price_monthly: number;
  max_users: number;
  max_ai_employees: number;
  max_tokens_monthly: number;
  features: Record<string, unknown>;
}

export interface SubscriptionInfo {
  id: string;
  tenant_id: number;
  plan_slug: string;
  plan_name: string;
  amount: number;
  months: number;
  status: string;
  payment_method: string;
  period_start: string | null;
  period_end: string | null;
  note: string | null;
  created_at: string;
}

/** 当前租户的订阅状态（含套餐与限额）。 */
export interface TenantSubscriptionStatus {
  tenant_id: number;
  plan_slug: string;
  plan_name: string;
  status: string;                 // trial / active / expired
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  max_users: number;
  max_ai_employees: number;
  max_tokens_monthly: number;
  current_users: number;
  current_ai_employees: number;
  tokens_used: number;
}

function parseFeatures(featuresJson: string): Record<string, unknown> {
  try { return JSON.parse(featuresJson || "{}"); } catch { return {}; }
}

export function listPlans(): PlanInfo[] {
  return (dbAll("SELECT * FROM plans ORDER BY price_monthly ASC") as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    price_monthly: r.price_monthly,
    max_users: r.max_users,
    max_ai_employees: r.max_ai_employees,
    max_tokens_monthly: r.max_tokens_monthly,
    features: parseFeatures(r.features_json),
  }));
}

export function getPlanBySlug(slug: string): PlanInfo | undefined {
  const row = dbGet("SELECT * FROM plans WHERE slug = ?", [slug]) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price_monthly: row.price_monthly,
    max_users: row.max_users,
    max_ai_employees: row.max_ai_employees,
    max_tokens_monthly: row.max_tokens_monthly,
    features: parseFeatures(row.features_json),
  };
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function addMonths(from: Date, months: number): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 统计租户当前用户 / AI 员工 / Token 用量。 */
export function getTenantUsageStats(tenantId: number): { users: number; aiEmployees: number; tokens: number } {
  const users = (dbGet("SELECT COUNT(*) as c FROM users WHERE tenant_id = ?", [tenantId]) as any)?.c ?? 0;
  const ai = (dbGet(
    "SELECT COUNT(*) as c FROM employees WHERE tenant_id = ? AND employee_type = 'ai'",
    [tenantId]
  ) as any)?.c ?? 0;
  const tokens = (dbGet(
    "SELECT COALESCE(SUM(amount),0) as t FROM tenant_usage WHERE tenant_id = ? AND usage_type = 'tokens'",
    [tenantId]
  ) as any)?.t ?? 0;
  return { users, aiEmployees: ai, tokens };
}

/** 读取租户当前订阅状态。 */
export function getTenantSubscriptionStatus(tenantId: number): TenantSubscriptionStatus | undefined {
  const t = dbGet("SELECT * FROM tenants WHERE id = ?", [tenantId]) as any;
  if (!t) return undefined;
  const plan = getPlanBySlug(t.plan || "free");
  const usage = getTenantUsageStats(tenantId);
  const now = new Date().toISOString();
  let status = t.status || "trial";
  if (t.subscription_ends_at && t.subscription_ends_at < now) status = "expired";
  return {
    tenant_id: tenantId,
    plan_slug: t.plan || "free",
    plan_name: plan?.name ?? t.plan ?? "free",
    status,
    trial_ends_at: t.trial_ends_at || null,
    subscription_ends_at: t.subscription_ends_at || null,
    max_users: t.max_users ?? plan?.max_users ?? 5,
    max_ai_employees: t.max_ai_employees ?? plan?.max_ai_employees ?? 10,
    max_tokens_monthly: t.max_tokens_monthly ?? plan?.max_tokens_monthly ?? 1000000,
    current_users: usage.users,
    current_ai_employees: usage.aiEmployees,
    tokens_used: usage.tokens,
  };
}

/** 把套餐限额应用到租户（tenants.max_* 与 plan 字段）。 */
export function applyPlanToTenant(tenantId: number, plan: PlanInfo, endsAt: string | null): void {
  dbRun(
    `UPDATE tenants SET plan = ?, max_users = ?, max_ai_employees = ?, max_tokens_monthly = ?, subscription_ends_at = ?, updated_at = ? WHERE id = ?`,
    [plan.slug, plan.max_users, plan.max_ai_employees, plan.max_tokens_monthly, endsAt, new Date().toISOString(), tenantId]
  );
}

/**
 * 创建/升级订阅（租户侧发起；真实支付前走"申请中"，超管确认收款后开通）。
 * mode: 'activate' 立即生效（超管确认收款后调用）
 */
export function createSubscription(opts: {
  tenantId: number;
  planSlug: string;
  months: number;
  paymentMethod?: string;
  createdBy?: number;
  note?: string;
  activate: boolean;
}): SubscriptionInfo {
  const plan = getPlanBySlug(opts.planSlug);
  if (!plan) throw new Error(`未知套餐: ${opts.planSlug}`);
  const months = Math.max(1, Math.min(36, Math.floor(opts.months || 1)));
  const amount = plan.price_monthly * months;
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  // 续费/升级：从当前到期日顺延，否则从现在起算
  const current = dbGet("SELECT subscription_ends_at FROM tenants WHERE id = ?", [opts.tenantId]) as any;
  let start = now;
  if (opts.activate && current?.subscription_ends_at && new Date(current.subscription_ends_at) > now) {
    start = new Date(current.subscription_ends_at);
  }
  const periodStart = start.toISOString().slice(0, 19).replace("T", " ");
  const periodEnd = addMonths(start, months);

  dbRun(
    `INSERT INTO subscriptions (id, tenant_id, plan_slug, plan_name, amount, months, status, payment_method, period_start, period_end, created_by, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, opts.tenantId, plan.slug, plan.name, amount, months, opts.activate ? "active" : "pending",
     opts.paymentMethod || "transfer", periodStart, periodEnd, opts.createdBy ?? null, opts.note ?? null]
  );

  if (opts.activate) {
    applyPlanToTenant(opts.tenantId, plan, periodEnd);
  }
  const row = dbGet("SELECT * FROM subscriptions WHERE id = ?", [id]) as any;
  return rowToSubscription(row);
}

/** 超管确认收款并开通（对公转账模式）：把 pending 订阅激活并应用套餐。 */
export function activateSubscription(subId: string, operatorId: number): SubscriptionInfo {
  const sub = dbGet("SELECT * FROM subscriptions WHERE id = ?", [subId]) as any;
  if (!sub) throw new Error("订阅记录不存在");
  const plan = getPlanBySlug(sub.plan_slug);
  if (!plan) throw new Error("套餐不存在");
  dbRun(`UPDATE subscriptions SET status = 'active', note = ? WHERE id = ?`, [`已确认收款（操作员 #${operatorId}）`, subId]);
  applyPlanToTenant(sub.tenant_id, plan, sub.period_end);
  const row = dbGet("SELECT * FROM subscriptions WHERE id = ?", [subId]) as any;
  return rowToSubscription(row);
}

/** 取消订阅：到期后不续费（当前周期仍有效）。 */
export function cancelSubscription(tenantId: number, subId: string): void {
  dbRun(`UPDATE subscriptions SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`, [subId, tenantId]);
}

/** 到期检查：subscription_ends_at 已过的租户降级为免费版。 */
export function checkExpiredSubscriptions(): number {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const expired = dbAll(
    `SELECT id FROM tenants WHERE plan != 'free' AND subscription_ends_at IS NOT NULL AND subscription_ends_at < ?`,
    [now]
  ) as any[];
  for (const t of expired) {
    const free = getPlanBySlug("free");
    if (free) applyPlanToTenant(t.id, free, null);
  }
  if (expired.length) {
    dbRun(`UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND period_end < ?`, [now]);
  }
  return expired.length;
}

export function listSubscriptions(tenantId?: number, limit = 100): SubscriptionInfo[] {
  const rows = tenantId
    ? dbAll("SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?", [tenantId, limit])
    : dbAll("SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT ?", [limit]);
  return (rows as any[]).map(rowToSubscription);
}

function rowToSubscription(row: any): SubscriptionInfo {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_slug: row.plan_slug,
    plan_name: row.plan_name,
    amount: row.amount,
    months: row.months,
    status: row.status,
    payment_method: row.payment_method,
    period_start: row.period_start,
    period_end: row.period_end,
    note: row.note,
    created_at: row.created_at,
  };
}
