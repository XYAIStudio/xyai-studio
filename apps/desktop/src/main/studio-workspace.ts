/**
 * Studio writable sandbox: userData/workspace as cwd, personalize as --add-dir.
 * accessMode default|auto → workspace-write + approval never.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AccessMode } from './settings.js';

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

对话里的创建 / 写入任务会把文件放在这里。插件、技能、MCP 写进 plugins/、skills/、mcp/ 后会出现在「个性化」列表，无需复制 PowerShell。
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
  for (const sub of ['plugins', 'skills', 'mcp', 'agents', 'connectors']) {
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
 * Map composer accessMode to Codex `-s` / `-a`.
 * default and auto are writable workspace, never prompt.
 */
export function accessModeToCodexSandbox(mode: AccessMode): CodexSandboxSpec {
  if (mode === 'full') {
    return { sandbox: 'danger-full-access', approval: 'never' };
  }
  return { sandbox: 'workspace-write', approval: 'never' };
}

/** Preamble so the model writes into cwd layout the install hook can see. */
export function workspaceToolPreamble(workspaceDir: string): string {
  return [
    '你在 XYAI Studio 本机工作目录中工作，可以直接创建和修改文件。',
    `工作目录：${workspaceDir}`,
    '把普通文件写在工作目录；插件写入 plugins/<名称>/，技能写入 skills/<名称>/，MCP 写入 mcp/ 或 mcp.json，智能体写入 agents/<名称>/。',
    '完成后不要让用户复制 PowerShell 或手工安装。',
  ].join('\n');
}
