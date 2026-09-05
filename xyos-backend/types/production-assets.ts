/**
 * DSH+ / XYOS / XYAI Labs 共同使用的生产资产契约。
 * 这里只描述可交换的能力，不承载任何平台特定实现。
 */

export type ProductionAssetKind = "agent" | "team" | "workflow" | "capability" | "plugin" | "policy" | "knowledge" | "evaluation" | "release";
export type AssetRiskLevel = "low" | "medium" | "high" | "critical";
export type AssetStatus = "draft" | "active" | "deprecated" | "blocked";

export interface SchemaRef {
  type: "json-schema";
  schema: Record<string, unknown>;
}

export interface CapabilityRef {
  id: string;
  kind: "employee" | "skill" | "tool" | "workflow-node" | "knowledge" | "governance" | "reflection" | "runtime";
  version?: string;
  requiredPermissions?: string[];
  config?: Record<string, unknown>;
}

export interface AssetManifest {
  schemaVersion: "1.0";
  id: string;
  kind: ProductionAssetKind;
  name: string;
  description?: string;
  version: string;
  status: AssetStatus;
  riskLevel: AssetRiskLevel;
  input?: SchemaRef;
  output?: SchemaRef;
  capabilities?: CapabilityRef[];
  dependencies?: Array<{ id: string; kind: ProductionAssetKind; version?: string }>;
  permissions?: string[];
  runtimeProviders?: string[];
  source?: { platform: "xyos" | "dsh" | "user" | "labs"; assetId?: string; version?: string };
  evaluation?: { minimumLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5"; reportId?: string };
  metadata?: Record<string, unknown>;
}

export interface AgentManifest extends AssetManifest {
  kind: "agent";
  role: string;
  responsibilities: string[];
  skills?: CapabilityRef[];
}

export interface TeamManifest extends AssetManifest {
  kind: "team";
  members: Array<{ agentId: string; role: string; canDelegate?: boolean }>;
  coordination: "serial" | "parallel" | "hybrid";
}

export interface WorkflowManifest extends AssetManifest {
  kind: "workflow";
  trigger?: { type: "manual" | "schedule" | "event"; config?: Record<string, unknown> };
  nodes: Array<{ id: string; type: string; capability?: CapabilityRef; dependsOn?: string[]; approval?: boolean }>;
}

