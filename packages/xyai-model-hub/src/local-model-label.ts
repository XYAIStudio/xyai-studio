/**
 * Honest local-model picker labels.
 * Prefer `ollama show` architecture, then tags family; never invent brands.
 * Shared digest → one identity; a mismatched tag is marked 别名, not the title.
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

/** Compact key so qwen2.5vl / qwen25vl / qwen2.5-vl compare equal. */
export function normalizeArchKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Format an Ollama architecture/family token.
 * `qwen25vl` → `Qwen2.5-VL`. Does not map to product names like 通义千问.
 */
export function formatArchToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const compact = normalizeArchKey(s);
  if (compact === 'qwen25vl') return 'Qwen2.5-VL';
  if (compact === 'qwen25') return 'Qwen2.5';
  const qwenVl = s.match(/^qwen(.+?)[-_]?vl$/i);
  if (qwenVl?.[1]) return `${formatArchToken(`qwen${qwenVl[1]}`)}-VL`;
  const qwen = s.match(/^qwen(\d+(?:\.\d+)?)$/i);
  if (qwen) return `Qwen${qwen[1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatFamilyLabel(
  family: string,
  size?: string,
): string {
  const pretty = formatArchToken(family);
  if (!pretty) return '';
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
      return `${formatArchToken(left)} ${size}`;
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

function looksLikeFamilySizeTag(tag: string): boolean {
  const name = tag.replace(/^ollama:/i, '').replace(/:latest$/i, '');
  const colon = name.lastIndexOf(':');
  if (colon <= 0) return false;
  return Boolean(formatSizeToken(name.slice(colon + 1)));
}

function tagAgreesWithIdentity(tag: string, keys: string[]): boolean {
  const stem = tag
    .replace(/^ollama:/i, '')
    .replace(/:latest$/i, '')
    .split(':')[0]!;
  const stemKey = normalizeArchKey(stem);
  if (!stemKey) return false;
  return keys.some((k) => {
    const id = normalizeArchKey(k);
    if (!id) return false;
    return stemKey === id || stemKey.startsWith(id) || id.startsWith(stemKey);
  });
}

function identityKeys(entry: ModelEntry, familyLikeTag?: string): string[] {
  const keys = [entry.architecture, entry.family]
    .filter((s): s is string => Boolean(s && s.trim()));
  if (familyLikeTag) {
    keys.push(
      familyLikeTag
        .replace(/^ollama:/i, '')
        .replace(/:latest$/i, '')
        .split(':')[0]!,
    );
  }
  return keys;
}

function familyLikeTagInGroup(entry: ModelEntry, all: ModelEntry[]): string | undefined {
  const tags = [
    ollamaTagFromEntry(entry),
    ...aliasTagsFor(entry, all),
  ];
  return tags.find((t) => looksLikeFamilySizeTag(t));
}

/**
 * Honest title for a row: architecture/family, or a family:size sibling tag.
 * Never uses a mismatched alias (e.g. deepseek-*) as the identity.
 */
export function identityLabelFor(entry: ModelEntry, all: ModelEntry[]): string {
  const familyLike = familyLikeTagInGroup(entry, all);
  if (entry.architecture) {
    return formatFamilyLabel(entry.architecture, entry.version);
  }
  if (entry.family) {
    return formatFamilyLabel(entry.family, entry.version);
  }
  const aliases = aliasTagsFor(entry, all);
  if (aliases.length && familyLike) {
    return formatOllamaTagLabel(familyLike);
  }
  if (aliases.length && entry.digest) {
    return `同权重 ${shortDigest(entry.digest)}`;
  }
  return formatOllamaTagLabel(ollamaTagFromEntry(entry));
}

/**
 * Title is the shared honest identity. A tag that does not match
 * architecture/family is only mentioned in the subtitle as 别名.
 */
export function presentLocalPickerItem(
  entry: ModelEntry,
  all: ModelEntry[],
): LocalPickerPresentation {
  const tag = ollamaTagFromEntry(entry);
  const aliases = aliasTagsFor(entry, all);
  const familyLike = familyLikeTagInGroup(entry, all);
  const label = identityLabelFor(entry, all);
  const agrees = tagAgreesWithIdentity(tag, identityKeys(entry, familyLike));
  let hint: string;
  if (aliases.length && !agrees) {
    hint = `别名 ${shortTag(tag)} · 与 ${aliases.map(shortTag).join('、')} 同权重`;
  } else if (aliases.length) {
    hint = `${tag} · 另有别名 ${aliases.map(shortTag).join('、')}`;
  } else {
    hint = tag;
  }
  return { id: entry.id, label, hint };
}

export function presentLocalPickerItems(
  entries: ModelEntry[],
): LocalPickerPresentation[] {
  return entries.map((e) => presentLocalPickerItem(e, entries));
}
