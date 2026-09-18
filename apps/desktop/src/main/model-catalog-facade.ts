/**
 * ModelCatalogFacade — merge Codex DEFAULT_MODELS + Ollama installed
 * into a unified picker list (groups: local / codex).
 * Pure of Electron; safe to unit-test from Node.
 */

import type { ModelEntry } from '@xyai/contracts';
import { formatModelRef, normalizeModelRef } from '@xyai/contracts';
import { listOllamaModels } from '@xyai/model-hub';
import { DEFAULT_MODELS, type ModelOption } from './settings.js';

export type ModelCatalogGroup = 'local' | 'codex';

export interface CatalogPickerItem {
  /** Canonical modelRef (codex:… / ollama:…) */
  id: string;
  label: string;
  group: ModelCatalogGroup;
}

export interface UnifiedModelCatalog {
  local: CatalogPickerItem[];
  codex: CatalogPickerItem[];
  all: CatalogPickerItem[];
}

export function codexModelsFromDefaults(
  models: ModelOption[] = DEFAULT_MODELS,
): CatalogPickerItem[] {
  return models.map((m) => ({
    id: normalizeModelRef(m.id),
    label: m.label,
    group: 'codex' as const,
  }));
}

export function localModelsFromEntries(
  entries: ModelEntry[],
): CatalogPickerItem[] {
  return entries
    .filter((m) => m.role !== 'embedding' && !/mmproj/i.test(m.displayName))
    .map((m) => {
      const id =
        m.id.startsWith('ollama:')
          ? m.id
          : formatModelRef('ollama', m.displayName);
      return {
        id,
        label: `本地 · ${m.displayName}`,
        group: 'local' as const,
      };
    });
}

/**
 * Load unified catalog. `listLocal` is injectable for tests / offline.
 */
export async function loadUnifiedModelCatalog(
  listLocal: () => Promise<ModelEntry[]> = listOllamaModels,
): Promise<UnifiedModelCatalog> {
  let installed: ModelEntry[] = [];
  try {
    installed = await listLocal();
  } catch {
    installed = [];
  }
  const local = localModelsFromEntries(installed);
  const codex = codexModelsFromDefaults();
  return { local, codex, all: [...local, ...codex] };
}

/** Shape used by CodexHostStatus.localModels / models */
export function toStatusModelLists(catalog: UnifiedModelCatalog): {
  localModels: { id: string; label: string }[];
  models: { id: string; label: string }[];
} {
  return {
    localModels: catalog.local.map(({ id, label }) => ({ id, label })),
    models: catalog.codex.map(({ id, label }) => ({ id, label })),
  };
}
