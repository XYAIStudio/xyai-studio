/**
 * 质量评级：从维度覆盖、蒸馏完整、脱敏合规三维度给生成的智能体评级。
 */
import { ComplianceResult } from "./compliance-scan";

export interface QualityRating {
  grade: "A" | "B" | "C" | "D";
  label: string;
  scores: {
    dimension: number;
    distillation: number;
    compliance: number;
    overall: number;
  };
  /** 维度覆盖 "8/9" */
  dimensionCoverage: string;
  suggestions: string[];
}

const GRADE_LABEL: Record<string, string> = { A: "优秀", B: "良好", C: "一般", D: "待完善" };

export function rateQuality(
  dimensions: string[],
  knowledgeTree: string,
  compliance: ComplianceResult
): QualityRating {
  // 1. 维度覆盖度：按 9 个标准维度比例
  const dimensionScore = Math.min(100, Math.round((dimensions.length / 9) * 100));

  // 2. 蒸馏完整度：知识树章节数 + 篇幅
  const sectionCount = (knowledgeTree.match(/^##\s+/gm) || []).length;
  const distillationScore = Math.min(100, Math.round(sectionCount * 8 + Math.min(knowledgeTree.length / 4000, 40)));

  // 3. 脱敏完整度：合规扫描评分
  const complianceScore = compliance.score;

  // 综合：维度 30% + 蒸馏 30% + 合规 40%
  const overall = Math.round(dimensionScore * 0.3 + distillationScore * 0.3 + complianceScore * 0.4);

  const grade: QualityRating["grade"] = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : "D";

  const suggestions: string[] = [];
  if (dimensions.length < 7) suggestions.push(`维度覆盖不足（${dimensions.length}/9），建议补充缺失维度的资料`);
  if (sectionCount < 5) suggestions.push(`知识树章节较少（${sectionCount} 章），建议补充更完整的行业资料`);
  if (!compliance.passed) suggestions.push(`存在 ${compliance.residualCount} 处敏感信息残留，需人工复核脱敏后再发布`);

  return {
    grade,
    label: GRADE_LABEL[grade],
    scores: { dimension: dimensionScore, distillation: distillationScore, compliance: complianceScore, overall },
    dimensionCoverage: `${dimensions.length}/9`,
    suggestions,
  };
}
