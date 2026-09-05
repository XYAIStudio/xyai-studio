/**
 * V0.70 R2 H2A2A2H 全量状态机（V1.0 扩展为 12 态 + 看门狗）
 *
 * Human-to-AI-to-AI-to-Human 层级协作状态流转。
 *
 * 状态定义：
 *   created     → 任务已创建，待认领
 *   claimed     → 已被员工认领，待执行
 *   executing   → 执行中（AI 辅助）
 *   submitted   → 执行完毕，提交审核
 *   reviewing   → 上级/同级审核中
 *   completed   → 审核通过，关闭（终态，可 reopened）
 *   rejected    → 审核驳回
 *   disputed    → 同职级争议，待仲裁
 *   arbitrated  → 仲裁完成
 *   reopened    → 已重开（推翻 completed）
 *   timed_out   → 已超时（看门狗触发）
 *   aborted     → 已熔断（AI 失控/人类叫停/看门狗）
 *
 * 合法转换：
 *   created    → claimed | timed_out
 *   claimed    → executing | created | timed_out
 *   executing  → submitted | aborted | timed_out | created
 *   submitted  → reviewing | timed_out
 *   reviewing  → completed | rejected | disputed | timed_out
 *   completed  → reopened
 *   rejected   → executing | claimed | created
 *   disputed   → arbitrated
 *   arbitrated → completed | rejected
 *   reopened   → executing | claimed
 *   timed_out  → created | reviewing | aborted
 *   aborted    → created
 */

// ============================================================
// 状态定义
// ============================================================

export const H2A2A2H_STATES = [
  "created", "claimed", "executing", "submitted",
  "reviewing", "completed", "rejected", "disputed", "arbitrated",
  "reopened", "timed_out", "aborted",
] as const;
export type H2A2A2HState = typeof H2A2A2H_STATES[number];

export interface H2A2A2HTask {
  id: number;
  state: H2A2A2HState;
  title: string;
  description?: string;
  created_by: number;
  claimed_by?: number;
  assigned_to?: number;
  reviewer_id?: number;
  tenant_id: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  dispute_reason?: string;
  arbitration_result?: string;
  /** 进入当前状态的时间（看门狗用） */
  entered_at?: string;
  /** 状态超时毫秒数（看门狗用） */
  timeout_ms?: number;
  /** 执行/审核尝试次数 */
  attempts?: number;
  /** 版本号（rejected/revise 的版本链） */
  version?: number;
}

// ============================================================
// 状态转换表
// ============================================================

const TRANSITIONS: Record<H2A2A2HState, H2A2A2HState[]> = {
  created: ["claimed", "timed_out"],
  claimed: ["executing", "created", "timed_out"],
  executing: ["submitted", "aborted", "timed_out", "created"],
  submitted: ["reviewing", "timed_out"],
  reviewing: ["completed", "rejected", "disputed", "timed_out"],
  completed: ["reopened"],
  rejected: ["executing", "claimed", "created"],
  disputed: ["arbitrated"],
  arbitrated: ["completed", "rejected"],
  reopened: ["executing", "claimed"],
  timed_out: ["created", "reviewing", "aborted"],
  aborted: ["created"],
};

