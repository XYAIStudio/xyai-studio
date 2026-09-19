/**
 * Studio writable sandbox: userData/workspace as cwd, personalize as --add-dir.
 * accessMode default|auto → PermissionMode default|auto → workspace-write + approval never.
 * accessMode full → bypass → danger-full-access.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  accessModeToPermissionMode,
  type AccessMode,
  type PermissionMode,
} from '@xyai/contracts';

export type CodexSandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access';

export type CodexApprovalPolicy =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never';

export interface CodexSandboxSpec {
  sandbox: CodexSandboxMode;
  approval: CodexApprovalPolicy;
}

let overrideUserData: string | null = null;

export function setWorkspaceUserDataDir(dir: string): void {
  overrideUserData = dir;
}

export function getWorkspaceUserDataDir(): string {
  return overrideUserData || process.cwd();
}

export function studioWorkspaceDir(
  userData: string = getWorkspaceUserDataDir(),
): string {
  return path.join(userData, 'workspace');
}

export function studioPersonalizeDir(
  userData: string = getWorkspaceUserDataDir(),
): string {
  return path.join(userData, 'personalize');
}

const WORKSPACE_README = `# XYAI Studio 工作目录

对话里的创建 / 写入任务会把文件放在这里。插件、技能、MCP、智能体、文档、管理系统写进 plugins/、skills/、mcp/、agents/、docs/、systems/ 后会出现在「个性化」列表，无需复制 PowerShell。
`;

/**
 * Ensure userData/workspace exists. Does not overwrite user files.
 * @returns Absolute workspace path used as Codex `-C`
 */
export function ensureStudioWorkspace(
  userData: string = getWorkspaceUserDataDir(),
): string {
  const dir = studioWorkspaceDir(userData);
  mkdirSync(dir, { recursive: true });
  for (const sub of [
    'plugins',
    'skills',
    'mcp',
    'agents',
    'connectors',
    'docs',
    'systems',
  ]) {
    mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const readme = path.join(dir, 'README.md');
  if (!existsSync(readme)) {
    writeFileSync(readme, WORKSPACE_README, 'utf8');
  }
  mkdirSync(studioPersonalizeDir(userData), { recursive: true });
  return dir;
}

/**
 * Map Core PermissionMode to Codex `-s` / `-a` only.
 * Never used to infer chat vs tools. default/auto = workspace-write;
 * bypass = danger-full-access; ask = workspace-write + on-request.
 */
export function permissionModeToCodexSandbox(
  mode: PermissionMode,
): CodexSandboxSpec {
  if (mode === 'bypass') {
    return { sandbox: 'danger-full-access', approval: 'never' };
  }
  if (mode === 'ask') {
    return { sandbox: 'workspace-write', approval: 'on-request' };
  }
  return { sandbox: 'workspace-write', approval: 'never' };
}

/**
 * Map composer accessMode to Codex `-s` / `-a` via PermissionMode.
 * Never used to infer chat vs tools. default/auto = workspace-write.
 */
export function accessModeToCodexSandbox(mode: AccessMode): CodexSandboxSpec {
  return permissionModeToCodexSandbox(accessModeToPermissionMode(mode));
}

/** Preamble so the model writes into cwd layout the install hook can see. */
export function workspaceToolPreamble(workspaceDir: string): string {
  return [
    '你在 XYAI Studio 本机工作目录中工作，可以直接创建和修改文件。',
    `工作目录：${workspaceDir}`,
    '把普通文件写在工作目录；插件写入 plugins/<名称>/，技能写入 skills/<名称>/，MCP 写入 mcp/ 或 mcp.json，智能体写入 agents/<名称>/，文档写入 docs/<名称>/，管理系统写入 systems/<名称>/。',
    '完成后不要让用户复制 PowerShell 或手工安装。',
  ].join('\n');
}
