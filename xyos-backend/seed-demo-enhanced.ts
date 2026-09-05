/**
 * 演示租户增强种子数据 — 让 demo@demo.com / user@demo.com 看到丰富的数据
 *
 * 增强内容：
 * 1. 20 个外派机构（dispatch offices） + ~180 名外派员工（在 COO办公室下）
 * 2. 5+ 份丰富合同（含进度节点、条款、多级预警数据）
 * 3. 合同进度验收节点（contract_progress）
 * 4. 合同法律条款（contract_clauses）
 * 5. 多级预警配置（contract_alert_config）
 *
 * 幂等策略：所有操作通过检查已存在记录名称/编号来跳过重复插入
 *
 * 运行: npx tsx backend/seed-demo-enhanced.ts
 */

import { dbGet, dbRun, dbAll, initDatabase, saveDb } from "./db";

const DEMO_TENANT = 2;
const DEMO_COMPANY = 2;

// ============================================================
// Part 1: 外派机构 + 员工
// ============================================================
const DISPATCHED_OFFICES = [
  { name: "华南区域项目部", area: "华南", code: "HN" },
  { name: "华东区域项目部", area: "华东", code: "HD" },
  { name: "华北区域项目部", area: "华北", code: "HB" },
  { name: "西南区域项目部", area: "西南", code: "XN" },
  { name: "西北区域项目部", area: "西北", code: "XB" },
  { name: "东北区域项目部", area: "东北", code: "DB" },
  { name: "华中区域项目部", area: "华中", code: "HZ" },
  { name: "长三角办事处", area: "华东", code: "CSJ" },
  { name: "珠三角办事处", area: "华南", code: "ZSJ" },
  { name: "京津冀办事处", area: "华北", code: "JJJ" },
  { name: "成渝办事处", area: "西南", code: "CY" },
  { name: "长江经济带项目部", area: "华中", code: "CJ" },
  { name: "沿海通道项目部", area: "华东", code: "YH" },
  { name: "海外事业部", area: "海外", code: "HW" },
  { name: "智慧城市项目部", area: "全国", code: "ZHC" },
  { name: "新能源项目部", area: "全国", code: "XNY" },
  { name: "基础设施一部", area: "全国", code: "JC1" },
  { name: "基础设施二部", area: "全国", code: "JC2" },
  { name: "轨道交通项目部", area: "全国", code: "GD" },
  { name: "数字政府项目部", area: "全国", code: "SZZ" },
];

const ENGINEER_SPECIALTIES: Record<string, string[]> = {
  "智慧城市": ["系统集成", "物联网", "数据平台", "网络安全"],
  "新能源": ["电气工程", "能源管理", "储能技术", "光伏设计"],
  "轨道交通": ["轨道工程", "信号系统", "车辆工程", "供电系统"],
  "数字政府": ["政务信息化", "数据治理", "网络安全", "平台架构"],
  "海外": ["国际商务", "外语翻译", "跨文化管理", "法务合规"],
};

function buildOfficeStaff(officeName: string, officeArea: string, officeCode: string) {
  const short = officeName.replace("区域项目部", "").replace("办事处", "").replace("项目部", "").replace("事业部", "");
  const prefix = short;

  const specialties = ENGINEER_SPECIALTIES[short]
    || ["土木工程", "结构设计", "造价管理", "质量检测", "安全管理"];

  return [
    {
      name: `${prefix}指挥长`, role: "外派机构负责人", type: "ai" as const,
      emoji: "👔", skills: "团队管理,项目统筹,客户关系,进度管控",
      agent: "strategy_executive", sort: 1,
    },
    {
      name: `${prefix}副指挥长`, role: "副总监", type: "ai" as const,
      emoji: "📋", skills: "技术管理,质量把控,资源配置,人员调度",
      agent: "product_manager", sort: 2,
    },
    {
      name: `${prefix}执行总监`, role: "副总监", type: "ai" as const,
      emoji: "⚙️", skills: "现场管理,进度跟踪,成本控制,沟通协调",
      agent: "ceo", sort: 3,
    },
    {
      name: `${prefix}${specialties[0]}工程师`, role: "专业工程师", type: "ai" as const,
      emoji: "🏗️", skills: `${specialties[0]},方案设计,技术评审,现场指导`,
      agent: "tech_architect", sort: 10,
    },
    {
      name: `${prefix}${specialties[1]}工程师`, role: "专业工程师", type: "ai" as const,
      emoji: "🔧", skills: `${specialties[1]},质量监控,标准执行,报告编制`,
      agent: "backend_dev", sort: 11,
    },
    {
      name: `${prefix}${specialties[2]}工程师`, role: "专业工程师", type: "ai" as const,
      emoji: "📐", skills: `${specialties[2]},成本测算,报价审核,预算管理`,
      agent: "bi_analyst", sort: 12,
    },
    {
      name: `${prefix}${specialties[3]}工程师`, role: "专业工程师", type: "ai" as const,
      emoji: "🔍", skills: `${specialties[3]},检测验收,标准编制,驻场服务`,
      agent: "qa_engineer", sort: 13,
    },
    {
      name: `${prefix}综合专员`, role: "综合专员", type: "ai" as const,
      emoji: "📎", skills: "行政事务,文档管理,后勤保障,会议协调",
      agent: "customer_success", sort: 20,
    },
    {
      name: `${prefix}商务专员`, role: "商务专员", type: "ai" as const,
      emoji: "💼", skills: "合同跟进,商务对接,数据统计,汇报材料",
      agent: "sales_manager", sort: 21,
    },
  ];
}

