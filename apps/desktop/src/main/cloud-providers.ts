/**
 * Cloud provider settings helpers — normalize partial loads/saves.
 */

export type CloudProviderId = 'openai' | 'deepseek' | 'openrouter' | 'anthropic';

export interface CloudProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
}

export type CloudProvidersSettings = Record<CloudProviderId, CloudProviderConfig>;

/** Alias used by some call sites */
export type CloudProviderSettings = CloudProvidersSettings;

export const DEFAULT_CLOUD_BASE_URLS: Record<CloudProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com',
};

export const CLOUD_PROVIDER_IDS: CloudProviderId[] = [
  'openai',
  'deepseek',
  'openrouter',
  'anthropic',
];

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function normalizeOne(
  id: CloudProviderId,
  partial: unknown,
): CloudProviderConfig {
  const r = asRecord(partial);
  const baseUrlDefault = DEFAULT_CLOUD_BASE_URLS[id];
  return {
    enabled: r?.enabled === true,
    apiKey: typeof r?.apiKey === 'string' ? r.apiKey : '',
    baseUrl:
      typeof r?.baseUrl === 'string' && r.baseUrl.trim()
        ? r.baseUrl.trim()
        : baseUrlDefault,
  };
}

/** Fill missing providers / fields with defaults. Never throws. */
export function normalizeCloudProviders(
  partial: unknown,
): CloudProvidersSettings {
  const r = asRecord(partial) ?? {};
  const out = {} as CloudProvidersSettings;
  for (const id of CLOUD_PROVIDER_IDS) {
    out[id] = normalizeOne(id, r[id]);
  }
  return out;
}

export function emptyCloudProviders(): CloudProvidersSettings {
  return normalizeCloudProviders(null);
}
