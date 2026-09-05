/** V1.0 呈现层树形数据模型自测：验证 Task→Phase→Contribution→Block 推导。 */
import { buildTurnTree } from "../services/h2a2a2h-tree";
import { initDatabase } from "../db";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

async function main() {
  await initDatabase();

  const msgs: any[] = [
    { id: 1, sender_type: "user", content: "帮我做一个竞品分析" },
    { id: 2, sender_type: "employee", sender_name: "张总 · CEO", content: "我来拆解任务...", reasoning: "", message_type: "ai_assign", step_key: "mgr_1_analyze" },
    { id: 3, sender_type: "employee", sender_name: "李产 · 产品总监", content: "", reasoning: "从用户体验角度分析", message_type: "ai_think", step_key: "emp_2_think" },
    { id: 4, sender_type: "employee", sender_name: "李产 · 产品总监", content: "这是产品方案...", reasoning: "", message_type: "ai_reply", step_key: "emp_2_reply" },
    { id: 5, sender_type: "system", sender_name: "AI员工", content: "web_search: 竞品报告", phase: "web_search", message_type: "ai_progress" },
    { id: 6, sender_type: "employee", sender_name: "王财 · CFO", content: "成本分析...", reasoning: "", message_type: "ai_reply", step_key: "emp_3_reply" },
    { id: 7, sender_type: "employee", sender_name: "张总 · CEO", content: "总结报告...", reasoning: "", message_type: "ai_summary", step_key: "mgr_1_summary" },
    { id: 8, sender_type: "user", content: "继续" },
    { id: 9, sender_type: "employee", sender_name: "张总 · CEO", content: "补充结论...", message_type: "ai_reply", step_key: "mgr_1_reply" },
  ];

  const tree = buildTurnTree(msgs);
  console.log("\n== 树形结构 ==");
  check("两个 Task（两轮）", tree.length === 2, `tasks=${tree.length}`);

  const t1 = tree[0];
  check("Task 标题为用户消息", t1.title.includes("竞品分析"), t1.title);
  check("Task 类型正确", t1.type === "task");

  const phases = t1.children;
  const phaseNames = phases.map(p => p.phase);
  console.log("  phases:", phaseNames.join(" → "));
  check("包含 decompose 阶段", phaseNames.includes("decompose"));
  check("包含 think 阶段", phaseNames.includes("think"));
  check("包含 reply 阶段", phaseNames.includes("reply"));
  check("包含 summary 阶段", phaseNames.includes("summary"));
  check("阶段按顺序排序", phaseNames[0] === "decompose" && phaseNames[phaseNames.length - 1] === "summary");

  const replyPhase = phases.find(p => p.phase === "reply")!;
  check("reply 阶段有 2 个贡献（李产/王财）", replyPhase.children.length === 2, replyPhase.children.length);

  const liChan = replyPhase.children[0];
  check("贡献名=李产", (liChan.employeeName || "").includes("李产"), liChan.employeeName);

  // web_search 工具块应挂到某贡献下
  const allBlocks = phases.flatMap(p => p.children).flatMap(c => c.children);
  const toolBlock = allBlocks.find(b => b.blockKind === "tool");
  check("存在 tool 块", !!toolBlock, JSON.stringify(allBlocks.map(b => b.blockKind)));
  check("tool 块标题=web_search", toolBlock?.title === "web_search", toolBlock?.title);

  const thinkBlock = allBlocks.find(b => b.blockKind === "think");
  check("存在 think 块", !!thinkBlock && (thinkBlock.content || "").includes("用户体验"), thinkBlock?.content);

  const t2 = tree[1];
  check("第二轮 Task 正确", t2.title.includes("继续"), t2.title);

  console.log("\n== 树形 JSON 快照 ==");
  console.log(JSON.stringify(tree.map(t => ({ title: t.title, phases: t.children.map(p => ({ phase: p.phase, contribs: p.children.length })) })), null, 2));

  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("自测崩溃:", e); process.exit(2); });
