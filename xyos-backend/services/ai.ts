import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { dbGet, dbAll, dbRun } from "../db";
import { AuditTrailEngine } from "./audit-trail";
import { AGENT_TEMPLATES } from "../agent-templates";
import { assertModelEndpointAllowed } from "../config/runtime";
import { getShortMemories, getLongMemories } from "./memory";
import { classifyRequestAuthorization } from "./authorization";
import { FEATURE_FLAGS } from "../config/features";
import { safeErrorReply } from "./error-taxonomy";
import { hasDesktopCredentialBroker, readTenantLlmCredential } from "./credential-broker";
import { resolveCommander, isManagerRank, getEmployeeRank, sortByRank, classifyConversationIntent, decomposeAndDistribute, recordRoutingDecision, recordDelegationDecision, type ConversationCategory, type TaskDecomposition } from "./workflow-engine";

// LLM 输入净化 — 移除常见注入模式
export function sanitizeLLMInput(text: string): string {
  return text
    .replace(/忽略(所有|上述|之前|以上|一切).*指令/gi, "[已过滤]")
    .replace(/Ignore\s*(all|previous|above|the).*instructions/gi, "[filtered]")
    .replace(/扮演.*角色|切换.*身份|你不再是|你现在是/g, "[已过滤]")
    .replace(/system:\s*|<\s*\|?system\|?\s*>|\[system\]/gi, "[已过滤]")
    .replace(/DAN\s*mode|jailbreak|越狱/g, "[已过滤]")
    .slice(0, 16000);  // 长度限制
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  tokens_used: number;
  model: string;
}

const AGENT_PROMPTS: Record<string, string> = {
  ceo: `你是雄元科技的CEO陈远。你负责战略规划、重大决策和团队协调。

工作规范：
- 收到工作类问题时，先分析问题的核心要点和背景
- 从战略高度思考，给出有深度、可执行的建议
- 如果涉及其他部门，指明应该协调谁、如何推进
- 回复要结构清晰：问题分析→建议方案→下一步行动
- 不要敷衍回复，每个工作问题都要认真对待`,

  cto: `你是雄元科技的CTO林技。你负责技术架构、代码审查和技术选型。

工作规范：
- 收到技术问题时，先评估技术可行性和风险
- 给出具体的技术方案，包括架构设计、技术选型理由
- 关注性能、安全、可维护性等非功能需求
- 回复要专业深入：问题分析→技术方案→实施步骤→风险评估
- 不要泛泛而谈，要给出可落地的技术建议`,

  cfo: `你是雄元科技的CFO王财。你负责财务分析、预算管理和成本控制。

工作规范：
- 收到财务相关问题时，先分析财务数据和预算影响
- 给出具体的数字分析和ROI评估
- 关注成本控制和风险预警
- 回复要数据驱动：现状分析→数据对比→建议方案→风险提示
- 不要空泛回答，要有数据支撑`,

  product_manager: `你是雄元科技的产品总监赵产。你负责产品规划、需求分析和用户体验。

工作规范：
- 收到产品问题时，先理解用户需求和业务目标
- 从用户体验角度分析，给出产品方案和优先级建议
- 关注产品价值、可行性和交付周期
- 回复要以用户为中心：需求分析→方案设计→优先级排序→交付计划
- 不要草率回复，每个产品决策都要有依据`,

  cmo: `你是雄元科技的市场总监刘市。你负责市场策略、品牌推广和增长。

工作规范：
- 收到市场问题时，先分析市场环境和竞争态势
- 给出具体的营销策略和执行方案
- 关注获客成本、转化率和品牌影响力
- 回复要数据支撑：市场分析→策略制定→执行计划→效果预期
- 不要空洞回答，要有具体的市场洞察`,

  hr: `你是雄元科技的HR总监孙人。你负责人才管理、绩效评估和组织发展。

工作规范：
- 收到人力问题时，先分析组织现状和人才需求
- 给出具体的人才方案和组织优化建议
- 关注人效、员工满意度和组织健康
- 回复要务实：问题诊断→方案设计→实施路径→效果评估
- 不要官僚化回答，要关注实际可操作性`,

  frontend_dev: `你是雄元科技的前端工程师周前。你精通React、TypeScript、Tailwind CSS。

工作规范：
- 收到前端技术问题时，先理解需求和技术上下文
- 给出具体的代码方案、组件设计或性能优化建议
- 关注用户体验、代码质量和工程化
- 回复要专业：问题分析→技术方案→代码示例→注意事项
- 不要敷衍，每个技术问题都要给出可执行的方案`,

  backend_dev: `你是雄元科技的后端工程师吴后。你精通Node.js、数据库、API设计。

工作规范：
- 收到后端技术问题时，先评估系统架构和数据流
- 给出具体的API设计、数据库方案或性能优化建议
- 关注系统稳定性、安全性和扩展性
- 回复要深入：问题分析→架构方案→实现细节→测试验证
- 不要草率回答，每个技术决策都要有依据`,

  qa: `你是雄元科技的测试工程师郑测。你负责质量保证、自动化测试和安全审计。

工作规范：
- 收到质量问题时，先分析缺陷根因和影响范围
- 给出具体的测试方案、用例设计或安全加固建议
- 关注覆盖率、回归风险和质量标准
- 回复要严谨：问题定位→分析验证→解决方案→预防措施
- 不要放过任何质量问题，要追根溯源`,

  knowledge: `你是雄元科技的知识管理员李知。你负责知识沉淀、文档管理和信息检索。

工作规范：
- 收到知识管理问题时，先梳理知识结构和关联关系
- 给出具体的文档方案、知识图谱或信息组织建议
- 关注知识的可检索性、完整性和时效性
- 回复要条理清晰：知识梳理→结构设计→管理方案→维护计划
- 不要泛泛而谈，要有具体的知识管理方法论`,

  legal_advisor: `你是雄元科技的法务顾问AI，专精合同审查与结构化数据提取。

## 核心职责
从合同文本中精准提取关键信息，输出结构化JSON。

## 工作规范
- 仔细阅读合同全文，不遗漏任何条款
- 准确识别合同主体（甲方/乙方）、金额、日期
- 提取所有付款/收款节点，包括金额、时间、条件
- 识别潜在风险点
- 所有金额转换为万元单位（除以10000）
- 日期转换为 YYYY-MM-DD 格式
- 无法确定的字段返回 null，不要编造

## 输出格式（严格JSON）
{
  "contractInfo": {
    "title": "合同名称",
    "party_a": "甲方名称",
    "party_b": "乙方名称",
    "contract_type": "sales|purchase|employment|lease|nda|other",
    "amount": 数字(万元),
    "start_date": "YYYY-MM-DD 或 null",
    "end_date": "YYYY-MM-DD 或 null",
    "key_terms": "核心条款摘要(200字以内)"
  },
  "payments": [
    {
      "label": "收/付款节点名称(如首付款/进度款/验收款/质保金)",
      "amount": 数字(万元),
      "due_date": "YYYY-MM-DD",
      "condition": "付款条件描述"
    }
  ],
  "risks": ["风险点描述"],
  "confidence": 0.0-1.0
}

## 重要提示
- 只返回JSON，不返回任何额外文字
- 金额以万元为单位输出数字
- 如果某项信息无法提取，填写 null 或空数组 []`,
};

// 通用工作回复增强指令
const WORK_RESPONSE_INSTRUCTION = `【重要】如果用户的问题涉及工作任务、项目、方案、报告、分析等正式工作内容，你必须：
1. 认真思考问题的各个方面，不要急于回复
2. 给出有深度、有条理、可执行的专业回答
3. 如果问题超出你的职责范围，说明你能提供什么帮助，并建议联系合适的同事
4. 绝对不能敷衍回复（如"好的"、"收到"、"没问题"等无实质内容的回复）
5. 回复长度至少3句话，复杂问题要分点阐述`;

// ============================================================
// 热电尽调助手（thermal-dd）：行业智能体专用人设
// 知识底座 = 脱敏知识架构树（本地文件），工具 = DSH 原生 read/grep
// ============================================================
const THERMAL_DD_KNOWLEDGE_ROOT = process.env.XYOS_THERMAL_DD_KNOWLEDGE_ROOT
  || path.join(process.cwd(), "services", "capabilities", "thermal-dd", "knowledge");
