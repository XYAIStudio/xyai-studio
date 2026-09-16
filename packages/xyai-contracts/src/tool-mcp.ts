/** 工具与 MCP 契约 */

export type ToolPermission = 'allow' | 'deny' | 'ask';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  permission: ToolPermission;
}

export interface McpServerRef {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  enabled: boolean;
}

export interface ToolMcpRegistry {
  listTools(): Promise<ToolDefinition[]>;
  listMcpServers(): Promise<McpServerRef[]>;
}
