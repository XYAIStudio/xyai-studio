import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { getAgentResponse, decomposeTask, generateSummary, analyzeSentiment, buildMessages, callLLM, callLLMStream, sanitizeLLMInput, AIMessage } from "../services/ai";
import { runReAct } from "../services/react-agent";
import { FEATURE_FLAGS } from "../config/features";
import { dbAll, dbGet, dbRun } from "../db";

// 统一错误脱敏
function safeErr(err: any): string {
  if (typeof err === "string") return "服务器内部错误";
  return "服务器内部错误";
}

/** SSE token 安全写入：转义可能破坏协议的内容 */
function sseWrite(res: any, data: Record<string, unknown>): void {
  const json = JSON.stringify(data);
  // 将 \n\n 替换为 \n \n，防止破坏 SSE 帧边界
  const safe = json.replace(/\n/g, "\\n");
  res.write(`data: ${safe}\n\n`);
}

/** 允许的报告类型白名单 */
const ALLOWED_REPORT_TYPES = ["task_summary", "employee_summary", "daily_report"];

/** ReAct 最大推理轮次上限 */
const MAX_REACT_ROUNDS = 20;

export const aiRoutes = Router();
aiRoutes.use(authenticate);

aiRoutes.post("/chat", async (req: AuthRequest, res) => {
  try {
    const { message, agentType, chatId, context } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "消息内容必填" });

    const sanitizedMsg = sanitizeLLMInput(String(message));
    const sanitizedCtx = context ? sanitizeLLMInput(String(context)) : undefined;

    const history: any[] = [];
    if (chatId) {
      const messages = dbAll(
        "SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10",
        [chatId, req.user!.tenant_id]
      );
      for (const m of messages.reverse() as any[]) {
        history.push({
          role: m.sender_type === "user" ? "user" : "assistant",
          content: m.content,
        });
      }
    }

    const response = await getAgentResponse(
      agentType || "ceo",
      sanitizedMsg,
      history,
      sanitizedCtx
    );

    res.json({
      success: true,
      data: {
        content: response.content,
        tokens_used: response.tokens_used,
        model: response.model,
        ai_generated: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

// ═══════════════════════════════════════════════════════════
// V4.3 流式聊天端点（Server-Sent Events）
// ═══════════════════════════════════════════════════════════
aiRoutes.post("/chat/stream", async (req: AuthRequest, res) => {
  try {
    const { message, agentType, chatId, context } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: "消息内容必填" });
      return;
    }

    if (!FEATURE_FLAGS.ENABLE_STREAMING) {
      // 降级：回退到非流式
      const fallback = await getAgentResponse(agentType || "ceo", sanitizeLLMInput(String(message)), [], context ? sanitizeLLMInput(String(context)) : undefined);
      res.json({ success: true, data: { content: fallback.content, ai_generated: true, streamed: false } });
      return;
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sanitizedMsg = sanitizeLLMInput(String(message));
    const sanitizedCtx = context ? sanitizeLLMInput(String(context)) : undefined;

    const history: { role: "user" | "assistant"; content: string }[] = [];
    if (chatId) {
      const msgs = dbAll(
        "SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10",
        [chatId, req.user!.tenant_id]
      );
      for (const m of (msgs as any[]).reverse()) {
        history.push({ role: m.sender_type === "user" ? "user" : "assistant", content: m.content });
      }
    }

    const messages: AIMessage[] = [
      ...history.map(m => ({ role: m.role, content: m.content } as AIMessage)),
      { role: "user", content: sanitizedMsg },
    ];

    // 如果是特定 Agent 类型，注入系统提示
    // @ts-expect-error R0-P0-09: sanitizedCtx 传递为上下文字符串，非标准 chatHistory 数组
    const systemMsg = buildMessages(agentType || "ceo", sanitizedMsg, sanitizedCtx);
    const fullMessages = [...systemMsg.filter((m: AIMessage) => m.role === "system"), ...messages];

    await callLLMStream(fullMessages, {
      onToken: (token: string) => {
        sseWrite(res, { token });
      },
      onComplete: (fullContent: string) => {
        sseWrite(res, { done: true, fullContent });
        res.end();
      },
      onError: (_error: Error) => {
        const trialExpired = _error.message.includes("TRIAL_EXPIRED");
        sseWrite(res, trialExpired
          ? { error: "15 分钟试用已结束，正在引导您配置自有模型", code: "TRIAL_EXPIRED" }
          : { error: "服务器内部错误，请稍后重试" });
        res.end();
      },
    });

  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: safeErr(err) });
    } else {
      sseWrite(res, { error: safeErr(err) });
      res.end();
    }
  }
});

