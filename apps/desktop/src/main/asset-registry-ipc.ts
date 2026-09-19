/**
 * IPC for the dual-space asset registry. List is the UI hook; no new page.
 */

import { ipcMain } from 'electron';
import { isAssetRegistryOrigin, isAssetSpace } from '@xyai/contracts';
import {
  getAssetRegistry,
  refreshAssetRegistry,
} from './asset-registry-host.js';

/** Register list / get / promote IPC. No new renderer page. */
export function registerAssetRegistryIpc(): void {
  ipcMain.handle(
    'xyai:asset-registry-list',
    async (
      _e,
      payload?: { space?: unknown; kind?: unknown; origin?: unknown },
    ) => {
      await refreshAssetRegistry();
      const items = getAssetRegistry().list({
        space: isAssetSpace(payload?.space) ? payload.space : undefined,
        kind: typeof payload?.kind === 'string' ? payload.kind : undefined,
        origin: isAssetRegistryOrigin(payload?.origin)
          ? payload.origin
          : undefined,
      });
      return { ok: true as const, items };
    },
  );

  ipcMain.handle(
    'xyai:asset-registry-get',
    async (_e, payload?: { id?: unknown }) => {
      await refreshAssetRegistry();
      const id = typeof payload?.id === 'string' ? payload.id : '';
      return { ok: true as const, item: id ? getAssetRegistry().get(id) : undefined };
    },
  );

  ipcMain.handle(
    'xyai:asset-registry-promote',
    async (_e, payload?: { id?: unknown }) => {
      await refreshAssetRegistry();
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) {
        return { ok: true as const, noop: true, message: 'missing-entry' };
      }
      return getAssetRegistry().promote(id);
    },
  );
}
