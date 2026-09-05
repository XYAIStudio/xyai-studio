-- V4.1 人在回路机制 - pending_reviews 表
-- 迁移版本：005
-- 创建时间：2026-06-25

CREATE TABLE IF NOT EXISTS pending_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  review_type TEXT NOT NULL,
  initiator_user_id INTEGER NOT NULL,
  ai_content TEXT NOT NULL,
  structured_data TEXT,
  status TEXT DEFAULT 'pending',
  human_response TEXT,
  reviewer_user_id INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- h2a2a_governance_log 增加 orchestration_id 字段
-- SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS，使用异常处理
-- 应用层在 db.ts 的 runMigrations() 中执行
ALTER TABLE h2a2a_governance_log ADD COLUMN orchestration_id INTEGER DEFAULT NULL;
