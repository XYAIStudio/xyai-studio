/**
 * Gate cloud / custom modelRefs that require a non-empty API key.
 * Ollama / plain Codex (incl. mock) never trip this gate.
 */

import {
  CLOUD_PROVIDER_IDS,
  type CloudProviderId,
  type CloudProvidersSettings,
} from './cloud-providers.js';
import {
  missingCustomApiKey,
  type CustomProvider,
} from './custom-providers.js';

export function missingCloudApiKeyForModelRef(
  modelRef: string,
  cloud: CloudProvidersSettings,
  customProviders: CustomProvider[] = [],
): string | null {
  const raw = String(modelRef || '').trim();
  const lower = raw.toLowerCase();
  if (!lower || lower.startsWith('ollama:')) return null;

  if (lower.startsWith('custom:')) {
    return missingCustomApiKey(raw, customProviders);
  }

  for (const id of CLOUD_PROVIDER_IDS) {
    const hit =
      lower === id ||
      lower.startsWith(`${id}:`) ||
      lower.startsWith(`codex:${id}:`);
    if (!hit) continue;
    const key = (cloud[id]?.apiKey || '').trim();
    if (!key) return id;
    return null;
  }
  return null;
}

/** @deprecated alias — prefer missingCloudApiKeyForModelRef */
export function missingCloudApiKeyForModelRefLegacy(
  modelRef: string,
  cloud: CloudProvidersSettings,
): CloudProviderId | null {
  const r = missingCloudApiKeyForModelRef(modelRef, cloud, []);
  if (!r) return null;
  if ((CLOUD_PROVIDER_IDS as string[]).includes(r)) return r as CloudProviderId;
  return null;
}