async function seedDispatchedForDemo() {
  // 找到 tenant=2 的 COO办公室
  const coo = dbGet(
    "SELECT d.id, d.name, d.company_id, d.tenant_id FROM departments d WHERE d.name = ? AND d.tenant_id = ? AND d.parent_id IS NOT NULL",
    ["COO办公室", DEMO_TENANT]
  ) as any;

  if (!coo) {
    console.log("[增强种子] ⚠️ 未找到 tenant=2 的COO办公室，跳过分部创建");
    return { offices: 0, employees: 0 };
  }

  console.log(`[增强种子] 找到COO办公室: id=${coo.id}`);

  // 检查已有的外派机构
  const existingOffices = dbAll(
    "SELECT id, name FROM departments WHERE parent_id = ? AND function_type = ?",
    [coo.id, "dispatched"]
  ) as any[];
  const existingNames = new Set(existingOffices.map((d: any) => d.name));

  let officeCount = 0;
  let employeeCount = 0;

  for (const office of DISPATCHED_OFFICES) {
    if (existingNames.has(office.name)) {
      const existing = existingOffices.find((d: any) => d.name === office.name);
      console.log(`  ⏭ 跳过已存在: ${office.name} (id=${existing?.id})`);
      continue;
    }

    const deptResult = dbRun(
      "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, department_code, function_type, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [coo.company_id, office.name, coo.id, 200 + officeCount, `${office.area}外派机构`, DEMO_TENANT, office.code, "dispatched", 5]
    );
    const officeId = deptResult.lastInsertRowid;

    const staff = buildOfficeStaff(office.name, office.area, office.code);
    for (const emp of staff) {
      dbRun(
        "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, tenant_id, employment_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'internal')",
        [DEMO_COMPANY, officeId, emp.name, emp.role, emp.agent, emp.type, emp.skills, emp.emoji, DEMO_TENANT]
      );
      employeeCount++;
    }

    officeCount++;
    console.log(`  ✅ ${office.name} (id=${officeId}) — ${staff.length}人`);
  }

  saveDb();
  console.log(`[增强种子] 外派机构: ${officeCount} 个新增, ${employeeCount} 名新员工\n`);
  return { offices: officeCount, employees: employeeCount };
}

// ============================================================
// Part 2: 丰富合同数据
// ============================================================

// 演示用合同的创建者ID（张总，demo@demo.com 用户ID）— 延迟获取
function getDemoCreatedByUserId(): number | null {
  const u = dbGet("SELECT id FROM users WHERE email = ? AND tenant_id = ?", ["demo@demo.com", DEMO_TENANT]) as any;
  return u?.id || null;
}

interface RichContractDef {
  contract_no: string;
  title: string;
  party_a: string;
  party_b: string;
  direction: "outbound" | "inbound";
  our_side: "party_a" | "party_b";
  contract_type: string;
  amount: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  sign_date: string | null;
  key_terms: string | null;
  department_name: string | null; // 关联部门（按名称查找）
  payments: { label: string; amount: number; due_date: string; paid?: number; paid_date?: string }[];
  progress_nodes: { stage_name: string; planned_date: string; acceptance_criteria: string; completion_ratio: number; sort_order: number }[];
  clauses: { clause_type: string; clause_title: string; clause_content: string; is_critical: number; sort_order: number }[];
}

