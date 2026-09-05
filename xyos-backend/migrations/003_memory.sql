-- P1: AI员工记忆系统 数据库迁移

-- 1. 短期记忆（7天TTL）
CREATE TABLE IF NOT EXISTS agent_short_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'conversation',
  content TEXT NOT NULL,
  reasoning_content TEXT,
  importance_score REAL DEFAULT 0,
  context_json TEXT,
  tenant_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- 2. 长期记忆（Dream整合后晋升）
CREATE TABLE IF NOT EXISTS agent_long_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance_score REAL DEFAULT 50,
  access_count INTEGER DEFAULT 0,
  last_accessed DATETIME,
  source_ids TEXT,
  tenant_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Dream整合日志
CREATE TABLE IF NOT EXISTS dream_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL,
  memories_scanned INTEGER DEFAULT 0,
  memories_promoted INTEGER DEFAULT 0,
  memories_archived INTEGER DEFAULT 0,
  memories_deleted INTEGER DEFAULT 0,
  report TEXT,
  tenant_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_short_memory_agent ON agent_short_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_short_memory_expires ON agent_short_memory(expires_at);
CREATE INDEX IF NOT EXISTS idx_short_memory_type ON agent_short_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_long_memory_agent ON agent_long_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_long_memory_score ON agent_long_memory(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_long_memory_type ON agent_long_memory(memory_type);
