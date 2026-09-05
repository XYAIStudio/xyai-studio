import type { FlowDefinition, FlowNodeType } from "./workflow-types";

export type CanonicalWorkflowNodeType =
  | "start"
  | "task"
  | "agent"
  | "tool"
  | "approval"
  | "condition"
  | "parallel"
  | "end";

export interface CanonicalWorkflowNode {
  id: string;
  type: CanonicalWorkflowNodeType;
  title: string;
  description?: string;
  capability?: {
    id: string;
    kind: "employee" | "skill" | "tool" | "workflow-node" | "knowledge" | "governance" | "reflection" | "runtime";
  };
  assignee?: {
    type: "user" | "employee" | "role" | "agent" | "system";
    id?: number | string;
  };
  dependsOn: string[];
  approval: boolean;
  config: Record<string, unknown>;
}

export interface CanonicalWorkflow {
  schemaVersion: "xyai.workflow.v1";
  id?: string;
  name: string;
  description?: string;
  trigger: { type: "manual" | "schedule" | "event"; config?: Record<string, unknown> };
  nodes: CanonicalWorkflowNode[];
  edges: Array<{ from: string; to: string }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  metadata: {
    sourceVersion: "legacy-steps" | "workflow-v2" | "canonical" | "team-runtime";
    warnings: string[];
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseDefinition(definition: unknown): Record<string, unknown> {
  if (typeof definition === "string") {
    try { return asObject(JSON.parse(definition)); } catch { return {}; }
  }
  return asObject(definition);
}

function nodeType(type: unknown): CanonicalWorkflowNodeType {
  const normalized = String(type || "task");
  if (["start", "approval", "task", "condition", "parallel", "end"].includes(normalized)) return normalized as CanonicalWorkflowNodeType;
  if (["agent", "employee"].includes(normalized)) return "agent";
  if (["tool", "plugin", "skill"].includes(normalized)) return "tool";
  return "task";
}

function normalizeV2Node(node: any, index: number): CanonicalWorkflowNode {
  const type = nodeType(node?.type as FlowNodeType);
  return {
    id: String(node?.id || `node-${index + 1}`),
    type,
    title: String(node?.title || node?.name || `步骤 ${index + 1}`),
    description: node?.description ? String(node.description) : undefined,
    capability: node?.capability,
    assignee: node?.assignee || (node?.config?.assignee_id ? { type: "user", id: node.config.assignee_id } : undefined),
    dependsOn: Array.isArray(node?.dependsOn) ? node.dependsOn.map(String) : [],
    approval: type === "approval" || Boolean(node?.approval || node?.requiresApproval),
    config: asObject(node?.config),
  };
}

function normalizeLegacyStep(step: any, index: number): CanonicalWorkflowNode {
  const id = String(step?.id || step?.key || `step-${index + 1}`);
  return {
    id,
    type: nodeType(step?.type),
    title: String(step?.title || step?.name || `步骤 ${index + 1}`),
    description: step?.description ? String(step.description) : undefined,
    capability: step?.capability,
    assignee: step?.assignee || (step?.assignee_id ? { type: step.assignee_type || "user", id: step.assignee_id } : undefined),
    dependsOn: step?.depends_on ? [String(step.depends_on)] : [],
    approval: step?.type === "approval" || Array.isArray(step?.approver_ids),
    config: {
      approver_ids: step?.approver_ids,
      conditions: step?.conditions,
      next_step: step?.next_step,
    },
  };
}

function edgesFromNodes(nodes: CanonicalWorkflowNode[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!edges.some((edge) => edge.from === dep && edge.to === node.id)) edges.push({ from: dep, to: node.id });
    }
  }
  return edges;
}

export function normalizeWorkflowDefinition(input: {
  id?: string | number;
  name?: string;
  description?: string;
  definition: unknown;
  formSchema?: unknown;
}): CanonicalWorkflow {
  const parsed = parseDefinition(input.definition);
  const warnings: string[] = [];
  let sourceVersion: CanonicalWorkflow["metadata"]["sourceVersion"] = "canonical";
  let nodes: CanonicalWorkflowNode[] = [];
  let edges: Array<{ from: string; to: string }> = [];

  if (parsed.schemaVersion === "xyai.workflow.v1" && Array.isArray(parsed.nodes)) {
    sourceVersion = "canonical";
    nodes = parsed.nodes.map(normalizeV2Node);
    edges = Array.isArray(parsed.edges) ? parsed.edges.map((edge: any) => ({ from: String(edge.from), to: String(edge.to) })) : edgesFromNodes(nodes);
  } else if (parsed.version === 2 && Array.isArray(parsed.nodes)) {
    sourceVersion = "workflow-v2";
    const flow = parsed as unknown as FlowDefinition;
    nodes = (flow.nodes || []).map(normalizeV2Node);
    edges = Array.isArray(flow.edges) ? flow.edges.map((edge) => ({ from: String(edge.from), to: String(edge.to) })) : edgesFromNodes(nodes);
  } else if (Array.isArray(parsed.nodes)) {
    sourceVersion = "workflow-v2";
    nodes = (parsed.nodes as any[]).map(normalizeV2Node);
    edges = Array.isArray(parsed.edges) ? (parsed.edges as any[]).map((edge) => ({ from: String(edge.from), to: String(edge.to) })) : edgesFromNodes(nodes);
  } else if (Array.isArray(parsed.steps)) {
    sourceVersion = "legacy-steps";
    nodes = (parsed.steps as any[]).map(normalizeLegacyStep);
    edges = edgesFromNodes(nodes);
  } else {
    sourceVersion = "legacy-steps";
    warnings.push("未发现 nodes 或 steps，已生成空流程，请在 DSH+ 中补齐节点。");
  }

  if (nodes.length > 0 && !nodes.some((node) => node.type === "start")) {
    warnings.push("流程缺少 start 节点，运行时会从第一个节点开始。");
  }
  if (nodes.length > 0 && !nodes.some((node) => node.type === "end")) {
    warnings.push("流程缺少 end 节点，最后一个节点完成后默认结束。");
  }

  return {
    schemaVersion: "xyai.workflow.v1",
    id: input.id === undefined ? undefined : String(input.id),
    name: input.name || String(parsed.name || "未命名流程"),
    description: input.description || (parsed.description ? String(parsed.description) : undefined),
    trigger: asObject(parsed.trigger) as CanonicalWorkflow["trigger"] || { type: "manual" },
    nodes,
    edges,
    inputSchema: asObject(parsed.inputSchema || { type: "object", properties: {} }),
    outputSchema: asObject(parsed.outputSchema || { type: "object", properties: {} }),
    metadata: { sourceVersion, warnings },
  };
}

export function workflowToRuntimeTask(workflow: CanonicalWorkflow, inputs?: Record<string, unknown>): string {
  const lines = [
    `请按结构化工作流执行：${workflow.name}`,
    workflow.description ? `流程说明：${workflow.description}` : "",
    `输入：${JSON.stringify(inputs || {})}`,
    "节点：",
    ...workflow.nodes.map((node, index) => `${index + 1}. [${node.type}] ${node.title} id=${node.id} dependsOn=${node.dependsOn.join(",") || "none"}`),
    "请输出每个节点的执行结果、证据、风险和下一步建议。",
  ].filter(Boolean);
  return lines.join("\n");
}
