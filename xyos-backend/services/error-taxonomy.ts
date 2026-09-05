/**
 * V1.0 H2A2A2H 异常兜底 — 全量错误分类 + 用户友好降级 + 审计只增不改
 *
 * 把 AI/agent 执行链路上可能出现的异常统一归类为稳定错误码，
 * 每个码携带：可重试性、用户友好提示、审计动作。
 * 保证任何异常都不会让进程崩溃，也不会把内部细节泄露给用户。
 */

import { dbRun } from "../db";

/** 稳定错误码 */
export type XyosErrorCode =
  | "LLM_TIMEOUT"        // 模型调用超时
  | "LLM_RATE_LIMIT"     // 限流
  | "LLM_AUTH"           // 凭证/认证失败
  | "LLM_CONTEXT"        // 上下文超窗
  | "LLM_MAX_TOKENS"     // 输出触顶（已自动续跑后仍不够）
  | "LLM_EMPTY"          // 模型空输出
  | "TOOL_FAILED"        // 工具执行失败
  | "SANDBOX_DENIED"     // 沙箱权限拒绝
  | "DSH_HOST_DOWN"      // DSH Host 未就绪/崩溃
  | "DB_ERROR"           // 数据库错误
  | "SENSITIVE_DENIED"   // 治理门控拒绝（L3）
  | "NEEDS_APPROVAL"     // 需人工确认（L2）
  | "ABORTED"            // 被人类叫停
  | "INVALID_TRANSITION" // 状态机非法跳转
  | "NOT_FOUND"          // 目标不存在
  | "UNKNOWN";           // 兜底

export interface XyosErrorInfo {
  code: XyosErrorCode;
  /** 是否可自动重试 */
  retryable: boolean;
  /** 用户友好提示（不泄露内部细节） */
  userMessage: string;
  /** 是否写入审计 */
  audit: boolean;
  /** 日志级别 */
  level: "warn" | "error" | "fatal";
}

const TAXONOMY: Record<XyosErrorCode, Omit<XyosErrorInfo, "code">> = {
  LLM_TIMEOUT:        { retryable: true,  userMessage: "AI 思考超时，请稍后重试或换个更具体的问法。", audit: false, level: "warn" },
  LLM_RATE_LIMIT:     { retryable: true,  userMessage: "AI 服务繁忙（限流），请稍后重试。", audit: false, level: "warn" },
  LLM_AUTH:           { retryable: false, userMessage: "AI 服务凭证异常，请联系管理员配置。", audit: true, level: "error" },
  LLM_CONTEXT:        { retryable: false, userMessage: "上下文过长，已自动压缩历史；若仍失败请精简任务。", audit: false, level: "warn" },
  LLM_MAX_TOKENS:     { retryable: true,  userMessage: "回答被截断，已尝试续写；若仍不完整请拆分任务。", audit: false, level: "warn" },
  LLM_EMPTY:          { retryable: true,  userMessage: "AI 未生成有效回答，请换个方式提问。", audit: false, level: "warn" },
  TOOL_FAILED:        { retryable: true,  userMessage: "某步骤执行失败，AI 已尝试调整；可要求它换个方法。", audit: true, level: "warn" },
  SANDBOX_DENIED:     { retryable: false, userMessage: "该操作超出授权沙箱范围，已被拒绝。", audit: true, level: "warn" },
  DSH_HOST_DOWN:      { retryable: true,  userMessage: "执行引擎暂不可用，正在重启，请稍后重试。", audit: true, level: "error" },
  DB_ERROR:           { retryable: false, userMessage: "数据存取异常，请稍后重试。", audit: true, level: "error" },
  SENSITIVE_DENIED:   { retryable: false, userMessage: "该请求命中禁止动作，已被治理引擎拒绝。", audit: true, level: "warn" },
  NEEDS_APPROVAL:     { retryable: false, userMessage: "该请求需人工事前确认，已生成待审单。", audit: true, level: "warn" },
  ABORTED:            { retryable: false, userMessage: "已按你的指令停止。", audit: true, level: "warn" },
  INVALID_TRANSITION: { retryable: false, userMessage: "流程状态不允许该操作，已拒绝并留痕。", audit: true, level: "warn" },
  NOT_FOUND:          { retryable: false, userMessage: "目标不存在或已被移除。", audit: false, level: "warn" },
  UNKNOWN:            { retryable: false, userMessage: "发生未知错误，请稍后重试。", audit: true, level: "error" },
};

