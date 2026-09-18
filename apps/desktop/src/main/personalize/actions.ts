/**
 * Import / install / enable-disable for personalize assets.
 * Security: no executing unknown installers; copy/reference only.
 */

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { PersonalAsset, PersonalizeKind } from './types.js';
import { runLocalScan } from './scan.js';
import {
  copyPathInto,
  getAsset,
  getExtraScanRoots,
  importsDir,
  installedDir,
  listStored,
  upsertAsset,
  writeReferenceManifest,
} from './store.js';

function isSharedConfigFile(p: string): boolean {
  const base = path.basename(p).toLowerCase();
  return (
    base === 'claude_desktop_config.json' ||
    base === 'mcp.json' ||
    base === 'config.toml' ||
    base === 'config.json' ||
    base === 'connectors.json' ||
    base === 'plugins.json' ||
    base === 'settings.json' ||
    base === '.claude.json'
  );
}

export function findDiscovered(
  id: string,
  kind?: PersonalizeKind,
): PersonalAsset | undefined {
  const scan = runLocalScan({
    kind: kind || 'all',
    extraRoots: getExtraScanRoots(),
  });
  return scan.items.find((i) => i.id === id);
}

/**
 * 一键导入: copy or reference into userData/personalize/imports/<id>.
 */
export function importAsset(id: string): {
  ok: boolean;
  asset?: PersonalAsset;
  message?: string;
} {
  try {
    const existing = getAsset(id);
    const discovered =
      existing?.status === 'discovered'
        ? existing
        : findDiscovered(id) || existing;
    if (!discovered) {
      return { ok: false, message: '未找到可导入的资产（请先扫描本机发现）' };
    }
    const src = discovered.pathOrRef;
    if (!src || !existsSync(src)) {
      return { ok: false, message: `来源路径不存在: ${src || '(空)'}` };
    }

    const destRoot = path.join(importsDir(), id);
    let pathOrRef: string;
    const st = statSync(src);
    if (st.isFile() && isSharedConfigFile(src)) {
      // MCP/shared config: reference only (avoid pulling whole multi-server file as exclusive)
      pathOrRef = writeReferenceManifest(destRoot, discovered);
    } else {
      pathOrRef = copyPathInto(src, destRoot);
    }

    const asset: PersonalAsset = {
      ...discovered,
      source: 'import',
      status: 'imported',
      pathOrRef,
      manifest: {
        ...(discovered.manifest || {}),
        originalPath: src,
        importedAt: new Date().toISOString(),
      },
    };
    upsertAsset(asset);
    return { ok: true, asset };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/**
 * 安装: copy into Studio loadable store under installed/<kind>/<id>.
 */
export function installAsset(id: string): {
  ok: boolean;
  asset?: PersonalAsset;
  message?: string;
} {
  try {
    let asset = getAsset(id);
    if (!asset || asset.status === 'discovered') {
      const imp = importAsset(id);
      if (!imp.ok || !imp.asset) return imp;
      asset = imp.asset;
    }

    const src =
      (asset.manifest &&
        typeof asset.manifest.originalPath === 'string' &&
        asset.manifest.originalPath) ||
      asset.pathOrRef;
    if (!src || !existsSync(src)) {
      return { ok: false, message: `安装源不存在: ${src || '(空)'}` };
    }

    const destRoot = path.join(installedDir(asset.kind), id);
    let pathOrRef: string;
    const st = statSync(src);
    if (st.isFile() && isSharedConfigFile(src)) {
      pathOrRef = writeReferenceManifest(destRoot, {
        ...asset,
        pathOrRef: src,
      });
    } else {
      pathOrRef = copyPathInto(src, destRoot);
    }

    const installed: PersonalAsset = {
      ...asset,
      source: asset.source === 'local-scan' ? 'import' : asset.source,
      status: 'installed',
      pathOrRef,
      manifest: {
        ...(asset.manifest || {}),
        installedAt: new Date().toISOString(),
        installPath: pathOrRef,
      },
    };
    upsertAsset(installed);
    return { ok: true, asset: installed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/** 启用 / 停用 stubs — wire status only (runtime load hooks later). */
export function setEnabled(
  id: string,
  enabled: boolean,
): { ok: boolean; asset?: PersonalAsset; message?: string } {
  const asset = getAsset(id);
  if (!asset) {
    return { ok: false, message: '资产不存在，请先导入或安装' };
  }
  if (
    asset.status !== 'installed' &&
    asset.status !== 'enabled' &&
    asset.status !== 'disabled' &&
    asset.status !== 'imported'
  ) {
    return { ok: false, message: '请先导入/安装后再启用' };
  }
  const next: PersonalAsset = {
    ...asset,
    status: enabled ? 'enabled' : 'disabled',
    manifest: {
      ...(asset.manifest || {}),
      enabledAt: enabled ? new Date().toISOString() : undefined,
      disabledAt: enabled ? undefined : new Date().toISOString(),
    },
  };
  upsertAsset(next);
  return { ok: true, asset: next };
}

export function listByKindAndSource(
  kind: PersonalizeKind,
  source: 'studio' | 'local' | 'openxyos',
): PersonalAsset[] {
  if (source === 'openxyos') {
    // P3 — empty for now
    return [];
  }
  if (source === 'local') {
    const scan = runLocalScan({ kind, extraRoots: getExtraScanRoots() });
    const stored = listStored({ kind });
    const storedById = new Map(stored.map((a) => [a.id, a]));
    // Prefer stored status when user already imported/installed same id
    return scan.items.map((d) => {
      const s = storedById.get(d.id);
      if (!s) return d;
      return {
        ...d,
        status: s.status,
        source: s.source,
        pathOrRef: s.pathOrRef,
        manifest: { ...(d.manifest || {}), ...(s.manifest || {}) },
      };
    });
  }
  // studio: imported / installed / enabled / disabled
  return listStored({
    kind,
    status: ['imported', 'installed', 'enabled', 'disabled'],
  });
}
