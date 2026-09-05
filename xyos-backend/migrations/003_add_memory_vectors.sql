-- =====================================================
-- 003: V4.3 向量记忆 + Agent 推理日志
-- =====================================================

-- 向量检索表（可选，本地 TF-IDF 模式下不需要）
CREATE TABLE IF NOT EXISTS memory_vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  agent_id INTEGER NOT NULL,
  memory_id INTEGER,           -- 关联 agent_short_memory 或 agent_long_memory
  memory_type TEXT,             -- 'short' | 'long'
  embedding BLOB,              -- 向量数据（Float32Array序列化）
  content_hash TEXT,            -- 内容哈希，用于增量更新
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memvec_agent ON memory_vectors(agent_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_memvec_hash ON memory_vectors(content_hash);

-- Agent 推理过程记录（用于审计和调试）
CREATE TABLE IF NOT EXISTS agent_reasoning_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  agent_id INTEGER NOT NULL,
  chat_id INTEGER,
  reasoning_type TEXT,          -- 'react' | 'h2a2a' | 'task_execution'
  thought TEXT,
  action TEXT,
  observation TEXT,
  round_number INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reasoning_agent ON agent_reasoning_logs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reasoning_chat ON agent_reasoning_logs(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reasoning_type ON agent_reasoning_logs(reasoning_type, created_at);
