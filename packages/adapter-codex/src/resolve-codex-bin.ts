/**
 * Resolve a pinned Codex native binary.
 * Mirrors @openai/codex@0.151.0 bin/codex.js findCodexExecutable vendor layout.
 *
 * Note: optional platform packages are npm-aliased
 * (`@openai/codex-linux-x64` → `npm:@openai/codex@0.151.0-linux-x64`) and usually
 * nest under `@openai/codex/node_modules`, so we resolve the meta package first.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type CodexBinarySource = 'env' | 'package' | 'path' | 'override';

export interface ResolveCodexBinaryResult {
  path: string | null;
  source: CodexBinarySource | null;
}

export interface ResolveCodexBinaryOptions {
  /** Explicit override (e.g. CodexAdapterOptions.binaryPath) */
  binaryPath?: string;
  /** Extra roots to search for node_modules */
  searchRoots?: string[];
}

const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  'x86_64-unknown-linux-musl': '@openai/codex-linux-x64',
  'aarch64-unknown-linux-musl': '@openai/codex-linux-arm64',
  'x86_64-apple-darwin': '@openai/codex-darwin-x64',
  'aarch64-apple-darwin': '@openai/codex-darwin-arm64',
  'x86_64-pc-windows-msvc': '@openai/codex-win32-x64',
  'aarch64-pc-windows-msvc': '@openai/codex-win32-arm64',
};

function currentTargetTriple(): string | null {
  const { platform, arch } = process;
  switch (platform) {
    case 'linux':
    case 'android':
      if (arch === 'x64') return 'x86_64-unknown-linux-musl';
      if (arch === 'arm64') return 'aarch64-unknown-linux-musl';
      return null;
    case 'darwin':
      if (arch === 'x64') return 'x86_64-apple-darwin';
      if (arch === 'arm64') return 'aarch64-apple-darwin';
      return null;
    case 'win32':
      if (arch === 'x64') return 'x86_64-pc-windows-msvc';
      if (arch === 'arm64') return 'aarch64-pc-windows-msvc';
      return null;
    default:
      return null;
  }
}