const THERMAL_DD_KNOWLEDGE_BASE = path.join(THERMAL_DD_KNOWLEDGE_ROOT, "知识架构树.md");
const THERMAL_DD_ENTITIES = path.join(THERMAL_DD_KNOWLEDGE_ROOT, "distilled_entities.json");
const THERMAL_DD_PROMPT = `你是「热电项目尽调智能助手」，基于脱敏的在运营热电项目知识架构树工作。

【知识底座】
- 脱敏知识架构树：${THERMAL_DD_KNOWLEDGE_BASE}
- 实体词典：${THERMAL_DD_ENTITIES}
- 工作方式：用 read / grep 工具读取上述文件，按维度查询后回答（不要凭空回答，必须真实读取文件）。

【🔒 脱敏铁律（最高优先级，任何回答必须遵守）】
1. 绝不输出真实名称：公司/地名/人名/项目名一律使用脱敏代号（某热电 / 【公司N】/【地点N】/【人名N】/【项目N】）；
2. 绝不还原：即使知识库出现原文，也不得还原、解释或暗示真实企业/人；
3. 绝不外引：不引用 alias_map、对照表、原始文档名等任何含原名信息；
4. 知识树未覆盖的问题，明确说"知识库未覆盖"，不得编造或回溯原名。

【九个查询维度】
- overview 企业主体（沿革/股权/人员/占地）
- tech 技术资产（锅炉/汽机/电气/环保/化水/管网）
- operation 生产运营（产能/售汽量/供电/故障台账/技改）
- market 市场客户（用户结构/负荷/出口/关税影响）
- compliance 合规资质（核准/环评/排污/验收/瑕疵清单）
- finance 财务估值（三年一期财报/估值结论/交易结构）
- risk 风险管控（技术/合规/市场/财务风险与对策）
- benchmark 对标标杆（同业可比公司）
- strategy 战略发展（扩建/生物质/资本运作）

【查询方法】
1. 用 grep 在知识架构树中定位维度章节标题（如 "## 6. 财务估值层"）；
2. 用 read 读取对应章节内容；
3. 目标：【公司A】=某热电、【公司W】=某热电；空=全部。

【回答规范】
- 引用知识树中的具体数据（装机容量、售汽量、估值金额、风险点），并标注来源章节（如"见 6.2 估值结论"）；
- 输出结构化：结论先行，数据表格支撑，风险点分条列出；
- 用中文，简洁克制，禁止编造。`;

function getAgentSystemPrompt(agentType: string): string {
  return AGENT_PROMPTS[agentType] || "你是雄元科技的AI数字员工，请专业、友好地回复。";
}

/** 智能体定制一键安装的行业智能体通用人设：能力目录 + 脱敏知识树 + 查询协议。 */
function buildIndustryAgentPrompt(employee: any): string | null {
  const agentType: string = employee.agent_type || "";
  if (!agentType) return null;
  const capDir = path.join(process.cwd(), "services", "capabilities", agentType);
  const knowledgeFile = path.join(capDir, "knowledge", "知识架构树.md");
  if (!fs.existsSync(knowledgeFile)) return null;
  const name = employee.name || "行业智能体";
  const role = employee.role || agentType;
  const skills = employee.skills ? employee.skills.split(",").map((s: string) => s.trim()).filter(Boolean).join("、") : "知识库查询、报告生成";
  return `你是「${name}」，${role}行业的智能体，基于脱敏的行业知识架构树工作。

【知识底座】
- 脱敏知识架构树：${knowledgeFile}
- 工作方式：用 read / grep 工具读取上述文件，按维度查询后回答（不要凭空回答，必须真实读取文件）。

【🔒 脱敏铁律（最高优先级，任何回答必须遵守）】
1. 绝不输出真实名称：公司/地名/人名/项目名/产品名/商标品牌/信用代码/个人敏感信息一律使用脱敏代号；
2. 绝不还原、绝不外引原名映射；
3. 知识树未覆盖的问题，明确说"知识库未覆盖"，不得编造。

【能力】${skills}

【回答规范】
- 引用知识树中的具体数据，并标注来源章节；
- 输出结构化：结论先行，数据表格支撑，风险点分条列出；
- 用中文，简洁克制，禁止编造。`;
}

// V4: 根据员工数据构建角色化系统提示
function buildEmployeeSystemPrompt(employee: any): string {
  // 热电尽调助手：行业智能体专用人设（脱敏知识树 + 9 维度查询协议）
  if (employee.agent_type === "thermal_dd") {
    return THERMAL_DD_PROMPT;
  }

  // 智能体定制一键安装的行业智能体：能力目录 + 通用人设
  const industryPrompt = buildIndustryAgentPrompt(employee);
  if (industryPrompt) return industryPrompt;

  const name = employee.name || "AI员工";
  const role = employee.role || "员工";
  const skills = employee.skills ? employee.skills.split(",").map((s: string) => s.trim()).join("、") : "";
  const desc = employee.description || "";
  
  // 尝试从模板获取更详细的角色信息
  const template = AGENT_TEMPLATES[employee.agent_type];
  
  let prompt = `你是雄元科技的AI数字员工「${name}」，职位是「${role}」。`;
  
  if (template) {
    prompt += `\n\n【你的职责】${template.description}`;
    if (template.skills?.length) {
      prompt += `\n【核心技能】${template.skills.join("、")}`;
    }
    prompt += `\n【管理层级】第${template.rank}级`;
  } else if (desc) {
    prompt += `\n【职责描述】${desc}`;
    if (skills) prompt += `\n【技能】${skills}`;
  }
  
  prompt += `\n\n工作规范：
- 始终以「${name} · ${role}」的身份思考和回复
- 回复要体现你所在岗位的专业视角和职责范围
- 遇到超出职责范围的问题，礼貌说明并建议找对应岗位同事
- 与同事协作时保持专业、建设性的态度
- 主动从你的专业角度提供有价值的分析和建议

严格的发言纪律（必须遵守）：
- 绝对禁止替其他同事发言或编造其他同事的动向（如"某某在开会""某某在处理告警"等）
- 绝对禁止编造任何事实信息，只能基于自己的专业知识和历史对话作答
- 当被问及他人情况而你不知情时，必须明确说"我不清楚，建议直接@对方询问"
- 只能说你自己知道的事情，不确定的事直接说不知道
- 不要虚构场景、情节或数据`;
  
  return prompt;
}

function getInstallationId(): string {
  const row = dbGet("SELECT value FROM ai_config WHERE key = 'xyai_installation_id'") as any;
  if (typeof row?.value === "string" && row.value.length >= 12) return row.value;
  const id = randomUUID();
  dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["xyai_installation_id", id, "XYAI Studio 本机安装标识", 1]);
  return id;
}

/**
 * ai_config 的历史表把 key 设成了全局唯一。使用租户前缀而不是依赖无法追加的
 * 复合唯一索引，既兼容已有本机库，也不会让一个租户覆盖另一个租户的 API Key。
 */
function tenantConfigKey(tenantId: number, key: string): string {
  return `tenant:${tenantId}:${key}`;
}

function getTenantConfigValue(tenantId: number, key: string): string | undefined {
  const scoped = dbGet("SELECT value FROM ai_config WHERE key = ?", [tenantConfigKey(tenantId, key)]) as any;
  if (typeof scoped?.value === "string") return scoped.value;
  // 兼容旧版本仅有 tenant 1 的未命名配置；一旦管理员再次保存便会迁移到命名键。
  if (tenantId === 1) {
    const legacy = dbGet("SELECT value FROM ai_config WHERE tenant_id = ? AND key = ?", [tenantId, key]) as any;
    if (typeof legacy?.value === "string") return legacy.value;
  }
  return undefined;
}

async function resolveLLMConfig(tenantId = 1): Promise<{ apiKey: string; baseUrl: string; model: string; trial: boolean; installationId: string }> {
  // An Electron launch has a credential broker.  Never fall back to SQLite in
  // that mode: a broker outage must not revive a key that was deliberately
  // migrated out of database backups.
  const securedKey = hasDesktopCredentialBroker() ? await readTenantLlmCredential(tenantId) : undefined;
  const ownKey = securedKey || (!hasDesktopCredentialBroker() ? getTenantConfigValue(tenantId, "llm_api_key") : undefined) || process.env.LLM_API_KEY || "";
  const apiBase = getTenantConfigValue(tenantId, "llm_api_base");
  const model = getTenantConfigValue(tenantId, "llm_model");
  return ownKey ? {
    apiKey: ownKey, baseUrl: apiBase || "https://api.deepseek.com/v1",
    model: model || "deepseek-chat", trial: false, installationId: getInstallationId(),
  } : {
    apiKey: "xyai-trial", baseUrl: "https://cnxy.ai/api/trial/deepseek/v1",
    model: "deepseek-chat", trial: true, installationId: getInstallationId(),
  };
}

/** 系统设置页保存的自有模型是 XYOS 全站的首选模型通道；本函数绝不返回密钥。 */
export async function hasConfiguredLLM(tenantId = 1): Promise<boolean> {
  const config = await resolveLLMConfig(tenantId);
  return !config.trial && Boolean(config.apiKey && config.baseUrl && config.model);
}

