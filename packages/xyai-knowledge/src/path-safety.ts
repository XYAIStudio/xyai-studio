/**
 * Path safety — source trees are read-only; never write/unlink/rename there.
 */

import path from 'node:path';

const WRITE_OPS = new Set([
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'unlink',
  'unlinkSync',
  'rename',
  'renameSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'truncate',
  'truncateSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
]);

/**
 * Normalize to absolute resolved path (no trailing sep except root).
 */
export function resolveSafe(p: string): string {
  return path.resolve(p);
}

/**
 * True when `candidate` is inside `root` (or equal). Uses resolved paths.
 */
export function isPathInside(root: string, candidate: string): boolean {
  const r = resolveSafe(root);
  const c = resolveSafe(candidate);
  if (c === r) return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return c.startsWith(prefix);
}

/**
 * Assert that a write target is NOT under any source root.
 * Throws if the destination would mutate a source tree.
 */
export function assertNotSourceWrite(
  destPath: string,
  sourceRoots: string[],
  op = 'writeFile',
): void {
  if (!WRITE_OPS.has(op) && op !== 'mkdir' && op !== 'mkdirSync') {
    return;
  }
  const dest = resolveSafe(destPath);
  for (const root of sourceRoots) {
    if (!root) continue;
    if (isPathInside(root, dest)) {
      throw new Error(
        `[xyai-knowledge] refused ${op} inside source root: ${dest} (source=${resolveSafe(root)})`,
      );
    }
  }
}

/**
 * Assert dest is under an allowed index root (derived artifacts only).
 */
export function assertUnderIndexRoot(
  destPath: string,
  indexRoot: string,
): void {
  if (!isPathInside(indexRoot, destPath)) {
    throw new Error(
      `[xyai-knowledge] index write outside indexRoot: ${resolveSafe(destPath)} (indexRoot=${resolveSafe(indexRoot)})`,
    );
  }
}

/**
 * Combine: write only allowed under indexRoot and never under sourceRoots.
 */
export function assertIndexWriteAllowed(
  destPath: string,
  indexRoot: string,
  sourceRoots: string[],
  op = 'writeFile',
): void {
  assertUnderIndexRoot(destPath, indexRoot);
  assertNotSourceWrite(destPath, sourceRoots, op);
}

/** Extensions considered parseable in the UI file list. */
export const PARSEABLE_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.xml',
  '.yml',
  '.yaml',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.css',
  '.scss',
]);

export function isParseableExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return PARSEABLE_EXTS.has(ext);
}

/** Skip Windows junk / protected / symlink markers by name. */
export function shouldSkipDirName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === 'node_modules' ||
    n === '.git' ||
    n === '.svn' ||
    n === '$recycle.bin' ||
    n === 'system volume information' ||
    n === '.trash' ||
    n === '__macosx'
  );
}

/** Chinese UX copy when index dir collides with a knowledge source tree. */
export const INDEX_SOURCE_COLLISION_MSG = '索引目录不能设在知识库源文件夹内';

/**
 * True when paths are equal or either is nested inside the other.
 */
export function pathsCollide(a: string, b: string): boolean {
  if (!a || !b) return false;
  return isPathInside(a, b) || isPathInside(b, a);
}

/**
 * True when indexRoot equals or nests with any source root (or vice versa).
 */
export function indexCollidesWithSources(
  indexRoot: string,
  sourceRoots: string[],
): boolean {
  if (!indexRoot) return false;
  for (const src of sourceRoots) {
    if (src && pathsCollide(indexRoot, src)) return true;
  }
  return false;
}

/**
 * Pick a safe index root: never equal/inside source. Falls back to `fallback`
 * (typically userData/knowledge-index) instead of copying the source path.
 */
export function resolveSafeIndexRoot(input: {
  requested?: string | null;
  sourceRoot?: string | null;
  sourceRoots?: string[];
  fallback: string;
}): { indexRoot: string; repaired: boolean; reason?: string } {
  const fallback = resolveSafe(input.fallback);
  const sources = [
    ...(input.sourceRoot ? [input.sourceRoot] : []),
    ...(input.sourceRoots || []),
  ]
    .filter(Boolean)
    .map((s) => resolveSafe(s));

  const requested = (input.requested || '').trim();
  if (!requested) {
    return { indexRoot: fallback, repaired: false };
  }
  const resolved = resolveSafe(requested);
  if (indexCollidesWithSources(resolved, sources)) {
    return {
      indexRoot: fallback,
      repaired: true,
      reason: INDEX_SOURCE_COLLISION_MSG,
    };
  }
  // Also refuse using fallback if somehow fallback collides — still return it
  // only when distinct; caller should set fallback under userData.
  return { indexRoot: resolved, repaired: false };
}
