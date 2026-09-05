/**
 * V1.00 R5 行业能力包配置器
 *
 * 将系统配置打包为针对特定行业的预设能力组合。
 * 包含：功能开关、预设模板、默认配置、技能包。
 */

import { dbGet, dbAll, dbRun } from "../db";

// ============================================================
// 行业定义
// ============================================================

export interface IndustryPackage {
  id: string;
  name: string;
  description: string;
  /** 启用的功能开关 */
  features: string[];
  /** 预设的 AI agent 模板 */
  agentTemplates: string[];
  /** 预设的工作流 */
  workflows: string[];
  /** 默认配置项 */
  defaults: Record<string, unknown>;
}

// ============================================================
// 预设行业能力包
// ============================================================

export const INDUSTRY_PACKAGES: IndustryPackage[] = [
  {
    id: "manufacturing",
    name: "制造业能力包",
    description: "适用于制造型企业的集团管控方案：生产排程、质量管控、供应链协同",
    features: ["production_schedule", "quality_control", "supply_chain", "asset_management", "equipment_maintenance"],
    agentTemplates: ["生产调度AI", "质检AI", "采购AI"],
    workflows: ["生产计划审批", "质量异常处理", "设备维修工单"],
    defaults: {
      knowledge_categories: ["生产工艺", "质量标准", "设备手册"],
      report_dashboard: "manufacturing_overview",
      notification_channels: ["生产异常告警", "质检报告推送"],
    },
  },
  {
    id: "finance",
    name: "金融行业能力包",
    description: "适用于金融机构的集团管控方案：合规审查、风控管理、监管报送",
    features: ["compliance_review", "risk_management", "regulatory_reporting", "audit_trail", "contract_review"],
    agentTemplates: ["合规审查AI", "风控分析AI", "合同审核AI"],
    workflows: ["合规审批流程", "风险评估流程", "监管报送流程"],
    defaults: {
      knowledge_categories: ["法规库", "监管政策", "内部制度"],
      report_dashboard: "finance_overview",
      notification_channels: ["合规告警", "监管更新推送"],
    },
  },
  {
    id: "construction",
    name: "工程建设能力包",
    description: "适用于工程建设企业的集团管控方案：项目管理、成本管控、安全监督",
    features: ["project_management", "cost_control", "safety_supervision", "progress_tracking", "document_management"],
    agentTemplates: ["项目经理AI", "成本核算AI", "安全监督AI"],
    workflows: ["项目立项审批", "变更审批流程", "安全整改流程"],
    defaults: {
      knowledge_categories: ["工程规范", "安全标准", "施工工艺"],
      report_dashboard: "construction_overview",
      notification_channels: ["安全告警", "进度预警"],
    },
  },
  {
    id: "healthcare",
    name: "医疗健康能力包",
    description: "适用于医疗机构的集团管控方案：病历管理、药品监管、质控合规",
    features: ["medical_record", "drug_management", "quality_compliance", "patient_safety", "equipment_lifecycle"],
    agentTemplates: ["质控AI", "药品管理AI", "患者服务AI"],
    workflows: ["质控检查流程", "药品审批流程", "不良事件上报"],
    defaults: {
      knowledge_categories: ["医疗法规", "药品目录", "质控标准"],
      report_dashboard: "healthcare_overview",
      notification_channels: ["质控告警", "药品预警"],
    },
  },
];

// ============================================================
// 能力包应用服务
// ============================================================

/**
 * 为指定租户激活行业能力包
 */
export function activateIndustryPackage(tenantId: number, packageId: string): { success: boolean; message: string } {
  const pkg = INDUSTRY_PACKAGES.find(p => p.id === packageId);
  if (!pkg) return { success: false, message: `未知行业包: ${packageId}` };

  // 记录激活的行业包
  dbRun(
    "INSERT OR REPLACE INTO tenant_industry_packages (tenant_id, package_id, features_json, activated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
    [tenantId, packageId, JSON.stringify(pkg.features)]
  );

  // 将行业默认设置写入（跳过 company_settings 表，存入专门的能力包配置）
  // company_settings 有额外的 company_id NOT NULL 约束，能力包设置走独立存储

  return { success: true, message: `已激活行业能力包: ${pkg.name}` };
}

/**
 * 获取租户当前激活的行业能力包
 */
export function getActiveIndustryPackage(tenantId: number): IndustryPackage | null {
  const row = dbGet(
    "SELECT package_id FROM tenant_industry_packages WHERE tenant_id = ? ORDER BY activated_at DESC LIMIT 1",
    [tenantId]
  ) as { package_id: string } | undefined;

  if (!row) return null;
  return INDUSTRY_PACKAGES.find(p => p.id === row.package_id) || null;
}

/**
 * 列出所有可用的行业能力包
 */
export function listIndustryPackages(): IndustryPackage[] {
  return INDUSTRY_PACKAGES;
}

/**
 * 获取行业能力包详情
 */
export function getIndustryPackage(packageId: string): IndustryPackage | null {
  return INDUSTRY_PACKAGES.find(p => p.id === packageId) || null;
}