/** 根据错误对象/消息归类为稳定错误码 */
export function classifyError(err: any): XyosErrorCode {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const code = err?.code;
  const status = err?.status;

  if (code === "INVALID_TRANSITION") return "INVALID_TRANSITION";
  if (code === "SENSITIVE_DENIED") return "SENSITIVE_DENIED";
  if (code === "NEEDS_APPROVAL") return "NEEDS_APPROVAL";
  if (code === "ABORTED" || msg.includes("aborted") || msg.includes("cancel")) return "ABORTED";
  if (status === 404 || code === "TASK_NOT_FOUND") return "NOT_FOUND";

  if (/timeout|timed out|etimedout|abort.*time/i.test(msg)) return "LLM_TIMEOUT";
  if (/rate.?limit|429|too many requests|throttl/i.test(msg)) return "LLM_RATE_LIMIT";
  if (/unauthorized|401|403|invalid.*(api.?key|token)|auth/i.test(msg)) return "LLM_AUTH";
  if (/context.*(length|window|exceed)|maximum context/i.test(msg)) return "LLM_CONTEXT";
  if (/max.?tokens|maximum (token|output)|output token/i.test(msg)) return "LLM_MAX_TOKENS";
  if (/empty (response|output)|no (text|content)/i.test(msg)) return "LLM_EMPTY";
  if (/sandbox|permission denied|not permitted|access denied|eperm/i.test(msg)) return "SANDBOX_DENIED";
  if (/database|sqlite|sql.*error|db.*error/i.test(msg)) return "DB_ERROR";
  if (/dsh|host|engine.*not.*ready|core service/i.test(msg)) return "DSH_HOST_DOWN";

  return "UNKNOWN";
}

/** 取某个错误码的元信息 */
export function errorInfo(code: XyosErrorCode): XyosErrorInfo {
  return { code, ...TAXONOMY[code] };
}

/**
 * 把异常转为用户友好回复，并按需写审计（只增不改）。
 * @param err 原始异常
 * @param tenantId 租户（写审计用）
 */
export function safeErrorReply(err: any, tenantId?: number): { code: XyosErrorCode; message: string; retryable: boolean } {
  const code = classifyError(err);
  const info = errorInfo(code);
  const message = `[系统] ${info.userMessage}`;
  if (info.audit && tenantId) {
    try {
      dbRun(
        `INSERT INTO h2a2a_governance_log (tenant_id, action_id, actor_type, actor_id, actor_level, result, reason)
         VALUES (?, ?, 'system', 0, NULL, 'error', ?)`,
        [tenantId, `err_${code}_${Date.now()}`, `${code}: ${String(err?.message ?? err).slice(0, 300)}`]
      );
    } catch { /* 审计写入失败不阻断降级 */ }
  }
  return { code, message, retryable: info.retryable };
}

/** 全量错误码清单（供文档/自测枚举校验） */
export const ALL_XYOS_ERROR_CODES: XyosErrorCode[] = [
  "LLM_TIMEOUT", "LLM_RATE_LIMIT", "LLM_AUTH", "LLM_CONTEXT", "LLM_MAX_TOKENS", "LLM_EMPTY",
  "TOOL_FAILED", "SANDBOX_DENIED", "DSH_HOST_DOWN", "DB_ERROR", "SENSITIVE_DENIED", "NEEDS_APPROVAL",
  "ABORTED", "INVALID_TRANSITION", "NOT_FOUND", "UNKNOWN",
];
