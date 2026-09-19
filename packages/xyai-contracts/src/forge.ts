/** Forge — dialogue creates docs / skills / plugins / MCP / agents / systems. Not an Agent Loop. */

import type { TurnCapability } from './turn-capability.js';
import type { InteropAssetKind } from './xyos-bridge.js';

/** Asset kinds a dialogue turn may scaffold into the workspace. */
export type ForgeAssetKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'agent'
  | 'doc'
  | 'system';

export const FORGE_ASSET_KINDS: readonly ForgeAssetKind[] = [
  'skill',
  'plugin',
  'mcp',
  'agent',
  'doc',
  'system',
] as const;

/** Last completed Cindy-shaped stage. `noop` is a successful empty request. */
export type ForgeStage = 'noop' | 'scaffold' | 'pack' | 'install';

/** One file relative to the asset folder under the Studio workspace. */
export interface ForgeFile {
  relativePath: string;
  contents: string;
}

/**
 * Host or Core request to forge one asset.
 * Empty (no name, no workspaceRel, no files) is a successful no-op.
 * `capability: 'chat'` is also a no-op so stream turns never write.
 */
export interface ForgeRequest {
  kind?: string;
  name?: string;
  files?: ForgeFile[];
  /** Workspace-relative folder (`plugins/demo`). Overrides kind+name mapping. */
  workspaceRel?: string;
  /** Text-inferred turn capability. PermissionMode must not be supplied. */
  capability?: TurnCapability;
}

export interface ForgeResult {
  ok: boolean;
  noop?: boolean;
  stage?: ForgeStage;
  kind?: ForgeAssetKind;
  name?: string;
  workspaceRel?: string;
  /** Personalize catalog kind (same set as {@link ForgeAssetKind}). */
  personalizeKind?: ForgeAssetKind;
  assetId?: string;
  message?: string;
}

const KIND_ALIASES: Record<string, ForgeAssetKind> = {
  skill: 'skill',
  skills: 'skill',
  技能: 'skill',
  plugin: 'plugin',
  plugins: 'plugin',
  插件: 'plugin',
  mcp: 'mcp',
  agent: 'agent',
  agents: 'agent',
  智能体: 'agent',
  doc: 'doc',
  docs: 'doc',
  document: 'doc',
  文档: 'doc',
  system: 'system',
  systems: 'system',
  系统: 'system',
  管理系统: 'system',
};

/**
 * @param v Unknown kind from IPC, planner input, or folder name
 * @returns Canonical kind, or `undefined` when unrecognized
 */
export function normalizeForgeAssetKind(v: unknown): ForgeAssetKind | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return KIND_ALIASES[trimmed.toLowerCase()] ?? KIND_ALIASES[trimmed];
}

/**
 * @param v Unknown value
 * @returns True when `v` is a {@link ForgeAssetKind}
 */
export function isForgeAssetKind(v: unknown): v is ForgeAssetKind {
  return normalizeForgeAssetKind(v) === v;
}

/** Workspace folder for each kind (`plugins`, `skills`, …). */
export const FORGE_WORKSPACE_FOLDERS: Record<ForgeAssetKind, string> = {
  skill: 'skills',
  plugin: 'plugins',
  mcp: 'mcp',
  agent: 'agents',
  doc: 'docs',
  system: 'systems',
};

const FOLDER_TO_KIND: Record<string, ForgeAssetKind> = {
  skills: 'skill',
  plugins: 'plugin',
  mcp: 'mcp',
  agents: 'agent',
  docs: 'doc',
  systems: 'system',
};

/**
 * @param kind Canonical forge kind
 * @returns Workspace folder name used as the install path prefix
 */
export function workspaceFolderForKind(kind: ForgeAssetKind): string {
  return FORGE_WORKSPACE_FOLDERS[kind];
}

/**
 * Infer kind from a workspace-relative path (`plugins/demo` → `plugin`).
 * @param workspaceRel Relative folder or file under the Studio cwd
 */
export function inferForgeKindFromWorkspaceRel(
  workspaceRel: string | undefined,
): ForgeAssetKind | undefined {
  if (!workspaceRel) return undefined;
  const head = workspaceRel.replace(/\\/g, '/').split('/').find(Boolean);
  if (!head) return undefined;
  return FOLDER_TO_KIND[head.toLowerCase()] ?? normalizeForgeAssetKind(head);
}

/**
 * Map a forged asset onto the OpenXYOS interop kind when the biz path is present.
 * Docs become knowledge mounts; systems stay `system`.
 * @param kind Canonical forge kind
 */
export function interopKindForForge(kind: ForgeAssetKind): InteropAssetKind {
  if (kind === 'doc') return 'knowledge-mount';
  return kind;
}
