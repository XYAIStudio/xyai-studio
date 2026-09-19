import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverWorkspaceAssets,
  installWorkspacePlugins,
} from './install-workspace-plugins.js';
import { setPersonalizeUserDataDir, listStored } from './personalize/store.js';

describe('installWorkspacePlugins', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-ws-plug-'));
    setPersonalizeUserDataDir(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('discovers plugin and skill folders then installs into personalize', () => {
    const ws = path.join(tmp, 'workspace');
    mkdirSync(path.join(ws, 'plugins', 'demo-plugin'), { recursive: true });
    writeFileSync(
      path.join(ws, 'plugins', 'demo-plugin', 'plugin.json'),
      JSON.stringify({ name: 'demo-plugin' }),
    );
    mkdirSync(path.join(ws, 'skills', 'demo-skill'), { recursive: true });
    writeFileSync(path.join(ws, 'skills', 'demo-skill', 'SKILL.md'), '# skill');
    mkdirSync(path.join(ws, 'docs', '手册'), { recursive: true });
    writeFileSync(path.join(ws, 'docs', '手册', 'note.md'), '# doc');
    mkdirSync(path.join(ws, 'systems', 'oa'), { recursive: true });
    writeFileSync(path.join(ws, 'systems', 'oa', 'README.md'), '# system');

    const found = discoverWorkspaceAssets(ws);
    expect(found.map((a) => a.name).sort()).toEqual([
      'demo-plugin',
      'demo-skill',
      'oa',
      '手册',
    ]);

    const res = installWorkspacePlugins(ws);
    expect(res.installed).toHaveLength(4);
    expect(res.installed.every((a) => a.status === 'installed')).toBe(true);
    expect(res.installed.every((a) => existsSync(a.pathOrRef))).toBe(true);
    expect(
      res.installed.every((a) =>
        a.pathOrRef.includes(path.join('personalize', 'installed')),
      ),
    ).toBe(true);
    const stored = listStored({
      status: ['installed', 'enabled', 'disabled', 'imported'],
    });
    expect(stored.some((a) => a.name === 'demo-plugin' && a.kind === 'plugin')).toBe(
      true,
    );
    expect(stored.some((a) => a.name === 'demo-skill' && a.kind === 'skill')).toBe(
      true,
    );
    expect(stored.some((a) => a.name === '手册' && a.kind === 'doc')).toBe(true);
    expect(stored.some((a) => a.name === 'oa' && a.kind === 'system')).toBe(true);
  });
});
