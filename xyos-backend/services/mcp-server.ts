/**
 * V4.2 MCP 协议服务端 (Model Context Protocol Server)
 * 
 * 将 XYOS 内部能力暴露为标准 MCP 工具，供外部 AI Agent 调用。
 * 遵循 MCP 规范：https://spec.modelcontextprotocol.io/
 * 
 * 核心能力：
 * - 知识库搜索（knowledge_search）
 * - 员工查询（employee_query）
 * - 任务管理（task_manage）
 * - 合同查询（contract_query）
 * - 治理日志查询（governance_log）
 * - AI 编排（ai_orchestrate）
 * - 人在回路（human_review）
 */

import { dbGet, dbAll, dbRun } from "../db";
import { FEATURE_FLAGS } from "../config/features";

// ─────────────────────────────────────────────
// MCP 协议类型定义
// ─────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPListToolsResult {
  tools: MCPToolDefinition[];
}

export interface MCPCapabilities {
  tools: Record<string, any>;
  resources?: Record<string, any>;
  prompts?: Record<string, any>;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPCapabilities;
}

// ─────────────────────────────────────────────
// 工具定义注册表
// ─────────────────────────────────────────────

const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: "knowledge_search",
    description: "在 XYOS 知识库中搜索文档、笔记和知识条目。支持关键词搜索，返回匹配的内容摘要和文件路径。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        folder_id: { type: "number", description: "可选：限定搜索的知识库文件夹ID" },
        limit: { type: "number", description: "返回结果数量上限，默认10" },
      },
      required: ["query"],
    },
  },
  {
    name: "employee_query",
    description: "查询 XYOS 组织中的员工信息，包括姓名、角色、部门、技能等。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "员工姓名（支持模糊匹配）" },
        department_id: { type: "number", description: "可选：按部门过滤" },
        role: { type: "string", description: "可选：按角色过滤", enum: ["ceo", "cto", "cfo", "product_manager", "cmo", "hr", "developer", "tester", "legal", "admin", "employee"] },
        status: { type: "string", description: "可选：在职状态", enum: ["active", "inactive", "all"] },
      },
      required: [],
    },
  },
  {
    name: "task_manage",
    description: "查询和管理 XYOS 中的任务。支持查询、创建、更新任务状态。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作类型", enum: ["list", "create", "update_status", "get_detail"] },
        task_id: { type: "number", description: "任务ID（update_status/get_detail 时必填）" },
        title: { type: "string", description: "任务标题（create 时必填）" },
        description: { type: "string", description: "任务描述" },
        assigned_to: { type: "number", description: "指派给哪个员工（employee.id）" },
        priority: { type: "string", description: "优先级", enum: ["low", "medium", "high", "urgent"] },
        status: { type: "string", description: "状态", enum: ["todo", "in_progress", "done", "cancelled"] },
        limit: { type: "number", description: "返回数量上限（list 时有效，默认20）" },
      },
      required: ["action"],
    },
  },
  {
    name: "contract_query",
    description: "查询 XYOS 中的合同信息，包括合同状态、金额、进度款等。",
    inputSchema: {
      type: "object",
      properties: {
        contract_no: { type: "string", description: "合同编号" },
        status: { type: "string", description: "合同状态", enum: ["active", "completed", "cancelled", "draft", "all"] },
        party_name: { type: "string", description: "对方单位名称（模糊匹配）" },
        limit: { type: "number", description: "返回数量上限，默认10" },
      },
      required: [],
    },
  },
  {
    name: "governance_log",
    description: "查询 XYOS H2A2A2H 治理日志，了解 AI 多 Agent 讨论记录和决策过程。",
    inputSchema: {
      type: "object",
      properties: {
        action_type: { type: "string", description: "治理动作类型", enum: ["validate", "smart_route", "cascade_check", "all"] },
        result: { type: "string", description: "结果过滤", enum: ["allowed", "denied", "pending", "all"] },
        limit: { type: "number", description: "返回数量上限，默认20" },
        days: { type: "number", description: "最近N天的记录，默认7" },
      },
      required: [],
    },
  },
  {
    name: "ai_orchestrate",
    description: "触发 XYOS AI 编排引擎，将复杂任务分解为子任务并自动匹配最佳 AI 员工执行。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "编排任务标题" },
        description: { type: "string", description: "任务详细描述" },
        goal: { type: "string", description: "任务目标" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "human_review",
    description: "查询待审核的 AI 决策（人在回路），获取等待人类确认的 AI 产出。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作", enum: ["list_pending", "get_detail", "approve", "reject"] },
        review_id: { type: "number", description: "审核ID（get_detail/approve/reject 时必填）" },
        feedback: { type: "string", description: "审核反馈/拒绝原因" },
        limit: { type: "number", description: "返回数量上限（list_pending 时有效，默认10）" },
      },
      required: ["action"],
    },
  },
  {
    name: "get_org_structure",
    description: "获取 XYOS 组织架构概览，包括公司、部门层级和员工分布。",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "number", description: "可选：指定公司ID" },
      },
      required: [],
    },
  },
];