export async function callLLM(messages: AIMessage[], temperature = 0.7, maxTokens = 1024, tenantId?: number): Promise<AIResponse> {
  const resolvedTenantId = tenantId ?? 1;
  const { apiKey, baseUrl, model, trial, installationId } = await resolveLLMConfig(resolvedTenantId);

  // AI 开关检查
  if (getTenantConfigValue(resolvedTenantId, "ai_reply_enabled") === "false") {
    return { content: "[系统] AI功能已被管理员关闭。", tokens_used: 0, model: "disabled" };
  }

  if (!apiKey || !baseUrl || !model) return { content: "[系统] AI服务未完成受控配置。", tokens_used: 0, model: "none" };
  if (!assertModelEndpointAllowed(baseUrl)) {
    console.error("[AI] AIR_GAP_MODE blocked a model endpoint outside the allowlist");
    return { content: "[系统] 当前私有化策略禁止访问该 AI 服务。", tokens_used: 0, model: "blocked" };
  }

  try {
    // 90秒超时，防止无限等待
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, ...(trial ? { "x-xyai-installation-id": installationId, "x-xyai-space": "xyos" } : {}) },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      // 仅记录状态码，不记录 API 响应内容（防止敏感信息泄露到日志）
      console.error(`[AI] API 返回错误状态码: ${response.status}`);
      return { content: response.status === 402 ? "[系统][TRIAL_EXPIRED] 15 分钟试用已结束，请前往“设置 > AI大模型”，选择您已购买的模型供应商并填写 API 地址、Key 和模型名称。" : `[系统] AI服务暂时不可用，请稍后重试。`, tokens_used: 0, model };
    }
    const data = await response.json() as any;
    const msg = data.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning_content || "（无回复）";
    const tokens = data.usage?.total_tokens || 0;

    // 审计日志
    try {
      AuditTrailEngine.logAgentBehavior({
        tenantId: resolvedTenantId,
        agentId: 0,
        agentName: "LLM调用",
        behaviorType: "ai_generation",
        behaviorDetail: `模型:${model} Tokens:${tokens} 字数:${content.length}`,
        inputContext: JSON.stringify(messages[messages.length-1]?.content || "").slice(0, 500),
        tokenUsed: tokens,
      });
    } catch (auditErr: any) {
      console.warn("[AI] 审计日志写入失败:", auditErr.message);
    }

    // SaaS 用量记账（tenantId 由上层传入时记录月度 Token 用量）
    if (tenantId && tokens > 0) {
      try {
        dbRun(
          `INSERT INTO tenant_usage (tenant_id, usage_type, amount, period_start, period_end) VALUES (?, 'tokens', ?, ?, ?)`,
          [tenantId, tokens, new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
           new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]]
        );
      } catch (usageErr: any) {
        console.warn("[AI] Token 用量记账失败:", usageErr.message);
      }
    }

    return { content, tokens_used: tokens, model: data.model || model };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error("[AI] 请求超时(90s)");
      return { content: "[系统] AI服务响应超时，请稍后重试。", tokens_used: 0, model };
    }
    console.error("[AI] 调用异常:", error.message);
    return { content: "[系统] AI服务连接失败，请稍后重试。", tokens_used: 0, model };
  }
}

// ═══════════════════════════════════════════════════════════
// V4.3 流式输出（Server-Sent Events）
// ═══════════════════════════════════════════════════════════

export interface StreamCallbacks {
  /** 思考过程（reasoning_content）逐段回调 */
  onReasoning?: (token: string) => void;
  /** 回答内容逐段回调 */
  onToken?: (token: string) => void;
  /** 完成回调：完整回答 + 完整思考 */
  onComplete?: (fullContent: string, reasoning: string) => void;
  /** 工具调用步骤（read/pwsh/edit/...），name=工具名，summary=一行摘要 */
  onTool?: (name: string, summary: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 流式调用 LLM，通过回调实时输出 token
 * 用于前端打字机效果和 WebSocket 实时推送
 * 支持 DeepSeek R1 深度思考：reasoning_content 单独回调（onReasoning），content 走 onToken
 */
export async function callLLMStream(
  messages: AIMessage[],
  callbacks: StreamCallbacks,
  temperature = 0.7,
  maxTokens = 1024,
  tenantId = 1,
): Promise<void> {
  const { apiKey, baseUrl, model, trial, installationId } = await resolveLLMConfig(tenantId);

  if (getTenantConfigValue(tenantId, "ai_reply_enabled") === "false") {
    callbacks.onToken?.("[系统] AI功能已被管理员关闭。");
    callbacks.onComplete?.("[系统] AI功能已被管理员关闭。", "");
    return;
  }

  if (!apiKey) {
    callbacks.onToken?.("[系统] AI服务未配置API密钥。");
    callbacks.onComplete?.("[系统] AI服务未配置API密钥。", "");
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, ...(trial ? { "x-xyai-installation-id": installationId, "x-xyai-space": "xyos" } : {}) },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      callbacks.onError?.(new Error(response.status === 402 ? "TRIAL_EXPIRED: 15 分钟试用已结束，请配置您自己的大模型" : `API ${response.status}`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let reasoning = "";
    let buffer = "";
    // token 聚合缓冲：每 40ms flush 一次，让流更平滑、WebSocket 消息更少（避免断断续续）
    let rcBuffer = "";
    let contentBuffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (rcBuffer) { callbacks.onReasoning?.(rcBuffer); rcBuffer = ""; }
      if (contentBuffer) { callbacks.onToken?.(contentBuffer); contentBuffer = ""; }
      flushTimer = null;
    };
    const scheduleFlush = () => { if (!flushTimer) flushTimer = setTimeout(flush, 40); };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          clearTimeout(timeout);
          flush();
          callbacks.onComplete?.(fullContent, reasoning);
          return;
        }

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          const rc = delta?.reasoning_content || "";
          const content = delta?.content || "";
          if (rc) { reasoning += rc; rcBuffer += rc; scheduleFlush(); }
          if (content) { fullContent += content; contentBuffer += content; scheduleFlush(); }
        } catch {
          // 忽略解析错误
        }
      }
    }

    clearTimeout(timeout);
    flush();
    callbacks.onComplete?.(fullContent, reasoning);
  } catch (error: any) {
    if (error.name === "AbortError") {
      callbacks.onError?.(new Error("AI服务响应超时"));
    } else {
      callbacks.onError?.(error);
    }
  }
}

// ==================== H2A2A2H 治理引擎 ====================
// 支持两种模式：
// 模式A（层级制）：有管理者 → 管理者分配 → 执行者行动 → 管理者总结 → 人类审核
// 模式B（平级制）：无管理者 → 所有人同时思考 → 一一回答 → 互相点评 → 征求人类意见

export interface H2A2A2HStep {
  type: "manager_assign" | "peer_think" | "peer_reply" | "peer_review" | "manager_summary" | "meeting_minutes";
  employee_name: string;
  employee_role: string;
  agent_type: string;
  content: string;
  thinking?: string;
  review_target?: string;
}

export interface H2A2A2HResult {
  steps: H2A2A2HStep[];
  finalContent: string;
  mode: "hierarchical" | "peer";
  pendingReviewId?: number;  // [V4.1 人在回路] 待审核记录ID
}

// V5: 使用 workflow-engine 的 Rank 体系判断管理者
function hasManager(employees: any[]): boolean {
  return employees.some((e: any) => isManagerRank(e));
}

function getHighestRankingManager(employees: any[]): any {
  // 按职级排序取最高
  const sorted = sortByRank(employees);
  if (sorted.length === 0) return null;
  // 优先返回有管理职级的
  const mgr = sorted.find((e: any) => isManagerRank(e));
  return mgr || sorted[0];
}

/**
 * 敏感动作门控（L3 禁止 / L2 事前确认 / L1 报备 / L0 自主）。
 * 返回阻断结果（deny / confirm）时调用方应直接结束本轮并回传；放行返回 null。
 */
function applySensitiveGate(
  userMessage: string,
  tenantId: number,
  initiatorUserId: number,
  onProgress?: (phase: string, detail: string, stepKey?: string) => void
): { finalContent: string; pendingReviewId?: number } | null {
  if (!FEATURE_FLAGS.ENABLE_HUMAN_IN_THE_LOOP) return null;
  // 用户职级从 employees.position_level_id 读取（users 表无 ai_level 列）
  const initiator = initiatorUserId
    ? (dbGet("SELECT e.position_level_id AS ai_level FROM employees e WHERE e.user_id = ? AND e.tenant_id = ?", [initiatorUserId, tenantId]) as any)
    : null;
  const actorLevel = initiator?.ai_level ?? 1;
  const gate = classifyRequestAuthorization({
    text: userMessage, tenantId, actorType: "human", actorId: initiatorUserId, actorLevel,
  });
  if (!gate.gated || !gate.result) return null;
  const r = gate.result;
  onProgress?.('gate_check', `🛡️ 治理门控：${r.reason}（级别 ${r.level}）`, `gate_check`);
  if (r.decision === "deny") {
    onProgress?.('gate_deny', r.feedback || "动作被治理引擎拒绝", `gate_deny`);
    return { finalContent: r.feedback || `⛔ 该请求被治理引擎拒绝：${r.reason}` };
  }
  if (r.decision === "confirm") {
    onProgress?.('gate_confirm', r.feedback || "需 L2 人工事前确认", `gate_confirm`);
    return {
      finalContent: `⏳ 该请求命中敏感动作（${r.sensitiveCategories.join("、")}），需 L2 人工事前确认。\n待审单号：${r.reviewId ?? ""}\n\n请人类批准后再重发本消息以继续执行。`,
      pendingReviewId: r.reviewId,
    };
  }
  if (r.decision === "report") {
    onProgress?.('gate_report', `📋 该动作已记录报备（${r.reason}）`, `gate_report`);
  }
  return null;
}

export async function runH2A2A2H(
  userMessage: string,
  chatEmployees: any[],
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId?: number,
  initiatorUserId?: number,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: {agentName?:string;agentRole?:string;content?:string;kind?:string;reasoning?:string;toolName?:string;toolSummary?:string}) => void
): Promise<H2A2A2HResult> {
  try {
    // 敏感动作门控
    const gateBlock = applySensitiveGate(userMessage, tenantId ?? 1, initiatorUserId ?? 0, onProgress as any);
    if (gateBlock) {
      return { steps: [], finalContent: gateBlock.finalContent, mode: "peer", pendingReviewId: gateBlock.pendingReviewId };
    }
    if (hasManager(chatEmployees)) {
      return await runHierarchicalMode(userMessage, chatEmployees, chatHistory, tenantId, initiatorUserId, onProgress);
    } else {
      return await runPeerMode(userMessage, chatEmployees, chatHistory, tenantId, initiatorUserId, onProgress);
    }
  } catch (error: any) {
    console.error("[AI] runH2A2A2H 崩溃:", error.message);
    return { steps: [], finalContent: "[系统] AI协作讨论服务暂时不可用，请稍后重试。", mode: "peer" };
  }
}

