/**
 * Persist XYAI Studio settings under Electron userData.
 * Do NOT import/require electron here — packaged CJS has empty import.meta.url,
 * and main.ts already calls setSettingsUserDataDir(app.getPath('userData')).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  normalizeAccessMode,
  normalizeModelRef,
  type AccessMode,
} from '@xyai/contracts';
import {
  emptyCloudProviders,
  normalizeCloudProviders,
  type CloudProvidersSettings,
} from './cloud-providers.js';
import {
  normalizeCustomProviders,
  type CustomProvider,
} from './custom-providers.js';
import {
  localModelViaHarnessFromEngineMode,
  normalizeEngineMode,
  type EngineMode,
} from './engine-mode.js';

export type { EngineMode } from './engine-mode.js';

export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
}

/** Codex engine models; ids are canonical modelRefs (codex:…). */
export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'codex:gpt-5', label: 'GPT-5 (Codex)' },
  { id: 'codex:gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'codex:o4-mini', label: 'o4-mini' },
  { id: 'codex:gpt-4.1', label: 'GPT-4.1' },
  { id: 'codex:gpt-4o', label: 'GPT-4o' },
];

export type { AccessMode };

export interface XyaiSettings {
  /**
   * Session model selection. Phase A: holds a modelRef string
   * (`codex:<id>` / `ollama:<name>`). Legacy bare ids are normalized on load.
   */
  modelId: string;
  forceMock: boolean;
  codexBin: string;
  cloudProviders: CloudProvidersSettings;
  /** User-defined OpenAI-compatible (and related) providers. */
  customProviders: CustomProvider[];
  /** Tool / agent permission mode for composer 「使用权限」. */
  accessMode: AccessMode;
  /**
   * Capability/engine selector. Default `auto`: ollama:* is true local stream;
   * harness is an optional enhancement. Legacy `localModelViaHarness` maps onto this.
   */
  engineMode: EngineMode;
  /**
   * Derived: true only when engineMode is `codex-oss`.
   * Kept so older readers still see a boolean.
   */
  localModelViaHarness: boolean;
}

let overrideUserData: string | null = null;

export function setSettingsUserDataDir(dir: string): void {
  overrideUserData = dir;
}

export function defaultSettings(): XyaiSettings {
  return {
    modelId: DEFAULT_MODELS[0]!.id,
    forceMock: false,
    codexBin: '',
    cloudProviders: emptyCloudProviders(),
    customProviders: [],
    accessMode: 'default',
    engineMode: 'auto',
    localModelViaHarness: false,
  };
}

function settingsPath(): string {
  const base = overrideUserData || process.cwd();
  return path.join(base, 'xyai-settings.json');
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function normalizeSettings(partial: unknown): XyaiSettings {
  const base = defaultSettings();
  const r = asRecord(partial);
  if (!r) return base;
  const rawModel =
    typeof r.modelId === 'string' && r.modelId.trim()
      ? r.modelId.trim()
      : base.modelId;
  const engineMode = normalizeEngineMode({
    engineMode: r.engineMode,
    localModelViaHarness: r.localModelViaHarness,
    hasLocalModelViaHarness: Object.prototype.hasOwnProperty.call(
      r,
      'localModelViaHarness',
    ),
  });
  return {
    modelId: normalizeModelRef(rawModel),
    forceMock: r.forceMock === true,
    codexBin: typeof r.codexBin === 'string' ? r.codexBin : '',
    cloudProviders: normalizeCloudProviders(r.cloudProviders),
    customProviders: normalizeCustomProviders(r.customProviders),
    accessMode: normalizeAccessMode(r.accessMode),
    engineMode,
    localModelViaHarness: localModelViaHarnessFromEngineMode(engineMode),
  };
}

export function loadSettings(): XyaiSettings {
  const file = settingsPath();
  if (!existsSync(file)) return defaultSettings();
  try {
    const raw = readFileSync(file, 'utf8');
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return defaultSettings();
  }
}

function omitUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function saveSettings(partial: Partial<XyaiSettings>): XyaiSettings {
  const current = loadSettings();
  const patch = omitUndefined(partial as Record<string, unknown>);
  const next = normalizeSettings({
    ...current,
    ...patch,
    cloudProviders:
      partial.cloudProviders !== undefined
        ? normalizeCloudProviders({
            ...current.cloudProviders,
            ...partial.cloudProviders,
          })
        : current.cloudProviders,
    customProviders:
      partial.customProviders !== undefined
        ? normalizeCustomProviders(partial.customProviders)
        : current.customProviders,
  });
  const file = settingsPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export function getSettingsFilePath(): string {
  return settingsPath();
}
