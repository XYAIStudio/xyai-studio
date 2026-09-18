/**
 * Locate / optionally serve packaged OpenXYOS for the 业务空间 webview.
 *
 * Vite builds use absolute `/assets/…` URLs which break under file://.
 * When a static index.html is present and no full-stack runtime is available,
 * serve that folder over http://127.0.0.1 instead of returning a file:// URL.
 * If a runnable runtime root exists, resolve auto-starts the full stack (shared
 * with 「重启前后端服务」) rather than preferring the static-http fallback.
 *
 * Packaged layout: extraResources → resources/openxyos (NOT inside app.asar).
 *
 * 「重启前后端服务」spawns full monorepo `npm start` (Express + dist) on :3000.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { app } from 'electron';
import { createXyosBridge } from '@xyai/xyos-bridge';
import {
  listenStaticServer,
  type StaticServerHandle,
} from './openxyos-static-server.js';
import {
  buildOpenXyosServerEnv,
  hasOpenXyosDist,
  isPackedAsarPath,
  listRuntimeCandidateRoots,
  looksLikeOpenXyosRuntimeRoot,
  pickOpenXyosRuntimeRoot,
  pushUniqueRoot,
  resolveOpenXyosSpawnCommand,
} from './openxyos-runtime-utils.js';
import {
  demoLoginCurlExample,
  ensureOpenXyosDemoUsers,
} from './openxyos-demo-bootstrap.js';

export type OpenXyosResolveResult = {
  ok: boolean;
  root: string;
  /** URL the webview should load, when available */
  url?: string;
  mode: 'file' | 'server' | 'static-http' | 'missing' | 'error';
  message: string;
  canOpenFolder: boolean;
};

/** npm / backend child (full stack) */
let serverProc: ChildProcess | null = null;
let serverPort: number | null = null;

/** In-process static HTTP server for Vite dist */
let staticHandle: StaticServerHandle | null = null;

function pushUnique(out: string[], p: string): void {
  pushUniqueRoot(out, p);
}

/**
 * Priority for static / resolve (quick view):
 * 1. XYAI_OPENXYOS_ROOT
 * 2. process.resourcesPath/openxyos  (electron-builder extraResources)
 * 3. process.resourcesPath/components/openxyos
 * 4. dirname(execPath)/resources/openxyos
 * 5. Dev monorepo (cwd / relative), never prefer asar first
 */
export function candidateRoots(): string[] {
  const out: string[] = [];
  const env = process.env.XYAI_OPENXYOS_ROOT?.trim();
  if (env) pushUnique(out, env);

  try {
    const res = process.resourcesPath;
    if (res) {
      pushUnique(out, path.join(res, 'openxyos'));
      pushUnique(out, path.join(res, 'components', 'openxyos'));
      pushUnique(out, path.join(res, 'app.asar.unpacked', 'components', 'openxyos'));
    }
  } catch {
    /* ignore */
  }

  try {
    const execDir = path.dirname(process.execPath);
    pushUnique(out, path.join(execDir, 'resources', 'openxyos'));
  } catch {
    /* ignore */
  }

  // Dev monorepo — resolve from cwd / project without using asar as first hit
  pushUnique(out, path.resolve(process.cwd(), 'components', 'openxyos'));
  pushUnique(out, path.resolve(process.cwd(), '..', '..', 'components', 'openxyos'));
  pushUnique(out, path.resolve(process.cwd(), '..', 'components', 'openxyos'));
  // Common Windows monorepo checkout next to installed app workflows
  pushUnique(out, 'E:\\XYAI studio\\0.5\\components\\openxyos');

  try {
    const appPath = app.getAppPath();
    // Only use if not inside asar (dev unpacked / electron .)
    pushUnique(out, path.join(appPath, 'components', 'openxyos'));
    pushUnique(out, path.resolve(appPath, '..', '..', 'components', 'openxyos'));
    pushUnique(out, path.resolve(appPath, '..', '..', '..', 'components', 'openxyos'));
  } catch {
    /* ignore */
  }

  return out;
}

