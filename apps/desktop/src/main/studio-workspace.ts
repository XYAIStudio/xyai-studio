/**
 * Studio agent workspace under Electron userData.
 * Codex -C cwd + sandbox mapping from settings.accessMode.
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AccessMode } from './settings.js';

/** Codex CLI `-s` values (must match `codex exec --sandbox` possible values). */
export type CodexSandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access';

let overrideUserData: string | null = null;

export function setStudioWorkspaceUserDataDir(dir: string): void {
  overrideUserData = dir;
}

export function getStudioUserDataDir(): string {
  return overrideUserData || process.cwd();
}

/**
 * Map composer 「使用权限」accessMode → Codex sandbox.
 * Product: default/auto must be able to write files (read-only is a dead product).
 */
export function accessModeToCodexSandbox(
  accessMode: AccessMode | undefined | null,
): CodexSandboxMode {
  const mode = accessMode === 'auto' || accessMode === 'full' || accessMode === 'default'
    ? accessMode
    : 'default';
  if (mode === 'full') return 'danger-full-access';
  // default + auto
  return 'workspace-write';
}

export interface StudioWorkspacePaths {
  /** userData/workspace — Codex -C cwd */
  workspaceDir: string;
  /** userData/workspace/plugins — scaffold for personalize plugin packages */
  pluginsDir: string;
  /** userData/personalize — install target root (index + installed/) */
  personalizeRoot: string;
}

export function studioWorkspacePaths(
  userDataDir: string = getStudioUserDataDir(),
): StudioWorkspacePaths {
  const workspaceDir = path.join(userDataDir, 'workspace');
  return {
    workspaceDir,
    pluginsDir: path.join(workspaceDir, 'plugins'),
    personalizeRoot: path.join(userDataDir, 'personalize'),
  };
}

/** mkdir -p workspace + plugins; return absolute paths. */
export function ensureStudioWorkspace(
  userDataDir: string = getStudioUserDataDir(),
): StudioWorkspacePaths {
  const paths = studioWorkspacePaths(userDataDir);
  for (const d of [paths.workspaceDir, paths.pluginsDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  return paths;
}
