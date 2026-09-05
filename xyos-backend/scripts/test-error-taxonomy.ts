/** V1.0 异常兜底分类自测：验证全量错误码枚举 + 归类准确性。 */
import { classifyError, errorInfo, safeErrorReply, ALL_XYOS_ERROR_CODES } from "../services/error-taxonomy";
import { initDatabase } from "../db";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

async function main() {
  await initDatabase();

  console.log("\n== 1. 全量错误码枚举完整性 ==");
  check("共 16 个错误码", ALL_XYOS_ERROR_CODES.length === 16, ALL_XYOS_ERROR_CODES.length);
  for (const code of ALL_XYOS_ERROR_CODES) {
    const info = errorInfo(code);
    check(`${code} 元信息完整`, !!info.code && !!info.userMessage && typeof info.retryable === "boolean" && !!info.level);
  }

  console.log("\n== 2. 错误归类 ==");
  check("timeout→LLM_TIMEOUT", classifyError(new Error("request timed out")) === "LLM_TIMEOUT");
  check("429→LLM_RATE_LIMIT", classifyError({ message: "429 too many requests" }) === "LLM_RATE_LIMIT");
  check("401→LLM_AUTH", classifyError({ message: "401 unauthorized" }) === "LLM_AUTH");
  check("context window→LLM_CONTEXT", classifyError(new Error("maximum context length exceeded")) === "LLM_CONTEXT");
  check("max tokens→LLM_MAX_TOKENS", classifyError(new Error("maximum output token reached")) === "LLM_MAX_TOKENS");
  check("EPERM→SANDBOX_DENIED", classifyError({ message: "EPERM: operation not permitted" }) === "SANDBOX_DENIED");
  check("sqlite error→DB_ERROR", classifyError(new Error("sqlite constraint failed")) === "DB_ERROR");
  check("INVALID_TRANSITION code", classifyError({ code: "INVALID_TRANSITION" }) === "INVALID_TRANSITION");
  check("TASK_NOT_FOUND→NOT_FOUND", classifyError({ code: "TASK_NOT_FOUND", status: 404 }) === "NOT_FOUND");
  check("DSH host down→DSH_HOST_DOWN", classifyError(new Error("DSH Host core service not ready")) === "DSH_HOST_DOWN");
  check("未知→UNKNOWN", classifyError(new Error("something weird")) === "UNKNOWN");

  console.log("\n== 3. 用户友好降级 + 审计 ==");
  const r = safeErrorReply(new Error("maximum output token reached"), 1);
  check("降级消息不含内部细节", r.code === "LLM_MAX_TOKENS" && !r.message.includes("token reached"), r.message);
  check("可重试标记正确", r.retryable === true);

  const r2 = safeErrorReply({ code: "INVALID_TRANSITION" }, 1);
  check("非法跳转不可重试", r2.retryable === false && r2.code === "INVALID_TRANSITION");

  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("自测崩溃:", e); process.exit(2); });
