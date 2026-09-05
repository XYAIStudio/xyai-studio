/**
 * 脱敏合规扫描：检测脱敏后的知识树是否还有敏感信息残留（漏脱敏）。
 * 只扫「精确敏感模式」（公司名/信用代码/身份证/手机号/银行卡/邮箱），
 * 地名/人名等易误报的启发式不作为硬性违规，避免把「市场」「万元」误判。
 */

export interface ComplianceResult {
  /** 是否通过（无硬性敏感残留） */
  passed: boolean;
  /** 残留敏感词数 */
  residualCount: number;
  /** 残留的敏感词（去重，前 30 个） */
  residuals: string[];
  /** 合规评分 0-100 */
  score: number;
}

/** 精确敏感模式（漏脱敏信号） */
const SCAN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "公司名", regex: /[\u4e00-\u9fa5A-Za-z0-9]{2,20}?(?:有限公司|股份公司|有限责任公司|控股集团|集团公司)/g },
  { name: "统一社会信用代码", regex: /[0-9A-HJ-NPQRTUWXY]{18}/g },
  { name: "身份证号", regex: /\b\d{17}[\dXx]\b/g },
  { name: "手机号", regex: /\b1[3-9]\d{9}\b/g },
  { name: "银行卡号", regex: /\b\d{16,19}\b/g },
  { name: "邮箱", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

export function scanCompliance(text: string): ComplianceResult {
  const residuals: string[] = [];
  const seen = new Set<string>();
  for (const p of SCAN_PATTERNS) {
    for (const m of text.matchAll(p.regex)) {
      const v = m[0];
      if (!seen.has(v)) {
        seen.add(v);
        residuals.push(v);
      }
    }
  }
  // 每个残留扣 10 分，最低 0
  const score = Math.max(0, 100 - residuals.length * 10);
  return {
    passed: residuals.length === 0,
    residualCount: residuals.length,
    residuals: residuals.slice(0, 30),
    score,
  };
}
