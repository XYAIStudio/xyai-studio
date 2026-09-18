/**
 * Persist last Ollama 测速 results under userData so the hub can sort
 * without re-benchmarking every visit.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeOllamaTag } from './ollama-errors.js';
import type { SpeedTestResult } from './model-ops.js';

export type StoredSpeedOk = {
  modelKey: string;
  ok: true;
  tokensPerSec: number;
  elapsedMs: number;
  evalCount: number;
  testedAt: string;
};

export type StoredSpeedFail = {
  modelKey: string;
  ok: false;
  message: string;
  testedAt: string;
};

export type StoredSpeedResult = StoredSpeedOk | StoredSpeedFail;

export type SpeedResultMap = Record<string, StoredSpeedResult>;

export function speedModelKey(modelRef: string): string {
  return normalizeOllamaTag(modelRef);
}

export function lookupSpeedResult(
  results: SpeedResultMap,
  ...refs: Array<string | undefined>
): StoredSpeedResult | undefined {
  for (const ref of refs) {
    if (!ref) continue;
    const hit = results[speedModelKey(ref)];
    if (hit) return hit;
  }
  return undefined;
}

function isStoredSpeedResult(value: unknown): value is StoredSpeedResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as StoredSpeedResult;
  if (typeof row.modelKey !== 'string' || typeof row.testedAt !== 'string') {
    return false;
  }
  if (row.ok === true) {
    return (
      typeof row.tokensPerSec === 'number' &&
      Number.isFinite(row.tokensPerSec) &&
      typeof row.elapsedMs === 'number' &&
      typeof row.evalCount === 'number'
    );
  }
  return row.ok === false && typeof row.message === 'string';
}

export class LocalSpeedCache {
  private readonly file: string;

  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, 'model-speed.json');
  }

  load(): SpeedResultMap {
    try {
      if (!existsSync(this.file)) return {};
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as {
        results?: unknown;
      };
      if (!raw.results || typeof raw.results !== 'object') return {};
      const out: SpeedResultMap = {};
      for (const [key, value] of Object.entries(
        raw.results as Record<string, unknown>,
      )) {
        if (isStoredSpeedResult(value)) {
          out[speedModelKey(key)] = value;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  save(results: SpeedResultMap): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(
      this.file,
      JSON.stringify(
        { updatedAt: new Date().toISOString(), results },
        null,
        2,
      ),
      'utf8',
    );
  }

  get(modelRef: string): StoredSpeedResult | undefined {
    return this.load()[speedModelKey(modelRef)];
  }

  put(entry: StoredSpeedResult): SpeedResultMap {
    const all = this.load();
    all[speedModelKey(entry.modelKey)] = {
      ...entry,
      modelKey: speedModelKey(entry.modelKey),
    };
    this.save(all);
    return all;
  }

  putFromTest(modelRef: string, result: SpeedTestResult): SpeedResultMap {
    const modelKey = speedModelKey(modelRef);
    const testedAt = new Date().toISOString();
    if (
      result.ok &&
      result.tokensPerSec != null &&
      Number.isFinite(result.tokensPerSec)
    ) {
      return this.put({
        modelKey,
        ok: true,
        tokensPerSec: result.tokensPerSec,
        elapsedMs: result.elapsedMs ?? 0,
        evalCount: result.evalCount ?? 0,
        testedAt,
      });
    }
    return this.put({
      modelKey,
      ok: false,
      message: result.message,
      testedAt,
    });
  }
}
