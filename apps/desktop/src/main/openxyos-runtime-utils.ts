/**
 * Pure helpers for OpenXYOS full-stack (npm start / Express) runtime.
 * No Electron imports — safe for unit tests.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  OPENXYOS_ADMIN_PASSWORD,
  OPENXYOS_DEMO_PASSWORD,
} from './openxyos-demo-bootstrap.js';

/** Paths inside app.asar are not usable roots (except app.asar.unpacked). */
export function isPackedAsarPath(p: string): boolean {
  const n = p.replace(/\\/g, '/');
  if (n.includes('app.asar.unpacked')) return false;
  return n.includes('app.asar');
}

export function pushUniqueRoot(out: string[], p: string): void {
  const resolved = path.resolve(p);
  if (isPackedAsarPath(resolved)) return;
  if (!out.includes(resolved)) out.push(resolved);
}

export type RuntimeCandidateOpts = {
  envRoot?: string;
  cwd: string;
  resourcesPath?: string;
  execDir?: string;
  appPath?: string;
};

/**
 * Search order for full-stack runtime (backend + preferably dist):
 * 1. XYAI_OPENXYOS_ROOT
 * 2. Monorepo candidates (Windows checkout + cwd relatives)
 * 3. Packaged resources/openxyos last (often static-only)
 */
export function listRuntimeCandidateRoots(opts: RuntimeCandidateOpts): string[] {
  const out: string[] = [];
  const env = opts.envRoot?.trim();
  if (env) pushUniqueRoot(out, env);

  // Monorepo / Windows checkout first
  pushUniqueRoot(out, 'E:\\XYAI studio\\0.5\\components\\openxyos');
  pushUniqueRoot(out, path.resolve(opts.cwd, 'components', 'openxyos'));
  pushUniqueRoot(out, path.resolve(opts.cwd, '..', '..', 'components', 'openxyos'));
  pushUniqueRoot(out, path.resolve(opts.cwd, '..', 'components', 'openxyos'));
  pushUniqueRoot(out, path.resolve(opts.cwd, '..', '..', '..', 'components', 'openxyos'));

  if (opts.appPath) {
    pushUniqueRoot(out, path.join(opts.appPath, 'components', 'openxyos'));
    pushUniqueRoot(out, path.resolve(opts.appPath, '..', '..', 'components', 'openxyos'));
    pushUniqueRoot(out, path.resolve(opts.appPath, '..', '..', '..', 'components', 'openxyos'));
  }

  // Packaged / flat static last
  if (opts.resourcesPath) {
    pushUniqueRoot(out, path.join(opts.resourcesPath, 'openxyos'));
    pushUniqueRoot(out, path.join(opts.resourcesPath, 'components', 'openxyos'));
    pushUniqueRoot(
      out,
      path.join(opts.resourcesPath, 'app.asar.unpacked', 'components', 'openxyos'),
    );
  }
  if (opts.execDir) {
    pushUniqueRoot(out, path.join(opts.execDir, 'resources', 'openxyos'));
  }

  return out;
}

/** True if root can run Express/backend (server.ts or npm start script). */
export function looksLikeOpenXyosRuntimeRoot(root: string): boolean {
  if (!root || !existsSync(root)) return false;
  if (existsSync(path.join(root, 'backend', 'server.ts'))) return true;
  const pkgPath = path.join(root, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: { start?: string } };
    return typeof pkg.scripts?.start === 'string' && pkg.scripts.start.trim().length > 0;
  } catch {
    return false;
  }
}

export function hasOpenXyosDist(root: string): boolean {
  return (
    existsSync(path.join(root, 'dist', 'index.html')) ||
    existsSync(path.join(root, 'frontend', 'dist', 'index.html'))
  );
}

/**
 * Pick first runtime root; prefer ones that also have dist/index.html.
 */
export function pickOpenXyosRuntimeRoot(candidates: string[]): string | null {
  const runnable = candidates.filter((r) => looksLikeOpenXyosRuntimeRoot(r));
  const withDist = runnable.find((r) => hasOpenXyosDist(r));
  return withDist || runnable[0] || null;
}

const SECRET_MIN = 32;

function ensureSecret(existing: string | undefined): string {
  if (existing && existing.length >= SECRET_MIN) return existing;
  return randomBytes(24).toString('hex'); // 48 hex chars
}

function ensureSeedPassword(
  existing: string | undefined,
  fallback: string,
): string {
  const v = existing?.trim();
  if (v && v.length >= 12) return v;
  return fallback;
}

/**
 * Env for OpenXYOS `npm start` / Express. Never log the returned secrets.
 * Studio embed always opts into demo seed so 业务空间 login works after restart.
 */