// 定义 5 份丰富的演示合同
const RICH_CONTRACTS: RichContractDef[] = [
  {
    contract_no: "FW-2026-201",
    title: "华南区域智慧交通系统集成项目合同",
    party_a: "雄元科技有限公司",
    party_b: "广东省交通集团有限公司",
    direction: "outbound", our_side: "party_a",
    contract_type: "service",
    amount: 8500000,
    status: "active",
    start_date: "2026-03-01", end_date: "2027-09-30",
    sign_date: "2026-02-28",
    key_terms: "工期18个月，按里程碑分6期付款；质保期2年；逾期违约金日万分之三",
    department_name: "华南区域项目部",
    payments: [
      { label: "一期·启动经费（合同签署后15日）", amount: 1275000, due_date: "2026-03-15", paid: 1, paid_date: "2026-03-18" },
      { label: "二期·需求分析与方案设计完成", amount: 1700000, due_date: "2026-05-31", paid: 1, paid_date: "2026-06-03" },
      { label: "三期·硬件设备到货验收", amount: 2125000, due_date: "2026-06-28" },   // 1天后到期 → Level 4 紧急到期
      { label: "四期·系统集成联调通过", amount: 1700000, due_date: "2026-09-30" },
      { label: "五期·试运行三个月验收", amount: 1275000, due_date: "2027-03-31" },
      { label: "六期·质保金（验收后2年）", amount: 425000, due_date: "2029-03-31" },
    ],
    progress_nodes: [
      { stage_name: "合同签署", planned_date: "2026-02-28", acceptance_criteria: "双方法定代表人签字盖章", completion_ratio: 100, sort_order: 1 },
      { stage_name: "需求分析与方案设计", planned_date: "2026-04-15", acceptance_criteria: "方案通过甲方专家评审", completion_ratio: 100, sort_order: 2 },
      { stage_name: "硬件设备采购与到货验收", planned_date: "2026-06-15", acceptance_criteria: "设备清单逐一核对，运行24h无故障", completion_ratio: 80, sort_order: 3 },
      { stage_name: "系统集成与联合调试", planned_date: "2026-09-15", acceptance_criteria: "全部子系统联调通过，性能指标达标", completion_ratio: 0, sort_order: 4 },
      { stage_name: "试运行", planned_date: "2026-11-01", acceptance_criteria: "连续运行3个月，故障率<0.1%", completion_ratio: 0, sort_order: 5 },
      { stage_name: "正式验收交付", planned_date: "2027-03-31", acceptance_criteria: "专家验收会通过，出具验收报告", completion_ratio: 0, sort_order: 6 },
    ],
    clauses: [
      { clause_type: "payment", clause_title: "第六条 付款方式", clause_content: "本合同总金额¥8,500,000元（含税），按项目里程碑分六期支付。每期付款前，乙方应提供等额增值税专用发票。甲方收到发票后15个工作日内支付。", is_critical: 1, sort_order: 1 },
      { clause_type: "delivery", clause_title: "第七条 交付标准", clause_content: "乙方交付的系统应符合附件《技术规格书》的全部要求，系统可用性≥99.9%，数据准确率≥99.5%，单次故障修复时间≤2小时。", is_critical: 1, sort_order: 2 },
      { clause_type: "liability", clause_title: "第十二条 违约责任", clause_content: "逾期交付，每逾期一日，按合同总金额的万分之三支付违约金。质量不合格经三次整改仍不达标的，甲方有权解除合同并要求赔偿直接损失。", is_critical: 1, sort_order: 3 },
      { clause_type: "warranty", clause_title: "第十三条 质保条款", clause_content: "系统质保期为正式验收之日起24个月。质保期内免费维修与技术支持，响应时间不超过4小时。", is_critical: 0, sort_order: 4 },
      { clause_type: "confidentiality", clause_title: "第十五条 保密条款", clause_content: "双方应对在合作过程中获知的对方商业秘密、技术资料、经营信息严格保密。保密义务不因合同终止而解除，持续有效期为合同终止后5年。", is_critical: 0, sort_order: 5 },
    ],
  },
  {
    contract_no: "FW-2026-202",
    title: "新能源光伏电站EPC总承包合同",
    party_a: "阳光新能源开发有限公司",
    party_b: "雄元科技有限公司",
    direction: "outbound", our_side: "party_b",
    contract_type: "service",
    amount: 12000000,
    status: "active",
    start_date: "2026-04-01", end_date: "2027-04-30",
    sign_date: "2026-03-28",
    key_terms: "EPC总承包，含设计、采购、施工；装机容量50MW；并网发电为竣工验收条件",
    department_name: "新能源项目部",
    payments: [
      { label: "预付款（合同金额15%）", amount: 1800000, due_date: "2026-04-15", paid: 1, paid_date: "2026-04-20" },
      { label: "设备材料到场验收款", amount: 3600000, due_date: "2026-06-15", paid: 1, paid_date: "2026-06-18" },
      { label: "主体工程完工款", amount: 3000000, due_date: "2026-07-01" },        // 4天后到期 → Level 3 近期警报
      { label: "并网发电验收款", amount: 2400000, due_date: "2027-02-28" },
      { label: "质保金（验收后1年）", amount: 1200000, due_date: "2028-02-28" },
    ],
    progress_nodes: [
      { stage_name: "合同签订与备案", planned_date: "2026-04-05", acceptance_criteria: "EPC合同备案完成，取得施工许可证", completion_ratio: 100, sort_order: 1 },
      { stage_name: "初步设计与评审", planned_date: "2026-04-30", acceptance_criteria: "设计方案通过电力设计院评审", completion_ratio: 100, sort_order: 2 },
      { stage_name: "设备采购与到场验收", planned_date: "2026-06-15", acceptance_criteria: "主要设备（组件、逆变器、箱变）到场并验收合格", completion_ratio: 100, sort_order: 3 },
      { stage_name: "土建与安装施工", planned_date: "2026-06-30", acceptance_criteria: "支架基础、电缆沟、升压站土建完成", completion_ratio: 75, sort_order: 4 },
      { stage_name: "电气安装与调试", planned_date: "2026-08-15", acceptance_criteria: "电气设备安装就位，单机调试通过", completion_ratio: 0, sort_order: 5 },
      { stage_name: "并网试运行", planned_date: "2026-10-01", acceptance_criteria: "连续240小时并网运行无故障", completion_ratio: 0, sort_order: 6 },
      { stage_name: "竣工验收", planned_date: "2027-02-28", acceptance_criteria: "通过行业主管部门验收，取得竣工备案", completion_ratio: 0, sort_order: 7 },
    ],
    clauses: [
      { clause_type: "payment", clause_title: "第四条 合同价款与支付", clause_content: "合同总价¥12,000,000元（含税），按5期支付。预付款15%，设备到货30%，主体完工25%，并网发电20%，质保金10%。", is_critical: 1, sort_order: 1 },
      { clause_type: "delivery", clause_title: "第九条 并网验收标准", clause_content: "项目须通过电网公司并网验收，功率因数≥0.98，谐波含量符合GB/T 14549标准，连续240h试运行期间等效利用小时数≥设计值95%。", is_critical: 1, sort_order: 2 },
      { clause_type: "liability", clause_title: "第十四条 违约责任", clause_content: "工期延误每超出1日，按合同总价万分之二支付违约金，累加不超过合同总价5%。质量缺陷在质保期内免费修复，同一问题出现3次以上，甲方有权委托第三方修复，费用由乙方承担。", is_critical: 1, sort_order: 3 },
      { clause_type: "ip", clause_title: "第十八条 知识产权", clause_content: "本项目产生的设计图纸、技术方案的知识产权归甲方所有。乙方享有署名权。未经甲方书面许可，乙方不得将本项目技术成果用于其他项目。", is_critical: 0, sort_order: 4 },
    ],
  },
  {
    contract_no: "CG-2026-301",
    title: "云计算与大数据平台年度服务采购合同",
    party_a: "华为云计算技术有限公司",
    party_b: "雄元科技有限公司",
    direction: "inbound", our_side: "party_b",
    contract_type: "procurement",
    amount: 680000,
    status: "active",
    start_date: "2026-01-01", end_date: "2026-12-31",
    sign_date: "2025-12-20",
    key_terms: "按季度付费；含10TB存储+32核GPU算力；SLA可用性99.95%",
    department_name: "技术保障中心",
    payments: [
      { label: "Q1云服务费", amount: 170000, due_date: "2026-01-15", paid: 1, paid_date: "2026-01-20" },
      { label: "Q2云服务费", amount: 170000, due_date: "2026-06-30", paid: 1, paid_date: "2026-07-03" },
      { label: "Q3云服务费", amount: 170000, due_date: "2026-07-02" },                // 5天后到期 → Level 2 中期预警
      { label: "Q4云服务费", amount: 170000, due_date: "2026-10-01" },
    ],
    progress_nodes: [
      { stage_name: "服务开通与账号配置", planned_date: "2026-01-10", acceptance_criteria: "服务账号开通，资源配额分配完成", completion_ratio: 100, sort_order: 1 },
      { stage_name: "Q1服务确认", planned_date: "2026-03-31", acceptance_criteria: "资源使用正常，SLA达标", completion_ratio: 100, sort_order: 2 },
      { stage_name: "Q2服务确认", planned_date: "2026-06-30", acceptance_criteria: "资源使用正常，SLA达标", completion_ratio: 100, sort_order: 3 },
    ],
    clauses: [
      { clause_type: "payment", clause_title: "第三条 计费与支付", clause_content: "年费¥680,000元，按季度平均支付，每季度¥170,000元。每季度结束后5个工作日内乙方向甲方提供对账单，甲方确认后10个工作日内开票付款。", is_critical: 1, sort_order: 1 },
      { clause_type: "sla", clause_title: "第六条 服务水平协议", clause_content: "月度可用性≥99.95%，数据持久性≥99.9999999%。若未达标，按故障时长3倍补偿服务时长。重大故障（超过4小时）按月度费用的30%赔付。", is_critical: 1, sort_order: 2 },
    ],
  },
  {
    contract_no: "FW-2026-203",
    title: "数字政府「一网通办」平台建设项目",
    party_a: "雄元科技有限公司",
    party_b: "某市人民政府政务服务中心",
    direction: "outbound", our_side: "party_a",
    contract_type: "service",
    amount: 5600000,
    status: "active",
    start_date: "2026-05-01", end_date: "2027-07-31",
    sign_date: "2026-04-25",
    key_terms: "分三期上线：政务服务门户+审批平台+数据中台；政务云部署；等保三级",
    department_name: "数字政府项目部",
    payments: [
      { label: "一期·项目启动与平台搭建", amount: 1680000, due_date: "2026-05-31", paid: 1, paid_date: "2026-06-02" },
      { label: "二期·政务门户首批功能上线", amount: 2240000, due_date: "2026-06-25" },  // 已逾期2天 → Level 4 紧急逾期
      { label: "三期·审批平台+数据中台上线", amount: 1120000, due_date: "2027-03-31" },
      { label: "质保运维款", amount: 560000, due_date: "2027-07-31" },
    ],
    progress_nodes: [
      { stage_name: "项目启动与团队组建", planned_date: "2026-05-15", acceptance_criteria: "项目团队到位，现场办公场所搭建完成", completion_ratio: 100, sort_order: 1 },
      { stage_name: "政务服务门户首页开发", planned_date: "2026-06-20", acceptance_criteria: "首页、办事指南、在线预约功能上线", completion_ratio: 90, sort_order: 2 },
      { stage_name: "智能审批平台开发", planned_date: "2026-08-15", acceptance_criteria: "表单引擎、规则引擎、流程引擎集成完成", completion_ratio: 0, sort_order: 3 },
      { stage_name: "政务数据中台建设", planned_date: "2026-10-31", acceptance_criteria: "数据汇聚、治理、服务API全部上线", completion_ratio: 0, sort_order: 4 },
      { stage_name: "等保三级测评", planned_date: "2027-02-28", acceptance_criteria: "通过第三方等保测评机构测评，取得等保三级备案证书", completion_ratio: 0, sort_order: 5 },
      { stage_name: "正式上线与培训", planned_date: "2027-07-15", acceptance_criteria: "系统割接上线，完成3轮用户培训", completion_ratio: 0, sort_order: 6 },
    ],
    clauses: [
      { clause_type: "delivery", clause_title: "第七条 交付物与验收标准", clause_content: "交付物包括：可运行系统源代码、部署文档、运维手册、用户培训材料、等保三级测评报告。验收标准：系统在政务云生产环境稳定运行≥30天，功能符合需求规格说明书100%。", is_critical: 1, sort_order: 1 },
      { clause_type: "security", clause_title: "第十条 安全与隐私保护", clause_content: "系统须符合《网络安全法》《数据安全法》《个人信息保护法》要求，通过等保三级测评。政务数据禁止出境，日志留存不少于6个月。", is_critical: 1, sort_order: 2 },
      { clause_type: "payment", clause_title: "第五条 项目款支付", clause_content: "总额¥5,600,000元，分4期支付。每期扣留5%作为质保款，质保期满后30日内无息退还。", is_critical: 1, sort_order: 3 },
      { clause_type: "liability", clause_title: "第十六条 违约责任", clause_content: "系统安全漏洞未在48h内修复的，每次扣除合同总价1%作为违约金。发生数据泄露事件的，乙方承担全部法律责任及赔偿。", is_critical: 1, sort_order: 4 },
    ],
  },
  {
    contract_no: "CG-2026-302",
    title: "轨道交通安全检测设备采购与安装合同",
    party_a: "中国中车股份有限公司",
    party_b: "雄元科技有限公司",
    direction: "inbound", our_side: "party_b",
    contract_type: "procurement",
    amount: 3200000,
    status: "active",
    start_date: "2026-06-01", end_date: "2027-05-31",
    sign_date: "2026-05-28",
    key_terms: "含20套轨道探伤机器人+中控系统；分批次交付；每批验收合格后付款",
    department_name: "轨道交通项目部",
    payments: [
      { label: "首批10套设备到货款", amount: 1280000, due_date: "2026-06-20", paid: 1, paid_date: "2026-06-22" },
      { label: "首批安装调试完成", amount: 640000, due_date: "2026-07-05" },            // 8天后到期 → Level 2 中期预警
      { label: "第二批10套到货款", amount: 1280000, due_date: "2027-02-28" },
    ],
    progress_nodes: [
      { stage_name: "设备选型与技术交流", planned_date: "2026-06-10", acceptance_criteria: "技术参数确认完毕，双方签署技术协议", completion_ratio: 100, sort_order: 1 },
      { stage_name: "首批10套设备生产监造", planned_date: "2026-06-15", acceptance_criteria: "设备通过出厂验收测试（FAT）", completion_ratio: 100, sort_order: 2 },
      { stage_name: "首批设备现场安装调试", planned_date: "2026-07-05", acceptance_criteria: "设备安装到位、通信链路正常、与中控系统数据联通", completion_ratio: 40, sort_order: 3 },
      { stage_name: "首批验收测试", planned_date: "2026-07-20", acceptance_criteria: "连续7天无故障运行，探伤准确率≥99%", completion_ratio: 0, sort_order: 4 },
      { stage_name: "第二批设备交付与全量验收", planned_date: "2027-05-31", acceptance_criteria: "全部20套设备联网运行，出具最终验收报告", completion_ratio: 0, sort_order: 5 },
    ],
    clauses: [
      { clause_type: "delivery", clause_title: "第四条 设备交付与技术标准", clause_content: "探伤机器人须符合TB/T 3353-2025《轨道探伤机器人技术规范》，探伤精度误差≤0.1mm，续航≥8h，防水等级IP67。", is_critical: 1, sort_order: 1 },
      { clause_type: "warranty", clause_title: "第八条 质保与售后", clause_content: "设备质保期2年，中控系统软件质保期3年。质保期内免费提供备品备件和软件升级。7×24小时技术支持，紧急故障4小时到现场。", is_critical: 0, sort_order: 2 },
      { clause_type: "ip", clause_title: "第十二条 技术知识产权", clause_content: "本合同标的设备所含软件系统的知识产权归乙方所有。甲方获得永久使用许可。乙方为甲方开发定制功能的，定制部分知识产权归甲方所有。", is_critical: 0, sort_order: 3 },
    ],
  },
];

