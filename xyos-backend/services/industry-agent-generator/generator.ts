/**
 * 智能体定制生成器 —— 主编排：蒸馏 → 脱敏 → 合规扫描 → 质量评级 → 生成能力包 → 打包。
 */
import { Desensitizer } from "./desensitizer";
import { distill, distillIncremental } from "./distiller";
import { generatePackage } from "./packager";
import { scanCompliance } from "./compliance-scan";
import { rateQuality, QualityRating } from "./quality-rating";
import { IndustryDocument, PackageResult, DistillResult, ProductionBlueprint } from "./types";

export interface GenerateAgentOptions {
  /** 智能体名（如「热电尽调助手」） */
  name: string;
  /** 行业（如「热电/能源尽调」） */
  industry: string;
  /** 描述 */
  description: string;
  /** 行业资料（多个文档） */
  documents: IndustryDocument[];
  /** 行业经验文档（可选） */
  experience?: string;
  /** 智能体人设（用户自定义角色定位/性格/说话风格） */
  persona?: string;
  /** 适用场景 */
  scenarios?: string[];
  /** 智能体能力选项 */
  capabilities?: string[];
  /** 版本号（默认 1.0.0；增量升级时传新版本号） */
  version?: string;
  /** 现有知识树（增量升级时传入，作为增量蒸馏基础） */
  baseKnowledgeTree?: string;
  /** 四类生产线结构化合同。 */
  productionBlueprint?: ProductionBlueprint;
  /** 输出目录 */
  outputDir: string;
}

export interface GenerateAgentResult extends PackageResult {
  /** 蒸馏结果 */
  distill: DistillResult;
  /** 脱敏后的知识树 */
  desensitizedTree: string;
  /** 建议（脱敏后） */
  suggestions: string[];
  /** 脱敏映射条目数 */
  aliasCount: number;
  /** 质量评级 */
  quality: QualityRating;
}

/** 主流程：生成一个脱敏的智能体能力包 */
export async function generateIndustryAgent(opts: GenerateAgentOptions): Promise<GenerateAgentResult> {
  // 无资料时自动生成占位资料（基于智能体设置 + 行业通用知识，让 LLM 自行蒸馏）
  const providedDocs = opts.documents ?? [];
  const documents = providedDocs.length > 0 ? providedDocs : [{
    name: "智能体设定说明",
    content: `行业：${opts.industry}\n智能体名称：${opts.name}\n描述：${opts.description}\n人设：${opts.persona || opts.description}\n适用场景：${(opts.scenarios || []).join("、") || "通用"}\n能力：${(opts.capabilities || []).join("、") || "知识库查询、报告生成"}`,
  }];

  // 1. 蒸馏：全量或增量（有 baseKnowledgeTree 时为增量升级），根据智能体定制要求自适应蒸馏维度
  const distillInput = {
    industry: opts.industry,
    documents,
    name: opts.name,
    persona: opts.persona,
    scenarios: opts.scenarios,
    capabilities: opts.capabilities,
    experience: opts.experience,
    productionBlueprint: opts.productionBlueprint,
  };
  const distillResult = opts.baseKnowledgeTree
    ? await distillIncremental(opts.baseKnowledgeTree, distillInput)
    : await distill(distillInput);

  // 2. 脱敏结果：优先用 LLM 脱敏；LLM 未返回对照表时，回退到规则脱敏
  let knowledgeTree = distillResult.knowledgeTree;
  let suggestions = distillResult.suggestions;
  let aliasMap = distillResult.aliasMap || {};

  if (!distillResult.aliasMap || Object.keys(distillResult.aliasMap).length === 0) {
    const desensitizer = new Desensitizer();
    knowledgeTree = desensitizer.process(distillResult.knowledgeTree).text;
    suggestions = distillResult.suggestions.map(s => desensitizer.process(s).text);
    aliasMap = desensitizer.getMapping();
  }

  // 专家经验既参与蒸馏，也要在进入能力包 persona 前再次执行本地规则脱敏。
  // 先载入 LLM 已形成的映射，保证知识树与工作方式尽量使用同一组代号。
  let safeExperience = opts.experience;
  if (safeExperience?.trim()) {
    const experienceDesensitizer = new Desensitizer();
    experienceDesensitizer.loadMappings(aliasMap);
    safeExperience = experienceDesensitizer.process(safeExperience).text;
    aliasMap = { ...aliasMap, ...experienceDesensitizer.getMapping() };
  }

  // 分型规格、团队角色和流程节点同样可能含业务名称，进入分发包前必须整体再次脱敏。
  let safeProductionBlueprint = opts.productionBlueprint;
  if (safeProductionBlueprint) {
    const blueprintDesensitizer = new Desensitizer();
    blueprintDesensitizer.loadMappings(aliasMap);
    const safeJson = blueprintDesensitizer.process(JSON.stringify(safeProductionBlueprint)).text;
    try { safeProductionBlueprint = JSON.parse(safeJson) as ProductionBlueprint; } catch { throw new Error("分型生产合同脱敏后无法解析，已停止打包"); }
    aliasMap = { ...aliasMap, ...blueprintDesensitizer.getMapping() };
  }

  // 3. 合规扫描 + 质量评级（P3 商业发布）
  const compliance = scanCompliance(knowledgeTree);
  const quality = rateQuality(distillResult.dimensions, knowledgeTree, compliance);

  // 4. 生成能力包 + 打包 zip（alias_map 存私密区）
  const pkg = await generatePackage(
    {
      name: opts.name,
      industry: opts.industry,
      description: opts.description,
      knowledgeTree,
      entities: { dimensions: distillResult.dimensions, generatedAt: new Date().toISOString() },
      experience: safeExperience,
      suggestions,
      dimensions: distillResult.dimensions,
      persona: opts.persona,
      scenarios: opts.scenarios,
      capabilities: opts.capabilities,
      version: opts.version,
      productionBlueprint: safeProductionBlueprint,
    },
    opts.outputDir,
    aliasMap
  );

  return {
    ...pkg,
    distill: distillResult,
    desensitizedTree: knowledgeTree,
    suggestions,
    aliasCount: Object.keys(aliasMap).length,
    quality,
  };
}
