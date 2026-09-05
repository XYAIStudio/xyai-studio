// ============================================================
// WorkFlow V2 完整类型定义
// 作用域: 前后端共享 (Node.js + React)
// ============================================================

// ---- 审批人配置模式 ----
export type ApproverMode =
  | "specific"          // 指定人员
  | "role"              // 岗位角色
  | "position"          // 职位
  | "department_head"   // 部门负责人
  | "org_escalation"    // 组织逐级上报
  | "initiator_choice"; // 发起人自选

// ---- 会签模式 ----
export type SignMode = "all" | "any" | "ratio";

// ---- 驳回策略 ----
export type RejectStrategy =
  | "back_to_start"     // 退回发起人
  | "back_to_prev"      // 退回上一节点
  | "to_specified";     // 退到指定节点

// ---- 单一审批人配置 ----
export interface ApproverConfig {
  mode: ApproverMode;
  value: string | number;   // userId / roleName / positionName
  label: string;            // 显示名
}

// ---- 条件分支 ----
export interface ConditionBranch {
  label: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: any;
  nextNodeId: string;
}

// ---- 各类型节点配置 ----
export interface ApprovalNodeConfig {
  signMode: SignMode;
  approvers: ApproverConfig[];
  timeoutHours?: number;
  rejectStrategy: RejectStrategy;
  rejectTargetNodeId?: string;
  allowDelegate: boolean;
  allowAddSign: boolean;
  sensitiveFields?: string[];
}

export interface ConditionNodeConfig {
  field: string;
  branches: ConditionBranch[];
  defaultNextNodeId?: string;
}

export interface EndNodeConfig {
  notifyRoles: string[];     // ["audit_supervision", "it"]
  notifyUsers?: number[];
  requireRead?: boolean;
}

export interface ParallelNodeConfig {
  mode: SignMode;
  branches: FlowNode[];      // 内嵌子节点定义
}

// ---- 节点联合类型 ----
export type NodeConfig =
  | Record<string, never>
  | ApprovalNodeConfig
  | ConditionNodeConfig
  | EndNodeConfig
  | ParallelNodeConfig;

export type FlowNodeType = "start" | "approval" | "task" | "condition" | "parallel" | "end";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  title: string;
  config: NodeConfig;
  _isRuntimeNode?: boolean;   // 运行时加签标记
}

// ---- 边 ----
export interface FlowEdge {
  from: string;
  to: string;
}

// ---- 完整流程定义 ----
export interface FlowDefinition {
  version: 2;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ---- 表单字段 ----
export interface FormField {
  key: string;
  type: "text" | "textarea" | "number" | "amount" | "date" | "dateRange" | "select" | "radio" | "checkbox" | "userPicker" | "deptPicker" | "projectPicker" | "image" | "attachment" | "divider" | "description";
  label: string;
  placeholder?: string;
  required: boolean;
  defaultValue?: any;
  options?: { label: string; value: string }[];
  validation?: {
    min?: number; max?: number; pattern?: string; message?: string;
  };
  autoCompute?: {
    formula: string; dependsOn: string[];
  };
  conditionRules?: {
    field: string; op: string; value: any; action: "show" | "hide" | "require";
  }[];
  attachmentConfig?: {
    accept: string[]; maxSize: number; maxCount: number;
  };
  layout?: {
    colSpan: 1 | 2; group?: string;
  };
  nodePermissions?: Record<string, "edit" | "readonly" | "hidden">;
}

// ---- 流程模板完整配置 ----
export interface WorkflowTemplateConfig {
  name: string;
  description?: string;
  category: string;            // 分类标识
  categoryName: string;
  icon?: string;
  flow: FlowDefinition;
  formSchema?: FormField[];
  schemes?: {                  // 多方案
    name: string;
    flow: FlowDefinition;
  }[];
}

// ---- 运行时数据结构 ----
export interface ResolvedApprover {
  userId: number;
  userName: string;
  source: ApproverMode;
}

export interface NodeResolvedState {
  nodeId: string;
  approvers: ResolvedApprover[];
  signMode: SignMode;
}

// ---- 操作结果 ----
export interface TaskActionResult {
  flowStatus: "progressing" | "waiting" | "completed" | "rejected" | "returned" | "cancelled";
  nextNodeIds?: string[];
  remainingApprovers?: number;
  message: string;
}

// ---- 流程时间线条目 ----
export interface TimelineEntry {
  nodeId: string;
  nodeTitle: string;
  userId: number;
  userName: string;
  action: string;
  comment?: string;
  createdAt: string;
}
