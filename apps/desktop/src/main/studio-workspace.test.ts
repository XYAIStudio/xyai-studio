import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accessModeToPermissionMode } from '@xyai/core-runtime';
import {
  accessModeToCodexSandbox,
  effectiveCwd,
  ensureStudioWorkspace,
  permissionModeToCodexSandbox,
  setWorkspaceUserDataDir,
  studioPersonalizeDir,
  studioWorkspaceDir,
} from './studio-workspace.js';

describe('accessModeToCodexSandbox', () => {
  it('maps default and auto to workspace-write + never', () => {
    expect(accessModeToCodexSandbox('default')).toEqual({
      sandbox: 'workspace-write',
      approval: 'never',
    });
    expect(accessModeToCodexSandbox('auto')).toEqual({
      sandbox: 'workspace-write',
      approval: 'never',
    });
  });

  it('maps full to danger-full-access + never', () => {
    expect(accessModeToCodexSandbox('full')).toEqual({
      sandbox: 'danger-full-access',
      approval: 'never',
    });
  });

  it('routes accessMode through PermissionMode without changing sandbox', () => {
    expect(accessModeToPermissionMode('default')).toBe('default');
    expect(accessModeToPermissionMode('auto')).toBe('auto');
    expect(accessModeToPermissionMode('full')).toBe('bypass');
    expect(accessModeToCodexSandbox('full')).toEqual(
      permissionModeToCodexSandbox('bypass'),
    );
    expect(permissionModeToCodexSandbox('ask')).toEqual({
      sandbox: 'workspace-write',
      approval: 'on-request',
    });
  });
});

describe('ensureStudioWorkspace', () => {
  const prev = process.cwd();
  let tmp: string;

  afterEach(() => {
    setWorkspaceUserDataDir(prev);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('creates workspace + personalize under userData', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-ws-'));
    setWorkspaceUserDataDir(tmp);
    const cwd = ensureStudioWorkspace(tmp);
    expect(cwd).toBe(studioWorkspaceDir(tmp));
    expect(existsSync(path.join(cwd, 'plugins'))).toBe(true);
    expect(existsSync(path.join(cwd, 'skills'))).toBe(true);
    expect(existsSync(path.join(cwd, 'docs'))).toBe(true);
    expect(existsSync(path.join(cwd, 'systems'))).toBe(true);
    expect(existsSync(path.join(cwd, 'README.md'))).toBe(true);
    expect(existsSync(studioPersonalizeDir(tmp))).toBe(true);
  });
});

describe('effectiveCwd', () => {
  const prev = process.cwd();
  let tmp: string;

  afterEach(() => {
    setWorkspaceUserDataDir(prev);
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('empty / whitespace → studio workspace', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-cwd-'));
    setWorkspaceUserDataDir(tmp);
    expect(effectiveCwd('')).toBe(studioWorkspaceDir(tmp));
    expect(effectiveCwd('   ')).toBe(studioWorkspaceDir(tmp));
    expect(effectiveCwd(null)).toBe(studioWorkspaceDir(tmp));
    expect(effectiveCwd(undefined, tmp)).toBe(studioWorkspaceDir(tmp));
  });

  it('trims and returns project cwd when set', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-cwd-'));
    const custom = path.join(tmp, 'my-project');
    expect(effectiveCwd(`  ${custom}  `, tmp)).toBe(custom);
  });
});
