-- V4.1 人在回路机制 - 回滚脚本
-- 迁移版本：005

-- 注意：SQLite 不支持 DROP COLUMN，需重建表
-- 此处仅删除 pending_reviews 表，h2a2a_governance_log 的 orchestration_id 字段无法回滚
-- 建议：回滚时保留 orchestration_id 字段（不影响现有功能）

DROP TABLE IF EXISTS pending_reviews;
