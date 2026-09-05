/**
 * XYOS V4.3 — ReAct 推理引擎
 * Thought → Action → Observation 循环
 * 支持多轮推理，最大轮次可配置
 */
import { callLLM, AIMessage } from "./ai";
import { ToolRegistry, ToolContext } from "./tool-registry";
import { dbRun } from "../db";
import { FEATURE_FLAGS } from "../config/features";

export interface ReActConfig {
  /** 最大推理轮次（防止无限循环） */
  maxRounds?: number;
  /** 温度参数 */
  temperature?: number;
  /** 工具调用超时（毫秒） */
  toolTimeout?: number;
  /** 推理过程回调 */
  onRound?: (round: ReActRound) => void;
}

export interface ReActRound {
  round: number;
  thought: string;
  action?: {
    tool: string;
    args: Record<string, any>;
  };
  observation?: string;
  isFinal: boolean;
}

export interface ReActResult {
  /** 最终答案 */
  finalAnswer: string;
  /** 所有推理轮次 */
  rounds: ReActRound[];
  /** 总工具调用次数 */
  totalToolCalls: number;
  /** 总 token 用量 */
  totalTokens: number;
  /** 是否因超限而停止 */
  stoppedByLimit: boolean;
}

const REACT_SYSTEM_PROMPT = `你是一个智能推理代理（ReAct Agent），使用"思考-行动-观察"模式解决问题。

## 推理格式

每次回复必须严格遵循以下格式：

**思考（Thought）**：
分析当前情况，判断下一步需要什么信息或执行什么操作。

**行动（Action）**：
如果需要调用工具，使用以下格式：
\`\`\`tool_call
{
  "tool": "工具名称",
  "args": { ... }
}
\`\`\`

**最终答案（Final Answer）**：
当你已经收集到足够的信息，可以给出最终答案时，使用以下格式：
\`\`\`final_answer
你的最终答案（使用 Markdown 格式，结构清晰）
\`\`\`

## 规则
1. 每轮只能调用一个工具或给出最终答案
2. 工具返回的结果将在下一轮作为"观察"提供给你
3. 最多进行 {maxRounds} 轮推理，之后必须给出最佳答案
4. 如果工具调用失败，分析原因并尝试其他方法
5. 保持思考过程透明，让用户理解你的推理逻辑

## 可用工具
{toolsDescription}`;

/**
 * 解析 LLM 回复中的 tool_call 或 final_answer
 */
