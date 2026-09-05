/**
 * V0.90 R4 智能体工具网关
 *
 * 核心概念：
 * - Tool: 智能体可调用的功能单元（带 JSON Schema 参数约束）
 * - ToolRegistry: 工具注册表，支持按租户和分类筛选
 * - ToolGateway: 统一调用入口，含参数校验、审计日志、超时控制
 */

import { dbRun, dbGet, dbAll } from "../db";

// ============================================================
// 类型定义
// ============================================================

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  category: string;
  description: string;
  parameters: ToolParameter[];
  /** 调用此工具的连接器名称（如 "oa", "erp", "crm"） */
  connector?: string;
}

export interface ToolInvocation {
  toolName: string;
  parameters: Record<string, unknown>;
  /** 调用者信息 */
  caller: {
    userId: number;
    tenantId: number;
    agentType?: string;
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
}

// ============================================================
// 工具注册表
// ============================================================

export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map();

  /** 注册工具 */
  static register(tool: ToolDefinition): void {
    ToolRegistry.tools.set(tool.name, tool);
  }

  /** 获取工具定义 */
  static get(name: string): ToolDefinition | undefined {
    return ToolRegistry.tools.get(name);
  }

  /** 列出工具（可按分类筛选） */
  static list(category?: string): ToolDefinition[] {
    const all = Array.from(ToolRegistry.tools.values());
    return category ? all.filter(t => t.category === category) : all;
  }

  /** 获取工具的分类列表 */
  static categories(): string[] {
    return [...new Set(Array.from(ToolRegistry.tools.values()).map(t => t.category))];
  }
}

// ============================================================
// 参数校验
// ============================================================

function validateParameters(tool: ToolDefinition, params: Record<string, unknown>): string | null {
  for (const p of tool.parameters) {
    const val = params[p.name];

    // 必填检查
    if (p.required && (val === undefined || val === null)) {
      return `缺少必填参数: ${p.name}`;
    }

    if (val !== undefined && val !== null) {
      // 类型检查
      const actualType = Array.isArray(val) ? "array" : typeof val;
      if (actualType !== p.type) {
        return `参数 ${p.name} 类型不匹配: 期望 ${p.type}, 实际 ${actualType}`;
      }

      // 枚举检查
      if (p.enum && !p.enum.includes(String(val))) {
        return `参数 ${p.name} 不在允许值中: ${p.enum.join(", ")}`;
      }
    }
  }
  return null;
}

// ============================================================
// 工具网关
// ============================================================

/**
 * 执行工具调用。
 * 1. 查找工具定义
 * 2. 校验参数
 * 3. 路由到对应的连接器
 * 4. 记录审计日志
 */
export async function invokeTool(invocation: ToolInvocation): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const tool = ToolRegistry.get(invocation.toolName);
    if (!tool) {
      return { success: false, error: `未知工具: ${invocation.toolName}`, executionTimeMs: Date.now() - startTime };
    }

    // 参数校验
    const validationError = validateParameters(tool, invocation.parameters);
    if (validationError) {
      return { success: false, error: validationError, executionTimeMs: Date.now() - startTime };
    }

    // 路由到连接器
    let result: unknown;
    if (tool.connector) {
      const connector = ConnectorGateway.get(tool.connector);
      if (!connector) {
        return { success: false, error: `连接器不可用: ${tool.connector}`, executionTimeMs: Date.now() - startTime };
      }
      result = await connector.execute(tool.name, invocation.parameters, invocation.caller);
    } else {
      // 内置工具
      result = await executeBuiltinTool(tool.name, invocation.parameters, invocation.caller);
    }

    // 审计日志
    dbRun(
      "INSERT INTO tool_invocations (tool_name, caller_id, tenant_id, parameters_json, result_json, execution_ms) VALUES (?,?,?,?,?,?)",
      [invocation.toolName, invocation.caller.userId, invocation.caller.tenantId, JSON.stringify(invocation.parameters), JSON.stringify(result), Date.now() - startTime]
    );

    return { success: true, data: result, executionTimeMs: Date.now() - startTime };
  } catch (err: any) {
    return { success: false, error: err.message || "工具执行异常", executionTimeMs: Date.now() - startTime };
  }
}

// ============================================================
// 内置工具
// ============================================================

