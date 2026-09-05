-- 013: H2A2A2H 底座激活（影子接线）—— h2a2a2h_tasks 补协作关联字段
-- 说明：实际生效由 db.ts 内联 ALTER（h2a2a2hAlters 数组）完成，本文件为历史记录脚本。
-- 只增列 + 建索引，不删不改现有列；字段闲置不影响现有 h2a2a2h 功能。

ALTER TABLE h2a2a2h_tasks ADD COLUMN dependencies TEXT DEFAULT '[]';  -- JSON 数组，依赖的任务 id
ALTER TABLE h2a2a2h_tasks ADD COLUMN parent_id INTEGER;               -- 本轮协作的父任务（聚合根）
ALTER TABLE h2a2a2h_tasks ADD COLUMN chat_id INTEGER;                 -- 来源群聊 id（数据互通锚点）
ALTER TABLE h2a2a2h_tasks ADD COLUMN employee_id INTEGER;             -- 执行者 AI 员工 id（employees.id）

CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_chat ON h2a2a2h_tasks(chat_id);
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_parent ON h2a2a2h_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_h2a2a2h_tasks_employee ON h2a2a2h_tasks(employee_id);
