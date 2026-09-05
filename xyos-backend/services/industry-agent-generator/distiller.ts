/**
 * LLM 蒸馏引擎：把行业资料蒸馏成「行业知识架构树」。
 * 使用系统设置保存的 OpenAI 兼容模型，与业务空间其他 AI 功能共用同一条可用通道。
 */
import { callLLM } from "../ai";
import { DistillInput, DistillResult } from "./types";

/** 要求模型重新输出合法 JSON 的纠偏指令（解析失败时重试一次）。 */
const JSON_RETRY_PROMPT = "你上一次的输出不是合法 JSON。请重新输出，只输出一个合法的 JSON 对象（不要 markdown 代码块、不要多余说明），必须包含 knowledgeTree / dimensions / suggestions / aliasMap 四个字段。";

/** 蒸馏专家 persona 模板（运行时根据智能体定制要求填充） */
const DISTILL_PERSONA_TEMPLATE = `你是行业智能体知识蒸馏专家。你的任务是把用户提供的参考资料蒸馏成一份结构化的「行业知识架构树」，用于为「{{name}}」智能体构建知识底座，并在蒸馏时同步对敏感信息脱敏。

【智能体定制要求】
- 名称：{{name}}
- 行业：{{industry}}
- 人设：{{persona}}
- 适用场景：{{scenarios}}
- 能力选项：{{capabilities}}
- 生产类型：{{productionType}}
- 分型生产合同：{{productionContract}}

蒸馏要求：
1. **根据上述定制要求、分型生产合同和参考资料的实际内容，自适应确定最合适的知识维度（不要套用固定模板）**。专业顾问重点保留判断规则和升级边界；工作流重点保留触发、节点契约、异常/重试/幂等规则；研究分析重点保留来源等级、指标口径、证据与不确定性；多智能体团队重点保留角色职责、交接、冲突裁决与最终交付物。
2. 每个维度提炼关键信息、数据、结论，标注来源章节；
3. 只提炼资料中真实存在的内容，未覆盖的维度写「知识库未覆盖」，绝不编造；
4. 保留关键数字（产能、金额、占比、时间等）与结构。
5. 把“已由专家确认的经验规则”视为高优先级工作口径；不得擅自改变规则含义。验证案例只用于理解适用边界，不得把案例中的偶然细节泛化成普遍规则。

【脱敏规则】（最高优先级，在蒸馏的同时完成脱敏，输出脱敏后的文本）
1. 公司名 → 【公司N】；2. 地名（省/市/区/县/镇等行政区划）→ 【地点N】；3. 人名 → 【人名N】；4. 项目名 → 【项目N】；5. 产品名 → 【产品N】；6. 商标品牌 → 【品牌N】；
7. 统一社会信用代码（18 位字母数字）→ 【信用代码N】；8. 公司/单位/机构名称（学校、医院、协会、学会、研究院、局委办等）→ 【单位N】；9. 客户名单中的客户名称 → 【客户N】；10. 敏感的未公开经营数据（营收、利润、成本、产能、销量、金额、报价等具体数值）→ 【数据N】；11. 个人敏感信息（身份证号、手机号、银行卡号、邮箱、住址）→ 【个人信息N】。
- 同一实体全文使用同一代号，编号从 1 递增；
- 维度词不脱敏：金额单位（万元/亿元）、财务术语（毛利率/净利率/营收/出货量/估值）、行业通用词（市场/区域/系统/平台/产品线/认证）不脱敏；
- 特别强调：不要把「市场」「区域」因含「市」「区」字当成行政区划脱敏；不要把「万元」「亿元」因含「万」「元」字当成人名脱敏；不要把「毛利率」「净利率」因含「毛」「利」字当成人名脱敏；
- 经营数据脱敏只替换「具体数值」，保留维度词（写「营收【数据N】」，不写「【数据N】【数据N】」）；
- 数据最小化：只脱敏真实敏感项，公开信息（如工商公示的注册资本、公开报道）不脱敏；
- 不可逆性：脱敏后不保留可还原原文的线索，原名对照一律写入 aliasMap；
- 保留数字与结构，只替换真实的企业名、地名、人名、项目名、产品名、商标品牌、信用代码、单位名、客户名、个人敏感信息、敏感经营数值。

输出格式（严格 JSON，不要多余文字）：
{
  "knowledgeTree": "脱敏后的知识架构树 markdown（## 1. 维度名 分章节，维度由你根据定制要求自适应确定）",
  "dimensions": ["维度1", "维度2"],
  "suggestions": ["建议1", "建议2"],
  "aliasMap": { "原始名称": "【代号】" }
}

suggestions 是针对该智能体定制需求的建议（根据人设、场景、能力判断缺少哪些维度或需补充什么资料），同样脱敏处理。`;

/** 用定制参数填充蒸馏 prompt 模板 */
function buildDistillPersona(name: string, industry: string, persona?: string, scenarios?: string[], capabilities?: string[], productionBlueprint?: DistillInput['productionBlueprint']): string {
  const sc = (scenarios && scenarios.length) ? scenarios.join("、") : "（未指定）";
  const cap = (capabilities && capabilities.length) ? capabilities.join("、") : "（未指定）";
  const per = persona || `${industry} 行业智能体`;
  return DISTILL_PERSONA_TEMPLATE
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{industry\}\}/g, industry)
    .replace(/\{\{persona\}\}/g, per)
    .replace(/\{\{scenarios\}\}/g, sc)
    .replace(/\{\{capabilities\}\}/g, cap)
    .replace(/\{\{productionType\}\}/g, productionBlueprint?.productionType || "advisor")
    .replace(/\{\{productionContract\}\}/g, productionBlueprint ? JSON.stringify(productionBlueprint) : "（未提供）");
}

