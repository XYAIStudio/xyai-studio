/**
 * Runtime Gateway 注册表与运行记录持久化
 *
 * - 注册/查询 Provider（mock、dsh）
 * - agent_runs 表：运行记录（状态/结果/证据），异步执行模型（创建即返回，后台执行）
 */
import { dbRun, dbGet, dbAll } from "../../db";
import { RuntimeAdapter, RuntimeProviderInfo, RunKind, RunRequest, RunResult, RunStatus } from "./types";
import { MockRuntimeAdapter } from "./mock-runtime";
import { DshAdapter } from "./dsh-adapter";

const adapters: Record<string, RuntimeAdapter> = {};
type RuntimeStep = { kind: "tool_call" | "tool_result" | "think" | "assistant"; name?: string; text?: string };
type RuntimeWorkflowNode = NonNullable<RunRequest["workflow"]>["nodes"][number];
const seedProviders = async () => {
  // 幂等：确保 runtime_providers 有基础行
  for (const a of Object.values(adapters)) {
    const row = dbGet("SELECT id FROM runtime_providers WHERE id = ?", [a.id]);
    if (!row) {
      dbRun(
        "INSERT INTO runtime_providers (id, name, description, enabled, capabilities) VALUES (?, ?, ?, 1, ?)",
        [a.id, a.name, a.description, JSON.stringify(a.capabilities)]
      );
    }
  }
};

export function registerAdapter(adapter: RuntimeAdapter): void {
  adapters[adapter.id] = adapter;
}

/** 初始化注册表（server 启动时调用一次） */
export async function initRuntimeGateway(): Promise<void> {
  registerAdapter(new MockRuntimeAdapter());
  registerAdapter(new DshAdapter());
  await seedProviders();
}

export function listProviders(): RuntimeProviderInfo[] {
  return Object.values(adapters).map((a) => {
    const health = a.getHealth?.();
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      enabled: true,
      capabilities: a.capabilities,
      ready: health?.ready ?? true,
      health,
    };
  });
}

export function getAdapter(id: string): RuntimeAdapter | undefined {
  return adapters[id];
}

