/**
 * ==================== H2A2A2H 工作流引擎 V5 ====================
 * 群聊场景智能调度核心：
 * 1. 对话性质自动识别（闲聊/工作交流/任务下达/决策确认）
 * 2. 优先级排序 — 工作交流 > 闲聊
 * 3. 任务下达 → 最高职级AI接管 → 拆解 → 按职级/职责分发
 * 4. 决策记录写入反思引擎
 */
import { callLLM } from "./ai";
import { AGENT_TEMPLATES, AgentTemplate } from "../agent-templates";
import { createReflection, addSkill } from "./reflection";

// ==================== 对话分类 ====================

export type ConversationCategory =
  | "casual"          // 闲聊/查岗/寒暄
  | "work_discussion" // 工作交流/讨论
  | "task_assignment" // 任务下达/指令
  | "decision_making" // 决策确认/审批
  | "report_request"; // 汇报/总结请求

export type Priority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface ClassificationResult {
  category: ConversationCategory;
  priority: Priority;
  confidence: number;            // 0-1
  reason: string;
  extractedEntities?: {          // 任务下达时的实体抽取
    target_role?: string[];      // 目标角色
    deadline?: string;           // 截止时间
    deliverables?: string[];     // 交付物
    keywords?: string[];         // 关键词
  };
}

/** 优先级映射 */
const PRIORITY_MAP: Record<ConversationCategory, Priority> = {
  task_assignment: "CRITICAL",
  decision_making: "HIGH",
  work_discussion: "NORMAL",
  report_request: "NORMAL",
  casual: "LOW",
};

// ==================== 分类器：基于规则 + LLM 双重判断 ====================

/** 规则层快速分类（无LLM调用，零延迟） */
function ruleBasedClassify(content: string): ClassificationResult | null {
  const text = content.trim();

  // ---- 任务下达关键词 ----
  const taskKeywords = [
    "请分析", "请评估", "请设计", "请制定", "请撰写", "请编写",
    "起草", "帮我写", "帮我做", "帮我查", "帮我整理", "帮我分析",
    "去处理", "去办", "去跟进", "去协调", "去对接",
    "安排一下", "分配", "分派", "指定", "指派",
    "做一个", "做一份", "出一份", "写一份", "写一个",
    "开发", "实现", "搭建", "创建", "生成", "写个", "做个", "建个",
    "任务:", "待办:", "TODO:", "行动项:",
    "需要你", "交给你", "负责", "牵头",
  ];
  for (const kw of taskKeywords) {
    if (text.includes(kw)) {
      return {
        category: "task_assignment",
        priority: "CRITICAL",
        confidence: 0.85,
        reason: `命中任务关键词「${kw}」`,
        extractedEntities: { keywords: [kw] },
      };
    }
  }

  // ---- 决策确认关键词 ----
  const decisionKeywords = [
    "确定", "最终决定", "拍板", "定下来", "定了",
    "是否通过", "批准", "驳回", "否决",
    "选哪个", "A还是B", "方案比较", "二选一",
    "审核结果", "审批意见", "请审批",
  ];
  for (const kw of decisionKeywords) {
    if (text.includes(kw)) {
      return {
        category: "decision_making",
        priority: "HIGH",
        confidence: 0.82,
        reason: `命中决策关键词「${kw}」`,
      };
    }
  }

  // ---- 汇报/总结请求 ----
  const reportKeywords = [
    "汇报", "周报", "月报", "日报", "季度报告",
    "总结一下", "归纳", "复盘", "回顾",
    "进展如何", "进度", "状态更新",
    "汇总", "整理汇报",
  ];
  for (const kw of reportKeywords) {
    if (text.includes(kw)) {
      return {
        category: "report_request",
        priority: "NORMAL",
        confidence: 0.8,
        reason: `命中汇报关键词「${kw}」`,
      };
    }
  }

  // ---- 继续执行（承接上一次未完成的任务，而非闲聊） ----
  if (/^(继续|接着说|继续啊|接着来|接着讲|继续做|接着说下去|go\s*on|continue|继续完成|请继续)/i.test(text)) {
    return { category: "work_discussion", priority: "NORMAL", confidence: 0.9, reason: "继续执行" };
  }

  // ---- 闲聊特征 ----
  if (text.length < 8 || /^(你好|hi|hello|在吗|早|晚上好|晚安|谢谢|辛苦|哈哈|不错)/i.test(text)) {
    return {
      category: "casual",
      priority: "LOW",
      confidence: 0.9,
      reason: "短消息/寒暄模式",
    };
  }

  const casualPatterns: RegExp[] = [
    /今天.*天气|天气.*怎么样|天气.*如何|明天.*天气|天气.*热|天气.*冷/,
    /吃饭.*吗|去.*吃饭|吃饭.*去|饿.*吗|吃.*没/,
    /下班|周末|放假|团建|年假|聚餐|摸鱼|八卦/,
  ];
  for (const p of casualPatterns) {
    if (p.test(text)) return { category: "casual", priority: "LOW", confidence: 0.85, reason: `闲聊模式「${p.source}」` };
  }

  // ---- 工作交流特征 ----
  const workKeywords = [
    "项目", "方案", "需求", "进度", "问题", "bug", "修复",
    "上线", "部署", "测试", "代码", "接口", "数据库",
    "客户", "合同", "报价", "投标", "交付",
    "性能", "优化", "重构", "架构",
    "会议", "讨论", "确认", "对齐", "同步",
    "排期", "延期", "风险", "阻塞",
  ];
  for (const kw of workKeywords) {
    if (text.includes(kw)) {
      return {
        category: "work_discussion",
        priority: "NORMAL",
        confidence: 0.8,
        reason: `工作交流模式「${kw}」`,
      };
    }
  }

  return null; // 规则无法判断，交给LLM
}