/** 从 agent 输出中健壮地解析 JSON */
function parseJson(text: string): DistillResult | null {
  const t = text.trim();
  // 1) 直接解析
  try { return normalize(JSON.parse(t)); } catch { /* continue */ }
  // 2) 提取 ```json ... ``` 代码块
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) { try { return normalize(JSON.parse(fence[1].trim())); } catch { /* continue */ } }
  // 3) 提取第一个 { ... } 平衡块
  const start = t.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < t.length; i++) {
      if (t[i] === "{") depth++;
      else if (t[i] === "}") { depth--; if (depth === 0) { try { return normalize(JSON.parse(t.slice(start, i + 1))); } catch { break; } } }
    }
  }
  return null;
}

function normalize(obj: any): DistillResult {
  const aliasMap = obj.aliasMap || obj.alias_map;
  return {
    knowledgeTree: String(obj.knowledgeTree || obj.knowledge_tree || obj.tree || ""),
    dimensions: Array.isArray(obj.dimensions) ? obj.dimensions.map(String) : [],
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.map(String) : [],
    aliasMap: aliasMap && typeof aliasMap === "object" ? aliasMap : undefined,
  };
}

async function runDistillModel(persona: string, task: string): Promise<string> {
  const result = await callLLM([
    { role: "system", content: persona },
    { role: "user", content: task },
  ], 0.2, 8000, 1);
  if (result.model === "none" || result.model === "blocked") {
    throw new Error("AI模型尚未在系统设置中完成受控配置");
  }
  return result.content;
}

/** 蒸馏：资料 → 知识架构树（根据智能体定制要求自适应蒸馏） */
export async function distill(input: DistillInput): Promise<DistillResult> {
  const docsText = input.documents
    .map((d, i) => `### 资料${i + 1}：${d.name}\n${d.content}`)
    .join("\n\n");

  const experienceText = input.experience?.trim() || "（未提供已确认的专家经验规则）";
  const task = `【行业】${input.industry}\n\n【参考资料】\n${docsText}\n\n【已由专家确认的经验规则与验证案例】\n${experienceText}\n\n【分型生产合同】\n${input.productionBlueprint ? JSON.stringify(input.productionBlueprint) : "（未提供）"}`;
  const persona = buildDistillPersona(input.name || "行业智能体", input.industry, input.persona, input.scenarios, input.capabilities, input.productionBlueprint);

  const text = await runDistillModel(persona, task);

  const parsed = parseJson(text);
  if (parsed) return parsed;

  // 解析失败自动重试一次：要求模型只输出合法 JSON
  const retryText = await runDistillModel(persona, `${task}\n\n${JSON_RETRY_PROMPT}`);
  const retryParsed = parseJson(retryText);
  if (retryParsed) return retryParsed;

  return {
    knowledgeTree: text || "",
    dimensions: [],
    suggestions: ["蒸馏结果未能解析为结构化 JSON，建议重新蒸馏或简化资料。"],
  };
}

/** 增量蒸馏：把新增资料合并到现有知识树，输出更新后的完整知识树 */
export async function distillIncremental(
  baseTree: string,
  input: DistillInput
): Promise<DistillResult> {
  const docsText = input.documents
    .map((d, i) => `### 新增资料${i + 1}：${d.name}\n${d.content}`)
    .join("\n\n");

  const experienceText = input.experience?.trim() || "（未提供新增的专家确认规则）";
  const task = `【行业】${input.industry}\n\n【现有知识架构树】\n${baseTree}\n\n【新增资料】\n${docsText}\n\n【已由专家确认的经验规则与验证案例】\n${experienceText}\n\n【分型生产合同】\n${input.productionBlueprint ? JSON.stringify(input.productionBlueprint) : "（未提供）"}\n\n请把新增资料、已确认规则和分型合同增量合并到现有知识树（新增维度、补充/更新已有维度），不得改变专家确认规则和生产门禁的含义，输出更新后的完整知识树 JSON（含更新后的 dimensions/suggestions/aliasMap）。`;
  const persona = buildDistillPersona(input.name || "行业智能体", input.industry, input.persona, input.scenarios, input.capabilities, input.productionBlueprint);

  const text = await runDistillModel(persona, task);

  const parsed = parseJson(text);
  if (parsed) return parsed;
  const retryText = await runDistillModel(persona, `${task}\n\n${JSON_RETRY_PROMPT}`);
  const retryParsed = parseJson(retryText);
  if (retryParsed) return retryParsed;
  return {
    knowledgeTree: text || baseTree,
    dimensions: [],
    suggestions: ["增量蒸馏未能解析为结构化 JSON。"],
  };
}

/** 润色智能体定制表单的文本（描述 / 人设 / 场景），复用系统设置的 LLM 通道。 */
export async function polishText(text: string, kind: "description" | "persona" | "scenario"): Promise<string> {
  const guide = kind === "persona"
    ? "把下面这段人设润色得更专业、更立体、更有画面感，保持原意与第一人称视角，适当补充表达。直接输出润色后的文字（中文），不要解释、不要加引号："
    : kind === "scenario"
      ? "把下面这段场景描述润色成更规范、更清晰的表述，保持原意。直接输出润色后的文字（中文），不要解释："
      : "把下面这段描述润色得更专业、更精炼、更有吸引力，保持原意。直接输出润色后的文字（中文），不要解释：";
  const cleaned = (await runDistillModel(
    "你是专业的智能体文案润色专家，擅长把行业语言改写得专业、清晰、克制。",
    `${guide}\n\n${text}`,
  )).trim();
  if (cleaned === '') {
    throw new Error('AI 润色未返回结果：请检查系统设置中的模型配置');
  }
  return cleaned;
}
