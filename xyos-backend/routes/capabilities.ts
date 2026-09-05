import { Router } from "express";
import { dbAll } from "../db";
import { authenticate, AuthRequest } from "../middleware";
import type { AssetManifest } from "../types/production-assets";
import { listProviders } from "../services/runtime/registry";
import { GovernanceEngine } from "../services/governance";
import { ToolRegistry } from "../services/tool-registry";
import { H2A2A2H_STATES } from "../services/h2a2a2h-state-machine";
import { builtinSampleAssets } from "../services/builtin-agent-catalog";

/**
 * XYOS 能力目录：只读聚合现有资源，不复制或改写业务表。
 * DSH+ 使用此接口发现可蒸馏、组合和调用的能力。
 */
export const capabilityRoutes = Router();
capabilityRoutes.use(authenticate);

function safeAll(sql: string, params: unknown[]): any[] {
  try { return dbAll(sql, params) as any[]; } catch { return []; }
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

function workflowMetadata(definition: unknown): Record<string, unknown> {
  const parsed = parseJson(definition);
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : Array.isArray(parsed.steps) ? parsed.steps : [];
  const nodes = rawNodes.map((node: any, index) => ({
    id: String(node?.id ?? node?.key ?? `node-${index + 1}`),
    type: String(node?.type ?? node?.kind ?? "task"),
    name: String(node?.name ?? node?.title ?? `步骤 ${index + 1}`),
    dependsOn: Array.isArray(node?.dependsOn) ? node.dependsOn.map(String) : [],
    approval: Boolean(node?.approval || node?.requiresApproval),
  }));
  return { ...parsed, nodes, nodeCount: nodes.length, approvalNodeCount: nodes.filter((node) => node.approval).length };
}

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "json-schema" as const, schema: { type: "object", properties, required } };
}

export function scoreCapabilityAsset(asset: AssetManifest): Record<string, unknown> {
  const hasInput = Boolean(asset.input);
  const hasOutput = Boolean(asset.output);
  const hasRuntime = Boolean(asset.runtimeProviders?.length || asset.capabilities?.some((cap) => cap.kind === "runtime"));
  const hasPermissions = Boolean(asset.permissions?.length || asset.capabilities?.some((cap) => cap.requiredPermissions?.length));
  const hasEvidence = Boolean(asset.evaluation || asset.kind === "evaluation" || asset.metadata?.qualityGate);
  const portabilityScore =
    (hasInput ? 20 : 0) +
    (hasOutput ? 20 : 0) +
    (hasRuntime ? 20 : 0) +
    (hasPermissions ? 15 : 0) +
    (hasEvidence ? 15 : 0) +
    (asset.source?.platform === "xyos" ? 10 : 0);
  const gaps = [
    !hasInput ? "缺少结构化输入 Schema" : "",
    !hasOutput ? "缺少结构化输出 Schema" : "",
    !hasRuntime ? "缺少明确运行时或调用方式" : "",
    !hasPermissions ? "权限边界未显式声明" : "",
    !hasEvidence ? "缺少评测/证据链门槛" : "",
  ].filter(Boolean);
  return {
    portabilityScore,
    valueLevel: portabilityScore >= 85 ? "production-ready" : portabilityScore >= 65 ? "usable-template" : "needs-adapter",
    reusableAs: asset.metadata?.reusableAs || (asset.kind === "agent" ? "ai-employee-template" : asset.kind),
    gaps,
  };
}

function enrich(asset: AssetManifest): AssetManifest {
  return { ...asset, metadata: { ...(asset.metadata || {}), audit: scoreCapabilityAsset(asset) } };
}

