/**
 * Unit tests for OpenXYOS runtime root detection + server env merge.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildOpenXyosServerEnv,
  hasOpenXyosDist,
  listRuntimeCandidateRoots,
  looksLikeOpenXyosRuntimeRoot,
  pickOpenXyosRuntimeRoot,
  resolveOpenXyosSpawnCommand,
  ensureOpenXyosIdentityFile,
  explainOpenXyosBootFailure,
  listMissingServerImports,
  preflightOpenXyosRuntime,
  redactOpenXyosLog,
} from './openxyos-runtime-utils.js';

describe('openxyos-runtime-utils', () => {
  it('lists candidates: env → monorepo → resources last', () => {
    const roots = listRuntimeCandidateRoots({
      envRoot: '/custom/openxyos',
      cwd: '/repo/apps/desktop',
      resourcesPath: '/app/resources',
      execDir: '/app',
    });
    expect(roots[0]).toBe(path.resolve('/custom/openxyos'));
    expect(roots.some((r) => r.includes('XYAI studio'))).toBe(true);
    const resIdx = roots.findIndex((r) => r === path.resolve('/app/resources/openxyos'));
    const monoIdx = roots.findIndex((r) =>
      r.endsWith(path.join('components', 'openxyos')) && r.includes('repo'),
    );
    expect(resIdx).toBeGreaterThan(-1);
    expect(monoIdx).toBeGreaterThan(-1);
    expect(monoIdx).toBeLessThan(resIdx);
  });

  it('detects runtime root via backend/server.ts or scripts.start', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxyos-rt-'));
    try {
      expect(looksLikeOpenXyosRuntimeRoot(dir)).toBe(false);

      mkdirSync(path.join(dir, 'backend'), { recursive: true });
      writeFileSync(path.join(dir, 'backend', 'server.ts'), '// stub\n');
      expect(looksLikeOpenXyosRuntimeRoot(dir)).toBe(true);

      const flat = mkdtempSync(path.join(tmpdir(), 'oxyos-flat-'));
      try {
        writeFileSync(
          path.join(flat, 'package.json'),
          JSON.stringify({ scripts: { start: 'node --import tsx backend/server.ts' } }),
        );
        expect(looksLikeOpenXyosRuntimeRoot(flat)).toBe(true);
        expect(hasOpenXyosDist(flat)).toBe(false);
        mkdirSync(path.join(flat, 'dist'));
        writeFileSync(path.join(flat, 'dist', 'index.html'), '<html></html>');
        expect(hasOpenXyosDist(flat)).toBe(true);
      } finally {
        rmSync(flat, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers runtime root that has dist', () => {
    const a = mkdtempSync(path.join(tmpdir(), 'oxyos-a-'));
    const b = mkdtempSync(path.join(tmpdir(), 'oxyos-b-'));
    try {
      writeFileSync(
        path.join(a, 'package.json'),
        JSON.stringify({ scripts: { start: 'npm run serve' } }),
      );
      writeFileSync(
        path.join(b, 'package.json'),
        JSON.stringify({ scripts: { start: 'npm run serve' } }),
      );
      mkdirSync(path.join(b, 'dist'));
      writeFileSync(path.join(b, 'dist', 'index.html'), '<html></html>');
      expect(pickOpenXyosRuntimeRoot([a, b])).toBe(path.resolve(b));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('injects CORS_ORIGIN and JWT_SECRET when NODE_ENV=production (Windows boot crash)', () => {
    const env = buildOpenXyosServerEnv(3000, {
      PATH: '/usr/bin',
      NODE_ENV: 'production',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe('3000');
    expect(env.CORS_ORIGIN).toContain('http://127.0.0.1:3000');
    expect(env.CORS_ORIGIN).toContain('http://localhost:3000');
    expect(env.JWT_SECRET && env.JWT_SECRET.length >= 32).toBe(true);
    expect(env.COOKIE_SECRET && env.COOKIE_SECRET.length >= 32).toBe(true);
  });

  it('merges server env with registration + secrets (no overwrite of long secrets)', () => {
    const env = buildOpenXyosServerEnv(3000, {
      PATH: '/usr/bin',
      JWT_SECRET: 'x'.repeat(40),
      CORS_ORIGIN: 'http://example.com',
    });
    expect(env.PORT).toBe('3000');
    expect(env.ALLOW_PUBLIC_REGISTRATION).toBe('true');
    expect(env.NODE_ENV).toBe('production');
    expect(env.JWT_SECRET).toBe('x'.repeat(40));
    expect(env.COOKIE_SECRET && env.COOKIE_SECRET.length >= 32).toBe(true);
    expect(env.CORS_ORIGIN).toContain('http://example.com');
    expect(env.CORS_ORIGIN).toContain('http://127.0.0.1:3000');
    expect(env.CORS_ORIGIN).toContain('http://localhost:3000');
    expect(env.SEED_DEMO_DATA).toBe('true');
    expect(env.SEED_DEMO_PASSWORD).toBe('openxyos-demo-2026');
    expect(env.SEED_ADMIN_PASSWORD && env.SEED_ADMIN_PASSWORD.length >= 12).toBe(
      true,
    );
  });

  it('keeps caller-provided seed passwords when ≥12 chars', () => {
    const env = buildOpenXyosServerEnv(3001, {
      SEED_DEMO_PASSWORD: 'custom-demo-password',
      SEED_ADMIN_PASSWORD: 'custom-admin-pw12',
    });
    expect(env.SEED_DEMO_DATA).toBe('true');
    expect(env.SEED_DEMO_PASSWORD).toBe('custom-demo-password');
    expect(env.SEED_ADMIN_PASSWORD).toBe('custom-admin-pw12');
  });

  it('prefers Electron-as-Node + tsx when backend/server.ts exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxyos-spawn-'));
    try {
      mkdirSync(path.join(dir, 'backend'), { recursive: true });
      writeFileSync(path.join(dir, 'backend', 'server.ts'), '// stub\n');
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { start: 'node --import tsx backend/server.ts' } }),
      );
      const electronFake = path.join(dir, 'Electron.exe');
      const cmd = resolveOpenXyosSpawnCommand(dir, { execPath: electronFake });
      expect(cmd.electronAsNode).toBe(true);
      expect(cmd.command).toBe(electronFake);
      expect(cmd.args[0]).toBe('--import');
      expect(cmd.args[1]).toBe('tsx');
      expect(cmd.args[2]).toContain('server.ts');
      expect(cmd.shell).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes missing openxyos-identity.ts when server.ts imports it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxyos-id-'));
    try {
      mkdirSync(path.join(dir, 'backend'), { recursive: true });
      writeFileSync(
        path.join(dir, 'backend', 'server.ts'),
        'import { OPENXYOS_VERSION } from "./openxyos-identity";\n',
      );
      writeFileSync(path.join(dir, 'package.json'), '{"version":"0.6.3"}');
      const first = ensureOpenXyosIdentityFile(dir);
      expect(first.created).toBe(true);
      expect(existsSync(first.filePath)).toBe(true);
      const again = ensureOpenXyosIdentityFile(dir);
      expect(again.created).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts secrets in child logs', () => {
    expect(redactOpenXyosLog('JWT_SECRET=supersecret COOKIE_SECRET=abc')).toBe(
      'JWT_SECRET=[redacted] COOKIE_SECRET=[redacted]',
    );
  });

  it('explains production CORS/JWT and MODULE_NOT_FOUND', () => {
    expect(
      explainOpenXyosBootFailure(
        'Error: CORS_ORIGIN must be explicitly configured in production',
      ),
    ).toMatch(/CORS_ORIGIN/);
    expect(
      explainOpenXyosBootFailure(
        "Error: Cannot find module './openxyos-identity'\ncode: MODULE_NOT_FOUND",
      ),
    ).toMatch(/openxyos-identity/);
    expect(
      explainOpenXyosBootFailure("Error: Cannot find module 'tsx'"),
    ).toMatch(/tsx/);
  });

  it('preflight writes identity then reports other missing server imports', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxyos-pre-'));
    try {
      mkdirSync(path.join(dir, 'backend'), { recursive: true });
      writeFileSync(
        path.join(dir, 'backend', 'server.ts'),
        'import { OPENXYOS_VERSION } from "./openxyos-identity";\nimport { x } from "./routes/talent";\n',
      );
      writeFileSync(path.join(dir, 'package.json'), '{"version":"0.6.3"}');
      const pf = preflightOpenXyosRuntime(dir);
      expect(pf.ok).toBe(false);
      expect(pf.missingImports.some((s) => s.includes('talent'))).toBe(true);
      expect(existsSync(path.join(dir, 'backend', 'openxyos-identity.ts'))).toBe(
        true,
      );
      expect(listMissingServerImports(dir).some((s) => s.includes('identity'))).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('on Windows without server.ts uses cmd /c npm start (not npm.cmd direct)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxyos-npm-'));
    try {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { start: 'node server.js' } }),
      );
      const cmd = resolveOpenXyosSpawnCommand(dir, { execPath: '/usr/bin/node' });
      if (process.platform === 'win32') {
        expect(cmd.command.toLowerCase()).toMatch(/cmd/);
        expect(cmd.args.join(' ')).toContain('npm start');
      } else {
        // no server.ts → npm start
        expect(cmd.command).toBe('npm');
        expect(cmd.args).toEqual(['start']);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