export function isValidTransition(from: H2A2A2HState, to: H2A2A2HState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================
// 状态机引擎
// ============================================================

import { dbGet, dbRun, dbAll } from "../db";

export class H2A2A2HStateMachine {
  /**
   * 尝试状态转换。失败时抛出异常。
   */
  static transition(taskId: number, to: H2A2A2HState, actorId: number, opts?: {
    claimUserId?: number;
    rejectReason?: string;
    disputeReason?: string;
    arbitrationResult?: string;
  }): boolean {
    const task = dbGet("SELECT * FROM h2a2a2h_tasks WHERE id = ?", [taskId]) as H2A2A2HTask | undefined;
    if (!task) throw Object.assign(new Error("任务不存在"), { code: "TASK_NOT_FOUND", status: 404 });

    const from = task.state;
    if (!isValidTransition(from, to)) {
      throw Object.assign(new Error(`非法状态转换: ${from} → ${to}`), {
        code: "INVALID_TRANSITION", status: 400, from, to,
      });
    }

    // 更新任务状态
    const updates: string[] = ["state = ?", "entered_at = CURRENT_TIMESTAMP"];
    const params: any[] = [to];

    switch (to) {
      case "claimed":
        updates.push("claimed_by = ?"); params.push(opts?.claimUserId ?? actorId);
        break;
      case "executing":
        updates.push("claimed_by = ?"); params.push(actorId);
        // 进入执行态，尝试次数 +1
        updates.push("attempts = COALESCE(attempts, 0) + 1");
        break;
      case "completed":
        updates.push("completed_at = CURRENT_TIMESTAMP");
        break;
      case "rejected":
        updates.push("dispute_reason = NULL"); // 清除争议理由
        updates.push("version = COALESCE(version, 0) + 1");
        break;
      case "disputed":
        updates.push("dispute_reason = ?"); params.push(opts?.disputeReason ?? "");
        break;
      case "arbitrated":
        updates.push("arbitration_result = ?"); params.push(opts?.arbitrationResult ?? "仲裁完成");
        break;
      case "reopened":
        updates.push("completed_at = NULL");
        break;
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(taskId);

    dbRun(`UPDATE h2a2a2h_tasks SET ${updates.join(", ")} WHERE id = ?`, params);

    // 记录状态变更日志（只增不改，审计）
    dbRun(
      "INSERT INTO h2a2a2h_state_log (task_id, from_state, to_state, actor_id, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
      [taskId, from, to, actorId]
    );

    return true;
  }

  /**
   * 获取所有可达的下一状态
   */
  static nextStates(currentState: H2A2A2HState): H2A2A2HState[] {
    return TRANSITIONS[currentState] || [];
  }

  /**
   * 检查任务是否可被给定角色操作
   */
  static canAct(task: H2A2A2HTask, userId: number, role: string): boolean {
    switch (task.state) {
      case "created":
        // 任何同租户 AI 或员工可认领
        return true;
      case "claimed":
        // 仅认领者可执行或放弃
        return task.claimed_by === userId;
      case "executing":
        return task.claimed_by === userId;
      case "submitted":
        // 审核者或管理员
        return task.reviewer_id === userId || role === "super_admin" || role === "admin";
      case "reviewing":
        // 仅同职级可争议
        return task.reviewer_id === userId || role === "super_admin";
      default:
        return role === "super_admin";
    }
  }
}

// ============================================================
// 同职级争议仲裁
// ============================================================

/**
 * 发起争议：同职级 peer 对审核结果提出异议
 */
export function raiseDispute(
  taskId: number,
  disputerId: number,
  reason: string
): void {
  const task = dbGet("SELECT * FROM h2a2a2h_tasks WHERE id = ?", [taskId]) as H2A2A2HTask | undefined;
  if (!task) throw Object.assign(new Error("任务不存在"), { code: "TASK_NOT_FOUND" });
  if (task.state !== "reviewing") {
    throw Object.assign(new Error("仅审核中的任务可发起争议"), { code: "INVALID_STATE" });
  }

  // 同职级检查：争议者必须与执行者是同一职级
  const disputer = dbGet(
    "SELECT e.position_level_id FROM employees e INNER JOIN users u ON u.id = e.user_id WHERE u.id = ?",
    [disputerId]
  ) as any;

  const executor = dbGet(
    "SELECT e.position_level_id FROM employees e WHERE e.id = ?",
    [task.claimed_by]
  ) as any;

  if (!disputer || !executor || disputer.position_level_id !== executor.position_level_id) {
    throw Object.assign(new Error("仅同职级员工可发起争议"), { code: "NOT_PEER_LEVEL" });
  }

  H2A2A2HStateMachine.transition(taskId, "disputed", disputerId, {
    disputeReason: reason,
  });
}

/**
 * 仲裁：由更高级别管理员裁决争议
 */
export function arbitrateDispute(
  taskId: number,
  arbitratorId: number,
  result: "completed" | "rejected",
  arbitrationNote: string
): void {
  const task = dbGet("SELECT * FROM h2a2a2h_tasks WHERE id = ?", [taskId]) as H2A2A2HTask | undefined;
  if (!task) throw Object.assign(new Error("任务不存在"), { code: "TASK_NOT_FOUND" });
  if (task.state !== "disputed") {
    throw Object.assign(new Error("仅争议中的任务可仲裁"), { code: "INVALID_STATE" });
  }

  H2A2A2HStateMachine.transition(taskId, "arbitrated", arbitratorId, {
    arbitrationResult: arbitrationNote,
  });

  H2A2A2HStateMachine.transition(taskId, result, arbitratorId);
}

// ============================================================
// 看门狗（超时熔断）
// ============================================================

/** 需要看门狗监控的"阻塞态"及其默认超时毫秒数 */
const WATCHDOG_STATES: Partial<Record<H2A2A2HState, number>> = {
  created: 30 * 60 * 1000,    // 30 分钟无人认领 → timed_out
  claimed: 60 * 60 * 1000,    // 1 小时未开始执行 → timed_out
  executing: 60 * 60 * 1000,  // 1 小时未提交 → timed_out（AI 失控熔断）
  submitted: 30 * 60 * 1000,  // 30 分钟未进入审核 → timed_out
  reviewing: 24 * 60 * 60 * 1000, // 24 小时未裁决 → timed_out
};

/**
 * 看门狗巡检：把超过 timeout_ms 仍未流转的阻塞态任务推进到超时态。
 * - created/claimed/submitted → timed_out（可回 created 重来）
 * - executing → aborted（AI 失控熔断，需人工重开）
 * - reviewing → timed_out（审核悬挂）
 *
 * 单任务超时优先读取 task.timeout_ms，缺省用 WATCHDOG_STATES 默认值。
 * 返回本次巡检处理的超时任务 id 列表（只增审计日志由 transition 内部完成）。
 */
export function runWatchdog(timeoutMs?: number): number[] {
  const timedOutIds: number[] = [];
  const rows = dbAll(
    "SELECT * FROM h2a2a2h_tasks WHERE state IN (?, ?, ?, ?, ?)",
    ["created", "claimed", "executing", "submitted", "reviewing"]
  ) as H2A2A2HTask[];

  const now = Date.now();
  for (const task of rows) {
    // 有效超时：显式传入 > 任务字段 > 状态默认值
    const defaultMs = WATCHDOG_STATES[task.state] ?? 60 * 60 * 1000;
    const effectiveMs =
      (timeoutMs && timeoutMs > 0) ? timeoutMs
        : (task.timeout_ms && task.timeout_ms > 0) ? task.timeout_ms
          : defaultMs;

    const entered = task.entered_at ? Date.parse(task.entered_at) : NaN;
    // 无法解析 entered_at（历史脏数据）时，退化为 updated_at
    const base = Number.isFinite(entered) ? entered : (task.updated_at ? Date.parse(task.updated_at) : NaN);
    if (!Number.isFinite(base)) continue;

    if (now - base < effectiveMs) continue;

    const to: H2A2A2HState = task.state === "executing" ? "aborted" : "timed_out";
    try {
      // 看门狗以系统身份（actorId=0）推进，拒绝非法转换时记日志但不中断巡检
      H2A2A2HStateMachine.transition(task.id, to, 0);
      timedOutIds.push(task.id);
    } catch (err) {
      // 并发下状态可能已被正常流转，忽略即可
      const code = (err as any)?.code;
      if (code !== "INVALID_TRANSITION" && code !== "TASK_NOT_FOUND") {
        console.error(`[watchdog] 任务 ${task.id} 超时处理失败:`, (err as any)?.message ?? err);
      }
    }
  }
  return timedOutIds;
}
