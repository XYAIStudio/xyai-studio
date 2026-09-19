/**
 * Normalize local Ollama + cloud/custom + builtin Codex into one catalog list.
 */

import {
  formatCustomModelRef,
  formatModelRef,
  normalizeModelRef,
  type CatalogProtocol,
  type NormalizedModelEntry,
} from '@xyai/contracts';

export interface CatalogLocalInput {
  id?: string;
  displayName: string;
  installed?: boolean;
  role?: string;
  source?: string;
}

export interface CatalogCustomModelInput {
  id: string;
  label?: string;
}

export interface CatalogCustomProviderInput {
  id: string;
  name: string;
  protocol: string;
  models: CatalogCustomModelInput[];
}

export interface CatalogBuiltinInput {
  id: string;
  displayName: string;
}

export interface NormalizeGatewayCatalogInput {
  local?: CatalogLocalInput[];
  custom?: CatalogCustomProviderInput[];
  builtin?: CatalogBuiltinInput[];
}

/**
 * Map a saved custom-provider protocol onto the catalog protocol union.
 * Unknown values become Chat Completions (DeepSeek / OpenAI-compat default).
 * @param protocol Raw protocol string from settings / preset
 */
export function mapCatalogProtocol(protocol: string): CatalogProtocol {
  if (
    protocol === 'openai-responses' ||
    protocol === 'anthropic-messages' ||
    protocol === 'ollama' ||
    protocol === 'codex' ||
    protocol === 'chat-completions'
  ) {
    return protocol;
  }
  return 'chat-completions';
}

function isLocalChatRow(row: CatalogLocalInput): boolean {
  if (row.role === 'embedding') return false;
  const name = `${row.displayName} ${row.id ?? ''}`;
  if (/mmproj|mm-proj|projector/i.test(name)) return false;
  if (row.installed !== true) return false;
  return true;
}

function localRef(row: CatalogLocalInput): string {
  const id = (row.id || '').trim();
  if (id.toLowerCase().startsWith('ollama:')) return id;
  return formatModelRef('ollama', row.displayName);
}

/**
 * One normalized list: local Ollama tags, cloud/custom models, builtin Codex.
 * Drops embeddings, projector blobs, and tags that are not live-installed.
 * @param input Discoverable local rows + saved custom providers + builtin ids
 * @returns Deduped catalog rows (id = modelRef)
 */
export function normalizeGatewayCatalog(
  input: NormalizeGatewayCatalogInput,
): NormalizedModelEntry[] {
  const out: NormalizedModelEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: NormalizedModelEntry): void => {
    if (!entry.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    out.push(entry);
  };

  for (const row of input.local ?? []) {
    if (!isLocalChatRow(row)) continue;
    push({
      id: localRef(row),
      displayName: row.displayName,
      source: 'local',
      protocol: 'ollama',
    });
  }

  for (const provider of input.custom ?? []) {
    const protocol = mapCatalogProtocol(provider.protocol);
    for (const model of provider.models ?? []) {
      const modelId = (model.id || '').trim();
      if (!modelId) continue;
      push({
        id: formatCustomModelRef(provider.id, modelId),
        displayName: (model.label || modelId).trim() || modelId,
        source: 'cloud',
        protocol,
      });
    }
  }

  for (const row of input.builtin ?? []) {
    const id = normalizeModelRef(row.id);
    push({
      id,
      displayName: row.displayName,
      source: 'cloud',
      protocol: 'codex',
    });
  }

  return out;
}

/**
 * @param catalog Normalized list
 * @param modelRef Session-bound model id
 * @returns Matching row, or undefined
 */
export function findCatalogEntry(
  catalog: NormalizedModelEntry[],
  modelRef: string,
): NormalizedModelEntry | undefined {
  const ref = normalizeModelRef(modelRef);
  return catalog.find((row) => row.id === ref);
}
