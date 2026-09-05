-- =====================================================
-- 002 回滚: 移除 MCP 协议接入表
-- =====================================================

DROP TABLE IF EXISTS mcp_tool_call_logs;
DROP TABLE IF EXISTS mcp_connections;
