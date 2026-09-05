/**
 * V1.0 四级授权 + 三道关 + 敏感门控自测。
 * 运行：node node_modules/tsx/dist/cli.mjs scripts/test-authorization.ts
 */
import { initDatabase, dbGet, dbAll } from "../db";
import {
  authorizeAction,
  classifyRequestAuthorization,
  detectSensitiveCategories,
  threeGates,
  buildRejectionFeedback,
  isActionRequest,
  resolveAuthorizationLevel,
} from "../services/authorization";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

async function main() {
  await initDatabase();
  const tenant = (dbGet("SELECT MAX(id) as mid FROM tenants") as any)?.mid ?? 1;
  const uid = (dbGet("SELECT MAX(id) as uid FROM users") as any)?.uid ?? 1;

  console.log("\n== 1. 敏感类别检测 ==");
  check("付款命中「支付」", detectSensitiveCategories("帮我做个付款").some(c => c.category === "支付"));
  check("删除数据命中「数据删除」(L3)", detectSensitiveCategories("删除客户数据").some(c => c.category === "数据删除" && c.level === 3));
  check("合同签署命中「合同签署」", detectSensitiveCategories("签合同").some(c => c.category === "合同签署"));
  check("纯闲聊无命中", detectSensitiveCategories("今天天气不错").length === 0);

  console.log("\n== 2. 动作意图识别 ==");
  check("「帮我做个付款」是动作请求", isActionRequest("帮我做个付款"));
  check("「分析财务数据」不是动作请求", !isActionRequest("分析财务数据"));
  check("「怎么设置密码」不是动作请求", !isActionRequest("怎么设置密码"));

  console.log("\n== 3. 四级授权解析 ==");
  const payLvl = resolveAuthorizationLevel({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "user_request", description: "帮我做个付款" });
  check("付款→L2(默认敏感)", payLvl.level === 2, `level=${payLvl.level}`);
  const delLvl = resolveAuthorizationLevel({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "user_request", description: "删除数据" });
  check("删除数据→L3(禁止)", delLvl.level === 3, `level=${delLvl.level}`);
  const normalLvl = resolveAuthorizationLevel({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "user_request", description: "写个周报" });
  check("写周报→L0(自主)", normalLvl.level === 0, `level=${normalLvl.level}`);

  console.log("\n== 4. 三道关 ==");
  const gates = threeGates({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "user_request", description: "写周报" }, 0);
  check("三道关齐全", gates.length === 3 && gates.every(g => g.passed), JSON.stringify(gates.map(g => g.gate)));

  console.log("\n== 5. authorizeAction 决策 ==");
  const deny = authorizeAction({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "data_delete", actionLabel: "删除客户数据", description: "删除客户数据" });
  check("data_delete→deny", deny.decision === "deny", deny.decision);
  check("deny 回喂非空", !!deny.feedback);

  const confirm = authorizeAction({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "payment", actionLabel: "打款", description: "打款给供应商" });
  check("payment→confirm", confirm.decision === "confirm", confirm.decision);
  check("confirm 生成 pending_review", !!confirm.reviewId);
  const pr = dbGet("SELECT * FROM pending_reviews WHERE id = ?", [confirm.reviewId]) as any;
  check("pending_review 状态 pending", pr?.status === "pending");

  const auto = authorizeAction({ tenantId: tenant, actorType: "ai", actorId: 1, actorLevel: 3, actionType: "analysis", actionLabel: "写周报", description: "写个周报" });
  check("写周报→auto", auto.decision === "auto", auto.decision);

  console.log("\n== 6. 请求级门控分类 ==");
  const g1 = classifyRequestAuthorization({ text: "帮我做个付款", tenantId: tenant, actorType: "human", actorId: uid, actorLevel: 3 });
  check("「帮我做个付款」被门控", g1.gated === true && g1.result?.decision === "confirm", g1.result?.decision);
  const g2 = classifyRequestAuthorization({ text: "分析一下财务数据", tenantId: tenant, actorType: "human", actorId: uid, actorLevel: 3 });
  check("「分析财务数据」不门控", g2.gated === false);
  const g3 = classifyRequestAuthorization({ text: "删除客户数据", tenantId: tenant, actorType: "human", actorId: uid, actorLevel: 3 });
  check("「删除客户数据」门控为 deny", g3.gated === true && g3.result?.decision === "deny", g3.result?.decision);

  console.log("\n== 7. 拒绝回喂格式 ==");
  const fb = buildRejectionFeedback(deny);
  check("回喂含拒绝原因", fb.includes("拒绝") && fb.includes("替代方案"), fb.slice(0, 60));

  console.log("\n== 8. 治理日志只增审计 ==");
  const logCount = dbAll("SELECT COUNT(*) as c FROM h2a2a_governance_log WHERE tenant_id = ?", [tenant]) as any;
  check("治理日志有记录", logCount.length > 0);

  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("自测崩溃:", e); process.exit(2); });
