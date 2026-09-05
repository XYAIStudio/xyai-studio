/**
 * 行业智能体生成器 API
 * - POST /api/industry-agent/generate     创建生成任务（异步）
 * - GET  /api/industry-agent/jobs/:id     查询任务进度与结果
 * - GET  /api/industry-agent/jobs/:id/download  下载能力包 zip
 * - GET  /api/industry-agent/jobs/:id/alias-map 下载私密对照表
 */
import { Router } from "express";
import { authenticate, authenticateOptional, AuthRequest, readLocalGuestSession } from "../middleware";
import { generateIndustryAgent, GenerateAgentResult } from "../services/industry-agent-generator/generator";
import { installPackage } from "../services/industry-agent-generator/install";
import { polishText } from "../services/industry-agent-generator/distiller";
import type { ProductionBlueprint, ProductionType } from "../services/industry-agent-generator/types";
import { dbGet, dbRun, saveDb } from "../db";
import fs from "node:fs";
import path from "node:path";

export const industryAgentRoutes = Router();

interface Job {
  id: string;
  /** Undefined until a local guest package is claimed by an XYOS account. */
  tenantId?: number;
  /** High-entropy local session that owns an unclaimed, desktop-only draft. */
  guestSession?: string;
  status: "running" | "done" | "failed";
  progress: string;
  result?: GenerateAgentResult;
  error?: string;
  createdAt: string;
  talentId?: number;
}

const jobs = new Map<string, Job>();

function canReadJob(req: AuthRequest, job: Job): boolean {
  if (job.tenantId !== undefined) return req.user?.tenant_id === job.tenantId;
  const guestSession = readLocalGuestSession(req);
  return guestSession !== undefined && guestSession === job.guestSession;
}

/** Claiming happens at the account-required distribution boundary, never during local draft generation. */
function claimGuestJob(req: AuthRequest, job: Job): boolean {
  if (!req.user) return false;
  if (job.tenantId !== undefined) return job.tenantId === req.user.tenant_id;
  if (!job.result || !canReadJob(req, job)) return false;
  job.tenantId = req.user.tenant_id;
  job.guestSession = undefined;
  job.talentId = registerTalent(job.tenantId, job.result);
  return true;
}

const PRODUCTION_SPEC_KEYS: Record<ProductionType, string[]> = {
  advisor: ["targetUser", "serviceBoundary", "escalationRule", "answerStructure"],
  workflow: ["trigger", "owner", "exceptionStrategy", "retryPolicy", "idempotencyRule", "completionSignal"],
  research: ["researchQuestion", "timeRange", "sourceCriteria", "metricDefinitions", "uncertaintyPolicy", "reportAudience"],
  team: ["objective", "leadRole", "reviewerRole", "handoffProtocol", "conflictProtocol", "finalDeliverable"],
};
const PRODUCTION_SPEC_MIN_LENGTHS: Record<ProductionType, Record<string, number>> = {
  advisor: { targetUser: 4, serviceBoundary: 10, escalationRule: 10, answerStructure: 8 },
  workflow: { trigger: 8, owner: 4, exceptionStrategy: 12, retryPolicy: 8, idempotencyRule: 8, completionSignal: 8 },
  research: { researchQuestion: 12, timeRange: 6, sourceCriteria: 12, metricDefinitions: 12, uncertaintyPolicy: 12, reportAudience: 6 },
  team: { objective: 12, leadRole: 4, reviewerRole: 4, handoffProtocol: 12, conflictProtocol: 12, finalDeliverable: 10 },
};
const PRODUCTION_GATE_IDS: Record<ProductionType, string[]> = {
  advisor: ["advisor-user", "advisor-boundary", "advisor-escalation", "advisor-output", "advisor-experience", "advisor-cases"],
  workflow: ["workflow-trigger", "workflow-owner", "workflow-nodes", "workflow-contracts", "workflow-failure-paths", "workflow-exception", "workflow-retry", "workflow-idempotency", "workflow-complete"],
  research: ["research-question", "research-range", "research-sources", "research-metrics", "research-uncertainty", "research-audience", "research-nodes", "research-failure-paths"],
  team: ["team-objective", "team-members", "team-lead", "team-reviewer", "team-handoff", "team-conflict", "team-deliverable"],
};

