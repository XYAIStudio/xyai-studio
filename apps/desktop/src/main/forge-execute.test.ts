import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  configureForgeBiz,
  executeForge,
} from './forge-execute.js';
import { installAsset } from './personalize/actions.js';
import { listStored, setPersonalizeUserDataDir } from './personalize/store.js';

describe('executeForge', () => {
  let tmp: string;
  let workspaceDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-forge-'));
    workspaceDir = path.join(tmp, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    setPersonalizeUserDataDir(tmp);
    configureForgeBiz(null);
  });

  afterEach(() => {
    configureForgeBiz(null);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('no-ops an empty request and writes nothing', async () => {
    const res = await executeForge({}, workspaceDir);
    expect(res).toMatchObject({ ok: true, noop: true, stage: 'noop' });
    expect(listStored()).toEqual([]);
    expect(existsSync(path.join(workspaceDir, 'plugins'))).toBe(false);
  });

  it('no-ops chat capability even when name/files are present', async () => {
    const res = await executeForge(
      {
        capability: 'chat',
        kind: 'plugin',
        name: 'should-not-write',
        files: [{ relativePath: 'plugin.json', contents: '{}' }],
      },
      workspaceDir,
    );
    expect(res.noop).toBe(true);
    expect(existsSync(path.join(workspaceDir, 'plugins', 'should-not-write'))).toBe(
      false,
    );
  });

  it('scaffolds under workspace then installAsset lands in 个性化', async () => {
    const res = await executeForge(
      {
        kind: 'plugin',
        name: 'demo-plugin',
        files: [
          {
            relativePath: 'plugin.json',
            contents: JSON.stringify({ name: 'demo-plugin' }),
          },
        ],
      },
      workspaceDir,
    );
    expect(res).toMatchObject({
      ok: true,
      stage: 'install',
      kind: 'plugin',
      workspaceRel: 'plugins/demo-plugin',
      personalizeKind: 'plugin',
    });
    expect(
      existsSync(path.join(workspaceDir, 'plugins', 'demo-plugin', 'plugin.json')),
    ).toBe(true);
    const stored = listStored({
      kind: 'plugin',
      status: ['installed', 'enabled', 'disabled', 'imported'],
    });
    expect(stored.some((a) => a.name === 'demo-plugin')).toBe(true);
    expect(stored[0]?.status).toBe('installed');
    expect(existsSync(stored[0]!.pathOrRef)).toBe(true);
  });

  it('maps 管理系统 onto systems/ and personalize system', async () => {
    const res = await executeForge(
      {
        kind: '管理系统',
        name: 'oa',
        files: [{ relativePath: 'README.md', contents: '# oa' }],
      },
      workspaceDir,
    );
    expect(res.workspaceRel).toBe('systems/oa');
    expect(res.personalizeKind).toBe('system');
    expect(existsSync(path.join(workspaceDir, 'systems', 'oa', 'README.md'))).toBe(
      true,
    );
    expect(listStored({ kind: 'system' }).some((a) => a.name === 'oa')).toBe(
      true,
    );
  });

  it('pushes to biz when the hook is configured', async () => {
    const pushed: Array<{ kind: string; name: string }> = [];
    configureForgeBiz((input) => {
      pushed.push({ kind: input.kind, name: input.name });
    });
    await executeForge(
      {
        kind: 'doc',
        name: '手册',
        files: [{ relativePath: 'note.md', contents: 'hi' }],
      },
      workspaceDir,
    );
    expect(pushed).toEqual([{ kind: 'knowledge-mount', name: '手册' }]);
  });

  it('reuses installAsset for a packed workspace folder', async () => {
    const dir = path.join(workspaceDir, 'skills', 'packed');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), '# packed');
    const forged = await executeForge(
      { kind: 'skill', name: 'packed' },
      workspaceDir,
    );
    expect(forged.ok).toBe(true);
    const again = installAsset(forged.assetId!);
    expect(again.ok).toBe(true);
    expect(again.asset?.status).toBe('installed');
    expect(readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe('# packed');
  });
});
