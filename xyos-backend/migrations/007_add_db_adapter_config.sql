-- XYOS V4.5: db_adapter_config 表 — 数据库适配器配置存储
CREATE TABLE IF NOT EXISTS db_adapter_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  dialect TEXT NOT NULL DEFAULT 'sqlite',
  host TEXT,
  port INTEGER,
  database_name TEXT,
  username TEXT,
  schema_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