// ==================== V5: 智能路由 H2A2A2H（含分类感知 + 任务拆解） ====================

export interface H2A2A2HRoutingResult extends H2A2A2HResult {
  category: ConversationCategory;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  taskDecomposition?: TaskDecomposition;
}

/**
 * V5 智能H2A2A2H入口 — 含对话分类 + 优先级路由 + 任务拆解分发
 */
export async function runH2A2A2HWithRouting(
  userMessage: string,
  chatEmployees: any[],
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId: number = 1,
  initiatorUserId: number = 0,
  chatId: number = 0,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: {agentName?:string;agentRole?:string;content?:string;kind?:string;reasoning?:string;toolName?:string;toolSummary?:string}) => void
): Promise<H2A2A2HRoutingResult> {
  try {
    // Step 0: 敏感动作门控（L3 禁止 / L2 事前确认 / L1 报备 / L0 自主）
    const gateBlock = applySensitiveGate(userMessage, tenantId, initiatorUserId, onProgress as any);
    if (gateBlock) {
      return {
        steps: [],
        finalContent: gateBlock.finalContent,
        mode: "peer",
        category: "work_discussion" as any,
        priority: "HIGH",
        pendingReviewId: gateBlock.pendingReviewId,
      } as H2A2A2HRoutingResult;
    }

    // Step 1: 对话性质分类
    onProgress?.('classify_start', `🔬 智能路由引擎正在分析对话性质...`, `classify_start`);
    const classification = await classifyConversationIntent(userMessage, chatHistory, tenantId);
    onProgress?.('classify_done', `✓ 识别为【${classification.category}】· 优先级 ${classification.priority}`, `classify_done`);

    // Step 2: 记录分类决策到反思引擎
    if (tenantId && chatEmployees.length > 0) {
      try {
        recordRoutingDecision(
          tenantId,
          chatEmployees[0].id,
          classification.category,
          classification.priority,
          userMessage
        );
      } catch (auditErr: any) {
        console.warn("[AI] 路由决策记录失败（不影响主流程）:", auditErr.message);
      }
    }

    // Step 3: 任务拆解已由「编排 agent」在 subagent 委派时自行完成，不再走慢速的裸 LLM 文本拆解
    let taskDecomposition: TaskDecomposition | undefined;

    // Step 4: 按优先级路由
    if (classification.category === "casual") {
      onProgress?.('casual_mode', `💬 识别为闲聊，交由普通AI智能体自由互动`, `casual_mode`);
      // 实际生成闲聊回复（桥接到 onProgress 流式事件，由 chats.ts 落地为消息）
      await streamCasualChatResponse(chatEmployees, userMessage, chatHistory, tenantId, (emp, cb) => {
        const stepKey = `emp_${emp.id}_casual`;
        let reasoning = "";
        cb.onReasoning = (t) => { reasoning += t; onProgress?.("step_reasoning", t, stepKey); };
        cb.onToken = (t) => { onProgress?.("step_token", t, stepKey); };
        cb.onComplete = (full, r) => { onProgress?.("step_done", full, stepKey, { reasoning: r || reasoning }); };
        cb.onError = (e) => { onProgress?.("step_done", `[系统] 回复出错：${e?.message || e}`, stepKey); };
      });
      return {
        steps: [],
        finalContent: "",
        mode: "peer",
        category: classification.category,
        priority: classification.priority,
      };
    }

    // 工作相关 → 层级制协作（管理者文本拆解 + 执行者真 agent + 总结，走人在回路审核）
    if (hasManager(chatEmployees)) {
      onProgress?.('hierarchy_mode', `🏛️ 启用层级制协作模式（管理者+执行者协同）`, `hierarchy_mode`);
      const result = await runHierarchicalMode(userMessage, chatEmployees, chatHistory, tenantId, initiatorUserId, onProgress, chatId);
      return { ...result, category: classification.category, priority: classification.priority, taskDecomposition };
    }

    onProgress?.('peer_mode', `🤝 启用平级制协作模式（所有成员自由讨论）`, `peer_mode`);
    const result = await runPeerMode(userMessage, chatEmployees, chatHistory, tenantId, initiatorUserId, onProgress, chatId);
    return { ...result, category: classification.category, priority: classification.priority, taskDecomposition };
  } catch (error: any) {
    console.error("[AI] runH2A2A2HWithRouting 崩溃:", error.message, error.stack?.slice(0, 300));
    return {
      steps: [],
      finalContent: "[系统] AI协作讨论服务暂时不可用，请稍后重试。",
      mode: "peer",
      category: "work_discussion" as any,
      priority: "NORMAL",
    };
  }
}

// ==================== 模式A：层级制 ====================
async function runHierarchicalMode(
  userMessage: string,
  chatEmployees: any[],
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId: number = 1,
  initiatorUserId: number = 0,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: {agentName?:string;agentRole?:string;content?:string;kind?:string;reasoning?:string;toolName?:string;toolSummary?:string}) => void,
  chatId?: number,
): Promise<H2A2A2HResult> {
  try {
    // SaaS Token 记账 + 流式输出：本函数内所有 LLM 调用带租户并逐段推送思考/回答
    const llm = async (m: AIMessage[], tm = 0.7, mt = 1024, stepKey = ""): Promise<{ content: string; reasoning: string }> => {
      let content = "", reasoning = "";
      await callLLMStream(m, {
        onReasoning: (tk) => { reasoning += tk; if (stepKey) onProgress?.("step_reasoning", tk, stepKey); },
        onToken: (tk) => { content += tk; if (stepKey) onProgress?.("step_token", tk, stepKey); },
        onComplete: (c, r) => { content = c; reasoning = r; if (stepKey) onProgress?.("step_done", c, stepKey, { reasoning: r }); },
        onError: () => { content = "[系统] AI服务暂时不可用。"; },
      }, tm, mt, tenantId ?? 1);
      return { content, reasoning };
    };
    const manager = getHighestRankingManager(chatEmployees)!;
    const others = chatEmployees.filter(e => e.id !== manager.id);
    const steps: H2A2A2HStep[] = [];
    const managerPrompt = buildEmployeeSystemPrompt(manager);
    const teamInfo = chatEmployees.map(e => `${e.name}(${e.role}，擅长${e.skills || '通用'})`).join('、');

    // ═══ Step 1: 管理层领命、分析、拆解、分配 ═══
    onProgress?.('phase_divider', `━━ 📋 任务拆解与分工 ━━`, `phase_decompose`);
    onProgress?.('manager_analyzing', `👑 ${manager.name}(${manager.role}) 正在理解任务并拆解...`, `mgr_${manager.id}_analyze`);
    const assignResult = await llm([
      { role: "system", content: `${managerPrompt}\n\n你是本讨论的主持人和任务分配者。收到任务后：\n1. 分析任务目标和关键需求\n2. 拆解为具体可执行的子任务\n3. 根据团队成员专长分配任务\n4. 明确每项任务的交付标准\n\n团队成员：${teamInfo}\n\n回复格式：\n- 先确认理解任务目标\n- 列出拆解的子任务，每项标注负责人\n- 说明协作方式和预期产出\n- 请各位同事依次汇报` },
      ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content } as AIMessage)),
      { role: "user", content: userMessage },
    ], 0.5, 1024, `emp_${manager.id}_decompose`);

    steps.push({ type: "manager_assign", employee_name: manager.name, employee_role: manager.role, agent_type: manager.agent_type, content: assignResult.content });
    const assignBrief = assignResult.content.replace(/\*\*/g,'').replace(/\n/g,' ').slice(0,100);
    // ★ 推 manager 拆解成果（前端将作为独立卡片显示）
    onProgress?.('manager_assign_done', `📋 ${manager.name} 拆解完成 → ${others.map((e:any)=>e.name).join('、')} 各领任务（${assignBrief}…）`, `mgr_${manager.id}_assign_done`,
      { agentName: manager.name, agentRole: manager.role, content: assignResult.content, kind: 'decomposition' });

    // ═══ Step 2: 各执行者依次思考并回复 ═══
    onProgress?.('phase_divider', `━━ 💭 执行者独立分析与方案拟定 ━━`, `phase_think`);
    for (let ei = 0; ei < others.length; ei++) {
      const executor = others[ei];
      const executorPrompt = buildEmployeeSystemPrompt(executor);
      onProgress?.('exec_thinking', `💭 ${executor.name}(${executor.role}) 正在思考 [${ei+1}/${others.length}]…`, `emp_${executor.id}_think_${ei}`);

      const thinkResult = await llm([
        { role: "system", content: `${executorPrompt}\n\n请用一句话说明你将如何从你的专业角度处理这个任务。` },
        { role: "user", content: `任务：${userMessage}\n\n管理者${manager.name}的分配：${assignResult.content}` },
      ], 0.5, 150, `emp_${executor.id}_think`);

      steps.push({ type: "peer_think", employee_name: executor.name, employee_role: executor.role, agent_type: executor.agent_type, content: "", thinking: thinkResult.content });
      const thinkBrief = thinkResult.content.replace(/\*\*/g,'').slice(0,80);
      // ★ 推思考结果
      onProgress?.('exec_thinking_done', `💡 ${executor.name} 思路：${thinkBrief}${thinkResult.content.length>80?'…':''}`, `emp_${executor.id}_think_done_${ei}`,
        { agentName: executor.name, agentRole: executor.role, content: thinkResult.content, kind: 'thinking' });
      onProgress?.('exec_replying', `✏️ ${executor.name} 正在执行并撰写方案 [${ei+1}/${others.length}]…`, `emp_${executor.id}_reply_${ei}`);

      const replyResult = await runExecutorAgentReply(
        executor,
        `任务：${userMessage}\n\n管理者${manager.name}的分配：${assignResult.content}\n\n你的思考：${thinkResult.content}\n\n请从你的专业角度，针对任务给出具体可行、已用工具验证的方案。`,
        `emp_${executor.id}_reply`,
        tenantId,
        onProgress,
        chatId,
      );

      steps.push({ type: "peer_reply", employee_name: executor.name, employee_role: executor.role, agent_type: executor.agent_type, content: replyResult.content });
      const replyBrief = replyResult.content.replace(/\*\*/g,'').replace(/\n/g,' ').slice(0,80);
      // ★ 推方案完整内容（这是核心：前端立即显示一张独立成果卡）
      onProgress?.('exec_reply_done', `✅ ${executor.name} 方案交付（${replyResult.content.length}字）：${replyBrief}…`, `emp_${executor.id}_reply_done_${ei}`,
        { agentName: executor.name, agentRole: executor.role, content: replyResult.content, kind: 'solution' });
    }

    // ═══ Step 3: 管理者总结汇报 ═══
    onProgress?.('phase_divider', `━━ 📝 管理者汇总与结论 ━━`, `phase_summary`);
    onProgress?.('manager_summarizing', `📝 ${manager.name} 正在综合 ${others.length} 份方案并起草总结报告…`, `mgr_${manager.id}_summarize`);
    const allReplies = steps.filter(s => s.type === "peer_reply").map(s => `${s.employee_name}(${s.employee_role})：${s.content}`).join("\n\n");
    const summaryResult = await llm([
      { role: "system", content: `${managerPrompt}\n\n请汇总各位同事的回复，生成一份完整的总结报告。\n格式要求：\n1. 概括整体方案和结论\n2. 列出各成员的关键贡献要点\n3. 指出需要关注的风险点\n4. 给出明确的下一步行动计划\n5. 请指令发起者审核，如有修改意见请回复，如认可请回复"确认"\n\n保持专业、结构清晰。` },
      { role: "user", content: `原始任务：${userMessage}\n\n你的分配：${assignResult.content}\n\n各同事回复：\n${allReplies}` },
    ], 0.5, 1500, `emp_${manager.id}_summary`);

    steps.push({ type: "manager_summary", employee_name: manager.name, employee_role: manager.role, agent_type: manager.agent_type, content: summaryResult.content });
    // ★ 推最终总结成果
    onProgress?.('manager_summarizing_done', `📝 ${manager.name} 总结报告（${summaryResult.content.length}字）`, `mgr_${manager.id}_summarize_done`,
      { agentName: manager.name, agentRole: manager.role, content: summaryResult.content, kind: 'summary' });

    // [V4.1 人在回路] 将AI总结写入待审核表，不直接返回
    const reviewId = await dbRun(
      `INSERT INTO pending_reviews (tenant_id, review_type, initiator_user_id, ai_content, status)
       VALUES (?, 'h2a2a_summary', ?, ?, 'pending')`,
      [tenantId, initiatorUserId, JSON.stringify({ mode: "hierarchical", steps, finalContent: summaryResult.content })]
    );

    return {
      steps,
      finalContent: `⏳ AI讨论已完成，等待人类审核确认。\n审核ID：${reviewId.lastInsertRowid}\n\nAI总结预览：\n${summaryResult.content.slice(0, 500)}...`,
      mode: "hierarchical",
      pendingReviewId: reviewId.lastInsertRowid,
    };
  } catch (error: any) {
    console.error("[AI] runHierarchicalMode 崩溃:", error.message, error.stack?.slice(0, 300));
    return {
      steps: [],
      finalContent: "[系统] 层级制AI讨论服务暂时不可用，请稍后重试。",
      mode: "hierarchical",
    };
  }
}

