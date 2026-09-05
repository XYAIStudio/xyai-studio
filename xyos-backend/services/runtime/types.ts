/**
 * 雄元智脑XYOS — Runtime Gateway 统一运行时契约
 *
 * 对齐 V0.6 需求规格 FR-RUN（Runtime Gateway），以可运行的 MVP 形态落地。
 * 铁律：业务层只依赖本模块接口，不直接引用 DeepSeek Harness 内部类型。
 * 运行时 Provider 可替换：mock（模拟）/ dsh（DeepSeek Harness 真实执行）。
 */

export type RuntimeProviderId = "mock" | "dsh";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type RunKind = "task" | "team" | "workflow";

export interface TeamMemberRef {
  id: string;
  name: string;
  role: string;
  capabilities?: string[];
  canDelegate?: boolean;
}

export interface TeamRuntimePlan {
  id?: string;
  name: string;
  objective: string;
  coordination: "serial" | "parallel" | "hybrid";
  members: TeamMemberRef[];
}

export interface WorkflowRuntimePlan {
  id?: string;
  name: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    title: string;
    dependsOn?: string[];
    capabilityId?: string;
    approval?: boolean;
    inputSpec?: string;
    outputSpec?: string;
    acceptanceCriteria?: string;
    /** 进入节点的业务条件；空值表示按依赖顺序无条件进入。 */
    condition?: string;
    /** 失败、退回或条件不满足时的处置/去向。 */
    onFailure?: string;
    humanReviewReason?: string;
  }>;
  edges?: Array<{ from: string; to: string }>;
}

/** Provider 注册信息（对应 runtime_providers 表） */
export interface RuntimeProviderInfo {
  id: RuntimeProviderId;
  name: string;
  description: string;
  enabled: boolean;
  capabilities: string[];
  ready?: boolean;
  health?: {
    ready: boolean;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** 创建一次运行（Run）的请求 */
export interface RunRequest {
  provider: RuntimeProviderId;
  runKind?: RunKind;
  /** 任务描述（自然语言，交给智能体执行） */
  task: string;
  team?: TeamRuntimePlan;
  workflow?: WorkflowRuntimePlan;
  inputs?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  execution?: {
    mode: "full" | "single-node" | "from-node";
    startNodeId?: string;
    parentRunId?: string;
  };
  /** 工作区目录（DSH agent 的 DSH_CWD）；缺省用运行时默认工作区 */
  cwd?: string;
  /** 模型选择（仅 dsh provider 生效） */
  model?: string;
  /** DSH 内部模型供应商路由；缺省使用 deepseek-official，不包含 API Key。 */
  modelProvider?: string;
  /** 超时毫秒（默认 120000） */
  timeoutMs?: number;
  /** 归属租户（统一算力计量：开发空间消耗计入该租户） */
  tenantId?: number;
  /** 未登录时只用于本机 mock 预演的临时所有权标识，不可跨网络使用。 */
  guestSession?: string;
  /** 业务侧附加元数据（如来源任务 id） */
  metadata?: Record<string, unknown>;
  /** 步骤流回调（dsh provider 有效）：把 agent 的 tool/call、assistant 等过程实时推给调用方 */
  onStep?: (step: { kind: "tool_call" | "tool_result" | "think" | "assistant"; name?: string; text?: string }) => void;
}

/** 运行事件（证据链基础，FR-EVD 起步） */
export interface RunEvent {
  type: "queued" | "started" | "progress" | "succeeded" | "failed" | "cancelled";
  at: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** 一次运行的结果（落库 agent_runs.result） */
export interface RunResult {
  status: RunStatus;
  /** agent 最终输出文本 */
  output: string;
  /** 估算消耗的 Token 数（统一算力计量） */
  tokensEstimated?: number;
  /** DSH 会话 id（可获取时） */
  sessionId?: string;
  events: RunEvent[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** 证据链：工作区与产物 */
  evidence?: {
    cwd: string;
    artifacts?: string[];
  };
}

/** 运行时适配器接口：每个 Provider 实现 */
export interface RuntimeAdapter {
  readonly id: RuntimeProviderId;
  readonly name: string;
  readonly description: string;
  readonly capabilities: string[];
  getHealth?(): { ready: boolean; message: string; details?: Record<string, unknown> };
  execute(req: RunRequest): Promise<RunResult>;
}
