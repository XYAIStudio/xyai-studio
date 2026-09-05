/**
 * XYOS V4.3 — Function Calling 工具注册表
 * 内置工具集 + MCP 外部工具，以插件方式注册
 * 
 * 使用方式：
 *   import { ToolRegistry } from "./tool-registry";
 *   const tools = ToolRegistry.getOpenAIFormat();
 */
import { dbAll, dbGet, dbRun } from "../db";
import { FEATURE_FLAGS } from "../config/features";

// ==================== 工具定义 ====================

export interface ToolDefinition {
  /** 工具名称（OpenAI Function Calling 格式） */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 Schema（JSON Schema 格式） */
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  /** 工具执行函数 */
  execute: (args: Record<string, any>, context?: ToolContext) => Promise<ToolResult>;
  /** 来源（builtin | mcp | plugin） */
  source: "builtin" | "mcp" | "plugin";
  /** 是否启用 */
  enabled: boolean;
}

export interface ToolContext {
  tenantId?: number;
  userId?: number;
  agentId?: number;
  chatId?: number;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  /** 给 LLM 的文本描述 */
  text: string;
}

// ==================== 内置工具 ====================

/** 搜索企业知识库 */
const searchKnowledgeTool: ToolDefinition = {
  name: "search_knowledge",
  description: "搜索企业知识库，获取相关的知识文档和笔记",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      limit: { type: "integer", description: "返回结果数量，默认 5", default: 5 },
      tags: { type: "string", description: "按标签筛选（逗号分隔）" },
    },
    required: ["query"],
  },
  source: "builtin",
  enabled: true,
  execute: async (args, context) => {
    const limit = args.limit || 5;
    const tenantId = context?.tenantId || 1;

    let sql = `SELECT id, title, content, tags FROM knowledge_notes WHERE tenant_id = ?`;
    const params: any[] = [tenantId];

    if (args.query) {
      sql += ` AND (title LIKE ? OR content LIKE ?)`;
      params.push(`%${args.query}%`, `%${args.query}%`);
    }
    if (args.tags) {
      const tags = args.tags.split(",").map((t: string) => t.trim());
      for (const tag of tags) {
        sql += ` AND tags LIKE ?`;
        params.push(`%${tag}%`);
      }
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    try {
      const rows = dbAll(sql, params) as any[];
      if (rows.length === 0) {
        return { success: true, data: [], text: "未找到匹配的知识条目。" };
      }
      const summaries = rows.map((r: any) => 
        `📄 **${r.title || "无标题"}** (ID:${r.id}) | 标签:${r.tags || "无"}\n${r.content?.slice(0, 300) || "无内容"}...`
      );
      return { 
        success: true, 
        data: rows, 
        text: `找到 ${rows.length} 条相关知识：\n\n${summaries.join("\n\n")}` 
      };
    } catch (err: any) {
      return { success: false, error: err.message, text: "知识库搜索失败。" };
    }
  },
};

/** 创建任务 */
const createTaskTool: ToolDefinition = {
  name: "create_task",
  description: "创建新任务，可分配给指定员工",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "任务标题" },
      description: { type: "string", description: "任务描述" },
      priority: { type: "string", enum: ["low", "medium", "high"], description: "优先级" },
      assigned_to: { type: "integer", description: "分配给员工ID" },
      goal_id: { type: "integer", description: "关联目标ID" },
    },
    required: ["title"],
  },
  source: "builtin",
  enabled: true,
  execute: async (args, context) => {
    try {
      const result = dbRun(
        `INSERT INTO tasks (title, description, priority, assigned_to, goal_id, tenant_id, company_id)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          args.title,
          args.description || "",
          args.priority || "medium",
          args.assigned_to || null,
          args.goal_id || null,
          context?.tenantId || 1,
        ]
      );
      return {
        success: true,
        data: { id: result.lastInsertRowid },
        text: `✅ 任务已创建：${args.title}（ID:${result.lastInsertRowid}，优先级:${args.priority || "medium"}）`,
      };
    } catch (err: any) {
      return { success: false, error: err.message, text: "任务创建失败。" };
    }
  },
};

/** 查询员工信息 */
const queryEmployeeTool: ToolDefinition = {
  name: "query_employee",
  description: "查询企业员工信息，可按姓名或ID搜索",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "员工姓名（模糊搜索）" },
      employee_id: { type: "integer", description: "员工ID" },
      department: { type: "string", description: "部门名称" },
      agent_type: { type: "string", description: "AI员工类型" },
    },
    required: [],
  },
  source: "builtin",
  enabled: true,
  execute: async (args, context) => {
    try {
      let sql = `SELECT e.id, e.name, e.role, e.agent_type, e.employee_type, e.status, 
                        d.name as department_name
                 FROM employees e 
                 LEFT JOIN departments d ON e.department_id = d.id
                 WHERE e.tenant_id = ?`;
      const params: any[] = [context?.tenantId || 1];

      if (args.employee_id) {
        sql += ` AND e.id = ?`;
        params.push(args.employee_id);
      }
      if (args.name) {
        sql += ` AND e.name LIKE ?`;
        params.push(`%${args.name}%`);
      }
      if (args.department) {
        sql += ` AND d.name LIKE ?`;
        params.push(`%${args.department}%`);
      }
      if (args.agent_type) {
        sql += ` AND e.agent_type = ?`;
        params.push(args.agent_type);
      }

      sql += ` ORDER BY e.name LIMIT 20`;
      const rows = dbAll(sql, params) as any[];

      if (rows.length === 0) {
        return { success: true, data: [], text: "未找到匹配的员工。" };
      }

      const summaries = rows.map((r: any) =>
        `👤 **${r.name}** | ${r.role || "未指定"} | ${r.employee_type === "human" ? "人类" : "AI"} | ${r.department_name || "未分配部门"} | 状态:${r.status}`
      );
      return {
        success: true,
        data: rows,
        text: `找到 ${rows.length} 名员工：\n\n${summaries.join("\n")}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message, text: "员工查询失败。" };
    }
  },
};