/** LLM 分类器（处理规则无法判断的边界情况） */
async function llmClassify(content: string, chatHistory: { role: string; content: string }[], tenantId = 1): Promise<ClassificationResult> {
  const historyContext = chatHistory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 100)}`).join("\n");

  const resp = await callLLM(
    [
      {
        role: "system",
        content: `你是对话分析专家。分析以下群聊消息的意图，返回JSON。

分类标准：
- "casual": 闲聊、寒暄、查岗、非工作闲聊
- "work_discussion": 工作讨论、信息同步、技术讨论
- "task_assignment": 明确的任务下达、分配、指派
- "decision_making": 需要决策、审批、确认
- "report_request": 要求汇报、总结、复盘

优先级: task_assignment=CRITICAL, decision_making=HIGH, work_discussion/report_request=NORMAL, casual=LOW

只返回JSON，不要其他内容：
{"category":"xxx","priority":"xxx","confidence":0.x,"reason":"xxx"}`,
      },
      { role: "user", content: `历史上下文:\n${historyContext}\n\n最新消息: ${content}` },
    ],
    0.1,
    200,
    tenantId,
  );
  const respContent = resp.content;

  try {
    const parsed = JSON.parse(respContent);
    return {
      category: parsed.category || "work_discussion",
      priority: parsed.priority || "NORMAL",
      confidence: parsed.confidence || 0.6,
      reason: parsed.reason || "LLM分类",
    };
  } catch {
    return { category: "work_discussion", priority: "NORMAL", confidence: 0.5, reason: "LLM解析失败，回退默认" };
  }
}

/** 主分类入口：规则优先（零延迟），边界情况走LLM */
export async function classifyConversationIntent(
  content: string,
  chatHistory: { role: string; content: string }[] = [],
  tenantId = 1,
): Promise<ClassificationResult> {
  const ruleResult = ruleBasedClassify(content);
  if (ruleResult && ruleResult.confidence >= 0.8) return ruleResult;

  // 规则有结果但置信度不够，或规则无法判断 → LLM
  if (ruleResult) {
    const llmResult = await llmClassify(content, chatHistory, tenantId);
    // 信任度更高的那个
    return llmResult.confidence >= ruleResult.confidence ? llmResult : ruleResult;
  }

  return llmClassify(content, chatHistory, tenantId);
}

// ==================== 职级排序 ====================

/** 获取员工的 Rank 数值（从 AGENT_TEMPLATES 查） */
export function getEmployeeRank(employee: any): number {
  const type = employee.agent_type || "";
  const template = AGENT_TEMPLATES[type];
  return template?.rank ?? 99; // 未注册的排最后
}

/** 获取员工所属的模板信息 */
export function getEmployeeTemplate(employee: any): AgentTemplate | undefined {
  return AGENT_TEMPLATES[employee.agent_type || ""];
}

/** 按职级排序员工（rank 越小越高） */
export function sortByRank(employees: any[]): any[] {
  return [...employees].sort((a, b) => {
    const rankA = getEmployeeRank(a);
    const rankB = getEmployeeRank(b);
    return rankA - rankB;
  });
}

/** 判断是否为管理者（Rank 1-3 且有管理职责） */
export function isManagerRank(employee: any): boolean {
  const rank = getEmployeeRank(employee);
  if (rank <= 2) return true; // 决策层+高管层
  if (rank === 3) {
    // 总监层：部分有管理职责
    const mgrTypes = ["tech_architect", "hr_manager", "sales_manager", "strategy_executive", "finance_director", "presales_architect"];
    return mgrTypes.includes(employee.agent_type || "");
  }
  return false;
}

// ==================== 指挥官选择 ====================

/** 
 * 从群聊AI员工中选出最高职权指挥官
 * 决策逻辑:
 * 1. 有CEO → CEO
 * 2. 无CEO但CEO级别人物存在 → 最高 Rank 1
 * 3. 有CTO/CPO等技术高管 → 按技术类任务优先CTO，产品类优先CPO
 * 4. 按 Rank 排序取最低 rank 值（数值越小越高）
 */
export function resolveCommander(employees: any[], category?: ConversationCategory): any {
  if (employees.length === 0) return null;
  if (employees.length === 1) return employees[0];

  // 按rank排序
  const sorted = sortByRank(employees);
  const topRank = sorted[0];

  // 如果是任务下达，优先CEO/CTO/CPO/COO
  if (category === "task_assignment" || category === "decision_making") {
    const execOrder = ["ceo", "cto", "cpo", "coo", "cmo", "cfo", "cso", "cco", "cho", "cao", "cdo"];
    for (const type of execOrder) {
      const found = employees.find((e: any) => e.agent_type === type);
      if (found) return found;
    }
  }

  return topRank;
}

// ==================== 任务拆解与分发 ====================

export interface SubTask {
  title: string;
  description: string;
  assigned_to: string;     // agent_type
  assigned_name?: string;  // 具体员工名
  employee_id?: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  dependencies?: string[]; // 依赖的其他子任务
  estimated_effort?: string;
}

export interface TaskDecomposition {
  summary: string;
  commander: { name: string; role: string; rank: number };
  subtasks: SubTask[];
  global_priority: Priority;
}

/** LLM 任务拆解 */
async function llmDecomposeTask(
  userMessage: string,
  commander: any,
  availableEmployees: any[],
  tenantId: number
): Promise<{ summary: string; subtasks: SubTask[] }> {
  const employeeList = availableEmployees
    .map(e => {
      const tpl = getEmployeeTemplate(e);
      return `- ${e.name} (${e.role}, agent_type: ${e.agent_type}, rank: ${tpl?.rank || "?"}, 技能: ${e.skills || "通用"})`;
    })
    .join("\n");

  const resp = await callLLM(
    [
      {
        role: "system",
        content: `你是「${commander.name}」(${commander.role})，雄元科技最高职级AI管理者。

