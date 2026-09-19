import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoveryId, resolveProbeEnv } from './paths.js';
import { runLocalScan } from './scan.js';
import {
  setPersonalizeUserDataDir,
  loadIndex,
  getExtraScanRoots,
} from './store.js';
import { importAsset, installAsset, installFromDirectory, setEnabled } from './actions.js';

describe('personalize scan + import (fixture)', () => {
  let tmp: string;
  let home: string;
  let ud: string;

  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  const prevAppData = process.env.APPDATA;
  const prevLocal = process.env.LOCALAPPDATA;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'pz-p2-'));
    home = path.join(tmp, 'home');
    ud = path.join(tmp, 'userdata');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
    process.env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
    mkdirSync(path.join(home, '.claude', 'skills', 'demo-skill'), {
      recursive: true,
    });
    writeFileSync(
      path.join(home, '.claude', 'skills', 'demo-skill', 'SKILL.md'),
      '# demo',
    );
    mkdirSync(path.join(home, '.cursor'), { recursive: true });
    writeFileSync(
      path.join(home, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          demo: {
            command: 'npx',
            env: { SECRET: 'x' },
          },
        },
      }),
    );
    setPersonalizeUserDataDir(ud);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevProfile;
    if (prevAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = prevAppData;
    if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prevLocal;
  });

  it('scans fixture skills and mcp as discovered', () => {
    const env = resolveProbeEnv(
      { HOME: home, USERPROFILE: home },
      process.platform,
      () => home,
    );
    const res = runLocalScan({ env });
    expect(res.ok).toBe(true);
    const skill = res.items.find(
      (i) => i.kind === 'skill' && i.name === 'demo-skill',
    );
    expect(skill?.status).toBe('discovered');
    expect(skill?.originApp).toBe('claude');
    expect(skill?.pathOrRef).toContain('demo-skill');

    const mcp = res.items.find((i) => i.kind === 'mcp' && i.name === 'demo');
    expect(mcp?.status).toBe('discovered');
    expect(mcp?.originApp).toBe('cursor');
    const entry = (mcp?.manifest as { entry?: { env?: Record<string, string> } })
      ?.entry;
    expect(entry?.env?.SECRET).toBe('[redacted]');
  });

  it('import persists under userData/personalize/imports', () => {
    const env = resolveProbeEnv(
      { HOME: home, USERPROFILE: home },
      process.platform,
      () => home,
    );
    const res = runLocalScan({ env, kind: 'skill' });
    const skill = res.items.find((i) => i.name === 'demo-skill');
    expect(skill).toBeTruthy();
    const imp = importAsset(skill!.id);
    expect(imp.ok).toBe(true);
    expect(imp.asset?.status).toBe('imported');
    expect(imp.asset?.pathOrRef).toContain(path.join('personalize', 'imports'));
    expect(existsSync(imp.asset!.pathOrRef)).toBe(true);

    const idx = loadIndex();
    expect(idx.assets.some((a) => a.id === skill!.id)).toBe(true);

    const inst = installAsset(skill!.id);
    expect(inst.ok).toBe(true);
    expect(inst.asset?.status).toBe('installed');

    const en = setEnabled(skill!.id, true);
    expect(en.ok).toBe(true);
    expect(en.asset?.status).toBe('enabled');
    const dis = setEnabled(skill!.id, false);
    expect(dis.asset?.status).toBe('disabled');
  });

  it('MCP shared config imports as reference sidecar', () => {
    const env = resolveProbeEnv(
      { HOME: home, USERPROFILE: home },
      process.platform,
      () => home,
    );
    const res = runLocalScan({ env, kind: 'mcp' });
    const mcp = res.items.find((i) => i.name === 'demo');
    expect(mcp).toBeTruthy();
    const imp = importAsset(mcp!.id);
    expect(imp.ok).toBe(true);
    expect(imp.asset?.pathOrRef.endsWith('asset-ref.json')).toBe(true);
    const raw = readFileSync(imp.asset!.pathOrRef, 'utf8');
    expect(raw).toContain('originalPath');
    expect(raw).not.toContain('"x"'); // secret value not copied
  });
});

describe('discoveryId used by scan', () => {
  it('matches path helper', () => {
    expect(discoveryId('a|b')).toMatch(/^disc-/);
    expect(getExtraScanRoots()).toEqual([]);
  });
});

describe('installFromDirectory', () => {
  let tmp: string;
  let ud: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'pz-fromdir-'));
    ud = path.join(tmp, 'userdata');
    setPersonalizeUserDataDir(ud);
    const pkg = path.join(tmp, 'weather-plugin');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      path.join(pkg, 'plugin.json'),
      JSON.stringify({ name: '天气插件', id: 'weather-plugin' }),
    );
    writeFileSync(path.join(pkg, 'README.md'), '# weather');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('copies into installed/plugin/<id> and lists as installed', () => {
    const pkg = path.join(tmp, 'weather-plugin');
    const res = installFromDirectory({
      kind: 'plugin',
      id: 'weather-plugin',
      name: '天气插件',
      srcPath: pkg,
    });
    expect(res.ok).toBe(true);
    expect(res.asset?.status).toBe('installed');
    expect(res.asset?.pathOrRef).toContain(
      path.join('personalize', 'installed', 'plugin', 'weather-plugin'),
    );
    expect(existsSync(res.asset!.pathOrRef)).toBe(true);
    const idx = loadIndex();
    expect(idx.assets.some((a) => a.id === 'weather-plugin')).toBe(true);
  });
});