function looksLikeOpenXyosRoot(root: string): boolean {
  return (
    existsSync(path.join(root, 'package.json')) ||
    existsSync(path.join(root, 'frontend', 'dist', 'index.html')) ||
    existsSync(path.join(root, 'dist', 'index.html')) ||
    existsSync(path.join(root, 'index.html'))
  );
}

export function findOpenXyosRoot(): string | null {
  const roots = candidateRoots();
  for (const root of roots) {
    if (looksLikeOpenXyosRoot(root)) return root;
  }
  // Still return first existing directory for friendly status
  for (const root of roots) {
    if (existsSync(root)) return root;
  }
  return roots[0] || null;
}

function runtimeCandidatesFromEnv(): string[] {
  let resourcesPath: string | undefined;
  let execDir: string | undefined;
  let appPath: string | undefined;
  try {
    resourcesPath = process.resourcesPath || undefined;
  } catch {
    /* ignore */
  }
  try {
    execDir = path.dirname(process.execPath);
  } catch {
    /* ignore */
  }
  try {
    appPath = app.getAppPath();
    if (isPackedAsarPath(appPath)) {
      // still allow appPath relatives via pushUniqueRoot filter
    }
  } catch {
    /* ignore */
  }
  return listRuntimeCandidateRoots({
    envRoot: process.env.XYAI_OPENXYOS_ROOT,
    cwd: process.cwd(),
    resourcesPath,
    execDir,
    appPath,
  });
}

/**
 * Full-stack root: has backend/server.ts or package.json scripts.start.
 * Prefer dist present. Search: env → monorepo → packaged static last.
 */
export function findOpenXyosRuntimeRoot(): string | null {
  return pickOpenXyosRuntimeRoot(runtimeCandidatesFromEnv());
}

/**
 * Locate static entry HTML and the directory to serve (folder containing index.html).
 * Flat pack → root; nested → root/dist or root/frontend/dist.
 */
export function findStaticEntry(root: string): { indexPath: string; serveRoot: string } | null {
  const candidates = [
    path.join(root, 'frontend', 'dist', 'index.html'),
    path.join(root, 'dist', 'index.html'),
    // Flat pack layout: resources/openxyos/index.html
    path.join(root, 'index.html'),
  ];
  for (const f of candidates) {
    if (existsSync(f)) {
      return { indexPath: f, serveRoot: path.dirname(f) };
    }
  }
  return null;
}

function formatSearchedPaths(): string {
  const roots = candidateRoots();
  if (roots.length === 0) return '(无候选路径)';
  return roots.map((r) => `  · ${r}`).join('\n');
}

function formatRuntimeSearchedPaths(): string {
  const roots = runtimeCandidatesFromEnv();
  if (roots.length === 0) return '(无候选路径)';
  return roots.map((r) => `  · ${r}`).join('\n');
}

