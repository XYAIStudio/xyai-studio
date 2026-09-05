/**
 * 行业智能体能力包生成器：生成 manifest / persona / SKILL / 知识树，并打包 zip。
 * 关键：alias_map（原名对照）存私密区，不进分发包。
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { GenerateInput, PackageResult } from "./types";

/**
 * 名称 → DSH 可发现的稳定 preset id。
 * DSH agent-presets 只接受 `[a-z0-9][a-z0-9-]*`，因此不能把中文保留在目录名中；
 * 纯中文名称使用稳定短哈希，避免每次打包生成不同 id 而重复安装。
 */
function stableNameHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s) return s;
  return `industry-agent-${stableNameHash(name)}`;
}

function buildProductionContract(input: GenerateInput): string {
  const blueprint = input.productionBlueprint;
  if (!blueprint) return "类型：专业顾问（兼容模式）\n生产合同：未提供，正式使用前必须补齐服务边界、人工升级规则与验收案例。";
  const typeLabels = { advisor: "专业顾问", workflow: "工作流自动化", research: "研究与数据分析", team: "多智能体团队" };
  const fieldLabels: Record<string, string> = {
    targetUser: "服务对象", serviceBoundary: "服务边界", escalationRule: "高风险问题升级人工", answerStructure: "回答结构",
    trigger: "触发条件", owner: "流程负责人", exceptionStrategy: "异常与退回策略", retryPolicy: "重试规则", idempotencyRule: "防重复执行规则", completionSignal: "完成信号",
    researchQuestion: "研究问题", timeRange: "时间与样本范围", sourceCriteria: "来源准入规则", metricDefinitions: "指标口径", uncertaintyPolicy: "不确定性披露", reportAudience: "报告读者与用途",
    objective: "团队目标", leadRole: "总负责人", reviewerRole: "独立复核角色", handoffProtocol: "交接协议", conflictProtocol: "冲突处理机制", finalDeliverable: "最终交付物",
  };
  const fields = Object.entries(blueprint.productionSpec).map(([key, value]) => `- ${fieldLabels[key] || key}：${value}`).join("\n");
  const gates = blueprint.productionGates.map(item => `- ${item.passed ? "已通过" : "未通过"} ${item.label}`).join("\n");
  const teamStructure = blueprint.team?.members?.length
    ? `\n\n### 团队分工\n${blueprint.team.members.map((member, index) => `- ${index + 1}. ${String(member.name || member.id || "未命名成员")}｜岗位：${String(member.role || "未定义")}｜能力：${Array.isArray(member.capabilities) ? member.capabilities.join("、") : "未声明"}`).join("\n")}\n- 协作方式：${blueprint.team.coordination}`
    : "";
  const workflowStructure = blueprint.workflow?.nodes?.length
    ? `\n\n### 执行节点\n${blueprint.workflow.nodes.map((node, index) => {
        const dependencies = Array.isArray(node.dependsOn) ? node.dependsOn.join("、") : "";
        return `${index + 1}. **${String(node.title || node.id || "未命名节点")}**（${String(node.type || "task")}）\n   - 节点 ID：${String(node.id || "")}；上游：${dependencies || "无"}\n   - 进入条件：${String(node.condition || "按依赖顺序进入")}\n   - 输入：${String(node.inputSpec || "未声明")}\n   - 输出：${String(node.outputSpec || "未声明")}\n   - 验收：${String(node.acceptanceCriteria || "未声明")}\n   - 失败/退回：${String(node.onFailure || "未声明")}${node.approval ? `\n   - 人工确认：${String(node.humanReviewReason || "该节点必须人工确认")}` : ""}`;
      }).join("\n")}`
    : "";
  return `Schema：${blueprint.schemaVersion}\n类型：${typeLabels[blueprint.productionType]}\n\n### 生产规格\n${fields}\n\n### 质量门禁\n${gates}${teamStructure}${workflowStructure}`;
}