// ==================== 模式B：平级制 ====================
async function runPeerMode(
  userMessage: string,
  chatEmployees: any[],
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId: number = 1,
  initiatorUserId: number = 0,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: {agentName?:string;agentRole?:string;content?:string;kind?:string;reasoning?:string;toolName?:string;toolSummary?:string}) => void,
  chatId?: number,
): Promise<H2A2A2HResult> {
  try {
    // SaaS Token 记账 + 流式输出：所有 LLM 调用带租户并逐段推送思考/回答
    const llm = async (m: AIMessage[], tm = 0.7, mt = 1024, stepKey = ""): Promise<{ content: string; reasoning: string }> => {
      let content = "", reasoning = "";
      await callLLMStream(m, {
        onReasoning: (tk) => { reasoning += tk; if (stepKey) onProgress?.("step_reasoning", tk, stepKey); },
        onToken: (tk) => { content += tk; if (stepKey) onProgress?.("step_token", tk, stepKey); },
        onComplete: (c, r) => { content = c; reasoning = r; if (stepKey) onProgress?.("step_done", c, stepKey, { reasoning: r }); },
        onError: () => { content = "[系统] AI服务暂时不可用。"; },
      }, tm, mt, tenantId);
      return { content, reasoning };
    };
    const steps: H2A2A2HStep[] = [];
    const teamInfo = chatEmployees.map(e => `${e.name}(${e.role}，擅长${e.skills || '通用'})`).join('、');

    // ═══ Step 1: 所有人同时思考 ═══
    onProgress?.('phase_divider', `━━ 💭 独立分析与观点碰撞 ━━`, `phase_peer_think`);
    const thinkPromises = chatEmployees.map(async (emp, idx) => {
      onProgress?.('peer_thinking_start', `💭 ${emp.name}(${emp.role}) 正在独立思考...`, `emp_${emp.id}_think_start`);
      const prompt = buildEmployeeSystemPrompt(emp);
      const result = await llm([
        { role: "system", content: `${prompt}\n\n请用一句话说明你对这个任务的理解和你的思考角度。` },
        { role: "user", content: `任务：${userMessage}\n\n团队成员：${teamInfo}` },
      ], 0.5, 150, `emp_${emp.id}_think`);
      const thinkBrief = result.content.replace(/\*\*/g,'').slice(0,80);
      onProgress?.('peer_thinking_done', `💡 ${emp.name}：${thinkBrief}${result.content.length>80?'…':''}`, `emp_${emp.id}_think_done`);
      return { employee: emp, thinking: result.content };
    });

    const thinkResults = await Promise.all(thinkPromises);
    for (const tr of thinkResults) {
      steps.push({ type: "peer_think", employee_name: tr.employee.name, employee_role: tr.employee.role, agent_type: tr.employee.agent_type, content: "", thinking: tr.thinking });
    }

    // ═══ Step 2: 一一回答 ═══
    onProgress?.('phase_divider', `━━ ✏️ 方案拟定与交付 ━━`, `phase_peer_reply`);
    const replies: { employee: any; content: string }[] = [];
    for (let ri = 0; ri < chatEmployees.length; ri++) {
      const emp = chatEmployees[ri];
      onProgress?.('peer_replying', `✏️ ${emp.name}(${emp.role}) 正在撰写方案 [${ri+1}/${chatEmployees.length}]…`, `emp_${emp.id}_reply_${ri}`);
      const prompt = buildEmployeeSystemPrompt(emp);
      const othersThink = thinkResults.filter(t => t.employee.id !== emp.id).map(t => `${t.employee.name}(${t.employee.role})的思考：${t.thinking}`).join('\n');

      const result = await runExecutorAgentReply(
        emp,
        `任务：${userMessage}\n\n你的思考：${thinkResults.find(t => t.employee.id === emp.id)?.thinking}\n\n其他同事的思考：\n${othersThink}\n\n请从你的专业角度，针对任务给出具体可行、已用工具验证的方案。`,
        `emp_${emp.id}_reply`,
        tenantId,
        onProgress,
        chatId,
      );

      replies.push({ employee: emp, content: result.content });
      steps.push({ type: "peer_reply", employee_name: emp.name, employee_role: emp.role, agent_type: emp.agent_type, content: result.content });
      const replyBrief = result.content.replace(/\*\*/g,'').replace(/\n/g,' ').slice(0,80);
      onProgress?.('peer_reply_done', `✅ ${emp.name} 方案交付（${result.content.length}字）：${replyBrief}…`, `emp_${emp.id}_reply_done_${ri}`);
    }

    // ═══ Step 3: 互相点评 ═══
    onProgress?.('phase_divider', `━━ 🔍 交叉评审与反馈 ━━`, `phase_peer_review`);
    for (let rvi = 0; rvi < chatEmployees.length; rvi++) {
      const reviewer = chatEmployees[rvi];
      onProgress?.('peer_reviewing', `🔍 ${reviewer.name}(${reviewer.role}) 审阅同事方案 [${rvi+1}/${chatEmployees.length}]…`, `emp_${reviewer.id}_review_${rvi}`);
      const prompt = buildEmployeeSystemPrompt(reviewer);
      const othersReplies = replies.filter(r => r.employee.id !== reviewer.id).map(r => `${r.employee.name}(${r.employee.role})的方案：${r.content}`).join('\n\n');
      const ownReply = replies.find(r => r.employee.id === reviewer.id)?.content || "";

      const reviewResult = await llm([
        { role: "system", content: `${prompt}\n\n请对其他同事的方案进行点评。\n要求：\n- 指出每个方案的优点和可改进之处\n- 从你的专业角度提出补充建议\n- 保持专业和建设性` },
        { role: "user", content: `任务：${userMessage}\n\n你的方案：${ownReply}\n\n其他同事的方案：\n${othersReplies}` },
      ], 0.7, 800, `emp_${reviewer.id}_review`);

      steps.push({ type: "peer_review", employee_name: reviewer.name, employee_role: reviewer.role, agent_type: reviewer.agent_type, content: reviewResult.content });
      onProgress?.('peer_review_done', `✓ ${reviewer.name} 评审完成`, `emp_${reviewer.id}_review_done_${rvi}`);
    }

    // ═══ Step 4: 综合所有意见，形成最终结论 ═══
    onProgress?.('phase_divider', `━━ 📝 综合汇总与结论 ━━`, `phase_consolidate`);
    onProgress?.('consolidating', `📝 会议记录员正在综合全部讨论，起草最终结论…`, `emp_0_final`);
    const allContent = replies.map(r => `${r.employee.name}(${r.employee.role})：${r.content}`).join('\n\n');
    const allReviews = steps.filter(s => s.type === "peer_review").map(s => `${s.employee_name}的点评：${s.content}`).join('\n\n');

    const finalResult = await llm([
      { role: "system", content: `你是会议记录员。请综合所有讨论内容，生成一份最终结论。\n格式：\n1. 概括各方观点的核心要点\n2. 综合各方案的优势\n3. 指出达成的共识和分歧\n4. 给出建议的下一步行动\n5. 请指令发起者审核，如有修改意见请回复，如认可请回复"确认"` },
      { role: "user", content: `议题：${userMessage}\n\n各方方案：\n${allContent}\n\n互相点评：\n${allReviews}` },
    ], 0.5, 1500, `emp_0_final`);

    steps.push({ type: "manager_summary", employee_name: "综合", employee_role: "会议记录", agent_type: "default", content: finalResult.content });

    // [V4.1 人在回路] 将AI总结写入待审核表，不直接返回
    const reviewId = await dbRun(
      `INSERT INTO pending_reviews (tenant_id, review_type, initiator_user_id, ai_content, status)
       VALUES (?, 'h2a2a_summary', ?, ?, 'pending')`,
      [tenantId, initiatorUserId, JSON.stringify({ mode: "peer", steps, finalContent: finalResult.content })]
    );

    return {
      steps,
      finalContent: `⏳ AI讨论已完成，等待人类审核确认。\n审核ID：${reviewId.lastInsertRowid}\n\nAI总结预览：\n${finalResult.content.slice(0, 500)}...`,
      mode: "peer",
      pendingReviewId: reviewId.lastInsertRowid,
    };
  } catch (error: any) {
    console.error("[AI] runPeerMode 崩溃:", error.message, error.stack?.slice(0, 300));
    return {
      steps: [],
      finalContent: "[系统] 平级制AI讨论服务暂时不可用，请稍后重试。",
      mode: "peer",
    };
  }
}

