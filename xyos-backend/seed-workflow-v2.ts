/**
 * WorkFlow V2 种子数据
 * 监理行业 7 大类 55 个流程模板
 */
import { dbRun, dbGet, dbAll } from "./db";
import bcrypt from "bcryptjs";
import type { ApproverConfig, ApproverMode, FlowDefinition, FlowNode, FlowEdge } from "./services/workflow-types";

// ============================================================
// 辅助函数
// ============================================================

function nid(prefix: string, id: number): string { return `${prefix}_${id}`; }

function mkApprovalNode(id: string, title: string, signMode: "all" | "any", approvers: ApproverConfig[]): FlowNode {
  return {
    id, type: "approval", title, config: {
      signMode, approvers, rejectStrategy: "back_to_start",
      allowDelegate: true, allowAddSign: true, timeoutHours: 48,
    }
  };
}

function mkConditionNode(id: string, title: string, field: string, branches: any[]): FlowNode {
  return { id, type: "condition", title, config: { field, branches } };
}

function mkTaskNode(id: string, title: string, approverMode: ApproverMode, approverValue: string): FlowNode {
  return {
    id, type: "task", title, config: {
      signMode: "all", approvers: [{ mode: approverMode, value: approverValue, label: title }],
      rejectStrategy: "back_to_start", allowDelegate: true, allowAddSign: false,
    }
  };
}

function mkEndNode(id: string): FlowNode {
  return { id, type: "end", title: "完成", config: { notifyRoles: ["audit_supervision", "it"] } };
}

function mkStartNode(id: string, title: string): FlowNode {
  return { id, type: "start", title, config: {} };
}

// ============================================================
// 分类数据
// ============================================================

const CATEGORIES = [
  { id: 1, name: "人事行政", icon: "👥", sort: 1 },
  { id: 2, name: "财务管理", icon: "💰", sort: 2 },
  { id: 3, name: "工程管理", icon: "🏗", sort: 4, parent: 5 },  // parent: 项目监理业务
  { id: 4, name: "质量安全", icon: "🛡", sort: 5, parent: 5 },
  { id: 5, name: "项目监理业务", icon: "📋", sort: 3 },
  { id: 6, name: "经营合同", icon: "📄", sort: 6 },
  { id: 7, name: "行政资产", icon: "🏢", sort: 7 },
];

// ============================================================
// 预置模板 (代表性流程)
// ============================================================

interface PresetTemplate {
  tenantId: number;
  categoryId: number;
  name: string;
  schemeName: string;
  icon: string;
  description: string;
  sort: number;
  flow: () => FlowDefinition;
}

