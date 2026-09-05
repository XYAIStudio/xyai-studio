/** V1.0 人机混聊话语权分类自测（纯函数，无 DB 依赖）。 */
import { classifyHumanControl } from "../services/human-oversight";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

const cases: Array<[string, string, string]> = [
  ["停止", "stop", ""],
  ["停下", "stop", ""],
  ["暂停", "stop", ""],
  ["停", "stop", ""],
  ["别继续了", "stop", ""],
  ["不对，应该先分析需求", "steer", ""],
  ["你理解错了", "steer", ""],
  ["换个思路，先做市场调研", "steer", ""],
  ["驳回，方案太粗糙", "reject", ""],
  ["重做", "reject", ""],
  ["确认", "confirm", ""],
  ["好的", "confirm", ""],
  ["帮我分析一下财务数据", "normal", ""],
  ["写个周报", "normal", ""],
  ["今天天气不错", "normal", ""],
  ["停车场在哪", "normal", ""],
  ["请停止部署计划并重新评估", "stop", ""],
  ["这个方案不对，改成客户优先", "steer", ""],
];

console.log("\n== 人机控制消息分类 ==");
for (const [input, expected] of cases) {
  const r = classifyHumanControl(input);
  check(`「${input}」→ ${expected}`, r.type === expected, `got=${r.type}`);
}

// 防误伤：长句中的"取消/停止"不应触发叫停
check("「取消订阅并更新配置」不误判为 stop", classifyHumanControl("取消订阅并更新配置").type !== "stop",
  classifyHumanControl("取消订阅并更新配置").type);

console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail === 0 ? 0 : 1);
