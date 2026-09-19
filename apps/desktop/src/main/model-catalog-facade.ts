/**
 * ModelCatalogFacade — merge live Ollama tags + custom/cloud + Codex defaults
 * into one picker list and a Core-normalized catalog.
 * Local labels are honest family/tag names (no redundant「本地 · tag」).
 * Pure of Electron; safe to unit-test from Node.
 */

import type { ModelEntry, NormalizedModelEntry } from '@xyai/contracts';
import { formatModelRef, normalizeModelRef } from '@xyai/contracts';
import { normalizeGatewayCatalog } from '@xyai/core-runtime';
import { listOllamaModels, presentLocalPickerItems } from '@xyai/model-hub';
import { DEFAULT_MODELS, type ModelOption } from './settings.js';
import type { CustomProvider } from './custom-providers.js';

export type ModelCatalogGroup = 'local' | 'codex' | 'cloud';

export interface CatalogPickerItem {
  /** Canonical modelRef (codex:… / ollama:… / custom:…) */
  id: string;
  label: string;
  /** Subtitle: ollama tag, or 同权重 note when tags share a digest. */
  hint?: string;
  group: ModelCatalogGroup;
}

export interface UnifiedModelCatalog {
  local: CatalogPickerItem[];
  codex: CatalogPickerItem[];
  cloud: CatalogPickerItem[];
  all: CatalogPickerItem[];
  normalized: NormalizedModelEntry[];
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

export function cloudModelsFromProviders(
  providers: CustomProvider[] = [],
): CatalogPickerItem[] {
  const out: CatalogPickerItem[] = [];
  for (const p of providers) {
    for (const m of p.models) {
      out.push({
        id: formatModelRef('custom', `${p.id}/${m.id}`),
        label: `${p.name} · ${m.label || m.id}`,
        group: 'cloud',
      });
    }
  }
  return out;
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
 * @param listLocal Ollama / disk discovery
 * @param customProviders Saved cloud/custom brains
 */
export async function loadUnifiedModelCatalog(
  listLocal?: () => Promise<ModelEntry[]>,
  customProviders: CustomProvider[] = [],
): Promise<UnifiedModelCatalog> {
  const list = listLocal ?? listOllamaModels;
  let installed: ModelEntry[] = [];
  try {
    installed = await list();
  } catch {
    installed = [];
  }
  const local = localModelsFromEntries(installed);
  const cloud = cloudModelsFromProviders(customProviders);
  const codex = codexModelsFromDefaults();
  const normalized = normalizeGatewayCatalog({
    local: installed,
    custom: customProviders,
    builtin: DEFAULT_MODELS.map((m) => ({ id: m.id, displayName: m.label })),
  });
  return {
    local,
    cloud,
    codex,
    all: [...local, ...cloud, ...codex],
    normalized,
  };
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
    models: [
      ...catalog.codex.map(({ id, label, hint }) => ({ id, label, hint })),
      ...(catalog.cloud ?? []).map(({ id, label, hint }) => ({
        id,
        label,
        hint,
      })),
    ],
  };
}