async function waitForHttp(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 404) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Wait until `/` is up; prefer `/api/health` when available. */
async function waitUntilServerHealthy(port: number, timeoutMs = 55_000): Promise<boolean> {
  const base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/`, { method: 'GET' });
      if (res.ok || res.status === 404) {
        try {
          const health = await fetch(`${base}/api/health`, { method: 'GET' });
          if (health.ok) return true;
        } catch {
          /* health optional */
        }
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(start = 3000, maxTries = 20): Promise<number> {
  for (let p = start; p < start + maxTries; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`无可用端口（已尝试 ${start}–${start + maxTries - 1}）`);
}

async function ensureStaticHttp(serveRoot: string): Promise<StaticServerHandle> {
  const resolved = path.resolve(serveRoot);
  if (staticHandle && staticHandle.root === resolved) {
    return staticHandle;
  }
  if (staticHandle) {
    try {
      await staticHandle.close();
    } catch {
      /* ignore */
    }
    staticHandle = null;
  }
  const handle = await listenStaticServer(resolved, 3921);
  staticHandle = handle;
  return handle;
}

function killChildTree(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  } catch {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
}

async function stopServerChild(): Promise<void> {
  const child = serverProc;
  serverProc = null;
  serverPort = null;
  if (!child) return;
  killChildTree(child);
  // Brief settle so PORT can be rebound
  await new Promise((r) => setTimeout(r, 300));
}

async function stopStaticHandle(): Promise<void> {
  if (!staticHandle) return;
  const h = staticHandle;
  staticHandle = null;
  try {
    await h.close();
  } catch {
    /* ignore */
  }
}


/** True when URL base answers /api/health (full Express stack, not static-only). */
async function probeApiHealth(baseUrl: string, timeoutMs = 1200): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/health`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Prefer an already-running full OpenXYOS server (managed child or common ports)
 * over static-http :3921 which has no API (login JSON.parse fails).
 */
async function preferHealthyFullServer(
  root: string,
): Promise<OpenXyosResolveResult | null> {
  const candidates: number[] = [];
  if (serverPort) candidates.push(serverPort);
  for (const p of [3000, 3001, 3002, 3010, 3920]) {
    if (!candidates.includes(p)) candidates.push(p);
  }
  for (const port of candidates) {
    const url = `http://127.0.0.1:${port}/`;
    if (await probeApiHealth(url)) {
      // Keep tracking if this is our child
      if (serverProc && !serverProc.killed && serverPort === port) {
        /* already tracked */
      } else if (!serverPort) {
        serverPort = port;
      }
      return {
        ok: true,
        root,
        url,
        mode: 'server',
        message: `OpenXYOS 完整服务运行中 :${port}（含 API，可用于登录）`,
        canOpenFolder: true,
      };
    }
  }
  return null;
}

export async function resolveOpenXyos(): Promise<OpenXyosResolveResult> {
  const root = findOpenXyosRoot() || '';
  const bridge = createXyosBridge({ componentRoot: root || undefined });
  const health = await bridge.healthCheck();

  if (!root || !existsSync(root)) {
    return {
      ok: false,
      root: root || '(unset)',
      mode: 'missing',
      message:
        '未找到 OpenXYOS 组件。请将静态包放到安装目录 resources/openxyos，或设置环境变量 XYAI_OPENXYOS_ROOT。\n已搜索路径：\n' +
        formatSearchedPaths(),
      canOpenFolder: false,
    };
  }

  // Prefer healthy full server (API) over static-http — static :3921 has no /api,
  // so login gets HTML and JSON.parse fails with「后端返回了无法识别的响应」.
  // Refresh must not bounce back to static-only while server is still up.
  const full = await preferHealthyFullServer(root);
  if (full) {
    // Stop static server if we are handing the webview to the full stack
    await stopStaticHandle();
    return full;
  }

  // Reuse managed npm child — wait for health instead of falling through to
  // static-http or a second spawn (avoids kill/restart churn + resolve loops).
  if (serverProc && serverPort && !serverProc.killed) {
    const url = `http://127.0.0.1:${serverPort}/`;
    if (await waitUntilServerHealthy(serverPort, 55_000)) {
      await stopStaticHandle();
      return {
        ok: true,
        root,
        url,
        mode: 'server',
        message: `OpenXYOS 开发服务运行中 :${serverPort}`,
        canOpenFolder: true,
      };
    }
  }

  // When a full-stack runtime root exists, auto-start it instead of static-http
  // (static :3921 has no /api — login fails). Shared helper with restart —
  // do not call restartOpenXyosServices via resolve round-trips (loop risk).
  const runtimeRoot = findOpenXyosRuntimeRoot();
  if (runtimeRoot && looksLikeOpenXyosRuntimeRoot(runtimeRoot)) {
    // Drop stale managed child / static before spawn (same as restart path).
    await stopServerChild();
    await stopStaticHandle();
    return startOpenXyosFullStack(runtimeRoot, {
      successMessage: '已自动启动 OpenXYOS 前后端',
    });
  }

  // Fall back to static HTTP only when no runnable runtime root (UI-only pack).
  const staticEntry = findStaticEntry(root);
  if (staticEntry) {
    try {
      const handle = await ensureStaticHttp(staticEntry.serveRoot);
      return {
        ok: true,
        root,
        url: handle.url,
        mode: 'static-http',
        message: `已通过本地 HTTP 加载 OpenXYOS 静态包（${handle.url}）。未找到可启动的完整前后端目录；登录/注册需提供 monorepo OpenXYOS 或点击「重启前后端服务」。`,
        canOpenFolder: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        root,
        mode: 'error',
        message: `OpenXYOS 静态服务启动失败：${message}`,
        canOpenFolder: true,
      };
    }
  }

  // No static index — rely on bridge health / npm start
  if (!health.ok) {
    return {
      ok: false,
      root,
      mode: 'missing',
      message:
        `OpenXYOS 尚未安装（${health.reason || 'not-installed'}）。当前路径：${root}\n已搜索路径：\n` +
        formatSearchedPaths(),
      canOpenFolder: true,
    };
  }

  // Reuse existing npm server if still running
  if (serverProc && serverPort && !serverProc.killed) {
    const url = `http://127.0.0.1:${serverPort}/`;
    return {
      ok: true,
      root,
      url,
      mode: 'server',
      message: `OpenXYOS 开发服务运行中 :${serverPort}`,
      canOpenFolder: true,
    };
  }

  const port = 3921;
  try {
    const pkg = path.join(root, 'package.json');
    if (!existsSync(pkg)) {
      return {
        ok: false,
        root,
        mode: 'missing',
        message: `已定位目录但缺少 package.json 与静态入口（index.html）：${root}\n已搜索路径：\n${formatSearchedPaths()}`,
        canOpenFolder: true,
      };
    }

    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['start'],
      {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        stdio: 'ignore',
        detached: false,
      },
    );
    serverProc = child;
    serverPort = port;
    child.on('exit', () => {
      if (serverProc === child) {
        serverProc = null;
        serverPort = null;
      }
    });

    const url = `http://127.0.0.1:${port}/`;
    const up = await waitForHttp(url, 12000);
    if (up) {
      return {
        ok: true,
        root,
        url,
        mode: 'server',
        message: `已启动 OpenXYOS 服务 ${url}`,
        canOpenFolder: true,
      };
    }
    return {
      ok: false,
      root,
      mode: 'error',
      message: `已尝试启动 OpenXYOS（npm start），但 ${url} 未就绪。可打开目录手动启动。`,
      canOpenFolder: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      root,
      mode: 'error',
      message: `启动 OpenXYOS 失败：${message}`,
      canOpenFolder: true,
    };
  }
}

