-- =====================================================
-- 001: V4.1 人在回路 - pending_reviews 表
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  review_type TEXT NOT NULL,         -- 'h2a2a_summary' | 'task_assignment' | 'budget_approval'
  initiator_user_id INTEGER NOT NULL,
  ai_content TEXT NOT NULL,          -- AI生成的待审核内容
  structured_data TEXT,              -- 结构化数据JSON（可转为任务）
  status TEXT DEFAULT 'pending',     -- 'pending' | 'approved' | 'modified' | 'rejected'
  human_response TEXT,               -- 人类审核后的内容
  reviewer_user_id INTEGER,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_reviews_status ON pending_reviews(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_reviews_reviewer ON pending_reviews(reviewer_user_id, status);

-- h2a2a_governance_log 增加编排关联字段
ALTER TABLE h2a2a_governance_log ADD COLUMN orchestration_id INTEGER DEFAULT NULL;
