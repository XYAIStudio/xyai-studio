/**
 * 行业智能体生成器 —— 类型定义
 */

/** 敏感实体（11 类） */
export type EntityKind =
  | "company"        // 公司
  | "place"          // 地名
  | "person"         // 人名
  | "project"        // 项目
  | "product"        // 产品名
  | "brand"          // 商标品牌
  | "credit_code"    // 统一社会信用代码
  | "organization"   // 公司/单位/机构名称（学校/医院/协会/局委办等）
  | "customer"       // 客户名单
  | "business_data"  // 敏感的未公开经营数据
  | "personal_info"; // 个人敏感信息（身份证号/手机号/银行卡号/邮箱/住址）

/** 脱敏结果 */
export interface DesensitizeResult {
  /** 脱敏后文本 */
  text: string;
  /** original → alias 映射（可逆，存私密区，不进分发包） */
  mapping: Record<string, string>;
}

/** 行业资料文档 */
export interface IndustryDocument {
  name: string;
  content: string;
}

export type ProductionType = "advisor" | "workflow" | "research" | "team";

/** 四类生产线经过前端门禁确认后的结构化生产合同。 */
export interface ProductionBlueprint {
  schemaVersion: "xyai.production-line.v1";
  productionType: ProductionType;
  productionSpec: Record<string, string>;
  productionGates: Array<{ id: string; label: string; passed: boolean; blocking: "simulation" | "acceptance"; action: string }>;
  team?: { coordination: "serial" | "parallel" | "hybrid"; members: Array<Record<string, unknown>> };
  workflow?: { nodes: Array<Record<string, unknown>>; edges?: Array<{ from: string; to: string }> };
}

/** 蒸馏输入 */
export interface DistillInput {
  industry: string;
  documents: IndustryDocument[];
  /** 智能体名（用于蒸馏 prompt 的定制） */
  name?: string;
  /** 智能体人设 */
  persona?: string;
  /** 适用场景 */
  scenarios?: string[];
  /** 能力选项 */
  capabilities?: string[];
  /** 已由行业专家确认、带来源与验证案例的经验文本 */
  experience?: string;
  /** 真实分型生产合同；决定蒸馏重点，不允许四类共用同一算法说明。 */
  productionBlueprint?: ProductionBlueprint;
}

/** 蒸馏结果（LLM 已脱敏） */
export interface DistillResult {
  /** 行业知识架构树（markdown，已脱敏） */
  knowledgeTree: string;
  /** 提炼出的维度列表 */
  dimensions: string[];
  /** 给用户的建议 */
  suggestions: string[];
  /** LLM 生成的原文→代号对照表 */
  aliasMap?: Record<string, string>;
}

/** 生成输入 */
export interface GenerateInput {
  /** 智能体名（如「热电尽调助手」） */
  name: string;
  /** 行业（如「热电/能源尽调」） */
  industry: string;
  /** 描述 */
  description: string;
  /** 脱敏后的知识树 */
  knowledgeTree: string;
  /** 实体词典（蒸馏产物） */
  entities: Record<string, unknown>;
  /** 行业经验文档（可选，用于生成 persona 工作方式） */
  experience?: string;
  /** 蒸馏建议 */
  suggestions: string[];
  /** 维度列表 */
  dimensions: string[];
  /** 智能体人设（用户自定义角色定位/性格/说话风格） */
  persona?: string;
  /** 适用场景 */
  scenarios?: string[];
  /** 智能体能力选项 */
  capabilities?: string[];
  /** 版本号（默认 1.0.0） */
  version?: string;
  /** 来源模板与发布状态，写入公开 manifest 便于追溯（不含用户资料）。 */
  sourceTemplateId?: string;
  releaseStatus?: "draft" | "testing" | "accepted" | "published";
  /** 已再次脱敏的分型生产合同，写入能力包并约束运行方式。 */
  productionBlueprint?: ProductionBlueprint;
}

/** 能力包生成结果 */
export interface PackageResult {
  /** 分发包 zip 路径（不含原名对照） */
  zipPath: string;
  /** 私密对照（alias_map）路径，不进 zip */
  aliasMapPath: string;
  /** 能力包目录路径 */
  packageDir: string;
  /** manifest */
  manifest: Record<string, unknown>;
}
