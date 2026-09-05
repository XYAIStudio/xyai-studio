/**
 * H2A2A2H 底座激活 · 影子账本（A 方案）
 *
 * 在群聊主流程（runHierarchicalMode / runPeerMode）完全不动的前提下，
 * 于 chats.ts 的 progressCb 旁路并行记录「结构化任务 + 12 态状态机流转」，
 * 把 h2a2a2h 治理底座激活，为第二步「优化可视化」提供结构化数据源。
 *
 * 原则：
 *  - 只写不读回主流程（第二本账，供可视化/审计/未来辐射）；
 *  - 全程 try/catch，失败仅告警，绝不阻断群聊；
 *  - 受 ENABLE_H2A2A2H_SHADOW 开关控制（默认关，可随时回滚）。
 *
 * 借鉴：dsh-agent-teams 的「多智能体讨论 → 结构化任务 + 状态机」范式，
 *      落地到 XYOS 已有的 12 态状态机底座上（增强，非颠覆）。
 * @module dsh-agent-teams 借鉴 · XYOS 落地
 */
import { dbRun, dbGet, dbAll } from "../db";
import { H2A2A2HStateMachine } from "./h2a2a2h-state-machine";
import { FEATURE_FLAGS } from "../config/features";

/** 影子账本是否启用（默认关，灰度开启）。 */
function enabled(): boolean {
  return FEATURE_FLAGS.ENABLE_H2A2A2H_SHADOW === true;
}

/** 本轮协作的进程内上下文：chatId → { parentId }。 */
const turnCtx = new Map<number, { parentId: number }>();

/** 建父任务（幂等：已存在则复用）。 */
function ensureTurn(chatId: number, tenantId: number, initiatorUserId: number, title: string): number | undefined {
  const existing = turnCtx.get(chatId);
  if (existing) return existing.parentId;
  try {
    const r = dbRun(
      "INSERT INTO h2a2a2h_tasks (title, created_by, tenant_id, chat_id, state) VALUES (?, ?, ?, ?, 'created')",
      [(title || "群聊协作").slice(0, 60), initiatorUserId, tenantId, chatId]
    );
    turnCtx.set(chatId, { parentId: r.lastInsertRowid });
    return r.lastInsertRowid;
  } catch (e) {
    console.warn("[h2a2a2h-shadow] ensureTurn 失败:", (e as any)?.message);
    return undefined;
  }
}

/** 落一个子任务（created 态），返回任务 id。 */
function insertSubtask(
  parentId: number, tenantId: number, chatId: number,
  title: string, deps: number[], createdBy: number,
): number | undefined {
  try {
    const r = dbRun(
      "INSERT INTO h2a2a2h_tasks (title, created_by, tenant_id, parent_id, chat_id, dependencies, state) VALUES (?, ?, ?, ?, ?, ?, 'created')",
      [(title || "子任务").slice(0, 60), createdBy, tenantId, parentId, chatId, JSON.stringify(deps)]
    );
    return r.lastInsertRowid;
  } catch (e) {
    console.warn("[h2a2a2h-shadow] insertSubtask 失败:", (e as any)?.message);
    return undefined;
  }
}

/** 把一条任务按链逐步推进（遇到非法转换即停止，不阻断）。 */
function advance(taskId: number, chain: string[]): void {
  let cur: string | undefined = (dbGet("SELECT state FROM h2a2a2h_tasks WHERE id = ?", [taskId]) as any)?.state;
  for (const next of chain) {
    if (cur === next) continue;
    try {
      H2A2A2HStateMachine.transition(taskId, next as any, 0);
      cur = next;
    } catch {
      break; // 已越过或非法，停止推进
    }
  }
}

/** 结构化拆解落库：把管理者拆解文本交给 decomposeTask，落库为子任务（含依赖）。 */
async function recordDecomposition(chatId: number, tenantId: number, initiatorUserId: number, assignText: string): Promise<void> {
  const ctx = turnCtx.get(chatId);
  if (!ctx) return;
  try {
    const { decomposeTask } = await import("./ai");
    const subtasks: any[] = await decomposeTask(assignText, "");
    const idByTitle = new Map<string, number>();
    for (const st of subtasks) {
      const id = insertSubtask(ctx.parentId, tenantId, chatId, st.title, [], initiatorUserId);
      if (id !== undefined) idByTitle.set(st.title, id);
    }
    for (const st of subtasks) {
      const id = idByTitle.get(st.title);
      if (id === undefined) continue;
      const deps: number[] = (st.dependencies || [])
        .map((d: string) => idByTitle.get(d))
        .filter((x: number | undefined): x is number => x !== undefined);
      if (deps.length > 0) {
        dbRun("UPDATE h2a2a2h_tasks SET dependencies = ? WHERE id = ?", [JSON.stringify(deps), id]);
      }
    }
  } catch (e) {
    console.warn("[h2a2a2h-shadow] recordDecomposition 失败:", (e as any)?.message);
  }
}