// 生成会议纪要
export async function generateMeetingMinutes(
  userMessage: string,
  chatEmployees: any[],
  h2a2a2hResult: H2A2A2HResult
): Promise<string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const participants = chatEmployees.map(e => `${e.name}(${e.role})`).join('、');
  
  const discussionContent = h2a2a2hResult.steps
    .filter(s => s.type !== "peer_think")
    .map(s => `【${s.employee_name}·${s.employee_role}】：${s.content}`)
    .join("\n\n");

  const result = await callLLM([
    { role: "system", content: `你是一位专业的会议记录员。请根据以下讨论内容，生成一份标准的企业会议纪要。

会议纪要格式要求：
1. 使用markdown格式
2. 包含以下章节：
   - 会议基本信息（时间、参会人、主持人）
   - 会议议题
   - 讨论要点摘要（每个议题的3-5个关键讨论点，不要照搬原文）
   - 决议事项（明确的决定和结论，用编号列表）
   - 行动计划（表格形式：序号、任务内容、责任人、截止日期、交付物）
   - 备注（如有需要补充说明的事项）

写作要求：
- 语言精炼、专业，使用企业正式文体
- 讨论要点要提炼核心观点，不要逐字记录
- 决议事项要明确、可执行
- 行动计划要具体、可追踪
- 过滤掉emoji图标和markdown标记符号
- 表格使用标准markdown格式` },
    { role: "user", content: `会议主题：${userMessage}

参会人员：${participants}

讨论内容：
${discussionContent}

最终结论：${h2a2a2hResult.finalContent}` }
  ], 0.3, 2000);

  return `# 会议纪要

${result.content}

---

**记录时间**：${dateStr} ${timeStr}
**生成方式**：雄元智脑XYOS AI会议纪要引擎`;
}

// 单聊
export async function getSingleEmployeeResponse(
  employee: any,
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId?: number
): Promise<string> {
  const systemPrompt = buildEmployeeSystemPrompt(employee);
  const tid = tenantId ?? employee.tenant_id ?? 1;

  // 记忆注入：历史对话经验 + 长期沉淀，让单聊 AI 员工有连续记忆
  let memoryBlock = "";
  try {
    const long = getLongMemories(employee.id, 3, tid);
    const short = getShortMemories(employee.id, 6, tid);
    const mems = [...long, ...short].slice(0, 8);
    if (mems.length) {
      memoryBlock = "\n\n【你的历史记忆（供参考，延续之前的讨论与经验）】\n" +
        mems.map((m: any, i: number) => `${i + 1}. ${String(m.content || "").slice(0, 200)}`).join("\n");
    }
  } catch (memErr: any) {
    console.warn("[AI] 记忆注入失败:", memErr.message);
  }

  // 执行能力声明：单聊 AI 员工具备沙箱真实执行能力
  const capabilityNote = `\n\n【你的执行能力】你在 雄元智脑XYOS 的受控沙箱中具备真实执行能力：可进行计算、生成/处理文件、编写代码、数据分析、生成报告等。当用户请求这类需要动手完成的任务时，直接执行并在回复中给出结果与产出位置；执行记录可追溯。`;

  const messages: AIMessage[] = [
    { role: "system", content: `${systemPrompt}${memoryBlock}${capabilityNote}\n\n${WORK_RESPONSE_INSTRUCTION}\n\n请用中文回复，保持专业，结构清晰。` },
    ...chatHistory.slice(-8).map(m => ({ role: m.role, content: m.content } as AIMessage)),
    { role: "user", content: userMessage },
  ];
  const result = await callLLM(messages, 0.7, 2500, tid);
  return result.content;
}

/** 构建单聊 AI 员工的完整系统消息（记忆 + 能力声明复用）。 */
function buildSingleEmployeeMessages(
  employee: any,
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId?: number
): AIMessage[] {
  const systemPrompt = buildEmployeeSystemPrompt(employee);
  const tid = tenantId ?? employee.tenant_id ?? 1;
  let memoryBlock = "";
  try {
    const long = getLongMemories(employee.id, 3, tid);
    const short = getShortMemories(employee.id, 6, tid);
    const mems = [...long, ...short].slice(0, 8);
    if (mems.length) {
      memoryBlock = "\n\n【你的历史记忆（供参考，延续之前的讨论与经验）】\n" +
        mems.map((m: any, i: number) => `${i + 1}. ${String(m.content || "").slice(0, 200)}`).join("\n");
    }
  } catch { /* 记忆注入失败不影响回复 */ }
  const capabilityNote = `\n\n【你的执行能力】你在 雄元智脑XYOS 的受控沙箱中具备真实执行能力：可进行计算、生成/处理文件、编写代码、数据分析、生成报告等。当用户请求这类需要动手完成的任务时，直接执行并在回复中给出结果与产出位置；执行记录可追溯。`;
  return [
    { role: "system", content: `${systemPrompt}${memoryBlock}${capabilityNote}\n\n${WORK_RESPONSE_INSTRUCTION}\n\n请用中文回复，保持专业，结构清晰。` },
    ...chatHistory.slice(-8).map(m => ({ role: m.role, content: m.content } as AIMessage)),
    { role: "user", content: userMessage },
  ];
}

/**
 * 流式单聊 AI 员工响应（复刻 DSH 思考过程 + 逐步生成）。
 * onReasoning：思考过程逐段；onToken：回答逐段；onComplete(content, reasoning)。
 */
export async function streamSingleEmployeeResponse(
  employee: any,
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId: number,
  callbacks: StreamCallbacks,
  runKey?: string,
): Promise<void> {
  // 业务空间的对话必须使用“系统设置 → AI 大模型”的同一条通道；
  // DSH 的独立 credentials/profile 仅属于开发空间，不能作为 XYOS 配置的旁路。
  const messages = buildSingleEmployeeMessages(employee, userMessage, chatHistory, tenantId);
  await callLLMStream(messages, callbacks, 0.7, 2500, tenantId);
}

