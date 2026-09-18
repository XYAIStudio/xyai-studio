/**
 * Pure path / env probe helpers for personalize scanners.
 * Missing apps → empty roots (not errors).
 */

import path from 'node:path';
import os from 'node:os';
import type { ScanProbeEnv } from './types.js';

export type PathEnvLike = {
  HOME?: string;
  USERPROFILE?: string;
  APPDATA?: string;
  LOCALAPPDATA?: string;
};

/** Resolve home / AppData roots from env (injectable for tests). */
export function resolveProbeEnv(
  env: PathEnvLike = process.env as PathEnvLike,
  platform: NodeJS.Platform = process.platform,
  homedir: () => string = () => os.homedir(),
): ScanProbeEnv {
  const home =
    (typeof env.USERPROFILE === 'string' && env.USERPROFILE) ||
    (typeof env.HOME === 'string' && env.HOME) ||
    homedir();

  const appData =
    (typeof env.APPDATA === 'string' && env.APPDATA) ||
    (platform === 'win32'
      ? path.join(home, 'AppData', 'Roaming')
      : path.join(home, '.config'));

  const localAppData =
    (typeof env.LOCALAPPDATA === 'string' && env.LOCALAPPDATA) ||
    (platform === 'win32'
      ? path.join(home, 'AppData', 'Local')
      : path.join(home, '.local', 'share'));

  return { home, appData, localAppData, platform };
}

/** Known Claude Desktop / Claude Code roots (read-only). */
export function claudeProbeRoots(env: ScanProbeEnv): string[] {
  return [
    path.join(env.appData, 'Claude'),
    path.join(env.home, '.claude'),
  ];
}

/** Claude Desktop MCP config file candidates. */
export function claudeMcpConfigCandidates(env: ScanProbeEnv): string[] {
  return [
    path.join(env.appData, 'Claude', 'claude_desktop_config.json'),
    path.join(env.home, '.claude', 'claude_desktop_config.json'),
    path.join(env.home, '.claude.json'),
  ];
}

/** Claude skills / commands directories. */
export function claudeSkillDirs(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.claude', 'skills'),
    path.join(env.home, '.claude', 'commands'),
    path.join(env.appData, 'Claude', 'skills'),
  ];
}

/** Cursor / Codex-adjacent MCP + skills roots. */
export function cursorProbeRoots(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.cursor'),
    path.join(env.appData, 'Cursor'),
    path.join(env.home, '.codex'),
  ];
}

export function cursorMcpConfigCandidates(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.cursor', 'mcp.json'),
    path.join(env.appData, 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'mcp.json'),
    path.join(env.appData, 'Cursor', 'mcp.json'),
  ];
}

export function cursorSkillDirs(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.cursor', 'skills'),
    path.join(env.home, '.cursor', 'rules'),
    path.join(env.home, '.cursor', 'commands'),
  ];
}

export function cursorExtensionRoots(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.cursor', 'extensions'),
    path.join(env.appData, 'Cursor', 'User', 'extensions'),
  ];
}

export function codexMcpConfigCandidates(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.codex', 'config.toml'),
    path.join(env.home, '.codex', 'mcp.json'),
  ];
}

export function codexSkillDirs(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.codex', 'skills'),
    path.join(env.home, '.codex', 'prompts'),
  ];
}

/** Gemini desktop/CLI — best-effort. */
export function geminiProbeRoots(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.gemini'),
    path.join(env.appData, 'Gemini'),
    path.join(env.localAppData, 'Google', 'Gemini'),
  ];
}

export function geminiConfigCandidates(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.gemini', 'settings.json'),
    path.join(env.home, '.gemini', 'mcp.json'),
    path.join(env.appData, 'Gemini', 'config.json'),
  ];
}

/** Workbuddy — best-effort official-ish dirs. */
export function workbuddyProbeRoots(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.workbuddy'),
    path.join(env.appData, 'Workbuddy'),
    path.join(env.appData, 'WorkBuddy'),
    path.join(env.localAppData, 'Workbuddy'),
  ];
}

export function workbuddyConfigCandidates(env: ScanProbeEnv): string[] {
  return [
    path.join(env.home, '.workbuddy', 'mcp.json'),
    path.join(env.home, '.workbuddy', 'plugins.json'),
    path.join(env.appData, 'Workbuddy', 'config.json'),
    path.join(env.appData, 'WorkBuddy', 'mcp.json'),
  ];
}

/** Optional user-added scan roots (later UI); normalize + dedupe. */
export function normalizeExtraScanRoots(roots: unknown): string[] {
  if (!Array.isArray(roots)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of roots) {
    if (typeof r !== 'string') continue;
    const t = r.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Stable discovery id from key string. */
export function discoveryId(discoveryKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < discoveryKey.length; i++) {
    h ^= discoveryKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `disc-${hex}`;
}