export function buildOpenXyosServerEnv(
  port: number,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  env.PORT = String(port);
  env.ALLOW_PUBLIC_REGISTRATION = 'true';
  if (!env.NODE_ENV) env.NODE_ENV = 'production';

  // Demo accounts (demo@demo.com / user@demo.com) — see openxyos backend/seed.ts
  env.SEED_DEMO_DATA = 'true';
  env.SEED_DEMO_PASSWORD = ensureSeedPassword(
    env.SEED_DEMO_PASSWORD,
    OPENXYOS_DEMO_PASSWORD,
  );
  env.SEED_ADMIN_PASSWORD = ensureSeedPassword(
    env.SEED_ADMIN_PASSWORD,
    OPENXYOS_ADMIN_PASSWORD,
  );

  const origins = `http://127.0.0.1:${port},http://localhost:${port}`;
  const prev = env.CORS_ORIGIN?.trim();
  if (!prev) {
    env.CORS_ORIGIN = origins;
  } else if (!prev.includes(`127.0.0.1:${port}`) && !prev.includes(`localhost:${port}`)) {
    env.CORS_ORIGIN = `${prev},${origins}`;
  }

  env.JWT_SECRET = ensureSecret(env.JWT_SECRET);
  env.COOKIE_SECRET = ensureSecret(env.COOKIE_SECRET);
  // Studio ↔ OpenXYOS interop (talent market / reserve employees)
  if (!env.XYAI_INTEROP_SECRET?.trim()) {
    env.XYAI_INTEROP_SECRET = 'studio';
  }
  return env;
}

/** Upstream OpenXYOS `backend/server.ts` imports this; some trees omit the file. */
export const OPENXYOS_IDENTITY_STUB = `import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
) as { name: string; version: string };

export const OPENXYOS_PRODUCT = "openXYOS";
export const OPENXYOS_EDITION = "community";
export const OPENXYOS_VERSION = packageJson.version;
`;

export function ensureOpenXyosIdentityFile(root: string): {
  ok: boolean;
  created: boolean;
  filePath: string;
  message: string;
} {
  const filePath = path.join(root, 'backend', 'openxyos-identity.ts');
  if (existsSync(filePath)) {
    return { ok: true, created: false, filePath, message: 'identity present' };
  }
  const serverTs = path.join(root, 'backend', 'server.ts');
  if (!existsSync(serverTs)) {
    return { ok: true, created: false, filePath, message: 'no server.ts' };
  }
  let src = '';
  try {
    src = readFileSync(serverTs, 'utf8');
  } catch {
    src = '';
  }
  if (!src.includes('openxyos-identity')) {
    return {
      ok: true,
      created: false,
      filePath,
      message: 'server does not import identity',
    };
  }
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, OPENXYOS_IDENTITY_STUB, 'utf8');
    return {
      ok: true,
      created: true,
      filePath,
      message: 'wrote missing backend/openxyos-identity.ts',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      created: false,
      filePath,
      message: `无法写入 openxyos-identity.ts：${message}`,
    };
  }
}

export function redactOpenXyosLog(text: string): string {
  return text.replace(
    /(JWT_SECRET|COOKIE_SECRET|XYAI_INTEROP_SECRET|SEED_DEMO_PASSWORD|SEED_ADMIN_PASSWORD)=([^\s]+)/gi,
    '$1=[redacted]',
  );
}

export function tailText(text: string, max = 1800): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(-max);
}

export type OpenXyosSpawnCommand = {
  command: string;
  args: string[];
  shell: boolean;
  /** When true, set ELECTRON_RUN_AS_NODE=1 so Electron binary runs as Node. */
  electronAsNode?: boolean;
};

/**
 * Resolve how to spawn OpenXYOS server.
 * Windows: never spawn npm.cmd with shell:false (Node throws spawn EINVAL).
 * Prefer Electron-as-Node + tsx, then cmd /c npm start, then PATH node.
 */
export function resolveOpenXyosSpawnCommand(
  root: string,
  opts: { execPath?: string } = {},
): OpenXyosSpawnCommand {
  const serverTs = path.join(root, 'backend', 'server.ts');
  const execPath = opts.execPath || process.execPath;

  if (existsSync(serverTs)) {
    // Electron main process: process.execPath is Electron.exe — run as Node.
    if (execPath && /electron/i.test(execPath)) {
      return {
        command: execPath,
        args: ['--import', 'tsx', serverTs],
        shell: false,
        electronAsNode: true,
      };
    }
    const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
    return {
      command: nodeBin,
      args: ['--import', 'tsx', serverTs],
      shell: false,
    };
  }

  const pkgPath = path.join(root, 'package.json');
  let hasStart = false;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        scripts?: { start?: string };
      };
      hasStart =
        typeof pkg.scripts?.start === 'string' && pkg.scripts.start.trim().length > 0;
    } catch {
      /* ignore */
    }
  }

  if (hasStart) {
    if (process.platform === 'win32') {
      // cmd.exe /c avoids EINVAL from spawning npm.cmd directly
      return {
        command: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm start'],
        shell: false,
      };
    }
    return { command: 'npm', args: ['start'], shell: false };
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'node --import tsx backend/server.ts'],
      shell: false,
    };
  }
  return {
    command: 'node',
    args: ['--import', 'tsx', path.join('backend', 'server.ts')],
    shell: false,
  };
}