async function seedRichContracts() {
  console.log("[增强种子] 开始注入丰富合同数据...");

  const existingContractCount = (dbGet(
    "SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?",
    [DEMO_TENANT]
  ) as any)?.c || 0;

  console.log(`  现有合同: ${existingContractCount} 份`);

  let newContracts = 0;
  let newPayments = 0;
  let newProgress = 0;
  let newClauses = 0;

  for (const def of RICH_CONTRACTS) {
    // 幂等检查
    const existing = dbGet(
      "SELECT id FROM contracts WHERE contract_no = ? AND tenant_id = ?",
      [def.contract_no, DEMO_TENANT]
    ) as any;

    if (existing) {
      console.log(`  ⏭ 合同已存在: ${def.contract_no} - ${def.title}`);
      continue;
    }

    // 查找关联部门
    let deptId: number | null = null;
    if (def.department_name) {
      const dept = dbGet(
        "SELECT id FROM departments WHERE name = ? AND tenant_id = ?",
        [def.department_name, DEMO_TENANT]
      ) as any;
      deptId = dept?.id || null;
    }

    // 创建合同
    const createdBy = getDemoCreatedByUserId();
    const contractResult = dbRun(
      `INSERT INTO contracts
       (tenant_id, title, contract_no, party_a, party_b, direction, our_side, contract_type,
        amount, status, start_date, end_date, sign_date, key_terms, created_by, department_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [DEMO_TENANT, def.title, def.contract_no, def.party_a, def.party_b,
       def.direction, def.our_side, def.contract_type,
       def.amount, def.status, def.start_date, def.end_date, def.sign_date,
       def.key_terms, createdBy, deptId]
    );
    const contractId = contractResult.lastInsertRowid;
    newContracts++;

    // 创建付款计划
    let paidTotal = 0;
    let paymentIndex = 0;
    for (const p of def.payments) {
      paymentIndex++;
      const paid = p.paid || 0;
      dbRun(
        `INSERT INTO contract_payments
         (tenant_id, contract_id, payment_no, label, amount, paid, paid_date, due_date, completion_condition)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [DEMO_TENANT, contractId, paymentIndex, p.label, p.amount,
         paid, p.paid_date || null, p.due_date,
         paid === 1 ? "已完成结算" : null]
      );
      if (paid === 1) paidTotal += p.amount;
      newPayments++;
    }

    // 更新合同已收/已付金额
    if (paidTotal > 0) {
      dbRun(
        "UPDATE contracts SET collected_paid = ? WHERE id = ?",
        [paidTotal, contractId]
      );
    }

    // 创建进度节点
    let progressIdx = 0;
    for (const pg of def.progress_nodes) {
      progressIdx++;
      dbRun(
        `INSERT INTO contract_progress
         (contract_id, tenant_id, stage_name, planned_date, acceptance_criteria, completion_ratio, sort_order, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [contractId, DEMO_TENANT, pg.stage_name, pg.planned_date,
         pg.acceptance_criteria, pg.completion_ratio, pg.sort_order,
         pg.completion_ratio >= 100 ? "approved" : "pending"]
      );
      newProgress++;
    }

    // 创建条款
    let clauseIdx = 0;
    for (const cl of def.clauses) {
      clauseIdx++;
      dbRun(
        `INSERT INTO contract_clauses
         (contract_id, tenant_id, clause_type, clause_title, clause_content, sort_order, is_critical, ai_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [contractId, DEMO_TENANT, cl.clause_type, cl.clause_title, cl.clause_content,
         cl.sort_order, cl.is_critical, 0.95]
      );
      newClauses++;
    }

    console.log(`  ✅ ${def.contract_no} - ${def.title} (${def.payments.length}期付款, ${def.progress_nodes.length}进度, ${def.clauses.length}条款)`);
  }

  saveDb();
  console.log(`[增强种子] 合同: ${newContracts} 份新增, ${newPayments} 期付款, ${newProgress} 进度节点, ${newClauses} 条款\n`);
}