export function staticProductionAssets(): AssetManifest[] {
  const base: AssetManifest[] = [
    {
      schemaVersion: "1.0",
      id: "factory:industry-agent-generator",
      kind: "capability",
      name: "行业智能体生产线",
      description: "将行业资料经过脱敏、蒸馏、质量评分、合规扫描和打包，生成可安装智能体/技能包。",
      version: "0.3.0",
      status: "active",
      riskLevel: "high",
      input: schema({
        name: { type: "string", description: "智能体名称" },
        industry: { type: "string", description: "行业领域" },
        persona: { type: "string", description: "角色定位" },
        documents: { type: "array", items: { type: "object" } },
      }, ["name", "industry"]),
      output: schema({
        manifest: { type: "object" },
        packageDir: { type: "string" },
        qualityRating: { type: "object" },
        compliance: { type: "object" },
      }),
      capabilities: [
        { id: "runtime:dsh", kind: "runtime", requiredPermissions: ["runtime.run"] },
        { id: "desensitizer", kind: "tool", requiredPermissions: ["local.files.read"] },
        { id: "distiller", kind: "tool", requiredPermissions: ["model.invoke"] },
        { id: "packager", kind: "tool", requiredPermissions: ["local.files.write"] },
      ],
      permissions: ["local.files.read", "local.files.write", "model.invoke", "runtime.run"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/industry-agent-generator" },
      evaluation: { minimumLevel: "L2" },
      metadata: { reusableAs: "agent-production-line", portable: true, route: "/api/industry-agent" },
    },
    {
      schemaVersion: "1.0",
      id: "factory:orchestrator",
      kind: "workflow",
      name: "多智能体任务编排器",
      description: "将复杂目标拆成子任务，按技能、负载、历史质量和治理权限匹配 AI 员工。",
      version: "1.0.0",
      status: "active",
      riskLevel: "critical",
      input: schema({
        title: { type: "string" },
        description: { type: "string" },
        goal: { type: "string" },
      }, ["title"]),
      output: schema({
        orchestrationId: { type: "number" },
        subtasks: { type: "array" },
        assignments: { type: "array" },
      }),
      capabilities: [
        { id: "runtime:dsh", kind: "runtime", requiredPermissions: ["runtime.run"] },
        { id: "employee:*", kind: "employee" },
        { id: "governance:validateAction", kind: "governance", requiredPermissions: ["governance.validate"] },
      ],
      permissions: ["orchestration.create", "governance.validate", "runtime.run"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/orchestrator" },
      evaluation: { minimumLevel: "L2" },
      metadata: { reusableAs: "team-workflow-template", route: "/api/orchestrate", qualityGate: "requires-idempotency-before-open-platform" },
    },
    {
      schemaVersion: "1.0",
      id: "factory:h2a2a2h-state-machine",
      kind: "policy",
      name: "H2A2A2H 协作治理状态机",
      description: "覆盖创建、认领、执行、提交、审核、争议、仲裁、超时、熔断、重开等人机协作状态。",
      version: "1.0.0",
      status: "active",
      riskLevel: "critical",
      input: schema({
        taskId: { type: "number" },
        from: { type: "string", enum: H2A2A2H_STATES },
        to: { type: "string", enum: H2A2A2H_STATES },
        actorId: { type: "number" },
      }, ["taskId", "to", "actorId"]),
      output: schema({
        allowed: { type: "boolean" },
        state: { type: "string" },
        auditLogId: { type: "number" },
      }),
      capabilities: [
        { id: "runtime:dsh", kind: "runtime", requiredPermissions: ["runtime.run"] },
        { id: "h2a2a2h:transition", kind: "governance", requiredPermissions: ["task.transition"] },
        { id: "h2a2a2h:snapshot", kind: "reflection" },
      ],
      permissions: ["task.transition", "audit.write", "runtime.run"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/h2a2a2h-state-machine" },
      evaluation: { minimumLevel: "L3" },
      metadata: { reusableAs: "governance-policy-template", route: "/api/h2a2a2h", states: H2A2A2H_STATES },
    },
    {
      schemaVersion: "1.0",
      id: "factory:knowledge-sediment",
      kind: "knowledge",
      name: "知识沉淀与记忆生产资料",
      description: "将对话、文件、任务结果沉淀为知识库、短期记忆、长期记忆和向量记忆，供智能体复用。",
      version: "1.0.0",
      status: "active",
      riskLevel: "high",
      input: schema({
        content: { type: "string" },
        source: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      }, ["content"]),
      output: schema({
        knowledgeId: { type: "number" },
        memoryId: { type: "number" },
        retrievalReady: { type: "boolean" },
      }),
      capabilities: [
        { id: "runtime:dsh", kind: "runtime", requiredPermissions: ["runtime.run"] },
        { id: "search_knowledge", kind: "tool", requiredPermissions: ["knowledge.read"] },
        { id: "vector-memory", kind: "knowledge", requiredPermissions: ["knowledge.write"] },
      ],
      permissions: ["knowledge.read", "knowledge.write", "runtime.run"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/knowledge-sediment" },
      evaluation: { minimumLevel: "L2" },
      metadata: { reusableAs: "knowledge-production-material", route: "/api/knowledge" },
    },
    {
      schemaVersion: "1.0",
      id: "factory:tool-gateway",
      kind: "capability",
      name: "工具网关与 Function Calling 工具箱",
      description: "统一注册内置工具、MCP 工具和插件工具，为智能体提供可审计工具调用能力。",
      version: "1.0.0",
      status: "active",
      riskLevel: "high",
      input: schema({
        name: { type: "string" },
        args: { type: "object" },
      }, ["name", "args"]),
      output: schema({
        success: { type: "boolean" },
        data: { type: "object" },
        text: { type: "string" },
      }),
      capabilities: [{ id: "tool-registry", kind: "tool", requiredPermissions: ["tool.execute"] }],
      permissions: ["tool.execute", "audit.write"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/tool-registry" },
      evaluation: { minimumLevel: "L2" },
      metadata: { reusableAs: "tool-market-runtime", route: "/api/tools" },
    },
    {
      schemaVersion: "1.0",
      id: "factory:mcp-service",
      kind: "plugin",
      name: "MCP 外部工具连接层",
      description: "连接外部 MCP 工具并纳入 XYOS 工具注册、调用日志与权限边界。",
      version: "1.0.0",
      status: "active",
      riskLevel: "critical",
      input: schema({
        connectionId: { type: "number" },
        toolName: { type: "string" },
        input: { type: "object" },
      }, ["toolName", "input"]),
      output: schema({
        status: { type: "string" },
        output: { type: "object" },
      }),
      capabilities: [{ id: "mcp-client", kind: "tool", requiredPermissions: ["mcp.invoke"] }],
      permissions: ["mcp.invoke", "mcp.manage", "audit.write"],
      runtimeProviders: ["dsh"],
      source: { platform: "xyos", assetId: "services/mcp-client" },
      evaluation: { minimumLevel: "L3" },
      metadata: { reusableAs: "plugin-connector-template", route: "/api/mcp" },
    },
  ];
  return [...base, ...builtinSampleAssets()];
}

capabilityRoutes.get("/", (req: AuthRequest, res) => {
  const tenantId = req.user!.tenant_id;
  const assets: AssetManifest[] = [];
  for (const row of safeAll("SELECT id, name, role, agent_type, skills FROM employees WHERE tenant_id = ? AND employee_type = 'ai'", [tenantId])) {
    assets.push({ schemaVersion: "1.0", id: `employee:${row.id}`, kind: "agent", name: row.name, description: row.role, version: "1.0.0", status: "active", riskLevel: "medium", input: schema({ task: { type: "string" }, context: { type: "object" } }, ["task"]), output: schema({ answer: { type: "string" }, artifacts: { type: "array" } }), permissions: ["chat.invoke"], runtimeProviders: ["dsh"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L1" }, metadata: { agentType: row.agent_type, skills: row.skills, reusableAs: "ai-employee-template" } });
  }
  for (const row of safeAll("SELECT id, name, description, category, version FROM skills WHERE tenant_id = ? AND enabled = 1", [tenantId])) {
    assets.push({ schemaVersion: "1.0", id: `skill:${row.id}`, kind: "capability", name: row.name, description: row.description, version: row.version || "1.0.0", status: "active", riskLevel: "medium", input: schema({ input: { type: "object" } }), output: schema({ result: { type: "object" } }), permissions: ["skill.use"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L1" }, metadata: { capabilityKind: "skill", category: row.category, reusableAs: "skill-template" } });
  }
  for (const row of safeAll("SELECT id, name, description, category, version FROM plugins WHERE tenant_id = ? AND status = 'active'", [tenantId])) {
    assets.push({ schemaVersion: "1.0", id: `plugin:${row.id}`, kind: "plugin", name: row.name, description: row.description, version: row.version || "1.0.0", status: "active", riskLevel: "high", input: schema({ input: { type: "object" } }), output: schema({ result: { type: "object" } }), permissions: ["plugin.invoke"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L2" }, metadata: { capabilityKind: "plugin", category: row.category, reusableAs: "plugin-template" } });
  }
  for (const row of safeAll("SELECT id, name, description, version, status, definition FROM workflow_definitions WHERE tenant_id = ? AND status != 'archived'", [tenantId])) {
    const metadata = workflowMetadata(row.definition);
    assets.push({ schemaVersion: "1.0", id: `workflow:${row.id}`, kind: "workflow", name: row.name, description: row.description, version: String(row.version || "1"), status: row.status === "published" ? "active" : "draft", riskLevel: "high", input: schema({ variables: { type: "object" } }), output: schema({ instanceId: { type: "number" }, status: { type: "string" } }), capabilities: [{ id: `workflow:${row.id}`, kind: "workflow-node" }], permissions: ["workflow.run"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L2" }, metadata: { ...metadata, reusableAs: "workflow-template" } });
  }
  for (const provider of listProviders()) {
    assets.push({ schemaVersion: "1.0", id: `runtime:${provider.id}`, kind: "capability", name: provider.name, description: provider.description, version: "1.0.0", status: provider.enabled ? "active" : "blocked", riskLevel: "high", input: schema({ task: { type: "string" }, cwd: { type: "string" }, metadata: { type: "object" } }, ["task"]), output: schema({ output: { type: "string" }, events: { type: "array" }, evidence: { type: "object" } }), permissions: ["runtime.run"], runtimeProviders: [provider.id], source: { platform: "xyos", assetId: provider.id }, evaluation: { minimumLevel: provider.id === "dsh" ? "L3" : "L1" }, metadata: { capabilityKind: "runtime", capabilities: provider.capabilities, reusableAs: "runtime-provider" } });
  }
  for (const row of safeAll("SELECT id, reflection_type, importance_score FROM reflections WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100", [tenantId])) {
    assets.push({ schemaVersion: "1.0", id: `reflection:${row.id}`, kind: "evaluation", name: `反思规则-${row.reflection_type || "task_completion"}`, version: "1.0.0", status: "active", riskLevel: "medium", input: schema({ runResult: { type: "object" } }), output: schema({ lessons: { type: "array" }, knowledgeGaps: { type: "array" } }), permissions: ["reflection.read"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L1" }, metadata: { capabilityKind: "reflection", importanceScore: row.importance_score, reusableAs: "evaluation-template" } });
  }
  for (const tool of ToolRegistry.getDefinitions()) {
    assets.push({ schemaVersion: "1.0", id: `tool:${tool.name}`, kind: "capability", name: tool.name, description: tool.description, version: "1.0.0", status: tool.enabled ? "active" : "blocked", riskLevel: tool.source === "builtin" ? "medium" : "high", input: { type: "json-schema", schema: tool.parameters }, output: schema({ success: { type: "boolean" }, data: { type: "object" }, text: { type: "string" } }), permissions: ["tool.execute"], source: { platform: "xyos", assetId: tool.name }, evaluation: { minimumLevel: "L2" }, metadata: { capabilityKind: "tool", source: tool.source, reusableAs: "tool-template" } });
  }
  try {
    for (const row of GovernanceEngine.getProcessTemplates(tenantId) as any[]) {
      assets.push({ schemaVersion: "1.0", id: `policy:${row.id}`, kind: "policy", name: row.name || "治理流程模板", description: row.description, version: "1.0.0", status: "active", riskLevel: "critical", input: schema({ action: { type: "string" }, actor: { type: "object" }, target: { type: "object" } }), output: schema({ allowed: { type: "boolean" }, reason: { type: "string" } }), permissions: ["governance.validate"], source: { platform: "xyos", assetId: String(row.id) }, evaluation: { minimumLevel: "L3" }, metadata: { capabilityKind: "governance", templateType: row.template_type, steps: row.steps_json, reusableAs: "governance-template" } });
    }
  } catch { /* 治理表在旧租户尚未初始化时不阻断能力目录 */ }
  const enriched = [...assets, ...staticProductionAssets()].map(enrich);
  res.json({ success: true, schemaVersion: "1.0", data: enriched, total: enriched.length });
});

capabilityRoutes.get("/audit/summary", (req: AuthRequest, res) => {
  const tenantId = req.user!.tenant_id;
  const dynamicCount =
    safeAll("SELECT id FROM employees WHERE tenant_id = ? AND employee_type = 'ai'", [tenantId]).length +
    safeAll("SELECT id FROM skills WHERE tenant_id = ? AND enabled = 1", [tenantId]).length +
    safeAll("SELECT id FROM plugins WHERE tenant_id = ? AND status = 'active'", [tenantId]).length +
    safeAll("SELECT id FROM workflow_definitions WHERE tenant_id = ? AND status != 'archived'", [tenantId]).length;
  const toolCount = ToolRegistry.getDefinitions().filter((tool) => tool.enabled).length;
  const factoryAssets = staticProductionAssets().map(enrich);
  res.json({
    success: true,
    schemaVersion: "1.0",
    data: {
      dynamicAssetCount: dynamicCount,
      builtinToolCount: toolCount,
      factoryAssetCount: factoryAssets.length,
      highValueAssets: factoryAssets.filter((asset) => (asset.metadata?.audit as any)?.portabilityScore >= 85).map((asset) => asset.id),
      knownGaps: [
        "编排器仍需补幂等键、计划快照和节点级事件流后再开放给外部平台。",
        "工作流 v1/v2 需要统一 canonical schema。",
        "MCP 外部连接需要按租户做更细权限和密钥托管隔离。",
      ],
      assets: factoryAssets,
    },
  });
});

capabilityRoutes.get("/:id", (req: AuthRequest, res) => {
  const tenantId = req.user!.tenant_id;
  const [kind, rawId] = String(req.params.id).split(":");
  if (!kind || !rawId) return res.status(400).json({ success: false, error: "能力ID格式应为 kind:id" });
  const id = Number(rawId);
  let row: any;
  if (kind === "employee") row = safeAll("SELECT id, name, role, agent_type, skills, employee_type FROM employees WHERE id = ? AND tenant_id = ?", [id, tenantId])[0];
  else if (kind === "skill") row = safeAll("SELECT * FROM skills WHERE id = ? AND tenant_id = ? AND enabled = 1", [id, tenantId])[0];
  else if (kind === "plugin") row = safeAll("SELECT * FROM plugins WHERE id = ? AND tenant_id = ? AND status = 'active'", [id, tenantId])[0];
  else if (kind === "workflow") row = safeAll("SELECT * FROM workflow_definitions WHERE id = ? AND tenant_id = ? AND status != 'archived'", [id, tenantId])[0];
  else if (kind === "runtime") row = listProviders().find((provider) => provider.id === rawId);
  else if (kind === "reflection") row = safeAll("SELECT * FROM reflections WHERE id = ? AND tenant_id = ?", [id, tenantId])[0];
  else if (kind === "tool") row = ToolRegistry.getDefinitions().find((tool) => tool.name === rawId);
  else if (kind === "factory") row = staticProductionAssets().find((asset) => asset.id === req.params.id);
  else if (kind === "policy") row = (GovernanceEngine.getProcessTemplates(tenantId) as any[]).find((item) => String(item.id) === rawId);
  if (!row) return res.status(404).json({ success: false, error: "能力不存在或无权访问" });
  if (kind === "workflow") row.definition = workflowMetadata(row.definition);
  res.json({ success: true, schemaVersion: "1.0", data: { id: req.params.id, kind, source: "xyos", resource: row } });
});

/** 将市场资源派生为用户草稿；原资源只读，真正落库由 DSH+本地项目负责。 */
capabilityRoutes.post("/:id/clone", (req: AuthRequest, res) => {
  const sourceId = String(req.params.id);
  const override = req.body && typeof req.body === "object" ? req.body : {};
  const [kind] = sourceId.split(":");
  if (!["employee", "skill", "plugin", "workflow", "runtime", "reflection", "tool", "factory", "policy"].includes(kind)) {
    return res.status(400).json({ success: false, error: "不支持派生此类能力" });
  }
  const cloneId = `draft:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  res.status(201).json({ success: true, schemaVersion: "1.0", data: {
    id: cloneId,
    kind,
    status: "draft",
    source: { platform: "xyos", assetId: sourceId },
    owner: { tenantId: req.user!.tenant_id, userId: req.user!.id },
    resource: { ...override, id: cloneId, sourceId, status: "draft", version: "0.1.0" },
    next: "请在 DSH+本地项目中继续编辑、测试和发布。",
  } });
});