// ─────────────────────────────────────────────
// MCP 协议处理核心
// ─────────────────────────────────────────────

export function handleInitialize(): MCPInitializeResult {
  return {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "XYOS-MCP-Server",
      version: "4.2.0",
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
    },
  };
}

export function handleListTools(): MCPListToolsResult {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return { tools: [] };
  }
  return { tools: MCP_TOOLS };
}

export async function handleToolCall(request: MCPToolCallRequest): Promise<MCPToolCallResult> {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return { content: [{ type: "text", text: "MCP Server 功能未启用" }], isError: true };
  }

  try {
    switch (request.name) {
      case "knowledge_search":
        return await toolKnowledgeSearch(request.arguments);
      case "employee_query":
        return await toolEmployeeQuery(request.arguments);
      case "task_manage":
        return await toolTaskManage(request.arguments);
      case "contract_query":
        return await toolContractQuery(request.arguments);
      case "governance_log":
        return await toolGovernanceLog(request.arguments);
      case "ai_orchestrate":
        return await toolAiOrchestrate(request.arguments);
      case "human_review":
        return await toolHumanReview(request.arguments);
      case "get_org_structure":
        return await toolGetOrgStructure(request.arguments);
      default:
        return {
          content: [{ type: "text", text: `未知工具: ${request.name}` }],
          isError: true,
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `工具执行错误: ${err.message}` }],
      isError: true,
    };
  }
}

// ─────────────────────────────────────────────
// 工具实现
// ─────────────────────────────────────────────

async function toolKnowledgeSearch(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { query, folder_id, limit = 10 } = args;
  let sql = `
    SELECT kf.id, kf.filename, kf.original_name, kf.file_type, kf.folder_id, kf.created_at,
           kn.id as note_id, kn.title as note_title, kn.content as note_content
    FROM knowledge_files kf
    LEFT JOIN knowledge_notes kn ON kn.file_id = kf.id
    WHERE (kf.original_name LIKE ? OR kn.title LIKE ? OR kn.content LIKE ?)
  `;
  const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];

  if (folder_id) {
    sql += " AND kf.folder_id = ?";
    params.push(folder_id);
  }

  sql += " ORDER BY kf.created_at DESC LIMIT ?";
  params.push(Number(limit));

  const results = await dbAll(sql, params);
  const text = results.length > 0
    ? results.map((r: any) => `[${r.id}] ${r.original_name || r.note_title || r.filename} (${r.file_type || 'note'})`).join("\n")
    : `未找到与"${query}"相关的知识条目`;

  return { content: [{ type: "text", text }] };
}

async function toolEmployeeQuery(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { name, department_id, role, status } = args;
  let sql = `SELECT e.id, e.name, e.role, e.agent_type, e.employee_type, e.status, d.name as dept_name
             FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE 1=1`;
  const params: any[] = [];

  if (name) { sql += " AND e.name LIKE ?"; params.push(`%${name}%`); }
  if (department_id) { sql += " AND e.department_id = ?"; params.push(department_id); }
  if (role) { sql += " AND e.role = ?"; params.push(role); }
  if (status && status !== "all") { sql += " AND e.status = ?"; params.push(status); }

  sql += " ORDER BY e.name LIMIT 50";
  const results = await dbAll(sql, params);

  if (results.length === 0) {
    return { content: [{ type: "text", text: "未找到匹配的员工" }] };
  }

  const text = results.map((r: any) =>
    `[${r.id}] ${r.name} | ${r.role || 'employee'} | ${r.dept_name || '未分配部门'} | ${r.status}`
  ).join("\n");

  return { content: [{ type: "text", text }] };
}

