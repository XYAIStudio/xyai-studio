/**
 * Capability / engine mode persisted in Studio settings.
 * User-facing labels are Chinese capability language; values stay internal.
 */

export const ENGINE_MODES = [
  'auto',
  'local-stream',
  'codex-oss',
  'dsh',
  'claude',
] as const;

export type EngineMode = (typeof ENGINE_MODES)[number];

export function isEngineMode(v: unknown): v is EngineMode {
  return typeof v === 'string' && (ENGINE_MODES as readonly string[]).includes(v);
}

/**
 * Resolve engineMode from a settings record.
 * Legacy `localModelViaHarness` maps only when engineMode is absent:
 * true → codex-oss, false → local-stream. Neither key → auto.
 */
export function normalizeEngineMode(partial: {
  engineMode?: unknown;
  localModelViaHarness?: unknown;
  hasLocalModelViaHarness?: boolean;
}): EngineMode {
  if (isEngineMode(partial.engineMode)) return partial.engineMode;
  if (partial.hasLocalModelViaHarness) {
    return partial.localModelViaHarness === true ? 'codex-oss' : 'local-stream';
  }
  return 'auto';
}

/** Derived flag for older readers / turn-route. Only explicit OSS mode is true. */
export function localModelViaHarnessFromEngineMode(mode: EngineMode): boolean {
  return mode === 'codex-oss';
}