// ═══════════════════════════════════════════════════════════
// V4.3 ReAct 推理端点
// ═══════════════════════════════════════════════════════════
aiRoutes.post("/react", async (req: AuthRequest, res) => {
  try {
    const { message, chatId, maxRounds: rawMaxRounds, temperature } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "消息内容必填" });

    // 安全约束：maxRounds 上限 20，防止恶意或误操作导致无限推理
    const maxRounds = Math.min(Math.max(parseInt(rawMaxRounds) || 5, 1), MAX_REACT_ROUNDS);

    if (!FEATURE_FLAGS.ENABLE_REACT) {
      return res.status(400).json({ success: false, error: "ReAct 推理模式未启用，请设置 ENABLE_REACT=true" });
    }

    const history: { role: "user" | "assistant"; content: string }[] = [];
    if (chatId) {
      const msgs = dbAll(
        "SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10",
        [chatId, req.user!.tenant_id]
      );
      for (const m of (msgs as any[]).reverse()) {
        history.push({ role: m.sender_type === "user" ? "user" : "assistant", content: m.content });
      }
    }

    const result = await runReAct(
      sanitizeLLMInput(String(message)),
      history,
      { maxRounds, temperature: temperature || 0.5 },
      { tenantId: req.user!.tenant_id, userId: req.user!.id, chatId }
    );

    res.json({
      success: true,
      data: {
        finalAnswer: result.finalAnswer,
        rounds: result.rounds,
        totalToolCalls: result.totalToolCalls,
        totalTokens: result.totalTokens,
        stoppedByLimit: result.stoppedByLimit,
        ai_generated: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.post("/decompose-task", async (req: AuthRequest, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "任务标题必填" });

    const subtasks = await decomposeTask(sanitizeLLMInput(title), sanitizeLLMInput(description || ""));
    res.json({ success: true, data: { subtasks, ai_generated: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.post("/summarize", async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "内容必填" });

    const summary = await generateSummary(sanitizeLLMInput(String(content)));
    res.json({ success: true, data: { summary, ai_generated: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.post("/analyze", async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: "文本必填" });

    const result = await analyzeSentiment(sanitizeLLMInput(String(text)));
    res.json({ success: true, data: { ...result, ai_generated: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.get("/agents", (req: AuthRequest, res) => {
  try {
    const agents = dbAll(
      "SELECT id, name, role, agent_type, skills, avatar_emoji FROM employees WHERE employee_type = 'ai' AND tenant_id = ? AND status = 'active'",
      [req.user!.tenant_id]
    );
    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.post("/generate-report", async (req: AuthRequest, res) => {
  try {
    const { type, params } = req.body;
    // 白名单校验：仅允许预定义报告类型
    if (!ALLOWED_REPORT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `不支持的报表类型: ${type}，支持的类型: ${ALLOWED_REPORT_TYPES.join(", ")}` });
    }
    const tid = req.user!.tenant_id;

    let context = "";

    if (type === "task_summary") {
      const tasks = dbAll(
        "SELECT t.*, e.name as assignee_name FROM tasks t LEFT JOIN employees e ON t.assigned_to = e.id WHERE t.tenant_id = ?",
        [tid]
      );
      context = `当前任务列表：\n${(tasks as any[]).map(t => `- ${t.title} (${t.status}, ${t.priority}, 负责人: ${t.assignee_name || '未分配'})`).join("\n")}`;
    } else if (type === "employee_summary") {
      const employees = dbAll(
        `SELECT e.*, 
          (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'done') as completed
         FROM employees e WHERE e.tenant_id = ? AND e.status = 'active'`,
        [tid]
      );
      context = `当前员工列表：\n${(employees as any[]).map(e => `- ${e.name} (${e.role}, 已完成${e.completed}个任务)`).join("\n")}`;
    } else if (type === "daily_report") {
      const tasks = dbAll("SELECT * FROM tasks WHERE tenant_id = ?", [tid]) as any[];
      const messages = dbGet("SELECT COUNT(*) as c FROM messages WHERE tenant_id = ?", [tid]) as any;
      context = `今日数据：总任务${tasks.length}个，已完成${tasks.filter(t => t.status === 'done').length}个，进行中${tasks.filter(t => t.status === 'in_progress').length}个，消息${messages.c}条`;
    }

    const prompt = params?.prompt ? sanitizeLLMInput(String(params.prompt)) : `请基于以下数据生成一份${type === 'daily_report' ? '日报' : type === 'task_summary' ? '任务报告' : '人员报告'}：\n\n${context}`;

    const response = await callLLM([
      { role: "system", content: "你是企业报告生成专家，请基于数据生成专业、结构化的报告。使用Markdown格式。" },
      { role: "user", content: prompt },
    ]);

    res.json({ success: true, data: { report: response.content, ai_generated: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});

aiRoutes.post("/suggest-assignee", async (req: AuthRequest, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "任务标题必填" });

    const employees = dbAll(
      `SELECT e.id, e.name, e.role, e.skills, e.agent_type,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = e.id AND status = 'in_progress') as active_tasks
       FROM employees e
       WHERE e.tenant_id = ? AND e.employee_type = 'ai' AND e.status = 'active'
       ORDER BY active_tasks ASC`,
      [req.user!.tenant_id]
    );

    const context = `可用AI员工：\n${(employees as any[]).map(e => `- ${e.name}(${e.role}, 技能: ${e.skills}, 当前任务数: ${e.active_tasks})`).join("\n")}`;

    const response = await callLLM([
      { role: "system", content: "你是任务分配专家，请根据任务需求和员工技能匹配最合适的执行者。只返回员工ID。" },
      { role: "user", content: `任务：${sanitizeLLMInput(title)}\n描述：${sanitizeLLMInput(description || "无")}\n\n${context}\n\n请推荐1-2位最合适的员工ID（用逗号分隔）：` },
    ]);

    const ids = response.content.match(/\d+/g)?.map(Number) || [];
    const suggested = (employees as any[]).filter(e => ids.includes(e.id));

    res.json({ success: true, data: { suggested, ai_generated: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: safeErr(err) });
  }
});
