/**
 * Persist personalize assets under userData/personalize/.
 * Layout:
 *   personalize/index.json          — catalog of imported/installed/enabled
 *   personalize/imports/<id>/       — copied/referenced imports
 *   personalize/installed/<kind>/<id>/ — loadable store
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import type { PersonalAsset, PersonalizeKind, PersonalizeStatus } from './types.js';

export type PersonalizeIndex = {
  version: 1;
  assets: PersonalAsset[];
  extraScanRoots: string[];
  updatedAt: string;
};

let overrideUserData: string | null = null;

export function setPersonalizeUserDataDir(dir: string): void {
  overrideUserData = dir;
}

export function getPersonalizeRoot(): string {
  const base = overrideUserData || process.cwd();
  return path.join(base, 'personalize');
}

function indexPath(): string {
  return path.join(getPersonalizeRoot(), 'index.json');
}

export function importsDir(): string {
  return path.join(getPersonalizeRoot(), 'imports');
}

export function installedDir(kind: PersonalizeKind): string {
  return path.join(getPersonalizeRoot(), 'installed', kind);
}

function ensureDirs(): void {
  const root = getPersonalizeRoot();
  for (const d of [
    root,
    importsDir(),
    path.join(root, 'installed'),
    ...(['skill', 'plugin', 'mcp', 'connector', 'agent'] as PersonalizeKind[]).map(
      installedDir,
    ),
  ]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

export function emptyIndex(): PersonalizeIndex {
  return {
    version: 1,
    assets: [],
    extraScanRoots: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadIndex(): PersonalizeIndex {
  ensureDirs();
  const p = indexPath();
  if (!existsSync(p)) return emptyIndex();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as PersonalizeIndex;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.assets)) {
      return emptyIndex();
    }
    return {
      version: 1,
      assets: raw.assets.filter(Boolean),
      extraScanRoots: Array.isArray(raw.extraScanRoots)
        ? raw.extraScanRoots.filter((x) => typeof x === 'string')
        : [],
      updatedAt:
        typeof raw.updatedAt === 'string'
          ? raw.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return emptyIndex();
  }
}

export function saveIndex(idx: PersonalizeIndex): void {
  ensureDirs();
  idx.updatedAt = new Date().toISOString();
  writeFileSync(indexPath(), JSON.stringify(idx, null, 2), 'utf8');
}

export function upsertAsset(asset: PersonalAsset): PersonalAsset {
  const idx = loadIndex();
  const i = idx.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) idx.assets[i] = asset;
  else idx.assets.push(asset);
  saveIndex(idx);
  return asset;
}

export function getAsset(id: string): PersonalAsset | undefined {
  return loadIndex().assets.find((a) => a.id === id);
}

export function listStored(filter?: {
  kind?: PersonalizeKind;
  status?: PersonalizeStatus | PersonalizeStatus[];
}): PersonalAsset[] {
  let items = loadIndex().assets;
  if (filter?.kind) items = items.filter((a) => a.kind === filter.kind);
  if (filter?.status) {
    const set = new Set(
      Array.isArray(filter.status) ? filter.status : [filter.status],
    );
    items = items.filter((a) => set.has(a.status));
  }
  return items;
}

/**
 * Copy file or directory into destDir (overwrite). Read-only source.
 * Does not execute anything.
 */
export function copyPathInto(src: string, destDir: string): string {
  ensureDirs();
  if (!existsSync(src)) {
    throw new Error(`源路径不存在: ${src}`);
  }
  mkdirSync(destDir, { recursive: true });
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  const st = statSync(src);
  cpSync(src, dest, { recursive: st.isDirectory(), dereference: true });
  return dest;
}

/** Write a reference-only sidecar JSON (for MCP shared config files). */
export function writeReferenceManifest(
  destDir: string,
  asset: PersonalAsset,
): string {
  ensureDirs();
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, 'asset-ref.json');
  writeFileSync(
    dest,
    JSON.stringify(
      {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        originApp: asset.originApp,
        sourcePath: asset.pathOrRef,
        originalPath: asset.pathOrRef,
        manifest: asset.manifest ?? {},
        importedAt: new Date().toISOString(),
        note: 'Reference import — original path retained; secrets redacted in manifest.',
      },
      null,
      2,
    ),
    'utf8',
  );
  return dest;
}

export function getExtraScanRoots(): string[] {
  return loadIndex().extraScanRoots;
}

export function setExtraScanRoots(roots: string[]): string[] {
  const idx = loadIndex();
  idx.extraScanRoots = [...new Set(roots.map((r) => r.trim()).filter(Boolean))];
  saveIndex(idx);
  return idx.extraScanRoots;
}
