/**
 * 影子接线质检脚本（临时 SQLite，不碰真实 xiongyuan.db）
 *
 * 验证：
 *  1. 平级制交付 → 影子账本落库（1 父 + N 子 + submitted）
 *  2. 评审 + 汇总 → 12 态推进到 completed
 *  3. 状态迁移审计轨迹（h2a2a2h_state_log）
 *  4. 层级制拆解在 LLM 不可用时的容错（不崩溃、不阻断）
 *
 * 用法：cd backend && npx tsx scripts/verify-shadow.ts
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDb = path.join(__dirname, "..", "data", "test-shadow.db");

// 清理旧测试库（sql.js 会写 db + -wal + -shm）
for (const suffix of ["", "-wal", "-shm"]) {
  const p = tmpDb + suffix;
  if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
}

// 必须在 import db 之前设置（dbPath 在模块加载时读取 env）
process.env.DATABASE_PATH = tmpDb;
process.env.ENABLE_H2A2A2H_SHADOW = "true";

const { initDatabase, dbAll, dbRun } = await import("../db");
const { onPhase, shadowFinalize } = await import("../services/h2a2a2h-shadow");
const { assembleH2A2A2HSnapshot } = await import("../services/h2a2a2h-snapshot");

let failures = 0;
const check = (label: string, cond: boolean, detail = ""): void => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`); }
};

await initDatabase();

// 插入 4 个 AI 员工（测 employee_id 回填 + 快照 employeeName）
const members = ["周前", "吴后", "郑测", "李知"];
for (const name of members) {
  dbRun("INSERT INTO employees (name, role, agent_type, employee_type, tenant_id) VALUES (?, ?, ?, 'ai', 1)", [name, "工程师", "engineer"]);
}

const CHAT = 9999, TENANT = 1, USER = 1;

console.log("1/4 平级制交付落库（影子账本）");
for (const name of members) {
  onPhase("peer_reply_done", `✅ ${name} 方案交付`, undefined,
    { agentName: name, content: `${name} 的方案内容`, kind: "solution" }, CHAT, TENANT, USER);
}
let rows = dbAll("SELECT * FROM h2a2a2h_tasks WHERE chat_id = ? ORDER BY id", [CHAT]) as any[];
const parent = rows.find((t: any) => t.parent_id === null || t.parent_id === undefined);
const children = rows.filter((t: any) => t.parent_id);
check("落库 1 父 + 4 子", rows.length === 5, `实际 ${rows.length}`);
check("父任务存在且 state=created", !!parent && parent.state === "created", parent?.state);
check("子任务 4 个且 state=submitted", children.length === 4 && children.every((t: any) => t.state === "submitted"),
  `子=${children.length}, 态=${children.map((t: any) => t.state).join(",")}`);

console.log("2/4 评审 + 汇总（12 态推进）");
onPhase("peer_review_done", "✓ 评审完成", undefined, {}, CHAT, TENANT, USER);
let afterReview = dbAll("SELECT id, state FROM h2a2a2h_tasks WHERE chat_id = ? AND parent_id IS NOT NULL", [CHAT]) as any[];
check("评审后子任务=reviewing", afterReview.every((t: any) => t.state === "reviewing"),
  afterReview.map((t: any) => t.state).join(","));
shadowFinalize(CHAT);
rows = dbAll("SELECT * FROM h2a2a2h_tasks WHERE chat_id = ? ORDER BY id", [CHAT]) as any[];
const parentDone = rows.find((t: any) => !t.parent_id);
const childrenDone = rows.filter((t: any) => t.parent_id);
check("汇总后父任务=completed", parentDone?.state === "completed", parentDone?.state);
check("汇总后子任务全部=completed", childrenDone.every((t: any) => t.state === "completed"),
  childrenDone.map((t: any) => t.state).join(","));

console.log("3/4 状态迁移审计轨迹");
const log = dbAll(
  "SELECT * FROM h2a2a2h_state_log WHERE task_id IN (SELECT id FROM h2a2a2h_tasks WHERE chat_id = ?) ORDER BY id",
  [CHAT]
) as any[];
const parentLog = log.filter((l: any) => {
  const t = rows.find((r: any) => r.id === l.task_id);
  return t && !t.parent_id;
});
check("state_log 有流转轨迹", log.length > 0, `实际 ${log.length} 条`);
check("父任务轨迹覆盖 created→...→completed",
  parentLog.some((l: any) => l.to_state === "completed") && parentLog.some((l: any) => l.from_state === "created"));

console.log("4/4 回滚与容错（不触发真实 LLM）");
// a) 未知 phase 静默（default 分支不落库）
onPhase("unknown_phase", "x", undefined, {}, 9997, TENANT, USER);
const chk3 = dbAll("SELECT * FROM h2a2a2h_tasks WHERE chat_id = ?", [9997]) as any[];
check("未知 phase 不落库", chk3.length === 0);

// b) manager_assign_done 非 decomposition（kind != decomposition）只建父任务，不调 LLM
onPhase("manager_assign_done", "标题", undefined, { agentName: "x", kind: "summary" }, 9996, TENANT, USER);
const chk4 = dbAll("SELECT * FROM h2a2a2h_tasks WHERE chat_id = ?", [9996]) as any[];
check("manager_assign_done 非 decomposition 只建父任务", chk4.length === 1 && !chk4[0].parent_id, `实际 ${chk4.length}`);

console.log("5/5 快照组装（assembleH2A2A2HSnapshot）");
const snap = assembleH2A2A2HSnapshot(CHAT);
check("快照非空", snap !== null);
check("快照含父任务", Boolean(snap?.parent !== null && snap?.parent !== undefined));
check("快照含 4 个子任务", snap?.tasks.length === 4, `实际 ${snap?.tasks.length}`);
check("子任务已回填 employeeName（B 方案）", Boolean(snap?.tasks.every((t: any) => t.employeeName !== undefined)),
  snap?.tasks.map((t: any) => t.employeeName).join(","));
check("子任务 visualState=completed", Boolean(snap?.tasks.every((t: any) => t.visualState === "completed")));
check("快照含状态轨迹", (snap?.stateLog.length ?? 0) > 0);
check("无数据 chatId 返回 null", assembleH2A2A2HSnapshot(12345) === null);

// 清理临时库
for (const suffix of ["", "-wal", "-shm"]) {
  const p = tmpDb + suffix;
  if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nall shadow checks passed");
process.exit(0); // db.ts 有 30s saveDb 常驻定时器，显式退出
