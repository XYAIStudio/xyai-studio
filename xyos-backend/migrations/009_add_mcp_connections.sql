-- =====================================================
-- 002: V4.2 MCP 协议接入
-- =====================================================

CREATE TABLE IF NOT EXISTS mcp_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  connection_name TEXT NOT NULL,
  mcp_server_url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none',    -- 'none' | 'api_key' | 'oauth'
  auth_config TEXT,                -- JSON，认证配置
  enabled_tools TEXT,              -- JSON数组，启用的工具名
  is_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mcp_tool_call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 1,
  connection_id INTEGER,
  tool_name TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_conn_tenant ON mcp_connections(tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_log_tenant ON mcp_tool_call_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_log_tool ON mcp_tool_call_logs(tool_name, status);
