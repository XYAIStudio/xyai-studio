/**
 * Recursive list of parseable files under a local source root (read-only).
 */

import { readdirSync, statSync, lstatSync } from 'node:fs';
import path from 'node:path';
import type { ParseableFile } from './types.js';
import { isParseableExt, shouldSkipDirName } from './path-safety.js';

const MAX_FILE_BYTES = 32 * 1024 * 1024; // 32 MiB soft skip

export type ListFilesOptions = {
  maxDepth?: number;
  maxFiles?: number;
};

export function listParseableFiles(
  sourceRoot: string,
  opts: ListFilesOptions = {},
): { files: ParseableFile[]; skipped: { path: string; reason: string }[] } {
  const maxDepth = opts.maxDepth ?? 24;
  const maxFiles = opts.maxFiles ?? 50_000;
  const files: ParseableFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const root = path.resolve(sourceRoot);

  function walk(dir: string, depth: number): void {
    if (files.length >= maxFiles) return;
    if (depth > maxDepth) {
      skipped.push({ path: dir, reason: 'max-depth' });
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({ path: dir, reason: `readdir: ${msg}` });
      return;
    }
    for (const ent of entries) {
      if (files.length >= maxFiles) break;
      const name = ent.name;
      if (name.startsWith('.') && name !== '.env.example') {
        // skip hidden except we already skip most; still skip .git etc via shouldSkip
      }
      if (ent.isDirectory()) {
        if (shouldSkipDirName(name)) {
          skipped.push({ path: path.join(dir, name), reason: 'skip-dir' });
          continue;
        }
      }
      const full = path.join(dir, name);
      let st;
      try {
        // Prefer lstat to detect symlinks without following
        const lst = lstatSync(full);
        if (lst.isSymbolicLink()) {
          skipped.push({ path: full, reason: 'symlink' });
          continue;
        }
        st = lst.isDirectory() || lst.isFile() ? lst : statSync(full);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({ path: full, reason: `stat: ${msg}` });
        continue;
      }
      if (st.isDirectory()) {
        if (shouldSkipDirName(name)) {
          skipped.push({ path: full, reason: 'skip-dir' });
          continue;
        }
        walk(full, depth + 1);
        continue;
      }
      if (!st.isFile()) {
        skipped.push({ path: full, reason: 'not-file' });
        continue;
      }
      if (!isParseableExt(full)) {
        skipped.push({ path: full, reason: 'unsupported' });
        continue;
      }
      if (st.size > MAX_FILE_BYTES) {
        skipped.push({ path: full, reason: 'too-large' });
        continue;
      }
      files.push({
        path: full,
        relativePath: path.relative(root, full),
        name,
        ext: path.extname(full).toLowerCase(),
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      });
    }
  }

  walk(root, 0);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files, skipped };
}
