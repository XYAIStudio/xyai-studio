/**
 * ModelCatalogFacade — merge Codex DEFAULT_MODELS + live Ollama tags
 * into a unified picker list (groups: local / codex).
 * Local labels are honest family/tag names (no redundant「本地 · tag」).
 * Pure of Electron; safe to unit-test from Node.
 */

import type { ModelEntry } from '@xyai/contracts';
import { formatModelRef, normalizeModelRef } from '@xyai/contracts';
import { listOllamaModels, presentLocalPickerItems } from '@xyai/model-hub';
import { DEFAULT_MODELS, type ModelOption } from './settings.js';

export type ModelCatalogGroup = 'local' | 'codex';

export interface CatalogPickerItem {
  /** Canonical modelRef (codex:… / ollama:…) */
  id: string;
  label: string;
  /** Subtitle: ollama tag, or 同权重 note when tags share a digest. */
  hint?: string;
  group: ModelCatalogGroup;
}

export interface UnifiedModelCatalog {
  local: CatalogPickerItem[];
  codex: CatalogPickerItem[];
  all: CatalogPickerItem[];
}

export function isPickerLocalEntry(m: ModelEntry): boolean {
  if (m.role === 'embedding') return false;
  if (/mmproj|mm-proj|projector/i.test(m.displayName) || /mmproj/i.test(m.id)) {
    return false;
  }
  if (m.installed !== true) return false;
  return m.id.startsWith('ollama:') || m.source === 'ollama';
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
  const eligible = entries.filter(isPickerLocalEntry);
  const presented = presentLocalPickerItems(eligible);
  return presented.map((p, i) => {
    const m = eligible[i]!;
    const id = m.id.startsWith('ollama:')
      ? m.id
      : formatModelRef('ollama', m.displayName);
    return {
      id,
      label: p.label,
      hint: p.hint,
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
  localModels: { id: string; label: string; hint?: string }[];
  models: { id: string; label: string; hint?: string }[];
} {
  return {
    localModels: catalog.local.map(({ id, label, hint }) => ({
      id,
      label,
      hint,
    })),
    models: catalog.codex.map(({ id, label, hint }) => ({ id, label, hint })),
  };
}
