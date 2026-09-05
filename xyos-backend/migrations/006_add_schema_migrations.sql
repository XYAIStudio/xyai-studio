-- XYOS V4.5: schema_migrations 表 — 数据库迁移追踪
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  description TEXT,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT
);
