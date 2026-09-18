import { describe, expect, it } from 'vitest';
import {
  claudeMcpConfigCandidates,
  claudeProbeRoots,
  codexMcpConfigCandidates,
  cursorMcpConfigCandidates,
  discoveryId,
  geminiProbeRoots,
  normalizeExtraScanRoots,
  resolveProbeEnv,
  workbuddyProbeRoots,
} from './paths.js';

describe('personalize paths resolveProbeEnv', () => {
  it('uses USERPROFILE / APPDATA / LOCALAPPDATA on win32', () => {
    const env = resolveProbeEnv(
      {
        USERPROFILE: 'C:\\Users\\Lenovo',
        APPDATA: 'C:\\Users\\Lenovo\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\Lenovo\\AppData\\Local',
      },
      'win32',
      () => 'C:\\fallback',
    );
    expect(env.home).toBe('C:\\Users\\Lenovo');
    expect(env.appData).toBe('C:\\Users\\Lenovo\\AppData\\Roaming');
    expect(env.localAppData).toBe('C:\\Users\\Lenovo\\AppData\\Local');
  });

  it('falls back to home-relative AppData when env missing (win32)', () => {
    const env = resolveProbeEnv(
      { USERPROFILE: 'D:\\Users\\Demo' },
      'win32',
      () => '/tmp',
    );
    expect(env.appData.replace(/\\/g, '/')).toContain('AppData/Roaming');
    expect(env.localAppData.replace(/\\/g, '/')).toContain('AppData/Local');
  });

  it('uses HOME and .config on linux', () => {
    const env = resolveProbeEnv({ HOME: '/home/box' }, 'linux', () => '/');
    expect(env.home).toBe('/home/box');
    expect(env.appData).toBe('/home/box/.config');
    expect(env.localAppData).toBe('/home/box/.local/share');
  });
});

describe('personalize path candidates', () => {
  const env = resolveProbeEnv(
    {
      USERPROFILE: 'C:\\Users\\Lenovo',
      APPDATA: 'C:\\Users\\Lenovo\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\Lenovo\\AppData\\Local',
    },
    'win32',
  );

  it('claude roots include AppData Claude and .claude', () => {
    const roots = claudeProbeRoots(env).map((p) => p.replace(/\\/g, '/'));
    expect(roots.some((r) => r.endsWith('AppData/Roaming/Claude'))).toBe(true);
    expect(roots.some((r) => r.endsWith('.claude'))).toBe(true);
  });

  it('claude mcp config includes claude_desktop_config.json', () => {
    const cfgs = claudeMcpConfigCandidates(env).map((p) =>
      p.replace(/\\/g, '/'),
    );
    expect(
      cfgs.some((c) => c.endsWith('Claude/claude_desktop_config.json')),
    ).toBe(true);
  });

  it('cursor mcp includes ~/.cursor/mcp.json', () => {
    const cfgs = cursorMcpConfigCandidates(env).map((p) =>
      p.replace(/\\/g, '/'),
    );
    expect(cfgs.some((c) => c.endsWith('.cursor/mcp.json'))).toBe(true);
  });

  it('codex config.toml candidate exists', () => {
    const cfgs = codexMcpConfigCandidates(env).map((p) =>
      p.replace(/\\/g, '/'),
    );
    expect(cfgs.some((c) => c.endsWith('.codex/config.toml'))).toBe(true);
  });

  it('gemini and workbuddy probe roots are non-empty', () => {
    expect(geminiProbeRoots(env).length).toBeGreaterThan(0);
    expect(workbuddyProbeRoots(env).length).toBeGreaterThan(0);
  });
});

describe('normalizeExtraScanRoots / discoveryId', () => {
  it('dedupes and trims roots', () => {
    expect(normalizeExtraScanRoots(['  a  ', 'a', '', 1, 'b'])).toEqual([
      'a',
      'b',
    ]);
  });

  it('discoveryId is stable', () => {
    expect(discoveryId('claude|mcp|x|y')).toBe(discoveryId('claude|mcp|x|y'));
    expect(discoveryId('a')).not.toBe(discoveryId('b'));
    expect(discoveryId('x')).toMatch(/^disc-[0-9a-f]{8}$/);
  });
});
