/**
 * Honest local-model picker labels.
 * Prefer Ollama `details.family` + size; never invent product brands.
 * Shared digest → same family title + 同权重 note (mis-tagged aliases).
 */

import type { ModelEntry } from '@xyai/contracts';
import {
  digestsMatch,
  ollamaTagFromEntry,
  shortDigest,
} from './ollama-discover.js';

export type LocalPickerPresentation = {
  id: string;
  label: string;
  hint: string;
};

export function formatSizeToken(raw: string): string | null {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)([bBmM])$/);
  return m ? `${m[1]}${m[2].toUpperCase()}` : null;
}

export function formatFamilyLabel(
  family: string,
  size?: string,
): string {
  const fam = family.trim();
  if (!fam) return '';
  const pretty = fam.charAt(0).toUpperCase() + fam.slice(1);
  if (!size || size === 'local' || size === 'projector') return pretty;
  const sized = formatSizeToken(size) || size;
  return `${pretty} ${sized}`;
}

/** Humanize `family:size` tags only. Leave other tags as the ollama name. */
export function formatOllamaTagLabel(tag: string): string {
  const name = tag.replace(/^ollama:/i, '').replace(/:latest$/i, '');
  const colon = name.lastIndexOf(':');
  if (colon > 0) {
    const left = name.slice(0, colon);
    const right = name.slice(colon + 1);
    const size = formatSizeToken(right);
    if (size && left) {
      return `${left.charAt(0).toUpperCase()}${left.slice(1)} ${size}`;
    }
  }
  return name;
}

export function aliasTagsFor(
  entry: ModelEntry,
  all: ModelEntry[],
): string[] {
  if (!entry.digest) return [];
  const self = ollamaTagFromEntry(entry);
  const seen = new Set<string>();
  const others: string[] = [];
  for (const o of all) {
    if (o.id === entry.id || !digestsMatch(entry.digest, o.digest)) continue;
    const tag = ollamaTagFromEntry(o);
    const key = tag.replace(/:latest$/i, '').toLowerCase();
    if (key === self.replace(/:latest$/i, '').toLowerCase() || seen.has(key)) {
      continue;
    }
    seen.add(key);
    others.push(tag);
  }
  return others;
}

function shortTag(tag: string): string {
  return tag.replace(/:latest$/i, '');
}

/**
 * Title = family+size when Ollama reported a family; else formatted tag.
 * Shared digest without family uses the short digest as the shared identity.
 * Subtitle is the ollama tag, plus 同权重 siblings when aliases share a blob.
 */
export function presentLocalPickerItem(
  entry: ModelEntry,
  all: ModelEntry[],
): LocalPickerPresentation {
  const tag = ollamaTagFromEntry(entry);
  const aliases = aliasTagsFor(entry, all);
  const familyLabel = entry.family
    ? formatFamilyLabel(entry.family, entry.version)
    : '';
  let base: string;
  if (familyLabel) {
    base = familyLabel;
  } else if (aliases.length && entry.digest) {
    base = `同权重 ${shortDigest(entry.digest)}`;
  } else {
    base = formatOllamaTagLabel(tag);
  }
  const label = aliases.length ? `${base}（${shortTag(tag)}）` : base;
  const hint = aliases.length
    ? `与 ${aliases.map(shortTag).join('、')} 同权重`
    : tag;
  return { id: entry.id, label, hint };
}

export function presentLocalPickerItems(
  entries: ModelEntry[],
): LocalPickerPresentation[] {
  return entries.map((e) => presentLocalPickerItem(e, entries));
}
