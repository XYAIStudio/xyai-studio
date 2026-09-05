-- P0.5: PID/PCC双码编码 数据库迁移
-- 说明：只增不删，增量迁移

-- 1. PID序列号表
CREATE TABLE IF NOT EXISTS pid_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code VARCHAR(8) NOT NULL,
  seq_type TEXT DEFAULT 'employee',
  allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 员工岗位表（支持一人多岗）
CREATE TABLE IF NOT EXISTS employee_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  pid VARCHAR(16) NOT NULL,
  pcc VARCHAR(32) NOT NULL,
  dept_id INTEGER,
  dept_code VARCHAR(16),
  is_primary INTEGER DEFAULT 1,
  position_type TEXT DEFAULT 'permanent',
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 岗位变动历史
CREATE TABLE IF NOT EXISTS position_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  pid VARCHAR(16) NOT NULL,
  old_pcc VARCHAR(32),
  new_pcc VARCHAR(32) NOT NULL,
  change_type TEXT NOT NULL,
  old_dept_id INTEGER,
  new_dept_id INTEGER,
  effective_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 员工表增加字段（增量）
-- 注意：ALTER TABLE 在 sql.js 中可能需要特殊处理
-- 这里先检查字段是否存在

-- 5. 部门表增加字段（增量）

-- 6. 索引
CREATE INDEX IF NOT EXISTS idx_pid_sequences_tenant ON pid_sequences(tenant_code);
CREATE INDEX IF NOT EXISTS idx_employee_positions_employee ON employee_positions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_positions_pid ON employee_positions(pid);
CREATE INDEX IF NOT EXISTS idx_employee_positions_pcc ON employee_positions(pcc);
CREATE INDEX IF NOT EXISTS idx_position_history_pid ON position_history(pid);
