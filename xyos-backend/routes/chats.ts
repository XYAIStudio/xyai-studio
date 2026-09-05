import { Router } from "express";
import { dbAll, dbGet, dbRun } from "../db";
import { authenticate, AuthRequest } from "../middleware";
import { getSingleEmployeeResponse, streamSingleEmployeeResponse, streamCasualChatResponse, runH2A2A2H, runH2A2A2HWithRouting, generateMeetingMinutes, isCasualChat, getCasualChatResponse } from "../services/ai";
import { broadcastToChat } from "../services/websocket";
import { logActivity, notifyChatMention } from "../services/notification";
import { saveShortMemory } from "../services/memory";
import { AuditTrailEngine } from "../services/audit-trail";
import { assertTokenLimit } from "../services/plan-gate";
import { detectDeepExecutionIntent, runDeepExecution } from "../services/chat-dsh-bridge";
import { classifyHumanControl } from "../services/human-oversight";
import { rebuildChatTree } from "../services/h2a2a2h-tree";
import { onPhase, shadowFinalize } from "../services/h2a2a2h-shadow";
import { isComplexTask, resolveRelevantEmployees, pickHost, markCollabActive, markCollabDone, isCollabActive } from "../services/chat-routing";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import PDFDocument from "pdfkit";

export const chatRoutes = Router();

