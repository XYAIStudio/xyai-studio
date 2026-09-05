import bcrypt from "bcryptjs";
import { dbAll, dbGet, dbRun, getDb, saveDb } from "./db";

// 辅助：日期加月份 → ISO日期字符串
function addMonths(dateStr: string | null | undefined, months: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}

export function seedDatabase() {
  const userCount = dbGet("SELECT COUNT(*) as c FROM users") as any;

  if (userCount.c === 0) {
    console.log("[种子] 初始化演示数据...");

    const adminHash = bcrypt.hashSync("q1w2e3r4t5", 10);
    dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      ["mbazone@qq.com", adminHash, "超级管理员", "super_admin", 1]);

    const demoHash = bcrypt.hashSync("demo123", 10);
    dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      ["demo@demo.com", demoHash, "张总", "admin", 2]);

    const userHash = bcrypt.hashSync("user123", 10);
    dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      ["user@demo.com", userHash, "李员工", "user", 2]);

    // 演示租户（tenant_id=2）——供 demo@demo.com / user@demo.com 登录。
    // 迁移只建了默认租户（id=1 雄元科技）；若不补齐，demo 用户会在
    // auth-provider 的 INNER JOIN tenants 校验中失败（“邮箱或密码错误”）。
    const demoTenant = dbGet("SELECT id FROM tenants WHERE id = 2") as any;
    if (!demoTenant) {
      dbRun(`INSERT INTO tenants (id, name, slug, tenant_code, status, plan, max_users, max_ai_employees, max_tokens_monthly)
             VALUES (2, '演示公司', 'demo', 'DEMO', 'active', 'basic', 20, 50, 5000000)`);
      dbRun("INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role) VALUES (2, (SELECT id FROM users WHERE email = 'demo@demo.com'), 'owner')");
      dbRun("INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role) VALUES (2, (SELECT id FROM users WHERE email = 'user@demo.com'), 'member')");
    }

    dbRun("INSERT INTO companies (name, tenant_id) VALUES (?, ?)", ["雄元科技", 1]);

    // ===== 部门层级结构（17个部门，4级管理） =====
    // L1: 董事长办公室
    // L2: CEO办公室
    // L3: CTO办公室 / COO办公室 / CAO办公室
    // L4: 12个中心

    const deptDefs: { name: string; parentIdx: number | null; desc: string }[] = [
      // L1
      { name: "董事长办公室", parentIdx: null, desc: "战略决策·资本运作" },                        // 0
      // L2
      { name: "CEO办公室", parentIdx: 0, desc: "经营决策·全局统筹" },                              // 1
      // L3
      { name: "CTO办公室", parentIdx: 1, desc: "技术战略·产品路线·研发资源·交付质量" },              // 2
      { name: "COO办公室", parentIdx: 1, desc: "市场拓展·商务谈判·运营效率·客户成功" },              // 3
      { name: "CAO办公室", parentIdx: 1, desc: "人才战略·财务管控·行政保障·合规风控" },              // 4
      // L4 - CTO线
      { name: "产品研发中心", parentIdx: 2, desc: "AI智能体产品技术引擎，核心平台研发" },             // 5
      { name: "技术保障中心", parentIdx: 2, desc: "技术底座守护者，系统稳定与安全" },                // 6
      { name: "数据中心", parentIdx: 2, desc: "数据资产管理，赋能业务数据驱动" },                    // 7
      { name: "交付管理中心", parentIdx: 2, desc: "项目交付铁三角核心，客户项目高质量落地" },          // 8
      // L4 - COO线
      { name: "商务中心", parentIdx: 3, desc: "营收引擎，市场开拓与商务转化" },                     // 9
      { name: "运营中心", parentIdx: 3, desc: "效率中枢，驱动公司内部运营效能" },                    // 10
      { name: "客户成功中心", parentIdx: 3, desc: "客户关系守护者，驱动复购与口碑" },                // 11
      { name: "顾问中心", parentIdx: 3, desc: "行业智库，AI落地咨询与方案设计" },                   // 12
      // L4 - CAO线
      { name: "行政中心", parentIdx: 4, desc: "后勤保障中枢" },                                   // 13
      { name: "人力资源中心", parentIdx: 4, desc: "人才引擎，驱动组织能力建设" },                   // 14
      { name: "财务中心", parentIdx: 4, desc: "资金管家，确保财务健康与合规" },                     // 15
      { name: "质量管理与战略中心", parentIdx: 4, desc: "质量守门员与战略参谋" },                   // 16
    ];

    const deptIds: number[] = [];
    for (let i = 0; i < deptDefs.length; i++) {
      const d = deptDefs[i];
      const r = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
        [1, d.name, d.parentIdx !== null ? deptIds[d.parentIdx] : null, i, d.desc, 1]
      );
      deptIds.push(r.lastInsertRowid);
    }

    // ===== 员工数据（按文档：71人，12中心，人类+AI混合） =====
    // 管理层（人类） + 各中心负责人（人类/AI） + 中心成员（AI）

    // --- L1-L3 管理层（全部人类） ---
    const executives = [
      { name: "张总", role: "董事长", dept: 0, type: "human" as const, emoji: "👔", skills: "战略决策,资本运作,行业布局", agent: null },
      { name: "陈远", role: "CEO", dept: 1, type: "human" as const, emoji: "👔", skills: "经营决策,全局统筹,资源调度", agent: null },
      { name: "CEO助理", role: "总裁办秘书", dept: 1, type: "human" as const, emoji: "📋", skills: "会议纪要,决议督办,跨部门协调", agent: null },
      { name: "林技", role: "CTO", dept: 2, type: "human" as const, emoji: "💻", skills: "技术战略,产品路线,研发管理", agent: null },
      { name: "刘运", role: "COO", dept: 3, type: "human" as const, emoji: "📊", skills: "市场拓展,商务谈判,运营效率", agent: null },
      { name: "孙行", role: "CAO", dept: 4, type: "human" as const, emoji: "🏢", skills: "人才战略,财务管控,行政保障", agent: null },
    ];

    // --- L4 总监（12位，部分人类、部分AI） ---
    const directors = [
      { name: "赵产", role: "产品研发中心总监", dept: 5, type: "human" as const, emoji: "🎯", skills: "产品架构,Sprint管理,代码质量", agent: null },
      { name: "钱技", role: "技术保障中心总监", dept: 6, type: "human" as const, emoji: "🛡️", skills: "基础设施,信息安全,DevOps", agent: null },
      { name: "孙数", role: "数据中心总监", dept: 7, type: "human" as const, emoji: "📈", skills: "数据平台,数据治理,BI分析", agent: null },
      { name: "李交", role: "交付管理中心总监", dept: 8, type: "human" as const, emoji: "🚀", skills: "项目管理,交付标准,风险控制", agent: null },
      { name: "周商", role: "商务中心总监", dept: 9, type: "human" as const, emoji: "💼", skills: "营收增长,客户开发,商务谈判", agent: null },
      { name: "吴运", role: "运营中心总监", dept: 10, type: "human" as const, emoji: "⚙️", skills: "流程优化,效能管理,资源调度", agent: null },
      { name: "郑客", role: "客户成功中心总监", dept: 11, type: "human" as const, emoji: "🤝", skills: "客户管理,满意度提升,续约推动", agent: null },
      { name: "王问", role: "顾问中心总监", dept: 12, type: "human" as const, emoji: "💡", skills: "行业方案,售前支持,需求分析", agent: null },
      { name: "冯行", role: "行政中心总监", dept: 13, type: "human" as const, emoji: "📎", skills: "办公环境,资产采购,制度管理", agent: null },
      { name: "陈人", role: "人力资源中心总监", dept: 14, type: "human" as const, emoji: "👥", skills: "人才招聘,培训发展,绩效薪酬", agent: null },
      { name: "褚财", role: "财务中心总监", dept: 15, type: "human" as const, emoji: "💰", skills: "财务核算,预算管理,税务合规", agent: null },
      { name: "卫质", role: "质量管理与战略中心总监", dept: 16, type: "human" as const, emoji: "✅", skills: "质量标准,流程审计,战略跟踪", agent: null },
    ];

    // --- L5 各中心成员（AI数字员工，共53人，总计71人） ---
    const centerStaff = [
      // 产品研发中心 (10人)
      { name: "周前", role: "前端工程师", dept: 5, type: "ai" as const, emoji: "🎨", skills: "React,TypeScript,Tailwind CSS", agent: "frontend_dev" },
      { name: "吴后", role: "后端工程师", dept: 5, type: "ai" as const, emoji: "⚙️", skills: "Node.js,PostgreSQL,Redis", agent: "backend_dev" },
      { name: "郑测", role: "测试工程师", dept: 5, type: "ai" as const, emoji: "🔍", skills: "自动化测试,性能测试,安全审计", agent: "qa_engineer" },
      { name: "李知", role: "知识管理员", dept: 5, type: "ai" as const, emoji: "📚", skills: "知识沉淀,文档管理,信息检索", agent: "knowledge" },
      { name: "AI产品经理", role: "产品经理", dept: 5, type: "ai" as const, emoji: "🎯", skills: "需求分析,产品规划,用户研究", agent: "product_manager" },
      { name: "AI架构师", role: "技术架构师", dept: 5, type: "ai" as const, emoji: "🏗️", skills: "系统设计,技术选型,架构评审", agent: "tech_architect" },
      { name: "AI全栈工程师", role: "全栈工程师", dept: 5, type: "ai" as const, emoji: "🔥", skills: "React,Node.js,数据库,系统设计", agent: "fullstack_dev" },
      { name: "AI移动端工程师", role: "移动端工程师", dept: 5, type: "ai" as const, emoji: "📱", skills: "React Native,Flutter,iOS,Android", agent: "mobile_dev" },
      { name: "AI小程序工程师", role: "小程序工程师", dept: 5, type: "ai" as const, emoji: "💬", skills: "微信小程序,Taro,uni-app", agent: "miniapp_dev" },
      { name: "AI代码审查员", role: "代码审查员", dept: 5, type: "ai" as const, emoji: "🔎", skills: "代码审查,编码规范,质量把控", agent: "code_reviewer" },

      // 技术保障中心 (6人)
      { name: "AI运维工程师", role: "运维工程师", dept: 6, type: "ai" as const, emoji: "🔧", skills: "云运维,容器化,监控告警", agent: "backend_dev" },
      { name: "AI安全工程师", role: "安全工程师", dept: 6, type: "ai" as const, emoji: "🔐", skills: "渗透测试,安全审计,合规检查", agent: "qa_engineer" },
      { name: "AI DevOps工程师", role: "DevOps工程师", dept: 6, type: "ai" as const, emoji: "🔄", skills: "CI/CD,自动化部署,效能度量", agent: "sre_engineer" },
      { name: "AI SRE工程师", role: "SRE工程师", dept: 6, type: "ai" as const, emoji: "🛠️", skills: "Linux,Docker,Kubernetes,监控告警", agent: "sre_engineer" },
      { name: "AI网络工程师", role: "网络工程师", dept: 6, type: "ai" as const, emoji: "🌐", skills: "网络架构,负载均衡,CDN", agent: "sre_engineer" },
      { name: "AI安全审计员", role: "安全审计员", dept: 6, type: "ai" as const, emoji: "🛡️", skills: "安全审计,合规检查,风险评估", agent: "qa_engineer" },

      // 数据中心 (6人)
      { name: "AI数据工程师", role: "数据工程师", dept: 7, type: "ai" as const, emoji: "🗄️", skills: "ETL,数据仓库,数据管道", agent: "data_engineer" },
      { name: "AI数据分析师", role: "数据分析师", dept: 7, type: "ai" as const, emoji: "📊", skills: "BI报表,数据可视化,业务分析", agent: "bi_analyst" },
      { name: "AI ML工程师", role: "ML工程师", dept: 7, type: "ai" as const, emoji: "🤖", skills: "模型训练,特征工程,AI应用", agent: "ai_engineer" },
      { name: "AI DBA", role: "数据库管理员", dept: 7, type: "ai" as const, emoji: "🗃️", skills: "PostgreSQL,MySQL,数据库调优", agent: "dba" },
      { name: "AI数据治理专员", role: "数据治理专员", dept: 7, type: "ai" as const, emoji: "📐", skills: "数据质量,数据标准,元数据管理", agent: "data_engineer" },
      { name: "AI BI分析师", role: "BI分析师", dept: 7, type: "ai" as const, emoji: "📈", skills: "BI报表,数据可视化,SQL", agent: "bi_analyst" },

      // 交付管理中心 (6人)
      { name: "AI项目经理", role: "项目经理", dept: 8, type: "ai" as const, emoji: "📋", skills: "项目管理,进度控制,风险管理", agent: "product_manager" },
      { name: "AI交付工程师", role: "交付工程师", dept: 8, type: "ai" as const, emoji: "🚀", skills: "部署实施,客户培训,知识转移", agent: "backend_dev" },
      { name: "AI交付支持", role: "交付支持", dept: 8, type: "ai" as const, emoji: "🛠️", skills: "技术支持,问题排查,文档编写", agent: "qa_engineer" },
      { name: "AI PMO", role: "PMO专员", dept: 8, type: "ai" as const, emoji: "📊", skills: "项目监控,资源协调,流程优化", agent: "strategy_executive" },
      { name: "AI需求分析师", role: "需求分析师", dept: 8, type: "ai" as const, emoji: "📝", skills: "需求调研,方案设计,客户沟通", agent: "presales_architect" },
      { name: "AI实施顾问", role: "实施顾问", dept: 8, type: "ai" as const, emoji: "🎓", skills: "系统实施,用户培训,上线支持", agent: "customer_success" },

      // 商务中心 (6人)
      { name: "AI商务经理", role: "商务经理", dept: 9, type: "ai" as const, emoji: "💼", skills: "客户开发,商务谈判,合同管理", agent: "sales_manager" },
      { name: "AI渠道经理", role: "渠道经理", dept: 9, type: "ai" as const, emoji: "🔗", skills: "渠道建设,合作伙伴,市场拓展", agent: "sales_manager" },
      { name: "AI市场分析师", role: "市场分析师", dept: 9, type: "ai" as const, emoji: "📈", skills: "竞品分析,市场洞察,情报收集", agent: "bi_analyst" },
      { name: "AI售前架构师", role: "售前架构师", dept: 9, type: "ai" as const, emoji: "🏗️", skills: "方案设计,售前支持,需求分析,技术咨询", agent: "presales_architect" },
      { name: "AI品牌经理", role: "品牌经理", dept: 9, type: "ai" as const, emoji: "📢", skills: "品牌推广,公关传播,内容营销", agent: "newmedia_ops" },
      { name: "AI电商运营", role: "电商运营", dept: 9, type: "ai" as const, emoji: "🛒", skills: "电商运营,商品管理,活动策划", agent: "ecommerce_ops" },

      // 运营中心 (5人)
      { name: "AI运营专员", role: "运营专员", dept: 10, type: "ai" as const, emoji: "⚙️", skills: "流程优化,SOP建设,数据分析", agent: "product_manager" },
      { name: "AI效能分析师", role: "效能分析师", dept: 10, type: "ai" as const, emoji: "📊", skills: "效能度量,资源调度,运营报告", agent: "bi_analyst" },
      { name: "AI数字员工运营", role: "数字员工运营", dept: 10, type: "ai" as const, emoji: "🤖", skills: "数字员工管理,效能监控,任务调度", agent: "customer_success" },
      { name: "AI流程优化师", role: "流程优化师", dept: 10, type: "ai" as const, emoji: "🔄", skills: "流程分析,SOP优化,自动化", agent: "strategy_executive" },
      { name: "AI新媒体运营", role: "新媒体运营", dept: 10, type: "ai" as const, emoji: "📱", skills: "内容策划,社交媒体,用户增长", agent: "newmedia_ops" },

      // 客户成功中心 (5人)
      { name: "AI客户成功经理", role: "客户成功经理", dept: 11, type: "ai" as const, emoji: "🤝", skills: "客户管理,满意度跟踪,续约推动", agent: "customer_success" },
      { name: "AI客户运营", role: "客户运营", dept: 11, type: "ai" as const, emoji: "📞", skills: "客户沟通,问题处理,案例沉淀", agent: "customer_success" },
      { name: "AI客户培训师", role: "客户培训师", dept: 11, type: "ai" as const, emoji: "🎓", skills: "客户培训,课程设计,知识转移", agent: "customer_success" },
      { name: "AI客户数据分析师", role: "客户数据分析师", dept: 11, type: "ai" as const, emoji: "📊", skills: "客户分析,流失预警,价值评估", agent: "bi_analyst" },
      { name: "AI客户体验设计师", role: "客户体验设计师", dept: 11, type: "ai" as const, emoji: "✨", skills: "用户体验,服务设计,满意度提升", agent: "product_manager" },

      // 顾问中心 (5人)
      { name: "AI行业顾问", role: "行业顾问", dept: 12, type: "ai" as const, emoji: "💡", skills: "行业方案,需求分析,方案编写", agent: "presales_architect" },
      { name: "AI解决方案架构师", role: "解决方案架构师", dept: 12, type: "ai" as const, emoji: "🏗️", skills: "方案设计,售前支持,技术咨询", agent: "tech_architect" },
      { name: "AI金融科技顾问", role: "金融科技顾问", dept: 12, type: "ai" as const, emoji: "💳", skills: "金融科技,风控咨询,数字化升级", agent: "fintech_consultant" },
      { name: "AI制造业顾问", role: "制造业顾问", dept: 12, type: "ai" as const, emoji: "🏭", skills: "智能制造,工业4.0,供应链优化", agent: "manufacturing_consultant" },
      { name: "AI政务顾问", role: "政务顾问", dept: 12, type: "ai" as const, emoji: "🏛️", skills: "数字政务,智慧城市,政务信息化", agent: "gov_consultant" },

      // 行政中心 (3人)
      { name: "AI行政专员", role: "行政专员", dept: 13, type: "ai" as const, emoji: "📎", skills: "资产管理,制度执行,供应商管理", agent: "hr_manager" },
      { name: "AI法务顾问", role: "法务顾问", dept: 13, type: "ai" as const, emoji: "⚖️", skills: "合同审查,法律咨询,合规检查,知识产权", agent: "legal_advisor" },
      { name: "AI知识产权专员", role: "知识产权专员", dept: 13, type: "ai" as const, emoji: "📄", skills: "专利申请,商标注册,知识产权保护", agent: "ip_specialist" },

      // 人力资源中心 (4人)
      { name: "AI HRBP", role: "HRBP", dept: 14, type: "ai" as const, emoji: "👥", skills: "人才配置,员工关系,组织发展", agent: "hr_manager" },
      { name: "AI招聘专员", role: "招聘专员", dept: 14, type: "ai" as const, emoji: "🎯", skills: "人才招聘,简历筛选,面试安排", agent: "hr_manager" },
      { name: "AI培训专员", role: "培训专员", dept: 14, type: "ai" as const, emoji: "📖", skills: "培训开发,课程设计,学习发展", agent: "hr_manager" },
      { name: "AI薪酬绩效专员", role: "薪酬绩效专员", dept: 14, type: "ai" as const, emoji: "💎", skills: "薪酬设计,绩效管理,激励方案", agent: "hr_manager" },

      // 财务中心 (4人)
      { name: "AI会计", role: "会计", dept: 15, type: "ai" as const, emoji: "💰", skills: "财务核算,报表编制,税务处理", agent: "financial_accountant" },
      { name: "AI出纳", role: "出纳", dept: 15, type: "ai" as const, emoji: "💳", skills: "资金管理,费用审核,账务处理", agent: "cashier" },
      { name: "AI财务经理", role: "财务经理", dept: 15, type: "ai" as const, emoji: "📊", skills: "财务核算,费用管理,报表编制", agent: "finance_manager" },
      { name: "AI管理会计师", role: "管理会计师", dept: 15, type: "ai" as const, emoji: "📐", skills: "成本分析,预算编制,经营分析", agent: "mgmt_accountant" },

      // 质量管理与战略中心 (4人)
      { name: "AI质量工程师", role: "质量工程师", dept: 16, type: "ai" as const, emoji: "✅", skills: "质量审核,流程审计,标准制定", agent: "qa_engineer" },
      { name: "AI战略分析师", role: "战略分析师", dept: 16, type: "ai" as const, emoji: "🔭", skills: "战略规划,OKR管理,行业研究", agent: "strategy_executive" },
      { name: "AI投资经理", role: "投资经理", dept: 16, type: "ai" as const, emoji: "💎", skills: "项目尽调,投资分析,投后管理", agent: "investment_manager" },
      { name: "AI医疗行业顾问", role: "医疗行业顾问", dept: 16, type: "ai" as const, emoji: "🏥", skills: "医疗行业,合规咨询,数字化转型", agent: "medical_consultant" },
    ];

    // 插入所有员工
    const allEmployees = [...executives, ...directors, ...centerStaff];
    for (const e of allEmployees) {
      dbRun(
        "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [1, deptIds[e.dept], e.name, e.role, e.agent, e.type, e.skills, e.emoji, 1]
      );
    }

    // ===== 集团管控架构：区域分公司 + 外派分支 + 项目标段 + 现场试验室 =====
    // COO线(属地管辖): COO办公室→区域分公司→外派分支→项目组→现场试验室
    // CTO线(专业管辖): CTO办公室→交付管理中心→现场试验室(secondary_parent_id)
    const cooDeptId = deptIds[3];    // COO办公室
    const dmCenterId = deptIds[8];   // 交付管理中心(CTO线)
    const allBranchDepts: Record<string, number> = {};
    let deptSeq2 = 100;

    // 4个区域分公司
    const regions = [
      { name: "华东区域分公司", code: "华东" },
      { name: "华南区域分公司", code: "华南" },
      { name: "西部区域分公司", code: "西部" },
      { name: "华北区域分公司", code: "华北" },
    ];
    const regionIds2: number[] = [];
    for (const r of regions) {
      const rr = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (1,?,?,?,?,1,'regional','regional',?,1)",
        [r.name, cooDeptId, deptSeq2++, `${r.code}区域业务统筹·下设外派分支`, r.code]
      );
      regionIds2.push(rr.lastInsertRowid);
      allBranchDepts[r.name] = rr.lastInsertRowid;
    }

    // 外派分支定义: [区域索引, 分支名, 城市]
    const branchDefs: [number, string, string][] = [
      [0,"上海外派分支","上海"],[0,"南京外派分支","南京"],[0,"杭州外派分支","杭州"],
      [0,"合肥外派分支","合肥"],[0,"苏州外派分支","苏州"],[0,"宁波外派分支","宁波"],
      [1,"广州外派分支","广州"],[1,"深圳外派分支","深圳"],[1,"南宁外派分支","南宁"],
      [1,"福州外派分支","福州"],[1,"海口外派分支","海口"],
      [2,"成都外派分支","成都"],[2,"重庆外派分支","重庆"],[2,"昆明外派分支","昆明"],
      [2,"西安外派分支","西安"],[2,"兰州外派分支","兰州"],
      [3,"北京外派分支","北京"],[3,"天津外派分支","天津"],[3,"石家庄外派分支","石家庄"],
      [3,"郑州外派分支","郑州"],
    ];

    // 外派分支 + 项目组 + 试验室
    for (const [ri, bName, city] of branchDefs) {
      const regionId = regionIds2[ri];
      const rc = regions[ri];
      const br = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (1,?,?,?,?,1,'branch','branch',?,2)",
        [bName, regionId, deptSeq2++, `${city}外派·属地业务管理`, rc.code]
      );
      const branchId = br.lastInsertRowid;
      allBranchDepts[bName] = branchId;

      // 项目组 (每个分支2个)
      const projNames = [`${city}一标项目组`, `${city}二标项目组`];
      for (const projName of projNames) {
        const pr = dbRun(
          "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (1,?,?,?,?,1,'project','project',?,3)",
          [projName, branchId, deptSeq2++, `${projName}—下设现场试验室`, rc.code]
        );
        const projId = pr.lastInsertRowid;
        allBranchDepts[projName] = projId;

        // 试验室 (一标2个，二标1个，交替)
        const labCount = projName.includes("一标") ? 2 : 1;
        for (let li = 0; li < labCount; li++) {
          const labSuffix = labCount === 2 ? (li === 0 ? "A" : "B") : "";
          const labName = projName.replace("项目组", labSuffix + "试验室");
          const lr = dbRun(
          "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level, secondary_parent_id) VALUES (1,?,?,?,?,1,'site_lab','site_lab',?,4,?)",
            [labName, projId, deptSeq2++, `双重汇报·属地归${bName}·专业归交付管理中心`, rc.code, dmCenterId]
          );
          allBranchDepts[labName] = lr.lastInsertRowid;
        }
      }
    }

    // 统计
    const totalBranchUnits = Object.keys(allBranchDepts).length;
    const fieldBranchCount = branchDefs.length;
    const labCount2 = Object.keys(allBranchDepts).filter(k => k.includes("试验室")).length;

    // ===== 外派员工生成 =====
    const surnames = ["王","李","张","刘","陈","杨","黄","赵","周","吴","徐","孙","马","朱","胡","林","郭","何","高","罗","郑","梁","谢","宋","唐","许","邓","韩","冯","曹","彭","曾","萧","田","董","袁","潘","于","蒋","蔡","余","杜","叶","程","苏","魏","吕","丁","任","沈","姚","卢","姜","崔","钟","谭","陆","汪","范","金","石","廖","贾","夏","韦","付","方","白","邹","孟","熊","秦","邱","江","尹","薛","闫","段","雷","侯","龙","史","陶","黎","贺","顾","毛","郝","龚","邵","万","钱","严","覃","武","戴","莫","孔","向","汤"];
    let sIdx = 0;

    // 分支经理 (人类, 20人)
    const fieldEmpNames: string[] = [];
    for (const [, bName, city] of branchDefs) {
      const n = surnames[sIdx % surnames.length] + city.charAt(0) + "经理";
      dbRun(
        "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
        [allBranchDepts[bName], n, "分支经理", null, "human", "团队管理,属地协调,进度把控,安全管理", "👔", 1]
      );
      sIdx++;
    }

    // 分支AI核心人员 (每分支4人 = 80人)
    const branchAIRoles = [
      { role: "技术负责人", skills: "技术方案,质量把关,标准执行", e: "🔧", agent: "tech_architect" },
      { role: "安全主管", skills: "安全巡检,隐患整改,安全教育", e: "🛡️", agent: "qa_engineer" },
      { role: "资料主管", skills: "档案管理,报表编制,数据录入", e: "📄", agent: "data_engineer" },
      { role: "综合管理员", skills: "行政后勤,物资管理,人事协调", e: "📎", agent: "hr_manager" },
    ];
    for (const [, bName, city] of branchDefs) {
      for (const r of branchAIRoles) {
        const n = surnames[sIdx % surnames.length] + city.charAt(0) + r.role.charAt(0);
        dbRun(
          "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
          [allBranchDepts[bName], n, r.role, r.agent, "ai", r.skills, r.e, 1]
        );
        sIdx++;
      }
    }

    // 项目级 (每项目1PM+2工程师)
    for (const depName of Object.keys(allBranchDepts)) {
      if (!depName.includes("项目组")) continue;
      const n1 = surnames[sIdx % surnames.length] + "项" + (sIdx % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
        [allBranchDepts[depName], n1, "项目经理", "product_manager", "ai", "项目管理,进度控制,风险管控,团队协调", "📋", 1]);
      sIdx++;
      const n2 = surnames[sIdx % surnames.length] + "工" + (sIdx % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
        [allBranchDepts[depName], n2, "现场工程师", "backend_dev", "ai", "施工技术,检测方案,现场管理", "🔧", 1]);
      sIdx++;
      const n3 = surnames[sIdx % surnames.length] + "质" + (sIdx % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
        [allBranchDepts[depName], n3, "质量工程师", "qa_engineer", "ai", "质量检测,材料试验,标准执行", "✅", 1]);
      sIdx++;
    }

    // 试验室级 (每室1主任+2-3技术员)
    for (const depName of Object.keys(allBranchDepts)) {
      if (!depName.includes("试验室")) continue;
      const n1 = surnames[sIdx % surnames.length] + "室" + (sIdx % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
        [allBranchDepts[depName], n1, "试验室主任", "qa_engineer", "ai", "试验室管理,检测方案,报告审核", "🔬", 1]);
      sIdx++;
      const techRoles = [
        { role: "检测技术员", skills: "材料试验,仪器操作,数据采集", e: "🧪", agent: "backend_dev" },
        { role: "检测技术员", skills: "现场检测,取样分析,记录编制", e: "⚗️", agent: "qa_engineer" },
        { role: "检测技术员", skills: "室内试验,养护管理,报告编制", e: "📊", agent: "data_engineer" },
      ];
      for (const t of techRoles) {
        const n = surnames[sIdx % surnames.length] + "检" + (sIdx % 100);
        dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (1,?,?,?,?,?,?,?,?)",
          [allBranchDepts[depName], n, t.role, t.agent, "ai", t.skills, t.e, 1]);
        sIdx++;
      }
    }

    console.log(`[种子] 集团架构: ${totalBranchUnits}个分支组织单元 (含${fieldBranchCount}外派分支·${labCount2}试验室), ${sIdx}名外派员工`);

    // 技能库种子数据（11大分类，完整技能市场）
    const skillsLibrary = [
      // 开发与技术
      { name: "React", cat: "开发与技术", tags: "前端,JavaScript,UI", desc: "React 19 + Hooks + 状态管理，构建现代化前端应用", icon: "⚛️" },
      { name: "TypeScript", cat: "开发与技术", tags: "前端,类型安全,JavaScript", desc: "TypeScript类型系统，提升代码质量和开发效率", icon: "🔷" },
      { name: "Node.js", cat: "开发与技术", tags: "后端,JavaScript,服务端", desc: "Node.js服务端开发，Express/Koa/Fastify框架", icon: "💚" },
      { name: "PostgreSQL", cat: "开发与技术", tags: "数据库,SQL,关系型", desc: "PostgreSQL数据库设计、优化与运维", icon: "🐘" },
      { name: "Redis", cat: "开发与技术", tags: "缓存,NoSQL,内存数据库", desc: "Redis缓存策略、数据结构与高可用方案", icon: "🔴" },
      { name: "Docker", cat: "开发与技术", tags: "容器,DevOps,部署", desc: "Docker容器化部署与镜像管理", icon: "🐳" },
      { name: "Kubernetes", cat: "开发与技术", tags: "容器编排,云原生,运维", desc: "K8s集群管理、服务编排与自动扩缩容", icon: "☸️" },
      { name: "Python", cat: "开发与技术", tags: "后端,AI,数据", desc: "Python编程，数据处理与AI应用开发", icon: "🐍" },
      { name: "Go", cat: "开发与技术", tags: "后端,高并发,微服务", desc: "Go语言高并发服务开发", icon: "🔵" },
      { name: "系统设计", cat: "开发与技术", tags: "架构,设计模式,分布式", desc: "大规模系统架构设计与技术选型", icon: "🏗️" },
      { name: "API设计", cat: "开发与技术", tags: "REST,GraphQL,接口", desc: "RESTful/GraphQL API设计最佳实践", icon: "🔌" },
      { name: "微服务架构", cat: "开发与技术", tags: "架构,分布式,服务治理", desc: "微服务拆分、服务治理与分布式事务", icon: "🧩" },
      { name: "CI/CD", cat: "开发与技术", tags: "持续集成,持续部署,自动化", desc: "CI/CD流水线搭建与自动化部署", icon: "🔄" },
      { name: "自动化测试", cat: "开发与技术", tags: "测试,质量保障,单元测试", desc: "单元测试、集成测试与E2E测试", icon: "🧪" },
      { name: "性能优化", cat: "开发与技术", tags: "性能,调优,监控", desc: "应用性能分析、瓶颈定位与优化", icon: "⚡" },
      { name: "安全测试", cat: "开发与技术", tags: "安全,渗透测试,漏洞", desc: "安全漏洞扫描、渗透测试与修复", icon: "🛡️" },
      // 数据与金融
      { name: "数据分析", cat: "数据与金融", tags: "数据,分析,可视化", desc: "数据采集、清洗、分析与可视化呈现", icon: "📊" },
      { name: "BI报表", cat: "数据与金融", tags: "商业智能,报表,数据可视化", desc: "商业智能报表设计与数据看板搭建", icon: "📉" },
      { name: "机器学习", cat: "数据与金融", tags: "AI,模型训练,预测", desc: "机器学习算法应用与模型训练", icon: "🧠" },
      { name: "深度学习", cat: "数据与金融", tags: "AI,神经网络,NLP", desc: "深度学习框架与NLP/CV应用", icon: "🔬" },
      { name: "ETL", cat: "数据与金融", tags: "数据管道,数据仓库,数据集成", desc: "数据抽取、转换、加载与数据仓库建设", icon: "🔀" },
      { name: "数据治理", cat: "数据与金融", tags: "数据质量,数据标准,元数据", desc: "数据质量管理、数据标准制定与元数据管理", icon: "📐" },
      { name: "财务分析", cat: "数据与金融", tags: "财务,报表分析,经营分析", desc: "财务报表分析、经营指标解读", icon: "💹" },
      { name: "预算管理", cat: "数据与金融", tags: "预算,成本控制,财务管理", desc: "预算编制、执行监控与成本管控", icon: "💰" },
      { name: "量化分析", cat: "数据与金融", tags: "量化,回测,策略", desc: "量化交易策略开发与回测验证", icon: "📈" },
      { name: "税务筹划", cat: "数据与金融", tags: "税务,合规,税务优化", desc: "税务合规管理与合理税务筹划", icon: "🧾" },
      // 营销与增长
      { name: "市场策略", cat: "营销与增长", tags: "市场,品牌,定位", desc: "市场定位、品牌策略与竞争分析", icon: "🎯" },
      { name: "品牌推广", cat: "营销与增长", tags: "品牌,传播,公关", desc: "品牌传播、公关活动与口碑管理", icon: "📢" },
      { name: "SEO优化", cat: "营销与增长", tags: "SEO,搜索引擎,流量", desc: "搜索引擎优化与自然流量获取", icon: "🔍" },
      { name: "内容营销", cat: "营销与增长", tags: "内容,营销,获客", desc: "内容策略、创作分发与获客转化", icon: "📝" },
      { name: "社交媒体", cat: "营销与增长", tags: "社交,运营,用户增长", desc: "社交媒体运营与用户增长策略", icon: "📱" },
      { name: "用户增长", cat: "营销与增长", tags: "增长,获客,留存", desc: "增长黑客方法论，拉新促活留存", icon: "🚀" },
      { name: "广告投放", cat: "营销与增长", tags: "广告,投放,ROI", desc: "数字广告投放策略与ROI优化", icon: "💳" },
      { name: "竞品分析", cat: "营销与增长", tags: "竞品,市场研究,差异化", desc: "竞品调研、差异化定位与策略制定", icon: "🔎" },
      // 电商与跨境
      { name: "电商运营", cat: "电商与跨境", tags: "电商,运营,商品管理", desc: "电商平台运营、商品管理与活动策划", icon: "🛒" },
      { name: "跨境电商", cat: "电商与跨境", tags: "跨境,Amazon,速卖通", desc: "跨境电商平台运营与国际物流", icon: "🌍" },
      { name: "供应链管理", cat: "电商与跨境", tags: "供应链,物流,采购", desc: "供应链优化、物流管理与采购策略", icon: "📦" },
      { name: "选品分析", cat: "电商与跨境", tags: "选品,市场分析,爆品", desc: "市场趋势分析与爆品选品策略", icon: "🔎" },
      { name: "店铺运营", cat: "电商与跨境", tags: "店铺,运营,转化率", desc: "店铺装修、流量运营与转化优化", icon: "🏪" },
      // 内容与创作
      { name: "文案写作", cat: "内容与创作", tags: "文案,写作,创意", desc: "商业文案、创意写作与内容策划", icon: "✍️" },
      { name: "PPT设计", cat: "内容与创作", tags: "PPT,演示,设计", desc: "专业PPT设计与信息可视化呈现", icon: "📑" },
      { name: "视频制作", cat: "内容与创作", tags: "视频,剪辑,创意", desc: "视频策划、拍摄剪辑与后期制作", icon: "🎬" },
      { name: "UI设计", cat: "内容与创作", tags: "UI,设计,用户体验", desc: "用户界面设计与交互体验优化", icon: "🎨" },
      { name: "信息可视化", cat: "内容与创作", tags: "可视化,图表,数据展示", desc: "数据可视化设计与图表呈现", icon: "📊" },
      // 沟通与协作
      { name: "商务谈判", cat: "沟通与协作", tags: "谈判,商务,沟通", desc: "商务谈判策略、沟通技巧与成交推动", icon: "🤝" },
      { name: "项目管理", cat: "沟通与协作", tags: "项目,进度,协调", desc: "项目全生命周期管理与跨团队协调", icon: "📋" },
      { name: "团队管理", cat: "沟通与协作", tags: "团队,领导力,管理", desc: "团队建设、人才培养与绩效管理", icon: "👥" },
      { name: "客户沟通", cat: "沟通与协作", tags: "客户,沟通,关系维护", desc: "客户关系维护、需求理解与满意度提升", icon: "💬" },
      { name: "跨部门协作", cat: "沟通与协作", tags: "协作,协调,组织", desc: "跨部门项目协调与资源整合", icon: "🔗" },
      { name: "会议管理", cat: "沟通与协作", tags: "会议,效率,决策", desc: "高效会议组织、议程管理与决议跟踪", icon: "📅" },
      // 法务与合规
      { name: "合同审查", cat: "法务与合规", tags: "合同,法务,风险", desc: "合同条款审查、风险识别与修改建议", icon: "📜" },
      { name: "知识产权", cat: "法务与合规", tags: "专利,商标,版权", desc: "专利申请、商标注册与知识产权保护", icon: "©️" },
      { name: "合规检查", cat: "法务与合规", tags: "合规,审计,制度", desc: "合规体系搭建、制度审计与整改", icon: "✅" },
      { name: "劳动法", cat: "法务与合规", tags: "劳动法,用工,员工关系", desc: "劳动法规咨询、用工风险防范", icon: "⚖️" },
      // 学术与教育
      { name: "培训开发", cat: "学术与教育", tags: "培训,课程,学习", desc: "企业培训体系搭建与课程开发", icon: "🎓" },
      { name: "知识管理", cat: "学术与教育", tags: "知识,文档,沉淀", desc: "知识库建设、文档管理与知识沉淀", icon: "📚" },
      { name: "行业研究", cat: "学术与教育", tags: "研究,分析,趋势", desc: "行业趋势研究、竞争格局分析", icon: "🔬" },
      { name: "学术写作", cat: "学术与教育", tags: "论文,学术,研究", desc: "学术论文撰写、研究报告编制", icon: "📝" },
      // AI增强与知识
      { name: "Prompt工程", cat: "AI增强与知识", tags: "AI,Prompt,提示词", desc: "Prompt设计、优化与工程化实践", icon: "💡" },
      { name: "RAG知识库", cat: "AI增强与知识", tags: "RAG,知识库,检索增强", desc: "检索增强生成架构设计与实现", icon: "🔍" },
      { name: "Agent开发", cat: "AI增强与知识", tags: "AI Agent,智能体,自动化", desc: "AI Agent架构设计与工具集成", icon: "🤖" },
      { name: "模型微调", cat: "AI增强与知识", tags: "微调,训练,LLM", desc: "大语言模型微调与领域适配", icon: "🔧" },
      // 生活与健康
      { name: "健康管理", cat: "生活与健康", tags: "健康,运动,饮食", desc: "健康生活方式、运动计划与营养指导", icon: "🌿" },
      { name: "时间管理", cat: "生活与健康", tags: "时间,效率,规划", desc: "时间管理方法论与效率提升", icon: "⏰" },
      // 沟通与协作（补充飞书生态）
      { name: "飞书集成", cat: "沟通与协作", tags: "飞书,企业协作,API", desc: "飞书开放平台API集成与自动化", icon: "🐦" },
      { name: "企业微信集成", cat: "沟通与协作", tags: "企业微信,微信,协作", desc: "企业微信API集成与消息自动化", icon: "💬" },
    ];
    for (const s of skillsLibrary) {
      const slug = s.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/-+$/, '');
      const version = "1.0.0";
      const installCount = Math.floor(Math.random() * 300) + 10;
      const rating = parseFloat((3.5 + Math.random() * 1.5).toFixed(1));
      dbRun(
        "INSERT INTO skills (tenant_id, company_id, name, slug, category, description, tags, icon, source, version, author, install_count, rating, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [1, 1, s.name, slug, s.cat, s.desc, s.tags, s.icon, "local", version, "雄元科技", installCount, rating, 1]
      );
    }

    // 默认职级体系
    const positionLevels = [
      { code: "P1", name: "初级工程师", sequence: "P", level: 1 },
      { code: "P2", name: "工程师", sequence: "P", level: 2 },
      { code: "P3", name: "高级工程师", sequence: "P", level: 3 },
      { code: "P4", name: "资深工程师", sequence: "P", level: 4 },
      { code: "P5", name: "专家工程师", sequence: "P", level: 5 },
      { code: "M1", name: "主管", sequence: "M", level: 1 },
      { code: "M2", name: "经理", sequence: "M", level: 2 },
      { code: "M3", name: "总监", sequence: "M", level: 3 },
      { code: "D1", name: "副总裁", sequence: "D", level: 1 },
      { code: "D2", name: "高级副总裁", sequence: "D", level: 2 },
      { code: "C1", name: "C-Level", sequence: "C", level: 1 },
      { code: "C2", name: "CEO", sequence: "C", level: 2 },
    ];
    for (const pl of positionLevels) {
      dbRun("INSERT INTO position_levels (code, name, sequence, level, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [pl.code, pl.name, pl.sequence, pl.level, 1]);
    }

    const tasks = [
      { title: "完成Q2产品路线图规划", priority: "high", status: "in_progress", assignee: 4 },
      { title: "部署生产环境CI/CD流水线", priority: "critical", status: "in_progress", assignee: 2 },
      { title: "编写API接口文档", priority: "medium", status: "todo", assignee: 3 },
      { title: "设计新版Dashboard UI", priority: "high", status: "review", assignee: 7 },
      { title: "性能压测报告", priority: "medium", status: "done", assignee: 9 },
      { title: "月度财务分析报告", priority: "high", status: "in_progress", assignee: 3 },
      { title: "竞品分析报告", priority: "low", status: "todo", assignee: 5 },
      { title: "新员工入职培训方案", priority: "medium", status: "done", assignee: 6 },
      { title: "数据库迁移方案评审", priority: "critical", status: "todo", assignee: 8 },
      { title: "Q2市场推广计划", priority: "high", status: "in_progress", assignee: 5 },
      { title: "安全审计漏洞修复", priority: "critical", status: "in_progress", assignee: 9 },
      { title: "知识库文档整理", priority: "low", status: "done", assignee: 10 },
    ];
    for (const t of tasks) {
      dbRun("INSERT INTO tasks (company_id, title, priority, status, assigned_to, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
        [1, t.title, t.priority, t.status, t.assignee, 1]);
    }

    dbRun("INSERT INTO chats (company_id, title, type, created_by, tenant_id) VALUES (?, ?, 'group', ?, ?)", [1, "总裁办战略会议", 2, 1]);
    dbRun("INSERT INTO chats (company_id, title, type, created_by, tenant_id) VALUES (?, ?, 'group', ?, ?)", [1, "CTO技术线周会", 2, 1]);
    dbRun("INSERT INTO chats (company_id, title, type, created_by, tenant_id) VALUES (?, ?, 'group', ?, ?)", [1, "产品需求讨论", 2, 1]);

    const ceoMessages = [
      { sender: "陈远 · CEO", type: "employee", content: "各位好，今天讨论Q2战略重点。核心目标：完成产品PMF验证、获取首批50家付费客户、建立Agent API基础架构。" },
      { sender: "林技 · CTO", type: "employee", content: "技术侧建议：先完成数据库迁移，CI/CD流水线本周可以完成。" },
      { sender: "赵产 · 产品研发中心总监", type: "employee", content: "产品侧反馈：Dashboard需要突出'AI员工正在工作'的实时感。" },
      { sender: "褚财 · 财务中心总监", type: "employee", content: "财务提醒：建议尽快开通支付功能，启动收费。" },
      { sender: "张总", type: "user", content: "好的，优先级明确了。散会。" },
    ];
    for (const m of ceoMessages) {
      dbRun("INSERT INTO messages (chat_id, sender_type, sender_name, content, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [1, m.type, m.sender, m.content, 1]);
    }

    // 绩效评估种子数据
    const performanceReviews = [
      { employee_id: 7, type: "ai", period: "2026-Q2", overall: 88, task: 92, quality: 85, efficiency: 90, collab: 78, notes: "前端交付质量优秀，代码审查及时" },
      { employee_id: 8, type: "ai", period: "2026-Q2", overall: 85, task: 88, quality: 82, efficiency: 86, collab: 80, notes: "后端架构稳定，API设计规范" },
      { employee_id: 9, type: "ai", period: "2026-Q2", overall: 82, task: 85, quality: 80, efficiency: 78, collab: 85, notes: "测试覆盖率提升，发现多个关键bug" },
      { employee_id: 10, type: "ai", period: "2026-Q2", overall: 90, task: 95, quality: 88, efficiency: 92, collab: 82, notes: "知识沉淀体系搭建完成，文档质量高" },
      { employee_id: 11, type: "ai", period: "2026-Q2", overall: 86, task: 90, quality: 84, efficiency: 85, collab: 83, notes: "产品需求分析准确，用户反馈良好" },
      { employee_id: 12, type: "ai", period: "2026-Q2", overall: 87, task: 88, quality: 90, efficiency: 84, collab: 82, notes: "技术架构设计合理，评审通过率高" },
    ];
    for (const r of performanceReviews) {
      dbRun(
        `INSERT INTO performance_reviews (tenant_id, employee_id, employee_type, review_period, overall_score, task_completion_score, quality_score, efficiency_score, collaboration_score, review_notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [1, r.employee_id, r.type, r.period, r.overall, r.task, r.quality, r.efficiency, r.collab, r.notes]
      );
    }

    // 绩效指标种子数据
    const perfMetrics = [
      { employee_id: 7, type: "task_completion_rate", value: 92, unit: "%", period: "2026-Q2" },
      { employee_id: 7, type: "code_quality_score", value: 85, unit: "分", period: "2026-Q2" },
      { employee_id: 7, type: "response_time_avg", value: 2.3, unit: "秒", period: "2026-Q2" },
      { employee_id: 8, type: "task_completion_rate", value: 88, unit: "%", period: "2026-Q2" },
      { employee_id: 8, type: "api_uptime", value: 99.9, unit: "%", period: "2026-Q2" },
      { employee_id: 8, type: "response_time_avg", value: 1.8, unit: "秒", period: "2026-Q2" },
      { employee_id: 9, type: "task_completion_rate", value: 85, unit: "%", period: "2026-Q2" },
      { employee_id: 9, type: "bug_detection_rate", value: 94, unit: "%", period: "2026-Q2" },
      { employee_id: 10, type: "task_completion_rate", value: 95, unit: "%", period: "2026-Q2" },
      { employee_id: 10, type: "knowledge_entries", value: 156, unit: "篇", period: "2026-Q2" },
      { employee_id: 11, type: "task_completion_rate", value: 90, unit: "%", period: "2026-Q2" },
      { employee_id: 12, type: "task_completion_rate", value: 88, unit: "%", period: "2026-Q2" },
    ];
    for (const m of perfMetrics) {
      dbRun(
        "INSERT INTO performance_metrics (tenant_id, employee_id, employee_type, metric_type, metric_value, metric_unit, period) VALUES (?, ?, 'ai', ?, ?, ?, ?)",
        [1, m.employee_id, m.type, m.value, m.unit, m.period]
      );
    }

    // 心跳计划种子数据 - 为AI员工配置自动任务执行
    const heartbeatSchedules = [
      { agent_id: 7, task_type: "auto_execute", cron: "*/5 * * * *" },   // 周前 - 前端
      { agent_id: 8, task_type: "auto_execute", cron: "*/5 * * * *" },   // 吴后 - 后端
      { agent_id: 9, task_type: "auto_execute", cron: "*/5 * * * *" },   // 郑测 - 测试
      { agent_id: 10, task_type: "auto_execute", cron: "*/10 * * * *" }, // 李知 - 知识管理
      { agent_id: 11, task_type: "auto_execute", cron: "*/5 * * * *" },  // AI产品经理
      { agent_id: 12, task_type: "auto_execute", cron: "*/5 * * * *" },  // AI架构师
    ];
    for (const hs of heartbeatSchedules) {
      dbRun(
        "INSERT INTO heartbeat_schedules (agent_id, task_type, cron_expression, enabled, next_run, tenant_id) VALUES (?, ?, ?, 1, datetime('now', '+1 minute'), ?)",
        [hs.agent_id, hs.task_type, hs.cron, 1]
      );
    }

    const notes = [
      { title: "AI员工协作规范", content: "管理者拆解任务→分配执行者→执行者并行工作→管理者汇总审查。每个环节有H2A2A2H治理引擎把关。", tags: "规范,协作" },
      { title: "产品定价策略", content: "基础版¥2,999/月（5名AI员工）、专业版¥9,999/月（20名）、企业版¥29,999/月（无限）。", tags: "定价,商业" },
      { title: "H2A2A2H治理协议", content: "Human-to-AI-to-AI-to-Human三维治理：人类下达指令→管理者AI拆解→执行者AI执行→人类验收。", tags: "治理,协议" },
    ];
    for (const n of notes) {
      dbRun("INSERT INTO knowledge_notes (title, content, tags, tenant_id) VALUES (?, ?, ?, ?)", [n.title, n.content, n.tags, 1]);
    }

    // ===== 演示公司（tenant_id=2, 独立租户）=====
    dbRun("INSERT INTO companies (name, tenant_id) VALUES (?, ?)", ["演示公司", 2]);

    const demoDeptIds: number[] = [];
    for (let i = 0; i < deptDefs.length; i++) {
      const d = deptDefs[i];
      const r = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
        [2, d.name, d.parentIdx !== null ? demoDeptIds[d.parentIdx] : null, i, d.desc, 2]
      );
      demoDeptIds.push(r.lastInsertRowid);
    }

    // ===== 演示公司集团架构：区域分公司 + 外派分支 + 项目标段 + 现场试验室 =====
    const demoCooDeptId = demoDeptIds[3];    // COO办公室
    const demoDmCenterId = demoDeptIds[8];   // 交付管理中心(CTO线)
    const demoAllBranchDepts: Record<string, number> = {};
    let demoDeptSeq = 200;

    // 4个区域分公司
    const demoRegionIds: number[] = [];
    for (const r of regions) {
      const rr = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (2,?,?,?,?,2,'regional','regional',?,1)",
        [r.name, demoCooDeptId, demoDeptSeq++, `${r.code}区域业务统筹·下设外派分支`, r.code]
      );
      demoRegionIds.push(rr.lastInsertRowid);
      demoAllBranchDepts[r.name] = rr.lastInsertRowid;
    }

    // 外派分支 + 项目组 + 试验室
    for (const [ri, bName, city] of branchDefs) {
      const regionId = demoRegionIds[ri];
      const rc = regions[ri];
      const br = dbRun(
        "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (2,?,?,?,?,2,'branch','branch',?,2)",
        [bName, regionId, demoDeptSeq++, `${city}外派·属地业务管理`, rc.code]
      );
      const branchId = br.lastInsertRowid;
      demoAllBranchDepts[bName] = branchId;

      const projNames = [`${city}一标项目组`, `${city}二标项目组`];
      for (const projName of projNames) {
        const pr = dbRun(
          "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level) VALUES (2,?,?,?,?,2,'project','project',?,3)",
          [projName, branchId, demoDeptSeq++, `${projName}—下设现场试验室`, rc.code]
        );
        const projId = pr.lastInsertRowid;
        demoAllBranchDepts[projName] = projId;

        const labCount = projName.includes("一标") ? 2 : 1;
        for (let li = 0; li < labCount; li++) {
          const labSuffix = labCount === 2 ? (li === 0 ? "A" : "B") : "";
          const labName = projName.replace("项目组", labSuffix + "试验室");
          const lr = dbRun(
            "INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type, region, branch_level, secondary_parent_id) VALUES (2,?,?,?,?,2,'site_lab','site_lab',?,4,?)",
            [labName, projId, demoDeptSeq++, `双重汇报·属地归${bName}·专业归交付管理中心`, rc.code, demoDmCenterId]
          );
          demoAllBranchDepts[labName] = lr.lastInsertRowid;
        }
      }
    }

    const demoTotalBranchUnits = Object.keys(demoAllBranchDepts).length;
    const demoLabCount = Object.keys(demoAllBranchDepts).filter(k => k.includes("试验室")).length;

    for (const e of allEmployees) {
      dbRun(
        "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [2, demoDeptIds[e.dept], e.name, e.role, e.agent, e.type, e.skills, e.emoji, 2]
      );
    }

    // ===== 演示公司外派员工生成 =====
    let demoSEm = 0;

    // 分支经理 (人类, 20人)
    for (const [, bName, city] of branchDefs) {
      const n = surnames[(demoSEm) % surnames.length] + city.charAt(0) + "经理";
      dbRun(
        "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
        [demoAllBranchDepts[bName], n, "分支经理", null, "human", "团队管理,属地协调,进度把控,安全管理", "👔", 2]
      );
      demoSEm++;
    }

    // 分支AI核心人员 (每分支4人 = 80人)
    for (const [, bName, city] of branchDefs) {
      for (const r of branchAIRoles) {
        const n = surnames[demoSEm % surnames.length] + city.charAt(0) + r.role.charAt(0);
        dbRun(
          "INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
          [demoAllBranchDepts[bName], n, r.role, r.agent, "ai", r.skills, r.e, 2]
        );
        demoSEm++;
      }
    }

    // 项目级 (每项目1PM+2工程师)
    for (const depName of Object.keys(demoAllBranchDepts)) {
      if (!depName.includes("项目组")) continue;
      const n1 = surnames[demoSEm % surnames.length] + "项" + (demoSEm % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
        [demoAllBranchDepts[depName], n1, "项目经理", "product_manager", "ai", "项目管理,进度控制,风险管控,团队协调", "📋", 2]);
      demoSEm++;
      const n2 = surnames[demoSEm % surnames.length] + "工" + (demoSEm % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
        [demoAllBranchDepts[depName], n2, "现场工程师", "backend_dev", "ai", "施工技术,检测方案,现场管理", "🔧", 2]);
      demoSEm++;
      const n3 = surnames[demoSEm % surnames.length] + "质" + (demoSEm % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
        [demoAllBranchDepts[depName], n3, "质量工程师", "qa_engineer", "ai", "质量检测,材料试验,标准执行", "✅", 2]);
      demoSEm++;
    }

    // 试验室级 (每室1主任+2-3技术员)
    for (const depName of Object.keys(demoAllBranchDepts)) {
      if (!depName.includes("试验室")) continue;
      const n1 = surnames[demoSEm % surnames.length] + "室" + (demoSEm % 100);
      dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
        [demoAllBranchDepts[depName], n1, "试验室主任", "qa_engineer", "ai", "试验室管理,检测方案,报告审核", "🔬", 2]);
      demoSEm++;
      const techRoles = [
        { role: "检测技术员", skills: "材料试验,仪器操作,数据采集", e: "🧪", agent: "backend_dev" },
        { role: "检测技术员", skills: "现场检测,取样分析,记录编制", e: "⚗️", agent: "qa_engineer" },
        { role: "检测技术员", skills: "室内试验,养护管理,报告编制", e: "📊", agent: "data_engineer" },
      ];
      for (const t of techRoles) {
        const n = surnames[demoSEm % surnames.length] + "检" + (demoSEm % 100);
        dbRun("INSERT INTO employees (company_id, department_id, name, role, agent_type, employee_type, skills, avatar_emoji, tenant_id) VALUES (2,?,?,?,?,?,?,?,?)",
          [demoAllBranchDepts[depName], n, t.role, t.agent, "ai", t.skills, t.e, 2]);
        demoSEm++;
      }
    }

    console.log(`[种子] 演示公司集团架构: ${demoTotalBranchUnits}个分支组织单元 (含${fieldBranchCount}外派分支·${demoLabCount}试验室), ${demoSEm}名外派员工`);

    for (const s of skillsLibrary) {
      const slug = s.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/-+$/, '');
      dbRun(
        "INSERT INTO skills (tenant_id, company_id, name, slug, category, description, tags, icon, source, version, author, install_count, rating, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [2, 2, s.name, slug, s.cat, s.desc, s.tags, s.icon, "local", "1.0.0", "演示公司", Math.floor(Math.random() * 300) + 10, parseFloat((3.5 + Math.random() * 1.5).toFixed(1)), 1]
      );
    }

    for (const pl of positionLevels) {
      dbRun("INSERT INTO position_levels (code, name, sequence, level, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [pl.code, pl.name, pl.sequence, pl.level, 2]);
    }

    for (const t of tasks) {
      dbRun("INSERT INTO tasks (company_id, title, priority, status, assigned_to, tenant_id) VALUES (?, ?, ?, ?, ?, ?)",
        [2, t.title, t.priority, t.status, t.assignee, 2]);
    }

    dbRun("INSERT INTO chats (company_id, title, type, created_by, tenant_id) VALUES (?, ?, 'group', ?, ?)", [2, "演示公司团队群", 2, 2]);
    for (const m of ceoMessages) {
      dbRun("INSERT INTO messages (chat_id, sender_type, sender_name, content, tenant_id) VALUES (?, ?, ?, ?, ?)",
        [dbGet("SELECT MAX(id) as id FROM chats")?.id || 1, m.type, m.sender, m.content, 2]);
    }

    for (const r of performanceReviews) {
      dbRun(
        "INSERT INTO performance_reviews (tenant_id, employee_id, employee_type, review_period, overall_score, task_completion_score, quality_score, efficiency_score, collaboration_score, review_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')",
        [2, r.employee_id, r.type, r.period, r.overall, r.task, r.quality, r.efficiency, r.collab, r.notes]
      );
    }
    for (const m of perfMetrics) {
      dbRun(
        "INSERT INTO performance_metrics (tenant_id, employee_id, employee_type, metric_type, metric_value, metric_unit, period) VALUES (?, ?, 'ai', ?, ?, ?, ?)",
        [2, m.employee_id, m.type, m.value, m.unit, m.period]
      );
    }
    for (const hs of heartbeatSchedules) {
      dbRun(
        "INSERT INTO heartbeat_schedules (agent_id, task_type, cron_expression, enabled, next_run, tenant_id) VALUES (?, ?, ?, 1, datetime('now', '+1 minute'), ?)",
        [hs.agent_id, hs.task_type, hs.cron, 2]
      );
    }
    for (const n of notes) {
      dbRun("INSERT INTO knowledge_notes (title, content, tags, tenant_id) VALUES (?, ?, ?, ?)", [n.title, n.content, n.tags, 2]);
    }

    // 人才市场种子数据（从agent模板+技能库生成）
    seedTalentPool(1);
    seedTalentPool(2);

    // 插件中心种子数据
    seedPlugins(1);
    seedPlugins(2);

    const totalHqEmps = allEmployees.length; // 71 HQ employees
    const totalAllEmps = totalHqEmps * 2 + sIdx + demoSEm;
    const totalAllAI = centerStaff.length * 2 + (sIdx - fieldBranchCount) + (demoSEm - fieldBranchCount);
    const tenant1Depts = 17 + totalBranchUnits;
    const tenant2Depts = 17 + demoTotalBranchUnits;
    console.log(`[种子] 完成：3用户, ${totalAllEmps}员工(AI ${totalAllAI}+人类 ${totalAllEmps - totalAllAI}), ${tenant1Depts}+${tenant2Depts}部门(含${fieldBranchCount * 2}外派分支·${labCount2 + demoLabCount}试验室), ${skillsLibrary.length * 2}技能`);
  }

  migrateDatabase();
}

// 人才市场种子数据生成
function seedTalentPool(tenantId: number) {
  // AI智能体 — 从agent模板生成
  const aiTalents: { name: string; emoji: string; agent_type: string; role: string; desc: string; skills: string; category: string; cost: string; rank: number }[] = [
    { name: "AI-战略顾问", emoji: "🎯", agent_type: "strategy_advisor", role: "战略顾问", desc: "企业战略规划、行业趋势分析、竞争格局研判", skills: "战略规划,行业研究,竞争分析,商业模式", category: "战略管理", cost: "¥0.08", rank: 1 },
    { name: "AI-财务分析师", emoji: "💰", agent_type: "financial_analyst", role: "财务分析师", desc: "财务报表分析、预算编制、成本优化、投资评估", skills: "财务分析,预算管理,成本控制,投资评估", category: "财务管理", cost: "¥0.06", rank: 2 },
    { name: "AI-市场营销专家", emoji: "📊", agent_type: "marketing_specialist", role: "市场营销专家", desc: "市场策略制定、品牌推广、用户增长、数据分析", skills: "市场策略,品牌推广,数据分析,用户增长", category: "市场营销", cost: "¥0.07", rank: 2 },
    { name: "AI-人力资源顾问", emoji: "👥", agent_type: "hr_consultant", role: "人力资源顾问", desc: "人才招聘、绩效设计、组织发展、文化建设", skills: "人才招聘,绩效管理,组织发展,文化建设", category: "人力资源", cost: "¥0.05", rank: 2 },
    { name: "AI-法务合规官", emoji: "⚖️", agent_type: "compliance_officer", role: "法务合规官", desc: "合同审查、合规检查、风险评估、知识产权", skills: "合同审查,合规检查,风险评估,知识产权", category: "法务合规", cost: "¥0.09", rank: 2 },
    { name: "AI-数据分析师", emoji: "📈", agent_type: "data_analyst", role: "数据分析师", desc: "数据可视化、BI报表、业务洞察、预测分析", skills: "BI报表,数据可视化,SQL,业务分析", category: "数据科学", cost: "¥0.06", rank: 3 },
    { name: "AI-ML工程师", emoji: "🧠", agent_type: "ml_engineer", role: "ML工程师", desc: "机器学习模型训练、特征工程、模型部署", skills: "机器学习,深度学习,Python,模型部署", category: "AI研发", cost: "¥0.12", rank: 3 },
    { name: "AI-DevOps工程师", emoji: "🔄", agent_type: "devops_engineer", role: "DevOps工程师", desc: "CI/CD流水线、容器化部署、监控告警、自动化运维", skills: "Docker,Kubernetes,CI/CD,监控告警", category: "技术研发", cost: "¥0.10", rank: 4 },
    { name: "AI-安全工程师", emoji: "🔐", agent_type: "security_engineer", role: "安全工程师", desc: "渗透测试、安全审计、漏洞修复、安全架构", skills: "安全审计,渗透测试,漏洞扫描,安全架构", category: "技术研发", cost: "¥0.11", rank: 4 },
    { name: "AI-UI设计师", emoji: "🎨", agent_type: "ui_designer", role: "UI设计师", desc: "用户界面设计、交互原型、设计系统、品牌视觉", skills: "UI设计,交互设计,Figma,设计系统", category: "设计创意", cost: "¥0.07", rank: 4 },
    { name: "AI-内容创作师", emoji: "✍️", agent_type: "content_creator", role: "内容创作师", desc: "文案写作、内容策划、品牌故事、多媒体内容", skills: "文案写作,内容策划,品牌传播,视频脚本", category: "内容创意", cost: "¥0.05", rank: 4 },
    { name: "AI-客户服务专员", emoji: "🎧", agent_type: "cs_specialist", role: "客户服务专员", desc: "客户咨询、问题处理、满意度回访、知识库维护", skills: "客户沟通,问题处理,满意度回访,知识管理", category: "客户服务", cost: "¥0.03", rank: 5 },
    { name: "AI-项目经理", emoji: "📋", agent_type: "project_manager", role: "项目经理", desc: "项目规划、进度跟踪、资源协调、风险管控", skills: "项目管理,进度控制,资源协调,风险管控", category: "项目管理", cost: "¥0.08", rank: 3 },
    { name: "日报周报月报智能助手", emoji: "📝", agent_type: "report_assistant", role: "汇报智能助手", desc: "自动整理工作日报、汇总团队周报、生成经营月报，提炼进展、问题、风险和下阶段计划", skills: "日报撰写,周报汇总,月报分析,进度跟踪,问题提炼", category: "办公协作", cost: "¥0.03", rank: 2 },
    { name: "AI-培训师", emoji: "🎓", agent_type: "trainer", role: "培训师", desc: "课程设计、员工培训、知识转移、能力评估", skills: "培训开发,课程设计,知识转移,能力评估", category: "人力资源", cost: "¥0.04", rank: 4 },
    { name: "AI-供应链优化师", emoji: "📦", agent_type: "supply_chain", role: "供应链优化师", desc: "供应链分析、库存优化、物流规划、采购策略", skills: "供应链管理,库存优化,物流规划,采购策略", category: "运营管理", cost: "¥0.07", rank: 3 },
  ];

  for (const t of aiTalents) {
    dbRun(
      `INSERT INTO talent_pool (tenant_id, talent_type, name, avatar_emoji, skills, category, description, agent_type, capabilities, token_cost_per_k, provider, integration_type, rating, source, status)
       VALUES (?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?, '雄元AI市场', 'api', ?, 'system', 'available')`,
      [tenantId, t.name, t.emoji, t.skills, t.category, t.desc, t.agent_type, t.desc, t.cost, 3.5 + Math.random() * 1.5]
    );
  }

  // 人类人才 — 模拟行业人才库
  const humanTalents = [
    { name: "王明远", emoji: "👨‍💼", skills: "战略规划,团队管理,商业谈判,P&L管理", category: "高级管理", exp: 15, salary: "50-80K/月", availability: "1个月内" },
    { name: "刘思涵", emoji: "👩‍💻", skills: "React,TypeScript,Node.js,系统架构", category: "技术研发", exp: 8, salary: "35-50K/月", availability: "2周内" },
    { name: "陈大伟", emoji: "👨‍🔬", skills: "机器学习,深度学习,NLP,Python", category: "AI研发", exp: 6, salary: "40-60K/月", availability: "随时" },
    { name: "张雪琳", emoji: "👩‍🎨", skills: "UI设计,UX研究,Figma,设计系统", category: "设计创意", exp: 5, salary: "25-35K/月", availability: "随时" },
    { name: "赵建国", emoji: "👨‍💼", skills: "财务分析,预算管控,税务筹划,IPO经验", category: "财务管理", exp: 20, salary: "60-100K/月", availability: "3个月内" },
    { name: "林小红", emoji: "👩‍🏫", skills: "人才招聘,组织发展,绩效体系,企业文化", category: "人力资源", exp: 10, salary: "30-45K/月", availability: "1个月内" },
    { name: "黄志强", emoji: "👨‍🔧", skills: "DevOps,K8s,CI/CD,云原生架构", category: "技术研发", exp: 7, salary: "35-50K/月", availability: "2周内" },
    { name: "周美玲", emoji: "👩‍💼", skills: "品牌营销,社交媒体,内容策略,增长黑客", category: "市场营销", exp: 6, salary: "25-40K/月", availability: "随时" },
    { name: "吴国栋", emoji: "👨‍⚖️", skills: "合同审查,知识产权,公司法,诉讼经验", category: "法务合规", exp: 12, salary: "40-60K/月", availability: "1个月内" },
    { name: "郑晓芳", emoji: "👩‍📊", skills: "数据分析,BI,SQL,Tableau,业务洞察", category: "数据科学", exp: 4, salary: "20-30K/月", availability: "随时" },
  ];

  for (const t of humanTalents) {
    dbRun(
      `INSERT INTO talent_pool (tenant_id, talent_type, name, avatar_emoji, skills, category, description, experience_years, expected_salary, availability, rating, source, status)
       VALUES (?, 'human', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', 'available')`,
      [tenantId, t.name, t.emoji, t.skills, t.category, `${t.name} · ${t.exp}年经验 · ${t.category}`, t.exp, t.salary, t.availability, 3.5 + Math.random() * 1.5]
    );
  }
}

// 插件中心种子数据
function seedPlugins(tenantId: number) {
  const plugins = [
    { name: "飞书集成", cat: "办公协作", desc: "飞书开放平台API集成，支持消息推送、审批流、日历同步", icon: "🐦", author: "雄元科技", version: "2.1.0", price: "免费", tags: "飞书,集成,消息,审批" },
    { name: "企业微信集成", cat: "办公协作", desc: "企业微信API集成，支持通讯录同步、消息通知、应用消息", icon: "💬", author: "雄元科技", version: "1.8.0", price: "免费", tags: "企微,集成,通讯录" },
    { name: "钉钉集成", cat: "办公协作", desc: "钉钉开放平台集成，支持群机器人、工作通知、OA审批", icon: "📌", author: "第三方", version: "1.5.0", price: "¥299/月", tags: "钉钉,集成,OA" },
    { name: "微信支付", cat: "支付金融", desc: "微信支付API V3集成，支持JSAPI/Native/H5/APP全场景支付", icon: "💚", author: "雄元科技", version: "3.0.0", price: "免费", tags: "支付,微信,收款" },
    { name: "支付宝支付", cat: "支付金融", desc: "支付宝开放平台集成，支持电脑/手机/当面付", icon: "🔵", author: "雄元科技", version: "2.2.0", price: "免费", tags: "支付,支付宝" },
    { name: "银联支付", cat: "支付金融", desc: "银联在线支付网关集成，支持B2B/B2C/C2C", icon: "💳", author: "第三方", version: "1.3.0", price: "¥999/月", tags: "支付,银联" },
    { name: "腾讯云短信", cat: "通信服务", desc: "腾讯云短信API集成，支持验证码、通知、营销短信", icon: "📱", author: "雄元科技", version: "1.6.0", price: "按量计费", tags: "短信,验证码,通知" },
    { name: "阿里云OSS", cat: "存储服务", desc: "阿里云对象存储OSS集成，支持文件上传/下载/CDN加速", icon: "☁️", author: "雄元科技", version: "2.0.0", price: "按量计费", tags: "存储,OSS,CDN" },
    { name: "七牛云存储", cat: "存储服务", desc: "七牛云Kodo对象存储集成，图片处理/音视频转码", icon: "🐂", author: "第三方", version: "1.9.0", price: "按量计费", tags: "存储,CDN,图片处理" },
    { name: "百度地图", cat: "地图位置", desc: "百度地图API集成，支持地理编码/逆地理编码/路径规划", icon: "🗺️", author: "第三方", version: "2.4.0", price: "免费额度", tags: "地图,定位,导航" },
    { name: "高德地图", cat: "地图位置", desc: "高德地图Web服务API，支持POI搜索/地理围栏/轨迹纠偏", icon: "📍", author: "雄元科技", version: "2.6.0", price: "免费额度", tags: "地图,定位,搜索" },
    { name: "快递100", cat: "物流配送", desc: "快递100 API集成，支持快递查询/电子面单/物流推送", icon: "📦", author: "第三方", version: "1.4.0", price: "¥99/月", tags: "快递,物流,查询" },
    { name: "电子签章", cat: "法务合规", desc: "e签宝/法大大电子签章集成，支持合同签署/存证/区块链", icon: "✍️", author: "第三方", version: "1.2.0", price: "¥299/月", tags: "签章,合同,法务" },
    { name: "增值税发票", cat: "财务税务", desc: "电子发票开具与查验，支持数电票/增值税专票/普票", icon: "🧾", author: "雄元科技", version: "2.0.0", price: "¥199/月", tags: "发票,税务,财务" },
    { name: "金蝶ERP", cat: "财务税务", desc: "金蝶云星空ERP集成，支持凭证/科目/报表同步", icon: "📊", author: "第三方", version: "1.7.0", price: "¥499/月", tags: "ERP,金蝶,财务" },
    { name: "用友ERP", cat: "财务税务", desc: "用友U8/T+ ERP集成，支持采购/销售/库存/财务", icon: "🏢", author: "第三方", version: "1.5.0", price: "¥499/月", tags: "ERP,用友" },
    { name: "抖音开放平台", cat: "营销获客", desc: "抖音小程序/直播间/商品橱窗API集成", icon: "🎵", author: "雄元科技", version: "1.3.0", price: "免费", tags: "抖音,直播,电商" },
    { name: "小红书开放平台", cat: "营销获客", desc: "小红书商家/内容API集成，笔记管理/商品同步", icon: "📕", author: "第三方", version: "1.0.0", price: "¥199/月", tags: "小红书,内容,电商" },
    { name: "百度AI开放平台", cat: "AI能力", desc: "百度AI文字识别/语音合成/NLP/图像识别API集成", icon: "🧠", author: "雄元科技", version: "2.3.0", price: "按量计费", tags: "AI,OCR,NLP,语音" },
    { name: "讯飞语音", cat: "AI能力", desc: "科大讯飞语音识别/合成/翻译API集成", icon: "🎤", author: "第三方", version: "1.8.0", price: "按量计费", tags: "语音,识别,翻译" },
    { name: "HubSpot CRM", cat: "客户管理", desc: "HubSpot CRM集成，客户/联系人/交易同步", icon: "🟠", author: "第三方", version: "1.2.0", price: "免费", tags: "CRM,客户,营销" },
    { name: "飞书多维表格", cat: "办公协作", desc: "飞书多维表格API，支持数据读写/字段管理/视图操作", icon: "📋", author: "雄元科技", version: "1.4.0", price: "免费", tags: "飞书,表格,数据" },
    { name: "Grafana监控", cat: "运维监控", desc: "Grafana仪表板集成，支持数据源配置/面板嵌入/告警", icon: "📈", author: "第三方", version: "1.1.0", price: "免费", tags: "监控,仪表板,告警" },
    { name: "Jira项目管理", cat: "研发工具", desc: "Atlassian Jira集成，Issue同步/Sprint管理/Webhook", icon: "🎫", author: "第三方", version: "1.6.0", price: "¥199/月", tags: "Jira,项目管理,敏捷" },
    { name: "GitLab代码仓库", cat: "研发工具", desc: "GitLab API集成，仓库管理/MR Webhook/CI触发", icon: "🦊", author: "雄元科技", version: "2.0.0", price: "免费", tags: "GitLab,代码,CI" },
    { name: "Webhook推送", cat: "通信服务", desc: "通用Webhook集成，支持自定义URL/请求模板/重试机制", icon: "🔔", author: "雄元科技", version: "1.0.0", price: "免费", tags: "Webhook,通知,集成" },
    { name: "AI合同智能解析", cat: "法务合规", desc: "上传PDF/DOCX合同文档，AI自动提取合同信息与收/付款节点，一键入库", icon: "🤖", author: "雄元科技", version: "1.0.0", price: "¥99/月", tags: "AI,合同,解析,文档" },
  ];

  for (const p of plugins) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/-+$/, '');
    dbRun(
      `INSERT INTO plugins (tenant_id, name, slug, category, description, icon, version, author, price, tags, install_count, rating, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [tenantId, p.name, slug, p.cat, p.desc, p.icon, p.version, p.author, p.price, p.tags, Math.floor(Math.random() * 500) + 50, parseFloat((3.0 + Math.random() * 2.0).toFixed(1))]
    );
  }
}

function migrateDatabase() {
  console.log("[迁移] 检查数据库版本...");

  const adminHash = bcrypt.hashSync("q1w2e3r4t5", 10);
  const existingSuperAdmin = dbGet("SELECT id, role FROM users WHERE email = ?", ["mbazone@qq.com"]) as any;
  if (!existingSuperAdmin) {
    dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      ["mbazone@qq.com", adminHash, "超级管理员", "super_admin", 1]);
    console.log("[迁移] 已添加超级管理员 mbazone@qq.com");
  } else {
    dbRun("UPDATE users SET role = 'super_admin', password_hash = ? WHERE email = ?", [adminHash, "mbazone@qq.com"]);
    console.log("[迁移] 超级管理员密码已更新");
  }

  const demoUser = dbGet("SELECT id, role FROM users WHERE email = ?", ["demo@demo.com"]) as any;
  if (demoUser && demoUser.role === "super_admin") {
    dbRun("UPDATE users SET role = 'admin' WHERE email = ?", ["demo@demo.com"]);
    console.log("[迁移] demo@demo.com 已降级为 admin");
  }

  // Ensure ordinary demo user exists, same tenant as demo@demo.com
  const userHash = bcrypt.hashSync("user123", 10);
  const existingOrdinaryUser = dbGet("SELECT id FROM users WHERE email = ?", ["user@demo.com"]) as any;
  if (!existingOrdinaryUser) {
    // Place user@demo.com in the same tenant as demo@demo.com
    const demoTenant = (dbGet("SELECT tenant_id FROM users WHERE email = ?", ["demo@demo.com"]) as any)?.tenant_id || 2;
    dbRun("INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, ?, ?)",
      ["user@demo.com", userHash, "李员工", "user", demoTenant]);
    console.log(`[迁移] 已添加演示普通用户 user@demo.com (tenant#${demoTenant})`);
  }

  const existingConfig = dbGet("SELECT COUNT(*) as c FROM ai_config") as any;
  if (existingConfig.c === 0) {
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["llm_provider", "deepseek", "用户自选大模型供应商", 1]);
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["llm_api_key", "", "用户自有大模型 API Key（安装包不预置开发者密钥）", 1]);
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["llm_api_base", "https://api.deepseek.com/v1", "用户自有模型 API 地址", 1]);
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["llm_model", "deepseek-chat", "用户自有模型名称", 1]);
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["ai_reply_enabled", "true", "是否启用AI自动回复", 1]);
    dbRun("INSERT INTO ai_config (key, value, description, tenant_id) VALUES (?, ?, ?, ?)", ["ai_reply_delay", "2000", "AI回复延迟(毫秒)", 1]);
    console.log("[迁移] AI配置已初始化");
  }

  // 知识库存储限额（演示公司1GB，雄元科技5GB）
  const storageLimit1 = dbGet("SELECT id FROM company_settings WHERE setting_key = 'knowledge_storage_limit_kb' AND tenant_id = 1") as any;
  if (!storageLimit1) {
    dbRun("INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id) VALUES (1, 'knowledge_storage_limit_kb', '5242880', 1)");
  }
  const storageLimit2 = dbGet("SELECT id FROM company_settings WHERE setting_key = 'knowledge_storage_limit_kb' AND tenant_id = 2") as any;
  if (!storageLimit2) {
    const t2 = dbGet("SELECT id FROM tenants WHERE id = 2") as any;
    if (t2) dbRun("INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id) VALUES (2, 'knowledge_storage_limit_kb', '1048576', 2)");
  }

  // 网站名称（支持租户自定义）
  const siteName1 = dbGet("SELECT id FROM company_settings WHERE setting_key = 'site_name' AND tenant_id = 1") as any;
  if (!siteName1) {
    dbRun("INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id) VALUES (1, 'site_name', '雄元智脑XYOS', 1)");
  }
  const siteName2 = dbGet("SELECT id FROM company_settings WHERE setting_key = 'site_name' AND tenant_id = 2") as any;
  if (!siteName2) {
    const t2 = dbGet("SELECT id FROM tenants WHERE id = 2") as any;
    if (t2) dbRun("INSERT INTO company_settings (company_id, setting_key, setting_value, tenant_id) VALUES (2, 'site_name', '演示公司', 2)");
  }

  // 合同管理模块种子数据（科研机构业务场景）
  const contractCount = dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [1]) as any;
  if (contractCount.c === 0) { seedContracts(1); }
  // 付款计划独立补建：即使合同已存在也要检查是否缺少付款计划
  seedContractPayments(1);

  const contractCount2 = dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [2]) as any;
  if (contractCount2.c === 0) { seedContracts(2); }
  seedContractPayments(2);

  // 资产种子数据——安全守卫：表不存在则跳过
  try {
    const assetsTableExists = dbGet("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='assets'") as any;
    if (assetsTableExists?.c > 0) {
      const assetCount1 = dbGet("SELECT COUNT(*) as c FROM assets WHERE tenant_id = ?", [1]) as any;
      if (assetCount1.c === 0) { seedAssets(1); }
      const assetCount2 = dbGet("SELECT COUNT(*) as c FROM assets WHERE tenant_id = ?", [2]) as any;
      if (assetCount2.c === 0) { seedAssets(2); }
    }
  } catch (err: any) {
    console.error("[种子] 资产种子失败(非致命):", err.message);
  }

  // 修复旧试验室（A-F标段）：补齐 org_type 和 function_type（两个租户）
  const fixedOldLabs = dbRun("UPDATE departments SET org_type='site_lab', function_type='site_lab' WHERE name LIKE '%标段试验室' AND (org_type IS NULL OR org_type='functional')");
  if (fixedOldLabs.changes > 0) {
    console.log(`[迁移] 已修复 ${fixedOldLabs.changes} 个旧试验室的 org_type/function_type`);
  }

  console.log("[迁移] 完成");
}