export interface RunRecordRow {
  id: string;
  provider: string;
  status: RunStatus;
  task: string;
  run_kind?: RunKind;
  cwd?: string;
  tenant_id?: number;
  guest_session?: string | null;
  tokens_estimated?: number;
  structured_input?: string | null;
  plan_snapshot?: string | null;
  events_snapshot?: string | null;
  evidence_snapshot?: string | null;
  result?: string | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface RuntimeReworkRun {
  id: string;
  provider: string;
  status: RunStatus;
  task: string;
  run_kind?: RunKind;
  execution?: NonNullable<RunRequest["execution"]>;
  nodeEvidence?: Array<Record<string, unknown>>;
  result?: string | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface RuntimeRunArchive {
  execution?: NonNullable<RunRequest["execution"]>;
  parentRun?: Pick<RunRecordRow, "id" | "provider" | "status" | "task" | "run_kind" | "created_at" | "finished_at">;
  childRuns: RuntimeReworkRun[];
  mergedEvidence: {
    rootRunId: string;
    currentRunId: string;
    childRunCount: number;
    reworkHistory: RuntimeReworkRun[];
  };
}

function assertText(value: unknown, label: string, max = 20000): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}超过长度限制`);
  return text;
}

/** 所有 REST、编排器和测试入口共用的 Runtime 结构校验，避免只在界面做门禁。 */
export function validateRunRequest(req: RunRequest): void {
  if (!getAdapter(req.provider)) throw new Error(`未知或未初始化的 Runtime provider：${String(req.provider)}`);
  assertText(req.task, "task");
  const kind = req.runKind || "task";
  if (!(["task", "team", "workflow"] as string[]).includes(kind)) throw new Error("runKind 必须是 task/team/workflow");
  if (kind === "team") {
    const members = req.team?.members;
    if (!Array.isArray(members) || members.length < 1 || members.length > 50) throw new Error("team 运行必须提供 1-50 名成员");
    const ids = members.map(member => assertText(member.id, "团队成员 ID", 100));
    if (new Set(ids).size !== ids.length) throw new Error("团队成员 ID 必须唯一");
    members.forEach(member => { assertText(member.name, "团队成员名称", 120); assertText(member.role, "团队成员岗位", 120); });
    if (String(req.inputs?.productionType || "") === "team") {
      const spec = req.inputs?.productionSpec && typeof req.inputs.productionSpec === "object" ? req.inputs.productionSpec as Record<string, unknown> : {};
      const roles = new Set(members.map(member => member.role.trim()));
      if (!roles.has(String(spec.leadRole || "").trim()) || !roles.has(String(spec.reviewerRole || "").trim()) || spec.leadRole === spec.reviewerRole) throw new Error("团队生产运行必须把负责人和独立复核岗位绑定到不同成员");
    }
  }
  if (kind === "workflow") {
    const nodes = req.workflow?.nodes;
    if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 100) throw new Error("workflow 运行必须提供 1-100 个节点");
    const ids = nodes.map(node => assertText(node.id, "流程节点 ID", 100));
    if (new Set(ids).size !== ids.length) throw new Error("流程节点 ID 必须唯一");
    const known = new Set(ids), graph = new Map<string, string[]>();
    const strictProduction = ["workflow", "research"].includes(String(req.inputs?.productionType || ""));
    nodes.forEach(node => {
      assertText(node.type, `节点 ${node.id} 类型`, 80); assertText(node.title, `节点 ${node.id} 名称`, 200);
      const dependencies = Array.isArray(node.dependsOn) ? node.dependsOn : [];
      if (dependencies.some(id => id === node.id || !known.has(id))) throw new Error(`节点 ${node.id} 存在无效或自引用依赖`);
      graph.set(node.id, dependencies);
      if (strictProduction) {
        assertText(node.inputSpec, `节点 ${node.id} 输入要求`, 4000);
        assertText(node.outputSpec, `节点 ${node.id} 输出物`, 4000);
        assertText(node.acceptanceCriteria, `节点 ${node.id} 验收标准`, 4000);
        if (assertText(node.onFailure, `节点 ${node.id} 失败路径`, 4000).length < 8) throw new Error(`节点 ${node.id} 失败路径过于简略`);
      }
    });
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error("流程节点依赖存在循环");
      if (visited.has(id)) return;
      visiting.add(id); (graph.get(id) || []).forEach(visit); visiting.delete(id); visited.add(id);
    };
    ids.forEach(visit);
    if (req.execution?.startNodeId && !known.has(req.execution.startNodeId)) throw new Error("execution.startNodeId 不属于当前流程");
  }
  if (req.execution?.parentRunId) {
    const parent = getRun(req.execution.parentRunId);
    if (!parent || parent.tenant_id !== req.tenantId || parent.guest_session !== (req.guestSession ?? null)) {
      throw new Error("父运行不存在或不属于当前账户或本机草稿会话");
    }
  }
}

function rowToRecord(row: any): RunRecordRow {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    task: row.task,
    run_kind: row.run_kind || "task",
    cwd: row.cwd,
    tenant_id: row.tenant_id,
    guest_session: row.guest_session,
    tokens_estimated: row.tokens_estimated,
    structured_input: row.structured_input,
    plan_snapshot: row.plan_snapshot,
    events_snapshot: row.events_snapshot,
    evidence_snapshot: row.evidence_snapshot,
    result: row.result,
    error: row.error,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

/** 创建运行记录，返回 id（状态 queued） */
export function createRun(req: RunRequest): { id: string; record: RunRecordRow } {
  validateRunRequest(req);
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const structuredInput = buildStructuredInput(req);
  const planSnapshot = buildPlanSnapshot(req);
  dbRun(
    "INSERT INTO agent_runs (id, provider, status, task, cwd, tenant_id, guest_session, run_kind, structured_input, plan_snapshot, created_at) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, req.provider, req.task, req.cwd || null, req.tenantId ?? null, req.guestSession ?? null, req.runKind || "task", structuredInput, planSnapshot, new Date().toISOString()]
  );
  return { id, record: getRun(id)! };
}

export function getRun(id: string): RunRecordRow | undefined {
  const row = dbGet("SELECT * FROM agent_runs WHERE id = ?", [id]);
  return row ? rowToRecord(row) : undefined;
}

export function listRuns(limit = 50, tenantId?: number): RunRecordRow[] {
  return (tenantId === undefined
    ? dbAll("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?", [limit])
    : dbAll("SELECT * FROM agent_runs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?", [tenantId, limit])).map(rowToRecord);
}

export function listGuestRuns(limit: number, guestSession: string): RunRecordRow[] {
  return dbAll("SELECT * FROM agent_runs WHERE guest_session = ? ORDER BY created_at DESC LIMIT ?", [guestSession, limit]).map(rowToRecord);
}

function parseJsonObject(value: string | null | undefined): Record<string, any> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getRunExecution(row: RunRecordRow): NonNullable<RunRequest["execution"]> | undefined {
  const structured = parseJsonObject(row.structured_input);
  const execution = structured?.execution;
  if (!execution || typeof execution !== "object") return undefined;
  const mode = execution.mode;
  if (mode !== "full" && mode !== "single-node" && mode !== "from-node") return undefined;
  return {
    mode,
    ...(typeof execution.startNodeId === "string" && execution.startNodeId ? { startNodeId: execution.startNodeId } : {}),
    ...(typeof execution.parentRunId === "string" && execution.parentRunId ? { parentRunId: execution.parentRunId } : {}),
  };
}

function summarizeReworkRun(row: RunRecordRow): RuntimeReworkRun {
  const evidence = parseJsonObject(row.evidence_snapshot);
  const nodeEvidence = Array.isArray(evidence?.nodeEvidence)
    ? evidence.nodeEvidence.filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    task: row.task,
    run_kind: row.run_kind,
    execution: getRunExecution(row),
    nodeEvidence,
    result: row.result,
    error: row.error,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

export function listChildRuns(parentRunId: string, tenantId?: number, guestSession?: string | null): RuntimeReworkRun[] {
  const candidates = dbAll(
    tenantId === undefined
      ? "SELECT * FROM agent_runs WHERE structured_input LIKE ? AND guest_session = ? ORDER BY created_at ASC"
      : "SELECT * FROM agent_runs WHERE structured_input LIKE ? AND tenant_id = ? ORDER BY created_at ASC",
    tenantId === undefined ? [`%${parentRunId}%`, guestSession ?? ""] : [`%${parentRunId}%`, tenantId]
  ).map(rowToRecord);
  return candidates
    .filter((row) => getRunExecution(row)?.parentRunId === parentRunId)
    .map(summarizeReworkRun);
}

export function buildRunArchive(row: RunRecordRow): RuntimeRunArchive {
  const execution = getRunExecution(row);
  const rootRunId = execution?.parentRunId || row.id;
  const parent = execution?.parentRunId ? getRun(execution.parentRunId) : undefined;
  const childRuns = listChildRuns(rootRunId, row.tenant_id, row.guest_session);
  return {
    ...(execution ? { execution } : {}),
    ...(parent ? { parentRun: {
      id: parent.id,
      provider: parent.provider,
      status: parent.status,
      task: parent.task,
      run_kind: parent.run_kind,
      created_at: parent.created_at,
      finished_at: parent.finished_at,
    } } : {}),
    childRuns,
    mergedEvidence: {
      rootRunId,
      currentRunId: row.id,
      childRunCount: childRuns.length,
      reworkHistory: childRuns,
    },
  };
}

export function updateRunStatus(id: string, status: RunStatus, extra?: Partial<RunRecordRow>): void {
  const sets: string[] = ["status = ?"];
  const params: any[] = [status];
  if (extra?.started_at) { sets.push("started_at = ?"); params.push(extra.started_at); }
  if (extra?.finished_at) { sets.push("finished_at = ?"); params.push(extra.finished_at); }
  if (extra?.result !== undefined) { sets.push("result = ?"); params.push(extra.result); }
  if (extra?.error !== undefined) { sets.push("error = ?"); params.push(extra.error); }
  if (extra?.tokens_estimated !== undefined) { sets.push("tokens_estimated = ?"); params.push(extra.tokens_estimated); }
  if (extra?.events_snapshot !== undefined) { sets.push("events_snapshot = ?"); params.push(extra.events_snapshot); }
  if (extra?.evidence_snapshot !== undefined) { sets.push("evidence_snapshot = ?"); params.push(extra.evidence_snapshot); }
  params.push(id);
  dbRun(`UPDATE agent_runs SET ${sets.join(", ")} WHERE id = ?`, params);
}

/** 异步执行一次运行：立即返回，后台执行并回写状态；完成后统一算力计量。 */
export function dispatchRun(id: string, req: RunRequest): void {
  const adapter = getAdapter(req.provider);
  if (!adapter) {
    updateRunStatus(id, "failed", { error: `未知 provider: ${req.provider}`, finished_at: new Date().toISOString() });
    return;
  }
  updateRunStatus(id, "running", { started_at: new Date().toISOString() });
  const nodeMapper = createNodeEventMapper(req);
  const executableReq = {
    ...req,
    task: buildExecutableTask(req),
    onStep: (step: RuntimeStep) => {
      nodeMapper.record(step);
      req.onStep?.(step);
    },
  };
  adapter
    .execute(executableReq)
    .then((res: RunResult) => {
      const tokens = res.tokensEstimated ?? estimateTokens(executableReq.task, res.output);
      // 统一算力计量：开发空间（DSH 执行）消耗计入租户限额（与业务空间 AI 用量同一账本）
      if (req.tenantId && tokens > 0) {
        try {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
          const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];
          dbRun(
            "INSERT INTO tenant_usage (tenant_id, usage_type, amount, period_start, period_end) VALUES (?, 'tokens', ?, ?, ?)",
            [req.tenantId, tokens, monthStart, monthEnd]
          );
        } catch (usageErr: any) {
          console.warn("[Runtime] 算力记账失败:", usageErr.message);
        }
      }
      const events = [...(res.events || []), ...nodeMapper.events()];
      updateRunStatus(id, res.status, {
        finished_at: new Date().toISOString(),
        result: res.output ? res.output.slice(0, 20000) : null,
        error: res.error || null,
        tokens_estimated: tokens,
        events_snapshot: JSON.stringify(events),
        evidence_snapshot: JSON.stringify(enrichEvidenceWithNodes(res.evidence || { cwd: req.cwd || "(runtime)" }, req, events, res.status)),
      });
    })
    .catch((err: Error) => {
      const events = [{ type: "failed", at: new Date().toISOString(), message: err.message }, ...nodeMapper.events()];
      updateRunStatus(id, "failed", {
        finished_at: new Date().toISOString(),
        error: err.message,
        events_snapshot: JSON.stringify(events),
        evidence_snapshot: JSON.stringify(enrichEvidenceWithNodes({ cwd: req.cwd || "(runtime)" }, req, events, "failed")),
      });
    });
}

function getExecutionMode(req: RunRequest): NonNullable<RunRequest["execution"]> {
  return req.execution || { mode: "full" };
}

function getTeamWorkflowNodes(req: RunRequest): RuntimeWorkflowNode[] {
  if (!req.team?.members?.length) return [];
  const spec = (req.inputs?.productionSpec && typeof req.inputs.productionSpec === "object" ? req.inputs.productionSpec : {}) as Record<string, unknown>;
  const reviewerRole = String(spec.reviewerRole || "独立复核人");
  const finalDeliverable = String(spec.finalDeliverable || "团队最终交付物");
  const memberNodes: RuntimeWorkflowNode[] = req.team.members.map((member, index) => ({
    id: `team-member-${member.id}`,
    type: "agent-contribution",
    title: `${member.name}（${member.role}）完成职责贡献`,
    dependsOn: req.team?.coordination === "serial" && index > 0 ? [`team-member-${req.team.members[index - 1]!.id}`] : [],
    capabilityId: member.id,
    inputSpec: `团队目标、已确认生产规格，以及分配给“${member.role}”的任务上下文`,
    outputSpec: `${member.role}的结论、依据、风险、产物位置和交接说明`,
    acceptanceCriteria: `输出符合“${member.role}”职责边界，含可追溯依据且可交给下一角色复用`,
    approval: member.role.trim() === reviewerRole.trim(),
    humanReviewReason: member.role.trim() === reviewerRole.trim() ? "该角色承担独立质量复核，必须留下复核结论" : "",
  }));
  return [...memberNodes, {
    id: "team-final-deliverable",
    type: "approval",
    title: `${reviewerRole}复核并形成团队成品`,
    dependsOn: memberNodes.map(node => node.id),
    inputSpec: "所有成员贡献、证据、异议记录和交接说明",
    outputSpec: finalDeliverable,
    acceptanceCriteria: "成员职责均已履行，冲突已裁决，关键结论有证据，负责人和独立复核人均可追溯",
    approval: true,
    humanReviewReason: "团队最终成品必须由独立复核角色确认后才能交付",
  }];
}

function getEffectiveWorkflowNodes(req: RunRequest): RuntimeWorkflowNode[] {
  const nodes = req.workflow?.nodes?.length
    ? req.workflow.nodes
    : (req.runKind || "task") === "task"
      ? [{
          id: "advisor-response",
          type: "advisor",
          title: "理解问题并形成专业建议",
          dependsOn: [],
          inputSpec: "用户问题、行业背景、适用场景、经验规则和服务边界",
          outputSpec: "结论、依据、风险、待核实项和下一步建议",
          acceptanceCriteria: "回答有资料或规则依据，不确定处明确说明，高风险事项提示人工复核",
          condition: "问题属于顾问服务边界且具备最低必要上下文",
          onFailure: "资料不足时停止确定性判断，列出待补资料并转行业专家复核",
        }]
      : getTeamWorkflowNodes(req);
  const execution = getExecutionMode(req);
  if (nodes.length === 0 || execution.mode === "full" || !execution.startNodeId) return nodes;
  const startIndex = nodes.findIndex((node) => node.id === execution.startNodeId);
  if (startIndex < 0) return nodes;
  if (execution.mode === "single-node") return [nodes[startIndex]!];
  return nodes.slice(startIndex);
}

function createNodeEventMapper(req: RunRequest): { record: (step: RuntimeStep) => void; events: () => Array<{ type: string; at: string; message?: string; data?: Record<string, unknown> }> } {
  const nodes = getEffectiveWorkflowNodes(req);
  const events: Array<{ type: string; at: string; message?: string; data?: Record<string, unknown> }> = [];
  let cursor = 0;
  const splitTokens = (value: string) => value.toLowerCase().split(/[\s（）()\[\]【】|:：,，、/\\]+/).map(token => token.trim()).filter(token => token.length >= 2);
  const nodeTokens = nodes.map((node, index) => Array.from(new Set([
    node.id.toLowerCase(),
    `节点${index + 1}`,
    `节点 ${index + 1}`,
    `第${index + 1}节点`,
    `n${index + 1}`,
    ...(index === nodes.length - 1 ? ["最终交付", "交付物", "最终成品", "最终结论", "结案"] : []),
    ...splitTokens(node.title),
    ...(node.capabilityId ? splitTokens(node.capabilityId) : []),
  ].filter(token => token.length >= 2))));
  const matchNodeIndexes = (step: RuntimeStep): number[] => {
    if (nodes.length === 0) return [];
    const haystack = `${step.name || ""} ${step.text || ""}`.toLowerCase();
    return nodeTokens.map((tokens, index) => tokens.some(token => haystack.includes(token)) ? index : -1).filter(index => index >= 0);
  };
  const extractNodeSummary = (text: string, index: number) => {
    const lower = text.toLowerCase();
    const positions = nodeTokens[index]!.map(token => lower.indexOf(token)).filter(position => position >= 0);
    if (positions.length === 0) return text.slice(0, 1000);
    const start = Math.max(0, Math.min(...positions) - 80);
    return text.slice(start, start + 1000).trim();
  };
  const pushNodeEvent = (step: RuntimeStep, node: RuntimeWorkflowNode | undefined, text: string) => {
    const message = step.kind === "tool_call"
      ? `调用工具${step.name ? `：${step.name}` : ""}${text ? `（${text}）` : ""}`
      : step.kind === "tool_result"
        ? `工具返回${step.name ? `：${step.name}` : ""}${text ? `（${text}）` : ""}`
        : step.kind === "assistant"
          ? `智能体输出：${text}`
          : text || "运行步骤";
    events.push({
      type: "node_event",
      at: new Date().toISOString(),
      message: message.slice(0, 500),
      data: {
        stepKind: step.kind,
        toolName: step.name || "",
        text,
        nodeId: node?.id || "",
        nodeTitle: node?.title || "",
        nodeType: node?.type || "",
      },
    });
  };
  return {
    record(step) {
      if (nodes.length === 0) {
        // 顾问型是整体任务，没有流程节点；仍需保留 assistant/tool 证据，
        // 不能用不存在的 nodeTokens[0] 提取摘要而吞掉回调。
        pushNodeEvent(step, undefined, step.text || "");
        return;
      }
      const matches = matchNodeIndexes(step);
      // 一次最终 assistant 回复可能逐项包含整条生产线。此时为每个被明确
      // 提及的节点各留一条证据，而不是错误地全部归到第一个节点。
      const selected = step.kind === "assistant" && matches.length > 1
        ? matches
        : [matches[0] ?? Math.min(cursor, Math.max(nodes.length - 1, 0))];
      for (const index of selected) {
        const node = nodes[index];
        const text = step.text ? extractNodeSummary(step.text, index) : "";
        pushNodeEvent(step, node, text);
      }
      if ((step.kind === "tool_result" || step.kind === "assistant") && nodes.length > 0) {
        cursor = Math.min(Math.max(...selected) + 1, nodes.length - 1);
      }
    },
    events() {
      if (events.length > 0 || nodes.length === 0) return events;
      return nodes.map((node, index) => ({
        type: "node_event",
        at: new Date().toISOString(),
        message: `节点模拟完成：${node.title}`,
        data: {
          stepKind: "assistant",
          nodeId: node.id,
          nodeTitle: node.title,
          nodeType: node.type,
          text: index === nodes.length - 1 ? "形成最终交付物与验收结论" : "完成该节点的安全模拟检查",
        },
      }));
    },
  };
}

function enrichEvidenceWithNodes(evidence: NonNullable<RunResult["evidence"]>, req: RunRequest, events: Array<{ data?: Record<string, unknown> }>, runStatus: RunStatus): NonNullable<RunResult["evidence"]> & { nodeEvidence?: Array<Record<string, unknown>> } {
  const nodes = getEffectiveWorkflowNodes(req);
  if (nodes.length === 0) return evidence;
  const nodeEvidence = nodes.map((node) => {
    const related = events.filter((event) => event.data?.nodeId === node.id);
    const toolCalls = related.filter((event) => event.data?.stepKind === "tool_call").map((event) => event.data?.toolName).filter(Boolean);
    const outputs = related.filter((event) => event.data?.stepKind === "tool_result" || event.data?.stepKind === "assistant").map((event) => event.data?.text).filter(Boolean);
    const status = runStatus === "failed" || runStatus === "cancelled"
      ? related.length > 0 ? "failed" : "not-observed"
      : related.length === 0
        ? "not-observed"
        : outputs.length === 0
          ? "no-output"
          : "observed";
    return {
      nodeId: node.id,
      nodeTitle: node.title,
      nodeType: node.type,
      status,
      toolCalls,
      outputSummary: String(outputs[outputs.length - 1] || ""),
      eventCount: related.length,
      needsReview: node.approval === true,
      humanReviewReason: node.humanReviewReason || "",
      reworkReason: status === "failed"
        ? "该节点所在运行失败，需要检查工具调用、模型输出或节点配置后重试"
        : status === "no-output"
          ? "该节点有执行事件但缺少可验收输出，需要补充输出要求或重新运行"
          : status === "not-observed"
            ? "该节点没有观测到执行证据，需要检查依赖关系或从该节点重跑"
            : "",
    };
  });
  return { ...evidence, nodeEvidence };
}

/** 估算一次 agent 运行的 Token 消耗（输入任务 + 输出文本，中文按字近似）。 */
function buildStructuredInput(req: RunRequest): string | null {
  return JSON.stringify({
    schemaVersion: "xyai.runtime.structured.v1",
    runKind: req.runKind || "task",
    team: req.team,
    workflow: req.workflow,
    effectiveWorkflowNodes: getEffectiveWorkflowNodes(req),
    inputs: req.inputs || {},
    policy: req.policy || {},
    execution: getExecutionMode(req),
    metadata: req.metadata || {},
  });
}

function buildPlanSnapshot(req: RunRequest): string | null {
  return JSON.stringify({
    schemaVersion: "xyai.runtime.plan.v1",
    runKind: req.runKind,
    generatedAt: new Date().toISOString(),
    execution: getExecutionMode(req),
    teamMembers: req.team?.members?.map((member) => ({ id: member.id, role: member.role, name: member.name })) || [],
    workflowNodes: getEffectiveWorkflowNodes(req).map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      dependsOn: node.dependsOn || [],
      approval: node.approval || false,
      inputSpec: node.inputSpec || "",
      outputSpec: node.outputSpec || "",
      acceptanceCriteria: node.acceptanceCriteria || "",
      condition: node.condition || "",
      onFailure: node.onFailure || "",
      humanReviewReason: node.humanReviewReason || "",
    })) || [],
    gates: ["inputs-bound", "capability-check", "policy-check", "evidence-required"],
  });
}

function buildExecutableTask(req: RunRequest): string {
  const execution = getExecutionMode(req);
  const workflowNodes = getEffectiveWorkflowNodes(req);
  const lines = [
    `运行类型：${req.runKind}`,
    `执行模式：${execution.mode}${execution.startNodeId ? `，起点节点=${execution.startNodeId}` : ""}${execution.parentRunId ? `，父运行=${execution.parentRunId}` : ""}`,
    `总目标：${req.task}`,
    req.team ? `团队：${req.team.name}，协作方式：${req.team.coordination}` : "",
    ...(req.team?.members || []).map((member, index) => `${index + 1}. 成员 ${member.name} (${member.role}) 能力=${(member.capabilities || []).join(",") || "未声明"}`),
    req.workflow ? `工作流：${req.workflow.name}` : "",
    ...workflowNodes.map((node, index) => [
      `${index + 1}. 节点 ${node.title} [${node.type}] id=${node.id} dependsOn=${(node.dependsOn || []).join(",") || "none"} approval=${node.approval ? "yes" : "no"}`,
      `   输入要求：${node.inputSpec || "未声明"}`,
      `   输出物：${node.outputSpec || "未声明"}`,
      `   验收标准：${node.acceptanceCriteria || "未声明"}`,
      `   进入条件：${node.condition || "按依赖顺序无条件进入"}`,
      `   失败/退回处理：${node.onFailure || "按生产合同的异常策略处理"}`,
      node.approval ? `   人工确认理由：${node.humanReviewReason || "该节点标记为需要人工确认"}` : "",
    ].filter(Boolean).join("\n")),
    `输入：${JSON.stringify(req.inputs || {})}`,
    `策略：${JSON.stringify(req.policy || {})}`,
    "请按当前生产节点执行，输出节点结果、证据、风险、需人工确认事项和最终结论。",
  ].filter(Boolean);
  return lines.join("\n");
}

function estimateTokens(task: string, output: string): number {
  const inputChars = task.length;
  const outputChars = output.length;
  // 中文约 1 字 ≈ 1.2 token；英文约 4 字符 ≈ 1 token；加上系统提示固定开销
  const inputTokens = Math.ceil(inputChars * 0.9) + 800;
  const outputTokens = Math.ceil(outputChars * 1.2);
  return inputTokens + outputTokens;
}