/** 估算文本的 token 数（中文 1 字 ≈ 1 token，英文 4 字符 ≈ 1 token，统一按字符 × 0.9 保守估算）。 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length * 0.9));
}

function cleanMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim();
}

function parseTextRuns(text: string, fontSize: number = 22): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: fontSize }));
    }
    runs.push(new TextRun({ text: match[1], bold: true, size: fontSize }));
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: fontSize }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text: cleanMarkdown(text), size: fontSize })];
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line.split("|").filter(cell => cell.trim() !== "").map(cell => cell.trim());
}

type ChatAccess = Record<string, any> & { member_role: string };

function getChatAccess(req: AuthRequest, rawChatId: unknown): ChatAccess | null {
  const chatId = Number(rawChatId);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return null;
  return dbGet(
    `SELECT c.*, cm.role AS member_role
     FROM chats c
     INNER JOIN chat_members cm ON cm.chat_id = c.id AND cm.tenant_id = c.tenant_id
     WHERE c.id = ? AND c.tenant_id = ? AND cm.user_id = ?`,
    [chatId, req.user!.tenant_id, req.user!.id]
  ) as ChatAccess | null;
}

function requireChatMember(req: AuthRequest, res: any, rawChatId: unknown): ChatAccess | null {
  const chat = getChatAccess(req, rawChatId);
  if (!chat) {
    res.status(404).json({ success: false, error: "聊天不存在或无访问权限" });
    return null;
  }
  return chat;
}

function requireChatManager(req: AuthRequest, res: any, rawChatId: unknown): ChatAccess | null {
  const chat = requireChatMember(req, res, rawChatId);
  if (!chat) return null;
  if (!['admin', 'owner'].includes(chat.member_role)) {
    res.status(403).json({ success: false, error: "需要群管理权限" });
    return null;
  }
  return chat;
}

chatRoutes.use(authenticate);

chatRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const chats = dbAll(
      `SELECT c.*,
        (SELECT content FROM messages WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT sender_name FROM messages WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_sender,
        (SELECT created_at FROM messages WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) as member_count,
        (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.deleted_at IS NULL AND m.id > COALESCE((SELECT last_read_message_id FROM chat_read_markers WHERE chat_id = c.id AND user_id = ?), 0)) as unread_count
       FROM chats c
       INNER JOIN chat_members self_member ON self_member.chat_id = c.id
         AND self_member.tenant_id = c.tenant_id AND self_member.user_id = ?
       WHERE c.tenant_id = ? ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
      [req.user!.id, req.user!.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: chats });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const { title, type, employee_ids } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });
    const chatType = type || "group";
    const employeeIds = Array.isArray(employee_ids)
      ? [...new Set(employee_ids.map((id: unknown) => Number(id)).filter(id => Number.isSafeInteger(id) && id > 0))]
      : [];
    if (Array.isArray(employee_ids) && employeeIds.length !== employee_ids.length) {
      return res.status(400).json({ success: false, error: "AI员工编号无效" });
    }
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => "?").join(",");
      const existingEmployees = dbAll(
        `SELECT id FROM employees WHERE tenant_id = ? AND employee_type = 'ai' AND status = 'active' AND id IN (${placeholders})`,
        [req.user!.tenant_id, ...employeeIds]
      ) as Array<{ id: number }>;
      if (existingEmployees.length !== employeeIds.length) {
        return res.status(400).json({ success: false, error: "存在无效、停用或非本集团的AI员工" });
      }
    }
    const result = dbRun(
      "INSERT INTO chats (company_id, title, type, created_by, tenant_id) VALUES (?, ?, ?, ?, ?)",
      [1, title, chatType, req.user!.id, req.user!.tenant_id]
    );
    const chatId = result.lastInsertRowid;
    dbRun("INSERT INTO chat_members (chat_id, user_id, role, tenant_id, joined_at) VALUES (?, ?, 'admin', ?, datetime('now'))", [chatId, req.user!.id, req.user!.tenant_id]);
    if (employeeIds.length) {
      for (const eid of employeeIds) {
        dbRun("INSERT INTO chat_members (chat_id, employee_id, role, tenant_id, joined_at) VALUES (?, ?, 'member', ?, datetime('now'))", [chatId, eid, req.user!.tenant_id]);
      }
    }
    res.json({ success: true, data: { id: chatId } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    res.json({ success: true, data: chat });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    if (!requireChatManager(req, res, req.params.id)) return;
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "标题必填" });
    dbRun("UPDATE chats SET title = ? WHERE id = ? AND tenant_id = ?", [title, req.params.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    dbRun("DELETE FROM messages WHERE chat_id = ? AND tenant_id = ?", [chat.id, req.user!.tenant_id]);
    dbRun("DELETE FROM chat_members WHERE chat_id = ? AND tenant_id = ?", [chat.id, req.user!.tenant_id]);
    dbRun("DELETE FROM chats WHERE id = ? AND tenant_id = ?", [chat.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.get("/:id/stats", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const tenantId = req.user!.tenant_id;
    // 整个对话累计 token 消耗
    const totalRow = dbGet("SELECT COALESCE(SUM(tokens),0) as t FROM messages WHERE chat_id = ? AND tenant_id = ?", [chatId, tenantId]) as any;
    // 最近一次 AI 回复的 token
    const lastRow = dbGet("SELECT tokens FROM messages WHERE chat_id = ? AND tenant_id = ? AND sender_type = 'employee' AND tokens > 0 ORDER BY id DESC LIMIT 1", [chatId, tenantId]) as any;
    // 当前上下文占用（最近 20 条消息的估算，含思考过程）
    const recent = dbAll("SELECT content, reasoning FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 20", [chatId, tenantId]) as any[];
    const contextUsed = recent.reduce((s: number, m: any) => s + estimateTokens(String(m.content || "") + String(m.reasoning || "")), 0);
    const contextLimit = 128000;
    res.json({
      success: true,
      data: {
        total_tokens: totalRow?.t || 0,
        last_tokens: lastRow?.tokens || 0,
        context_used: contextUsed,
        context_limit: contextLimit,
        context_percent: Math.round((contextUsed / contextLimit) * 1000) / 10,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// V1.0 呈现层：Turn→Step→Block 四级层级树（Task→Phase→Contribution→Block）
chatRoutes.get("/:id/tree", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const tree = rebuildChatTree(chat.id, req.user!.tenant_id);
    res.json({ success: true, data: tree });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

chatRoutes.get("/:id/messages", (req: AuthRequest, res) => {  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const limit = parseInt(req.query.limit as string) || 100;
    const messages = dbAll(
      "SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ?",
      [chat.id, req.user!.tenant_id, limit]
    );
    const enrichedMessages = (messages as any[]).map(msg => {
      const reactions = dbAll(
        "SELECT mr.emoji, COUNT(*) as count, GROUP_CONCAT(u.nickname) as users FROM message_reactions mr LEFT JOIN users u ON mr.user_id = u.id AND u.tenant_id = mr.tenant_id WHERE mr.message_id = ? AND mr.tenant_id = ? GROUP BY mr.emoji",
        [msg.id, req.user!.tenant_id]
      );
      let reply_to: any = null;
      if (msg.reply_to_id) {
        const replied = dbGet("SELECT sender_name, content FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [msg.reply_to_id, chat.id, req.user!.tenant_id]) as any;
        if (replied) reply_to = { sender_name: replied.sender_name, content: replied.content };
      }
      return { ...msg, reactions, reply_to };
    });
    res.json({ success: true, data: { chat, messages: enrichedMessages } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 判断是否需要触发新一轮H2A2A2H
function shouldTriggerH2A2A2H(recentMessages: any[]): boolean {
  // 找到最后一条AI消息
  const lastAiMsg = [...recentMessages].reverse().find(m => m.sender_type === "employee");
  if (!lastAiMsg) return true; // 没有AI消息，需要触发

  // 如果最后一条是总结或会议纪要，说明一轮讨论结束
  if (lastAiMsg.message_type === "ai_summary" || lastAiMsg.message_type === "meeting_minutes") {
    return true; // 用户回复了，需要新一轮讨论
  }

  // 如果最后一条是用户消息且之前没有AI回复，需要触发
  const lastMsg = recentMessages[recentMessages.length - 1];
  if (lastMsg.sender_type === "user") return true;

  return false;
}

// 判断用户是否在确认（结束讨论）
function isUserConfirming(content: string): boolean {
  const confirmWords = ["确认", "没问题", "可以", "同意", "通过", "ok", "OK", "好的", "就这样", "定稿", "结束"];
  const c = content.trim().toLowerCase();
  return confirmWords.some(w => c.includes(w) || c === w);
}

// 判断用户是否在驳回/要求修改（带理由重做）
function isUserRejecting(content: string): boolean {
  const rejectWords = ["驳回", "不同意", "不行", "重做", "重来", "修改", "改一下", "重写", "不通过", "重新做", "不对", "reject", "revise"];
  const c = content.trim().toLowerCase();
  return rejectWords.some(w => c.includes(w));
}

chatRoutes.post("/:id/messages", async (req: AuthRequest, res) => {
  try {
    const { content, reply_to_id } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "内容必填" });

    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;

    // 保存用户消息
    const userMsgResult = dbRun(
      "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reply_to_id, tenant_id) VALUES (?, ?, 'user', ?, ?, ?, ?)",
      [chatId, req.user!.id, req.user!.nickname, content, reply_to_id || null, req.user!.tenant_id]
    );

    // 查询被引用消息用于广播
    let replyToData: any = null;
    if (reply_to_id) {
      const repliedMsg = dbGet("SELECT id, sender_name, content FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [reply_to_id, chatId, req.user!.tenant_id]) as any;
      if (repliedMsg) {
        replyToData = { sender_name: repliedMsg.sender_name, content: repliedMsg.content };
      }
    }

    // V0.50：群聊内容仅属于沙箱对话，不能自动发布至正式知识中心。

    logActivity({ userId: req.user!.id, action: "message_sent", entityType: "chat", entityId: chatId, tenantId: req.user!.tenant_id });

    // 审计归档：记录用户消息
    AuditTrailEngine.archiveMessage({
      tenantId: req.user!.tenant_id,
      chatId: chatId,
      messageId: userMsgResult.lastInsertRowid,
      senderType: 'user',
      senderId: req.user!.id,
      senderName: req.user!.nickname,
      content: content,
      messageType: 'text',
      createdAt: new Date().toISOString()
    });

    broadcastToChat(chatId, {
      type: "new_message",
      chatId,
      message: { id: userMsgResult.lastInsertRowid, sender_type: "user", sender_name: req.user!.nickname, content, reply_to_id: reply_to_id || null, reply_to: replyToData, created_at: new Date().toISOString() },
    }, req.user!.id);

    // ========== [P3 人机混聊] 叫停 / 纠偏锚点（人类最终话语权） ==========
    {
      const control = classifyHumanControl(content);
      if (control.type === "stop") {
        const { isRunActive, requestAbort } = await import("../services/dsh-host");
        const runKey = `chat-${chatId}`;
        const wasActive = isRunActive(runKey);
        if (wasActive) requestAbort(runKey);
        const note = wasActive ? "⏹️ 已叫停当前 AI 讨论，等待你的新指令。" : "ℹ️ 当前没有运行中的 AI 任务，无需叫停。";
        const stopMsg = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', '系统', ?, 'ai_progress', ?)",
          [chatId, note, req.user!.tenant_id]
        );
        broadcastToChat(chatId, { type: "new_message", chatId, message: { id: stopMsg.lastInsertRowid, sender_type: "system", sender_name: "系统", content: note, message_type: "ai_progress", phase: "stopped", created_at: new Date().toISOString() } });
        const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: allMessages, stopped: wasActive });
      }
      if (control.type === "steer") {
        const { isRunActive, requestSteer } = await import("../services/dsh-host");
        const runKey = `chat-${chatId}`;
        if (isRunActive(runKey)) {
          const ok = requestSteer(runKey, `【人类纠偏指令】${content}`);
          const note = ok ? `🎯 已注入纠偏锚点：${content}` : "⚠️ 纠偏锚点注入失败，已按普通消息处理";
          const steerMsg = dbRun(
            "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', '系统', ?, 'ai_progress', ?)",
            [chatId, note, req.user!.tenant_id]
          );
          broadcastToChat(chatId, { type: "new_message", chatId, message: { id: steerMsg.lastInsertRowid, sender_type: "system", sender_name: "系统", content: note, message_type: "ai_progress", phase: "steered", created_at: new Date().toISOString() } });
          const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
          return res.json({ success: true, data: allMessages, steered: ok });
        }
        // 无运行中的 turn → 落入正常流程，纠偏作为普通消息进入下一轮讨论
      }
    }

    // ========== ZCode式实时思考进度追踪：用户消息一旦入库立即开启 ==========
    const sendStart = Date.now();
    let aiProgressSeq = 0; // 步骤序号，前端用于稳定追踪
    const pushProgress = (phase: string, detail: string, stepKey?: string, agentResult?: any) => {
      aiProgressSeq++;
      const dbRun2 = dbRun;
      try {
        const ins = dbRun2(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', ?, ?, 'ai_progress', ?)",
          [chatId, "AI进度", detail, req.user!.tenant_id]
        );
        broadcastToChat(chatId, {
          type: "new_message",
          chatId,
          message: {
            id: ins.lastInsertRowid,
            sender_type: "system",
            sender_name: "AI进度",
            content: detail,
            message_type: "ai_progress",
            phase,
            step_key: stepKey || (phase + "_" + aiProgressSeq),
            step_seq: aiProgressSeq,
            elapsed_ms: Date.now() - sendStart,
            agent_result: agentResult || null,
            created_at: new Date().toISOString()
          },
        });
      } catch(e) {
        console.error("[AI进度] 广播失败:", e);
      }
    };

    // 立即广播起始步骤（先于任何判断分支，确保用户一按下发送就能看见进度）
    pushProgress("receiving", "📡 已接收消息，正在识别协作团队...", "receiving");

    // 获取聊天成员中的AI员工
    const chatEmployees = dbAll(
      `SELECT e.* FROM employees e INNER JOIN chat_members cm ON cm.employee_id = e.id AND cm.tenant_id = e.tenant_id WHERE cm.chat_id = ? AND cm.tenant_id = ? AND e.employee_type = 'ai' AND e.status = 'active'`,
      [chatId, req.user!.tenant_id]
    ) as any[];

    if (chatEmployees.length === 0) {
      pushProgress("empty", "⚠️ 当前群聊尚未添加AI协作成员", "empty");
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages });
    }

    pushProgress("team_identified", `👥 已识别协作团队：${chatEmployees.map((e:any)=>e.name).join("、")}（${chatEmployees.length}位成员）`, "team_identified");

    // V1.1 协作进行中：人类插话/新消息 → 注入运行中的协作（编排者/执行者实时知悉），不触发新协作（排队）
    {
      const { requestSteer } = await import("../services/dsh-host");
      const runKey = `chat-${chatId}`;
      if (isCollabActive(chatId)) {
        requestSteer(runKey, `【人类插话补充】${content}`);
        pushProgress("interrupt_injected", "💬 检测到 AI 协作进行中，你的消息已注入当前协作（相关同事会实时知悉），协作完成后可继续追问", "interrupt_injected");
        const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: allMessages, queued: true });
      }
    }

    // V4: 检测 @提及，如果 @了特定员工，仅该员工回复
    const mentionMatch = content.match(/@(\S+)/);
    let mentionedEmployee: any = null;
    if (mentionMatch && chat.type === "group") {
      const mentionedName = mentionMatch[1];
      mentionedEmployee = chatEmployees.find((e: any) => 
        e.name === mentionedName || e.name.includes(mentionedName)
      );
      if (mentionedEmployee) {
        console.log(`[Chat] @${mentionedName} → ${mentionedEmployee.name}`);
      }
    }

    // V4: @提及模式 — 仅被@的员工回复
    if (mentionedEmployee) {
      pushProgress("mention_start", `🎯 检测到 @${mentionedEmployee.name}(${mentionedEmployee.role})，将直接由该员工回复`, "mention_start");
      // H2A2A2H 深度执行：执行类任务委派 DSH 在租户沙箱执行（异步，结果回群）
      if (detectDeepExecutionIntent(content)) {
        pushProgress("dsh_exec", "🔧 检测到执行类任务，委派 DeepSeek Harness 在沙箱执行...", "dsh_exec");
        void runDeepExecution({ chatId, tenantId: req.user!.tenant_id, employee: mentionedEmployee, task: content });
        const execMsgs = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: execMsgs, deep_execution: true, mentioned: mentionedEmployee.name });
      }
      const historyRows = dbAll("SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10", [chatId, req.user!.tenant_id]) as any[];
      const chatHistory = historyRows.reverse().map(m => ({ role: m.sender_type === "user" ? "user" as const : "assistant" as const, content: m.content }));
      pushProgress("mention_reasoning", `💭 ${mentionedEmployee.name} 正在思考...`, "mention_reasoning");
      // 流式回复：复刻 DSH 思考过程 + 逐步生成（先插占位，WebSocket 逐段推送）
      const senderName = `${mentionedEmployee.name} · ${mentionedEmployee.role}`;
      const placeholder = dbRun("INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reasoning, message_type, tenant_id) VALUES (?, ?, 'employee', ?, '', '', 'ai_mention', ?)", [chatId, mentionedEmployee.id, senderName, req.user!.tenant_id]);
      const msgId = placeholder.lastInsertRowid;
      void streamSingleEmployeeResponse(mentionedEmployee, content, chatHistory, req.user!.tenant_id, {
        onReasoning: (t) => broadcastToChat(chatId, { type: "stream_reasoning", chatId, messageId: msgId, token: t }),
        onToken: (t) => broadcastToChat(chatId, { type: "stream_token", chatId, messageId: msgId, token: t }),
        onComplete: (full, reasoning) => {
          dbRun("UPDATE messages SET content = ?, reasoning = ?, tokens = ? WHERE id = ?", [full, reasoning, estimateTokens((reasoning||"") + (full||"")), msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId, content: full, reasoning });
          if (full.length > 10) saveShortMemory(mentionedEmployee.id, 'conversation', full, undefined, { chat_id: chatId, message_id: msgId }, req.user!.tenant_id);
        },
        onError: (e) => {
          dbRun("UPDATE messages SET content = ? WHERE id = ?", [`[系统] AI 回复出错：${e.message}`, msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId });
        },
      });

      // 如果被@的员工有关联人类用户，发送通知
      const linkedUser = dbGet("SELECT user_id FROM chat_members WHERE chat_id = ? AND employee_id = ? AND user_id IS NOT NULL", [chatId, mentionedEmployee.id]) as any;
      if (linkedUser) {
        notifyChatMention(chatId, chat.title, linkedUser.user_id, req.user!.nickname);
      }
      
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages, mentioned: mentionedEmployee.name, streaming: true, messageId: msgId });
    }

    // 单聊模式
    if (chat.type === "single" || chatEmployees.length === 1) {
      const employee = chatEmployees[0];
      pushProgress("single_start", `💬 单聊模式：${employee.name}(${employee.role}) 正在独立分析...`, "single_start");
      // H2A2A2H 深度执行：执行类任务委派 DSH 在租户沙箱执行（异步，结果回群）
      if (detectDeepExecutionIntent(content)) {
        pushProgress("dsh_exec", "🔧 检测到执行类任务，委派 DeepSeek Harness 在沙箱执行...", "dsh_exec");
        void runDeepExecution({ chatId, tenantId: req.user!.tenant_id, employee, task: content });
        const execMsgs = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: execMsgs, deep_execution: true });
      }
      const historyRows = dbAll("SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10", [chatId, req.user!.tenant_id]) as any[];
      const chatHistory = historyRows.reverse().map(m => ({ role: m.sender_type === "user" ? "user" as const : "assistant" as const, content: m.content }));
      // 流式回复：复刻 DSH 思考过程 + 逐步生成
      const senderName = `${employee.name} · ${employee.role}`;
      const placeholder = dbRun("INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reasoning, message_type, tenant_id) VALUES (?, ?, 'employee', ?, '', '', 'ai', ?)", [chatId, employee.id, senderName, req.user!.tenant_id]);
      const msgId = placeholder.lastInsertRowid;
      void streamSingleEmployeeResponse(employee, content, chatHistory, req.user!.tenant_id, {
        onReasoning: (t) => broadcastToChat(chatId, { type: "stream_reasoning", chatId, messageId: msgId, token: t }),
        onToken: (t) => broadcastToChat(chatId, { type: "stream_token", chatId, messageId: msgId, token: t }),
        onTool: (name, summary) => {
          // 工具步骤实时回群（作为 ai_progress 步骤行，前端用 DSH stepMeta 渲染；持久化 phase/step_key）
          const toolStepKey = `tool_${name}_${Date.now()}`;
          try {
            const ins = dbRun(
              "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, phase, step_key, tenant_id) VALUES (?, ?, 'system', ?, ?, 'ai_progress', ?, ?, ?)",
              [chatId, employee.id, senderName, summary || name, name, toolStepKey, req.user!.tenant_id]
            );
            broadcastToChat(chatId, {
              type: "new_message",
              chatId,
              message: {
                id: ins.lastInsertRowid,
                sender_type: "system",
                sender_name: senderName,
                content: summary || name,
                message_type: "ai_progress",
                phase: name,
                step_key: toolStepKey,
                created_at: new Date().toISOString(),
              },
            });
          } catch { /* 步骤推送失败不阻断 */ }
        },
        onComplete: (full, reasoning) => {
          dbRun("UPDATE messages SET content = ?, reasoning = ?, tokens = ? WHERE id = ?", [full, reasoning, estimateTokens((reasoning||"") + (full||"")), msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId, content: full, reasoning });
          if (full.length > 10) saveShortMemory(employee.id, 'conversation', full, undefined, { chat_id: chatId, message_id: msgId }, req.user!.tenant_id);
          AuditTrailEngine.archiveMessage({
            tenantId: req.user!.tenant_id,
            chatId, messageId: msgId, senderType: 'employee', senderId: employee.id,
            senderName, content: full, messageType: 'ai', createdAt: new Date().toISOString()
          });
        },
        onError: (e) => {
          dbRun("UPDATE messages SET content = ? WHERE id = ?", [`[系统] AI 回复出错：${e.message}`, msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId });
        },
      }, `chat-${chatId}`);

      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages, streaming: true, messageId: msgId });
    }

    // 群聊模式
    const recentMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 30", [chatId, req.user!.tenant_id]) as any[];

    // H2A2A2H 群聊深度执行：执行类任务委派 DSH 在租户沙箱执行（异步，双轨并行：
    // DSH 负责真实执行，H2A2A2H 文字编排负责讨论/审查，两者结果都回群）
    if (chat.type === "group" && detectDeepExecutionIntent(content) && chatEmployees.length > 0) {
      const execEmployee = mentionedEmployee || chatEmployees[0];
      pushProgress("dsh_exec", "🔧 检测到执行类任务，委派 DeepSeek Harness 在沙箱执行...", "dsh_exec");
      void runDeepExecution({ chatId, tenantId: req.user!.tenant_id, employee: execEmployee, task: content });
    }


    // 检查是否是确认（结束讨论，生成会议纪要）
    const lastAiSummary = [...recentMessages].reverse().find(m => m.message_type === "ai_summary");
    if (lastAiSummary && (isUserConfirming(content) || isUserRejecting(content))) {
      const rejecting = isUserRejecting(content);
      // [人在回路] 更新待审核记录状态（approve/reject 都要落到 pending_reviews）
      try {
        const pending = dbGet("SELECT id FROM pending_reviews WHERE tenant_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [req.user!.tenant_id]) as any;
        if (pending) {
          dbRun("UPDATE pending_reviews SET status = ?, human_response = ?, reviewer_user_id = ?, reviewed_at = datetime('now') WHERE id = ?",
            [rejecting ? 'rejected' : 'approved', content, req.user!.id, pending.id]);
        }
      } catch { /* 审核记录更新失败不阻断 */ }

      if (rejecting) {
        // 驳回：记录驳回意见并广播，等待 AI 按意见重新讨论
        const rejectMsg = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'system', '系统', ?, 'ai_progress', ?)",
          [chatId, req.user!.id, `已记录驳回意见，AI 将按此重新讨论：${content}`, req.user!.tenant_id]
        );
        broadcastToChat(chatId, { type: "new_message", chatId, message: { id: rejectMsg.lastInsertRowid, sender_type: "system", sender_name: "系统", content: `已记录驳回意见，AI 将按此重新讨论：${content}`, message_type: "ai_progress", phase: "rejected", created_at: new Date().toISOString() } });
        const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: allMessages, rejected: true });
      }

      // 确认：生成会议纪要
      const firstUserMsg = [...recentMessages].reverse().find(m => m.sender_type === "user");
      const topic = firstUserMsg?.content?.substring(0, 30) || "讨论";
      
      // 生成会议纪要
      // @ts-expect-error R0-P0-09: H2A2A2H 类型对齐安排在 V0.70
      const minutes = await generateMeetingMinutes(content, chatEmployees, { steps: [], finalContent: lastAiSummary.content });
      
      // 保存会议纪要到聊天
      const insertResult = dbRun("INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', '系统', ?, 'meeting_minutes', ?)", [chatId, minutes, req.user!.tenant_id]);
      broadcastToChat(chatId, { type: "new_message", chatId, message: { id: insertResult.lastInsertRowid, sender_type: "system", sender_name: "系统", content: minutes, message_type: "meeting_minutes", created_at: new Date().toISOString() } });

      // 自动保存到知识库 - 会议纪要文件夹
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const minutesTitle = `会议纪要_${dateStr}_${topic}`;
      dbRun(
        "INSERT INTO knowledge_notes (title, content, tags, source, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [minutesTitle, minutes, "会议纪要,自动生成", `群聊:${chat.title}`, req.user!.tenant_id]
      );

      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages, minutesGenerated: true });
    }

    // 获取历史上下文（更多历史记录，包含讨论上下文）
    const historyRows = dbAll("SELECT content, sender_type, sender_name, message_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 30", [chatId, req.user!.tenant_id]) as any[];
    const chatHistory = historyRows.reverse().map(m => ({
      role: m.sender_type === "user" ? "user" as const : "assistant" as const,
      content: m.message_type === "ai_summary" ? `[总结] ${m.content}` : m.content,
    }));

    // V1.1 相关性路由：普通工作消息 → 谁相关谁回（不相关静默，0 相关主持者轻回引导）
    if (!isComplexTask(content)) {
      const relevantIds = await resolveRelevantEmployees(content, chatEmployees, chatHistory, req.user!.tenant_id);
      if (relevantIds.length > 0) {
        const names = relevantIds.map((id) => chatEmployees.find((e) => e.id === id)?.name).filter(Boolean).join("、");
        pushProgress("relevance_routing", `🎯 相关性路由：${names} 将回复`, "relevance_routing");
        for (const id of relevantIds) {
          const emp = chatEmployees.find((e) => e.id === id);
          if (!emp) continue;
          const senderName = `${emp.name} · ${emp.role}`;
          const placeholder = dbRun(
            "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reasoning, message_type, tenant_id) VALUES (?, ?, 'employee', ?, '', '', 'ai', ?)",
            [chatId, emp.id, senderName, req.user!.tenant_id]
          );
          const msgId = placeholder.lastInsertRowid;
          await new Promise<void>((resolve) => {
            void streamSingleEmployeeResponse(emp, content, chatHistory, req.user!.tenant_id, {
              onReasoning: (t) => broadcastToChat(chatId, { type: "stream_reasoning", chatId, messageId: msgId, token: t }),
              onToken: (t) => broadcastToChat(chatId, { type: "stream_token", chatId, messageId: msgId, token: t }),
              onComplete: (full, reasoning) => {
                dbRun("UPDATE messages SET content = ?, reasoning = ? WHERE id = ?", [full, reasoning, msgId]);
                broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId, content: full, reasoning });
                if (full.length > 10) saveShortMemory(emp.id, 'conversation', full, undefined, { chat_id: chatId, message_id: msgId }, req.user!.tenant_id);
                resolve();
              },
              onError: (e) => {
                dbRun("UPDATE messages SET content = ? WHERE id = ?", [`[系统] AI 回复出错：${e.message}`, msgId]);
                broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId });
                resolve();
              },
            }, `chat-${chatId}`);
          });
        }
        const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
        return res.json({ success: true, data: allMessages, relevanceRouted: true, relevantIds });
      }
      // 0 相关：主持者轻回引导（不冷场）
      const host = pickHost(chatEmployees);
      if (host) {
        const senderName = `${host.name} · ${host.role}`;
        const guide = "这条我这边暂时没有明确对应的同事跟进。可以 @ 某位同事点名，或说明希望谁负责，我马上安排。";
        const r = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, 'ai', ?)",
          [chatId, host.id, senderName, guide, req.user!.tenant_id]
        );
        broadcastToChat(chatId, { type: "new_message", chatId, message: { id: r.lastInsertRowid, sender_type: "employee", sender_name: senderName, content: guide, message_type: "ai", created_at: new Date().toISOString() } });
      }
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages, noRelevant: true });
    }

    // 检测是否为闲聊（流式：每个员工思考+打字机）
    if (isCasualChat(content)) {
      pushProgress("casual_start", `💬 检测为闲聊消息，AI员工自由互动中...`, "casual_start");
      await streamCasualChatResponse(chatEmployees, content, chatHistory, req.user!.tenant_id, (emp, cb) => {
        const stepKey = `emp_${emp.id}_casual`;
        const m = stepKey.match(/^emp_(\d+)_(\w+)$/);
        const empId = m ? parseInt(m[1], 10) : 0;
        const senderName = `${emp.name} · ${emp.role}`;
        const r = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reasoning, message_type, tenant_id) VALUES (?, ?, 'employee', ?, '', '', 'ai', ?)",
          [chatId, empId, senderName, req.user!.tenant_id]
        );
        const msgId = r.lastInsertRowid;
        let reasoning = "";
        cb.onReasoning = (t) => { reasoning += t; broadcastToChat(chatId, { type: "stream_reasoning", chatId, messageId: msgId, token: t }); };
        cb.onToken = (t) => broadcastToChat(chatId, { type: "stream_token", chatId, messageId: msgId, token: t });
        cb.onComplete = (full, rr) => {
          dbRun("UPDATE messages SET content = ?, reasoning = ?, tokens = ? WHERE id = ?", [full, reasoning, estimateTokens((reasoning||"") + (full||"")), msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId, content: full, reasoning });
          if (full.length > 10) saveShortMemory(emp.id, 'conversation', full, undefined, { chat_id: chatId, message_id: msgId }, req.user!.tenant_id);
        };
        cb.onError = (e) => {
          dbRun("UPDATE messages SET content = ? WHERE id = ?", [`[系统] AI 回复出错：${e.message}`, msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId });
        };
      });
      pushProgress("casual_done", `✓ 闲聊互动完成（总用时 ${Math.round((Date.now()-sendStart)/1000)}秒）`, "casual_done");
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages });
    }

    // V5: 触发新一轮H2A2A2H（含智能路由 + 门控 + 任务拆解）
    const recentMsgs = dbAll(
      "SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10",
      [chatId, req.user!.tenant_id]
    ) as any[];

    // AI 流式回调：step_reasoning/step_token 惰性建消息并逐段推送；step_done 落库
    const streamMsgMap = new Map<string, number>();
    const stepTypeMap: Record<string, string> = { decompose: "ai_assign", think: "ai_think", reply: "ai_reply", review: "ai_review", summary: "ai_summary", final: "ai_summary" };
    const ensureStreamMsg = (stepKey: string): number | null => {
      if (streamMsgMap.has(stepKey)) return streamMsgMap.get(stepKey)!;
      const m = stepKey.match(/^emp_(\d+)_(\w+)$/);
      if (!m) return null;
      const empId = parseInt(m[1], 10);
      const type = m[2];
      const messageType = stepTypeMap[type] || "ai";
      const emp = empId > 0 ? chatEmployees.find((e: any) => e.id === empId) : null;
      const senderName = emp ? `${emp.name} · ${emp.role}` : type === "final" ? "会议记录" : "AI员工";
      const r = dbRun(
        "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, reasoning, message_type, tenant_id) VALUES (?, ?, ?, ?, '', '', ?, ?)",
        [chatId, emp ? emp.id : null, emp ? "employee" : "system", senderName, messageType, req.user!.tenant_id]
      );
      streamMsgMap.set(stepKey, r.lastInsertRowid);
      // 广播占位消息，前端动态添加后随 stream_token 打字机增量
      broadcastToChat(chatId, {
        type: "stream_start",
        chatId,
        messageId: r.lastInsertRowid,
        message: {
          id: r.lastInsertRowid,
          sender_type: emp ? "employee" : "system",
          sender_name: senderName,
          content: "",
          reasoning: "",
          message_type: messageType,
          created_at: new Date().toISOString(),
          streaming: true,
        },
      });
      return r.lastInsertRowid;
    };
    const progressCb = (phase: string, detail: string, stepKey?: string, agentResult?: any) => {
      onPhase(phase, detail, stepKey, agentResult, chatId, req.user!.tenant_id, req.user!.id);
      if ((phase === "step_reasoning" || phase === "step_token") && stepKey) {
        const msgId = ensureStreamMsg(stepKey);
        if (msgId) broadcastToChat(chatId, { type: phase, chatId, messageId: msgId, token: detail });
        return;
      }
      if (phase === "step_tool") {
        // 工具步骤（read/pwsh/edit/...）：作为 ai_progress 步骤行实时回群（持久化 phase/step_key 供树形呈现）
        const toolName = detail || "tool";
        const summary = agentResult?.toolSummary || toolName;
        const toolStepKey = `tool_${toolName}_${Date.now()}`;
        try {
          const ins = dbRun(
            "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, phase, step_key, tenant_id) VALUES (?, NULL, 'system', ?, ?, 'ai_progress', ?, ?, ?)",
            [chatId, "AI员工", summary, toolName, toolStepKey, req.user!.tenant_id]
          );
          broadcastToChat(chatId, {
            type: "new_message", chatId,
            message: { id: ins.lastInsertRowid, sender_type: "system", sender_name: "AI员工",
              content: summary, message_type: "ai_progress", phase: toolName,
              step_key: toolStepKey, created_at: new Date().toISOString() },
          });
        } catch { /* 步骤推送失败不阻断 */ }
        return;
      }
      if (phase === "step_done" && stepKey) {
        const msgId = streamMsgMap.get(stepKey);
        if (msgId) {
          dbRun("UPDATE messages SET content = ?, reasoning = ?, tokens = ? WHERE id = ?", [detail, agentResult?.reasoning || "", estimateTokens((agentResult?.reasoning || "") + (detail || "")), msgId]);
          broadcastToChat(chatId, { type: "stream_done", chatId, messageId: msgId, content: detail, reasoning: agentResult?.reasoning || "" });
        }
        return;
      }
      pushProgress(phase, detail, stepKey);
    };

    // 异步执行 H2A2A2H 编排（立即返回，流式实时推送）
    void (async () => {
      try {
        markCollabActive(chatId); // 标记协作生命周期开始（场景②：协作中插话检测）
        pushProgress("analyzing", "🔍 正在分析对话意图，判断协作模式...", "intent_classify");
        const tokenGate = assertTokenLimit(req.user!.tenant_id);
        let result: any;
        if (!tokenGate.allowed) {
          pushProgress("blocked", tokenGate.message ?? "Token 用量已达上限", "token_limit");
          result = { steps: [], finalContent: tokenGate.message ?? "Token 用量已达上限", mode: "peer" };
        } else if (shouldTriggerH2A2A2H(recentMsgs)) {
          pushProgress("routing", "🧠 启用智能路由模式（含任务拆解分发）", "routing_start");
          result = await runH2A2A2HWithRouting(content, chatEmployees, chatHistory, req.user!.tenant_id, req.user!.id, chatId, progressCb);
        } else {
          pushProgress("routing", "🤝 启用常规协作模式", "routing_start");
          result = await runH2A2A2H(content, chatEmployees, chatHistory, req.user!.tenant_id, req.user!.id, progressCb);
        }
        pushProgress("finishing", `✨ 协作完成（总用时 ${Math.round((Date.now() - sendStart) / 1000)} 秒）`, "finishing");
        shadowFinalize(chatId);
        markCollabDone(chatId); // 标记协作生命周期结束

        // 任务拆解 → 广播调度摘要消息
        if (result.taskDecomposition?.subtasks?.length) {
          const td = result.taskDecomposition;
          const routingMsg = `📋 **智能调度** | ${td.commander.name}(${td.commander.role}, Rank ${td.commander.rank})接管\n\n${td.summary}\n\n📌 子任务分发:\n` +
            td.subtasks.map((st: any) => `  · ${st.title} → @${st.assigned_name || st.assigned_to} [${st.priority}]`).join("\n");
          const routingInsert = dbRun(
            "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', ?, ?, 'ai_assign', ?)",
            [chatId, "智能调度", routingMsg, req.user!.tenant_id]
          );
          broadcastToChat(chatId, { type: "new_message", chatId, message: { id: routingInsert.lastInsertRowid, sender_type: "system", sender_name: "智能调度", content: routingMsg, message_type: "ai_assign", created_at: new Date().toISOString() } });
        }

        // 记忆归档（基于 result.steps 完整内容）
        for (const step of result.steps || []) {
          let msgContent = "";
          let msgType = "ai";
          if (step.type === "manager_assign") { msgContent = step.content; msgType = "ai_assign"; }
          else if (step.type === "peer_think") { msgContent = step.thinking || ""; msgType = "ai_think"; }
          else if (step.type === "peer_reply") { msgContent = step.content; msgType = "ai_reply"; }
          else if (step.type === "peer_review") { msgContent = step.content; msgType = "ai_review"; }
          else if (step.type === "manager_summary") { msgContent = step.content; msgType = "ai_summary"; }
          if (!msgContent) continue;
          const stepEmployee = chatEmployees.find(e => e.name === step.employee_name);
          if (stepEmployee && msgContent.length > 10) {
            saveShortMemory(stepEmployee.id, msgType === "ai_summary" ? "decision" : "conversation", msgContent, step.thinking || undefined, { chat_id: chatId }, req.user!.tenant_id);
          }
        }
      } catch (err: any) {
        console.error("[Chat] H2A2A2H 编排失败:", err);
        markCollabDone(chatId); // 崩溃也清除协作标记，避免泄漏
        broadcastToChat(chatId, { type: "new_message", chatId, message: { sender_type: "system", sender_name: "系统", content: "[系统] AI 讨论服务暂时不可用", message_type: "ai", created_at: new Date().toISOString() } });
      }
    })();

    const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
    res.json({ success: true, data: allMessages, streaming: true });
  } catch (err: any) {
    console.error("[Chat] 发送消息失败:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 生成会议纪要
chatRoutes.post("/:id/minutes", async (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const chatEmployees = dbAll(
      `SELECT e.* FROM employees e INNER JOIN chat_members cm ON cm.employee_id = e.id AND cm.tenant_id = e.tenant_id WHERE cm.chat_id = ? AND cm.tenant_id = ? AND e.employee_type = 'ai' AND e.status = 'active'`,
      [chatId, req.user!.tenant_id]
    ) as any[];

    const recentMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 30", [chatId, req.user!.tenant_id]) as any[];
    const lastUserMsg = [...recentMessages].reverse().find(m => m.sender_type === "user");
    const lastSummary = [...recentMessages].reverse().find(m => m.message_type === "ai_summary");

    const steps = recentMessages.reverse().filter(m => m.sender_type === "employee").map(m => ({
      type: m.message_type === "ai_assign" ? "manager_assign" as const : m.message_type === "ai_think" ? "executor_think" as const : m.message_type === "ai_reply" ? "executor_reply" as const : m.message_type === "ai_summary" ? "manager_summary" as const : "executor_reply" as const,
      employee_name: m.sender_name?.split(" · ")[0] || "未知",
      employee_role: m.sender_name?.split(" · ")[1] || "",
      agent_type: "",
      content: m.content,
    }));

    // @ts-expect-error R0-P0-09: H2A2A2HStep 类型对齐安排在 V0.70
    const minutes = await generateMeetingMinutes(lastUserMsg?.content || "讨论", chatEmployees, { steps, finalContent: lastSummary?.content || "" });
    const insertResult = dbRun("INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', '系统', ?, 'meeting_minutes', ?)", [chatId, minutes, req.user!.tenant_id]);
    broadcastToChat(chatId, { type: "new_message", chatId, message: { id: insertResult.lastInsertRowid, sender_type: "system", sender_name: "系统", content: minutes, message_type: "meeting_minutes", created_at: new Date().toISOString() } });

    // 会议纪要仅保留在当前群聊沙箱；是否进入正式知识中心必须走后续人工审核流程。

    res.json({ success: true, data: { minutes, messageId: insertResult.lastInsertRowid } });
  } catch (err: any) {
    console.error("[Chat] 生成会议纪要失败:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

chatRoutes.get("/:id/members", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const members = dbAll(
      `SELECT cm.*, CASE WHEN cm.user_id IS NOT NULL THEN (SELECT nickname FROM users WHERE id = cm.user_id AND tenant_id = cm.tenant_id) ELSE NULL END as user_name, CASE WHEN cm.employee_id IS NOT NULL THEN (SELECT name FROM employees WHERE id = cm.employee_id AND tenant_id = cm.tenant_id) ELSE NULL END as employee_name, CASE WHEN cm.employee_id IS NOT NULL THEN (SELECT avatar_emoji FROM employees WHERE id = cm.employee_id AND tenant_id = cm.tenant_id) ELSE NULL END as avatar_emoji, CASE WHEN cm.employee_id IS NOT NULL THEN (SELECT role FROM employees WHERE id = cm.employee_id AND tenant_id = cm.tenant_id) ELSE NULL END as employee_role, CASE WHEN cm.employee_id IS NOT NULL THEN (SELECT agent_type FROM employees WHERE id = cm.employee_id AND tenant_id = cm.tenant_id) ELSE NULL END as agent_type FROM chat_members cm WHERE cm.chat_id = ? AND cm.tenant_id = ?`,
      [chat.id, req.user!.tenant_id]
    );
    res.json({ success: true, data: members });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.post("/:id/members", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    const { user_id, employee_id, role } = req.body;
    if (!user_id && !employee_id) return res.status(400).json({ success: false, error: "用户或员工ID必填" });
    if (user_id && employee_id) return res.status(400).json({ success: false, error: "一次只能添加一个内部人类用户或一个AI员工" });
    if (role && !["admin", "member"].includes(role)) return res.status(400).json({ success: false, error: "角色必须是 admin 或 member" });
    if (user_id && !dbGet("SELECT 1 FROM users WHERE id = ? AND tenant_id = ?", [user_id, req.user!.tenant_id])) return res.status(404).json({ success: false, error: "内部用户不存在" });
    if (employee_id && !dbGet("SELECT 1 FROM employees WHERE id = ? AND tenant_id = ? AND status = 'active'", [employee_id, req.user!.tenant_id])) return res.status(404).json({ success: false, error: "员工不存在或未启用" });
    const existing = user_id
      ? dbGet("SELECT id FROM chat_members WHERE chat_id = ? AND user_id = ? AND tenant_id = ?", [chat.id, user_id, req.user!.tenant_id])
      : dbGet("SELECT id FROM chat_members WHERE chat_id = ? AND employee_id = ? AND tenant_id = ?", [chat.id, employee_id, req.user!.tenant_id]);
    if (existing) return res.status(409).json({ success: false, error: "成员已在群内" });
    dbRun("INSERT INTO chat_members (chat_id, user_id, employee_id, role, tenant_id, joined_at) VALUES (?, ?, ?, ?, ?, datetime('now'))", [chat.id, user_id || null, employee_id || null, role || "member", req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.delete("/:id/members/:memberId", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    dbRun("DELETE FROM chat_members WHERE id = ? AND chat_id = ? AND tenant_id = ?", [req.params.memberId, chat.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.post("/:id/messages/:messageId/reactions", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, error: "表情必填" });
    const message = dbGet("SELECT id FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [req.params.messageId, chat.id, req.user!.tenant_id]);
    if (!message) return res.status(404).json({ success: false, error: "消息不存在" });
    const existing = dbGet("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? AND tenant_id = ?", [req.params.messageId, req.user!.id, emoji, req.user!.tenant_id]);
    if (existing) { dbRun("DELETE FROM message_reactions WHERE id = ? AND tenant_id = ?", [(existing as any).id, req.user!.tenant_id]); }
    else { dbRun("INSERT INTO message_reactions (message_id, user_id, emoji, tenant_id) VALUES (?, ?, ?, ?)", [req.params.messageId, req.user!.id, emoji, req.user!.tenant_id]); }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.put("/:id/messages/:messageId", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "内容必填" });
    const msg = dbGet("SELECT * FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [req.params.messageId, chat.id, req.user!.tenant_id]) as any;
    if (!msg) return res.status(404).json({ success: false, error: "消息不存在" });
    if (msg.sender_type !== "user" || (msg.sender_id !== req.user!.id && !['admin', 'owner'].includes(chat.member_role))) return res.status(403).json({ success: false, error: "无权编辑此消息" });
    dbRun("UPDATE messages SET content = ? WHERE id = ? AND chat_id = ? AND tenant_id = ?", [content, msg.id, chat.id, req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.post("/:id/messages/:messageId/import-knowledge", (req: AuthRequest, res) => {
  try {
    const chatAccess = requireChatManager(req, res, req.params.id);
    if (!chatAccess) return;
    // 正式知识中心尚未具备 V0.80 所需的定密、审核、版本和撤销机制，
    // 因此 V0.50 不允许把群聊材料直接写入可检索知识库。
    res.status(409).json({ success: false, error: "群聊材料需在 V0.80 知识审核流程上线后方可发布" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

chatRoutes.get("/:id/messages/:messageId/export", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const format = (req.query.format as string) || "md";
    const msg = dbGet("SELECT * FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [req.params.messageId, chat.id, req.user!.tenant_id]) as any;
    if (!msg) return res.status(404).json({ success: false, error: "消息不存在" });
    const filename = `会议纪要_${new Date().toISOString().slice(0, 10)}_${chat?.title || "讨论"}`;

    if (format === "md") {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}.md"`);
      res.send(msg.content);
    } else if (format === "docx") {
      const lines = msg.content.split("\n");
      const children: Paragraph[] = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith("# ")) {
          children.push(new Paragraph({ children: parseTextRuns(line.replace("# ", ""), 32), heading: HeadingLevel.HEADING_1 }));
        } else if (line.startsWith("## ")) {
          children.push(new Paragraph({ children: parseTextRuns(line.replace("## ", ""), 28), heading: HeadingLevel.HEADING_2 }));
        } else if (line.startsWith("### ")) {
          children.push(new Paragraph({ children: parseTextRuns(line.replace("### ", ""), 24), heading: HeadingLevel.HEADING_3 }));
        } else if (line.startsWith("---")) {
          children.push(new Paragraph({ children: [new TextRun({ text: "────────────────────────────────" })], alignment: AlignmentType.CENTER }));
        } else if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
          const headerCells = parseTableRow(line);
          i += 2;
          const dataRows: string[][] = [];
          while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
            dataRows.push(parseTableRow(lines[i]));
            i++;
          }
          i--;
          const tableRows = [
            new TableRow({ children: headerCells.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cleanMarkdown(cell), bold: true, size: 20 })] })], width: { size: Math.floor(9000 / headerCells.length), type: WidthType.DXA } })), tableHeader: true }),
            ...dataRows.map(row => new TableRow({ children: row.map((cell, idx) => new TableCell({ children: [new Paragraph({ children: parseTextRuns(cell, 20) })], width: { size: Math.floor(9000 / (headerCells.length || 1)), type: WidthType.DXA } })) }))
          ];
          children.push(new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }) as any);
        } else if (line.trim() === "") {
          children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
        } else {
          children.push(new Paragraph({ children: parseTextRuns(line, 22) }));
        }
        i++;
      }
      const doc = new Document({ sections: [{ children }] });
      Packer.toBuffer(doc).then(buffer => {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}.docx"`);
        res.send(Buffer.from(buffer));
      });
    } else if (format === "pdf") {
      generatePdf(msg.content, filename, res);
    } else {
      res.status(400).json({ success: false, error: "不支持的格式" });
    }
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

function generatePdf(content: string, filename: string, res: any) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}.pdf"`);
  
  const fontPath = "C:\\Windows\\Fonts\\simhei.ttf";
  const pdf = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  pdf.pipe(res);
  pdf.registerFont("Chinese", fontPath);
  
  const pageWidth = pdf.page.width - 100;
  const lines = content.split("\n");
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    if (pdf.y > pdf.page.height - 80) {
      pdf.addPage();
    }
    
    if (line.startsWith("# ")) {
      pdf.moveDown(0.5);
      pdf.fontSize(20).font("Chinese").text(cleanMarkdown(line.replace("# ", "")), 50, pdf.y, { align: "left", width: pageWidth });
      pdf.moveDown(0.3);
    } else if (line.startsWith("## ")) {
      pdf.moveDown(0.4);
      pdf.fontSize(16).font("Chinese").text(cleanMarkdown(line.replace("## ", "")), 50, pdf.y, { align: "left", width: pageWidth });
      pdf.moveDown(0.2);
    } else if (line.startsWith("### ")) {
      pdf.moveDown(0.3);
      pdf.fontSize(14).font("Chinese").text(cleanMarkdown(line.replace("### ", "")), 50, pdf.y, { align: "left", width: pageWidth });
      pdf.moveDown(0.2);
    } else if (line.startsWith("#### ")) {
      pdf.moveDown(0.2);
      pdf.fontSize(12).font("Chinese").text(cleanMarkdown(line.replace("#### ", "")), 50, pdf.y, { align: "left", width: pageWidth });
      pdf.moveDown(0.1);
    } else if (line.startsWith("---")) {
      pdf.moveDown(0.5);
      const y = pdf.y;
      pdf.moveTo(50, y).lineTo(pdf.page.width - 50, y).lineWidth(0.5).stroke();
      pdf.moveDown(0.5);
    } else if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      i = renderPdfTable(pdf, lines, i, pageWidth);
      pdf.moveDown(0.5);
    } else if (line.trim() === "") {
      pdf.moveDown(0.3);
    } else if (line.match(/^\s*[\*\-]\s/) || line.match(/^\s*\d+\.\s/)) {
      const bulletLine = line.replace(/^\s*[\*\-]\s/, "  • ").replace(/^\s*\d+\.\s/, (m) => "  " + m.trim() + " ");
      pdf.fontSize(11).font("Chinese").text(cleanMarkdown(bulletLine), 50, pdf.y, { align: "left", width: pageWidth, lineGap: 3 });
    } else {
      pdf.fontSize(11).font("Chinese").text(cleanMarkdown(line), 50, pdf.y, { align: "left", width: pageWidth, lineGap: 3 });
    }
    
    i++;
  }
  
  pdf.end();
}