function exeName(): string {
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

function vendorBinUnder(packageRoot: string, targetTriple: string): string {
  return path.join(packageRoot, 'vendor', targetTriple, 'bin', exeName());
}

function tryResolve(requireFn: NodeJS.Require, id: string): string | null {
  try {
    return requireFn.resolve(id);
  } catch {
    return null;
  }
}

function existingVendor(
  packageRoot: string,
  targetTriple: string,
): string | null {
  const candidate = vendorBinUnder(packageRoot, targetTriple);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Given a require anchored near @openai/codex, find the native vendor binary.
 */
function findVendorFromRequire(
  requireFn: NodeJS.Require,
  platformPackage: string,
  targetTriple: string,
): string | null {
  // Prefer platform optional package (official findCodexExecutable path)
  const platformPkgJson = tryResolve(
    requireFn,
    `${platformPackage}/package.json`,
  );
  if (platformPkgJson) {
    const hit = existingVendor(path.dirname(platformPkgJson), targetTriple);
    if (hit) return hit;
  }

  // Meta package may itself be a platform build with vendor/
  const metaPkgJson = tryResolve(requireFn, '@openai/codex/package.json');
  if (metaPkgJson) {
    const metaRoot = path.dirname(metaPkgJson);
    const hit = existingVendor(metaRoot, targetTriple);
    if (hit) return hit;

    // Nested optional dep (pnpm / npm): @openai/codex/node_modules/@openai/codex-linux-x64
    const nested = path.join(
      metaRoot,
      'node_modules',
      ...platformPackage.split('/'),
    );
    const nestedHit = existingVendor(nested, targetTriple);
    if (nestedHit) return nestedHit;

    // Also try require from meta package root (sees its optionalDependencies)
    try {
      const fromMeta = createRequire(metaPkgJson);
      const nestedPkg = tryResolve(fromMeta, `${platformPackage}/package.json`);
      if (nestedPkg) {
        const fromNested = existingVendor(path.dirname(nestedPkg), targetTriple);
        if (fromNested) return fromNested;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function walkUp(startDir: string): string[] {
  const out: string[] = [];
  let current = path.resolve(startDir);
  const { root } = path.parse(current);
  while (true) {
    out.push(current);
    if (current === root) break;
    current = path.dirname(current);
  }
  return out;
}



/** Packaged Electron CJS bundle empties import.meta.url — never throw. */
function safeImportMetaUrl(): string | null {
  try {
    const u = import.meta.url;
    if (typeof u === 'string' && u.length > 0 && u !== 'undefined') return u;
  } catch {
    /* ignore */
  }
  return null;
}

function safeDirnameFromMeta(): string | null {
  const u = safeImportMetaUrl();
  if (!u) return null;
  try {
    return path.dirname(fileURLToPath(u));
  } catch {
    return null;
  }
}

function monorepoRootsFromHere(): string[] {
  const here = safeDirnameFromMeta();
  if (!here) return [process.cwd()];
  const packageRoot = path.resolve(here, '..');
  const monorepoRoot = path.resolve(packageRoot, '../..');
  return [packageRoot, monorepoRoot, process.cwd()];
}

function requireFromRoot(root: string): NodeJS.Require | null {
  try {
    return createRequire(path.join(root, 'package.json'));
  } catch {
    return null;
  }
}


/**
 * PATH names: on Windows prefer native `codex.exe` over the npm shim `codex.cmd`.
 * @param platform process.platform
 */
export function pathBinaryNames(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') return ['codex.exe', 'codex.cmd'];
  return ['codex'];
}

/**
 * Walk PATH-like dirs; earlier names win (exe before cmd).
 * @param dirs Directories from PATH
 * @param exists Existence probe (injectable for tests)
 * @param platform process.platform
 */
export function findBinaryOnPathEntries(
  dirs: string[],
  exists: (candidate: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): string | null {
  for (const name of pathBinaryNames(platform)) {
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * npm global roots that may contain `@openai/codex` or `@openai/codex-win32-x64`
 * (`…/node_modules/@openai/codex-win32-x64/vendor/<triple>/bin/codex.exe`).
 */
export function npmGlobalVendorRoots(
  homes: Array<string | undefined>,
  platformPackage: string,
  pathEnv: string,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (p: string) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    candidates.push(p);
  };
  for (const home of homes) {
    if (!home) continue;
    push(path.join(home, 'npm', 'node_modules', '@openai', 'codex'));
    push(
      path.join(
        home,
        'npm',
        'node_modules',
        '@openai',
        'codex',
        'node_modules',
        ...platformPackage.split('/'),
      ),
    );
    // Windows npm global often installs the platform package at the top level.
    push(path.join(home, 'npm', 'node_modules', ...platformPackage.split('/')));
  }
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const near = path.join(dir, 'node_modules', '@openai', 'codex');
    push(near);
    push(path.join(near, 'node_modules', ...platformPackage.split('/')));
    push(path.join(dir, 'node_modules', ...platformPackage.split('/')));
  }
  return candidates;
}

/** npm global @openai/codex vendor layout (Windows often only has codex.cmd on PATH). */
function findNpmGlobalVendor(targetTriple: string, platformPackage: string): string | null {
  const homes = [
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    process.env.HOME,
    process.env.USERPROFILE,
  ];
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  const candidates = npmGlobalVendorRoots(homes, platformPackage, pathEnv);
  for (const root of candidates) {
    const hit = existingVendor(root, targetTriple);
    if (hit) return hit;
    const nested = path.join(root, 'node_modules', ...platformPackage.split('/'));
    const nestedHit = existingVendor(nested, targetTriple);
    if (nestedHit) return nestedHit;
  }
  return null;
}

function findOnPath(): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  if (!pathEnv) return null;
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  return findBinaryOnPathEntries(parts);
}

/**
 * Resolve Codex native binary.
 * Order: override → XYAI_CODEX_BIN → platform/@openai/codex packages → PATH.
 */
export function resolveCodexBinary(
  options: ResolveCodexBinaryOptions = {},
): ResolveCodexBinaryResult {
  if (options.binaryPath) {
    if (existsSync(options.binaryPath)) {
      return { path: options.binaryPath, source: 'override' };
    }
    return { path: null, source: null };
  }

  const envBin = process.env.XYAI_CODEX_BIN;
  if (envBin) {
    if (existsSync(envBin)) {
      return { path: envBin, source: 'env' };
    }
    return { path: null, source: null };
  }

  const targetTriple = currentTargetTriple();
  if (!targetTriple) {
    const onPath = findOnPath();
    return onPath
      ? { path: onPath, source: 'path' }
      : { path: null, source: null };
  }

  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) {
    return { path: null, source: null };
  }

  const roots = [
    ...(options.searchRoots ?? []),
    ...monorepoRootsFromHere(),
  ];
  const expanded = new Set<string>();
  for (const r of roots) {
    for (const ancestor of walkUp(r)) {
      expanded.add(ancestor);
    }
  }

  for (const root of expanded) {
    const req = requireFromRoot(root);
    if (!req) continue;
    const hit = findVendorFromRequire(req, platformPackage, targetTriple);
    if (hit) {
      return { path: hit, source: 'package' };
    }
  }

  try {
    const metaUrl = safeImportMetaUrl();
    if (metaUrl) {
      const localRequire = createRequire(metaUrl);
      const hit = findVendorFromRequire(
        localRequire,
        platformPackage,
        targetTriple,
      );
      if (hit) {
        return { path: hit, source: 'package' };
      }
    }
  } catch {
    /* ignore */
  }

  const npmGlobal = findNpmGlobalVendor(targetTriple, platformPackage);
  if (npmGlobal) {
    return { path: npmGlobal, source: 'package' };
  }

  const onPath = findOnPath();
  if (onPath) {
    return { path: onPath, source: 'path' };
  }

  return { path: null, source: null };
}