// ============================================================
// Part 3: 多级预警配置
// ============================================================

async function seedAlertConfig() {
  console.log("[增强种子] 配置多级预警...");

  const existing = dbGet(
    "SELECT * FROM contract_alert_config WHERE tenant_id = ?",
    [DEMO_TENANT]
  ) as any;

  if (existing) {
    // 更新为多级预警
    dbRun(
      `UPDATE contract_alert_config
       SET level1_days = 30, level2_days = 15, level3_days = 7, level4_days = 3,
           enable_multi_level = 1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ?`,
      [DEMO_TENANT]
    );
    console.log(`  ✅ 多级预警已启用 (30/15/7/3天)`);
  } else {
    dbRun(
      `INSERT INTO contract_alert_config
       (tenant_id, default_alert_days, level1_days, level2_days, level3_days, level4_days, enable_multi_level)
       VALUES (?, 7, 30, 15, 7, 3, 1)`,
      [DEMO_TENANT]
    );
    console.log(`  ✅ 预警配置已创建并启用多级预警`);
  }

  saveDb();
}

// ============================================================
// Part 4: 为已有合同补充进度节点和条款（如果还没有）
// ============================================================

async function seedExistingContractsProgressAndClauses() {
  console.log("[增强种子] 为已有合同补充进度和条款...");

  // 合同 FW-2026-101（企业数字化转型咨询服务合同）
  const contract101 = dbGet(
    "SELECT id FROM contracts WHERE contract_no = ? AND tenant_id = ?",
    ["FW-2026-101", DEMO_TENANT]
  ) as any;

  if (contract101) {
    const existingProgress = dbGet(
      "SELECT COUNT(*) as c FROM contract_progress WHERE contract_id = ?",
      [contract101.id]
    ) as any;

    if (existingProgress.c === 0) {
      // 进度节点
      const progress101 = [
        { stage_name: "需求调研与现状诊断", planned_date: "2026-02-15", acceptance_criteria: "完成甲方各部门访谈，出具诊断报告", completion_ratio: 100, sort_order: 1 },
        { stage_name: "数字化蓝图规划", planned_date: "2026-04-30", acceptance_criteria: "输出3年数字化路线图，获得董事会批准", completion_ratio: 100, sort_order: 2 },
        { stage_name: "方案实施与系统集成", planned_date: "2026-07-31", acceptance_criteria: "ERP/CRM/OA三大系统上线运行", completion_ratio: 70, sort_order: 3 },
        { stage_name: "培训与知识转移", planned_date: "2026-08-15", acceptance_criteria: "完成4轮培训，关键用户考核通过率≥90%", completion_ratio: 30, sort_order: 4 },
        { stage_name: "项目验收", planned_date: "2026-08-31", acceptance_criteria: "乙方验收组出具验收报告", completion_ratio: 0, sort_order: 5 },
      ];
      for (const p of progress101) {
        dbRun(
          `INSERT INTO contract_progress (contract_id, tenant_id, stage_name, planned_date, acceptance_criteria, completion_ratio, sort_order, review_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [contract101.id, DEMO_TENANT, p.stage_name, p.planned_date, p.acceptance_criteria, p.completion_ratio, p.sort_order,
           p.completion_ratio >= 100 ? "approved" : "pending"]
        );
      }
      console.log(`  ✅ FW-2026-101 补充 ${progress101.length} 进度节点`);
    }

    const existingClauses = dbGet(
      "SELECT COUNT(*) as c FROM contract_clauses WHERE contract_id = ?",
      [contract101.id]
    ) as any;

    if (existingClauses.c === 0) {
      const clauses101 = [
        { clause_type: "payment", clause_title: "第四条 服务费与支付方式", clause_content: "咨询服务费¥500,000元，分三期支付：启动费30%（¥150,000）、中期服务费40%（¥200,000）、结项服务费30%（¥150,000）。", is_critical: 1, sort_order: 1 },
        { clause_type: "delivery", clause_title: "第六条 交付物清单", clause_content: "交付物包括：数字化诊断报告、蓝图规划方案、系统实施方案、培训材料、项目验收报告。", is_critical: 0, sort_order: 2 },
        { clause_type: "liability", clause_title: "第十条 违约责任", clause_content: "咨询服务期间发生重大失误导致甲方损失的，乙方赔偿不超过合同总金额。", is_critical: 1, sort_order: 3 },
      ];
      for (const cl of clauses101) {
        dbRun(
          `INSERT INTO contract_clauses (contract_id, tenant_id, clause_type, clause_title, clause_content, sort_order, is_critical, ai_confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [contract101.id, DEMO_TENANT, cl.clause_type, cl.clause_title, cl.clause_content, cl.sort_order, cl.is_critical, 0.92]
        );
      }
      console.log(`  ✅ FW-2026-101 补充 ${clauses101.length} 条款`);
    }
  }

  // 合同 CG-2026-102（云服务器资源年度采购）
  const contract102 = dbGet(
    "SELECT id FROM contracts WHERE contract_no = ? AND tenant_id = ?",
    ["CG-2026-102", DEMO_TENANT]
  ) as any;

  if (contract102) {
    const existingProgress = dbGet(
      "SELECT COUNT(*) as c FROM contract_progress WHERE contract_id = ?",
      [contract102.id]
    ) as any;

    if (existingProgress.c === 0) {
      const progress102 = [
        { stage_name: "服务开通", planned_date: "2026-01-15", acceptance_criteria: "ECS/RDS/OSS服务开通，VPC网络配置完成", completion_ratio: 100, sort_order: 1 },
        { stage_name: "业务系统迁移", planned_date: "2026-03-31", acceptance_criteria: "核心业务系统迁移至云端，压力测试通过", completion_ratio: 100, sort_order: 2 },
        { stage_name: "H1运行评估", planned_date: "2026-06-30", acceptance_criteria: "SLA达标确认，资源利用率评估", completion_ratio: 90, sort_order: 3 },
      ];
      for (const p of progress102) {
        dbRun(
          `INSERT INTO contract_progress (contract_id, tenant_id, stage_name, planned_date, acceptance_criteria, completion_ratio, sort_order, review_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [contract102.id, DEMO_TENANT, p.stage_name, p.planned_date, p.acceptance_criteria, p.completion_ratio, p.sort_order,
           p.completion_ratio >= 100 ? "approved" : "pending"]
        );
      }
      console.log(`  ✅ CG-2026-102 补充 ${progress102.length} 进度节点`);
    }

    const existingClauses = dbGet(
      "SELECT COUNT(*) as c FROM contract_clauses WHERE contract_id = ?",
      [contract102.id]
    ) as any;

    if (existingClauses.c === 0) {
      const clauses102 = [
        { clause_type: "payment", clause_title: "第三条 计费标准与支付", clause_content: "年度采购金额¥120,000元，含ECS 8核32GB×5、RDS MySQL 4核16GB×2、OSS 2TB、CDN 500GB/月。按H1/H2两期支付，每期¥60,000元。", is_critical: 1, sort_order: 1 },
        { clause_type: "sla", clause_title: "第五条 服务等级协议", clause_content: "月度可用性≥99.95%，数据持久性≥99.9999999%。服务中断超过30分钟开始计赔付，按故障时长等比例减免当月费用。", is_critical: 0, sort_order: 2 },
      ];
      for (const cl of clauses102) {
        dbRun(
          `INSERT INTO contract_clauses (contract_id, tenant_id, clause_type, clause_title, clause_content, sort_order, is_critical, ai_confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [contract102.id, DEMO_TENANT, cl.clause_type, cl.clause_title, cl.clause_content, cl.sort_order, cl.is_critical, 0.93]
        );
      }
      console.log(`  ✅ CG-2026-102 补充 ${clauses102.length} 条款`);
    }
  }

  saveDb();
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  演示租户增强种子 — tenant_id=2 (Demo)     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  await initDatabase();

  // Part 1: 外派机构
  const dispatched = await seedDispatchedForDemo();

  // Part 2: 丰富合同
  await seedRichContracts();

  // Part 3: 预警配置
  await seedAlertConfig();

  // Part 4: 已有合同补充
  await seedExistingContractsProgressAndClauses();

  // === 汇总 ===
  console.log("═══════════════════════════════════════════");
  const totalContracts = (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [DEMO_TENANT]) as any)?.c;
  const totalEmployees = (dbGet("SELECT COUNT(*) as c FROM employees WHERE tenant_id = ?", [DEMO_TENANT]) as any)?.c;
  const totalDepartments = (dbGet("SELECT COUNT(*) as c FROM departments WHERE tenant_id = ?", [DEMO_TENANT]) as any)?.c;
  const totalProgress = (dbGet("SELECT COUNT(*) as c FROM contract_progress WHERE tenant_id = ?", [DEMO_TENANT]) as any)?.c;
  const totalClauses = (dbGet("SELECT COUNT(*) as c FROM contract_clauses WHERE tenant_id = ?", [DEMO_TENANT]) as any)?.c;

  console.log(`演示租户数据总览:`);
  console.log(`  👥 员工: ${totalEmployees} 人`);
  console.log(`  🏢 部门: ${totalDepartments} 个`);
  console.log(`  📄 合同: ${totalContracts} 份`);
  console.log(`  📊 进度节点: ${totalProgress} 个`);
  console.log(`  📋 法律条款: ${totalClauses} 条`);
  console.log(`  ⏰ 多级预警: 30/15/7/3 天已启用`);
  console.log(`\n💡 admin: demo@demo.com / demo123`);
  console.log(`💡 user:  user@demo.com / user123`);
  console.log(`\n✅ 演示数据增强完成！刷新页面即可看到新数据。\n`);
}

main().catch((err) => {
  console.error("❌ 种子脚本失败:", err);
  process.exit(1);
});
