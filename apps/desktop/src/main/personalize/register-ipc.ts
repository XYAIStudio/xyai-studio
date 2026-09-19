/**
 * Personalize IPC (P2) — scan / list / import / install / enable.
 */

import { ipcMain } from 'electron';
import {
  importAsset,
  installAsset,
  listByKindAndSource,
  setEnabled,
} from './actions.js';
import { runLocalScan } from './scan.js';
import {
  getExtraScanRoots,
  setExtraScanRoots,
  setPersonalizeUserDataDir,
} from './store.js';
import type { PersonalizeKind, PersonalizeListSource } from './types.js';

export type { PersonalizeKind };

const KINDS: PersonalizeKind[] = [
  'skill',
  'plugin',
  'mcp',
  'connector',
  'agent',
  'doc',
  'system',
];

function asKind(v: unknown): PersonalizeKind {
  if (typeof v === 'string' && (KINDS as string[]).includes(v)) {
    return v as PersonalizeKind;
  }
  return 'skill';
}

function asListSource(v: unknown): PersonalizeListSource {
  if (v === 'studio' || v === 'local' || v === 'openxyos') return v;
  return 'studio';
}

export { setPersonalizeUserDataDir };

export function registerPersonalizeIpc(): void {
  ipcMain.handle(
    'xyai:personalize-list',
    (
      _e,
      payload?: { kind?: unknown; source?: unknown },
    ): {
      ok: true;
      items: unknown[];
      kind: string;
      source: string;
    } => {
      const kind = asKind(payload?.kind);
      const source = asListSource(payload?.source);
      if (kind === 'agent' && source !== 'studio') {
        return { ok: true, items: [], kind, source };
      }
      const items = listByKindAndSource(kind, source);
      return { ok: true, items, kind, source };
    },
  );

  ipcMain.handle(
    'xyai:personalize-scan',
    (
      _e,
      payload?: { kind?: unknown; extraRoots?: unknown },
    ): {
      ok: true;
      items: unknown[];
      scannedAt: string;
      rootsProbed: number;
      kind: string;
    } => {
      const kindRaw =
        typeof payload?.kind === 'string' ? payload.kind : 'all';
      const kind =
        kindRaw === 'all' ? 'all' : asKind(kindRaw);
      const extra =
        payload?.extraRoots !== undefined
          ? payload.extraRoots
          : getExtraScanRoots();
      const result = runLocalScan({
        kind: kind === 'agent' ? 'skill' : kind,
        extraRoots: extra,
      });
      // Agent kind has no local scanner in P2
      const items =
        kindRaw === 'agent' ? [] : result.items;
      return {
        ok: true,
        items,
        scannedAt: result.scannedAt,
        rootsProbed: result.rootsProbed,
        kind: typeof kindRaw === 'string' ? kindRaw : 'all',
      };
    },
  );

  ipcMain.handle(
    'xyai:personalize-import',
    (_e, payload?: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return { ok: false as const, message: '缺少资产 id' };
      return importAsset(id);
    },
  );

  ipcMain.handle(
    'xyai:personalize-install',
    (_e, payload?: { id?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return { ok: false as const, message: '缺少资产 id' };
      return installAsset(id);
    },
  );

  ipcMain.handle(
    'xyai:personalize-set-enabled',
    (_e, payload?: { id?: unknown; enabled?: unknown }) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return { ok: false as const, message: '缺少资产 id' };
      const enabled = Boolean(payload?.enabled);
      return setEnabled(id, enabled);
    },
  );

  ipcMain.handle(
    'xyai:personalize-set-extra-roots',
    (_e, payload?: { roots?: unknown }) => {
      const roots = Array.isArray(payload?.roots)
        ? payload!.roots!.filter((r): r is string => typeof r === 'string')
        : [];
      return { ok: true as const, roots: setExtraScanRoots(roots) };
    },
  );
}