/** 记录执行者交付：把该员工对应的子任务推进到 submitted，并附加产出摘要。 */
function recordDelivery(chatId: number, tenantId: number, initiatorUserId: number, agentName: string, output: string, stepKey?: string): void {
  const ctx = turnCtx.get(chatId);
  if (!ctx) return;
  try {
    // 平级制 peer_reply_done 不传 agentResult，从 stepKey（emp_<id>_...）解析员工身份
    const emp = employeeFromStepKey(stepKey, tenantId);
    const name = (emp?.name || agentName || "成员").slice(0, 60);
    const task = dbGet(
      "SELECT id FROM h2a2a2h_tasks WHERE chat_id = ? AND parent_id = ? AND title = ? ORDER BY id DESC LIMIT 1",
      [chatId, ctx.parentId, name]
    );
    let taskId: number | undefined = task?.id;
    if (taskId === undefined) {
      // 平级制（无拆解）兜底：为该成员新建一个子任务
      taskId = insertSubtask(ctx.parentId, tenantId, chatId, name, [], initiatorUserId);
    }
    if (taskId === undefined) return;
    // B 方案：回填 employee_id（优先 stepKey 解析的 id，其次按名字反查）
    const byName = dbGet("SELECT id FROM employees WHERE tenant_id = ? AND name = ? AND employee_type = 'ai' LIMIT 1", [tenantId, agentName]) as any;
    const employeeId = emp?.id ?? byName?.id;
    if (employeeId) {
      dbRun("UPDATE h2a2a2h_tasks SET employee_id = ? WHERE id = ?", [employeeId, taskId]);
    }
    if (output) {
      dbRun("UPDATE h2a2a2h_tasks SET description = COALESCE(description,'') || ? WHERE id = ?", [`\n[产出] ${output.slice(0, 300)}`, taskId]);
    }
    advance(taskId, ["claimed", "executing", "submitted"]);
  } catch (e) {
    console.warn("[h2a2a2h-shadow] recordDelivery 失败:", (e as any)?.message);
  }
}

/** 从 stepKey（emp_<employeeId>_...）解析 AI 员工身份。 */
function employeeFromStepKey(stepKey: string | undefined, tenantId: number): { id: number; name: string } | undefined {
  const m = stepKey?.match(/^emp_(\d+)_/);
  if (!m) return undefined;
  const id = parseInt(m[1], 10);
  const emp = dbGet("SELECT id, name FROM employees WHERE id = ? AND tenant_id = ?", [id, tenantId]) as any;
  return emp?.id ? { id: emp.id, name: emp.name } : undefined;
}

/** 记录评审完成：所有 submitted 子任务推进到 reviewing。 */
function recordReview(chatId: number): void {
  const ctx = turnCtx.get(chatId);
  if (!ctx) return;
  try {
    const rows = dbAll(
      "SELECT id FROM h2a2a2h_tasks WHERE chat_id = ? AND parent_id = ? AND state = 'submitted'",
      [chatId, ctx.parentId]
    ) as any[];
    for (const row of rows) {
      advance(row.id, ["reviewing"]);
    }
  } catch (e) {
    console.warn("[h2a2a2h-shadow] recordReview 失败:", (e as any)?.message);
  }
}

/** 汇总完成：父任务与所有子任务推进到 completed，并清理本轮上下文。 */
function finalize(chatId: number): void {
  const ctx = turnCtx.get(chatId);
  if (!ctx) return;
  try {
    advance(ctx.parentId, ["claimed", "executing", "submitted", "reviewing", "completed"]);
    const rows = dbAll(
      "SELECT id FROM h2a2a2h_tasks WHERE chat_id = ? AND parent_id = ? AND state IN ('submitted','reviewing')",
      [chatId, ctx.parentId]
    ) as any[];
    for (const row of rows) {
      advance(row.id, ["reviewing", "completed"]);
    }
  } catch (e) {
    console.warn("[h2a2a2h-shadow] finalize 失败:", (e as any)?.message);
  } finally {
    turnCtx.delete(chatId);
  }
}

/**
 * 派发入口：chats.ts 的 progressCb 每次回调都调一次（开关关闭时静默返回）。
 * 处理「拆解 / 交付 / 评审」三个中间事件；「汇总完成」由 chats.ts 异步块末尾调用 finalize 收尾。
 */
export function onPhase(
  phase: string, detail: string, stepKey: string | undefined, agentResult: any,
  chatId: number, tenantId: number, initiatorUserId: number,
): void {
  if (!enabled()) return;
  if (!chatId) return;
  switch (phase) {
    case "manager_assign_done": { // 层级制：管理者拆解完成
      ensureTurn(chatId, tenantId, initiatorUserId, detail);
      if (agentResult?.kind === "decomposition" && agentResult?.content) {
        void recordDecomposition(chatId, tenantId, initiatorUserId, String(agentResult.content));
      }
      break;
    }
    case "exec_reply_done":        // 层级制：执行者交付
    case "peer_reply_done": {      // 平级制：成员交付
      ensureTurn(chatId, tenantId, initiatorUserId, "群聊协作");
      recordDelivery(chatId, tenantId, initiatorUserId, agentResult?.agentName || "", agentResult?.content || "", stepKey);
      break;
    }
    case "peer_review_done":       // 平级制：交叉评审完成
      recordReview(chatId);
      break;
    default:
      break;
  }
}

/** 汇总完成收尾：由 chats.ts 异步编排块末尾调用（层级制/平级制共用）。 */
export function shadowFinalize(chatId: number): void {
  if (!enabled()) return;
  if (!chatId) return;
  finalize(chatId);
}
