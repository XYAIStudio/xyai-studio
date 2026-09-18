/** modelRef — session-bound unified model id (codex:… / ollama:… / custom:…) */

export type ModelRefKind = 'codex' | 'ollama' | 'custom';

export interface ParsedModelRef {
  kind: ModelRefKind;
  /** Bare id without provider prefix. For custom: `<providerId>/<modelId>`. */
  id: string;
  /** Canonical full ref, e.g. codex:gpt-5 or custom:prov/model */
  ref: string;
}

const KIND_RE = /^(codex|ollama|custom):(.+)$/i;

/**
 * Format a canonical modelRef from kind + bare id.
 * Strips an accidental existing prefix on `id`.
 */
export function formatModelRef(kind: ModelRefKind, id: string): string {
  const bare = id.trim().replace(/^(codex|ollama|custom):/i, '').trim();
  if (!bare) {
    throw new Error(`formatModelRef: empty id for kind=${kind}`);
  }
  return `${kind}:${bare}`;
}

/**
 * Parse a modelRef string.
 * Legacy bare modelId (no prefix) normalizes to `codex:<id>`.
 * Returns null for empty / whitespace-only input.
 */
export function parseModelRef(raw: string): ParsedModelRef | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const m = KIND_RE.exec(s);
  if (m) {
    const kind = m[1]!.toLowerCase() as ModelRefKind;
    const id = m[2]!.trim();
    if (!id) return null;
    if (kind === 'custom' && !id.includes('/')) return null;
    return { kind, id, ref: `${kind}:${id}` };
  }

  // Legacy bare modelId → codex
  return { kind: 'codex', id: s, ref: `codex:${s}` };
}

/** Always returns a canonical modelRef; empty → codex:gpt-5 */
export function normalizeModelRef(raw: string, fallback = 'codex:gpt-5'): string {
  const parsed = parseModelRef(raw);
  return parsed?.ref ?? fallback;
}

export function isOllamaModelRef(raw: string): boolean {
  return parseModelRef(raw)?.kind === 'ollama';
}

export function isCodexModelRef(raw: string): boolean {
  const p = parseModelRef(raw);
  return p?.kind === 'codex';
}

export function isCustomModelRef(raw: string): boolean {
  return parseModelRef(raw)?.kind === 'custom';
}

/** Bare Codex model id for adapter-codex (-m). Non-codex refs return bare id anyway. */
export function toCodexModelId(raw: string): string {
  const p = parseModelRef(raw);
  if (!p) return 'gpt-5';
  // custom refs should not be passed to Codex adapter; return last path segment
  if (p.kind === 'custom') {
    const slash = p.id.lastIndexOf('/');
    return slash >= 0 ? p.id.slice(slash + 1) : p.id;
  }
  return p.id;
}

/** Ollama model name, or null if not an ollama: ref */
export function toOllamaModelName(raw: string): string | null {
  const p = parseModelRef(raw);
  if (!p || p.kind !== 'ollama') return null;
  return p.id;
}

/** Parse custom:<providerId>/<modelId>; null if not custom. */
export function parseCustomModelRef(
  raw: string,
): { providerId: string; modelId: string; ref: string } | null {
  const p = parseModelRef(raw);
  if (!p || p.kind !== 'custom') return null;
  const slash = p.id.indexOf('/');
  if (slash <= 0 || slash === p.id.length - 1) return null;
  const providerId = p.id.slice(0, slash);
  const modelId = p.id.slice(slash + 1);
  if (!providerId || !modelId) return null;
  return { providerId, modelId, ref: p.ref };
}

export function formatCustomModelRef(providerId: string, modelId: string): string {
  const p = providerId.trim();
  const m = modelId.trim();
  if (!p || !m) throw new Error('formatCustomModelRef: empty providerId or modelId');
  return formatModelRef('custom', `${p}/${m}`);
}
