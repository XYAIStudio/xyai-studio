-- P0: 多租户SaaS基础 数据库迁移
-- 执行时间：2026-06-12
-- 说明：只增不删，增量迁移

-- 1. 租户表
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  tenant_code VARCHAR(8) UNIQUE,
  logo_url TEXT,
  theme_color TEXT DEFAULT '#10B981',
  domain TEXT,
  status TEXT DEFAULT 'trial',
  plan TEXT DEFAULT 'free',
  trial_ends_at DATETIME,
  subscription_ends_at DATETIME,
  max_users INTEGER DEFAULT 5,
  max_ai_employees INTEGER DEFAULT 10,
  max_tokens_monthly INTEGER DEFAULT 1000000,
  settings_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 租户成员表
CREATE TABLE IF NOT EXISTS tenant_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  invited_by INTEGER,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id)
);

-- 3. 租户邀请表
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  invited_by INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 租户用量记录
CREATE TABLE IF NOT EXISTS tenant_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  usage_type TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  period_start DATE,
  period_end DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 套餐配置
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price_monthly REAL DEFAULT 0,
  max_users INTEGER,
  max_ai_employees INTEGER,
  max_tokens_monthly INTEGER,
  features_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 索引
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_type ON tenant_usage(usage_type);

-- 7. 插入默认套餐
INSERT OR IGNORE INTO plans (name, slug, price_monthly, max_users, max_ai_employees, max_tokens_monthly, features_json)
VALUES 
  ('免费版', 'free', 0, 5, 10, 1000000, '{"basic_features": true}'),
  ('基础版', 'basic', 2999, 20, 50, 5000000, '{"basic_features": true, "priority_support": true}'),
  ('专业版', 'pro', 9999, 100, 200, 20000000, '{"basic_features": true, "priority_support": true, "advanced_analytics": true}'),
  ('企业版', 'enterprise', 29999, -1, -1, -1, '{"basic_features": true, "priority_support": true, "advanced_analytics": true, "custom_deployment": true}');

-- 8. 插入默认租户（当前系统）
INSERT OR IGNORE INTO tenants (name, slug, tenant_code, status, plan, max_users, max_ai_employees, max_tokens_monthly)
VALUES ('雄元科技', 'xiongyuan', 'XY', 'active', 'enterprise', -1, -1, -1);