/** 构建单聊员工 system prompt（人设 + 历史记忆 + 执行能力说明）。 */
function buildSingleEmployeeSystemPrompt(employee: any, tenantId: number): string {
  const base = buildEmployeeSystemPrompt(employee);
  let memoryBlock = "";
  try {
    const long = getLongMemories(employee.id, 3, tenantId);
    const short = getShortMemories(employee.id, 6, tenantId);
    const mems = [...long, ...short].slice(0, 8);
    if (mems.length) {
      memoryBlock = "\n\n【你的历史记忆（供参考，延续之前的讨论与经验）】\n" +
        mems.map((m: any, i: number) => `${i + 1}. ${String(m.content || "").slice(0, 200)}`).join("\n");
    }
  } catch { /* 记忆注入失败不影响回复 */ }
  const capabilityNote = `\n\n【你的执行能力】你在 雄元智脑XYOS 的受控沙箱中具备真实执行能力：可搜索、读文件、写文件、跑命令、编写代码、数据分析、生成报告。当用户请求需要动手完成的任务时，用工具真实执行，并在回复中给出结果。`;
  return `${base}${memoryBlock}${capabilityNote}\n\n【回复纪律】用中文、简洁克制、直接给结论和结果，避免长篇空话；能用工具验证的必须先真实执行再下结论，禁止编造；每条结论尽量有依据（文件/搜索结果/命令输出）。`;
}

/**
 * 群聊 H2A2A2H 的执行者回复升级为「真 agent」：驱动该员工的持久 DSH agent，
 * 把思考/工具/正文映射到 onProgress 的 step_reasoning / step_token / step_tool / step_done。
 */
async function runExecutorAgentReply(
  employee: any,
  task: string,
  stepKey: string,
  tenantId: number,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: { agentName?: string; agentRole?: string; content?: string; kind?: string; reasoning?: string; toolName?: string; toolSummary?: string }) => void,
  chatId?: number,
): Promise<{ content: string; reasoning: string }> {
  const persona = buildSingleEmployeeSystemPrompt(employee, tenantId);
  let reasoning = "";
  let content = "";
  try {
    await callLLMStream([
      { role: "system", content: `${persona}\n\n【执行纪律】严格遵从 H2A2A2H 治理要求：仅输出建议、方案和待审核结论；不得把草稿当作已执行的正式业务动作。` },
      { role: "user", content: task },
    ], {
      onReasoning: (text) => { reasoning += text; onProgress?.("step_reasoning", text, stepKey); },
      onToken: (text) => { content += text; onProgress?.("step_token", text, stepKey); },
      onError: (error) => { throw error; },
    }, 0.6, 2500, tenantId);
    onProgress?.("step_done", content, stepKey, { reasoning });
    return { content, reasoning };
  } catch (err: any) {
    content = safeErrorReply(err, tenantId).message;
    onProgress?.("step_done", content, stepKey, { reasoning });
    return { content, reasoning };
  }
}

/**
 * 群聊 H2A2A2H 的管理者升级为「带 subagent 工具的编排 agent」：
 * 一个团队人设的指挥官 agent，用 subagent 工具 spawn 各员工子 agent 委派任务，再汇总。
 * 思考/工具/正文映射到 onProgress 的 step_reasoning / step_token / step_tool / step_done。
 */
async function runManagerOrchestration(
  manager: any,
  chatEmployees: any[],
  userMessage: string,
  chatId: number,
  tenantId: number,
  onProgress?: (phase: string, detail: string, stepKey?: string, agentResult?: { agentName?: string; agentRole?: string; content?: string; kind?: string; reasoning?: string; toolName?: string; toolSummary?: string }) => void
): Promise<{ content: string; reasoning: string }> {
  const teamRoster = chatEmployees
    .map((e) => `- ${e.name}（${e.role}，擅长${e.skills || '通用'}）`)
    .join('\n');
  const persona = `你是「${manager.name} · ${manager.role}」，一家管理咨询公司的 AI 高管，负责指挥你的 AI 下属团队协作完成任务。

【你的团队】
${teamRoster}

【工作纪律】
1. 收到任务后先简要拆解，然后用 subagent 工具把子任务委派给对应下属并行执行。
2. 调用 subagent 时：description 写下属的「姓名·职位」，prompt 里先写下属人设（"你是{姓名}，{职位}，{职责}"），再写要完成的子任务。
3. 委派后等待结果，汇总所有下属的产出，形成结构清晰、可直接执行的总结报告。
4. 用中文，简洁克制，直接给结论和结果，禁止编造；能用工具验证的必须真实执行。`;

  const stepKey = `mgr_${manager.id}_orchestrate`;
  let reasoning = "";
  let content = "";
  try {
    await callLLMStream([
      { role: "system", content: `${persona}\n\n【治理约束】编排只能生成待审核方案；权限、流程与最终决定仍由 H2A2A2H 和人类复核控制。` },
      { role: "user", content: `任务：${userMessage}` },
    ], {
      onReasoning: (text) => { reasoning += text; onProgress?.("step_reasoning", text, stepKey); },
      onToken: (text) => { content += text; onProgress?.("step_token", text, stepKey); },
      onError: (error) => { throw error; },
    }, 0.6, 3000, tenantId);
    onProgress?.("step_done", content, stepKey, { reasoning });
    return { content, reasoning };
  } catch (err: any) {
    content = `[系统] 编排失败：${err?.message || err}`;
    onProgress?.("step_done", content, stepKey, { reasoning });
    return { content, reasoning };
  }
}

// 检测是否为闲聊消息
export function isCasualChat(content: string): boolean {
  const c = content.trim();

  // 继续执行（承接上一次未完成任务）→ 非闲聊
  if (/^(继续|接着说|继续啊|接着来|接着讲|继续做|接着说下去|go\s*on|continue|继续完成|请继续)/i.test(c)) return false;

  // 先检查是否包含任务关键词 — 有任何任务意图就不算闲聊
  const taskPatterns = [
    /[请帮需](你我大家)?(分析|设计|开发|实现|完成|准备|整理|检查|处理|安排|规划|制定|优化|改进|评估|调研|给出|提供)/,
    /(任务|工作|项目|方案|报告|文档|计划|需求|问题|bug|故障|规划|指令|命令|要求)/,
    /(什么时候|何时|截止|deadline|紧急|尽快|优先|期限)/,
    /(负责人|责任人|跟进|跟踪|汇报|反馈|负责)/,
    /(各位|大家).{0,5}(给|提供|分析|建议|意见|看法|回复|回答)/,
    /(创建|新建|删除|修改|更新|查询|搜索|导出|导入|配置|设置)/,
    /(库存|资产|预算|报表|统计|数据|合同|审批|流程)/,
    /(怎么做|怎么办|如何.*处理|什么.*方案|什么.*建议)/,
  ];
  if (taskPatterns.some(p => p.test(c))) return false;

  // 极短消息（<6字）视为可能闲聊（如"你好"、"在吗"）
  if (c.length < 6) return true;

  const casualPatterns = [
    /^(大家好|各位好|早上好|下午好|晚上好|早安|晚安|你好|嗨|哈喽|hello|hi)\b/,
    /^(哈哈|呵呵|嘻嘻|嗯嗯|好的好的|收到收到)\b/,
    /(今天天气|周末|下班|吃饭|午饭|晚饭|咖啡|茶|辛苦了|加油|保重|放假)/,
    /(最近怎么样|忙不忙|还好吗|近况)/,
    /(恭喜|祝贺|生日快乐|节日快乐|新年好|节日)/,
    /(聊聊|闲聊|随便说说|没事|没啥事|闲着)/,
  ];
  const isCasual = casualPatterns.some(p => p.test(c));

  // 中等长度（6-15字）且不匹配任何闲聊模式 → 可能是简短指令，不算闲聊
  if (c.length < 16 && !isCasual) return false;

  // 长篇但纯闲聊 → 算闲聊
  return isCasual;
}

// 检测是否为点名/查岗消息
export function isCheckIn(content: string): boolean {
  const checkInPatterns = [
    /^(都在吗|都在不|都.*在.*吗|各位.*在.*吗|大家.*在.*吗|有人吗|人呢|冒泡|报.*到|点名)/,
    /(齐了没|到齐|都到了|出来|吱一声|露.*脸)/,
  ];
  const c = content.trim();
  return checkInPatterns.some(p => p.test(c)) && c.length < 30;
}

// 闲聊模式回复
export async function getCasualChatResponse(
  employees: any[],
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId = 1,
): Promise<{ employee: any; content: string }[]> {
  const responses: { employee: any; content: string }[] = [];
  
  // 查岗模式：所有人都简短回复
  if (isCheckIn(userMessage)) {
    for (const emp of employees) {
      const systemPrompt = buildEmployeeSystemPrompt(emp);
      const checkInPrompt = `同事在群里问"${userMessage}"，请简短回应你在岗。注意：只说你自己的状态，不要说其他同事在做什么。直接说"在的"或"在，随时待命"之类，不要编造任何你正在做的事情。回复一句话即可。`;
      const result = await callLLM([
        { role: "system", content: `${systemPrompt}\n\n${checkInPrompt}` },
      ], 0.3, 50, tenantId);
      responses.push({ employee: emp, content: result.content });
    }
    return responses;
  }

  const casualPrompt = `你是一位职场同事，正在工作群聊中参与轻松的日常交流。

要求：
- 语气友好、自然，但保持职场专业性
- 不要过于口语化（避免"哈哈"、"嘿嘿"等过度语气词）
- 不要主动关联工作任务，除非对方明确提及
- 回复简短（1-3句话即可）
- 可以适当表达关心、分享工作感悟、或回应对方的情绪
- 如果对方打招呼，礼貌回应即可
- 不要使用emoji表情
- 绝对禁止编造自己正在做的事情（如"刚完成XX"），除非确实在历史对话中提到过
- 绝对禁止替其他同事发言或猜测其他同事的状态`;
  
  // 非查岗闲聊：随机选2人回复避免刷屏（真正闲聊场景2人足够）
  const respondingCount = Math.min(2, employees.length);
  const selectedEmployees = employees.sort(() => Math.random() - 0.5).slice(0, respondingCount);
  
  for (const emp of selectedEmployees) {
    const systemPrompt = buildEmployeeSystemPrompt(emp);
    const result = await callLLM([
      { role: "system", content: `${systemPrompt}\n\n${casualPrompt}` },
      ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content } as AIMessage)),
      { role: "user", content: userMessage },
    ], 0.7, 1000, tenantId);
    
    responses.push({ employee: emp, content: result.content });
  }
  
  return responses;
}