async function toolTaskManage(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { action, task_id, title, description, assigned_to, priority, status, limit = 20 } = args;

  switch (action) {
    case "list": {
      let sql = `SELECT t.id, t.title, t.status, t.priority, t.assigned_to, e.name as assignee_name, t.created_at
                 FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_to
                 ORDER BY t.created_at DESC LIMIT ?`;
      const tasks = await dbAll(sql, [Number(limit)]);
      if (tasks.length === 0) {
        return { content: [{ type: "text", text: "当前没有任务" }] };
      }
      const text = tasks.map((t: any) =>
        `[${t.id}] ${t.title} | ${t.status} | ${t.priority} | ${t.assignee_name || '未分配'}`
      ).join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "create": {
      if (!title) return { content: [{ type: "text", text: "错误：创建任务需要 title 参数" }], isError: true };
      const result = await dbRun(
        "INSERT INTO tasks (title, description, assigned_to, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        [title, description || "", assigned_to || null, priority || "medium", "todo"]
      );
      return { content: [{ type: "text", text: `任务已创建，ID: ${result.lastInsertRowid}` }] };
    }

    case "update_status": {
      if (!task_id || !status) return { content: [{ type: "text", text: "错误：需要 task_id 和 status 参数" }], isError: true };
      await dbRun("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, task_id]);
      return { content: [{ type: "text", text: `任务 ${task_id} 状态已更新为 ${status}` }] };
    }

    case "get_detail": {
      if (!task_id) return { content: [{ type: "text", text: "错误：需要 task_id 参数" }], isError: true };
      const task = await dbGet(
        `SELECT t.*, e.name as assignee_name FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_to WHERE t.id = ?`,
        [task_id]
      );
      if (!task) return { content: [{ type: "text", text: `任务 ${task_id} 不存在` }] };
      const text = `ID: ${task.id}\n标题: ${task.title}\n描述: ${task.description || '无'}\n状态: ${task.status}\n优先级: ${task.priority}\n负责人: ${task.assignee_name || '未分配'}\n创建时间: ${task.created_at}`;
      return { content: [{ type: "text", text }] };
    }

    default:
      return { content: [{ type: "text", text: `未知操作: ${action}` }], isError: true };
  }
}

async function toolContractQuery(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { contract_no, status, party_name, limit = 10 } = args;
  let sql = `SELECT c.* FROM contracts c WHERE 1=1`;
  const params: any[] = [];

  if (contract_no) { sql += " AND c.contract_no LIKE ?"; params.push(`%${contract_no}%`); }
  if (status && status !== "all") { sql += " AND c.status = ?"; params.push(status); }
  if (party_name) { sql += " AND c.party_name LIKE ?"; params.push(`%${party_name}%`); }

  sql += " ORDER BY c.created_at DESC LIMIT ?";
  params.push(Number(limit));

  const results = await dbAll(sql, params);
  if (results.length === 0) {
    return { content: [{ type: "text", text: "未找到匹配的合同" }] };
  }

  const text = results.map((r: any) =>
    `[${r.id}] ${r.contract_no || '无编号'} | ${r.title || '无标题'} | ${r.status} | 金额:${r.total_amount || 0} | ${r.party_name || ''}`
  ).join("\n");

  return { content: [{ type: "text", text }] };
}

async function toolGovernanceLog(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { action_type, result, limit = 20, days = 7 } = args;
  let sql = `SELECT * FROM h2a2a_governance_log WHERE created_at >= datetime('now', ?)`;
  const params: any[] = [`-${days} days`];

  if (action_type && action_type !== "all") { sql += " AND action_type = ?"; params.push(action_type); }
  if (result && result !== "all") { sql += " AND result = ?"; params.push(result); }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(Number(limit));

  const logs = await dbAll(sql, params);
  if (logs.length === 0) {
    return { content: [{ type: "text", text: "暂无治理日志" }] };
  }

  const text = logs.map((l: any) =>
    `[${l.id}] ${l.action_type} | ${l.result} | ${l.detail || ''} | ${l.created_at}`
  ).join("\n");

  return { content: [{ type: "text", text }] };
}

async function toolAiOrchestrate(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { title, description, goal } = args;

  try {
    const { createOrchestration, analyzeTask, matchAgents } = require("./orchestrator");
    const orch = await createOrchestration(title, description, goal || "", 1, 1);
    const subtasks = await analyzeTask(orch.id);
    const matches = await matchAgents(orch.id);

    const text = `编排任务已创建 [ID: ${orch.id}]\n子任务数: ${subtasks.length}\n已匹配Agent数: ${matches.length}\n状态: 待执行`;
    return { content: [{ type: "text", text }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `编排创建失败: ${err.message}` }], isError: true };
  }
}

async function toolHumanReview(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { action, review_id, feedback, limit = 10 } = args;

  switch (action) {
    case "list_pending": {
      const reviews = await dbAll(
        "SELECT id, review_type, ai_content, status, created_at FROM pending_reviews WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?",
        [Number(limit)]
      );
      if (reviews.length === 0) {
        return { content: [{ type: "text", text: "暂无待审核的 AI 决策" }] };
      }
      const text = reviews.map((r: any) =>
        `[${r.id}] ${r.review_type} | ${r.status} | ${r.ai_content?.slice(0, 100) || ''}... | ${r.created_at}`
      ).join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "get_detail": {
      if (!review_id) return { content: [{ type: "text", text: "需要 review_id 参数" }], isError: true };
      const review = await dbGet("SELECT * FROM pending_reviews WHERE id = ?", [review_id]);
      if (!review) return { content: [{ type: "text", text: `审核 ${review_id} 不存在` }] };
      const text = `ID: ${review.id}\n类型: ${review.review_type}\n内容: ${review.ai_content}\n结构化数据: ${review.structured_data || '无'}\n状态: ${review.status}\n创建时间: ${review.created_at}`;
      return { content: [{ type: "text", text }] };
    }

    case "approve": {
      if (!review_id) return { content: [{ type: "text", text: "需要 review_id 参数" }], isError: true };
      await dbRun(
        "UPDATE pending_reviews SET status = 'approved', human_response = ?, reviewed_at = datetime('now') WHERE id = ?",
        [feedback || '已批准', review_id]
      );
      return { content: [{ type: "text", text: `审核 ${review_id} 已批准` }] };
    }

    case "reject": {
      if (!review_id) return { content: [{ type: "text", text: "需要 review_id 参数" }], isError: true };
      await dbRun(
        "UPDATE pending_reviews SET status = 'rejected', human_response = ?, reviewed_at = datetime('now') WHERE id = ?",
        [feedback || '已拒绝', review_id]
      );
      return { content: [{ type: "text", text: `审核 ${review_id} 已拒绝` }] };
    }

    default:
      return { content: [{ type: "text", text: `未知操作: ${action}` }], isError: true };
  }
}

async function toolGetOrgStructure(args: Record<string, any>): Promise<MCPToolCallResult> {
  const { company_id } = args;
  let sql = `SELECT d.id as dept_id, d.name as dept_name, d.parent_id,
             COUNT(e.id) as employee_count
             FROM departments d
             LEFT JOIN employees e ON e.department_id = d.id
             WHERE 1=1`;
  const params: any[] = [];

  if (company_id) { sql += " AND d.company_id = ?"; params.push(company_id); }

  sql += " GROUP BY d.id ORDER BY d.parent_id, d.name";
  const depts = await dbAll(sql, params);

  if (depts.length === 0) {
    return { content: [{ type: "text", text: "暂无组织架构数据" }] };
  }

  const text = depts.map((d: any) =>
    `[部门] ${d.dept_name} (ID:${d.dept_id}) | 员工数: ${d.employee_count} | 上级部门ID: ${d.parent_id || '无'}`
  ).join("\n");

  return { content: [{ type: "text", text }] };
}

// ─────────────────────────────────────────────
// 客户端连接管理
// ─────────────────────────────────────────────

interface MCPClientConnection {
  id: string;
  name: string;
  url: string;
  connectedAt: Date;
  lastPing: Date;
  tools: MCPToolDefinition[];
}

const connectedClients: Map<string, MCPClientConnection> = new Map();

export function registerClient(id: string, name: string, url: string): void {
  connectedClients.set(id, {
    id,
    name,
    url,
    connectedAt: new Date(),
    lastPing: new Date(),
    tools: [],
  });
}

export function unregisterClient(id: string): void {
  connectedClients.delete(id);
}

export function updateClientTools(id: string, tools: MCPToolDefinition[]): void {
  const client = connectedClients.get(id);
  if (client) {
    client.tools = tools;
    client.lastPing = new Date();
  }
}

export function getConnectedClients(): MCPClientConnection[] {
  return Array.from(connectedClients.values());
}

export function getClientById(id: string): MCPClientConnection | undefined {
  return connectedClients.get(id);
}

export { MCP_TOOLS };