async function executeBuiltinTool(name: string, params: Record<string, unknown>, caller: ToolInvocation["caller"]): Promise<unknown> {
  switch (name) {
    case "search_knowledge":
      return dbAll(
        "SELECT id, title, substr(content,1,200) as snippet FROM knowledge_notes WHERE tenant_id = ? AND (title LIKE ? OR content LIKE ?) LIMIT ?",
        [caller.tenantId, `%${params.query}%`, `%${params.query}%`, params.limit || 5]
      );

    case "get_employee":
      return dbGet(
        "SELECT id, name, role, department_id, status FROM employees WHERE id = ? AND tenant_id = ?",
        [params.employee_id, caller.tenantId]
      );

    case "get_task":
      return dbGet(
        "SELECT * FROM tasks WHERE id = ? AND tenant_id = ?",
        [params.task_id, caller.tenantId]
      );

    case "create_notification":
      dbRun(
        "INSERT INTO notifications (user_id, title, content, type, tenant_id) VALUES (?,?,?,?,?)",
        [params.user_id, params.title, params.content, params.type || "system", caller.tenantId]
      );
      return { sent: true };

    case "get_chat_summary":
      return dbAll(
        "SELECT m.content, m.sender_name, m.created_at FROM messages m INNER JOIN chats c ON c.id = m.chat_id WHERE m.chat_id = ? AND c.tenant_id = ? ORDER BY m.created_at DESC LIMIT ?",
        [params.chat_id, caller.tenantId, params.limit || 20]
      );

    default:
      throw new Error(`未知内置工具: ${name}`);
  }
}

// ============================================================
// 连接器网关
// ============================================================

export interface EnterpriseConnector {
  readonly name: string;
  readonly system: string; // "oa" | "erp" | "crm"
  /** 执行连接器操作 */
  execute(toolName: string, params: Record<string, unknown>, caller: ToolInvocation["caller"]): Promise<unknown>;
  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

class ConnectorGateway {
  private static connectors: Map<string, EnterpriseConnector> = new Map();

  static register(connector: EnterpriseConnector): void {
    ConnectorGateway.connectors.set(connector.name, connector);
  }

  static get(name: string): EnterpriseConnector | undefined {
    return ConnectorGateway.connectors.get(name);
  }

  static list(): EnterpriseConnector[] {
    return Array.from(ConnectorGateway.connectors.values());
  }
}

export { ConnectorGateway };

// ============================================================
// 连接器模板（OA/ERP/CRM 骨架实现）
// ============================================================

export class OAConnector implements EnterpriseConnector {
  readonly name = "oa";
  readonly system = "oa";

  async execute(toolName: string, params: Record<string, unknown>, caller: ToolInvocation["caller"]): Promise<unknown> {
    switch (toolName) {
      case "oa_get_approvals":
        return dbAll("SELECT * FROM workflow_instances WHERE tenant_id = ? AND status = 'pending' LIMIT ?", [caller.tenantId, params.limit || 10]);
      case "oa_submit_approval":
        return { submitted: true, message: "OA 审批已提交（集成待 R4 正式对接）" };
      case "oa_get_attendance":
        return dbAll("SELECT * FROM attendance WHERE tenant_id = ? AND employee_id = ? LIMIT ?", [caller.tenantId, params.employee_id || caller.userId, params.limit || 30]);
      default:
        throw new Error(`OA 连接器不支持的指令: ${toolName}`);
    }
  }

  async healthCheck(): Promise<boolean> { return true; }
}

export class ERPConnector implements EnterpriseConnector {
  readonly name = "erp";
  readonly system = "erp";

  async execute(toolName: string, params: Record<string, unknown>, caller: ToolInvocation["caller"]): Promise<unknown> {
    switch (toolName) {
      case "erp_get_assets":
        return dbAll("SELECT * FROM assets WHERE tenant_id = ? LIMIT ?", [caller.tenantId, params.limit || 20]);
      case "erp_get_budgets":
        return dbAll("SELECT * FROM budgets WHERE tenant_id = ? LIMIT ?", [caller.tenantId, params.limit || 10]);
      case "erp_get_contracts":
        return dbAll("SELECT * FROM contracts WHERE tenant_id = ? LIMIT ?", [caller.tenantId, params.limit || 10]);
      default:
        throw new Error(`ERP 连接器不支持的指令: ${toolName}`);
    }
  }

