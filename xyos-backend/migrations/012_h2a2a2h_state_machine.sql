-- V0.70 R2 H2A2A2H 全量状态机表
-- 支持：创建→认领→执行→提交→审核→（争议→仲裁）→完成/驳回

CREATE TABLE IF NOT EXISTS h2a2a2h_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL DEFAULT 'created',
  title TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  claimed_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  reviewer_id INTEGER REFERENCES users(id),
  tenant_id INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  dispute_reason TEXT,
  arbitration_result TEXT
);

CREATE TABLE IF NOT EXISTS h2a2a2h_state_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES h2a2a2h_tasks(id),
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_state ON h2a2a2h_tasks(state);
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_claimed ON h2a2a2h_tasks(claimed_by);
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_tenant ON h2a2a2h_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_state_log_task ON h2a2a2h_state_log(task_id);
