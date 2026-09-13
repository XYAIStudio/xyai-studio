/** Model-hub values shared by the Host schema and Client editor (phase 1). */
export interface ModelHub {
  /** Model-selection strategy hint consumed by the composer model seat. */
  preference: string
  /** Newline-separated catalog lines: `name|provider|endpoint` (endpoint empty for cloud). */
  catalog: string
}
/** Accepted selection-strategy keys, in display order. */
export const MODEL_PREFERENCES = ['local-first', 'balanced', 'cloud'] as const
/** Default hub values until Host settings arrive. */
export const defaultModelHub: ModelHub = {
  preference: 'local-first',
  catalog: '本地 · qwen2.5-32b|local-gguf|\n云端 · DeepSeek-V4|cloud|',
}
/** Model-hub fields in save/reset order. */
export const MODEL_HUB_FIELDS = ['preference', 'catalog'] as const
/** Longest accepted catalog text. */
export const MAX_CATALOG_LENGTH = 2000

/** One parsed catalog row; malformed rows are dropped by the renderer. */
export interface CatalogEntry {
  name: string
  provider: string
  endpoint: string
}

/** Split a catalog text into rows, tolerating blank and malformed lines. */
export function catalogEntries(catalog: string): CatalogEntry[] {
  return catalog.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line) => {
    const [name = '', provider = '', endpoint = ''] = line.split('|').map(part => part.trim())
    return { name, provider, endpoint }
  }).filter(entry => entry.name !== '' && entry.provider !== '')
}