function renderPdfTable(pdf: any, lines: string[], startIndex: number, pageWidth: number): number {
  const headerLine = lines[startIndex];
  const headerCells = parseTableRow(headerLine);
  const colCount = headerCells.length;
  const cellPadding = 4;
  const cellFontSize = 9;
  
  const dataRows: string[][] = [];
  let i = startIndex + 2;
  while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
    dataRows.push(parseTableRow(lines[i]));
    i++;
  }
  
  const getColWidths = (): number[] => {
    if (colCount <= 2) return Array(colCount).fill(pageWidth / colCount);
    
    const headerLower = headerCells.map(h => cleanMarkdown(h).toLowerCase());
    
    const weights = headerCells.map((h, idx) => {
      const text = headerLower[idx];
      if (text.includes('序') || text.includes('编号') || text === '#' || text === 'no' || text === 'id') return 0.5;
      if (text.includes('任务') || text.includes('内容') || text.includes('事项') || text.includes('工作')) return 2.5;
      if (text.includes('责任') || text.includes('负责人') || text.includes('人员')) return 1.2;
      if (text.includes('日期') || text.includes('时间') || text.includes('截止')) return 1.2;
      if (text.includes('交付') || text.includes('产出') || text.includes('备注') || text.includes('说明')) return 1.8;
      return 1.0;
    });
    
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => (w / totalWeight) * pageWidth);
  };
  
  const colWidths = getColWidths();
  
  const drawTableRow = (cells: string[], isHeader: boolean) => {
    if (pdf.y + 30 > pdf.page.height - 60) {
      pdf.addPage();
    }
    
    const startY = pdf.y;
    let maxCellHeight = 0;
    
    const cellTexts = cells.map(cell => cleanMarkdown(cell));
    
    cellTexts.forEach((text, idx) => {
      pdf.fontSize(cellFontSize).font("Chinese");
      const textHeight = pdf.heightOfString(text, { width: colWidths[idx] - cellPadding * 2 });
      maxCellHeight = Math.max(maxCellHeight, textHeight + cellPadding * 2);
    });
    maxCellHeight = Math.max(maxCellHeight, 20);
    
    let xPos = 50;
    pdf.rect(50, startY, pageWidth, maxCellHeight).lineWidth(0.3).stroke();
    
    cellTexts.forEach((text, idx) => {
      pdf.fontSize(cellFontSize).font("Chinese");
      if (isHeader) {
        pdf.text(text, xPos + cellPadding, startY + cellPadding, { width: colWidths[idx] - cellPadding * 2, align: "center" });
      } else {
        const align = idx === 0 ? "center" : "left";
        pdf.text(text, xPos + cellPadding, startY + cellPadding, { width: colWidths[idx] - cellPadding * 2, align });
      }
      xPos += colWidths[idx];
    });
    
    xPos = 50;
    for (let j = 0; j < colCount - 1; j++) {
      xPos += colWidths[j];
      pdf.moveTo(xPos, startY).lineTo(xPos, startY + maxCellHeight).lineWidth(0.3).stroke();
    }
    
    pdf.y = startY + maxCellHeight;
  };
  
  drawTableRow(headerCells.map(h => h), true);
  
  for (const row of dataRows) {
    const paddedRow = [...row];
    while (paddedRow.length < colCount) paddedRow.push("");
    drawTableRow(paddedRow, false);
  }
  
  return i - 1;
}

