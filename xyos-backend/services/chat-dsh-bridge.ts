/**
 * 雄元智脑XYOS — 群聊 × DeepSeek Harness 深度执行桥（H2A2A2H 治理增强）
 *
 * 当群聊消息带"执行类"意图（计算/生成文件/写代码/分析数据等）时，
 * 不再仅返回文字回复，而是委派 DSH 在【租户专属沙箱】真实执行，
 * 结果以「AI 执行结果（草稿）」回群，并附运行记录号（可追溯）。
 *
 * 治理边界（对齐 docs/H2A2A2H-群聊沙箱运行规范）：
 *  - 权限先行：仅限当前租户沙箱工作区，工具受 DSH 沙箱约束；
 *  - 结果不自动写入正式业务流，仅作为群内草稿/建议；
 *  - 全程可追溯：agent_runs.tenant_id + 运行记录号 + 审计。
 */
import { createRun, dispatchRun, getRun } from "./runtime/registry";
import type { RunRequest } from "./runtime/types";
import { broadcastToChat } from "./websocket";
import { logActivity } from "./notification";
import { dbRun } from "../db";
import { callLLM, hasConfiguredLLM } from "./ai";

/** 深度执行意图关键词（保守集合，避免误触发普通问答）。 */
const EXEC_KEYWORDS = [
  "算一下", "计算", "求和", "统计", "汇总", "生成文件", "写代码", "写个脚本",
  "写个程序", "跑一下", "执行", "分析数据", "处理文件", "读取文件", "生成报告",
  "写一份", "帮我写", "整理成", "导出为",
];

/** 判断消息是否应走 DSH 深度执行（而非纯文字回复）。 */
export function detectDeepExecutionIntent(content: string): boolean {
  if (!content || content.length > 500) return false;
  return EXEC_KEYWORDS.some((k) => content.includes(k));
}

/** 生成租户专属沙箱工作区路径。 */
export function tenantWorkspace(tenantId: number): string {
  return path.join(process.env.XYOS_RUNTIME_WORKSPACE || path.join(process.cwd(), "runtime-workspace"), `tenant-${tenantId}`);
}

export interface DeepExecutionResult {
  status: string;
  output: string;
  runId: string;
  tokensEstimated?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 后台执行一次 DSH 深度任务，完成后把结果作为「AI 执行结果（草稿）」回群。
 * 不阻塞群聊 HTTP 请求。
 */
export async function runDeepExecution(opts: {
  chatId: number;
  tenantId: number;
  employee: { id: number; name: string; role: string };
  task: string;
}): Promise<DeepExecutionResult> {
  const { chatId, tenantId, employee, task } = opts;
  const cwd = tenantWorkspace(tenantId);
  const senderName = `${employee.name} · ${employee.role}`;

  // 执行中进度消息（WebSocket 实时推送）
  const progressText = `正在沙箱执行：${task.slice(0, 60)}${task.length > 60 ? "…" : ""}`;
  const progressId = dbRun(
    "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, 'ai_deep_exec_progress', ?)",
    [chatId, employee.id, senderName, progressText, tenantId]
  );
  broadcastToChat(chatId, {
    type: "new_message",
    chatId,
    message: {
      id: progressId.lastInsertRowid,
      sender_type: "employee",
      sender_name: senderName,
      content: progressText,
      message_type: "ai_deep_exec_progress",
      created_at: new Date().toISOString(),
    },
  });

  let runId = `model-${Date.now()}`;
  let status = "failed";
  let output = "（无输出）";
  let tokensEstimated: number | undefined;
  if (await hasConfiguredLLM(tenantId)) {
    // 业务空间优先使用管理员刚保存的模型配置。这里仍只是 H2A2A2H 草稿，
    // 不会绕过审批、权限或把结果写入正式业务数据。
    const response = await callLLM([
      { role: "system", content: `你是${employee.name}（${employee.role}）。在 H2A2A2H 治理下为以下任务形成可审核的执行方案。没有沙箱工具时不得声称文件、代码或外部动作已经执行；请明确写出下一步和待人工确认事项。` },
      { role: "user", content: task },
    ], 0.4, 3000, tenantId);
    output = response.content;
    status = response.model === "none" || response.model === "blocked" ? "failed" : "completed";
    tokensEstimated = response.tokens_used;
  } else {
    const req: RunRequest = {
      provider: "dsh",
      task,
      tenantId,
      cwd,
      timeoutMs: 180000,
      onStep: (step) => {
        if (step.kind !== "tool_call" || !step.name) return;
        try {
          const text = step.text || step.name;
          const ins = dbRun(
            "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'system', ?, ?, 'ai_progress', ?)",
            [chatId, employee.id, senderName, text, tenantId]
          );
          broadcastToChat(chatId, {
            type: "new_message", chatId,
            message: { id: ins.lastInsertRowid, sender_type: "system", sender_name: senderName, content: text, message_type: "ai_progress", phase: step.name, step_key: `tool_${step.name}_${Date.now()}`, created_at: new Date().toISOString() },
          });
        } catch { /* 步骤推送失败不阻断执行 */ }
      },
    };
    const created = createRun(req);
    runId = created.id;
    dispatchRun(runId, req);
    let record = getRun(runId);
    for (let i = 0; i < 36; i++) {
      if (!record || record.status === "running" || record.status === "queued") {
        await sleep(5000);
        record = getRun(runId);
      } else break;
    }
    status = record?.status ?? "failed";
    output = record?.result ?? record?.error ?? "（无输出）";
    tokensEstimated = record?.tokens_estimated;
  }

  // 结果消息：附 H2A2A2H 治理标注 + 运行记录号（可追溯）
  const content = [
    `【AI 深度执行结果 · 草稿】`,
    ``,
    output,
    ``,
    `—— H2A2A2H 治理：本内容为 AI 在沙箱中的执行草稿，不构成正式业务指令/决定；执行记录 #${runId}，可追溯。`,
  ].join("\n");

  const insertResult = dbRun(
    "INSERT INTO messages (chat_id, sender_id, sender_type, sender_name, content, message_type, tenant_id) VALUES (?, ?, 'employee', ?, ?, 'ai_deep_exec', ?)",
    [chatId, employee.id, senderName, content, tenantId]
  );
  broadcastToChat(chatId, {
    type: "new_message",
    chatId,
    message: {
      id: insertResult.lastInsertRowid,
      sender_type: "employee",
      sender_name: senderName,
      content,
      message_type: "ai_deep_exec",
      created_at: new Date().toISOString(),
    },
  });

  try {
    logActivity({
      userId: 0,
      action: "chat_deep_execution",
      entityType: "chat",
      entityId: chatId,
      details: JSON.stringify({ runId, tenantId, task: task.slice(0, 200) }),
      tenantId,
    });
  } catch { /* 审计失败不阻断 */ }

  return { status, output, runId, tokensEstimated };
}