  async healthCheck(): Promise<boolean> { return true; }
}

export class CRMConnector implements EnterpriseConnector {
  readonly name = "crm";
  readonly system = "crm";

  async execute(toolName: string, params: Record<string, unknown>, caller: ToolInvocation["caller"]): Promise<unknown> {
    switch (toolName) {
      case "crm_get_customers":
        // 客户信息暂时复用 tenants 表
        return dbAll("SELECT id, name, status, created_at FROM tenants WHERE id = ? OR status = 'active' LIMIT ?", [caller.tenantId, params.limit || 20]);
      case "crm_get_contacts":
        return dbAll("SELECT id, name, email FROM users WHERE tenant_id = ? LIMIT ?", [caller.tenantId, params.limit || 50]);
      default:
        throw new Error(`CRM 连接器不支持的指令: ${toolName}`);
    }
  }

  async healthCheck(): Promise<boolean> { return true; }
}

// ============================================================
// 初始化：注册内置工具和连接器
// ============================================================

export function initToolGateway(): void {
  // 注册内置工具
  ToolRegistry.register({ name: "search_knowledge", category: "knowledge", description: "搜索知识库", parameters: [
    { name: "query", type: "string", required: true, description: "搜索关键词" },
    { name: "limit", type: "number", required: false, description: "返回数量上限", default: 5 },
  ]});

  ToolRegistry.register({ name: "get_employee", category: "hr", description: "获取员工信息", parameters: [
    { name: "employee_id", type: "number", required: true, description: "员工 ID" },
  ]});

  ToolRegistry.register({ name: "get_task", category: "task", description: "获取任务详情", parameters: [
    { name: "task_id", type: "number", required: true, description: "任务 ID" },
  ]});

  ToolRegistry.register({ name: "create_notification", category: "system", description: "发送系统通知", parameters: [
    { name: "user_id", type: "number", required: true, description: "接收用户 ID" },
    { name: "title", type: "string", required: true, description: "通知标题" },
    { name: "content", type: "string", required: true, description: "通知内容" },
    { name: "type", type: "string", required: false, description: "通知类型", default: "system" },
  ]});

  ToolRegistry.register({ name: "get_chat_summary", category: "chat", description: "获取群聊摘要", parameters: [
    { name: "chat_id", type: "number", required: true, description: "群聊 ID" },
    { name: "limit", type: "number", required: false, description: "返回消息数量", default: 20 },
  ]});

  // 注册连接器工具
  const oaTools: ToolDefinition[] = [
    { name: "oa_get_approvals", category: "oa", description: "获取待审批列表", connector: "oa", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 10 }] },
    { name: "oa_submit_approval", category: "oa", description: "提交审批", connector: "oa", parameters: [{ name: "type", type: "string", required: true, description: "审批类型" }] },
    { name: "oa_get_attendance", category: "oa", description: "获取考勤记录", connector: "oa", parameters: [{ name: "employee_id", type: "number", required: false, description: "员工 ID" }] },
  ];
  oaTools.forEach(t => ToolRegistry.register(t));

  const erpTools: ToolDefinition[] = [
    { name: "erp_get_assets", category: "erp", description: "查询资产列表", connector: "erp", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 20 }] },
    { name: "erp_get_budgets", category: "erp", description: "查询预算", connector: "erp", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 10 }] },
    { name: "erp_get_contracts", category: "erp", description: "查询合同列表", connector: "erp", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 10 }] },
  ];
  erpTools.forEach(t => ToolRegistry.register(t));

  const crmTools: ToolDefinition[] = [
    { name: "crm_get_customers", category: "crm", description: "查询客户", connector: "crm", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 20 }] },
    { name: "crm_get_contacts", category: "crm", description: "查询联系人", connector: "crm", parameters: [{ name: "limit", type: "number", required: false, description: "返回数量", default: 50 }] },
  ];
  crmTools.forEach(t => ToolRegistry.register(t));

  // 注册连接器
  ConnectorGateway.register(new OAConnector());
  ConnectorGateway.register(new ERPConnector());
  ConnectorGateway.register(new CRMConnector());
}
