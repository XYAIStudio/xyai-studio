import { dbGet, dbAll, dbRun } from "../db";

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  tenant_code: string;
  logo_url: string;
  theme_color: string;
  domain: string;
  status: string;
  plan: string;
  trial_ends_at: string;
  subscription_ends_at: string;
  max_users: number;
  max_ai_employees: number;
  max_tokens_monthly: number;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  id: number;
  tenant_id: number;
  user_id: number;
  role: string;
  invited_by: number;
  joined_at: string;
}

// 生成租户码（2-8位大写字母）
export function generateTenantCode(name: string): string {
  // 从名称中提取字母
  const cleaned = name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '');
  
  // 中文名映射
  const codeMap: Record<string, string> = {
    '雄元': 'XY',
    '测试': 'TEST',
    '演示': 'DEMO',
  };
  
  for (const [key, code] of Object.entries(codeMap)) {
    if (name.includes(key)) return code;
  }
  
  // 英文名取前2-4位
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.substring(0, Math.min(4, letters.length));
  
  // 兜底
  return 'T' + String(Date.now()).slice(-4);
}

// 生成slug（URL友好标识）
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 32);
}

// 创建租户
export function createTenant(data: {
  name: string;
  slug?: string;
  tenant_code?: string;
  plan?: string;
}): Tenant {
  const slug = data.slug || generateSlug(data.name);
  const tenantCode = data.tenant_code || generateTenantCode(data.name);
  const plan = data.plan || 'free';
  
  // 获取套餐配置
  const planConfig = dbGet("SELECT * FROM plans WHERE slug = ?", [plan]) as any;
  
  const result = dbRun(
    `INSERT INTO tenants (name, slug, tenant_code, status, plan, max_users, max_ai_employees, max_tokens_monthly, trial_ends_at)
     VALUES (?, ?, ?, 'trial', ?, ?, ?, ?, datetime('now', '+14 days'))`,
    [
      data.name,
      slug,
      tenantCode,
      plan,
      planConfig?.max_users || 5,
      planConfig?.max_ai_employees || 10,
      planConfig?.max_tokens_monthly || 1000000,
    ]
  );
  
  return dbGet("SELECT * FROM tenants WHERE id = ?", [result.lastInsertRowid]) as Tenant;
}

// 获取租户列表
export function getTenants(status?: string): Tenant[] {
  if (status) {
    return dbAll("SELECT * FROM tenants WHERE status = ? ORDER BY created_at DESC", [status]) as Tenant[];
  }
  return dbAll("SELECT * FROM tenants ORDER BY created_at DESC") as Tenant[];
}

// 获取单个租户
export function getTenant(id: number): Tenant | undefined {
  return dbGet("SELECT * FROM tenants WHERE id = ?", [id]) as Tenant | undefined;
}

// 获取租户by code
export function getTenantByCode(code: string): Tenant | undefined {
  return dbGet("SELECT * FROM tenants WHERE tenant_code = ?", [code]) as Tenant | undefined;
}

// 更新租户
export function updateTenant(id: number, data: Partial<Tenant>): void {
  const updates: string[] = [];
  const params: any[] = [];
  
  if (data.name) { updates.push("name = ?"); params.push(data.name); }
  if (data.logo_url) { updates.push("logo_url = ?"); params.push(data.logo_url); }
  if (data.theme_color) { updates.push("theme_color = ?"); params.push(data.theme_color); }
  if (data.domain) { updates.push("domain = ?"); params.push(data.domain); }
  if (data.status) { updates.push("status = ?"); params.push(data.status); }
  if (data.plan) { updates.push("plan = ?"); params.push(data.plan); }
  if (data.settings_json) { updates.push("settings_json = ?"); params.push(data.settings_json); }
  
  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    dbRun(`UPDATE tenants SET ${updates.join(", ")} WHERE id = ?`, params);
  }
}

// 删除租户
export function deleteTenant(id: number): void {
  dbRun("DELETE FROM tenant_members WHERE tenant_id = ?", [id]);
  dbRun("DELETE FROM tenant_invitations WHERE tenant_id = ?", [id]);
  dbRun("DELETE FROM tenant_usage WHERE tenant_id = ?", [id]);
  dbRun("DELETE FROM tenants WHERE id = ?", [id]);
}

// 暂停租户
export function suspendTenant(id: number): void {
  dbRun("UPDATE tenants SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

// 激活租户
export function activateTenant(id: number): void {
  dbRun("UPDATE tenants SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

// 添加租户成员
export function addTenantMember(tenantId: number, userId: number, role: string = 'member', invitedBy?: number): void {
  dbRun(
    "INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)",
    [tenantId, userId, role, invitedBy || null]
  );
}

// 移除租户成员
export function removeTenantMember(tenantId: number, userId: number): void {
  dbRun("DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?", [tenantId, userId]);
}

// 获取租户成员
export function getTenantMembers(tenantId: number): any[] {
  return dbAll(
    `SELECT tm.*, u.email, u.nickname, u.role as user_role
     FROM tenant_members tm
     LEFT JOIN users u ON tm.user_id = u.id
     WHERE tm.tenant_id = ?
     ORDER BY tm.joined_at`,
    [tenantId]
  );
}

// 更新成员角色
export function updateMemberRole(tenantId: number, userId: number, role: string): void {
  dbRun("UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?", [role, tenantId, userId]);
}

// 检查用户是否是租户成员
export function isTenantMember(tenantId: number, userId: number): boolean {
  const member = dbGet("SELECT id FROM tenant_members WHERE tenant_id = ? AND user_id = ?", [tenantId, userId]);
  return !!member;
}

// 获取用户所属租户
export function getUserTenants(userId: number): Tenant[] {
  return dbAll(
    `SELECT t.* FROM tenants t
     INNER JOIN tenant_members tm ON t.id = tm.tenant_id
     WHERE tm.user_id = ?
     ORDER BY tm.joined_at`,
    [userId]
  ) as Tenant[];
}

// 记录用量
export function recordUsage(tenantId: number, usageType: string, amount: number): void {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  dbRun(
    `INSERT INTO tenant_usage (tenant_id, usage_type, amount, period_start, period_end)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, usageType, amount, periodStart, periodEnd]
  );
}

// 获取租户用量
export function getTenantUsage(tenantId: number, usageType?: string): any[] {
  if (usageType) {
    return dbAll(
      "SELECT * FROM tenant_usage WHERE tenant_id = ? AND usage_type = ? ORDER BY created_at DESC",
      [tenantId, usageType]
    );
  }
  return dbAll(
    "SELECT * FROM tenant_usage WHERE tenant_id = ? ORDER BY created_at DESC",
    [tenantId]
  );
}

// 获取套餐列表
export function getPlans(): any[] {
  return dbAll("SELECT * FROM plans ORDER BY price_monthly");
}