function validateWorkflowGraph(nodes: Array<Record<string, any>>, productionType: "workflow" | "research"): void {
  const ids = nodes.map(node => String(node.id || "").trim());
  if (new Set(ids).size !== ids.length) throw new Error("流程节点 ID 必须唯一");
  const known = new Set(ids);
  const dependencies = new Map<string, string[]>();
  for (const node of nodes) {
    const id = String(node.id || "").trim();
    if (!id || !String(node.type || "").trim() || !String(node.title || "").trim()) throw new Error("每个流程节点必须包含唯一 ID、类型和名称");
    if ([node.inputSpec, node.outputSpec, node.acceptanceCriteria].some(value => String(value || "").trim().length < 4)) throw new Error("每个流程节点必须包含有效的输入、输出和验收标准");
    if (String(node.onFailure || "").trim().length < 8) throw new Error("每个流程节点必须明确失败、退回或证据不足时的处理路径");
    const refs = Array.isArray(node.dependsOn) ? node.dependsOn.map((value: unknown) => String(value).trim()).filter(Boolean) : [];
    if (refs.some(ref => ref === id || !known.has(ref))) throw new Error(`节点 ${id} 存在无效或自引用的上游依赖`);
    dependencies.set(id, refs);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`${productionType === "research" ? "研究" : "工作流"}节点依赖存在循环，无法形成可执行顺序`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) || []) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  ids.forEach(visit);
}

export function parseProductionBlueprint(body: Record<string, any>, experience: unknown): ProductionBlueprint | undefined {
  if (body.productionType === undefined) return undefined; // 兼容旧版客户端，仅允许作为历史草稿生成。
  if (!["advisor", "workflow", "research", "team"].includes(String(body.productionType))) throw new Error("productionType 无效");
  const productionType = body.productionType as ProductionType;
  if (!body.productionSpec || typeof body.productionSpec !== "object" || Array.isArray(body.productionSpec)) throw new Error("productionSpec 必须是对象");
  const productionSpec = Object.fromEntries(PRODUCTION_SPEC_KEYS[productionType].map(key => {
    const value = body.productionSpec[key];
    if (typeof value !== "string" || value.trim().length < PRODUCTION_SPEC_MIN_LENGTHS[productionType][key]!) throw new Error(`分型生产规格未完成：${key}`);
    return [key, value.trim().slice(0, 1000)];
  }));
  const expectedGateIds = PRODUCTION_GATE_IDS[productionType];
  const submittedGateIds = Array.isArray(body.productionGates) ? body.productionGates.map((item: any) => String(item?.id || "")) : [];
  if (!Array.isArray(body.productionGates) || submittedGateIds.length !== expectedGateIds.length || new Set(submittedGateIds).size !== expectedGateIds.length || expectedGateIds.some(id => !submittedGateIds.includes(id)) || body.productionGates.some((item: any) => item?.passed !== true)) {
    throw new Error("分型质量门禁尚未全部通过，禁止生成正式能力包");
  }
  const productionGates = body.productionGates.slice(0, 20).map((item: any) => ({
    id: String(item.id || "").slice(0, 80), label: String(item.label || "").slice(0, 120), passed: true,
    blocking: item.blocking === "simulation" ? "simulation" as const : "acceptance" as const,
    action: String(item.action || "").slice(0, 500),
  }));
  if (productionType === "advisor") {
    const text = typeof experience === "string" ? experience : "";
    if (!["典型案例", "边界案例", "反例"].every(label => text.includes(`[${label}]`)) || (text.match(/专家判定：已通过/g) || []).length < 3) {
      throw new Error("专业顾问必须提供典型案例、边界案例和反例，并留下三项专家通过证据");
    }
  }

  let team: ProductionBlueprint["team"];
  if (productionType === "team") {
    if (!body.team || !Array.isArray(body.team.members) || body.team.members.length < 2) throw new Error("多智能体团队至少需要两名成员");
    const roles = new Set(body.team.members.map((item: any) => String(item?.role || "").trim()).filter(Boolean));
    if (roles.size < 2 || productionSpec.leadRole === productionSpec.reviewerRole) throw new Error("团队必须具备互补角色，且负责人不能兼任独立复核人");
    if (!roles.has(productionSpec.leadRole) || !roles.has(productionSpec.reviewerRole)) throw new Error("总负责人和独立复核岗位必须分别绑定到真实团队成员");
    team = { coordination: ["serial", "parallel"].includes(body.team.coordination) ? body.team.coordination : "hybrid", members: body.team.members.slice(0, 20) };
  }

  let workflow: ProductionBlueprint["workflow"];
  if (productionType === "workflow" || productionType === "research") {
    const minNodes = productionType === "research" ? 5 : 2;
    if (!body.workflow || !Array.isArray(body.workflow.nodes) || body.workflow.nodes.length < minNodes) throw new Error(`${productionType === "research" ? "研究" : "工作流"}生产线至少需要 ${minNodes} 个完整节点`);
    const nodes = body.workflow.nodes.slice(0, 50);
    validateWorkflowGraph(nodes, productionType);
    workflow = { nodes, edges: Array.isArray(body.workflow.edges) ? body.workflow.edges.slice(0, 100) : undefined };
  }
  return { schemaVersion: "xyai.production-line.v1", productionType, productionSpec, productionGates, ...(team ? { team } : {}), ...(workflow ? { workflow } : {}) };
}