/** 查询合同状态 */
const getContractStatusTool: ToolDefinition = {
  name: "get_contract_status",
  description: "查询合同状态和基本信息",
  parameters: {
    type: "object",
    properties: {
      contract_id: { type: "integer", description: "合同ID" },
      contract_no: { type: "string", description: "合同编号" },
      status: { type: "string", enum: ["draft", "active", "completed", "expired", "terminated"], description: "按状态筛选" },
    },
    required: [],
  },
  source: "builtin",
  enabled: true,
  execute: async (args, context) => {
    try {
      let sql = `SELECT id, title, contract_no, party_a, party_b, amount, status, start_date, end_date
                 FROM contracts WHERE tenant_id = ?`;
      const params: any[] = [context?.tenantId || 1];

      if (args.contract_id) {
        sql += ` AND id = ?`;
        params.push(args.contract_id);
      }
      if (args.contract_no) {
        sql += ` AND contract_no = ?`;
        params.push(args.contract_no);
      }
      if (args.status) {
        sql += ` AND status = ?`;
        params.push(args.status);
      }

      sql += ` ORDER BY created_at DESC LIMIT 10`;
      const rows = dbAll(sql, params) as any[];

      if (rows.length === 0) {
        return { success: true, data: [], text: "未找到匹配的合同。" };
      }

      const summaries = rows.map((r: any) =>
        `📋 **${r.title || "无标题"}** (${r.contract_no || "无编号"}) | ${r.party_a} ↔ ${r.party_b} | ¥${r.amount?.toLocaleString() || 0} | 状态:${r.status} | ${r.start_date || "?"} ~ ${r.end_date || "?"}`
      );
      return {
        success: true,
        data: rows,
        text: `找到 ${rows.length} 份合同：\n\n${summaries.join("\n")}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message, text: "合同查询失败。" };
    }
  },
};

/** 查询任务状态 */
const getTaskStatusTool: ToolDefinition = {
  name: "get_task_status",
  description: "查询任务状态和详情",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "integer", description: "任务ID" },
      assigned_to: { type: "integer", description: "按负责人筛选" },
      status: { type: "string", enum: ["todo", "in_progress", "done", "cancelled"], description: "按状态筛选" },
      limit: { type: "integer", description: "返回数量，默认 10" },
    },
    required: [],
  },
  source: "builtin",
  enabled: true,
  execute: async (args, context) => {
    try {
      const limit = args.limit || 10;
      let sql = `SELECT t.id, t.title, t.priority, t.status, e.name as assignee_name
                 FROM tasks t LEFT JOIN employees e ON t.assigned_to = e.id
                 WHERE t.tenant_id = ?`;
      const params: any[] = [context?.tenantId || 1];

      if (args.task_id) {
        sql += ` AND t.id = ?`;
        params.push(args.task_id);
      }
      if (args.assigned_to) {
        sql += ` AND t.assigned_to = ?`;
        params.push(args.assigned_to);
      }
      if (args.status) {
        sql += ` AND t.status = ?`;
        params.push(args.status);
      }

      sql += ` ORDER BY t.priority DESC, t.created_at DESC LIMIT ?`;
      params.push(limit);
      const rows = dbAll(sql, params) as any[];

      if (rows.length === 0) {
        return { success: true, data: [], text: "未找到匹配的任务。" };
      }

      const statusEmoji: Record<string, string> = {
        todo: "📝", in_progress: "🔄", done: "✅", cancelled: "❌",
      };
      const summaries = rows.map((r: any) =>
        `${statusEmoji[r.status] || "📌"} **${r.title}** (ID:${r.id}) | ${r.priority} | ${r.assignee_name || "未分配"} | ${r.status}`
      );
      return {
        success: true,
        data: rows,
        text: `找到 ${rows.length} 个任务：\n\n${summaries.join("\n")}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message, text: "任务查询失败。" };
    }
  },
};