// ===== P22 群聊增强 API =====

// 设置/获取群公告
chatRoutes.put("/:id/announcement", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const { announcement } = req.body;
    dbRun("UPDATE chats SET announcement = ? WHERE id = ? AND tenant_id = ?", [announcement || null, chatId, req.user!.tenant_id]);
    broadcastToChat(chatId, { type: "announcement_updated", chatId, announcement });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 置顶/取消置顶消息
chatRoutes.post("/:id/messages/:messageId/pin", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const messageId = parseInt(req.params.messageId);
    if (!dbGet("SELECT 1 FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [messageId, chatId, req.user!.tenant_id])) return res.status(404).json({ success: false, error: "消息不存在" });

    const newPinned = chat.pinned_message_id === messageId ? null : messageId;
    dbRun("UPDATE chats SET pinned_message_id = ? WHERE id = ? AND tenant_id = ?", [newPinned, chatId, req.user!.tenant_id]);
    broadcastToChat(chatId, { type: "message_pinned", chatId, pinned_message_id: newPinned });
    res.json({ success: true, data: { pinned_message_id: newPinned } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 软删除消息
chatRoutes.delete("/:id/messages/:messageId", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const messageId = parseInt(req.params.messageId);
    const msg = dbGet("SELECT * FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [messageId, chatId, req.user!.tenant_id]) as any;
    if (!msg) return res.status(404).json({ success: false, error: "消息不存在" });

    const isOwner = msg.sender_type === "user" && msg.sender_id === req.user!.id;
    const isAdmin = ['admin', 'owner'].includes(chat.member_role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: "无权删除此消息" });
    }

    dbRun("UPDATE messages SET deleted_at = datetime('now'), content = '[消息已删除]' WHERE id = ? AND chat_id = ? AND tenant_id = ?", [messageId, chatId, req.user!.tenant_id]);
    broadcastToChat(chatId, { type: "message_deleted", chatId, messageId });
    logActivity({ userId: req.user!.id, action: "message_deleted", entityType: "chat", entityId: chatId, tenantId: req.user!.tenant_id });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 成员角色管理（提升/降级管理员）
chatRoutes.put("/:id/members/:memberId/role", (req: AuthRequest, res) => {
  try {
    const chat = requireChatManager(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const memberId = parseInt(req.params.memberId);
    const { role } = req.body;
    if (!role || !["admin", "member"].includes(role)) {
      return res.status(400).json({ success: false, error: "角色必须是 admin 或 member" });
    }

    const target = dbGet("SELECT * FROM chat_members WHERE id = ? AND chat_id = ? AND tenant_id = ?", [memberId, chatId, req.user!.tenant_id]) as any;
    if (!target) return res.status(404).json({ success: false, error: "成员不存在" });

    dbRun("UPDATE chat_members SET role = ? WHERE id = ? AND chat_id = ? AND tenant_id = ?", [role, memberId, chatId, req.user!.tenant_id]);
    broadcastToChat(chatId, { type: "member_role_changed", chatId, memberId, role });
    logActivity({ userId: req.user!.id, action: "member_role_changed", entityType: "chat", entityId: chatId, details: JSON.stringify({ memberId, role }), tenantId: req.user!.tenant_id });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// @全体成员
chatRoutes.post("/:id/at-all", async (req: AuthRequest, res) => {
  try {
    const chatAccess = requireChatManager(req, res, req.params.id);
    if (!chatAccess) return;
    const chatId = chatAccess.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: "内容必填" });

    const fullContent = `@全体成员 ${content}`;
    const result = dbRun(
      "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, tenant_id) VALUES (?, ?, 'user', ?, ?, ?)",
      [chatId, req.user!.id, req.user!.nickname, fullContent, req.user!.tenant_id]
    );

    const sendStart = Date.now();
    let aiProgressSeq = 0;
    const pushProgress = (phase: string, detail: string, stepKey?: string, agentResult?: any) => {
      aiProgressSeq++;
      try {
        const ins = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, NULL, 'system', ?, ?, 'ai_progress', ?)",
          [chatId, "AI进度", detail, req.user!.tenant_id]
        );
        broadcastToChat(chatId, {
          type: "new_message", chatId,
          message: { id: ins.lastInsertRowid, sender_type: "system", sender_name: "AI进度", content: detail,
            message_type: "ai_progress", phase, step_key: stepKey || (phase + "_" + aiProgressSeq),
            step_seq: aiProgressSeq, elapsed_ms: Date.now() - sendStart,
            agent_result: agentResult || null, created_at: new Date().toISOString() },
        });
      } catch(e) {}
    };

    // 通知所有人类群成员
    const allMembers = dbAll(
      "SELECT user_id FROM chat_members WHERE chat_id = ? AND tenant_id = ? AND user_id IS NOT NULL",
      [chatId, req.user!.tenant_id]
    ) as any[];
    const chat = dbGet("SELECT title FROM chats WHERE id = ? AND tenant_id = ?", [chatId, req.user!.tenant_id]) as any;

    for (const m of allMembers) {
      if (m.user_id !== req.user!.id) {
        notifyChatMention(chatId, chat?.title || "群聊", m.user_id, `@全体成员 ${req.user!.nickname}`);
      }
    }

    broadcastToChat(chatId, {
      type: "new_message", chatId,
      message: { id: result.lastInsertRowid, sender_type: "user", sender_name: req.user!.nickname, content: fullContent, created_at: new Date().toISOString(), at_all: true },
    });
    logActivity({ userId: req.user!.id, action: "at_all", entityType: "chat", entityId: chatId, tenantId: req.user!.tenant_id });

    pushProgress("receiving", "📡 @全体成员已发送，正在识别协作团队...", "atall_receiving");

    // @全体成员触发AI员工回复（排除@全体成员自身的匹配）
    const chatEmployees = dbAll(
      `SELECT e.* FROM employees e INNER JOIN chat_members cm ON cm.employee_id = e.id AND cm.tenant_id = e.tenant_id WHERE cm.chat_id = ? AND cm.tenant_id = ? AND e.employee_type = 'ai' AND e.status = 'active'`,
      [chatId, req.user!.tenant_id]
    ) as any[];

    if (chatEmployees.length === 0) {
      pushProgress("empty", "⚠️ 当前群聊尚未添加AI协作成员", "atall_empty");
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages });
    }

    pushProgress("team_identified", `👥 已识别协作团队：${chatEmployees.map((e:any)=>e.name).join("、")}（${chatEmployees.length}位成员）`, "atall_team");

    // 检测除@全体成员外的特定@提及
    const contentWithoutAtAll = content.replace(/^@全体成员\s*/, "");
    const mentionMatch = contentWithoutAtAll.match(/@(\S+)/);
    let mentionedEmployee: any = null;

    if (mentionMatch) {
      const mentionedName = mentionMatch[1];
      mentionedEmployee = chatEmployees.find((e: any) =>
        e.name === mentionedName || e.name.includes(mentionedName)
      );
    }

    // 如果@了特定员工，仅该员工回复
    if (mentionedEmployee) {
      pushProgress("atall_mention_start", `🎯 检测到 @${mentionedEmployee.name}(${mentionedEmployee.role})，将直接由该员工回复`, "atall_mention_start");
      const historyRows = dbAll("SELECT content, sender_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 10", [chatId, req.user!.tenant_id]) as any[];
      const chatHistory = historyRows.reverse().map(m => ({ role: m.sender_type === "user" ? "user" as const : "assistant" as const, content: m.content }));
      const reply = await getSingleEmployeeResponse(mentionedEmployee, fullContent, chatHistory, req.user!.tenant_id);
      dbRun("INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, 'ai_mention', ?)", [chatId, mentionedEmployee.id, `${mentionedEmployee.name} · ${mentionedEmployee.role}`, reply, req.user!.tenant_id]);
      broadcastToChat(chatId, {
        type: "new_message", chatId,
        message: { id: Date.now(), sender_type: "employee", sender_name: `${mentionedEmployee.name} · ${mentionedEmployee.role}`, content: reply, message_type: "ai_mention", created_at: new Date().toISOString() },
      });
      pushProgress("atall_mention_done", `✓ ${mentionedEmployee.name} 已回复（${reply.length}字，总用时 ${Math.round((Date.now()-sendStart)/1000)}秒）`, "atall_mention_done");
      const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
      return res.json({ success: true, data: allMessages, mentioned: mentionedEmployee.name });
    }

    // 群聊模式：触发所有AI员工回复
    const recentMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 30", [chatId, req.user!.tenant_id]) as any[];
    const historyRows = dbAll("SELECT content, sender_type, sender_name, message_type FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 30", [chatId, req.user!.tenant_id]) as any[];
    const chatHistory = historyRows.reverse().map(m => ({
      role: m.sender_type === "user" ? "user" as const : "assistant" as const,
      content: m.message_type === "ai_summary" ? `[总结] ${m.content}` : m.content,
    }));

    if (isCasualChat(fullContent)) {
      pushProgress("atall_casual", `💬 检测为闲聊消息，AI员工自由互动中...`, "atall_casual");
      const casualResponses = await getCasualChatResponse(chatEmployees, fullContent, chatHistory, req.user!.tenant_id);
      for (const resp of casualResponses) {
        const insertResult = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, 'ai', ?)",
          [chatId, resp.employee.id, `${resp.employee.name} · ${resp.employee.role}`, resp.content, req.user!.tenant_id]
        );
        broadcastToChat(chatId, {
          type: "new_message", chatId,
          message: { id: insertResult.lastInsertRowid, sender_type: "employee", sender_name: `${resp.employee.name} · ${resp.employee.role}`, content: resp.content, message_type: "ai", created_at: new Date().toISOString() },
        });
      }
      pushProgress("atall_casual_done", `✓ 闲聊互动完成（总用时 ${Math.round((Date.now()-sendStart)/1000)}秒）`, "atall_casual_done");
    } else {
      pushProgress("atall_h2a2h", "🔍 触发H2A2A2H协作讨论...", "atall_h2a2h");
      const progressCb = (phase: string, detail: string, stepKey?: string, agentResult?: any) => {
        pushProgress(phase, detail, stepKey);
      };
      const result2 = await runH2A2A2H(fullContent, chatEmployees, chatHistory, req.user!.tenant_id, req.user!.id, progressCb);
      pushProgress("atall_h2a2h_done", `✨ 协作完成（总用时 ${Math.round((Date.now()-sendStart)/1000)}秒）`, "atall_h2a2h_done");
      for (const step of result2.steps) {
        let msgContent = "";
        let msgType = "ai";
        if (step.type === "manager_assign") { msgContent = step.content; msgType = "ai_assign"; }
        else if (step.type === "peer_think") { msgContent = step.thinking || ""; msgType = "ai_think"; }
        else if (step.type === "peer_reply") { msgContent = step.content; msgType = "ai_reply"; }
        else if (step.type === "peer_review") { msgContent = step.content; msgType = "ai_review"; }
        else if (step.type === "manager_summary") { msgContent = step.content; msgType = "ai_summary"; }
        if (!msgContent) continue;
        const insertResult = dbRun(
          "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, ?, ?)",
          [chatId, chatEmployees[0]?.id || null, `${step.employee_name} · ${step.employee_role}`, msgContent, msgType, req.user!.tenant_id]
        );
        broadcastToChat(chatId, {
          type: "new_message", chatId,
          message: { id: insertResult.lastInsertRowid, sender_type: "employee", sender_name: `${step.employee_name} · ${step.employee_role}`, content: msgContent, message_type: msgType, created_at: new Date().toISOString() },
        });
      }
    }

    const allMessages = dbAll("SELECT * FROM messages WHERE chat_id = ? AND tenant_id = ? ORDER BY created_at ASC", [chatId, req.user!.tenant_id]);
    res.json({ success: true, data: allMessages });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新已读标记
chatRoutes.post("/:id/read-marker", (req: AuthRequest, res) => {
  try {
    const chat = requireChatMember(req, res, req.params.id);
    if (!chat) return;
    const chatId = chat.id;
    const { message_id } = req.body;
    if (message_id && !dbGet("SELECT 1 FROM messages WHERE id = ? AND chat_id = ? AND tenant_id = ?", [message_id, chatId, req.user!.tenant_id])) return res.status(404).json({ success: false, error: "消息不存在" });
    dbRun(
      "INSERT INTO chat_read_markers (chat_id, user_id, last_read_message_id, last_read_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id, user_id) DO UPDATE SET last_read_message_id = MAX(last_read_message_id, ?), last_read_at = datetime('now')",
      [chatId, req.user!.id, message_id || 0, message_id || 0]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
