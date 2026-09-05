/**
 * V1.0 H2A2A2H 状态机自测：验证 12 态合法转换 + 非法转换拒绝 + 看门狗超时熔断。
 * 运行：node node_modules/tsx/dist/cli.mjs scripts/test-state-machine.ts
 */
import { initDatabase, dbRun, dbGet, dbAll, saveDb } from "../db";
import { H2A2A2HStateMachine, isValidTransition, runWatchdog } from "../services/h2a2a2h-state-machine";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

async function main() {
  await initDatabase();

  console.log("\n== 1. 转换表完整性 ==");
  check("created→claimed 合法", isValidTransition("created", "claimed"));
  check("completed→reopened 合法", isValidTransition("completed", "reopened"));
  check("reviewing→disputed 合法", isValidTransition("reviewing", "disputed"));
  check("disputed→arbitrated 合法", isValidTransition("disputed", "arbitrated"));
  check("arbitrated→completed 合法", isValidTransition("arbitrated", "completed"));
  check("arbitrated→rejected 合法", isValidTransition("arbitrated", "rejected"));
  check("rejected→executing 合法", isValidTransition("rejected", "executing"));
  check("executing→aborted 合法", isValidTransition("executing", "aborted"));
  check("reopened→executing 合法", isValidTransition("reopened", "executing"));
  check("created→timed_out 合法", isValidTransition("created", "timed_out"));
  check("timed_out→created 合法", isValidTransition("timed_out", "created"));
  check("completed→executing 非法", !isValidTransition("completed", "executing"));
  check("created→completed 非法", !isValidTransition("created", "completed"));
  check("aborted→executing 非法", !isValidTransition("aborted", "executing"));

  console.log("\n== 2. 全链路状态流转（created→completed）==");
  const tenant = (dbGet("SELECT MAX(id) as mid FROM tenants") as any)?.mid ?? 1;
  const userId = (dbGet("SELECT MAX(id) as uid FROM users") as any)?.uid ?? 1;
  const rid = dbRun(
    "INSERT INTO h2a2a2h_tasks (title, description, created_by, reviewer_id, tenant_id, timeout_ms) VALUES (?, ?, ?, ?, ?, ?)",
    ["自测任务", "状态机全链路", userId, userId, tenant, null]
  ).lastInsertRowid;

  try {
    H2A2A2HStateMachine.transition(rid, "claimed", userId, { claimUserId: userId });
    check("claimed 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid]).state === "claimed");

    H2A2A2HStateMachine.transition(rid, "executing", userId);
    const exe = dbGet("SELECT state, attempts, entered_at FROM h2a2a2h_tasks WHERE id=?", [rid]);
    check("executing 成功且 attempts=1", exe.state === "executing" && exe.attempts === 1);
    check("entered_at 已写入", !!exe.entered_at);

    H2A2A2HStateMachine.transition(rid, "submitted", userId);
    check("submitted 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid]).state === "submitted");

    H2A2A2HStateMachine.transition(rid, "reviewing", userId);
    check("reviewing 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid]).state === "reviewing");

    H2A2A2HStateMachine.transition(rid, "completed", userId);
    const done = dbGet("SELECT state, completed_at FROM h2a2a2h_tasks WHERE id=?", [rid]);
    check("completed 成功且 completed_at 写入", done.state === "completed" && !!done.completed_at);

    // 非法：completed → executing 应拒绝
    let rejected = false;
    try { H2A2A2HStateMachine.transition(rid, "executing", userId); } catch (e: any) { rejected = e.code === "INVALID_TRANSITION"; }
    check("completed→executing 被拒绝(INVALID_TRANSITION)", rejected);

    // 重开
    H2A2A2HStateMachine.transition(rid, "reopened", userId);
    const reopened = dbGet("SELECT state, completed_at FROM h2a2a2h_tasks WHERE id=?", [rid]);
    check("reopened 成功且 completed_at 清空", reopened.state === "reopened" && reopened.completed_at == null);

    // 驳回链路：reopened → executing → submitted → reviewing → rejected（version+1）
    H2A2A2HStateMachine.transition(rid, "executing", userId);
    H2A2A2HStateMachine.transition(rid, "submitted", userId);
    H2A2A2HStateMachine.transition(rid, "reviewing", userId);
    H2A2A2HStateMachine.transition(rid, "rejected", userId);
    const rej = dbGet("SELECT state, version FROM h2a2a2h_tasks WHERE id=?", [rid]);
    check("rejected 成功且 version=1", rej.state === "rejected" && rej.version === 1);
  } catch (e: any) {
    check("全链路无异常", false, e.message);
  }

  console.log("\n== 3. 争议→仲裁链路 ==");
  // 直接造一个 reviewing 任务来走争议（简化同职级校验）
  const rid2 = dbRun(
    "INSERT INTO h2a2a2h_tasks (title, created_by, reviewer_id, tenant_id, state) VALUES ('争议任务', ?, ?, ?, 'reviewing')",
    [userId, userId, tenant]
  ).lastInsertRowid;
  H2A2A2HStateMachine.transition(rid2, "disputed", userId, { disputeReason: "对结论有异议" });
  check("reviewing→disputed 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid2]).state === "disputed");
  H2A2A2HStateMachine.transition(rid2, "arbitrated", userId, { arbitrationResult: "维持原判" });
  check("disputed→arbitrated 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid2]).state === "arbitrated");
  H2A2A2HStateMachine.transition(rid2, "completed", userId);
  check("arbitrated→completed 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid2]).state === "completed");

  console.log("\n== 4. 状态日志（只增审计）==");
  const logCount = dbAll("SELECT COUNT(*) as c FROM h2a2a2h_state_log WHERE task_id=?", [rid]).length;
  const log = dbGet("SELECT COUNT(*) as c FROM h2a2a2h_state_log WHERE task_id=?", [rid]) as any;
  check("state_log 有记录", log.c > 0, `log.c=${log.c}`);

  console.log("\n== 5. 看门狗超时熔断 ==");
  // 造一个 entered_at 很久之前的 executing 任务，应被熔断为 aborted
  const rid3 = dbRun(
    "INSERT INTO h2a2a2h_tasks (title, created_by, tenant_id, state, entered_at, timeout_ms) VALUES ('超时任务', ?, ?, 'executing', datetime('now','-2 hour'), 1000)",
    [userId, tenant]
  ).lastInsertRowid;
  const hit = runWatchdog();
  const wd = dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid3]);
  check("executing 超时→aborted", wd.state === "aborted", `state=${wd.state}`);
  check("watchdog 返回被处理 id", hit.includes(rid3), JSON.stringify(hit));

  // 造一个 created 超时任务，应转 timed_out
  const rid4 = dbRun(
    "INSERT INTO h2a2a2h_tasks (title, created_by, tenant_id, state, entered_at, timeout_ms) VALUES ('超时创建', ?, ?, 'created', datetime('now','-2 hour'), 1000)",
    [userId, tenant]
  ).lastInsertRowid;
  runWatchdog();
  const wd4 = dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid4]);
  check("created 超时→timed_out", wd4.state === "timed_out", `state=${wd4.state}`);

  console.log("\n== 6. aborted 熔断后仅可 created 重开 ==");
  const rid5 = dbRun(
    "INSERT INTO h2a2a2h_tasks (title, created_by, tenant_id, state) VALUES ('熔断任务', ?, ?, 'aborted')",
    [userId, tenant]
  ).lastInsertRowid;
  let abortedReject = false;
  try { H2A2A2HStateMachine.transition(rid5, "executing", userId); } catch (e: any) { abortedReject = e.code === "INVALID_TRANSITION"; }
  check("aborted→executing 被拒绝", abortedReject);
  H2A2A2HStateMachine.transition(rid5, "created", userId);
  check("aborted→created 成功", dbGet("SELECT state FROM h2a2a2h_tasks WHERE id=?", [rid5]).state === "created");

  saveDb();
  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("自测崩溃:", e); process.exit(2); });
