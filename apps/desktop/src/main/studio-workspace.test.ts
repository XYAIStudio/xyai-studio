import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  accessModeToCodexSandbox,
  ensureStudioWorkspace,
  setStudioWorkspaceUserDataDir,
} from './studio-workspace.js';

describe('accessModeToCodexSandbox', () => {
  it('maps default and auto to workspace-write', () => {
    expect(accessModeToCodexSandbox('default')).toBe('workspace-write');
    expect(accessModeToCodexSandbox('auto')).toBe('workspace-write');
  });

  it('maps full to danger-full-access', () => {
    expect(accessModeToCodexSandbox('full')).toBe('danger-full-access');
  });

  it('treats missing as default → workspace-write', () => {
    expect(accessModeToCodexSandbox(undefined)).toBe('workspace-write');
    expect(accessModeToCodexSandbox(null)).toBe('workspace-write');
  });
});

describe('ensureStudioWorkspace', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-ws-'));
    setStudioWorkspaceUserDataDir(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates workspace and plugins dirs under userData', () => {
    const paths = ensureStudioWorkspace();
    expect(paths.workspaceDir).toBe(path.join(tmp, 'workspace'));
    expect(paths.pluginsDir).toBe(path.join(tmp, 'workspace', 'plugins'));
    expect(existsSync(paths.workspaceDir)).toBe(true);
    expect(existsSync(paths.pluginsDir)).toBe(true);
  });
});