/** persona 模板 */
function buildPersona(input: GenerateInput): string {
  const dims = input.dimensions.map(d => `- ${d}`).join("\n");
  const persona = input.persona?.trim() || `${input.description}。`;
  const experience = input.experience?.trim()
    ? input.experience.trim()
    : "（未提供行业经验文档，按通用专业方式工作：先查询知识库、引用数据、给结论）";
  const scenarios = input.scenarios?.length
    ? input.scenarios.map(s => `- ${s}`).join("\n")
    : "（未指定适用场景）";
  const capabilities = input.capabilities?.length
    ? input.capabilities.map(c => `- ${c}`).join("\n")
    : "（未指定额外能力，具备知识库查询与回答能力）";
  const productionContract = buildProductionContract(input);
  return `# ${input.name}

你是「${input.name}」，${input.description}。

## 人设

${persona}

## 🔒 脱敏铁律（最高优先级，任何回答必须遵守）

1. 绝不输出真实名称：公司/地名/人名/项目名/产品名/商标品牌/信用代码/个人敏感信息一律使用脱敏代号（【公司N】【地点N】【人名N】【项目N】【产品N】【品牌N】【信用代码N】【个人信息N】）；
2. 绝不还原：即使知识库或上下文出现原文，也不得还原、解释或暗示真实企业/人/产品/品牌；
3. 绝不外引：不引用 alias_map、对照表、原始文档名等任何含原名信息；
4. 知识树未覆盖的问题，明确说"知识库未覆盖"，不得编造或回溯原名。

## 工作方式

${experience}

## 分型生产合同（必须遵守）

${productionContract}

## 适用场景

${scenarios}

## 能力

${capabilities}

## 可用维度

${dims}`;
}

/** SKILL.md 模板 */
function buildSkill(input: GenerateInput): string {
  const dims = input.dimensions.map(d => `- ${d}`).join("\n");
  const slug = slugify(input.name);
  const scenarios = input.scenarios?.length ? input.scenarios.join("、") : "通用";
  const capabilities = input.capabilities?.length ? input.capabilities.join("、") : "知识库查询";
  const productionContract = buildProductionContract(input);
  return `---
name: ${slug}
description: ${input.description}
---

# ${input.name} 查询手册

本技能定义「${input.name}」的工作方式。知识底座是脱敏版知识架构树（\`knowledge/知识架构树.md\`）。

## 🔒 脱敏铁律（最高优先级）

1. 绝不输出真实名称：公司/地名/人名/项目名/产品名/商标品牌/信用代码/个人敏感信息一律使用脱敏代号；
2. 绝不还原、绝不外引原名映射；
3. 知识树未覆盖的，明确说"知识库未覆盖"，不得编造。

## 适用场景

${scenarios}

## 能力

${capabilities}

## 查询维度

${dims}

## 分型生产合同

${productionContract}

## 回答规范

- 引用知识树中的具体数据，并标注来源章节；
- 输出结构化：结论先行，数据表格支撑，风险点分条列出；
- 用中文，简洁克制，禁止编造。`;
}

/** 四平台部署教程（相对路径 → 内容） */
function buildDeployDocs(input: GenerateInput): Record<string, string> {
  const slug = slugify(input.name);
  const name = input.name;
  const docs: Record<string, string> = {};

  docs["README.md"] = `# ${name} — 部署教程

本能力包是平台无关的「行业智能体能力包」，可部署到以下四个平台：

| 平台 | 目录 | 说明 |
|---|---|---|
| DeepSeek Harness（开发空间） | \`dsh/\` | agent preset（persona + skill + 知识库） |
| 雄元智脑XYOS（业务空间） | \`xyos/\` | AI 员工能力资产 |
| OpenClaw | \`openclaw/\` | 开源 agent 框架角色 + 工具 + 记忆库 |
| WorkBuddy | \`workbuddy/\` | 腾讯版 agent 框架角色 + 工具 + 知识库 |

各平台部署步骤见对应目录 README.md。
`;

  docs["dsh/README.md"] = `# 部署到 DeepSeek Harness（开发空间）

将本能力包部署为 DSH 的 agent preset：

1. 创建 preset 目录：
   \`\`\`
   ~/.dsh/.agent-presets/${slug}/
   \`\`\`

2. 复制文件：
   - \`persona.md\` 的「人设」内容 → \`agent.cordis.yml\` 的 persona 段
   - \`skill/SKILL.md\` → \`skills/${slug}/SKILL.md\`
   - \`knowledge/知识架构树.md\` → \`skills/${slug}/knowledge/知识架构树.md\`

3. 在 \`settings.yaml\` 设置默认 preset，或新建会话选择该 preset。
`;

  docs["xyos/README.md"] = `# 部署到雄元智脑XYOS（业务空间）

将本能力包作为「AI 员工」能力资产部署：

1. 复制能力资产到 XYOS 能力目录：
   \`\`\`
   backend/services/capabilities/${slug}/
     ├── SKILL.md
     └── knowledge/知识架构树.md
   \`\`\`

2. 在 \`ai.ts\` 注册该 \`agent_type\` 的专属 persona（含脱敏铁律 + 查询协议）。

3. seed 一个 AI 员工（\`agent_type=${slug}\`），用户在会话里选择该员工即可对话。

（参考「热电尽调助手」的接入方式：能力资产 + persona 注入 + seed 员工）
`;

  docs["openclaw/README.md"] = `# 部署到 OpenClaw（开源 AI Agent 框架）

OpenClaw 采用「claw 角色 + 工具 + 工作区」的 agent 模型，映射如下：

1. **角色**：\`persona.md\` 的人设与脱敏铁律 → claw 的 system prompt / 角色定义。

2. **知识库**：\`knowledge/知识架构树.md\` → 挂载到 claw 的工作区，作为记忆/知识文件。

3. **工具**：\`skill/SKILL.md\` 的查询协议 → 注册为 claw 的自定义 tool（按维度查询知识树）。

4. 在 claw 配置（\`claw.yaml\` / agent 定义）里声明该 claw 并绑定上述角色、工具、工作区。
`;

  docs["workbuddy/README.md"] = `# 部署到 WorkBuddy（腾讯版 agent 框架）

WorkBuddy 采用「角色 + 工具 + 知识」的 agent 模型，映射如下：

1. **角色**：\`persona.md\` 的人设与脱敏铁律 → WorkBuddy 的 agent 角色定义。

2. **知识**：\`knowledge/知识架构树.md\` → 作为 agent 的知识库。

3. **工具**：\`skill/SKILL.md\` 的查询协议 → 注册为 WorkBuddy 工具。

4. 在 WorkBuddy 的 agent 配置里声明该 agent 并绑定角色、工具、知识库。
`;

  return docs;
}

