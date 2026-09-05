/** 六类脱敏引擎自测 */
import { Desensitizer } from "../services/industry-agent-generator/desensitizer";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

function main() {
  const d = new Desensitizer();
  const sample = "山西XX热电有限公司位于大同市，华能集团王伟工程师负责#2机组超低排放改造项目，其智慧能源管理平台（XX品牌）于2026年并网。";
  const { text, mapping } = d.process(sample);

  console.log("原文:", sample);
  console.log("脱敏:", text);
  console.log("映射条目:", Object.keys(mapping).length);

  console.log("\n== 六类实体脱敏 ==");
  check("公司名脱敏（含【公司】代号）", text.includes("【公司"), text);
  check("公司名不残留「热电有限公司」", !text.includes("热电有限公司"));
  check("地名脱敏", text.includes("【地点"), text);
  check("地名不残留「大同市」", !text.includes("大同市"));
  check("人名脱敏", text.includes("【人名"), text);
  check("人名不残留「王伟」", !text.includes("王伟"));
  check("项目脱敏", text.includes("【项目"), text);
  check("项目不残留「改造项目」", !text.includes("改造项目"));
  check("产品脱敏", text.includes("【产品"), text);
  check("产品不残留「管理平台」", !text.includes("管理平台"));
  check("品牌脱敏", text.includes("【品牌"), text);
  check("品牌不残留「XX品牌」", !text.includes("XX品牌"));

  console.log("\n== 一致性与可逆性 ==");
  const d2 = new Desensitizer();
  const t1 = d2.process("华能集团在运城有项目").text;
  const t2 = d2.process("华能集团在运城有项目").text;
  check("同一实体同一代号（华能一致）", t1 === t2);
  check("映射可逆（mapping 含华能）", Object.values(d2.getMapping()).includes(t1.match(/【公司\d+】/)![0]));
  check("mapping 键含原文「华能集团」", Object.keys(d2.getMapping()).some(k => k.includes("华能")));

  console.log("\n== 保守性（不误伤技术词）==");
  const tech = "汽轮机、锅炉、发电机、循环流化床、脱硫脱硝";
  const techMasked = new Desensitizer().process(tech).text;
  check("技术术语不脱敏", techMasked === tech, techMasked);

  console.log("\n== 新增四类脱敏 ==");
  const d3 = new Desensitizer();
  // 统一社会信用代码
  const credit = d3.process("统一社会信用代码：91350100MA32X8WY5X").text;
  check("统一社会信用代码脱敏", credit.includes("【信用代码"), credit);
  check("信用代码不残留原文", !credit.includes("91350100MA32X8WY5X"));

  // 单位机构名称
  const org = d3.process("清华大学、北京协和医院、中国电力企业联合会").text;
  check("单位机构脱敏（学校）", org.includes("【单位"), org);
  check("单位机构不残留「清华大学」", !org.includes("清华大学"));

  // 客户名单
  const cust = d3.process("主要客户：宁德时代新能源科技股份有限公司、比亚迪股份有限公司").text;
  check("客户名单脱敏", cust.includes("【客户") || cust.includes("【公司"), cust);

  // 经营数据
  const biz = d3.process("2024 年营收 4.5 亿元，出货量 1.2GWh，员工 120 人").text;
  check("经营数据脱敏（数值替换）", biz.includes("【数据"), biz);
  check("经营数据不残留「4.5」", !biz.includes("4.5"), biz);

  console.log("\n== 个人敏感信息脱敏 ==");
  const d4 = new Desensitizer();
  const pid = d4.process("身份证号 110101199003077758，手机号 13812345678").text;
  check("身份证号脱敏", pid.includes("【个人信息"), pid);
  check("身份证号不残留原文", !pid.includes("110101199003077758"));
  check("手机号不残留原文", !pid.includes("13812345678"));
  const email = d4.process("联系邮箱 zhangsan@example.com").text;
  check("邮箱脱敏", email.includes("【个人信息"), email);
  check("邮箱不残留原文", !email.includes("zhangsan@example.com"));

  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
