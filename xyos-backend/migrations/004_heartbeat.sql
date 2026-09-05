-- P2: Heartbeat心跳执行 数据库迁移

-- 1. 心跳计划表
CREATE TABLE IF NOT EXISTS heartbeat_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '*/30 * * * *',
  task_type TEXT NOT NULL DEFAULT 'check_tasks',
  enabled INTEGER DEFAULT 1,
  last_run DATETIME,
  next_run DATETIME,
  tenant_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 心跳执行日志
CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  schedule_id INTEGER,
  action TEXT NOT NULL,
  result TEXT,
  duration_ms INTEGER,
  tenant_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. tasks表增加字段（增量）
-- locked_by: 锁定任务的agent_id
-- locked_at: 锁定时间
-- checkout_timeout: 超时时间（秒）

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_heartbeat_schedules_agent ON heartbeat_schedules(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_schedules_enabled ON heartbeat_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_agent ON heartbeat_logs(agent_id);