/** Running full-stack base URL when Studio-spawned server is up. */
export function getOpenXyosServerBaseUrl(): string | null {
  if (serverProc && serverPort && !serverProc.killed) {
    return `http://127.0.0.1:${serverPort}`;
  }
  return null;
}

/**
 * Spawn full OpenXYOS stack at an already-validated runtime root.
 * Shared by resolve (auto-start) and restart — never routes through resolve,
 * so a static-http fallback cannot loop with restartServices.
 */
async function startOpenXyosFullStack(
  root: string,
  opts?: { successMessage?: string },
): Promise<OpenXyosResolveResult> {
  let port: number;
  try {
    port = await findFreePort(3000, 20);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      root,
      mode: 'error',
      message: `无法分配端口：${message}`,
      canOpenFolder: true,
    };
  }

  // Env includes ephemeral JWT/COOKIE secrets when missing — never log env.
  const env = buildOpenXyosServerEnv(port);
  const spawnCmd = resolveOpenXyosSpawnCommand(root, {
    execPath: process.execPath,
  });
  if (spawnCmd.electronAsNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  try {
    const child = spawn(spawnCmd.command, spawnCmd.args, {
      cwd: root,
      env,
      stdio: 'ignore',
      detached: false,
      shell: spawnCmd.shell,
      windowsHide: true,
    });
    serverProc = child;
    serverPort = port;
    child.on('exit', () => {
      if (serverProc === child) {
        serverProc = null;
        serverPort = null;
      }
    });

    const url = `http://127.0.0.1:${port}/`;
    const up = await waitUntilServerHealthy(port, 55_000);
    if (up) {
      const distNote = hasOpenXyosDist(root) ? '' : '（未检测到 dist，若页面空白请先构建前端）';
      let demoNote = '';
      try {
        const boot = await ensureOpenXyosDemoUsers(url);
        if (boot.loginOk) {
          demoNote = '；演示账号已就绪（demo@demo.com）';
        } else {
          demoNote =
            '；演示账号自动注册未完全成功，可手动注册或检查 seed。验证：' +
            demoLoginCurlExample(url);
        }
      } catch {
        demoNote = '；演示账号引导跳过';
      }
      const baseMsg = opts?.successMessage ?? '前后端已启动';
      return {
        ok: true,
        root,
        url,
        mode: 'server',
        message: `${baseMsg}${distNote}${demoNote}`,
        canOpenFolder: true,
      };
    }

    return {
      ok: false,
      root,
      url,
      mode: 'error',
      message: `已尝试启动 OpenXYOS 前后端，但 ${url} 在约 55s 内未就绪。请确认该目录依赖已安装（npm install）且可手动 npm start。`,
      canOpenFolder: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      root,
      mode: 'error',
      message: `启动 OpenXYOS 前后端失败：${message}`,
      canOpenFolder: true,
    };
  }
}