任务拆解规则：
1. 理解任务目标，分解为2-5个可独立执行的子任务
2. 每个子任务必须指定 agent_type（从可用员工列表中选最合适的人）
3. 子任务按依赖关系排序
4. 每个子任务有明确的优先级(HIGH/MEDIUM/LOW)

返回JSON（不要其他内容）：
{
  "summary": "任务概述（一句话）",
  "subtasks": [
    {"title":"子任务","description":"详述","assigned_to":"agent_type","priority":"HIGH","dependencies":[],"estimated_effort":"2h"}
  ]
}`,
      },
      { role: "user", content: `任务：「${userMessage}」

可用员工：
${employeeList}

请拆解任务并分配给最合适的员工（用 agent_type 指定）。` },
    ],
    0.3,
    1500
  );
  const respContent = resp.content;

  try {
    return JSON.parse(respContent);
  } catch {
    return {
      summary: `执行任务：${userMessage}`,
      subtasks: availableEmployees.slice(0, 3).map((e: any) => ({
        title: `${e.role}处理`,
        description: userMessage,
        assigned_to: e.agent_type,
        assigned_name: e.name,
        employee_id: e.id,
        priority: "MEDIUM" as const,
      })),
    };
  }
}

/** 将 LLM 拆解结果映射到实际员工 */
function mapSubtaskToEmployee(
  subtask: SubTask,
  employees: any[]
): SubTask {
  // 精确匹配 agent_type
  let match = employees.find((e: any) => e.agent_type === subtask.assigned_to);
  // 模糊匹配（名称包含）
  if (!match) {
    match = employees.find((e: any) =>
      e.role?.includes(subtask.assigned_to) || e.agent_type?.includes(subtask.assigned_to)
    );
  }
  // 兜底：按剩余可用员工分配
  if (!match) {
    const usedIds = new Set(employees.map((e: any) => e.id));
    match = employees.find((e: any) => !usedIds.has(e.id));
  }

  if (match) {
    subtask.assigned_name = match.name;
    subtask.employee_id = match.id;
  }
  return subtask;
}

/** 主入口：任务拆解与智能分发 */
export async function decomposeAndDistribute(
  userMessage: string,
  commander: any,
  allEmployees: any[],
  tenantId: number
): Promise<TaskDecomposition> {
  const template = getEmployeeTemplate(commander);
  const rank = template?.rank ?? 99;

  // 可被分配的执行者：职级低于指挥官的员工
  const availableEmployees = allEmployees.filter((e: any) => {
    if (e.id === commander.id) return false;
    const eRank = getEmployeeRank(e);
    return eRank > rank; // rank数值越大职级越低
  });

  const decomposed = await llmDecomposeTask(userMessage, commander, availableEmployees, tenantId);

  // 映射到实际员工
  const subtasks = decomposed.subtasks.map(st => mapSubtaskToEmployee(st, availableEmployees));

  return {
    summary: decomposed.summary,
    commander: { name: commander.name, role: commander.role, rank },
    subtasks,
    global_priority: "CRITICAL",
  };
}

// ==================== 反思记录 ====================

/** 将路由决策写入反思引擎 */
export function recordRoutingDecision(
  tenantId: number,
  employeeId: number,
  category: ConversationCategory,
  priority: Priority,
  userMessage: string,
  successFactors?: string
): number {
  const reflectionId = createReflection({
    tenant_id: tenantId,
    employee_id: employeeId,
    reflection_type: "routing_decision",
    success_factors: successFactors || `成功识别对话类型：${category}，优先级：${priority}`,
    learned_knowledge: `用户消息：${userMessage.substring(0, 200)}`,
    importance_score: priority === "CRITICAL" ? 90 : priority === "HIGH" ? 70 : 50,
  });

  // 记录分类技能
  addSkill({
    employee_id: employeeId,
    tenant_id: tenantId,
    skill_name: `dialogue_classification`,
    skill_category: "workflow_intelligence",
    proficiency_level: 1,
    usage_count: 1,
  });

  return reflectionId;
}

/** 记录任务分发决策 */
export function recordDelegationDecision(
  tenantId: number,
  commanderId: number,
  decomposition: TaskDecomposition
): number {
  const subtaskSummary = decomposition.subtasks
    .map(st => `${st.title} → ${st.assigned_name || st.assigned_to}(${st.priority})`)
    .join("; ");

  return createReflection({
    tenant_id: tenantId,
    employee_id: commanderId,
    reflection_type: "task_delegation",
    success_factors: `指挥官${decomposition.commander.name}成功拆解为${decomposition.subtasks.length}个子任务`,
    learned_knowledge: `拆解概要：${decomposition.summary}\n分发：${subtaskSummary}`,
    importance_score: 85,
  });
}