const PRESETS: PresetTemplate[] = [
  // ---- 人事行政类 ----
  {
    tenantId: 1, categoryId: 1, name: "请假申请", schemeName: "标准请假",
    icon: "📅", description: "员工请假流程：部门→HR",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起请假"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkConditionNode("n_cond", "请假天数分流", "days", [
          { label: "≤3天", op: "lte", value: 3, nextNodeId: "n_hr" },
          { label: ">3天", op: "gt", value: 3, nextNodeId: "n_vp" },
        ]),
        mkTaskNode("n_hr", "HR备案", "role", "hr"),
        mkApprovalNode("n_vp", "分管副总审批", "all", [{ mode: "role", value: "vp", label: "分管副总" }]),
        mkEndNode("end"),
      ],
      edges: [
        { from: "start", to: "n1" }, { from: "n1", to: "n_cond" },
        { from: "n_hr", to: "end" }, { from: "n_vp", to: "end" },
      ],
    }),
  },
  {
    tenantId: 1, categoryId: 1, name: "加班申请", schemeName: "标准",
    icon: "⏰", description: "加班申请流程",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起加班申请"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 1, name: "出差申请", schemeName: "标准",
    icon: "✈", description: "出差申请流程",
    sort: 3,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起出差申请"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "分管领导审批", "all", [{ mode: "role", value: "vp", label: "分管领导" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 1, name: "人员派驻/调岗申请", schemeName: "标准",
    icon: "🔄", description: "人员派驻或调岗",
    sort: 4,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起调岗申请"),
        mkApprovalNode("n1", "调出部门负责人审批", "all", [{ mode: "department_head", value: "", label: "调出部门负责人" }]),
        mkApprovalNode("n2", "调入部门负责人审批", "all", [{ mode: "initiator_choice", value: "", label: "调入部门负责人" }]),
        mkApprovalNode("n3", "HR审批", "all", [{ mode: "role", value: "hr", label: "HR" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 1, name: "证书借用申请", schemeName: "标准",
    icon: "📜", description: "监理人员证书借用",
    sort: 5,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起证书借用"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "综合管理部审批", "all", [{ mode: "role", value: "admin_dept", label: "综合管理部" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },

  // ---- 财务管理类 ----
  {
    tenantId: 1, categoryId: 2, name: "费用报销", schemeName: "标准",
    icon: "💳", description: "日常费用报销",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起报销"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkConditionNode("n_cond", "金额分级", "amount", [
          { label: "≤5000元", op: "lte", value: 5000, nextNodeId: "n_fin" },
          { label: ">5000元", op: "gt", value: 5000, nextNodeId: "n_vp" },
        ]),
        mkApprovalNode("n_fin", "财务审核", "all", [{ mode: "role", value: "finance", label: "财务" }]),
        mkApprovalNode("n_vp", "分管副总审批", "all", [{ mode: "role", value: "vp", label: "分管副总" }]),
        mkEndNode("end"),
      ],
      edges: [
        { from: "start", to: "n1" }, { from: "n1", to: "n_cond" },
        { from: "n_fin", to: "end" }, { from: "n_vp", to: "n_fin" },
      ],
    }),
  },
  {
    tenantId: 1, categoryId: 2, name: "差旅费报销", schemeName: "标准",
    icon: "🏨", description: "差旅费用报销",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起差旅报销"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "财务审核", "all", [{ mode: "role", value: "finance", label: "财务" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 2, name: "合同付款申请", schemeName: "标准",
    icon: "💸", description: "合同付款审批",
    sort: 3,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起合同付款"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "财务审核", "all", [{ mode: "role", value: "finance", label: "财务" }]),
        mkApprovalNode("n3", "经营部会签", "all", [{ mode: "role", value: "biz_dev", label: "经营部" }]),
        mkApprovalNode("n4", "总经理审批", "all", [{ mode: "role", value: "gm", label: "总经理" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }, { from: "n4", to: "end" }],
    }),
  },

  // ---- 工程管理类 (监理核心) ----
  {
    tenantId: 1, categoryId: 3, name: "监理规划审批", schemeName: "标准",
    icon: "📐", description: "监理规划编制→审批",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "总监编制提交"),
        mkApprovalNode("n1", "总工办审批", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 3, name: "专项施工方案内审", schemeName: "标准",
    icon: "📋", description: "危大工程专项方案监理内审",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "专监提交方案"),
        mkApprovalNode("n1", "总监审批", "all", [{ mode: "position", value: "总监理工程师", label: "总监" }]),
        mkApprovalNode("n2", "总工办审批", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkApprovalNode("n3", "集团技术负责人审批", "all", [{ mode: "role", value: "tech_director", label: "技术负责人" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 3, name: "开工报审", schemeName: "标准",
    icon: "🚀", description: "工程开工内部审批",
    sort: 3,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "总监提交开工报告"),
        mkApprovalNode("n1", "总工办审批", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkApprovalNode("n2", "集团技术负责人审批", "all", [{ mode: "role", value: "tech_director", label: "技术负责人" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 3, name: "工程款支付审批", schemeName: "标准",
    icon: "🏦", description: "工程款支付审批",
    sort: 4,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "专监提交支付申请"),
        mkApprovalNode("n1", "总监审批", "all", [{ mode: "position", value: "总监理工程师", label: "总监" }]),
        mkApprovalNode("n2", "财务审核", "all", [{ mode: "role", value: "finance", label: "财务" }]),
        mkApprovalNode("n3", "总经理审批", "all", [{ mode: "role", value: "gm", label: "总经理" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 3, name: "监理月报审批", schemeName: "标准",
    icon: "📊", description: "监理月报编制审批",
    sort: 5,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "总监编制月报"),
        mkApprovalNode("n1", "总工办审核", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkTaskNode("n2", "集团备案", "role", "admin"),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },

  // ---- 质量安全类 ----
  {
    tenantId: 1, categoryId: 4, name: "整改通知单下发", schemeName: "标准",
    icon: "⚠", description: "现场质量问题整改通知",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "专监提交整改通知"),
        mkApprovalNode("n1", "总监审批", "all", [{ mode: "position", value: "总监理工程师", label: "总监" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 4, name: "质量事故报告", schemeName: "标准",
    icon: "🚨", description: "质量安全事故上报",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "总监提交事故报告"),
        mkApprovalNode("n1", "总工办审批", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkApprovalNode("n2", "集团技术负责人审批", "all", [{ mode: "role", value: "tech_director", label: "技术负责人" }]),
        mkApprovalNode("n3", "分管副总审批", "all", [{ mode: "role", value: "vp", label: "分管副总" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "end" }],
    }),
  },

  // ---- 经营合同类 ----
  {
    tenantId: 1, categoryId: 6, name: "投标报名审批", schemeName: "标准",
    icon: "🎯", description: "投标报名内部审批",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "经营部提交投标申请"),
        mkApprovalNode("n1", "分管副总审批", "all", [{ mode: "role", value: "vp", label: "分管副总" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 6, name: "监理合同评审", schemeName: "标准",
    icon: "📝", description: "监理服务合同评审",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "经营部提交合同"),
        mkApprovalNode("n1", "法务审核", "all", [{ mode: "role", value: "legal", label: "法务" }]),
        mkApprovalNode("n2", "总工办技术评审", "all", [{ mode: "role", value: "chief_engineer", label: "总工办" }]),
        mkApprovalNode("n3", "总经理审批", "all", [{ mode: "role", value: "gm", label: "总经理" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "end" }],
    }),
  },

  // ---- 行政资产类 ----
  {
    tenantId: 1, categoryId: 7, name: "办公用品申领", schemeName: "标准",
    icon: "📎", description: "办公用品申领",
    sort: 1,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起申领"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkTaskNode("n2", "行政部发放", "role", "admin"),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 7, name: "印章使用申请", schemeName: "标准",
    icon: "🔏", description: "公司印章使用申请",
    sort: 2,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起用印申请"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "综合管理部审批", "all", [{ mode: "role", value: "admin_dept", label: "综合管理部" }]),
        mkEndNode("end"),
      ],
      edges: [{ from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "end" }],
    }),
  },
  {
    tenantId: 1, categoryId: 7, name: "固定资产采购报废", schemeName: "标准",
    icon: "🖥", description: "固定资产全生命周期",
    sort: 3,
    flow: () => ({
      version: 2,
      nodes: [
        mkStartNode("start", "发起采购/报废申请"),
        mkApprovalNode("n1", "部门负责人审批", "all", [{ mode: "department_head", value: "", label: "部门负责人" }]),
        mkApprovalNode("n2", "行政部审批", "all", [{ mode: "role", value: "admin", label: "行政部" }]),
        mkApprovalNode("n3", "财务审核", "all", [{ mode: "role", value: "finance", label: "财务" }]),
        mkConditionNode("n_cond", "金额分级", "amount", [
          { label: "≤1万元", op: "lte", value: 10000, nextNodeId: "end" },
          { label: ">1万元", op: "gt", value: 10000, nextNodeId: "n_gm" },
        ]),
        mkApprovalNode("n_gm", "总经理审批", "all", [{ mode: "role", value: "gm", label: "总经理" }]),
        mkEndNode("end"),
      ],
      edges: [
        { from: "start", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
        { from: "n3", to: "n_cond" }, { from: "n_gm", to: "end" },
      ],
    }),
  },
];

// ============================================================
// 种子执行函数
// ============================================================

export function seedWorkflowV2(tenantId: number = 1, createdBy: number = 1) {
  console.log("[种子] WorkFlow V2 种子数据开始...");

  // 1. 插入分类（幂等）
  let catCount = 0;
  for (const cat of CATEGORIES) {
    const catExists = dbGet("SELECT id FROM workflow_categories WHERE id = ?", [cat.id]) as any;
    if (!catExists) {
      dbRun(
        "INSERT INTO workflow_categories (id, name, parent_id, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
        [cat.id, cat.name, cat.parent || null, cat.icon, cat.sort]
      );
      catCount++;
    }
  }
  if (catCount > 0) {
    console.log(`[种子] 已创建 ${catCount} 个分类`);
  } else {
    console.log("[种子] 分类已存在，跳过分类创建");
  }

  // 2. 插入预置模板（幂等，按 tenant_id + name 查重）
  let templateCount = 0;
  let snapshotCount = 0;
  for (const preset of PRESETS) {
    const tid = preset.tenantId || tenantId;
    const exists = dbGet(
      "SELECT id FROM workflow_definitions WHERE tenant_id = ? AND name = ?",
      [tid, preset.name]
    ) as any;
    if (exists) {
      continue; // 模板已存在，跳过
    }

    const def = preset.flow();
    dbRun(
      `INSERT INTO workflow_definitions
       (tenant_id, name, description, version, status, definition,
        category_id, scheme_name, icon, sort_order, is_preset, created_by)
       VALUES (?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, 1, ?)`,
      [
        tid, preset.name, preset.description,
        JSON.stringify(def), preset.categoryId, preset.schemeName,
        preset.icon, preset.sort, createdBy,
      ]
    );

    // 为每个模板创建快照
    const defId = (dbGet("SELECT last_insert_rowid() as id") as any)?.id;
    if (defId) {
      dbRun(
        "INSERT INTO workflow_definition_snapshots (definition_id, version, definition) VALUES (?, 1, ?)",
        [defId, JSON.stringify(def)]
      );
      snapshotCount++;
    }

    templateCount++;
  }
  if (templateCount > 0) {
    console.log(`[种子] 已创建 ${templateCount} 个预置模板 + ${snapshotCount} 个快照`);
  } else {
    console.log("[种子] 预置模板已存在，跳过模板创建");
  }

  // 3. 为 tenantId=1 默认启用所有分类
  for (const cat of CATEGORIES) {
    dbRun(
      `INSERT OR IGNORE INTO tenant_category_settings (tenant_id, category_id, enabled)
       VALUES (?, ?, 1)`,
      [tenantId, cat.id]
    );
  }

  // 4. 种测试用户+员工关联（流程审批人解析必需）
  seedTestEmployees(tenantId);

  console.log("[种子] WorkFlow V2 种子数据完成");
}

// ============================================================
// 组织架构 + 员工 种子函数
// 监理公司真实组织架构：10个部门，每部门有负责人+普通员工
// 所有审批节点均有真实人类员工可操作
// ============================================================

interface EmpRec {
  email: string;
  nickname: string;
  role: string;       // employees.role — 用于 department_head(模糊匹配) 和 role模式(精确匹配)
  dept_key: string;   // 所属部门 key
  is_dept_head?: boolean; // 是否为该部门负责人
}

// 部门定义
const DEPARTMENTS: { key: string; name: string; sort: number }[] = [
  { key: "tech", name: "技术部", sort: 1 },
  { key: "supervision", name: "监理部", sort: 2 },
  { key: "chief_eng", name: "总工办", sort: 3 },
  { key: "biz", name: "经营部", sort: 4 },
  { key: "finance", name: "财务部", sort: 5 },
  { key: "hr", name: "人力资源部", sort: 6 },
  { key: "admin_gen", name: "综合管理部", sort: 7 },
  { key: "admin", name: "行政部", sort: 8 },
  { key: "legal", name: "法务合规部", sort: 9 },
  { key: "ceo", name: "总经办", sort: 10 },
];

// 员工列表：每个部门至少 1 个负责人 + 1-2 个普通员工
// 旧 test_* 用户保留不变（_verify-wf-v2.cjs 依赖）
const EMPLOYEES: EmpRec[] = [
  // ===== 技术部 (dept=tech) =====
  // 部门负责人（旧测试用户，保持原 role 同时含 "负责人" 字样以供 department_head 匹配）
  { email: "test_dept@xy.com", nickname: "张部长", role: "技术部负责人", dept_key: "tech", is_dept_head: true },
  // 普通员工
  { email: "tech_li@xy.com", nickname: "李开发", role: "高级工程师", dept_key: "tech" },
  { email: "tech_wang@xy.com", nickname: "王前端", role: "前端工程师", dept_key: "tech" },

  // ===== 监理部 (dept=supervision) =====
  { email: "super_zhao@xy.com", nickname: "赵总监", role: "监理部负责人", dept_key: "supervision", is_dept_head: true },
  // 旧测试用户 — 总监（position 模式用）
  { email: "test_zj@xy.com", nickname: "总监理工程师", role: "总监理工程师", dept_key: "supervision" },
  // 普通员工
  { email: "super_qian@xy.com", nickname: "钱专监", role: "专业监理工程师", dept_key: "supervision" },
  { email: "super_sun@xy.com", nickname: "孙监理员", role: "监理员", dept_key: "supervision" },

  // ===== 总工办 (dept=chief_eng) =====
  { email: "eng_chen@xy.com", nickname: "陈总工", role: "总工办负责人", dept_key: "chief_eng", is_dept_head: true },
  // 旧测试用户 — 总工/技术负责人（role 模式用）
  { email: "test_eng@xy.com", nickname: "总工程师", role: "chief_engineer", dept_key: "chief_eng" },
  { email: "test_tech@xy.com", nickname: "技术负责人", role: "tech_director", dept_key: "chief_eng" },
  // 普通员工
  { email: "eng_zhou@xy.com", nickname: "周高工", role: "高级工程师", dept_key: "chief_eng" },

  // ===== 经营部 (dept=biz) =====
  { email: "biz_liu@xy.com", nickname: "刘经理", role: "经营部负责人", dept_key: "biz", is_dept_head: true },
  // 旧测试用户 — 经营部角色（role 模式用）
  { email: "test_biz@xy.com", nickname: "经营部经理", role: "biz_dev", dept_key: "biz" },
  // 普通员工
  { email: "biz_wu@xy.com", nickname: "吴投标", role: "投标专员", dept_key: "biz" },

  // ===== 财务部 (dept=finance) =====
  { email: "fin_zheng@xy.com", nickname: "郑总监", role: "财务部负责人", dept_key: "finance", is_dept_head: true },
  // 旧测试用户 — 财务角色（role 模式用）
  { email: "test_fin@xy.com", nickname: "财务经理", role: "finance", dept_key: "finance" },
  // 普通员工
  { email: "fin_feng@xy.com", nickname: "冯会计", role: "会计", dept_key: "finance" },

  // ===== 人力资源部 (dept=hr) =====
  { email: "hr_chu@xy.com", nickname: "褚经理", role: "人力资源部负责人", dept_key: "hr", is_dept_head: true },
  // 旧测试用户 — HR 角色（role 模式用）
  { email: "test_hr@xy.com", nickname: "HR经理", role: "hr", dept_key: "hr" },
  // 普通员工
  { email: "hr_wei@xy.com", nickname: "卫专员", role: "人事专员", dept_key: "hr" },

  // ===== 综合管理部 (dept=admin_gen) =====
  { email: "zm_jiang@xy.com", nickname: "蒋经理", role: "综合管理部负责人", dept_key: "admin_gen", is_dept_head: true },
  // 旧测试用户 — 综合管理部角色（role 模式用）
  { email: "test_zm@xy.com", nickname: "综合管理部经理", role: "admin_dept", dept_key: "admin_gen" },
  // 普通员工
  { email: "zm_shen@xy.com", nickname: "沈文员", role: "行政文员", dept_key: "admin_gen" },

  // ===== 行政部 (dept=admin) =====
  { email: "adm_han@xy.com", nickname: "韩经理", role: "行政部负责人", dept_key: "admin", is_dept_head: true },
  // 旧测试用户 — 行政角色（role 模式用）
  { email: "test_admin1@xy.com", nickname: "行政经理", role: "admin", dept_key: "admin" },
  // 普通员工
  { email: "adm_yang@xy.com", nickname: "杨后勤", role: "后勤专员", dept_key: "admin" },

  // ===== 法务合规部 (dept=legal) =====
  { email: "leg_zhu@xy.com", nickname: "朱法务", role: "法务部负责人", dept_key: "legal", is_dept_head: true },
  // 旧测试用户 — 法务角色（role 模式用）
  { email: "test_legal@xy.com", nickname: "法务顾问", role: "legal", dept_key: "legal" },

  // ===== 总经办 (dept=ceo) =====
  { email: "ceo_ma@xy.com", nickname: "马总", role: "总经理", dept_key: "ceo", is_dept_head: true },
  // 旧测试用户 — 总经理/副总角色（role 模式用）
  { email: "test_gm@xy.com", nickname: "总经理", role: "gm", dept_key: "ceo" },
  { email: "test_vp@xy.com", nickname: "分管副总", role: "vp", dept_key: "ceo" },
];

function seedTestEmployees(tenantId: number) {
  console.log("[种子] 组织架构+员工种子开始...");
  const pwHash = bcrypt.hashSync("test123", 10);
  let deptCount = 0;
  let userCount = 0;
  let empCount = 0;

  // 1. 创建部门（幂等 — 按 name 查重）
  const deptIdMap: Record<string, number> = {};
  for (const d of DEPARTMENTS) {
    let existing = dbGet("SELECT id FROM departments WHERE name = ? AND tenant_id = ?", [d.name, tenantId]) as any;
    if (!existing) {
      dbRun("INSERT INTO departments (name, tenant_id, sort_order) VALUES (?, ?, ?)", [d.name, tenantId, d.sort]);
      existing = { id: (dbGet("SELECT last_insert_rowid() as id") as any)?.id };
      deptCount++;
      console.log(`[种子] 创建部门: ${d.name} (id=${existing.id})`);
    }
    deptIdMap[d.key] = existing.id;
  }
  if (deptCount > 0) {
    console.log(`[种子] 部门: 新增 ${deptCount} 个，共 ${DEPARTMENTS.length} 个`);
  } else {
    console.log(`[种子] 部门: 已存在 ${DEPARTMENTS.length} 个，跳过创建`);
  }

  // 2. 创建用户 + 员工关联
  for (const emp of EMPLOYEES) {
    const deptId = deptIdMap[emp.dept_key];
    if (!deptId) {
      console.warn(`[种子] 跳过 ${emp.email}: 找不到部门 ${emp.dept_key}`);
      continue;
    }

    // 检查/创建用户
    let user = dbGet("SELECT id FROM users WHERE email = ?", [emp.email]) as any;
    if (!user) {
      const result = dbRun(
        "INSERT INTO users (email, password_hash, nickname, role, tenant_id) VALUES (?, ?, ?, 'user', ?)",
        [emp.email, pwHash, emp.nickname, tenantId]
      );
      user = { id: result.lastInsertRowid };
      userCount++;
    }

    // 检查/创建员工
    let empRow = dbGet("SELECT id FROM employees WHERE user_id = ?", [user.id]) as any;
    if (!empRow) {
      // 尝试匹配未关联的已有员工（同 role）
      const matchEmp = dbGet(
        "SELECT id FROM employees WHERE role = ? AND user_id IS NULL AND tenant_id = ? LIMIT 1",
        [emp.role, tenantId]
      ) as any;
      if (matchEmp) {
        dbRun("UPDATE employees SET user_id = ?, department_id = ? WHERE id = ?",
          [user.id, deptId, matchEmp.id]);
      } else {
        dbRun(
          `INSERT INTO employees (name, role, user_id, tenant_id, department_id, employee_type, status, employment_category)
           VALUES (?, ?, ?, ?, ?, 'human', 'active', 'internal')`,
          [emp.nickname, emp.role, user.id, tenantId, deptId]
        );
      }
      empCount++;
    }
  }

  // 3. 确保超级管理员 (user id=1, mbazone@qq.com) 有关联的员工记录
  const adminEmp = dbGet("SELECT id FROM employees WHERE user_id = 1") as any;
  if (!adminEmp) {
    const ceoDeptId = deptIdMap["ceo"];
    dbRun(
      `INSERT INTO employees (name, role, user_id, tenant_id, department_id, employee_type, status, employment_category)
       VALUES (?, ?, ?, ?, ?, 'human', 'active', 'internal')`,
      ["系统管理员", "超级管理员", 1, tenantId, ceoDeptId || 1]
    );
    console.log(`[种子] 超管 (user=1) 已关联员工记录 → 部门: 总经办`);
  }

  const deptHeads = EMPLOYEES.filter(e => e.is_dept_head).length;
  console.log(`[种子] 组织架构完成: ${DEPARTMENTS.length} 部门, ${EMPLOYEES.length} 员工 (含 ${deptHeads} 位部门负责人)`);
  console.log(`[种子] 本次新增: ${userCount} 用户, ${empCount} 员工`);
}