function missingRuntimeRootResult(): OpenXyosResolveResult {
  return {
    ok: false,
    root: '(unset)',
    mode: 'missing',
    message:
      '未找到可启动前后端的完整 OpenXYOS 目录（需含 backend/server.ts 或 package.json 的 start 脚本）。静态包无法重启 API。\n请设置 XYAI_OPENXYOS_ROOT 指向 monorepo 中的 components/openxyos，或将完整目录放到候选路径。\n已搜索路径：\n' +
      formatRuntimeSearchedPaths(),
    canOpenFolder: false,
  };
}

/**
 * Kill prior children/static, then start full OpenXYOS stack (`npm start` / Express)
 * from a monorepo runtime root. Used by 业务空间「重启前后端服务」.
 * Does not call resolveOpenXyos (avoids static-http → restart → resolve loops).
 */
export async function restartOpenXyosServices(): Promise<OpenXyosResolveResult> {
  await stopServerChild();
  await stopStaticHandle();

  const root = findOpenXyosRuntimeRoot();
  if (!root) {
    return missingRuntimeRootResult();
  }

  if (!looksLikeOpenXyosRuntimeRoot(root)) {
    return {
      ok: false,
      root,
      mode: 'missing',
      message:
        '需完整 OpenXYOS 目录含 backend（或 npm start）。当前路径仅有静态资源，无法重启 API。\n' +
        `路径：${root}\n已搜索路径：\n${formatRuntimeSearchedPaths()}`,
      canOpenFolder: true,
    };
  }

  return startOpenXyosFullStack(root, { successMessage: '前后端已重启' });
}

export function stopOpenXyosServer(): void {
  if (serverProc && !serverProc.killed) {
    killChildTree(serverProc);
  }
  serverProc = null;
  serverPort = null;

  if (staticHandle) {
    const h = staticHandle;
    staticHandle = null;
    void h.close().catch(() => {
      /* ignore */
    });
  }
}

// Re-export pure helpers for tests / callers
export {
  looksLikeOpenXyosRuntimeRoot,
  buildOpenXyosServerEnv,
  hasOpenXyosDist,
} from './openxyos-runtime-utils.js';