function parseResponse(content: string): {
  thought: string;
  toolCall?: { tool: string; args: Record<string, any> };
  finalAnswer?: string;
} {
  const result: {
    thought: string;
    toolCall?: { tool: string; args: Record<string, any> };
    finalAnswer?: string;
  } = { thought: "" };

  // 提取思考部分
  const thoughtMatch = content.match(/思考[（(]Thought[)）][：:]\s*([\s\S]*?)(?=行动[（(]|最终答案|```tool_call|```final_answer|$)/i);
  if (thoughtMatch) {
    result.thought = thoughtMatch[1].trim();
  }

  // 提取工具调用
  const toolMatch = content.match(/```tool_call\s*\n([\s\S]*?)\n```/);
  if (toolMatch) {
    try {
      const parsed = JSON.parse(toolMatch[1]);
      result.toolCall = {
        tool: parsed.tool,
        args: parsed.args || {},
      };
    } catch {
      // JSON 解析失败，忽略
    }
  }

  // 提取最终答案
  const finalMatch = content.match(/```final_answer\s*\n([\s\S]*?)\n```/);
  if (finalMatch) {
    result.finalAnswer = finalMatch[1].trim();
  }

  // 如果上述都没匹配到，尝试简单匹配
  if (!result.thought && !result.toolCall && !result.finalAnswer) {
    result.thought = content.slice(0, 500);
    // 尝试找最终答案关键词
    const answerIdx = content.search(/最终答案|final\s*answer/i);
    if (answerIdx >= 0) {
      result.finalAnswer = content.slice(answerIdx).replace(/最终答案[：:]?\s*|final\s*answer[：:]?\s*/i, "").trim();
    }
  }

  return result;
}

/**
 * 构建可用工具的描述文本
 */
function buildToolsDescription(): string {
  const tools = ToolRegistry.getOpenAIFormat();
  if (tools.length === 0) {
    return "暂无可用工具。请直接基于你的知识给出答案。";
  }

  return tools.map((t) => {
    const params = t.function.parameters?.properties
      ? Object.entries(t.function.parameters.properties)
          .map(([key, val]: [string, any]) => {
            const required = t.function.parameters.required?.includes(key) ? "（必填）" : "（可选）";
            return `  - ${key}${required}: ${val.description || val.type}`;
          })
          .join("\n")
      : "  无参数";

    return `### ${t.function.name}
${t.function.description}
参数：
${params}`;
  }).join("\n\n");
}

/**
 * ReAct 推理主函数
 */
export async function runReAct(
  userQuery: string,
  chatHistory: { role: "user" | "assistant"; content: string }[] = [],
  config: ReActConfig = {},
  context: ToolContext = {}
): Promise<ReActResult> {
  const {
    maxRounds = 5,
    temperature = 0.5,
    onRound,
  } = config;

  const rounds: ReActRound[] = [];
  let totalTokens = 0;
  let totalToolCalls = 0;
  let stoppedByLimit = false;

  // 构建系统提示
  const toolsDescription = buildToolsDescription();
  const systemPrompt = REACT_SYSTEM_PROMPT
    .replace("{maxRounds}", String(maxRounds))
    .replace("{toolsDescription}", toolsDescription);

  // 构建初始消息
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content } as AIMessage)),
    { role: "user", content: userQuery },
  ];

  let round = 0;
  let finalAnswer = "";

  while (round < maxRounds && !finalAnswer) {
    round++;

    // 调用 LLM
    const llmResponse = await callLLM(messages, temperature, 1500);
    totalTokens += llmResponse.tokens_used;

    // 解析回复
    const parsed = parseResponse(llmResponse.content);
    const reactRound: ReActRound = {
      round,
      thought: parsed.thought || llmResponse.content.slice(0, 300),
      isFinal: false,
    };

    // 有工具调用
    if (parsed.toolCall && !parsed.finalAnswer) {
      const { tool, args } = parsed.toolCall;
      reactRound.action = { tool, args };

      // 执行工具
      const toolResult = await ToolRegistry.execute(tool, args, context);
      totalToolCalls++;
      reactRound.observation = toolResult.text;

      // 将工具结果作为观察加入消息历史
      messages.push({ role: "assistant", content: llmResponse.content });
      messages.push({
        role: "user",
        content: `观察（Observation）：\n工具 ${tool} 执行结果：${toolResult.text}\n\n请继续推理。`,
      });

      // 记录推理日志
      try {
        dbRun(
          `INSERT INTO agent_reasoning_logs (tenant_id, agent_id, chat_id, reasoning_type, thought, action, observation, round_number)
           VALUES (?, ?, ?, 'react', ?, ?, ?, ?)`,
          [
            context.tenantId || 1,
            context.agentId || 0,
            context.chatId || null,
            reactRound.thought?.slice(0, 500),
            JSON.stringify({ tool, args }),
            toolResult.text?.slice(0, 500),
            round,
          ]
        );
      } catch (auditErr: any) {
        console.warn(`[ReAct] 推理日志写入失败:`, auditErr.message);
      }

    } else if (parsed.finalAnswer) {
      // 有最终答案
      reactRound.isFinal = true;
      finalAnswer = parsed.finalAnswer;
    } else {
      // 没有工具调用也没有最终答案，将整个回复作为最终答案
      reactRound.isFinal = true;
      finalAnswer = llmResponse.content;
    }

    rounds.push(reactRound);
    onRound?.(reactRound);

    // 如果已有最终答案，退出循环
    if (finalAnswer) break;
  }

  // 如果达到最大轮次仍未给出最终答案
  if (!finalAnswer) {
    stoppedByLimit = true;
    // 强制要求 LLM 给出答案
    messages.push({
      role: "user",
      content: "你已达到最大推理轮次。请基于目前已收集的所有信息，给出你的最佳答案（使用 final_answer 格式）。",
    });
    const lastResponse = await callLLM(messages, 0.3, 800);
    totalTokens += lastResponse.tokens_used;
    finalAnswer = lastResponse.content;

    rounds.push({
      round: round + 1,
      thought: "已达到最大推理轮次，基于已有信息给出答案。",
      isFinal: true,
    });
  }

  return {
    finalAnswer,
    rounds,
    totalToolCalls,
    totalTokens,
    stoppedByLimit,
  };
}

/**
 * 简化的 ReAct 推理（无回调）
 */
export async function reactReasoning(
  query: string,
  context?: ToolContext
): Promise<string> {
  if (!FEATURE_FLAGS.ENABLE_REACT) {
    // Fallback: 普通 LLM 调用
    const result = await callLLM([
      { role: "system", content: "你是雄元科技的AI助手，请专业、准确地回答用户问题。" },
      { role: "user", content: query },
    ]);
    return result.content;
  }

  const reactResult = await runReAct(query, [], {}, context);
  return reactResult.finalAnswer;
}

export default { runReAct, reactReasoning };
