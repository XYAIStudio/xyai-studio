/**
 * Orchestrate read-only local scanners. Missing apps → empty, not error.
 */

import { discoveryId, normalizeExtraScanRoots, resolveProbeEnv } from './paths.js';
import { scanClaude } from './scanners/claude.js';
import { scanCodex } from './scanners/codex.js';
import { scanCursor } from './scanners/cursor.js';
import { scanExtraRoots } from './scanners/extra-roots.js';
import { scanGemini } from './scanners/gemini.js';
import { scanWorkbuddy } from './scanners/workbuddy.js';
import type {
  DiscoveredRaw,
  PersonalAsset,
  PersonalizeKind,
  ScanProbeEnv,
} from './types.js';

export type ScanOptions = {
  env?: ScanProbeEnv;
  extraRoots?: unknown;
  kind?: PersonalizeKind | 'all';
};

function toAsset(raw: DiscoveredRaw): PersonalAsset {
  return {
    id: discoveryId(raw.discoveryKey),
    kind: raw.kind,
    name: raw.name,
    source: 'local-scan',
    originApp: raw.originApp,
    status: 'discovered',
    pathOrRef: raw.pathOrRef,
    manifest: raw.manifest,
    version: raw.version,
    description: raw.description,
  };
}

export function runLocalScan(options: ScanOptions = {}): {
  ok: true;
  items: PersonalAsset[];
  scannedAt: string;
  rootsProbed: number;
} {
  const env = options.env ?? resolveProbeEnv();
  const extra = normalizeExtraScanRoots(options.extraRoots);
  const raw: DiscoveredRaw[] = [
    ...scanClaude(env),
    ...scanCursor(env),
    ...scanCodex(env),
    ...scanGemini(env),
    ...scanWorkbuddy(env),
    ...scanExtraRoots(extra),
  ];

  // Dedupe by discovery id (same path+name from overlapping probes)
  const byId = new Map<string, PersonalAsset>();
  for (const r of raw) {
    const a = toAsset(r);
    if (!byId.has(a.id)) byId.set(a.id, a);
  }

  let items = [...byId.values()];
  if (options.kind && options.kind !== 'all') {
    items = items.filter((i) => i.kind === options.kind);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  return {
    ok: true,
    items,
    scannedAt: new Date().toISOString(),
    rootsProbed:
      2 /* claude */ +
      3 /* cursor roots */ +
      1 /* codex home */ +
      3 /* gemini */ +
      4 /* workbuddy */ +
      extra.length,
  };
}