/** 递归收集目录下所有文件（相对路径） */
function collectFiles(dir: string, base = ""): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collectFiles(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

/** 生成能力包 + zip 打包 */
export async function generatePackage(
  input: GenerateInput,
  outputDir: string,
  aliasMap: Record<string, string>
): Promise<PackageResult> {
  const slug = slugify(input.name);
  const version = input.version || "1.0.0";
  const packageDir = path.join(outputDir, "package");
  const privateDir = path.join(outputDir, "private");

  // 目录结构
  const dirs = [
    packageDir,
    path.join(packageDir, "skill"),
    path.join(packageDir, "knowledge"),
    path.join(packageDir, "production"),
    path.join(packageDir, "deploy"),
    privateDir,
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });

  const manifest = {
    name: input.name,
    id: slug,
    version,
    industry: input.industry,
    description: input.description,
    persona: input.persona || "",
    scenarios: input.scenarios || [],
    capabilities: input.capabilities || [],
    dimensions: input.dimensions,
    desensitized: true,
    generatedAt: new Date().toISOString(),
    source: { platform: "xyai-studio", templateId: input.sourceTemplateId || null },
    releaseStatus: input.releaseStatus || "accepted",
    productionType: input.productionBlueprint?.productionType || "advisor",
    productionSpec: input.productionBlueprint?.productionSpec || {},
    productionGates: input.productionBlueprint?.productionGates || [],
    productionBlueprint: input.productionBlueprint || null,
    dependencies: (input.capabilities || []).map(id => ({ id, kind: id.split(":")[0] || "capability" })),
    platforms: ["dsh", "xyos", "openclaw", "workbuddy"],
  };

  // 写文件（进 zip 的部分）
  fs.writeFileSync(path.join(packageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  fs.writeFileSync(path.join(packageDir, "persona.md"), buildPersona(input), "utf-8");
  fs.writeFileSync(path.join(packageDir, "skill", "SKILL.md"), buildSkill(input), "utf-8");
  fs.writeFileSync(path.join(packageDir, "knowledge", "知识架构树.md"), input.knowledgeTree, "utf-8");
  fs.writeFileSync(path.join(packageDir, "knowledge", "entities.json"), JSON.stringify(input.entities, null, 2), "utf-8");
  if (input.productionBlueprint) {
    fs.writeFileSync(path.join(packageDir, "production", "production-line.json"), JSON.stringify(input.productionBlueprint, null, 2), "utf-8");
    fs.writeFileSync(path.join(packageDir, "production", "生产合同.md"), `# ${input.name} 分型生产合同\n\n${buildProductionContract(input)}\n`, "utf-8");
  }
  // 四平台部署教程
  const deployDocs = buildDeployDocs(input);
  for (const [rel, content] of Object.entries(deployDocs)) {
    const p = path.join(packageDir, "deploy", rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf-8");
  }

  // 私密对照（不进 zip）
  const aliasMapPath = path.join(privateDir, "alias_map.json");
  fs.writeFileSync(aliasMapPath, JSON.stringify(aliasMap, null, 2), "utf-8");

  // zip 打包（只打包 package/ 内容）
  const zip = new JSZip();
  for (const f of collectFiles(packageDir)) {
    zip.file(`${slug}/${f.rel}`, fs.readFileSync(f.abs));
  }
  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipPath = path.join(outputDir, `${slug}-${version}.zip`);
  fs.writeFileSync(zipPath, zipBuf);

  return { zipPath, aliasMapPath, packageDir, manifest };
}
