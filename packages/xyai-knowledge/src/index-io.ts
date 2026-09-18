/**
 * Index artifacts under indexRoot/<kbId>/ — never inside source trees.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import type { ChunkRecord, IndexMeta } from './types.js';
import { assertIndexWriteAllowed } from './path-safety.js';

export function kbIndexDir(indexRoot: string, kbId: string): string {
  return path.join(path.resolve(indexRoot), kbId);
}

export function ensureKbIndexDir(
  indexRoot: string,
  kbId: string,
  sourceRoots: string[],
): string {
  const dir = kbIndexDir(indexRoot, kbId);
  assertIndexWriteAllowed(dir, indexRoot, sourceRoots, 'mkdir');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function readMeta(indexRoot: string, kbId: string): IndexMeta | null {
  const p = path.join(kbIndexDir(indexRoot, kbId), 'meta.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as IndexMeta;
  } catch {
    return null;
  }
}

export function writeMeta(
  indexRoot: string,
  kbId: string,
  meta: IndexMeta,
  sourceRoots: string[],
): void {
  const dir = ensureKbIndexDir(indexRoot, kbId, sourceRoots);
  const dest = path.join(dir, 'meta.json');
  const tmp = dest + '.tmp';
  assertIndexWriteAllowed(dest, indexRoot, sourceRoots, 'writeFile');
  assertIndexWriteAllowed(tmp, indexRoot, sourceRoots, 'writeFile');
  writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
  // Atomic-ish replace within index dir only
  renameSync(tmp, dest);
}

/**
 * Write chunks via temp file then rename — no half-written final index on cancel.
 * Call only when the full parse batch for this run is ready to commit
 * (or after each file if using staging; stop waits for current file).
 */
export function writeChunksAtomic(
  indexRoot: string,
  kbId: string,
  chunks: ChunkRecord[],
  sourceRoots: string[],
): void {
  const dir = ensureKbIndexDir(indexRoot, kbId, sourceRoots);
  const dest = path.join(dir, 'chunks.jsonl');
  const tmp = dest + '.tmp';
  assertIndexWriteAllowed(dest, indexRoot, sourceRoots, 'writeFile');
  assertIndexWriteAllowed(tmp, indexRoot, sourceRoots, 'writeFile');
  const fd = openSync(tmp, 'w');
  try {
    for (const c of chunks) {
      appendFileSync(fd, JSON.stringify(c) + '\n', 'utf8');
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, dest);
}

export function appendChunksStaging(
  indexRoot: string,
  kbId: string,
  chunks: ChunkRecord[],
  sourceRoots: string[],
): string {
  const dir = ensureKbIndexDir(indexRoot, kbId, sourceRoots);
  const staging = path.join(dir, 'chunks.staging.jsonl');
  assertIndexWriteAllowed(staging, indexRoot, sourceRoots, 'appendFile');
  for (const c of chunks) {
    appendFileSync(staging, JSON.stringify(c) + '\n', 'utf8');
  }
  return staging;
}

export function clearStaging(
  indexRoot: string,
  kbId: string,
  sourceRoots: string[],
): void {
  const staging = path.join(kbIndexDir(indexRoot, kbId), 'chunks.staging.jsonl');
  if (existsSync(staging)) {
    assertIndexWriteAllowed(staging, indexRoot, sourceRoots, 'unlink');
    unlinkSync(staging);
  }
}

/** Promote staging → chunks.jsonl (complete files only). */
export function commitStaging(
  indexRoot: string,
  kbId: string,
  sourceRoots: string[],
): void {
  const dir = kbIndexDir(indexRoot, kbId);
  const staging = path.join(dir, 'chunks.staging.jsonl');
  const dest = path.join(dir, 'chunks.jsonl');
  if (!existsSync(staging)) return;
  assertIndexWriteAllowed(dest, indexRoot, sourceRoots, 'rename');
  assertIndexWriteAllowed(staging, indexRoot, sourceRoots, 'rename');
  // Staging chunks replace prior committed chunks for the same relativePath
  // so a re-parse does not leave XMP junk beside fresh Chinese body text.
  const stagingLines = readFileSync(staging, 'utf8').split('\n').filter(Boolean);
  const stagingChunks: ChunkRecord[] = [];
  const replacedPaths = new Set<string>();
  for (const line of stagingLines) {
    try {
      const c = JSON.parse(line) as ChunkRecord;
      stagingChunks.push(c);
      if (c.relativePath) {
        replacedPaths.add(c.relativePath.replace(/\\/g, '/').toLowerCase());
      }
    } catch {
      /* skip bad staging line */
    }
  }
  const kept: ChunkRecord[] = [];
  if (existsSync(dest)) {
    for (const line of readFileSync(dest, 'utf8').split('\n').filter(Boolean)) {
      try {
        const c = JSON.parse(line) as ChunkRecord;
        const key = (c.relativePath || '').replace(/\\/g, '/').toLowerCase();
        if (key && replacedPaths.has(key)) continue;
        kept.push(c);
      } catch {
        /* skip */
      }
    }
  }
  const merged = [...kept, ...stagingChunks];
  const tmp = dest + '.tmp';
  writeFileSync(
    tmp,
    merged.map((c) => JSON.stringify(c)).join('\n') + (merged.length ? '\n' : ''),
    'utf8',
  );
  renameSync(tmp, dest);
  unlinkSync(staging);
}


export function readChunks(indexRoot: string, kbId: string): ChunkRecord[] {
  const p = path.join(kbIndexDir(indexRoot, kbId), 'chunks.jsonl');
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const out: ChunkRecord[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as ChunkRecord);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

export function appendAudit(
  indexRoot: string,
  kbId: string,
  entry: Record<string, unknown>,
  sourceRoots: string[],
): void {
  const dir = ensureKbIndexDir(indexRoot, kbId, sourceRoots);
  const dest = path.join(dir, 'audit.jsonl');
  assertIndexWriteAllowed(dest, indexRoot, sourceRoots, 'appendFile');
  appendFileSync(
    dest,
    JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n',
    'utf8',
  );
}