/** 获取当前时间 */
const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  description: "获取当前日期和时间",
  parameters: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "时区，默认 Asia/Shanghai" },
    },
    required: [],
  },
  source: "builtin",
  enabled: true,
  execute: async (args) => {
    const now = new Date();
    const dateStr = now.toISOString().replace("T", " ").slice(0, 19);
    return {
      success: true,
      data: { datetime: dateStr, timestamp: now.getTime(), timezone: args.timezone || "Asia/Shanghai" },
      text: `当前时间：${dateStr}（时区：${args.timezone || "Asia/Shanghai"}）`,
    };
  },
};

// ==================== 工具注册表 ====================

export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map();
  private static initialized = false;

  /** 注册内置工具 */
  static init(): void {
    if (this.initialized) return;

    const builtins = [
      searchKnowledgeTool,
      createTaskTool,
      queryEmployeeTool,
      getContractStatusTool,
      getTaskStatusTool,
      getCurrentTimeTool,
    ];

    for (const tool of builtins) {
      this.tools.set(tool.name, tool);
    }

    this.initialized = true;
    console.log(`[ToolRegistry] 已注册 ${this.tools.size} 个内置工具`);
  }

  /** 注册一个工具 */
  static register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /** 注销一个工具 */
  static unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 获取所有已启用的工具（OpenAI Function Calling 格式） */
  static getOpenAIFormat(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: any };
  }> {
    this.init();
    const result: any[] = [];

    for (const tool of this.tools.values()) {
      if (!tool.enabled) continue;
      // 检查 feature flag
      if (tool.source === "mcp" && !FEATURE_FLAGS.ENABLE_MCP_CLIENT) continue;

      result.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }

    return result;
  }

  /** 获取工具名称列表 */
  static getToolNames(): string[] {
    this.init();
    return Array.from(this.tools.keys());
  }

  /** 获取工具定义摘要，供能力目录和生产市场展示，不暴露执行函数。 */
  static getDefinitions(): Array<Omit<ToolDefinition, "execute">> {
    this.init();
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      source: tool.source,
      enabled: tool.enabled,
    }));
  }

  /** 执行一个工具调用 */
  static async execute(
    name: string,
    args: Record<string, any>,
    context?: ToolContext
  ): Promise<ToolResult> {
    this.init();
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `未知工具: ${name}`,
        text: `错误：工具 "${name}" 不存在。`,
      };
    }

    if (!tool.enabled) {
      return {
        success: false,
        error: `工具已禁用: ${name}`,
        text: `错误：工具 "${name}" 已被禁用。`,
      };
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(args, context);
      const duration = Date.now() - startTime;

      // 记录工具调用日志
      try {
        dbRun(
          `INSERT INTO mcp_tool_call_logs (tenant_id, connection_id, tool_name, input_json, output_json, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            context?.tenantId || 1,
            0, // 0 表示内置工具
            name,
            JSON.stringify(args),
            JSON.stringify(result).slice(0, 2000),
            result.success ? "success" : "error",
          ]
        );
      } catch (auditErr: any) {
        console.warn(`[ToolRegistry] 工具调用审计日志写入失败:`, auditErr.message);
      }

      console.log(`[ToolRegistry] ${name} (${duration}ms) → ${result.success ? "OK" : "FAIL"}`);
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        text: `工具 "${name}" 执行出错：${err.message}`,
      };
    }
  }

  /** 批量执行工具调用（并行） */
  static async executeBatch(
    calls: Array<{ name: string; args: Record<string, any> }>,
    context?: ToolContext
  ): Promise<Array<{ name: string; result: ToolResult }>> {
    const promises = calls.map(async (call) => ({
      name: call.name,
      result: await this.execute(call.name, call.args, context),
    }));

    return Promise.all(promises);
  }
}

// 自动初始化
ToolRegistry.init();

export default ToolRegistry;