function jobView(job: Job) {
  if (!job.result) {
    return { id: job.id, status: job.status, progress: job.progress, error: job.error, createdAt: job.createdAt };
  }
  const r = job.result;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    name: r.manifest.name,
    industry: r.manifest.industry,
    dimensions: r.distill.dimensions,
    suggestions: r.suggestions,
    aliasCount: r.aliasCount,
    aliasMap: readAliasMap(r.aliasMapPath),
    desensitizedTree: r.desensitizedTree,
    zipName: path.basename(r.zipPath),
    version: r.manifest.version,
    quality: r.quality,
    talentId: job.talentId,
    talentRegistered: Boolean(job.talentId),
  };
}

function readAliasMap(aliasMapPath: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(aliasMapPath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * 将生成完成的智能体登记到人才市场。
 * 它必须先由管理员招募进入备选库、完成部门分配后，才成为沟通协作中的正式员工。
 */
function registerTalent(tenantId: number, result: GenerateAgentResult): number {
  const manifest = result.manifest;
  const slug = typeof manifest.id === "string" && manifest.id.length > 0 ? manifest.id : "industry-agent";
  const name = typeof manifest.name === "string" && manifest.name ? manifest.name : slug;
  const category = typeof manifest.industry === "string" && manifest.industry ? manifest.industry : "行业智能体";
  const description = typeof manifest.description === "string" ? manifest.description : `${category}智能助手`;
  const skills = Array.isArray(manifest.capabilities) ? (manifest.capabilities as string[]).join(",") : "";
  const capabilities = JSON.stringify(Array.isArray(manifest.capabilities) ? manifest.capabilities : []);

  // 生成轮询可能被重复触发；同一租户同一智能体仅保留一个可招募条目。
  const existing = dbGet(
    "SELECT id FROM talent_pool WHERE tenant_id = ? AND agent_type = ? AND status = 'available' ORDER BY id DESC LIMIT 1",
    [tenantId, slug],
  ) as { id?: number } | undefined;
  if (existing?.id) {
    dbRun(
      `UPDATE talent_pool SET name = ?, category = ?, description = ?, skills = ?, capabilities = ?,
       provider = 'XYAI Studio', integration_type = 'xyos-agent-package', source = 'agent-customization',
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
      [name, category, description, skills, capabilities, existing.id, tenantId],
    );
    saveDb();
    return Number(existing.id);
  }

  const r = dbRun(
    `INSERT INTO talent_pool
     (tenant_id, talent_type, name, avatar_emoji, skills, category, description, source, rating, status,
      agent_type, capabilities, provider, integration_type)
     VALUES (?, 'ai', ?, '🤖', ?, ?, ?, 'agent-customization', 5, 'available', ?, ?, 'XYAI Studio', 'xyos-agent-package')`,
    [tenantId, name, skills, category, description, slug, capabilities],
  );
  saveDb();
  return Number(r.lastInsertRowid);
}

// 创建生成任务
industryAgentRoutes.post("/generate", authenticateOptional, (req: AuthRequest, res) => {
  try {
    const { name, industry, description, documents, experience, persona, scenarios, capabilities, version } = req.body;
    if (!name || !industry) return res.status(400).json({ success: false, error: "name 与 industry 必填（请先填写智能体名称与行业）" });
    // 无资料时 generator 会用智能体设置自动生成占位资料，由 LLM 自行蒸馏行业通用知识
    if (Array.isArray(documents)) {
      if (documents.length > 20) return res.status(400).json({ success: false, error: "单批资料最多 20 份，请拆分为增量版本" });
      for (const d of documents) {
        if (!d.name || typeof d.content !== "string" || !d.content.trim()) {
          return res.status(400).json({ success: false, error: "documents 每项需含 name 与非空 content" });
        }
        if (Buffer.byteLength(d.content, "utf8") > 2 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: `资料 ${String(d.name)} 超过 2MB，请按主题拆分` });
        }
      }
    }
    if (experience !== undefined && (typeof experience !== "string" || Buffer.byteLength(experience, "utf8") > 512 * 1024)) {
      return res.status(400).json({ success: false, error: "经验规则与验证案例必须为文本且不超过 512KB" });
    }
    let productionBlueprint: ProductionBlueprint | undefined;
    try { productionBlueprint = parseProductionBlueprint(req.body, experience); }
    catch (error) { return res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) }); }

    const guestSession = req.user ? undefined : readLocalGuestSession(req);
    if (!req.user && !guestSession) {
      return res.status(401).json({ success: false, error: "未登录：本机草稿生成仅限 XYAI Studio 本地桌面端" });
    }
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = path.join(process.env.XYOS_RUNTIME_WORKSPACE || path.join(process.cwd(), "runtime-workspace"), "industry-agent", id);
    const job: Job = {
      id,
      ...(req.user ? { tenantId: req.user.tenant_id } : { guestSession }),
      status: "running",
      progress: "正在蒸馏参考资料...",
      createdAt: new Date().toISOString(),
    };
    jobs.set(id, job);

    // 后台异步生成
    void (async () => {
      try {
        job.progress = "蒸馏完成，正在脱敏与打包...";
        const result = await generateIndustryAgent({
          name,
          industry,
          description: description || `${industry} 行业智能体`,
          documents: Array.isArray(documents) ? documents : [],
          experience: experience || undefined,
          persona: persona || undefined,
          scenarios: Array.isArray(scenarios) ? scenarios.filter(Boolean) : undefined,
          capabilities: Array.isArray(capabilities) ? capabilities.filter(Boolean) : undefined,
          version: version || undefined,
          productionBlueprint,
          outputDir,
        });
        job.result = result;
        if (job.tenantId !== undefined) job.talentId = registerTalent(job.tenantId, result);
        job.progress = "生成完成";
        job.status = "done";
      } catch (err: any) {
        job.status = "failed";
        job.error = err?.message || String(err);
        job.progress = "生成失败";
      }
    })();

    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 增量升级：基于已有能力包 + 新增资料，增量蒸馏并版本 +1（IMA 知识库更新 → 插件升级）
industryAgentRoutes.post("/upgrade", authenticate, (req: AuthRequest, res) => {
  try {
    const { baseJobId, documents } = req.body;
    if (!baseJobId) return res.status(400).json({ success: false, error: "baseJobId 必填（基础能力包任务 id）" });
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, error: "documents 至少一份（新增资料）" });
    }

    const baseJob = jobs.get(baseJobId);
    if (!baseJob || baseJob.tenantId !== req.user!.tenant_id || !baseJob.result) {
      return res.status(404).json({ success: false, error: "基础任务不存在或未完成" });
    }

    // 版本 +1（1.0.0 → 1.1.0）
    const baseVersion = (baseJob.result.manifest.version as string) || "1.0.0";
    const [major, minor, patch] = baseVersion.split(".").map(Number);
    const newVersion = `${major}.${minor + 1}.0`;

    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = path.join(process.env.XYOS_RUNTIME_WORKSPACE || path.join(process.cwd(), "runtime-workspace"), "industry-agent", id);
    const job: Job = {
      id,
      tenantId: req.user!.tenant_id,
      status: "running",
      progress: `正在增量蒸馏（版本 ${baseVersion} → ${newVersion}）...`,
      createdAt: new Date().toISOString(),
    };
    jobs.set(id, job);

    void (async () => {
      try {
        const result = await generateIndustryAgent({
          name: baseJob.result!.manifest.name as string,
          industry: baseJob.result!.manifest.industry as string,
          description: baseJob.result!.manifest.description as string,
          documents,
          persona: (baseJob.result!.manifest.persona as string) || undefined,
          scenarios: (baseJob.result!.manifest.scenarios as string[]) || undefined,
          capabilities: (baseJob.result!.manifest.capabilities as string[]) || undefined,
          productionBlueprint: (baseJob.result!.manifest.productionBlueprint as ProductionBlueprint) || undefined,
          version: newVersion,
          baseKnowledgeTree: baseJob.result!.desensitizedTree,
          outputDir,
        });
        job.result = result;
        job.talentId = registerTalent(job.tenantId, result);
        job.progress = "增量升级完成";
        job.status = "done";
      } catch (err: any) {
        job.status = "failed";
        job.error = err?.message || String(err);
        job.progress = "升级失败";
      }
    })();

    res.json({ success: true, data: { id, baseVersion, newVersion } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 查询任务
industryAgentRoutes.get("/jobs/:id", authenticateOptional, (req: AuthRequest, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || !canReadJob(req, job)) {
    return res.status(404).json({ success: false, error: "任务不存在" });
  }
  res.json({ success: true, data: jobView(job) });
});

// 下载能力包 zip
industryAgentRoutes.get("/jobs/:id/download", authenticate, (req: AuthRequest, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || !claimGuestJob(req, job) || !job.result) {
    return res.status(404).json({ success: false, error: "任务不存在或未完成" });
  }
  if (!fs.existsSync(job.result.zipPath)) {
    return res.status(404).json({ success: false, error: "分发包不存在" });
  }
  res.download(job.result.zipPath, path.basename(job.result.zipPath));
});

// 下载私密对照表
industryAgentRoutes.get("/jobs/:id/alias-map", authenticate, (req: AuthRequest, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || !claimGuestJob(req, job) || !job.result) {
    return res.status(404).json({ success: false, error: "任务不存在或未完成" });
  }
  if (!fs.existsSync(job.result.aliasMapPath)) {
    return res.status(404).json({ success: false, error: "对照表不存在" });
  }
  res.download(job.result.aliasMapPath, path.basename(job.result.aliasMapPath));
});

// ===== IMA 知识库挂接（OpenAPI：https://ima.qq.com/agent-interface） =====

import { listImaKnowledgeBases, listImaKnowledgeItems, getImaMediaContent } from "../services/ima-client";

// 连接 IMA：输入 ClientID + API Key，列出用户的知识库
industryAgentRoutes.post("/ima/connect", authenticate, async (req: AuthRequest, res) => {
  try {
    const { clientId, apiKey } = req.body;
    if (!clientId || !apiKey) return res.status(400).json({ success: false, error: "请填写 API Key 与 ClientID" });
    const bases = await listImaKnowledgeBases(clientId, apiKey);
    res.json({ success: true, data: { list: bases, count: bases.length } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "连接 IMA 失败" });
  }
});

// 拉取选中知识库的关联内容（浏览条目 → 关键词过滤 → 逐条下载文本）
industryAgentRoutes.post("/ima/fetch", authenticate, async (req: AuthRequest, res) => {
  try {
    const { clientId, apiKey, knowledgeBaseIds, keywords } = req.body;
    if (!clientId || !apiKey) return res.status(400).json({ success: false, error: "请填写 API Key 与 ClientID" });
    if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
      return res.status(400).json({ success: false, error: "请选择至少一个知识库" });
    }

    // 关键词定向拉取：用智能体定制字段（名称/行业/描述/能力/场景）过滤不相关条目
    const kws = (Array.isArray(keywords) ? keywords : []).map((s: unknown) => String(s).trim()).filter((s: string) => s.length > 0);
    const MAX_ITEMS_PER_KB = 30; // 每个知识库最多拉取的相关条目数，避免全量拉取耗时过长

    const documents: { name: string; content: string }[] = [];
    let skippedBinary = 0;
    let skippedUnavailable = 0;
    let skippedIrrelevant = 0;

    for (const kbId of knowledgeBaseIds.slice(0, 5)) {
      const items = await listImaKnowledgeItems(clientId, apiKey, String(kbId));
      // 标题命中任一关键词视为相关；未提供关键词时不过滤
      const relevant = kws.length === 0
        ? items
        : items.filter(it => {
            const title = (it.title || "").toLowerCase();
            return kws.some(k => title.includes(k.toLowerCase()));
          });
      skippedIrrelevant += items.length - relevant.length;
      for (const it of relevant.slice(0, MAX_ITEMS_PER_KB)) {
        try {
          const content = await getImaMediaContent(clientId, apiKey, it.media_id);
          if (content === null) {
            skippedBinary++; // PDF/Word/图片等二进制或不可访问条目
          } else if (content) {
            documents.push({ name: `${it.title || it.media_id}.txt`, content });
          } else {
            skippedUnavailable++;
          }
        } catch { skippedUnavailable++; } // 单条失败不阻断整库
      }
    }

    const parts: string[] = [];
    if (skippedIrrelevant > 0) parts.push(`已按关键词过滤 ${skippedIrrelevant} 条不相关条目`);
    if (skippedBinary > 0) parts.push(`跳过 ${skippedBinary} 个二进制条目（PDF/Word/图片等请在 ima 客户端查看原文）`);
    if (skippedUnavailable > 0) parts.push(`跳过 ${skippedUnavailable} 个不可访问条目`);
    const warn = parts.join("；");

    res.json({ success: true, data: { documents, count: documents.length, skipped: skippedIrrelevant, warn } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "拉取 IMA 知识失败" });
  }
});

// AI 润色：把描述/人设/场景等表单文本润色得更专业
industryAgentRoutes.post("/polish", authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, kind } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ success: false, error: "text 必填（请先输入要润色的内容）" });
    const polished = await polishText(String(text), kind === "persona" || kind === "scenario" ? kind : "description");
    res.json({ success: true, data: { text: polished } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "润色失败" });
  }
});

// ===== 一键安装：解包到 DSH skill / Agent preset / XYOS capability =====

industryAgentRoutes.post("/jobs/:id/install", authenticate, (req: AuthRequest, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || !claimGuestJob(req, job) || !job.result) {
    return res.status(404).json({ success: false, error: "任务不存在或未完成" });
  }

  const allowed = ["dsh", "preset", "xyos"];
  const rawTargets = Array.isArray(req.body?.targets) ? req.body.targets : ["dsh", "preset"];
  const targets = rawTargets.filter((t: unknown) => typeof t === "string" && allowed.includes(t));
  if (targets.length === 0) {
    return res.status(400).json({ success: false, error: "targets 为空或非法（可选 dsh / preset / xyos）" });
  }

  // XYOS 能力目录：后端以 backendDir 为 cwd 运行，故 services/capabilities 相对 cwd。
  const capabilitiesDir = path.join(process.cwd(), "services", "capabilities");
  const outcome = installPackage(job.result.packageDir, job.result.manifest, targets, capabilitiesDir);

  // 安装能力包不绕过人才治理流程：生成时已进入人才市场，须招募、入职和分配部门。
  res.json({ success: outcome.installed.length > 0, data: { ...outcome, talentId: job.talentId } });
});