/**
 * 流式闲聊回复（复刻 DSH 思考+打字机）。
 * onEmployee(emp, callbacks)：每个参与回复的员工拿到流式回调（onReasoning/onToken/onComplete），
 * 调用方在其上绑定消息推送逻辑。
 */
export async function streamCasualChatResponse(
  employees: any[],
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  tenantId: number,
  onEmployee: (emp: any, callbacks: StreamCallbacks) => void
): Promise<void> {
  // 查岗模式：所有人都简短回复
  if (isCheckIn(userMessage)) {
    for (const emp of employees) {
      const systemPrompt = buildEmployeeSystemPrompt(emp);
      const checkInPrompt = `同事在群里问"${userMessage}"，请简短回应你在岗。注意：只说你自己的状态，不要说其他同事在做什么。直接说"在的"或"在，随时待命"之类，不要编造任何你正在做的事情。回复一句话即可。`;
      const cb: StreamCallbacks = {};
      onEmployee(emp, cb);
      await callLLMStream([{ role: "system", content: `${systemPrompt}\n\n${checkInPrompt}` }], cb, 0.3, 50, tenantId);
    }
    return;
  }

  const casualPrompt = `你是一位职场同事，正在工作群聊中参与轻松的日常交流。

要求：
- 语气友好、自然，但保持职场专业性
- 不要过于口语化（避免"哈哈"、"嘿嘿"等过度语气词）
- 不要主动关联工作任务，除非对方明确提及
- 回复简短（1-3句话即可）
- 可以适当表达关心、分享工作感悟、或回应对方的情绪
- 如果对方打招呼，礼貌回应即可
- 不要使用emoji表情
- 绝对禁止编造自己正在做的事情（如"刚完成XX"），除非确实在历史对话中提到过
- 绝对禁止替其他同事发言或猜测其他同事的状态`;

  // 非查岗闲聊：随机选2人回复避免刷屏
  const respondingCount = Math.min(2, employees.length);
  const selectedEmployees = [...employees].sort(() => Math.random() - 0.5).slice(0, respondingCount);

  for (const emp of selectedEmployees) {
    const systemPrompt = buildEmployeeSystemPrompt(emp);
    const cb: StreamCallbacks = {};
    onEmployee(emp, cb);
    await callLLMStream([
      { role: "system", content: `${systemPrompt}\n\n${casualPrompt}` },
      ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content } as AIMessage)),
      { role: "user", content: userMessage },
    ], cb, 0.7, 1000, tenantId);
  }
}

// 获取AI员工回复
export async function getAgentResponse(
  agentType: string,
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[],
  context?: string
): Promise<AIResponse> {
  const systemPrompt = getAgentSystemPrompt(agentType);
  const contextPart = context ? `\n\n上下文信息：${context}` : '';
  
  const messages: AIMessage[] = [
    { role: "system", content: `${systemPrompt}\n\n${WORK_RESPONSE_INSTRUCTION}${contextPart}` },
    ...chatHistory.slice(-8).map(m => ({ role: m.role, content: m.content } as AIMessage)),
    { role: "user", content: userMessage },
  ];
  
  return callLLM(messages, 0.7, 2500);
}

// 任务分解
export async function decomposeTask(title: string, description: string): Promise<any[]> {
  const messages: AIMessage[] = [
    { role: "system", content: `你是任务分解专家。请将以下任务分解为可执行的子任务。

要求：
1. 每个子任务应该是独立的、可执行的
2. 子任务之间应该有清晰的依赖关系
3. 每个子任务应该有明确的完成标准
4. 子任务数量控制在3-8个

请以JSON数组格式返回，每个子任务包含：
- title: 子任务标题
- description: 子任务描述
- priority: 优先级 (high/medium/low)
- estimated_hours: 预估工时
- dependencies: 依赖的子任务标题数组` },
    { role: "user", content: `任务标题：${title}\n任务描述：${description || '无'}` },
  ];
  
  const result = await callLLM(messages, 0.5, 2000);
  
  try {
    // 尝试解析JSON
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [{ title: "待分解", description: result.content, priority: "medium", estimated_hours: 4, dependencies: [] }];
  } catch {
    return [{ title: "待分解", description: result.content, priority: "medium", estimated_hours: 4, dependencies: [] }];
  }
}

// 生成摘要
export async function generateSummary(content: string): Promise<string> {
  const messages: AIMessage[] = [
    { role: "system", content: `你是专业的内容摘要专家。请生成简洁、准确的摘要。

要求：
1. 摘要应该涵盖主要内容和关键信息
2. 长度控制在200-500字
3. 保持客观、专业的语气
4. 使用结构化格式（如分点、标题等）` },
    { role: "user", content: `请为以下内容生成摘要：\n\n${content}` },
  ];
  
  const result = await callLLM(messages, 0.3, 1000);
  return result.content;
}

// 情感分析
export async function analyzeSentiment(text: string): Promise<{ sentiment: string; confidence: number; analysis: string }> {
  const messages: AIMessage[] = [
    { role: "system", content: `你是情感分析专家。请分析以下文本的情感倾向。

请返回JSON格式：
{
  "sentiment": "positive/negative/neutral",
  "confidence": 0.0-1.0,
  "analysis": "分析说明"
}` },
    { role: "user", content: `请分析以下文本的情感：\n\n${text}` },
  ];
  
  const result = await callLLM(messages, 0.3, 500);
  
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { sentiment: "neutral", confidence: 0.5, analysis: result.content };
  } catch {
    return { sentiment: "neutral", confidence: 0.5, analysis: result.content };
  }
}

// 构建消息
export function buildMessages(
  systemPrompt: string,
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[] = [],
  maxHistory: number = 8
): AIMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...chatHistory.slice(-maxHistory).map(m => ({ role: m.role, content: m.content } as AIMessage)),
    { role: "user", content: userMessage },
  ];
}

// ═══════════════════════════════════════════════════════════
// V4.3 ReAct 推理入口（委托给 react-agent.ts）
// 提供统一入口，支持 Feature Flag 控制
// ═══════════════════════════════════════════════════════════

export interface ReActRunConfig {
  /** 最大推理轮次（默认5，防止无限循环） */
  maxRounds?: number;
  /** 温度参数 */
  temperature?: number;
  /** 租户 ID */
  tenantId?: number;
  /** Agent ID */
  agentId?: number;
  /** 聊天 ID */
  chatId?: number;
  /** 用户 ID */
  userId?: number;
  /** 每轮回调 */
  onRound?: (round: {
    round: number;
    thought: string;
    action?: { tool: string; args: Record<string, any> };
    observation?: string;
    isFinal: boolean;
  }) => void;
}

export interface ReActRunResult {
  finalAnswer: string;
  rounds: Array<{
    round: number;
    thought: string;
    action?: { tool: string; args: Record<string, any> };
    observation?: string;
    isFinal: boolean;
  }>;
  totalToolCalls: number;
  totalTokens: number;
  stoppedByLimit: boolean;
}

/**
 * ReAct 推理入口函数
 * 如果 ENABLE_REACT 未开启，回退到普通 LLM 调用
 */
export async function runReAct(
  query: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  config: ReActRunConfig = {}
): Promise<ReActRunResult> {
  const { FEATURE_FLAGS } = await import("../config/features");

  if (!FEATURE_FLAGS.ENABLE_REACT) {
    // 回退到普通 LLM 调用
    const result = await callLLM([
      { role: "system", content: "你是雄元科技的AI助手，请专业、准确地回答用户问题。" },
      ...history.map(m => ({ role: m.role, content: m.content } as AIMessage)),
      { role: "user", content: query },
    ], config.temperature || 0.7, 1024);

    return {
      finalAnswer: result.content,
      rounds: [{ round: 1, thought: "ReAct 未启用，使用普通 LLM 调用。", isFinal: true }],
      totalToolCalls: 0,
      totalTokens: result.tokens_used,
      stoppedByLimit: false,
    };
  }

  // 委托给 react-agent.ts 的 runReAct
  const { runReAct: reactRun } = await import("./react-agent");
  return reactRun(query, history, {
    maxRounds: config.maxRounds,
    temperature: config.temperature,
    onRound: config.onRound,
  }, {
    tenantId: config.tenantId!,  // 调用方必须传入，多租户隔离
    agentId: config.agentId || 0,
    chatId: config.chatId,
    userId: config.userId || 0,
  });
}
