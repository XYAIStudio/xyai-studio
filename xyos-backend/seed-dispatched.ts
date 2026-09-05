/**
 * 外派机构种子数据 — 集团化矩阵管理模式
 *
 * 在 COO 办公室下新增 20 个外派机构（可按区域/项目无限扩展）
 * 每个机构：正职 1 人 + 副职 1-2 人 + 专业工程师 3-5 人 + 专员 1-2 人
 *
 * 运行: npx tsx seed-dispatched.ts
 */

import { dbGet, dbRun, dbAll, initDatabase, saveDb } from "./db";

// ===== 20 个外派机构定义 =====
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

// 每个机构的人员配置模板
function buildOfficeStaff(officeName: string, officeArea: string, officeCode: string) {
  // 提取简称：华南区域项目部 → 华南, 智慧城市项目部 → 智慧城市, 长三角办事处 → 长三角
  const short = officeName.replace("区域项目部", "").replace("办事处", "").replace("项目部", "").replace("事业部", "");

  // 员工姓名前缀：用简称+区域（避免重复，如华北区域项目部 → 华北，不是华北华北）
  const prefix = short;

  // 专业领域工程师（按机构类型分配不同专业）
  const engineerSpecialties: Record<string, string[]> = {
    "智慧城市": ["系统集成", "物联网", "数据平台", "网络安全"],
    "新能源": ["电气工程", "能源管理", "储能技术", "光伏设计"],
    "轨道交通": ["轨道工程", "信号系统", "车辆工程", "供电系统"],
    "数字政府": ["政务信息化", "数据治理", "网络安全", "平台架构"],
    "海外": ["国际商务", "外语翻译", "跨文化管理", "法务合规"],
  };

  const key = short in engineerSpecialties ? short : null;
  const specialties = key ? engineerSpecialties[key] : ["土木工程", "结构设计", "造价管理", "质量检测", "安全管理"];

  return [
    // 正职负责人（指挥长/总监）
    {
      name: `${prefix}指挥长`,
      role: "外派机构负责人",
      type: "ai" as const,
      emoji: "👔",
      skills: "团队管理,项目统筹,客户关系,进度管控",
      agent: "strategy_executive",
      sort: 1,
    },
    // 副职 1
    {
      name: `${prefix}副指挥长`,
      role: "副总监",
      type: "ai" as const,
      emoji: "📋",
      skills: "技术管理,质量把控,资源配置,人员调度",
      agent: "product_manager",
      sort: 2,
    },
    // 副职 2
    {
      name: `${prefix}执行总监`,
      role: "副总监",
      type: "ai" as const,
      emoji: "⚙️",
      skills: "现场管理,进度跟踪,成本控制,沟通协调",
      agent: "ceo",
      sort: 3,
    },
    // 专业工程师（按专业领域，4名）
    {
      name: `${prefix}${specialties[0]}工程师`,
      role: "专业工程师",
      type: "ai" as const,
      emoji: "🏗️",
      skills: `${specialties[0]},方案设计,技术评审,现场指导`,
      agent: "tech_architect",
      sort: 10,
    },
    {
      name: `${prefix}${specialties[1]}工程师`,
      role: "专业工程师",
      type: "ai" as const,
      emoji: "🔧",
      skills: `${specialties[1]},质量监控,标准执行,报告编制`,
      agent: "backend_dev",
      sort: 11,
    },
    {
      name: `${prefix}${specialties[2]}工程师`,
      role: "专业工程师",
      type: "ai" as const,
      emoji: "📐",
      skills: `${specialties[2]},成本测算,报价审核,预算管理`,
      agent: "bi_analyst",
      sort: 12,
    },
    {
      name: `${prefix}${specialties[3]}工程师`,
      role: "专业工程师",
      type: "ai" as const,
      emoji: "🔍",
      skills: `${specialties[3]},检测验收,标准编制,驻场服务`,
      agent: "qa_engineer",
      sort: 13,
    },
    // 专员
    {
      name: `${prefix}综合专员`,
      role: "综合专员",
      type: "ai" as const,
      emoji: "📎",
      skills: "行政事务,文档管理,后勤保障,会议协调",
      agent: "customer_success",
      sort: 20,
    },
    {
      name: `${prefix}商务专员`,
      role: "商务专员",
      type: "ai" as const,
      emoji: "💼",
      skills: "合同跟进,商务对接,数据统计,汇报材料",
      agent: "sales_manager",
      sort: 21,
    },
  ];
}

async function seedDispatchedOffices() {
  await initDatabase();
  console.log("[外派机构种子] 开始...\n");

  // 找到所有 COO 办公室（跨公司/租户）
  const cooList = dbAll(
    "SELECT d.id, d.name, d.tenant_id, d.company_id FROM departments d WHERE d.name = ? AND d.parent_id IS NOT NULL",
    ["COO办公室"]
  ) as any[];
  if (!cooList.length) {
    console.error("❌ 未找到COO办公室，请先运行 seed.js");
    return;
  }

  let totalOfficeCount = 0;
  let totalEmployeeCount = 0;

  for (const coo of cooList) {
    console.log(`\n📂 COO办公室: id=${coo.id}, company=${coo.company_id}, tenant=${coo.tenant_id}`);

    // 检查该 COO 下已有的外派机构（幂等）
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

      // 创建外派机构部门
      const deptResult = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, department_code, function_type, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [coo.company_id, office.name, coo.id, 200 + officeCount, `${office.area}外派机构`, coo.tenant_id, office.code, "dispatched", 5]
      );
      const officeId = deptResult.lastInsertRowid;

      // 创建员工
      const staff = buildOfficeStaff(office.name, office.area, office.code);
      for (const emp of staff) {
        dbRun(
          "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, status, tenant_id, employment_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'internal')",
          [coo.company_id, officeId, emp.name, emp.role, emp.agent, emp.type, emp.skills, emp.emoji, coo.tenant_id]
        );
        employeeCount++;
      }

      officeCount++;
      console.log(`  ✅ ${office.name} (id=${officeId}) — ${staff.length}人`);
    }

    if (officeCount > 0) {
      console.log(`  🎯 本COO新增: ${officeCount} 个外派机构，${employeeCount} 名员工`);
    }
    totalOfficeCount += officeCount;
    totalEmployeeCount += employeeCount;
  }

  // 删除 tenant=1 下错误创建的数据（如果之前跑过旧版脚本造成污染）
  const badCoo = dbGet("SELECT id FROM departments WHERE name = ? AND parent_id IS NOT NULL AND tenant_id = 1", ["COO办公室"]) as any;
  if (badCoo) {
    const badDepts = dbAll("SELECT id, name FROM departments WHERE parent_id = ? AND function_type = ?", [badCoo.id, "dispatched"]) as any[];
    for (const d of badDepts) {
      dbRun("DELETE FROM employees WHERE department_id = ?", [d.id]);
      dbRun("DELETE FROM departments WHERE id = ?", [d.id]);
      console.log(`  🗑 清理旧版本数据: ${d.name} (tenant=1)`);
    }
  }

  // 持久化到磁盘
  saveDb();
  console.log(`\n🎯 全部完成: 新增 ${totalOfficeCount} 个外派机构，${totalEmployeeCount} 名员工（已保存）\n`);
}

seedDispatchedOffices().catch(console.error);