// 合同种子：以科研中心及其关联企业为背景的业务合同
function seedContracts(tenantId: number) {
  const isT1 = tenantId === 1;

  const contracts: {
    title: string; contract_no: string; party_a: string; party_b: string;
    direction: string; amount: number; status: string; start_date: string | null; end_date: string | null;
    contract_type: string; sign_date: string | null; signer: string | null; key_terms?: string; patent?: boolean;
  }[] = isT1 ? [
    // === 收入类合同（outbound / receivable）===
    {
      title: "城市道路沥青路面长期性能监测技术研究",
      contract_no: "KY-HT-2026-001", party_a: "交通科学研究院",
      party_b: "省交通运输厅科技处", direction: "outbound", amount: 680000,
      status: "active", start_date: "2026-01-15", end_date: "2027-12-31",
      contract_type: "service", sign_date: "2026-01-10", signer: "赵产",
      key_terms: "按季度提交监测报告，年度总报告于12月底前完成"
    },
    {
      title: "山区高速公路边坡稳定性智能预警系统开发",
      contract_no: "HT-KF-2026-002", party_a: "智能交通工程技术有限公司",
      party_b: "高速集团建设管理有限公司", direction: "outbound", amount: 1250000,
      status: "active", start_date: "2026-03-01", end_date: "2027-02-28",
      contract_type: "service", sign_date: "2026-02-20", signer: "林技",
      key_terms: "分三期交付，首期30%预付款到账后启动"
    },
    {
      title: "桥梁结构健康监测设备采购与安装服务",
      contract_no: "SB-CG-2026-003", party_a: "工程检测技术有限公司",
      party_b: "市市政桥梁管理处", direction: "outbound", amount: 420000,
      status: "active", start_date: "2026-04-01", end_date: "2026-10-31",
      contract_type: "service", sign_date: "2026-03-25", signer: "吴运",
      key_terms: "含传感器采购、安装、调试及一年质保期运维"
    },
    {
      title: "公路工程材料力学性能检测年度委托合同",
      contract_no: "JC-DW-2026-004", party_a: "工程检测技术有限公司",
      party_b: "市交通建设工程质量监督站", direction: "outbound", amount: 360000,
      status: "active", start_date: "2026-01-01", end_date: "2026-12-31",
      contract_type: "service", sign_date: "2025-12-28", signer: "褚财",
      key_terms: "每月抽样检测不少于50组，出具正式检测报告"
    },
    {
      title: "智慧工地综合管理平台定制开发项目",
      contract_no: "RJ-KF-2026-005", party_a: "信息科技有限公司",
      party_b: "中建八局第三建筑工程有限公司", direction: "outbound", amount: 890000,
      status: "in_progress", start_date: "2026-05-06", end_date: "2026-11-30",
      contract_type: "service", sign_date: "2026-04-28", signer: "钱技",
      key_terms: "敏捷开发模式，按月迭代交付，验收后提供1年免费维保"
    },
    {
      title: "交通运输行业碳排放核算方法学研究",
      contract_no: "KY-HT-2026-006", party_a: "交通科学研究院",
      party_b: "国家发改委能源研究所", direction: "outbound", amount: 350000,
      status: "pending", start_date: "2026-07-01", end_date: "2027-06-30",
      contract_type: "service", sign_date: null, signer: "李知",
      key_terms: "课题研究成果归双方共有，论文发表需共同署名"
    },
    // === 支出类合同（inbound / payable）===
    {
      title: "高性能计算服务器集群采购",
      contract_no: "CG-SB-2026-007", party_a: "联想（北京）信息技术有限公司",
      party_b: "交通科学研究院", direction: "inbound", amount: 520000,
      status: "active", start_date: "2026-02-15", end_date: null,
      contract_type: "procurement", sign_date: "2026-02-08", signer: "陈远",
      key_terms: "三年原厂上门保修，7×24小时技术响应"
    },
    {
      title: "实验检测仪器设备年度校准服务",
      contract_no: "CG-FW-2026-008", party_a: "省计量科学研究院",
      party_b: "工程检测技术有限公司", direction: "inbound", amount: 85000,
      status: "completed", start_date: "2026-01-01", end_date: "2026-03-31",
      contract_type: "procurement", sign_date: "2025-12-20", signer: "褚财",
      key_terms: "现场校准，出具CNAS认可校准证书"
    },
    {
      title: "办公场地租赁协议（主楼B座）",
      contract_no: "ZL-2026-009", party_a: "高新科技园物业管理有限公司",
      party_b: "信息科技有限公司", direction: "inbound", amount: 480000,
      status: "active", start_date: "2026-01-01", end_date: "2027-12-31",
      contract_type: "other", sign_date: "2025-12-15", signer: "刘运",
      key_terms: "年付，含物业费、中央空调费，停车位另计"
    },
    {
      title: "专利独占许可——路面裂缝自动识别算法",
      patent: true as const,
      contract_no: "IP-2026-010", party_a: "某高校自动化学院",
      party_b: "智能交通工程技术有限公司", direction: "inbound", amount: 200000,
      status: "pending", start_date: "2026-09-01", end_date: null,
      contract_type: "other", sign_date: null, signer: "李交",
      key_terms: "五年独占使用权，后续改进成果归属受让方"
    },
  ] : [
    // tenant#2 演示用简化版
    {
      title: "企业数字化转型咨询服务合同",
      contract_no: "FW-2026-101", party_a: "雄元科技有限公司",
      party_b: "某制造集团有限公司", direction: "outbound", amount: 500000,
      status: "active", start_date: "2026-02-01", end_date: "2026-08-31",
      contract_type: "service", sign_date: "2026-01-20", signer: "张总",
    },
    {
      title: "云服务器资源年度采购",
      contract_no: "CG-2026-102", party_a: "阿里云计算有限公司",
      party_b: "雄元科技有限公司", direction: "inbound", amount: 120000,
      status: "active", start_date: "2026-01-01", end_date: "2026-12-31",
      contract_type: "procurement", sign_date: "2025-12-15", signer: "张总",
    },
    {
      title: "AI员工协作平台SaaS订阅服务",
      contract_no: "FW-2026-103", party_a: "雄元科技有限公司",
      party_b: "某创业孵化器有限公司", direction: "outbound", amount: 299000,
      status: "draft", start_date: null, end_date: null,
      contract_type: "service", sign_date: null, signer: null,
    },
  ];

  for (const c of contracts) {
    dbRun(
      `INSERT INTO contracts
       (tenant_id, title, contract_no, party_a, party_b, direction, amount, status,
        start_date, end_date, contract_type, sign_date, key_terms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, c.title, c.contract_no, c.party_a, c.party_b,
       c.direction, c.amount, c.status, c.start_date, c.end_date,
       c.contract_type, c.sign_date, c.key_terms || null]
    );
  }

  // === 付款计划已提取到独立函数 seedContractPayments() ===
}

// 合同付款计划种子数据——独立函数，可重复执行补建
function seedContractPayments(tenantId: number) {
  const isT1 = tenantId === 1;

  // 检查是否已有足够多的付款计划，避免重复插入
  const existing = dbGet("SELECT COUNT(*) as c FROM contract_payments WHERE tenant_id = ?", [tenantId]) as any;
  if (existing.c > 10) { console.log(`[种子] tenant#${tenantId} 付款计划已存在 (${existing.c}条)，跳过`); return; }

  const paymentPlans: Record<string, { label: string; amount: number; due_date: string; paid?: number; paid_date?: string }[]> = isT1 ? {
    "KY-HT-2026-001": [
      { label: "首期拨款（启动经费）", amount: 272000, due_date: "2026-02-15", paid: 1, paid_date: "2026-02-18" },
      { label: "二期拨款（中期检查通过后）", amount: 204000, due_date: "2026-07-31", paid: 1, paid_date: "2026-08-05" },
      { label: "三期拨款（结题验收后）", amount: 204000, due_date: "2026-06-25" },           // ⚠️ 已逾期1天！
    ],
    "HT-KF-2026-002": [
      { label: "预付款（合同签订后）", amount: 375000, due_date: "2026-03-10", paid: 1, paid_date: "2026-03-15" },
      { label: "开发中期款（原型交付）", amount: 437500, due_date: "2026-08-31", paid: 1, paid_date: "2026-09-02" },
      { label: "验收款（系统上线运行）", amount: 437500, due_date: "2027-01-31" },
    ],
    "SB-CG-2026-003": [
      { label: "设备到货款", amount: 210000, due_date: "2026-05-15", paid: 1, paid_date: "2026-05-20" },
      { label: "安装调试款", amount: 126000, due_date: "2026-06-28" },                   // ⚠️ 2天后到期！
      { label: "质保金（一年后）", amount: 84000, due_date: "2027-06-01" },
    ],
    "JC-DW-2026-004": [
      { label: "Q1检测费", amount: 90000, due_date: "2026-04-01", paid: 1, paid_date: "2026-04-10" },
      { label: "Q2检测费", amount: 90000, due_date: "2026-07-01", paid: 1, paid_date: "2026-07-08" },
      { label: "Q3检测费", amount: 90000, due_date: "2026-07-02" },                        // ⚠️ 6天后到期！
      { label: "Q4检测费", amount: 90000, due_date: "2027-01-01" },
    ],
    "RJ-KF-2026-005": [
      { label: "启动款（项目立项）", amount: 178000, due_date: "2026-05-15", paid: 1, paid_date: "2026-05-20" },
      { label: "迭代一期款（M1-M3交付）", amount: 267000, due_date: "2026-06-30" },        // ⚠️ 4天后到期！
      { label: "迭代二期款（M4-M6交付）", amount: 267000, due_date: "2026-10-31" },
      { label: "最终验收款", amount: 178000, due_date: "2026-12-15" },
    ],
    "CG-SB-2026-007": [
      { label: "设备到货款", amount: 364000, due_date: "2026-03-15", paid: 1, paid_date: "2026-03-20" },
      { label: "验收尾款", amount: 156000, due_date: "2026-04-30", paid: 1, paid_date: "2026-05-05" },
    ],
    "CG-FW-2026-008": [
      { label: "年度校准费（全额）", amount: 85000, due_date: "2026-03-31", paid: 1, paid_date: "2026-03-28" },
    ],
    "ZL-2026-009": [
      { label: "Q1租金", amount: 120000, due_date: "2026-01-05", paid: 1, paid_date: "2026-01-08" },
      { label: "Q2租金", amount: 120000, due_date: "2026-04-05", paid: 1, paid_date: "2026-04-08" },
      { label: "Q3租金", amount: 120000, due_date: "2026-07-05", paid: 1, paid_date: "2026-07-08" },
      { label: "Q4租金", amount: 120000, due_date: "2026-07-03" },                        // ⚠️ 7天后到期！
    ],
  } : {
    "FW-2026-101": [
      { label: "咨询启动费", amount: 150000, due_date: "2026-03-01", paid: 1, paid_date: "2026-03-05" },
      { label: "中期服务费", amount: 200000, due_date: "2026-06-30", paid: 1, paid_date: "2026-07-02" },
      { label: "结项服务费", amount: 150000, due_date: "2026-06-24" },                       // ⚠️ 已逾期2天！
    ],
    "CG-2026-102": [
      { label: "H1云资源费", amount: 60000, due_date: "2026-06-30", paid: 1, paid_date: "2026-07-01" },
      { label: "H2云资源费", amount: 60000, due_date: "2026-12-31" },
    ],
  };

  let totalPayments = 0;
  for (const [contractNo, payments] of Object.entries(paymentPlans)) {
    const contract = dbGet("SELECT id FROM contracts WHERE contract_no = ? AND tenant_id = ?", [contractNo, tenantId]) as any;
    if (!contract) continue;
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      dbRun(
        `INSERT INTO contract_payments
         (tenant_id, contract_id, payment_no, label, amount, paid, paid_date, due_date, completion_condition)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, contract.id, i + 1, p.label, p.amount, p.paid || 0, p.paid_date || null, p.due_date,
         (p.paid || 0) === 1 ? "已完成结算" : null]
      );
      totalPayments++;
    }
  }

  console.log(`[种子] tenant#${tenantId} 付款计划已补建 (${totalPayments}条)`);
}

// ===== 资产模块种子数据 =====
function seedAssets(tenantId: number) {
  const isT1 = tenantId === 1;
  console.log(`[种子] tenant#${tenantId} 资产种子开始...`);

  // 辅助函数
  const deptNameToId = (name: string) => {
    const r = dbGet("SELECT id FROM departments WHERE name = ? AND tenant_id = ?", [name, tenantId]) as any;
    return r?.id || null;
  };
  const getEmployeeId = (name: string) => {
    const r = dbGet("SELECT id FROM employees WHERE name = ? AND tenant_id = ?", [name, tenantId]) as any;
    return r?.id || null;
  };

  // 为租户添加项目标段部门（驻外监理机构）
  const dmCenter = deptNameToId("交付管理中心");
  if (dmCenter) {
    const siteDepts = ["A标段试验室", "B标段试验室", "C标段试验室", "D标段试验室", "E标段试验室", "F标段试验室"];
    for (const name of siteDepts) {
      const exists = dbGet("SELECT id FROM departments WHERE name = ? AND tenant_id = ?", [name, tenantId]) as any;
      if (!exists) {
        dbRun("INSERT INTO departments (company_id, name, parent_id, sort_order, description, tenant_id, org_type, function_type) VALUES (1, ?, ?, 99, ?, ?, 'site_lab', 'site_lab')",
          [name, dmCenter, `${name} — 驻外监理检测`, tenantId]);
        console.log(`[种子] tenant#${tenantId} 创建部门: ${name}`);
      }
    }
  }

  const hqOffice = deptNameToId("行政中心");
  const techCenter = deptNameToId("技术保障中心");
  const productCenter = deptNameToId("产品研发中心");
  const siteA = deptNameToId("A标段试验室");
  const siteB = deptNameToId("B标段试验室");
  const siteC = deptNameToId("C标段试验室");
  const siteD = deptNameToId("D标段试验室");
  const siteE = deptNameToId("E标段试验室");
  const siteF = deptNameToId("F标段试验室");
  const bizCenter = deptNameToId("商务中心");
  const opsCenter = deptNameToId("运营中心");
  const qmCenter = deptNameToId("质量管理与战略中心");
  const fengXing = getEmployeeId("冯行");
  const chuCai = getEmployeeId("褚财");
  const qianJi = getEmployeeId("钱技");
  const liJiao = getEmployeeId("李交");
  const zhouQian = getEmployeeId("周前");
  const wuHou = getEmployeeId("吴后");
  const zhouShang = getEmployeeId("周商");
  const wuYun = getEmployeeId("吴运");
  const weiZhi = getEmployeeId("卫质");
  const sunShu = getEmployeeId("孙数");

  const allAssets: { assetNo: string; name: string; category: string; subCat?: string; model?: string; sn?: string; mfr?: string; date?: string; price: number; dept: number | null; custodian: number | null; loc?: string; status: string; calDate?: string; calCycle?: number; calNext?: string; plate?: string; vin?: string; bp?: string; seats?: number; nextInsp?: string; insuranceExp?: string; mileage?: number; os?: string; cpu?: string; ram?: string; disk?: string }[] = [
    { assetNo: "INS-2026-001", name: "数显回弹仪", category: "INSTRUMENT", subCat: "强度检测", model: "HT-225D", sn: "SN225D-20260108", mfr: "北京智博联", date: "2026-01-08", price: 12800, dept: siteA, custodian: liJiao, loc: "A标段试验室1号工位", status: "in_use", calDate: "2026-05-08", calCycle: 6, calNext: "2026-11-08" },
    { assetNo: "INS-2026-002", name: "全自动压力试验机", category: "INSTRUMENT", subCat: "力学检测", model: "YAW-3000", sn: "YAW3000-20250512", mfr: "济南试金", date: "2025-05-12", price: 168000, dept: siteA, custodian: liJiao, loc: "A标段试验室力学室", status: "in_use", calDate: "2025-11-12", calCycle: 12, calNext: "2026-04-12" },
    { assetNo: "INS-2026-003", name: "激光断面仪", category: "INSTRUMENT", subCat: "路面检测", model: "LR-200", sn: "LR200-20260315", mfr: "武汉夕睿", date: "2026-03-15", price: 95000, dept: siteB, custodian: liJiao, loc: "B标段试验室检测车", status: "in_use", calDate: "2026-03-15", calCycle: 6, calNext: "2026-09-15" },
    { assetNo: "INS-2026-004", name: "基桩动测仪", category: "INSTRUMENT", subCat: "桩基检测", model: "PIT-V", sn: "PITV-20250820", mfr: "美国PDI", date: "2025-08-20", price: 220000, dept: siteB, custodian: liJiao, loc: "B标段试验室", status: "in_use", calDate: "2025-08-20", calCycle: 12, calNext: "2026-06-15" },
    { assetNo: "INS-2026-005", name: "钢筋扫描仪", category: "INSTRUMENT", subCat: "钢筋检测", model: "HC-GY71", sn: "GY71-20260401", mfr: "北京海创", date: "2026-04-01", price: 8600, dept: siteC, custodian: liJiao, loc: "C标段试验室", status: "in_use", calDate: "2026-04-01", calCycle: 12, calNext: "2027-04-01" },
    { assetNo: "INS-2026-006", name: "沥青延度仪", category: "INSTRUMENT", subCat: "沥青检测", model: "SYD-4508C", sn: "4508C-20250901", mfr: "上海昌吉", date: "2025-09-01", price: 35000, dept: siteA, custodian: liJiao, loc: "A标段试验室沥青室", status: "in_use", calDate: "2025-09-01", calCycle: 12, calNext: "2026-06-20" },
    { assetNo: "INS-2026-007", name: "核子密度仪（备用）", category: "INSTRUMENT", subCat: "压实度检测", model: "MC-3", sn: "MC3-20241015", mfr: "美国CPN", date: "2024-10-15", price: 185000, dept: siteA, custodian: null, loc: "A标段仓库", status: "idle" },
    { assetNo: "VEH-2026-001", name: "丰田普拉多越野车", category: "VEHICLE", subCat: "越野车", model: "PRADO 3.5L VX", sn: "VIN-PRADO-20251001", mfr: "一汽丰田", date: "2025-10-01", price: 528000, dept: hqOffice, custodian: fengXing, loc: "总部地下车库B1-12", status: "in_use", plate: "京A·HY001", vin: "LFMG1E729JS000001", bp: "汽油", seats: 7, nextInsp: "2026-10-01", insuranceExp: "2026-07-25", mileage: 28560 },
    { assetNo: "VEH-2026-002", name: "长城皮卡工程车", category: "VEHICLE", subCat: "皮卡", model: "风骏7 2.0T", sn: "VIN-FJ7-20260301", mfr: "长城汽车", date: "2026-03-01", price: 128000, dept: siteB, custodian: liJiao, loc: "B标段驻地停车场", status: "in_use", plate: "京B·GC002", vin: "LGWDBE195MB000002", bp: "柴油", seats: 5, nextInsp: "2027-03-01", insuranceExp: "2026-06-28", mileage: 18200 },
    { assetNo: "VEH-2026-003", name: "五菱宏光面包车", category: "VEHICLE", subCat: "MPV", model: "五菱宏光S 1.5L", sn: "VIN-WLHG-20251208", mfr: "上汽通用五菱", date: "2025-12-08", price: 56000, dept: siteA, custodian: liJiao, loc: "A标段驻地", status: "in_use", plate: "京C·WL003", vin: "LZWADAGA4MG000003", bp: "汽油", seats: 7, nextInsp: "2026-12-08", insuranceExp: "2026-12-08", mileage: 34500 },
    { assetNo: "VEH-2026-004", name: "比亚迪汉EV公务车", category: "VEHICLE", subCat: "轿车", model: "汉EV 创世版 715km", sn: "VIN-HAN-20260415", mfr: "比亚迪", date: "2026-04-15", price: 289800, dept: hqOffice, custodian: chuCai, loc: "总部地面停车场A-03", status: "in_use", plate: "京A·HD004", vin: "LC0CE4CB6N0000004", bp: "电动", seats: 5, nextInsp: "2028-04-15", insuranceExp: "2027-04-15", mileage: 5200 },
    { assetNo: "OFF-2026-001", name: "Dell Precision工作站", category: "OFFICE", subCat: "工作站", model: "Precision 7920 Tower", sn: "DELL-7920-20260115", mfr: "Dell", date: "2026-01-15", price: 48000, dept: techCenter, custodian: qianJi, loc: "总部3楼机房", status: "in_use", os: "Ubuntu 22.04", cpu: "Xeon Gold 6248R", ram: "128GB", disk: "2TB SSD" },
    { assetNo: "OFF-2026-002", name: "ThinkPad X1 Carbon", category: "OFFICE", subCat: "笔记本", model: "X1 Carbon Gen11", sn: "TP-X1C-20260320", mfr: "联想", date: "2026-03-20", price: 12999, dept: productCenter, custodian: zhouQian, loc: "总部4楼工位A12", status: "in_use", os: "Windows 11 Pro", cpu: "i7-1365U", ram: "32GB", disk: "1TB SSD" },
    { assetNo: "OFF-2026-003", name: "HP LaserJet打印机", category: "OFFICE", subCat: "打印机", model: "LaserJet Pro M404dn", sn: "HP-M404-20251120", mfr: "惠普", date: "2025-11-20", price: 3200, dept: hqOffice, custodian: fengXing, loc: "总部行政办公室", status: "in_use" },
    { assetNo: "OFF-2026-004", name: "会议一体机", category: "OFFICE", subCat: "会议设备", model: "MAXHUB V6 86寸", sn: "MH-V6-20260210", mfr: "MAXHUB", date: "2026-02-10", price: 45000, dept: hqOffice, custodian: fengXing, loc: "总部大会议室", status: "in_use", os: "Android 12.0", cpu: "A73+A53", ram: "8GB", disk: "64GB" },
    { assetNo: "OFF-2026-005", name: "华为交换机S5735", category: "OFFICE", subCat: "网络设备", model: "S5735-L48T4X-A", sn: "HW-S5735-20250901", mfr: "华为", date: "2025-09-01", price: 15800, dept: techCenter, custodian: wuHou, loc: "总部机房机柜B2", status: "in_use" },
    { assetNo: "OFF-2026-006", name: "联想台式机（备用）", category: "OFFICE", subCat: "台式机", model: "启天M450-N000", sn: "LN-M450-20251225", mfr: "联想", date: "2025-12-25", price: 4500, dept: hqOffice, custodian: null, loc: "总部库房", status: "idle" },
    { assetNo: "TOL-2026-001", name: "徕卡激光测距仪", category: "TOOL", subCat: "测量工具", model: "DISTO X4", sn: "LX4-20260201", mfr: "Leica", date: "2026-02-01", price: 3200, dept: siteA, custodian: liJiao, loc: "A标段工具柜", status: "in_use" },
    { assetNo: "TOL-2026-002", name: "数字扭矩扳手", category: "TOOL", subCat: "紧固工具", model: "MWD-500", sn: "MWD500-20260110", mfr: "台湾美沃奇", date: "2026-01-10", price: 2800, dept: siteB, custodian: liJiao, loc: "B标段工具柜", status: "in_use" },
    { assetNo: "TOL-2026-003", name: "裂缝宽度观测仪", category: "TOOL", subCat: "观测工具", model: "HC-CK102", sn: "CK102-20251101", mfr: "北京海创", date: "2025-11-01", price: 4800, dept: siteC, custodian: null, loc: "C标段（已报失）", status: "lost" },
    { assetNo: "TOL-2026-004", name: "电子水准仪标尺", category: "TOOL", subCat: "测量工具", model: "GPCL3", sn: "GPCL3-20250801", mfr: "南方测绘", date: "2025-08-01", price: 1800, dept: siteB, custodian: liJiao, loc: "B标段仓库", status: "idle" },
    { assetNo: "TOL-2026-005", name: "混凝土钻孔取芯机", category: "TOOL", subCat: "取样工具", model: "HZ-20A", sn: "HZ20A-20251001", mfr: "浙江土工仪器", date: "2025-10-01", price: 15000, dept: siteA, custodian: liJiao, loc: "A标段工具房", status: "repairing" },
    // ===== 第二批：D/E/F标段 + 业务部门资产 =====
    { assetNo: "INS-2026-008", name: "全站仪", category: "INSTRUMENT", subCat: "测量仪器", model: "TS16 1\"", sn: "TS16-20260215", mfr: "Leica", date: "2026-02-15", price: 198000, dept: siteD, custodian: liJiao, loc: "D标段测量室", status: "in_use", calDate: "2026-02-15", calCycle: 12, calNext: "2027-02-15" },
    { assetNo: "INS-2026-009", name: "混凝土渗透仪", category: "INSTRUMENT", subCat: "耐久性检测", model: "HS-40", sn: "HS40-20260301", mfr: "天津建仪", date: "2026-03-01", price: 42000, dept: siteD, custodian: liJiao, loc: "D标段试验室", status: "in_use", calDate: "2026-03-01", calCycle: 12, calNext: "2027-03-01" },
    { assetNo: "INS-2026-010", name: "桥梁挠度检测仪", category: "INSTRUMENT", subCat: "桥梁检测", model: "BJQN-V5.0", sn: "BJQN-20260410", mfr: "北京光电", date: "2026-04-10", price: 156000, dept: siteE, custodian: liJiao, loc: "E标段桥梁检测室", status: "in_use", calDate: "2026-04-10", calCycle: 6, calNext: "2026-10-10" },
    { assetNo: "INS-2026-011", name: "超声测厚仪", category: "INSTRUMENT", subCat: "钢结构检测", model: "DMS-2TC", sn: "DMS2TC-20260105", mfr: "北京时代", date: "2026-01-05", price: 38000, dept: siteE, custodian: liJiao, loc: "E标段钢结构检测室", status: "in_use", calDate: "2026-01-05", calCycle: 12, calNext: "2027-01-05" },
    { assetNo: "INS-2026-012", name: "桩基完整性测试仪", category: "INSTRUMENT", subCat: "桩基检测", model: "PIT-W", sn: "PITW-20260520", mfr: "美国PDI", date: "2026-05-20", price: 245000, dept: siteF, custodian: liJiao, loc: "F标段桩基检测室", status: "in_use", calDate: "2026-05-20", calCycle: 6, calNext: "2026-11-20" },
    { assetNo: "INS-2026-013", name: "GPS-RTK测量仪", category: "INSTRUMENT", subCat: "测量仪器", model: "iRTK5", sn: "iRTK5-20251201", mfr: "中海达", date: "2025-12-01", price: 68000, dept: dmCenter, custodian: liJiao, loc: "交付中心外出巡检车", status: "in_use", calDate: "2025-12-01", calCycle: 12, calNext: "2026-12-01" },
    { assetNo: "INS-2026-014", name: "涂层测厚仪", category: "INSTRUMENT", subCat: "钢结构检测", model: "TT260", sn: "TT260-20260320", mfr: "北京时代", date: "2026-03-20", price: 18000, dept: bizCenter, custodian: zhouShang, loc: "商务中心设备室", status: "in_use", calDate: "2026-03-20", calCycle: 6, calNext: "2026-09-20" },
    { assetNo: "INS-2026-015", name: "标准恒温养护箱", category: "INSTRUMENT", subCat: "养护设备", model: "YH-40B", sn: "YH40B-20260120", mfr: "无锡建仪", date: "2026-01-20", price: 32000, dept: qmCenter, custodian: weiZhi, loc: "质量中心养护室", status: "in_use", calDate: "2026-01-20", calCycle: 12, calNext: "2027-01-20" },
    // 新增车辆 4辆
    { assetNo: "VEH-2026-005", name: "江铃域虎7工程车", category: "VEHICLE", subCat: "皮卡", model: "域虎7 2.0T", sn: "VIN-YH7-20260401", mfr: "江铃汽车", date: "2026-04-01", price: 138000, dept: siteD, custodian: liJiao, loc: "D标段驻地", status: "in_use", plate: "京D·YH005", vin: "LEFEDEF16MT000005", bp: "柴油", seats: 5, nextInsp: "2027-04-01", insuranceExp: "2026-12-15", mileage: 12500 },
    { assetNo: "VEH-2026-006", name: "日产纳瓦拉皮卡", category: "VEHICLE", subCat: "皮卡", model: "纳瓦拉 2.5L", sn: "VIN-NVL-20260315", mfr: "郑州日产", date: "2026-03-15", price: 169800, dept: siteE, custodian: liJiao, loc: "E标段驻地", status: "in_use", plate: "京E·NV006", vin: "LJNTGU5G9MN000006", bp: "汽油", seats: 5, nextInsp: "2027-03-15", insuranceExp: "2026-09-20", mileage: 9800 },
    { assetNo: "VEH-2026-007", name: "福田皮卡工程车", category: "VEHICLE", subCat: "皮卡", model: "拓陆者E7 2.0T", sn: "VIN-FT07-20260220", mfr: "福田汽车", date: "2026-02-20", price: 116000, dept: siteF, custodian: liJiao, loc: "F标段驻地", status: "in_use", plate: "京F·FT007", vin: "LVAV2MAB2ME000007", bp: "柴油", seats: 5, nextInsp: "2027-02-20", insuranceExp: "2027-02-20", mileage: 22000 },
    { assetNo: "VEH-2026-008", name: "金杯海狮检测车", category: "VEHICLE", subCat: "MPV", model: "海狮王 2.4L", sn: "VIN-HSW-20260108", mfr: "华晨金杯", date: "2026-01-08", price: 145000, dept: dmCenter, custodian: liJiao, loc: "交付中心停车场", status: "in_use", plate: "京G·HS008", vin: "LSYADABF3MK000008", bp: "汽油", seats: 12, nextInsp: "2027-01-08", insuranceExp: "2027-01-08", mileage: 18800 },
    // 新增办公设备 6件
    { assetNo: "OFF-2026-007", name: "AOC 4K显示器", category: "OFFICE", subCat: "显示器", model: "U2790PQU", sn: "AOC-U2790-20260201", mfr: "AOC", date: "2026-02-01", price: 2800, dept: dmCenter, custodian: liJiao, loc: "交付中心工位A1", status: "in_use" },
    { assetNo: "OFF-2026-008", name: "联想ThinkStation P360", category: "OFFICE", subCat: "工作站", model: "P360 Ultra", sn: "LEN-P360-20260310", mfr: "联想", date: "2026-03-10", price: 22000, dept: dmCenter, custodian: liJiao, loc: "交付中心数据处理室", status: "in_use", os: "Windows 11 Pro", cpu: "i7-12700", ram: "64GB", disk: "1TB SSD" },
    { assetNo: "OFF-2026-009", name: "联想ThinkPad T14", category: "OFFICE", subCat: "笔记本", model: "T14 Gen4", sn: "TP-T14-20260405", mfr: "联想", date: "2026-04-05", price: 11500, dept: bizCenter, custodian: zhouShang, loc: "商务中心移动办公", status: "in_use", os: "Windows 11 Pro", cpu: "i7-1355U", ram: "32GB", disk: "512GB SSD" },
    { assetNo: "OFF-2026-010", name: "HP彩色激光打印机", category: "OFFICE", subCat: "打印机", model: "Color LaserJet Pro M454dw", sn: "HP-M454-20251201", mfr: "惠普", date: "2025-12-01", price: 5800, dept: bizCenter, custodian: zhouShang, loc: "商务中心打印室", status: "in_use" },
    { assetNo: "OFF-2026-011", name: "Apple iMac 24寸", category: "OFFICE", subCat: "一体机", model: "iMac M3 24\"", sn: "iMac-M3-20260501", mfr: "Apple", date: "2026-05-01", price: 14999, dept: opsCenter, custodian: wuYun, loc: "运营中心工位C3", status: "in_use", os: "macOS Sequoia", cpu: "M3", ram: "24GB", disk: "512GB SSD" },
    { assetNo: "OFF-2026-012", name: "极米投影仪H6", category: "OFFICE", subCat: "会议设备", model: "H6 4K", sn: "JM-H6-20260315", mfr: "极米", date: "2026-03-15", price: 6999, dept: opsCenter, custodian: wuYun, loc: "运营中心会议室", status: "in_use", os: "Android TV", cpu: "MT9669", ram: "4GB", disk: "64GB" },
    // 新增小型工具 6件
    { assetNo: "TOL-2026-006", name: "红外测温仪", category: "TOOL", subCat: "测温工具", model: "FLIR E8-XT", sn: "FLIR-E8-20260401", mfr: "FLIR", date: "2026-04-01", price: 18000, dept: siteD, custodian: liJiao, loc: "D标段工具柜", status: "in_use" },
    { assetNo: "TOL-2026-007", name: "超声波探伤仪", category: "TOOL", subCat: "探伤工具", model: "CTS-9009", sn: "CTS9009-20260210", mfr: "汕头超声", date: "2026-02-10", price: 35000, dept: siteD, custodian: liJiao, loc: "D标段检测室", status: "in_use" },
    { assetNo: "TOL-2026-008", name: "数字温度记录仪", category: "TOOL", subCat: "记录设备", model: "TR-71wb", sn: "TR71-20260115", mfr: "T&D", date: "2026-01-15", price: 4500, dept: siteE, custodian: liJiao, loc: "E标段养护监控室", status: "in_use" },
    { assetNo: "TOL-2026-009", name: "弹簧拉力计", category: "TOOL", subCat: "力学工具", model: "NK-500", sn: "NK500-20251201", mfr: "山度仪器", date: "2025-12-01", price: 2200, dept: siteF, custodian: liJiao, loc: "F标段工具柜", status: "in_use" },
    { assetNo: "TOL-2026-010", name: "电子天平", category: "TOOL", subCat: "称量工具", model: "JA5003N", sn: "JA5003-20260120", mfr: "上海精科", date: "2026-01-20", price: 3800, dept: siteF, custodian: liJiao, loc: "F标段称量室", status: "in_use" },
    { assetNo: "TOL-2026-011", name: "激光垂准仪（备用）", category: "TOOL", subCat: "测量工具", model: "DZJ-300", sn: "DZJ300-20251001", mfr: "博飞仪器", date: "2025-10-01", price: 12000, dept: dmCenter, custodian: null, loc: "交付中心仓库", status: "idle" },
    // ===== 第三批：深度问题场景（覆盖分布式管理六大痛点维度） =====
    // 痛点1: 外派自行采购不报备 — F标段买仪器3月未登记
    { assetNo: "INS-2026-016", name: "混凝土电阻率仪", category: "INSTRUMENT", subCat: "耐久性检测", model: "R-Meter MK3", sn: "RMK3-20260301", mfr: "瑞士Proceq", date: "2026-03-01", price: 86000, dept: siteF, custodian: liJiao, loc: "F标段耐久性试验室", status: "in_use", calDate: "2026-03-01", calCycle: 12, calNext: "2027-03-01" },
    // 痛点2: 标段间重复采购 — B标段买了和A标段同型号回弹仪（应共享而非重购）
    { assetNo: "INS-2026-017", name: "数显回弹仪（B标自购）", category: "INSTRUMENT", subCat: "强度检测", model: "HT-225D", sn: "SN225D-20260415", mfr: "北京智博联", date: "2026-04-15", price: 13000, dept: siteB, custodian: liJiao, loc: "B标段试验室2号工位", status: "in_use", calDate: "2026-04-15", calCycle: 6, calNext: "2026-10-15" },
    // 痛点3: 报废资产未下账 — A标段旧压力机实际已报废但系统状态仍为in_stock
    { assetNo: "INS-2026-018", name: "老旧万能试验机（已报废）", category: "INSTRUMENT", subCat: "力学检测", model: "WE-1000B", sn: "WE1000-20180301", mfr: "济南试金", date: "2018-03-01", price: 45000, dept: siteA, custodian: null, loc: "A标段废弃设备区", status: "in_stock", calDate: "2022-09-01", calCycle: 12, calNext: "2023-09-01" },
    // 痛点4: 借出外部未归还 — E标段测斜仪借给合作单位超期未还
    { assetNo: "INS-2026-019", name: "滑动式测斜仪", category: "INSTRUMENT", subCat: "变形监测", model: "CX-901F", sn: "CX901-20250601", mfr: "北京航天", date: "2025-06-01", price: 125000, dept: siteE, custodian: null, loc: "借给中铁XX局未归还", status: "idle", calDate: "2025-06-01", calCycle: 12, calNext: "2026-06-01" },
    // 痛点5: 公车私用嫌疑 — C标段车辆非工作时间使用频繁
    { assetNo: "VEH-2026-009", name: "日产奇骏巡查车", category: "VEHICLE", subCat: "SUV", model: "奇骏 2.5L 4WD", sn: "VIN-QJ-20251101", mfr: "东风日产", date: "2025-11-01", price: 218000, dept: siteC, custodian: liJiao, loc: "C标段驻地", status: "in_use", plate: "京C·QJ009", vin: "LGBM2DE47MS000009", bp: "汽油", seats: 5, nextInsp: "2026-11-01", insuranceExp: "2026-05-15", mileage: 42300 },
    // 痛点6: 维修费用异常 — D标段哈弗一年修3次花费高
    { assetNo: "VEH-2026-010", name: "长城哈弗H9", category: "VEHICLE", subCat: "SUV", model: "哈弗H9 2.0T 四驱", sn: "VIN-H9-20250801", mfr: "长城汽车", date: "2025-08-01", price: 258000, dept: siteD, custodian: liJiao, loc: "D标段驻地", status: "in_use", plate: "京D·HH010", vin: "LGWFF7A56MH000010", bp: "柴油", seats: 7, nextInsp: "2026-08-01", insuranceExp: "2026-08-01", mileage: 31500 },
    // 痛点7: 外派车辆长期闲置 — F标段依维柯极少使用
    { assetNo: "VEH-2026-011", name: "依维柯检测车", category: "VEHICLE", subCat: "专项作业车", model: "Daily 3.0T", sn: "VIN-YWK-20241015", mfr: "南京依维柯", date: "2024-10-15", price: 320000, dept: siteF, custodian: null, loc: "F标段（长期闲置）", status: "idle", plate: "京F·YW011", vin: "LNYNBAA30MV000011", bp: "柴油", seats: 17, nextInsp: "2026-10-15", insuranceExp: "2026-10-15", mileage: 3200 },
    // 痛点8: 离职员工资产未回收 — D标段技术员离职笔记本未归还
    { assetNo: "OFF-2026-013", name: "Lenovo ThinkPad E15", category: "OFFICE", subCat: "笔记本", model: "E15 Gen4", sn: "TP-E15-20260110", mfr: "联想", date: "2026-01-10", price: 6500, dept: siteD, custodian: zhouShang, loc: "D标段（持有人已离职）", status: "in_use", os: "Windows 11 Pro", cpu: "i5-1235U", ram: "16GB", disk: "512GB SSD" },
    // 痛点9: 新购未拆封虚增资产 — F标段UPS买了但未启用
    { assetNo: "OFF-2026-014", name: "山特UPS不间断电源", category: "OFFICE", subCat: "电源设备", model: "C6KS 6kVA", sn: "STK-C6KS-20260501", mfr: "山特", date: "2026-05-01", price: 12000, dept: siteF, custodian: null, loc: "F标段库房（未拆封）", status: "in_stock" },
    // 痛点10: 废旧办公设备未处置 — A标段台式机报废多年还挂着
    { assetNo: "OFF-2026-015", name: "老旧联想台式机（待报废）", category: "OFFICE", subCat: "台式机", model: "启天M4350", sn: "LN-M4350-20190601", mfr: "联想", date: "2019-06-01", price: 3500, dept: siteA, custodian: null, loc: "A标段废弃设备区", status: "idle" },
    // 痛点11: 外派点自行采购不备案 — C标段自行购买扫描仪未走采购流程
    { assetNo: "OFF-2026-016", name: "Canon高速扫描仪", category: "OFFICE", subCat: "办公外设", model: "DR-M260", sn: "CN-M260-20260315", mfr: "佳能", date: "2026-03-15", price: 9800, dept: siteC, custodian: liJiao, loc: "C标段资料室", status: "in_use" },
    // 痛点12: 损坏工具不报修 — E标段硬度计坏了3个月系统仍显示正常
    { assetNo: "TOL-2026-012", name: "便携式里氏硬度计", category: "TOOL", subCat: "硬度测试", model: "TH110", sn: "TH110-20250901", mfr: "北京时代", date: "2025-09-01", price: 8500, dept: siteE, custodian: liJiao, loc: "E标段工具柜", status: "in_use" },
    // 痛点13: 保管人信息不准 — D标段卡尺登记保管人是B标段员工
    { assetNo: "TOL-2026-013", name: "数显卡尺", category: "TOOL", subCat: "测量工具", model: "500-196-30", sn: "MTG-196-20251201", mfr: "Mitutoyo", date: "2025-12-01", price: 2600, dept: siteD, custodian: zhouShang, loc: "D标段测量室", status: "in_use" },
    // 痛点14: 标段间私下借用 — B标段砝码被A标段拿走未登记
    { assetNo: "TOL-2026-014", name: "标准砝码组", category: "TOOL", subCat: "校准工具", model: "F1级 1mg-1kg", sn: "FM-F1-20250801", mfr: "上海实润", date: "2025-08-01", price: 9500, dept: siteB, custodian: liJiao, loc: "A标段（从B标段借用未还）", status: "in_use" },
  ];

  const assetIds: number[] = [];
  const anoPrefix = isT1 ? "" : "DEMO-";
  for (const a of allAssets) {
    const r = dbRun(
      `INSERT INTO assets (asset_no, name, category, sub_category, model, sn, manufacturer,
        purchase_date, purchase_price, expected_life, status, owner_type,
        department_id, location_detail, custodian_id, remark, tenant_id, created_by, warranty_expire_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'owned',?,?,?,?,?,?,?)`,
      [anoPrefix + a.assetNo, a.name, a.category, a.subCat || null, a.model || null,
       a.sn || null, a.mfr || null, a.date || null, a.price, 60, a.status,
       a.dept, a.loc || null, a.custodian, null, tenantId, 1, addMonths(a.date, 60)]
    );
    assetIds.push(r.lastInsertRowid as number);
  }

  // 车辆车牌也需去重：全局UNIQUE约束要求不同租户不能共用同车牌
  const platePrefix = isT1 ? "" : "DEMO-";

  // 仪器扩展数据（前15件，新增8件）
  const instrumentExts = [
    { calDate: "2026-05-08", calCycle: 6, calNext: "2026-11-08" },
    { calDate: "2025-11-12", calCycle: 12, calNext: "2026-04-12" },
    { calDate: "2026-03-15", calCycle: 6, calNext: "2026-09-15" },
    { calDate: "2025-08-20", calCycle: 12, calNext: "2026-06-15" },
    { calDate: "2026-04-01", calCycle: 12, calNext: "2027-04-01" },
    { calDate: "2025-09-01", calCycle: 12, calNext: "2026-06-20" },
    null,
    // 新增8件仪器
    { calDate: "2026-02-15", calCycle: 12, calNext: "2027-02-15" },
    { calDate: "2026-03-01", calCycle: 12, calNext: "2027-03-01" },
    { calDate: "2026-04-10", calCycle: 6, calNext: "2026-10-10" },
    { calDate: "2026-01-05", calCycle: 12, calNext: "2027-01-05" },
    { calDate: "2026-05-20", calCycle: 6, calNext: "2026-11-20" },
    { calDate: "2025-12-01", calCycle: 12, calNext: "2026-12-01" },
    { calDate: "2026-03-20", calCycle: 6, calNext: "2026-09-20" },
    { calDate: "2026-01-20", calCycle: 12, calNext: "2027-01-20" },
    // 第三批：4件（索引46-49）INS-016 ~ INS-019
    { calDate: "2026-03-01", calCycle: 12, calNext: "2027-03-01" },    // INS-016 电阻率仪（外派自行采购3月未登记，但仪器已校准）
    { calDate: "2026-04-15", calCycle: 6, calNext: "2026-10-15" },      // INS-017 回弹仪B标（重复采购，买了和A标段同型号）
    { calDate: "2022-09-01", calCycle: 12, calNext: "2023-09-01" },     // INS-018 旧万能机（校准过期近3年！实际已报废）
    { calDate: "2025-06-01", calCycle: 12, calNext: "2026-06-01" },     // INS-019 测斜仪（借出外部，校准已过期27天）
  ];
  for (let i = 0; i < instrumentExts.length; i++) {
    const e = instrumentExts[i];
    if (e) {
      dbRun("INSERT INTO asset_instruments (asset_id, last_calibration, next_calibration, calibration_cycle) VALUES (?,?,?,?)",
        [assetIds[i], e.calDate, e.calNext, e.calCycle]);
    }
  }

  // 车辆扩展数据（索引7-10）+ 使用日志
  const vehicleExts = [
    { plate: "京A·HY001", vin: "LFMG1E729JS000001", bp: "汽油", seats: 7, nextInsp: "2026-10-01", insuranceExp: "2026-07-25", mileage: 28560, logs: [
      { type: "refuel", cost: 680, mileage: 12500, date: "2026-03-15", desc: "京藏高速服务区加油 95#" },
      { type: "refuel", cost: 720, mileage: 18600, date: "2026-04-22", desc: "城区中石化加油" },
      { type: "maintenance", cost: 3200, mileage: 20000, date: "2026-05-05", desc: "2万公里常规保养" },
      { type: "refuel", cost: 650, mileage: 24500, date: "2026-06-10", desc: "张家口出差加油" },
      { type: "other", cost: 3500, mileage: 28000, date: "2026-06-20", desc: "更换四条轮胎" },
    ] },
    { plate: "京B·GC002", vin: "LGWDBE195MB000002", bp: "柴油", seats: 5, nextInsp: "2027-03-01", insuranceExp: "2026-06-28", mileage: 18200, logs: [
      { type: "refuel", cost: 420, mileage: 8000, date: "2026-04-10", desc: "B标段附近加油站 0#柴油" },
      { type: "refuel", cost: 380, mileage: 13500, date: "2026-05-18", desc: "出差采样加油" },
      { type: "traffic_fine", cost: 200, mileage: 15000, date: "2026-06-05", desc: "G6高速超速 罚200记3分" },
      { type: "maintenance", cost: 800, mileage: 16000, date: "2026-06-15", desc: "首保 更换机油机滤" },
    ] },
    { plate: "京C·WL003", vin: "LZWADAGA4MG000003", bp: "汽油", seats: 7, nextInsp: "2026-12-08", insuranceExp: "2026-12-08", mileage: 34500, logs: [
      { type: "refuel", cost: 350, mileage: 15000, date: "2026-03-20", desc: "A标段附近加油站 92#" },
      { type: "refuel", cost: 320, mileage: 22000, date: "2026-05-01", desc: "送检样品加油" },
      { type: "insurance", cost: 3800, mileage: 30000, date: "2026-06-01", desc: "续保交强险+商业险" },
      { type: "annual_inspection", cost: 500, mileage: 30000, date: "2026-06-10", desc: "年检上线检测" },
    ] },
    { plate: "京A·HD004", vin: "LC0CE4CB6N0000004", bp: "电动", seats: 5, nextInsp: "2028-04-15", insuranceExp: "2027-04-15", mileage: 5200, logs: [
      { type: "refuel", cost: 85, mileage: 1200, date: "2026-05-01", desc: "特来电充电 62kWh" },
      { type: "refuel", cost: 120, mileage: 3200, date: "2026-05-25", desc: "国网充电桩 88kWh" },
      { type: "other", cost: 2600, mileage: 3800, date: "2026-06-15", desc: "安装家用充电桩" },
    ] },
  ];
  const vOffset = 7;
  for (let i = 0; i < vehicleExts.length; i++) {
    const v = vehicleExts[i];
    dbRun(`INSERT INTO asset_vehicles (asset_id, plate_no, vin, fuel_type, seat_count, next_inspection, insurance_expire, current_mileage) VALUES (?,?,?,?,?,?,?,?)`,
      [assetIds[vOffset + i], platePrefix + v.plate, v.vin, v.bp, v.seats, v.nextInsp, v.insuranceExp, v.mileage]);
    for (const log of v.logs) {
      dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
        [assetIds[vOffset + i], log.type, log.cost, log.mileage, log.date, log.desc, tenantId]);
    }
  }

  // 第二批车辆扩展（D/E/F标段 + 交付中心，索引30-33）
  const vehicleExts2 = [
    { plate: "京D·YH005", vin: "LEFEDEF16MT000005", bp: "柴油", seats: 5, nextInsp: "2027-04-01", insuranceExp: "2026-12-15", mileage: 12500, logs: [
      { type: "refuel", cost: 380, mileage: 4200, date: "2026-04-20", desc: "D标段加油站 0#柴油" },
      { type: "maintenance", cost: 1200, mileage: 8000, date: "2026-05-15", desc: "首保 更换机油三滤" },
      { type: "refuel", cost: 450, mileage: 10500, date: "2026-06-10", desc: "送检桥梁构件加油" },
    ] },
    { plate: "京E·NV006", vin: "LJNTGU5G9MN000006", bp: "汽油", seats: 5, nextInsp: "2027-03-15", insuranceExp: "2026-09-20", mileage: 9800, logs: [
      { type: "refuel", cost: 520, mileage: 3500, date: "2026-04-05", desc: "E标段附近加油站 92#" },
      { type: "refuel", cost: 480, mileage: 6800, date: "2026-05-20", desc: "钢结构检测出差加油" },
      { type: "traffic_fine", cost: 100, mileage: 8000, date: "2026-06-18", desc: "违停罚款 100元" },
    ] },
    { plate: "京F·FT007", vin: "LVAV2MAB2ME000007", bp: "柴油", seats: 5, nextInsp: "2027-02-20", insuranceExp: "2027-02-20", mileage: 22000, logs: [
      { type: "refuel", cost: 360, mileage: 12000, date: "2026-03-10", desc: "F标段工地加油" },
      { type: "maintenance", cost: 1500, mileage: 18000, date: "2026-05-01", desc: "2万公里大保养" },
      { type: "refuel", cost: 390, mileage: 20000, date: "2026-06-05", desc: "桩基检测送样加油" },
      { type: "insurance", cost: 4600, mileage: 22000, date: "2026-06-20", desc: "续保商业险+三者险" },
    ] },
    { plate: "京G·HS008", vin: "LSYADABF3MK000008", bp: "汽油", seats: 12, nextInsp: "2027-01-08", insuranceExp: "2027-01-08", mileage: 18800, logs: [
      { type: "refuel", cost: 580, mileage: 8000, date: "2026-02-20", desc: "交付中心车队加油" },
      { type: "refuel", cost: 620, mileage: 12500, date: "2026-04-15", desc: "跨标段巡检加油" },
      { type: "maintenance", cost: 950, mileage: 15000, date: "2026-05-10", desc: "1.5万公里常规保养" },
      { type: "refuel", cost: 550, mileage: 17500, date: "2026-06-15", desc: "D标段工地送设备加油" },
    ] },
  ];
  const vOffset2 = 30;  // 新车辆从allAssets索引30开始
  for (let i = 0; i < vehicleExts2.length; i++) {
    const v = vehicleExts2[i];
    dbRun(`INSERT INTO asset_vehicles (asset_id, plate_no, vin, fuel_type, seat_count, next_inspection, insurance_expire, current_mileage) VALUES (?,?,?,?,?,?,?,?)`,
      [assetIds[vOffset2 + i], platePrefix + v.plate, v.vin, v.bp, v.seats, v.nextInsp, v.insuranceExp, v.mileage]);
    for (const log of v.logs) {
      dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
        [assetIds[vOffset2 + i], log.type, log.cost, log.mileage, log.date, log.desc, tenantId]);
    }
  }

  // 第三批车辆扩展（索引50-52：奇骏公车私用、哈弗维修异常、依维柯闲置）
  const vehicleExts3 = [
    { plate: "京C·QJ009", vin: "LGBM2DE47MS000009", bp: "汽油", seats: 5, nextInsp: "2026-11-01", insuranceExp: "2026-05-15", mileage: 42300, logs: [
      { type: "refuel", cost: 520, mileage: 18000, date: "2026-03-05", desc: "C标段附近加油站 92#" },
      { type: "refuel", cost: 480, mileage: 23500, date: "2026-04-10", desc: "市区加油站（非工作日出车）⚠️公车私用嫌疑" },
      { type: "traffic_fine", cost: 200, mileage: 28000, date: "2026-05-01", desc: "景区违停罚款（五一假期）⚠️非公务出行" },
      { type: "refuel", cost: 550, mileage: 34000, date: "2026-05-30", desc: "高速服务区加油（周末出车）" },
      { type: "other", cost: 800, mileage: 40000, date: "2026-06-15", desc: "车内饰清洗&空调保养（非必须）" },
      { type: "traffic_fine", cost: 300, mileage: 42300, date: "2026-06-25", desc: "夜间超速抓拍（22:35 非工作时段）⚠️第三次违规" },
    ] },
    { plate: "京D·HH010", vin: "LGWFF7A56MH000010", bp: "柴油", seats: 7, nextInsp: "2026-08-01", insuranceExp: "2026-08-01", mileage: 31500, logs: [
      { type: "refuel", cost: 450, mileage: 8000, date: "2025-11-15", desc: "D标段附近加油站 0#柴油" },
      { type: "maintenance", cost: 6800, mileage: 11000, date: "2025-12-20", desc: "⚠️ 涡轮增压器维修（意外故障 不在保修期）" },
      { type: "refuel", cost: 480, mileage: 16000, date: "2026-02-10", desc: "跨标段巡检加油" },
      { type: "maintenance", cost: 12500, mileage: 20000, date: "2026-04-05", desc: "⚠️ 变速箱大修（质保期内但判定人为操作不当）" },
      { type: "insurance", cost: 5800, mileage: 25000, date: "2026-05-20", desc: "出险维修前保险杠（单方事故）" },
      { type: "other", cost: 4200, mileage: 30000, date: "2026-06-10", desc: "⚠️ 更换四条AT越野胎（原厂胎不到一年即报废）" },
    ] },
    { plate: "京F·YW011", vin: "LNYNBAA30MV000011", bp: "柴油", seats: 17, nextInsp: "2026-10-15", insuranceExp: "2026-10-15", mileage: 3200, logs: [
      { type: "refuel", cost: 680, mileage: 50, date: "2024-10-20", desc: "首次加油（交车时）" },
      { type: "refuel", cost: 650, mileage: 1200, date: "2025-03-01", desc: "F标段开工仪式运输物资" },
      { type: "maintenance", cost: 1800, mileage: 3000, date: "2025-10-15", desc: "年检前保养（实际为强制年检要求）" },
      { type: "insurance", cost: 7800, mileage: 3200, date: "2025-10-20", desc: "续保（车辆极少使用但仍需全额投保）⚠️沉没成本" },
      { type: "other", cost: 2000, mileage: 3200, date: "2026-06-01", desc: "停车管理费年缴（闲置14个月仅行驶3200km）" },
    ] },
  ];
  const vOffset3 = 50;  // 第三批车辆从 allAssets 索引50开始
  for (let i = 0; i < vehicleExts3.length; i++) {
    const v = vehicleExts3[i];
    dbRun(`INSERT INTO asset_vehicles (asset_id, plate_no, vin, fuel_type, seat_count, next_inspection, insurance_expire, current_mileage) VALUES (?,?,?,?,?,?,?,?)`,
      [assetIds[vOffset3 + i], platePrefix + v.plate, v.vin, v.bp, v.seats, v.nextInsp, v.insuranceExp, v.mileage]);
    for (const log of v.logs) {
      dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
        [assetIds[vOffset3 + i], log.type, log.cost, log.mileage, log.date, log.desc, tenantId]);
    }
  }

  // 办公设备扩展（索引11-16中的3件有OS信息）
  const officeData = [
    { idx: 0, os: "Ubuntu 22.04", cpu: "Xeon Gold 6248R", ram: "128GB", disk: "2TB SSD" },
    { idx: 1, os: "Windows 11 Pro", cpu: "i7-1365U", ram: "32GB", disk: "1TB SSD" },
    { idx: 3, os: "Android 12.0", cpu: "A73+A53", ram: "8GB", disk: "64GB" },
  ];
  const oOffset = 11;
  for (const d of officeData) {
    dbRun("INSERT INTO asset_office (asset_id, os, cpu, ram, storage) VALUES (?,?,?,?,?)",
      [assetIds[oOffset + d.idx], d.os, d.cpu, d.ram, d.disk]);
  }

  // 第二批办公设备扩展（索引34-39，其中3件有OS）
  const officeData2 = [
    { idx: 1, os: "Windows 11 Pro", cpu: "i7-12700", ram: "64GB", disk: "1TB SSD" },  // ThinkStation
    { idx: 2, os: "Windows 11 Pro", cpu: "i7-1355U", ram: "32GB", disk: "512GB SSD" }, // ThinkPad T14
    { idx: 4, os: "macOS Sequoia", cpu: "M3", ram: "24GB", disk: "512GB SSD" },       // iMac
    { idx: 5, os: "Android TV", cpu: "MT9669", ram: "4GB", disk: "64GB" },             // 投影仪
  ];
  const oOffset2 = 34;
  for (const d of officeData2) {
    dbRun("INSERT INTO asset_office (asset_id, os, cpu, ram, storage) VALUES (?,?,?,?,?)",
      [assetIds[oOffset2 + d.idx], d.os, d.cpu, d.ram, d.disk]);
  }

  // 第三批办公设备扩展（索引53-56，仅 OFF-013 ThinkPad E15 有OS）
  const officeData3 = [
    { idx: 0, os: "Windows 11 Pro", cpu: "i5-1235U", ram: "16GB", disk: "512GB SSD" },  // OFF-013 ThinkPad E15
  ];
  const oOffset3 = 53;
  for (const d of officeData3) {
    dbRun("INSERT INTO asset_office (asset_id, os, cpu, ram, storage) VALUES (?,?,?,?,?)",
      [assetIds[oOffset3 + d.idx], d.os, d.cpu, d.ram, d.disk]);
  }

  // 流转记录
  dbRun(`INSERT INTO asset_transactions (asset_id, type, from_user_id, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', NULL, ?, '行政部配发公务用车', ?, 1, '2026-01-10 09:00:00')`,
    [assetIds[vOffset], fengXing, tenantId]);
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'A标段路基检测领用', ?, 1, '2026-01-20 14:30:00')`,
    [assetIds[0], liJiao, tenantId]);
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '长期未使用标记闲置', ?, 1, '2026-05-01 10:00:00')`,
    [assetIds[6], tenantId]);
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '采购多余入库闲置', ?, 1, '2026-03-15 16:00:00')`,
    [assetIds[oOffset + 5], tenantId]);
  const toolLostIdx = 19;  // 裂缝宽度观测仪（原索引19）
  dbRun(`INSERT INTO asset_transactions (asset_id, type, condition, remark, tenant_id, created_by, created_at) VALUES (?, 'return', 'lost', '外检遗失已报保险', ?, 1, '2026-06-10 11:00:00')`,
    [assetIds[toolLostIdx], tenantId]);

  // 新增流转记录（第二批资产）
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'D标段桥梁检测领用', ?, 1, '2026-02-20 09:00:00')`,
    [assetIds[22], liJiao, tenantId]); // 全站仪 → D标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'E标段配备桥梁检测设备', ?, 1, '2026-04-15 10:00:00')`,
    [assetIds[24], liJiao, tenantId]); // 桥梁挠度检测仪 → E标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'F标段桩基检测配备', ?, 1, '2026-05-25 14:00:00')`,
    [assetIds[26], liJiao, tenantId]); // 桩基完整性测试仪 → F标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '采购入库闲置待分配', ?, 1, '2026-04-01 16:00:00')`,
    [assetIds[45], tenantId]); // 激光垂准仪标记闲置
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'D标段驻地工程车配发', ?, 1, '2026-04-10 08:00:00')`,
    [assetIds[30], liJiao, tenantId]); // 江铃域虎 → D标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'E标段驻地车辆配置', ?, 1, '2026-03-20 09:00:00')`,
    [assetIds[31], liJiao, tenantId]); // 纳瓦拉皮卡 → E标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'F标段驻地车辆配置', ?, 1, '2026-03-01 10:00:00')`,
    [assetIds[32], liJiao, tenantId]); // 福田皮卡 → F标段
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '交付中心外出设备运输车', ?, 1, '2026-01-15 09:00:00')`,
    [assetIds[33], liJiao, tenantId]); // 金杯海狮 → 交付中心

  // 第三批：14件问题场景资产交易记录（讲述完整故事）
  // INS-016 (idx46): F标段自行采购3月不报备 → 补登记入库（迟了90天）
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '⚠️ F标段自行采购电阻率仪，3个月后补登记入库', ?, 1, '2026-06-01 15:00:00')`,
    [assetIds[46], liJiao, tenantId]);
  // INS-017 (idx47): B标段买了和A标段同型号回弹仪（重复采购，应共享而非重购）
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '⚠️ B标段重复采购（A标段已有同型号HT-225D），未走共享调配', ?, 1, '2026-04-20 10:00:00')`,
    [assetIds[47], liJiao, tenantId]);
  // INS-018 (idx48): A标段旧万能机实际已报废但系统仍为in_stock
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '⚠️ 2018年购入设备，2023年实际已报废拆除，但系统未执行scrap操作', ?, 1, '2023-06-15 09:00:00')`,
    [assetIds[48], tenantId]);
  // INS-019 (idx49): E标段测斜仪借给中铁XX局未归还 + 校准已过期
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'lend_out', ?, '⚠️ 借给中铁XX局3标段（合作单位），借期1个月，超期15天未还，校准已于2026-06-01过期', ?, 1, '2026-05-15 08:00:00')`,
    [assetIds[49], zhouShang, tenantId]);
  // VEH-009 (idx50): C标段奇骏公车私用嫌疑
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'C标段巡查车配发 ⚠️注意：多次非工作时段出车见用车日志', ?, 1, '2025-11-10 09:00:00')`,
    [assetIds[50], liJiao, tenantId]);
  // VEH-010 (idx51): D标段哈弗H9维修费用异常
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'D标段工程车 ⚠️一年内维修费用累计超2.3万元，详见维修日志', ?, 1, '2025-08-05 09:00:00')`,
    [assetIds[51], liJiao, tenantId]);
  // VEH-011 (idx52): F标段依维柯长期闲置
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '⚠️ 购入后仅开工仪式使用一次，闲置14个月未分配任务，年维保+保险+停车费超1.1万元沉没成本', ?, 1, '2024-10-20 10:00:00')`,
    [assetIds[52], tenantId]);
  // OFF-013 (idx53): D标段ThinkPad E15被离职员工带走未归还
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '⚠️ D标段技术员领用，该员工已于2026-04-30离职，笔记本未归还入库', ?, 1, '2026-01-15 09:00:00')`,
    [assetIds[53], zhouShang, tenantId]);
  // OFF-014 (idx54): F标段UPS未拆封 — 虚增资产争议
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '⚠️ F标段自行采购UPS，入库后从未启用——是否虚增资产？', ?, 1, '2026-05-05 14:00:00')`,
    [assetIds[54], tenantId]);
  // OFF-015 (idx55): A标段旧台式机待报废未处置
  dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?, 'transfer', '⚠️ 2019年购入台式机，已使用7年，3年前就应报废处置但一直挂账', ?, 1, '2024-01-10 10:00:00')`,
    [assetIds[55], tenantId]);
  // OFF-016 (idx56): C标段自行购买扫描仪不备案
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '⚠️ C标段自行采购扫描仪，未走总部采购审批流程，3月后补录', ?, 1, '2026-06-20 16:00:00')`,
    [assetIds[56], liJiao, tenantId]);
  // TOL-012 (idx57): E标段硬度计损坏3月不报修
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, 'E标段工具配备 ⚠️该硬度计实际已损坏（探头断裂），但3个月未报修也未登记维修', ?, 1, '2025-09-10 09:00:00')`,
    [assetIds[57], liJiao, tenantId]);
  // TOL-013 (idx58): D标段卡尺保管人信息不准—登记的是商务中心员工而非D标段实际使用人
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'checkout', ?, '⚠️ 实际使用人为D标段测量员，但系统登记保管人为商务中心周商（信息录入错误）', ?, 1, '2025-12-05 11:00:00')`,
    [assetIds[58], zhouShang, tenantId]);
  // TOL-014 (idx59): B标段砝码被A标段私下借用未登记
  dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?, 'lend_out', ?, '⚠️ A标段私下借用B标段标准砝码组，未走正式借用流程，系统未登记跨标段调拨', ?, 1, '2026-05-20 13:00:00')`,
    [assetIds[59], liJiao, tenantId]);

  // 盘点任务
  const task = dbRun(`INSERT INTO asset_count_tasks (title, description, scope, status, start_date, tenant_id, created_by) VALUES ('2026年Q2资产盘点','对全部6个标段及总部检测仪器、车辆、办公设备进行半年大盘点','all','in_progress','2026-06-25',?,1)`, [tenantId]);
  const taskId = task.lastInsertRowid as number;
  // 盘点前8件（原7件 + 全站仪）+ 2件差异
  for (let i = 0; i <= 7; i++) {
    const isDiff = i === 3 || i === 7;
    dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      [taskId, assetIds[i], allAssets[i].loc || null, allAssets[i].loc || null, allAssets[i].status, allAssets[i].status, allAssets[i].custodian, allAssets[i].custodian, isDiff ? "difference" : "match", isDiff ? (i === 7 ? "全站仪GPS模块需固件升级" : "校准证书即将到期需安排送检") : null, tenantId]);
  }
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,NULL,?,?,?,1,?)`,
    [taskId, assetIds[6], "A标段仓库", "idle", "not_found", "C标段仓库未找到该仪器", tenantId]);
  // 新增盘点——D/E/F标段仪器
  for (let i = 22; i <= 28; i++) {
    const isDiff = i === 25;
    dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      [taskId, assetIds[i], allAssets[i].loc || null, allAssets[i].loc || null, allAssets[i].status, allAssets[i].status, allAssets[i].custodian, allAssets[i].custodian, isDiff ? "difference" : "match", isDiff ? "超声测厚仪探头磨损需更换" : null, tenantId]);
  }
  // 工具盘点差异
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[19], "A标段工具房", "A标段工具房", "repairing", "repairing", "match", "已在维修中", tenantId]);
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[45], "交付中心仓库", "交付中心仓库", "idle", "idle", "match", "闲置中可调拨", tenantId]);

  // 第三批问题资产盘点结果 — 每个痛点映射到具体差异
  // INS-016 (idx46): F标段电阻率仪 — 自行采购不报备，系统晚登记
  const c46 = dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[46], "F标段耐久性试验室", "F标段耐久性试验室", "in_use", "in_use", "difference", "⚠️ 该设备由F标段2026-03自行采购，至2026-06才补登记入库（延迟90天），未走总部采购审批", tenantId]);
  // INS-017 (idx47): B标段回弹仪 — 与A标段同型号重复采购
  const c47 = dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[47], "B标段试验室2号工位", "B标段试验室2号工位", "in_use", "in_use", "difference", "⚠️ 与A标段INS-001同型号HT-225D，重复采购浪费1.3万元，应共享调拨而非各自购买", tenantId]);
  // INS-018 (idx48): A标段旧万能机 — 已报废但系统为in_stock
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,NULL,?,?,1,?)`,
    [taskId, assetIds[48], "A标段废弃设备区", "A标段废弃设备区（设备已物理拆除）", "in_stock", "scrapped", "difference", "⚠️ 严重问题！该设备2023年已报废拆除，但系统仍显示in_stock。资产台账与实际严重不符", tenantId]);
  // INS-019 (idx49): E标段测斜仪 — 借出中铁XX局超期未还 + 校准过期
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,NULL,?,?,1,?)`,
    [taskId, assetIds[49], "E标段检测室", "中铁XX局3标段（借出超期15天）", "in_use", "idle", "not_found", "⚠️ 该设备借给合作单位超期未归还，且校准已于2026-06-01过期（过期27天），需立即追回并送校", tenantId]);
  // VEH-009 (idx50): C标段奇骏 — 公车私用嫌疑
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[50], "C标段驻地", "C标段驻地", "in_use", "in_use", liJiao, liJiao, "difference", "⚠️ 行车日志显示3次非工作时段出车（含五一假期景区违停、夜间超速），存在公车私用嫌疑，建议启动审计", tenantId]);
  // VEH-010 (idx51): D标段哈弗H9 — 维修费用异常
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[51], "D标段驻地", "D标段驻地", "in_use", "in_use", liJiao, liJiao, "difference", "⚠️ 购置不到1年维修费累计2.35万元（含变速箱大修1.25万、涡轮维修0.68万），远高于同类型车辆正常水平", tenantId]);
  // VEH-011 (idx52): F标段依维柯 — 长期闲置
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[52], "F标段驻地", "F标段（长期闲置）", "idle", "idle", "difference", "⚠️ 购入20个月仅行驶3200km，年维保+保险+停车费超1.1万元，建议调拨至有需求标段或处置", tenantId]);
  // OFF-013 (idx53): D标段笔记本 — 离职员工未归还
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[53], "D标段", "不可追溯", "in_use", "in_use", "not_found", "⚠️ 资产已被离职员工带走，至今未归还。持有人2026-04-30离职，需启动追回流程", tenantId]);
  // OFF-014 (idx54): F标段UPS — 未拆封虚增资产
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[54], "F标段库房", "F标段库房（原箱未拆封）", "in_stock", "in_stock", "match", "⚠️ 虽核实存在但从未启用——F标段表示'买错了用不上'。存在虚增资产嫌疑，建议核查采购合理性", tenantId]);
  // OFF-015 (idx55): A标段旧台式机 — 待报废未处置
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[55], "A标段废弃设备区", "A标段废弃设备区（已无法开机）", "idle", "idle", "difference", "⚠️ 2019年购入，使用7年已无法开机，但系统一直未走报废流程。占库存指标，建议立即处置", tenantId]);
  // OFF-016 (idx56): C标段扫描仪 — 自行采购不备案
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[56], "C标段资料室", "C标段资料室", "in_use", "in_use", "difference", "⚠️ C标段2026-03自行采购未走总部采购流程，6月才补录入库。外派点采购权限边界需明确", tenantId]);
  // TOL-012 (idx57): E标段硬度计 — 损坏3月不报修
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[57], "E标段工具柜", "E标段工具柜", "in_use", "in_use", "difference", "⚠️ 探头已断裂损坏（经现场确认），但系统状态仍为in_use且无维修记录。损坏近3个月未报修", tenantId]);
  // TOL-013 (idx58): D标段卡尺 — 保管人信息不准
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[58], "D标段测量室", "D标段测量室", "in_use", "in_use", zhouShang, liJiao, "difference", "⚠️ 系统登记保管人为商务中心周商，但实际使用人为D标段现场测量员。保管人信息严重失实", tenantId]);
  // TOL-014 (idx59): B标段砝码 — 被A标段私下借用
  dbRun(`INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status, result, remark, counted_by, tenant_id) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    [taskId, assetIds[59], "B标段称量室", "A标段称量室（从B标段私下借用）", "in_use", "in_use", "difference", "⚠️ 实物在A标段称量室找到！B标段前月私下借给A标段未走正式调拨流程，跨标段资产移动无记录", tenantId]);

  // ===== 第四批：分支级集团管控资产种子（全20外派分支 + 痛点场景） =====
  const branchRows = dbAll(
    "SELECT id, name, region FROM departments WHERE tenant_id=? AND branch_level=2 ORDER BY id",
    [tenantId]
  ) as any[];
  if (branchRows.length > 0) {
    const getBranchManager = (deptId: number) =>
      (dbGet("SELECT id FROM employees WHERE department_id=? AND tenant_id=? AND employee_type='human' LIMIT 1", [deptId, tenantId]) as any)?.id || null;
    const getBranchAI = (deptId: number) =>
      (dbGet("SELECT id FROM employees WHERE department_id=? AND tenant_id=? AND employee_type='ai' LIMIT 1", [deptId, tenantId]) as any)?.id || null;

    // 仪器模板轮换
    const instTmpl = [
      ["强度检测","HT-225D","北京智博联",12800,12],
      ["力学检测","YAW-2000","济南试金",158000,12],
      ["测量仪器","TS09","Leica",98000,12],
      ["无损检测","N2","汕头超声",36000,6],
      ["桩基检测","PIT-V2","美国PDI",220000,6],
      ["钢筋检测","HC-GY81","北京海创",8600,12],
      ["沥青检测","SYD-4508F","上海昌吉",32000,12],
      ["土工检测","GZQ-1","南京土壤",28000,12],
      ["钢结构检测","HS610e","南通友联",45000,6],
      ["化学分析","ICP-5000","PerkinElmer",180000,12],
    ] as const;
    // 车辆模板轮换
    const vehTmpl = [
      ["长城风骏7","皮卡","柴油",5,125000,"长城汽车"],
      ["江铃域虎7","皮卡","柴油",5,138000,"江铃汽车"],
      ["日产纳瓦拉","皮卡","汽油",5,169800,"郑州日产"],
      ["福田拓陆者","皮卡","柴油",5,116000,"福田汽车"],
      ["江淮帅铃T8","皮卡","柴油",5,108000,"江淮汽车"],
      ["上汽大通T70","皮卡","柴油",5,132000,"上汽大通"],
      ["五十铃D-MAX","皮卡","柴油",5,156000,"江西五十铃"],
      ["哈弗H5","SUV","柴油",5,148000,"长城汽车"],
      ["丰田RAV4","SUV","汽油",5,218000,"一汽丰田"],
      ["别克GL8","MPV","汽油",7,258000,"上汽通用"],
      ["金杯阁瑞斯","MPV","汽油",9,95000,"华晨金杯"],
      ["东风风行菱智","MPV","汽油",7,78000,"东风风行"],
      ["五菱宏光S","MPV","汽油",7,56000,"上汽通用五菱"],
      ["江淮瑞风M4","MPV","柴油",7,128000,"江淮汽车"],
      ["长安凯程F70","皮卡","柴油",5,112000,"长安汽车"],
      ["中兴威虎","皮卡","柴油",5,98000,"中兴汽车"],
      ["三菱欧蓝德","SUV","汽油",7,198000,"广汽三菱"],
      ["北汽勇士","SUV","汽油",7,185000,"北京汽车"],
      ["黄海N7","皮卡","汽油",5,119000,"黄海汽车"],
      ["福特全顺","MPV","柴油",12,175000,"江铃福特"],
    ] as const;

    // 区域对应颜色标记
    const regionMark = (r: string) => r === "华东" ? "🟦" : r === "华南" ? "🟩" : r === "西部" ? "🟨" : "🟥";

    const newAssets: typeof allAssets = [];
    const assetCounter = { instr: 19, veh: 11, off: 16, tool: 14 };

    for (let bi = 0; bi < branchRows.length; bi++) {
      const br = branchRows[bi];
      const { id: branchId, name: bName, region } = br;
      const mgr = getBranchManager(branchId);
      const ai = getBranchAI(branchId);
      const cus = ai || mgr;
      const seq = bi + 1;
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const rndDate = (mo: number) => `2026-0${mo}-${pad2(5 + (bi * 7) % 25)}`;

      // === 基础车辆 ===
      const vm = vehTmpl[bi];
      const vPlate = `京H·BR${pad2(seq)}`;
      const vDate = rndDate(Math.min(6, 1 + bi % 6));
      const vMile = 3000 + Math.floor(Math.random() * 25000);
      assetCounter.veh++;
      const vNo = `VEH-2026-${String(assetCounter.veh).padStart(3, "0")}`;
      newAssets.push({
        assetNo: vNo, name: `${bName.replace("外派分支", "")}工程车`, category: "VEHICLE",
        subCat: vm[1], model: vm[0], sn: `VIN-BR${String(seq).padStart(3, "0")}`, mfr: vm[5], date: vDate,
        price: vm[4], dept: branchId, custodian: cus, loc: `${bName}驻地`, status: "in_use",
        plate: vPlate, vin: `LGW${String.fromCharCode(65 + bi % 26)}${pad2(seq)}MH${pad2(seq + 50)}`,
        bp: vm[2], seats: vm[3], nextInsp: `2027-0${vDate.substring(5, 6)}-${vDate.substring(7, 9)}`,
        insuranceExp: `2027-${vDate.substring(5, 10)}`, mileage: vMile,
      });

      // === 基础仪器 ===
      const im = instTmpl[bi % instTmpl.length];
      const iDate = rndDate(Math.min(6, 2 + (bi * 2) % 5));
      const calExp = bi === 16; // 昆明分支：校准超期
      assetCounter.instr++;
      const iNo = `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`;
      newAssets.push({
        assetNo: iNo, name: `${im[0]}检测仪`, category: "INSTRUMENT",
        subCat: im[0], model: im[1], sn: `${im[1]}-BR${pad2(seq)}`, mfr: im[2], date: iDate,
        price: im[3], dept: branchId, custodian: cus, loc: `${bName}检测室`, status: "in_use",
        calDate: iDate, calCycle: im[4],
        calNext: calExp
          ? `2026-0${String(Math.min(6, 2 + bi % 5)).padStart(2, "0")}-${pad2(10 + bi % 20)}`
          : `2027-${iDate.substring(5, 10)}`,
      });

      // === 基础办公设备 ===
      const oDate = rndDate(Math.min(6, 3 + bi % 4));
      assetCounter.off++;
      const oNo = `OFF-2026-${String(assetCounter.off).padStart(3, "0")}`;
      newAssets.push({
        assetNo: oNo, name: "联想ThinkPad T14", category: "OFFICE",
        subCat: "笔记本", model: "T14 Gen5", sn: `TP-BR${pad2(seq)}`, mfr: "联想", date: oDate,
        price: 11500, dept: branchId, custodian: cus, loc: `${bName}办公区`, status: "in_use",
        os: "Windows 11 Pro", cpu: "i7-1365U", ram: "32GB", disk: "1TB SSD",
      });

      // === 基础工具 ===
      assetCounter.tool++;
      const tNo = `TOL-2026-${String(assetCounter.tool).padStart(3, "0")}`;
      newAssets.push({
        assetNo: tNo, name: "数字激光测距仪", category: "TOOL",
        subCat: "测量工具", model: "DISTO X6", sn: `LX6-BR${pad2(seq)}`, mfr: "Leica",
        date: rndDate(Math.min(6, 4 + bi % 3)), price: 4800, dept: branchId, custodian: cus,
        loc: `${bName}工具柜`, status: "in_use",
      });
    }

    // ===== 痛点注入：针对性集团管控问题资产 =====
    // 痛点1：闲置进口设备 (上海分支 bi=0)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "三维激光扫描仪（闲置）", category: "INSTRUMENT",
      subCat: "测量仪器", model: "P40", sn: "P40-SH-IMPORT", mfr: "Leica", date: "2025-09-01", price: 520000,
      dept: branchRows[0].id, custodian: null, loc: "上海分支仓库（从未使用）", status: "idle",
      calDate: "2025-09-01", calCycle: 12, calNext: "2026-09-01",
    });
    // 痛点2：重复采购 (南京 bi=1 — 和上海买同型号)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "三维激光扫描仪（重复采购）", category: "INSTRUMENT",
      subCat: "测量仪器", model: "P40", sn: "P40-NJ-DUP", mfr: "Leica", date: "2026-02-15", price: 530000,
      dept: branchRows[1].id, custodian: getBranchAI(branchRows[1].id), loc: "南京分支检测室", status: "in_use",
      calDate: "2026-02-15", calCycle: 12, calNext: "2027-02-15",
    });
    // 痛点3：跨属地调拨未记账 (杭州 bi=2 — 实物在苏州 bi=4)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "地质雷达", category: "INSTRUMENT",
      subCat: "地质雷达", model: "SIR-4000", sn: "SIR4000-HZ-SZ", mfr: "GSSI", date: "2026-01-20", price: 280000,
      dept: branchRows[2].id, custodian: getBranchAI(branchRows[4].id), loc: "苏州分支（从杭州私下调拨）", status: "in_use",
      calDate: "2026-01-20", calCycle: 12, calNext: "2027-01-20",
    });
    // 痛点4：自行采购不报备 (合肥 bi=3)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "X荧光光谱仪（自行采购）", category: "INSTRUMENT",
      subCat: "化学分析", model: "XRF-200", sn: "XRF200-HF-SELF", mfr: "Olympus", date: "2026-03-10", price: 42000,
      dept: branchRows[3].id, custodian: getBranchAI(branchRows[3].id), loc: "合肥分支检测室", status: "in_use",
      calDate: "2026-03-10", calCycle: 12, calNext: "2027-03-10",
    });
    // 痛点5：借出未归还 (宁波 bi=5)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "静力触探仪", category: "INSTRUMENT",
      subCat: "土工检测", model: "CPT-200", sn: "CPT200-NB-LENT", mfr: "荷兰Geomil", date: "2025-06-01", price: 165000,
      dept: branchRows[5].id, custodian: null, loc: "借给宁波港务局超期未还（已超期45天）", status: "idle",
      calDate: "2025-06-01", calCycle: 12, calNext: "2026-06-01",
    });
    // 痛点6：报废未下账 (广州 bi=6)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "老旧万能试验机（已报废）", category: "INSTRUMENT",
      subCat: "力学检测", model: "WE-600B", sn: "WE600-GZ-SCRAP", mfr: "济南试金", date: "2017-03-01", price: 38000,
      dept: branchRows[6].id, custodian: null, loc: "广州分支废弃设备区（已物理拆除）", status: "in_stock",
      calDate: "2022-06-01", calCycle: 12, calNext: "2023-06-01",
    });
    // 痛点7：离职员工资产未回收 (深圳 bi=7)
    assetCounter.off++;
    newAssets.push({
      assetNo: `OFF-2026-${String(assetCounter.off).padStart(3, "0")}`, name: "HP EliteBook 840（员工离职未归还）", category: "OFFICE",
      subCat: "笔记本", model: "EliteBook 840 G10", sn: "HP840-SZ-LOST", mfr: "惠普", date: "2025-11-01", price: 13999,
      dept: branchRows[7].id, custodian: getBranchManager(branchRows[7].id), loc: "原持有员工已离职·资产下落不明", status: "in_use",
      os: "Windows 11 Pro", cpu: "i7-1355U", ram: "16GB", disk: "512GB SSD",
    });
    // 痛点8：维修费用异常 (南宁 bi=8 — 皮卡一年修3次)
    assetCounter.veh++;
    newAssets.push({
      assetNo: `VEH-2026-${String(assetCounter.veh).padStart(3, "0")}`, name: "日产纳瓦拉（维修异常）", category: "VEHICLE",
      subCat: "皮卡", model: "纳瓦拉 2.5L", sn: "VIN-NN-FIX", mfr: "郑州日产", date: "2025-08-15", price: 169800,
      dept: branchRows[8].id, custodian: getBranchAI(branchRows[8].id), loc: "南宁分支驻地", status: "in_use",
      plate: "京I·NN09", vin: "LJNTGU5G8MN000009", bp: "汽油", seats: 5,
      nextInsp: "2026-08-15", insuranceExp: "2026-08-15", mileage: 38500,
    });
    // 痛点9：保管人信息不准 (福州 bi=9 — 管家登记为广州分支员工)
    assetCounter.tool++;
    newAssets.push({
      assetNo: `TOL-2026-${String(assetCounter.tool).padStart(3, "0")}`, name: "数显卡尺（保管人信息错误）", category: "TOOL",
      subCat: "测量工具", model: "500-196-30", sn: "MTG196-FZ-ERR", mfr: "Mitutoyo", date: "2025-10-01", price: 2600,
      dept: branchRows[9].id, custodian: getBranchManager(branchRows[6].id), loc: "福州分支测量室（实际使用人并非登记保管人）", status: "in_use",
    });
    // 痛点10：公车私用嫌疑 (海口 bi=10)
    assetCounter.veh++;
    newAssets.push({
      assetNo: `VEH-2026-${String(assetCounter.veh).padStart(3, "0")}`, name: "丰田RAV4（公车私用嫌疑）", category: "VEHICLE",
      subCat: "SUV", model: "RAV4 2.0L", sn: "VIN-HK-ABUSE", mfr: "一汽丰田", date: "2025-11-01", price: 218000,
      dept: branchRows[10].id, custodian: getBranchAI(branchRows[10].id), loc: "海口分支驻地", status: "in_use",
      plate: "京J·HK11", vin: "LFMK440F8MN000011", bp: "汽油", seats: 5,
      nextInsp: "2026-11-01", insuranceExp: "2026-11-01", mileage: 52000,
    });
    // 痛点11：闲置资源池不互通 (成都 bi=11 — 设备闲置但其他分支不知)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "隧道地质超前预报仪（闲置）", category: "INSTRUMENT",
      subCat: "隧道检测", model: "TSP-303", sn: "TSP303-CD-IDLE", mfr: "Amberg", date: "2025-05-01", price: 320000,
      dept: branchRows[11].id, custodian: null, loc: "成都分支仓库（项目已结束·闲置中）", status: "idle",
      calDate: "2025-05-01", calCycle: 12, calNext: "2026-05-01",
    });
    // 痛点12：新购未拆封虚增资产 (重庆 bi=12)
    assetCounter.off++;
    newAssets.push({
      assetNo: `OFF-2026-${String(assetCounter.off).padStart(3, "0")}`, name: "华为UPS5000-E（未拆封）", category: "OFFICE",
      subCat: "电源设备", model: "UPS5000-E-60kVA", sn: "HW-UPS-CQ-BOX", mfr: "华为", date: "2026-04-01", price: 85000,
      dept: branchRows[12].id, custodian: null, loc: "重庆分支库房（原箱未拆封）", status: "in_stock",
    });
    // 痛点13：借出外部未归还 (西安 bi=14)
    assetCounter.instr++;
    newAssets.push({
      assetNo: `INS-2026-${String(assetCounter.instr).padStart(3, "0")}`, name: "全站仪（借出中铁X局未归还）", category: "INSTRUMENT",
      subCat: "测量仪器", model: "TS16", sn: "TS16-XA-LENT", mfr: "Leica", date: "2025-08-01", price: 198000,
      dept: branchRows[14].id, custodian: null, loc: "借给中铁十四局3标（超期60天未还）", status: "idle",
      calDate: "2025-08-01", calCycle: 12, calNext: "2026-08-01",
    });
    // 痛点14：废旧设备未处置 (兰州 bi=15)
    assetCounter.tool++;
    newAssets.push({
      assetNo: `TOL-2026-${String(assetCounter.tool).padStart(3, "0")}`, name: "老旧混凝土取芯机（待报废）", category: "TOOL",
      subCat: "取样工具", model: "HZ-15", sn: "HZ15-LZ-SCRAP", mfr: "浙江土工仪器", date: "2018-06-01", price: 12000,
      dept: branchRows[15].id, custodian: null, loc: "兰州分支废弃库房（已锈蚀无法使用）", status: "idle",
    });
    // 痛点15：虚增资产·项目已结束 (北京 bi=16)
    assetCounter.off++;
    newAssets.push({
      assetNo: `OFF-2026-${String(assetCounter.off).padStart(3, "0")}`, name: "Dell服务器R740（项目已结但未销账）", category: "OFFICE",
      subCat: "服务器", model: "PowerEdge R740", sn: "DELL740-BJ-GHOST", mfr: "Dell", date: "2024-03-01", price: 68000,
      dept: branchRows[16].id, custodian: null, loc: "北京分支机房（对应项目已于2025年6月结项）", status: "idle",
    });
    // 痛点16：双属地管理·归属不清 (天津 bi=17)
    assetCounter.tool++;
    newAssets.push({
      assetNo: `TOL-2026-${String(assetCounter.tool).padStart(3, "0")}`, name: "超声波探伤仪（属地争议）", category: "TOOL",
      subCat: "探伤工具", model: "CTS-9009", sn: "CTS-TJ-DISPUTE", mfr: "汕头超声", date: "2025-12-01", price: 35000,
      dept: branchRows[17].id, custodian: getBranchAI(branchRows[16].id), loc: "北京-天津共用（两个分支均声称归属权）", status: "in_use",
    });
    // 痛点17：私车公养嫌疑 (石家庄 bi=18)
    assetCounter.veh++;
    newAssets.push({
      assetNo: `VEH-2026-${String(assetCounter.veh).padStart(3, "0")}`, name: "长城哈弗H9（油费异常）", category: "VEHICLE",
      subCat: "SUV", model: "哈弗H9 2.0T", sn: "VIN-SJZ-FUEL", mfr: "长城汽车", date: "2025-09-01", price: 258000,
      dept: branchRows[18].id, custodian: getBranchAI(branchRows[18].id), loc: "石家庄分支驻地", status: "in_use",
      plate: "京K·SJ19", vin: "LGWFF7A59MH000019", bp: "柴油", seats: 7,
      nextInsp: "2026-09-01", insuranceExp: "2026-09-01", mileage: 46000,
    });
    // 痛点18：账实地址不符 (郑州 bi=19)
    assetCounter.off++;
    newAssets.push({
      assetNo: `OFF-2026-${String(assetCounter.off).padStart(3, "0")}`, name: "联想ThinkStation P360", category: "OFFICE",
      subCat: "工作站", model: "P360 Ultra", sn: "LEN360-ZZ-GONE", mfr: "联想", date: "2026-01-10", price: 22000,
      dept: branchRows[19].id, custodian: getBranchAI(branchRows[19].id), loc: "注册地址郑州·实际在洛阳工地使用", status: "in_use",
      os: "Windows 11 Pro", cpu: "i7-12700", ram: "64GB", disk: "1TB SSD",
    });

    // 插入所有分支新资产（沿用plate前缀规避跨租户车牌冲突）
    const branchAssetIds: number[] = [];
    for (const a of newAssets) {
      const r = dbRun(
        `INSERT INTO assets (asset_no, name, category, sub_category, model, sn, manufacturer,
          purchase_date, purchase_price, expected_life, status, owner_type,
          department_id, location_detail, custodian_id, remark, tenant_id, created_by, warranty_expire_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'owned',?,?,?,?,?,?,?)`,
        [anoPrefix + a.assetNo, a.name, a.category, a.subCat || null, a.model || null,
         a.sn || null, a.mfr || null, a.date || null, a.price, 60, a.status,
         a.dept, a.loc || null, a.custodian, null, tenantId, 1, addMonths(a.date, 60)]
      );
      branchAssetIds.push(r.lastInsertRowid as number);
    }

    // 车辆扩展 + 使用日志（仅基线20辆 + 痛点头3辆）
    const allBranchVehAssets = newAssets.filter(a => a.category === "VEHICLE");
    for (let vi = 0; vi < allBranchVehAssets.length; vi++) {
      const a = allBranchVehAssets[vi];
      const aid = branchAssetIds[newAssets.indexOf(a)];
      dbRun(`INSERT INTO asset_vehicles (asset_id, plate_no, vin, fuel_type, seat_count, next_inspection, insurance_expire, current_mileage) VALUES (?,?,?,?,?,?,?,?)`,
        [aid, platePrefix + (a.plate || `京H·XX${vi}`), a.vin || `VIN-BR${vi}`, a.bp || "汽油", a.seats || 5, a.nextInsp || null, a.insuranceExp || null, a.mileage || 5000]);
      // 每车3-5条使用日志
      const logMiles = [a.mileage! * 0.2, a.mileage! * 0.5, a.mileage! * 0.75].map(m => Math.round(m));
      const logTypes = ["refuel", "refuel", "maintenance", "refuel", "insurance"] as const;
      const logCosts = [380 + vi * 30, 420 + vi * 25, 800 + vi * 100, 350 + vi * 20, 2500 + vi * 200];
      const logDates = [`2026-0${Math.min(6,2+vi%5)}-${String(5+(vi*3)%25).padStart(2,'0')}`,
                        `2026-0${Math.min(6,3+vi%4)}-${String(10+(vi*5)%20).padStart(2,'0')}`,
                        `2026-0${Math.min(6,4+vi%3)}-${String(15+(vi*2)%15).padStart(2,'0')}`,
                        `2026-0${Math.min(6,5+vi%2)}-${String(8+(vi*4)%22).padStart(2,'0')}`,
                        `2026-06-${String(20+vi).padStart(2,'0')}`];
      const logDescs = [`${['华东','华南','西部','华北'][vi%4]}区域巡检加油`, "日常出车加油", "定期保养", "送检样品加油", "续保"];
      const logCount = vi < 20 ? 4 : 5;
      for (let li = 0; li < logCount; li++) {
        dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
          [aid, logTypes[li], logCosts[li], logMiles[Math.min(li, 2)], logDates[li], logDescs[li], tenantId]);
      }
    }

    // 痛点车辆特殊日志：南宁维修异常（newAssets倒数第5辆）
    const nnVehIdx = allBranchVehAssets.findIndex(a => a.assetNo.includes("VEH") && a.name.includes("纳瓦拉（维修异常）"));
    if (nnVehIdx >= 0) {
      const nnAid = branchAssetIds[newAssets.indexOf(allBranchVehAssets[nnVehIdx])];
      const extraLogs = [
        { type: "maintenance", cost: 8500, mileage: 12000, date: "2026-02-15", desc: "⚠️ 发动机大修（购置仅6个月）" },
        { type: "maintenance", cost: 6800, mileage: 22000, date: "2026-05-10", desc: "⚠️ 变速箱故障维修（第二次大修）" },
        { type: "other", cost: 3500, mileage: 32000, date: "2026-06-20", desc: "⚠️ 更换四条轮胎（异常磨损）" },
      ];
      for (const el of extraLogs) {
        dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
          [nnAid, el.type, el.cost, el.mileage, el.date, el.desc, tenantId]);
      }
    }

    // 痛点车辆特殊日志：海口公车私用（倒数第3辆）
    const hkVehIdx = allBranchVehAssets.findIndex(a => a.assetNo.includes("VEH") && a.name.includes("RAV4（公车私用嫌疑）"));
    if (hkVehIdx >= 0) {
      const hkAid = branchAssetIds[newAssets.indexOf(allBranchVehAssets[hkVehIdx])];
      const hkLogs = [
        { type: "refuel", cost: 550, mileage: 25000, date: "2026-05-01", desc: "⚠️ 五一假期出车加油（非常规工作日）" },
        { type: "traffic_fine", cost: 300, mileage: 35000, date: "2026-05-20", desc: "⚠️ 景区违停（三亚某景区·非公务）" },
        { type: "refuel", cost: 620, mileage: 42000, date: "2026-06-15", desc: "⚠️ 周末出车长途加油（无出差审批记录）" },
      ];
      for (const hl of hkLogs) {
        dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
          [hkAid, hl.type, hl.cost, hl.mileage, hl.date, hl.desc, tenantId]);
      }
    }

    // 痛点车辆特殊日志：石家庄私车公养（最后一辆）
    const sjzVehIdx = allBranchVehAssets.findIndex(a => a.assetNo.includes("VEH") && a.name.includes("哈弗H9（油费异常）"));
    if (sjzVehIdx >= 0) {
      const sjzAid = branchAssetIds[newAssets.indexOf(allBranchVehAssets[sjzVehIdx])];
      const sjzLogs = [
        { type: "refuel", cost: 850, mileage: 18000, date: "2026-03-08", desc: "⚠️ 单次加油850元超出油箱容量（容积80L×7.5=600元上限）" },
        { type: "refuel", cost: 780, mileage: 26000, date: "2026-04-25", desc: "⚠️ 周末加油780元·无对应出差审批" },
        { type: "refuel", cost: 920, mileage: 38000, date: "2026-06-10", desc: "⚠️ 加油量异常（按油价折算超出油箱容积40%）" },
      ];
      for (const sl of sjzLogs) {
        dbRun(`INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id) VALUES (?,?,?,?,?,?,1,?)`,
          [sjzAid, sl.type, sl.cost, sl.mileage, sl.date, sl.desc, tenantId]);
      }
    }

    // 仪器扩展（所有仪器资产，含痛点仪器）
    const allBranchInstAssets = newAssets.filter(a => a.category === "INSTRUMENT");
    for (const ia of allBranchInstAssets) {
      if (ia.calDate) {
        const aid = branchAssetIds[newAssets.indexOf(ia)];
        dbRun("INSERT INTO asset_instruments (asset_id, last_calibration, next_calibration, calibration_cycle) VALUES (?,?,?,?)",
          [aid, ia.calDate, ia.calNext || null, ia.calCycle || 12]);
      }
    }

    // 办公设备扩展
    const allBranchOffAssets = newAssets.filter(a => a.category === "OFFICE" && a.os);
    for (const oa of allBranchOffAssets) {
      const aid = branchAssetIds[newAssets.indexOf(oa)];
      dbRun("INSERT INTO asset_office (asset_id, os, cpu, ram, storage) VALUES (?,?,?,?,?)",
        [aid, oa.os || null, oa.cpu || null, oa.ram || null, oa.disk || null]);
    }

    // 流转记录（痛点资产）
    const tr = (assetIdx: number, type: string, remark: string, toUserId: number|null = null, date: string = "2026-06-01 10:00:00") => {
      const aid = branchAssetIds[assetIdx];
      if (toUserId) {
        dbRun(`INSERT INTO asset_transactions (asset_id, type, to_user_id, remark, tenant_id, created_by, created_at) VALUES (?,?,?,?,?,1,?)`,
          [aid, type, toUserId, remark, tenantId, date]);
      } else {
        dbRun(`INSERT INTO asset_transactions (asset_id, type, remark, tenant_id, created_by, created_at) VALUES (?,?,?,?,1,?)`,
          [aid, type, remark, tenantId, date]);
      }
    };
    // 痛点索引在newAssets中的位置: 80基线 + 0..17痛点 = 共98件
    const pIdx = 80; // 痛点起始索引
    tr(pIdx+0, "transfer", "⚠️ 上海分支2025年进口5.2万元扫描仪，购入后从未使用——闲置已超9个月，年维保费约8000元沉没成本。建议调拨至有需求标段");
    tr(pIdx+1, "checkout", "⚠️ 南京分支重复采购P40扫描仪（上海已有同型号），浪费53万元。两分支间无资产共享机制", getBranchAI(branchRows[1].id));
    tr(pIdx+2, "transfer", "⚠️ 账面归属杭州分支，但实物在苏州分支使用（2026-03私下调拨未走正式流程）。跨属地资产流动无系统记录", getBranchAI(branchRows[4].id));
    tr(pIdx+3, "checkout", "⚠️ 合肥分支自行采购荧光光谱仪，未走总部采购审批流程，3个月后补登记。外派点采购权限边界模糊", getBranchAI(branchRows[3].id));
    tr(pIdx+4, "lend_out", "⚠️ 宁波分支借给港务局，原定借期1个月，已超期45天未归还。借出流程缺失正式审批+归还提醒机制");
    tr(pIdx+5, "transfer", "⚠️ 2017年购入万能试验机，2023年物理报废拆除但系统始终未执行scrap操作——报废审批流程阻断超过3年");
    tr(pIdx+6, "checkout", "⚠️ 持有该笔记本的员工2026年4月离职，资产未回收入库。离职交接流程未覆盖资产归还环节", getBranchManager(branchRows[7].id));
    tr(pIdx+7, "checkout", "⚠️ 购置不到1年大修3次（发动机+变速箱+轮胎），累计维修费1.88万元超过车辆残值50%。异常维修无溯源分析", getBranchAI(branchRows[8].id));
    tr(pIdx+8, "checkout", "⚠️ 保管人登记为广州分支经理，实际使用人为福州分支测量员——保管人信息严重失实（跨区域错误）", getBranchManager(branchRows[6].id));
    tr(pIdx+9, "checkout", "⚠️ 行车日志显示多次非工作时段出车（含五一假期三亚景区、周末长途），无对应出差审批——存在公车私用重大嫌疑", getBranchAI(branchRows[10].id));
    tr(pIdx+10, "transfer", "⚠️ 32万元隧道预报仪项目结束后闲置7个月，总部闲置资产池不可见。各分支间无统一的闲置资产共享调度平台");
    tr(pIdx+11, "transfer", "⚠️ 8.5万元UPS设备采购后原箱未拆封存放库房——'买错了用不上'。采购决策缺乏技术审核环节，存在虚增资产嫌疑");
    tr(pIdx+12, "lend_out", "⚠️ 西安分支2025-08借给中铁十四局，原借期3个月已超期60天。对方口头表示'工程延后还需续借'，无正式续借审批");
    tr(pIdx+13, "transfer", "⚠️ 2018年购入取芯机已完全锈蚀无法使用，但系统一直未走报废处置流程。废旧资产长期挂账影响资产利用率指标");
    tr(pIdx+14, "transfer", "⚠️ 2024年购入服务器用于北京某市政项目，项目2025年6月已结项验收，但资产至今未销账也未调拨其他分支——虚增资产6.8万元");
    tr(pIdx+15, "checkout", "⚠️ 设备被北京和天津两个分支同时主张归属权。因购买时使用'京-津联合作业组'名义，无明确部门归属标识", getBranchAI(branchRows[16].id));
    tr(pIdx+16, "checkout", "⚠️ 加油记录3次异常：单次超油箱容量、周末无审批出车、折算超出油箱40%。疑似私车公养——油费转嫁到公务车辆", getBranchAI(branchRows[18].id));
    tr(pIdx+17, "checkout", "⚠️ 账面注册地址为郑州分支，但设备长期在洛阳工地实际使用——台账地址与实际存放地严重不符，影响盘点准确率", getBranchAI(branchRows[19].id));

    console.log(`[种子] tenant#${tenantId} 分支级资产完成: +${newAssets.length}件（含${18}件痛点场景）`);
  }
  console.log(`[种子] tenant#${tenantId} 资产种子完成: ${allAssets.length}件常规 + 分支级扩展`);

  // ═══════════════════════════════════════════════════════════
  // 第五批：集团管控规模扩展 → 每租户 5000 件
  // 路桥通级别：总部十七部门 + 4大区 + 20分支 + 40项目 + 60标段
  // ═══════════════════════════════════════════════════════════
  const db = getDb();
  const allDepts = dbAll("SELECT id, name, parent_id FROM departments WHERE tenant_id=?", [tenantId]) as any[];

  // 部门分类（按名称模式，兼容两租户）
  const hqDepts    = allDepts.filter(d => !d.name.includes("区域") && !d.name.includes("项目") && !d.name.includes("试验室") && !d.name.includes("标段") && (d.parent_id === null || d.parent_id === 0) && !d.name.includes("分支"));
  const regionDepts = allDepts.filter(d => d.name.includes("区域"));                // 4大区
  const branchDepts = allDepts.filter(d => d.name.includes("分支"));                // 20分支
  const projectDepts= allDepts.filter(d => d.name.includes("项目") && !d.name.includes("试验室")); // 40项目
  const labDepts    = allDepts.filter(d => d.name.includes("试验室") || d.name.includes("标段"));  // 60标段
  // 漏网之鱼归入HQ
  const usedIds = new Set([...hqDepts, ...regionDepts, ...branchDepts, ...projectDepts, ...labDepts].map(d => d.id));
  const restDepts = allDepts.filter(d => !usedIds.has(d.id));
  hqDepts.push(...restDepts);

  // 配额：每部门追加额外资产数（加上现有158件后达5000）
  const quotaHQ = 35;      // hqDepts件/部门
  const quotaRegion = 45;   // 4区域件/部门
  const quotaBranch = 70;   // 20分支件/部门（已含80基线，追加70≈150件/分支）
  const quotaProject = 38;  // 40项目件/部门
  const quotaLab = 14;      // 60标段件/部门
  const quotaIdle = 250;    // 闲置池（无部门归属）

  // 资产模板库
  const tmpl = {
    INSTRUMENT: [
      { name: "全站仪", model: "TS16", mfr: "徕卡测量", subCat: "测绘仪器", price: 185000 },
      { name: "电子水准仪", model: "DINI03", mfr: "Trimble", subCat: "测绘仪器", price: 42000 },
      { name: "激光断面仪", model: "LPS-300", mfr: "中交一公院", subCat: "检测仪器", price: 260000 },
      { name: "数显回弹仪", model: "HT-225D", mfr: "北京智博联", subCat: "检测仪器", price: 13000 },
      { name: "钢筋扫描仪", model: "PS300", mfr: "Hilti", subCat: "检测仪器", price: 38000 },
      { name: "裂缝测宽仪", model: "PTS-C10", mfr: "北京光电", subCat: "检测仪器", price: 15000 },
      { name: "超声波探伤仪", model: "USN60", mfr: "GE检测", subCat: "检测仪器", price: 96000 },
      { name: "地质雷达", model: "SIR-4000", mfr: "GSSI", subCat: "物探仪器", price: 420000 },
      { name: "多功能气候试验箱", model: "CTC256", mfr: "Memmert", subCat: "试验设备", price: 185000 },
      { name: "万能材料试验机", model: "WE-600B", mfr: "济南试金", subCat: "试验设备", price: 58000 },
      { name: "标准养护箱", model: "HBY-40B", mfr: "浙江土工", subCat: "试验设备", price: 22000 },
      { name: "混凝土电阻率仪", model: "Resipod", mfr: "Proceq", subCat: "检测仪器", price: 52000 },
      { name: "激光平整度仪", model: "RSP-MK4", mfr: "Dynatest", subCat: "检测仪器", price: 350000 },
      { name: "锚杆拉拔仪", model: "ML-300B", mfr: "北京海创", subCat: "检测仪器", price: 24000 },
      { name: "基桩动测仪", model: "PIT-V", mfr: "PDI", subCat: "检测仪器", price: 128000 },
    ],
    VEHICLE: [
      { name: "丰田普拉多", model: "3.5L V6", mfr: "一汽丰田", subCat: "SUV", price: 498000, plate: (i:number)=>`京A·PR${String(i).padStart(3,'0')}`, seats:7, bp:"汽油" },
      { name: "三菱帕杰罗", model: "3.0L V6", mfr: "广汽三菱", subCat: "SUV", price: 368000, plate: (i:number)=>`京B·PJ${String(i).padStart(3,'0')}`, seats:7, bp:"汽油" },
      { name: "长城炮皮卡", model: "2.0T 四驱", mfr: "长城汽车", subCat: "皮卡", price: 168000, plate: (i:number)=>`京C·CC${String(i).padStart(3,'0')}`, seats:5, bp:"柴油" },
      { name: "江铃域虎", model: "2.4T 四驱", mfr: "江铃汽车", subCat: "皮卡", price: 135000, plate: (i:number)=>`京D·YH${String(i).padStart(3,'0')}`, seats:5, bp:"柴油" },
      { name: "依维柯工程车", model: "Daily 3.0T", mfr: "南京依维柯", subCat: "专项作业车", price: 285000, plate: (i:number)=>`京E·GC${String(i).padStart(3,'0')}`, seats:17, bp:"柴油" },
      { name: "金杯海狮", model: "2.0L", mfr: "华晨金杯", subCat: "面包车", price: 85000, plate: (i:number)=>`京F·HS${String(i).padStart(3,'0')}`, seats:11, bp:"汽油" },
    ],
    OFFICE: [
      { name: "ThinkPad笔记本", model: "T14 Gen5", mfr: "联想", subCat: "笔记本", price: 9800 },
      { name: "Dell台式机", model: "OptiPlex 7080", mfr: "戴尔", subCat: "台式机", price: 6500 },
      { name: "HP激光打印机", model: "M404dn", mfr: "惠普", subCat: "打印机", price: 3200 },
      { name: "Canon工程扫描仪", model: "DR-G2110", mfr: "佳能", subCat: "扫描仪", price: 28000 },
      { name: "格力空调", model: "KFR-72LW", mfr: "格力", subCat: "空调", price: 6500 },
      { name: "华为交换机", model: "S5735-L48P4X", mfr: "华为", subCat: "网络设备", price: 15000 },
      { name: "山特UPS电源", model: "C6KS 6kVA", mfr: "山特", subCat: "电源设备", price: 12000 },
      { name: "会议平板", model: "MAXHUB V6", mfr: "视源股份", subCat: "会议设备", price: 35000 },
      { name: "SONY投影仪", model: "VPL-FHZ85", mfr: "索尼", subCat: "投影仪", price: 28000 },
      { name: "海康威视监控", model: "DS-2CD2T47G2", mfr: "海康威视", subCat: "安防设备", price: 2500 },
    ],
    TOOL: [
      { name: "混凝土试模", model: "150×150×150mm", mfr: "浙江土工", subCat: "试验模具", price: 120 },
      { name: "精密电子天平", model: "ME204E", mfr: "梅特勒-托利多", subCat: "称量工具", price: 18000 },
      { name: "数显卡尺", model: "500-196-30", mfr: "Mitutoyo", subCat: "测量工具", price: 2600 },
      { name: "混凝土钻孔机", model: "HDE-1622", mfr: "Hilti", subCat: "取样工具", price: 15000 },
      { name: "钢筋调直切断机", model: "GT4-14", mfr: "山东路通", subCat: "加工工具", price: 12000 },
      { name: "电动扳手", model: "GDS 18V-1050", mfr: "Bosch", subCat: "安装工具", price: 3200 },
      { name: "激光测距仪", model: "DISTO D5", mfr: "徕卡", subCat: "测量工具", price: 4800 },
      { name: "土工密度仪", model: "SD-320", mfr: "北京航天", subCat: "检测工具", price: 8500 },
    ],
  };

  const catKeys = ["INSTRUMENT", "VEHICLE", "OFFICE", "TOOL"] as const;
  // 类目分布权重：按部门类型差异化
  // 铁律：总部/区域=管理职能，绝不允许任何仪器/工具（全站仪/卡尺/天平/扫描仪不出现在管理层办公室）
  //            INSTRUMENT VEHICLE OFFICE TOOL
  const deptCatWeights: Record<string, number[]> = {
    hq:      [0.00, 0.24, 0.76, 0.00],  // 总部: 只有OFFICE+SUV，0%仪器+工具
    region:  [0.00, 0.22, 0.78, 0.00],  // 区域: 只有OFFICE+车辆，0%仪器+工具（管理非生产一线）
    branch:  [0.30, 0.15, 0.30, 0.25],  // 分支/监理: 现场检测+办公
    project: [0.42, 0.15, 0.10, 0.33],  // 项目: 工程仪器+工具为主，少量办公
    lab:     [0.48, 0.05, 0.07, 0.40],  // 标段/试验室: 试验+检测为主
    idle:    [0.30, 0.20, 0.25, 0.25],  // 闲置池: 混杂
  };
  const statusPool = [
    { s:"in_use", w:0.60 }, { s:"in_stock", w:0.18 }, { s:"idle", w:0.10 },
    { s:"repairing", w:0.05 }, { s:"transferring", w:0.03 }, { s:"scrapped", w:0.03 }, { s:"lost", w:0.01 },
  ];

  function pickCat(r: number, deptType: string): typeof catKeys[number] {
    const w = deptCatWeights[deptType] || deptCatWeights.idle;
    let acc = 0;
    for (let i = 0; i < catKeys.length; i++) { acc += w[i]; if (r < acc) return catKeys[i]; }
    return "OFFICE";
  }
  function pickStatus(r: number): string {
    let acc = 0;
    for (const st of statusPool) { acc += st.w; if (r < acc) return st.s; }
    return "in_use";
  }

  // 按部门分配 & 批量生成（带类型标记，后续按类型分配合适类目）
  const deptQuotas: { deptId: number; deptName: string; count: number; type: string }[] = [];
  for (const d of hqDepts)    deptQuotas.push({ deptId: d.id, deptName: d.name, count: quotaHQ, type: "hq" });
  for (const d of regionDepts) deptQuotas.push({ deptId: d.id, deptName: d.name, count: quotaRegion, type: "region" });
  for (const d of branchDepts) deptQuotas.push({ deptId: d.id, deptName: d.name, count: quotaBranch, type: "branch" });
  for (const d of projectDepts)deptQuotas.push({ deptId: d.id, deptName: d.name, count: quotaProject, type: "project" });
  for (const d of labDepts)    deptQuotas.push({ deptId: d.id, deptName: d.name, count: quotaLab, type: "lab" });
  deptQuotas.push({ deptId: 0, deptName: "闲置池(无归属)", count: quotaIdle, type: "idle" }); // deptId=0 → NULL

  let globalSeq = allAssets.length; // 继续编号
  const batchSize = 500;
  let batchCount = 0;
  let totalAdded = 0;
  const startTime = Date.now();

  db.run("BEGIN TRANSACTION");

  for (const dq of deptQuotas) {
    for (let i = 0; i < dq.count; i++) {
      globalSeq++;
      const cat = pickCat(Math.random(), dq.type);
      let tArr = tmpl[cat];
      // 常识约束：车辆类型按部门筛选
      //   HQ→仅SUV(普拉多/帕杰罗，行政用车), 项目→工程车(皮卡/作业车/面包车)
      if (cat === "VEHICLE") {
        const vehFilter: Record<string, string[]> = {
          hq: ["SUV"],                   // 总部只配SUV，不配面包车/皮卡
          region: ["SUV","皮卡","面包车"],
          branch: ["SUV","皮卡","面包车"],
          project: ["皮卡","专项作业车","面包车"],
          lab: ["皮卡"],
          idle: ["SUV","皮卡","专项作业车","面包车"],
        };
        const allowed = vehFilter[dq.type] || vehFilter.idle;
        tArr = tArr.filter((v: any) => allowed.includes(v.subCat));
      }
      // 常识约束：仪器类型按部门筛选（HQ/region权重已为0，此过滤为安全兜底）
      if (cat === "INSTRUMENT") {
        const instFilter: Record<string, string[] | null> = {
          hq: null,     // HQ/region不应有仪器（权重已清零）
          region: null,
          branch: null,
          project: null,
          lab: null,
          idle: null,
        };
        const filterSubcats = instFilter[dq.type];
        if (filterSubcats) {
          tArr = tArr.filter((v: any) => filterSubcats.includes(v.subCat));
        }
        if (tArr.length === 0) tArr = tmpl[cat];
      }
      // 常识约束：工具类型按部门筛选（HQ/region权重已为0，此过滤为安全兜底）
      if (cat === "TOOL") {
        const toolFilter: Record<string, string[] | null> = {
          hq: null,     // HQ/region不应有工具（权重已清零）
          region: null,
          branch: null,  // 分支=全品类工具
          project: null, // 项目=全品类
          lab: null,     // 标段=全品类
          idle: null,    // 闲置池=全品类
        };
        const filterSubcats = toolFilter[dq.type];
        if (filterSubcats) {
          tArr = tArr.filter((v: any) => filterSubcats.includes(v.subCat));
        }
        if (tArr.length === 0) tArr = tmpl[cat];
      }
      // 常识约束：总部办公设备排除工程扫描仪（CXO办公室不需要图纸扫描仪）
      if (cat === "OFFICE" && (dq.type === "hq" || dq.type === "region")) {
        tArr = tArr.filter((v: any) => v.subCat !== "扫描仪");
      }
      const t = tArr[globalSeq % tArr.length];
      const sRnd = Math.random();
      const status = pickStatus(sRnd);

      // 日期：2022-2026 之间随机
      const y = 2022 + (globalSeq % 5);
      const m = String((globalSeq % 12) + 1).padStart(2, "0");
      const d = String(((globalSeq * 7) % 28) + 1).padStart(2, "0");
      const purchaseDate = `${y}-${m}-${d}`;
      const priceVariation = 0.7 + Math.random() * 0.6; // 70%-130% 基准价
      const price = Math.round((t.price || 10000) * priceVariation);
      const life = cat === "VEHICLE" ? 96 : cat === "INSTRUMENT" ? 72 : cat === "OFFICE" ? 48 : 60;
      const warrantyExp = addMonths(purchaseDate, life);
      const deptId = dq.deptId === 0 ? null : dq.deptId;
      const sn = `${t.mfr?.substring(0,2) || "XX"}${Date.now().toString(36).substring(4,8)}${globalSeq}`;
      const assetNo = `${anoPrefix}${cat.substring(0,3)}-${y}-${String(globalSeq).padStart(5,"0")}`;
      // 保管人：从该部门随机抽取一名员工（人类优先，AI其次）
      const cEmp = deptId ? (dbGet("SELECT id FROM employees WHERE department_id=? AND tenant_id=? AND employee_type='human' LIMIT 1", [deptId, tenantId]) as any)?.id || null : null;
      const custodianId = status === "in_use" ? cEmp : null;
      const remark = status === "scrapped" ? "待报废处置" : status === "idle" ? "闲置中" : status === "lost" ? "盘亏待追责" : null;

      db.run(
        `INSERT INTO assets (asset_no,name,category,sub_category,model,sn,manufacturer,
          purchase_date,purchase_price,expected_life,status,owner_type,
          department_id,location_detail,custodian_id,remark,tenant_id,created_by,warranty_expire_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'owned',?,?,?,?,?,?,?)`,
        [assetNo, t.name, cat, (t as any).subCat || null, t.model, sn, t.mfr,
         purchaseDate, price, life, status,
         deptId, dq.deptName || null, custodianId, remark, tenantId, 1, warrantyExp]
      );
      totalAdded++;

      // 车辆扩展表（约15%概率）
      if (cat === "VEHICLE" && Math.random() < 0.15) {
        const vT = t as any;
        const plate = `${platePrefix}${vT.plate ? vT.plate(globalSeq) : `京G·BK${globalSeq}`}`;
        const vin = `VIN-MASS-${String(globalSeq).padStart(6,"0")}`;
        const inspDate = new Date(); inspDate.setFullYear(inspDate.getFullYear() + (globalSeq % 3));
        const insDate = new Date(); insDate.setFullYear(insDate.getFullYear() + (globalSeq % 2));
        db.run(`INSERT OR IGNORE INTO asset_vehicles (asset_id,plate_no,vin,fuel_type,seat_count,next_inspection,insurance_expire,current_mileage) VALUES ((SELECT last_insert_rowid()),?,?,?,?,?,?,?)`,
          [plate, vin, vT.bp || "汽油", vT.seats || 5, inspDate.toISOString().split("T")[0], insDate.toISOString().split("T")[0], Math.round(5000 + Math.random() * 80000)]);
      }
      // 仪器校准（约15%概率）
      if (cat === "INSTRUMENT" && Math.random() < 0.15) {
        const calDate = new Date(); calDate.setMonth(calDate.getMonth() - (globalSeq % 18));
        const calNext = new Date(calDate); calNext.setMonth(calNext.getMonth() + 12);
        db.run(`INSERT OR IGNORE INTO asset_instruments (asset_id,calibration_cycle,last_calibration,next_calibration,calibration_agency,precision_level) VALUES ((SELECT last_insert_rowid()),?,?,?,?,?)`,
          [12, calDate.toISOString().split("T")[0], calNext.toISOString().split("T")[0], `${["中国计量院","省计量院","市计量所"][globalSeq%3]}`, `${["1级","2级","3级"][globalSeq%3]}`]);
      }
      // 办公设备扩展（约10%概率）
      if (cat === "OFFICE" && Math.random() < 0.10) {
        db.run(`INSERT OR IGNORE INTO asset_office (asset_id,device_type,brand,cpu,ram,storage,os) VALUES ((SELECT last_insert_rowid()),?,?,?,?,?,?)`,
          [(t as any).subCat, t.mfr, `${["i5","i7","i9","M1","M2"][globalSeq%5]}-${["12代","13代","14代"][globalSeq%3]}`, `${[8,16,32,64][globalSeq%4]}GB`, `${[256,512,1024][globalSeq%3]}GB SSD`, "Windows 11"]);
      }

      // 分批 commit 避免事务过大
      if (totalAdded % batchSize === 0) {
        db.run("COMMIT");
        db.run("BEGIN TRANSACTION");
        batchCount++;
        if (batchCount % 5 === 0) console.log(`[种子] tenant#${tenantId} 集团扩展进度: ${totalAdded}件...`);
      }
    }
  }

  db.run("COMMIT");
  saveDb();
  const elapsed = Date.now() - startTime;
  console.log(`[种子] tenant#${tenantId} 集团规模扩展完成: +${totalAdded}件, 耗时${elapsed}ms`);
}
