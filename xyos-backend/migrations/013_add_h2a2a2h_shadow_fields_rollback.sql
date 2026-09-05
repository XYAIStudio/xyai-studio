-- 013 回滚：先删索引，再删列（SQLite 3.35+ 支持 DROP COLUMN）。
-- 默认回滚方式 = 关闭 ENABLE_H2A2A2H_SHADOW flag + 删除 chat_id IS NOT NULL 的影子行；本脚本为物理回滚兜底。

DROP INDEX IF EXISTS idx_h2a2a2h_tasks_employee;
DROP INDEX IF EXISTS idx_h2a2a2h_tasks_parent;
DROP INDEX IF EXISTS idx_h2a2a2h_tasks_chat;
ALTER TABLE h2a2a2h_tasks DROP COLUMN employee_id;
ALTER TABLE h2a2a2h_tasks DROP COLUMN chat_id;
ALTER TABLE h2a2a2h_tasks DROP COLUMN parent_id;
ALTER TABLE h2a2a2h_tasks DROP COLUMN dependencies;
