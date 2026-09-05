export interface AgentTemplate {
  role: string;
  description: string;
  skills: string[];
  rank: number;
}

export const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  // Rank 1 决策层
  chairman: { role: "董事长顾问", description: "战略决策、资本运作、行业布局、生态构建", skills: ["战略规划", "资本运作", "行业洞察", "投资决策"], rank: 1 },
  ceo: { role: "首席执行官", description: "经营决策、全局统筹、资源调度、重大客户决策", skills: ["战略规划", "经营决策", "团队管理", "商业谈判"], rank: 1 },

  // Rank 2 高管层
  cto: { role: "首席技术官", description: "技术战略制定、产品路线规划、研发资源管理、交付质量保障", skills: ["技术架构", "系统设计", "代码审查", "技术选型"], rank: 2 },
  cfo: { role: "首席财务官", description: "财务战略、预算管控、投融资决策、合规管理", skills: ["财务分析", "预算管理", "成本控制", "投资评估"], rank: 2 },
  cmo: { role: "首席市场官", description: "市场策略、品牌推广、渠道建设、营收增长", skills: ["市场策略", "品牌推广", "数据分析", "客户洞察"], rank: 2 },
  coo: { role: "首席运营官", description: "运营效率、流程优化、跨部门协同、客户成功", skills: ["运营管理", "流程优化", "资源调度", "数据驱动"], rank: 2 },
  cho: { role: "首席人力官", description: "人才战略、组织发展、文化建设、薪酬体系", skills: ["人才管理", "组织发展", "绩效设计", "文化建设"], rank: 2 },
  cao: { role: "首席行政官", description: "行政保障、合规风控、制度建设、后勤管理", skills: ["行政管理", "合规风控", "制度建设", "供应商管理"], rank: 2 },
  cpo: { role: "首席产品官", description: "产品战略、用户研究、产品规划、创新孵化", skills: ["产品规划", "用户研究", "需求分析", "数据驱动"], rank: 2 },
  cdo: { role: "首席数据官", description: "数据战略、数据治理、数据资产、AI应用", skills: ["数据治理", "数据平台", "BI分析", "AI应用"], rank: 2 },
  cso: { role: "首席战略官", description: "战略规划、行业研究、竞争分析、战略落地", skills: ["战略规划", "行业研究", "竞争分析", "商业模式"], rank: 2 },
  cco: { role: "首席客户官", description: "客户关系、客户成功、客户体验、口碑建设", skills: ["客户管理", "客户成功", "体验设计", "满意度提升"], rank: 2 },

  // Rank 3 总监层
  tech_architect: { role: "技术架构师", description: "系统架构设计、技术选型评估、架构评审、技术预研", skills: ["系统设计", "技术选型", "架构评审", "性能优化"], rank: 3 },
  hr_manager: { role: "人力资源总监", description: "人才招聘、培训发展、绩效管理、员工关系", skills: ["人才招聘", "培训发展", "绩效管理", "员工关系"], rank: 3 },
  sales_manager: { role: "商务总监", description: "营收目标达成、客户开发、商务谈判、渠道管理", skills: ["商务谈判", "客户开发", "渠道管理", "合同管理"], rank: 3 },
  strategy_executive: { role: "战略执行总监", description: "战略分解、OKR管理、执行跟踪、复盘改进", skills: ["OKR管理", "战略分解", "执行跟踪", "复盘改进"], rank: 3 },
  finance_director: { role: "财务总监", description: "财务核算、报表编制、税务筹划、资金管理", skills: ["财务核算", "报表编制", "税务筹划", "资金管理"], rank: 3 },
  presales_architect: { role: "售前架构师", description: "方案设计、售前支持、需求分析、技术咨询", skills: ["方案设计", "售前支持", "需求分析", "技术咨询"], rank: 3 },
  legal_advisor: { role: "法务顾问", description: "合同审查、法律咨询、合规检查、知识产权", skills: ["合同审查", "法律咨询", "合规检查", "知识产权"], rank: 3 },

  // Rank 4 经理层
  frontend_dev: { role: "前端工程师", description: "前端架构设计、UI组件开发、性能优化、用户体验", skills: ["React", "TypeScript", "Tailwind CSS", "前端性能优化"], rank: 4 },
  backend_dev: { role: "后端工程师", description: "后端架构设计、API开发、数据库管理、系统稳定性", skills: ["Node.js", "PostgreSQL", "Redis", "API设计"], rank: 4 },
  fullstack_dev: { role: "全栈工程师", description: "全栈开发、前后端联调、架构设计、技术选型", skills: ["React", "Node.js", "数据库", "系统设计"], rank: 4 },
  mobile_dev: { role: "移动端工程师", description: "移动应用开发、跨平台方案、性能优化、发布管理", skills: ["React Native", "Flutter", "iOS", "Android"], rank: 4 },
  miniapp_dev: { role: "小程序工程师", description: "小程序开发、平台适配、性能优化、组件封装", skills: ["微信小程序", "Taro", "uni-app", "前端开发"], rank: 4 },
  sre_engineer: { role: "SRE工程师", description: "系统可靠性、监控告警、故障处理、容量规划", skills: ["Linux", "Docker", "Kubernetes", "监控告警"], rank: 4 },
  qa_engineer: { role: "测试工程师", description: "测试策略、自动化测试、性能测试、质量保障", skills: ["自动化测试", "性能测试", "安全测试", "测试策略"], rank: 4 },
  code_reviewer: { role: "代码审查员", description: "代码审查、规范制定、质量把控、最佳实践", skills: ["代码审查", "编码规范", "质量把控", "重构优化"], rank: 4 },
  dba: { role: "数据库管理员", description: "数据库运维、性能调优、备份恢复、数据安全", skills: ["PostgreSQL", "MySQL", "数据库调优", "数据安全"], rank: 4 },
  data_engineer: { role: "数据工程师", description: "数据管道建设、ETL开发、数据仓库、数据质量", skills: ["ETL", "数据仓库", "数据管道", "Spark"], rank: 4 },
  bi_analyst: { role: "BI分析师", description: "数据建模、报表开发、业务分析、数据可视化", skills: ["BI报表", "数据可视化", "SQL", "业务分析"], rank: 4 },
  ai_engineer: { role: "AI工程师", description: "AI模型开发、模型训练、AI应用集成、算法优化", skills: ["机器学习", "深度学习", "NLP", "模型部署"], rank: 4 },
  customer_success: { role: "客户成功经理", description: "客户全生命周期管理、满意度提升、续约推动", skills: ["客户管理", "满意度提升", "续约推动", "客户培训"], rank: 4 },
  finance_manager: { role: "财务经理", description: "日常财务核算、费用管理、报表编制、税务处理", skills: ["财务核算", "费用管理", "报表编制", "税务处理"], rank: 4 },
  mgmt_accountant: { role: "管理会计师", description: "成本分析、预算编制、经营分析、决策支持", skills: ["成本分析", "预算编制", "经营分析", "决策支持"], rank: 4 },
  ecommerce_ops: { role: "电商运营", description: "电商平台运营、商品管理、活动策划、数据分析", skills: ["电商运营", "商品管理", "活动策划", "数据分析"], rank: 4 },
  crossborder_ops: { role: "跨境电商运营", description: "跨境平台运营、选品分析、物流管理、合规处理", skills: ["跨境电商", "选品分析", "物流管理", "合规处理"], rank: 4 },
  newmedia_ops: { role: "新媒体运营", description: "内容策划、社交媒体运营、用户增长、数据分析", skills: ["内容策划", "社交媒体", "用户增长", "数据分析"], rank: 4 },
  ppt_designer: { role: "PPT设计师", description: "演示文稿设计、信息可视化、品牌视觉、创意设计", skills: ["PPT设计", "信息可视化", "品牌设计", "创意设计"], rank: 4 },

  // Rank 5 专员层
  knowledge: { role: "知识管理员", description: "知识沉淀、文档管理、信息检索、知识图谱建设", skills: ["知识管理", "文档管理", "信息检索", "知识图谱"], rank: 5 },
  financial_accountant: { role: "财务会计", description: "凭证处理、账务核算、报表编制、税务申报", skills: ["凭证处理", "账务核算", "报表编制", "税务申报"], rank: 5 },
  cashier: { role: "出纳", description: "资金收付、银行对账、票据管理、费用报销", skills: ["资金管理", "银行对账", "票据管理", "费用报销"], rank: 5 },
  medical_consultant: { role: "医疗行业顾问", description: "医疗行业方案、合规咨询、数字化转型", skills: ["医疗行业", "合规咨询", "数字化转型", "行业研究"], rank: 5 },
  fintech_consultant: { role: "金融科技顾问", description: "金融科技方案、风控咨询、数字化升级", skills: ["金融科技", "风控咨询", "数字化升级", "行业研究"], rank: 5 },
  manufacturing_consultant: { role: "制造业顾问", description: "智能制造方案、工业4.0、供应链优化", skills: ["智能制造", "工业4.0", "供应链优化", "行业研究"], rank: 5 },
  edu_consultant: { role: "教育行业顾问", description: "教育科技方案、在线教育、智慧校园", skills: ["教育科技", "在线教育", "智慧校园", "行业研究"], rank: 5 },
  gov_consultant: { role: "政务顾问", description: "数字政务方案、智慧城市、政务信息化", skills: ["数字政务", "智慧城市", "政务信息化", "行业研究"], rank: 5 },
  ip_specialist: { role: "知识产权专员", description: "专利申请、商标注册、知识产权保护、侵权分析", skills: ["专利申请", "商标注册", "知识产权保护", "侵权分析"], rank: 5 },
  investment_manager: { role: "投资经理", description: "项目尽调、投资分析、投后管理、行业研究", skills: ["项目尽调", "投资分析", "投后管理", "行业研究"], rank: 5 },
};

export function getAgentTemplate(agentType: string): AgentTemplate | null {
  return AGENT_TEMPLATES[agentType] || null;
}

export function getAgentTypeOptions(): { value: string; label: string; rank: number }[] {
  return Object.entries(AGENT_TEMPLATES).map(([value, tpl]) => ({
    value,
    label: tpl.role,
    rank: tpl.rank,
  })).sort((a, b) => a.rank - b.rank);
}
