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

function monorepoRootsFromHere(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
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

function findOnPath(): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  if (!pathEnv) return null;
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  const name = exeName();
  for (const dir of parts) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
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
    const localRequire = createRequire(import.meta.url);
    const hit = findVendorFromRequire(
      localRequire,
      platformPackage,
      targetTriple,
    );
    if (hit) {
      return { path: hit, source: 'package' };
    }
  } catch {
    /* ignore */
  }

  const onPath = findOnPath();
  if (onPath) {
    return { path: onPath, source: 'path' };
  }

  return { path: null, source: null };
}
