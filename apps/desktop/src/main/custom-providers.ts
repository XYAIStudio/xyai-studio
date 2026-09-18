/**
 * Custom LLM providers — normalize / modelRef helpers.
 * UI mirrors open-source desktop Agent「添加自定义供应商」flow (XYAI branding).
 */

export type CustomProviderRuntime = 'codex' | 'claude-code' | 'pi';
export type CustomProviderAuth = 'apiKey' | 'oauth' | 'none';
export type CustomProviderProtocol =
  | 'openai-responses'
  | 'chat-completions'
  | 'anthropic-messages';

export interface CustomProviderHeader {
  name: string;
  value: string;
}

export interface CustomProviderModel {
  id: string;
  label: string;
  contextTokens?: number;
}

export interface CustomProvider {
  id: string;
  name: string;
  runtime: CustomProviderRuntime;
  auth: CustomProviderAuth;
  protocol: CustomProviderProtocol;
  baseUrl: string;
  requestPath?: string;
  apiKey?: string;
  headers?: CustomProviderHeader[];
  models: CustomProviderModel[];
}

export type CustomProviderPresetId =
  | 'deepseek'
  | 'dashscope'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'custom';

export interface CustomProviderPreset {
  id: CustomProviderPresetId;
  name: string;
  baseUrl: string;
  protocol: CustomProviderProtocol;
  auth: CustomProviderAuth;
  runtime: CustomProviderRuntime;
  /** Optional starter model rows */
  models?: CustomProviderModel[];
  requestPath?: string;
}

export const CUSTOM_PROVIDER_PRESETS: CustomProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', contextTokens: 65536 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextTokens: 65536 },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [{ id: 'qwen-plus', label: 'Qwen Plus', contextTokens: 131072 }],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-responses',
    auth: 'apiKey',
    runtime: 'codex',
    models: [{ id: 'gpt-4o', label: 'GPT-4o', contextTokens: 128000 }],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic-messages',
    auth: 'apiKey',
    runtime: 'claude-code',
    models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', contextTokens: 200000 }],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'chat-completions',
    auth: 'none',
    runtime: 'codex',
    models: [],
  },
  {
    id: 'custom',
    name: '自定义端点',
    baseUrl: '',
    protocol: 'chat-completions',
    auth: 'apiKey',
    runtime: 'codex',
    models: [],
  },
];

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function newId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRuntime(v: unknown): CustomProviderRuntime {
  if (v === 'codex' || v === 'claude-code' || v === 'pi') return v;
  return 'codex';
}

function normalizeAuth(v: unknown): CustomProviderAuth {
  if (v === 'apiKey' || v === 'oauth' || v === 'none') return v;
  return 'apiKey';
}

function normalizeProtocol(v: unknown): CustomProviderProtocol {
  if (
    v === 'openai-responses' ||
    v === 'chat-completions' ||
    v === 'anthropic-messages'
  ) {
    return v;
  }
  return 'chat-completions';
}

function normalizeHeaders(v: unknown): CustomProviderHeader[] {
  if (!Array.isArray(v)) return [];
  const out: CustomProviderHeader[] = [];
  for (const row of v) {
    const r = asRecord(row);
    if (!r) continue;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const value = typeof r.value === 'string' ? r.value : '';
    if (!name) continue;
    out.push({ name, value });
  }
  return out;
}

function normalizeModels(v: unknown): CustomProviderModel[] {
  if (!Array.isArray(v)) return [];
  const out: CustomProviderModel[] = [];
  for (const row of v) {
    const r = asRecord(row);
    if (!r) continue;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id) continue;
    const label =
      typeof r.label === 'string' && r.label.trim() ? r.label.trim() : id;
    const contextTokens =
      typeof r.contextTokens === 'number' &&
      Number.isFinite(r.contextTokens) &&
      r.contextTokens > 0
        ? Math.floor(r.contextTokens)
        : undefined;
    out.push({ id, label, ...(contextTokens !== undefined ? { contextTokens } : {}) });
  }
  return out;
}

export function normalizeCustomProvider(partial: unknown): CustomProvider | null {
  const r = asRecord(partial);
  if (!r) return null;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : newId();
  const baseUrl = typeof r.baseUrl === 'string' ? r.baseUrl.trim() : '';
  const requestPath =
    typeof r.requestPath === 'string' && r.requestPath.trim()
      ? r.requestPath.trim()
      : undefined;
  const apiKey = typeof r.apiKey === 'string' ? r.apiKey : '';
  const auth = normalizeAuth(r.auth);
  return {
    id,
    name,
    runtime: normalizeRuntime(r.runtime),
    auth,
    protocol: normalizeProtocol(r.protocol),
    baseUrl,
    ...(requestPath ? { requestPath } : {}),
    ...(apiKey ? { apiKey } : {}),
    headers: normalizeHeaders(r.headers),
    models: normalizeModels(r.models),
  };
}

export function normalizeCustomProviders(partial: unknown): CustomProvider[] {
  if (!Array.isArray(partial)) return [];
  const out: CustomProvider[] = [];
  const seen = new Set<string>();
  for (const row of partial) {
    const p = normalizeCustomProvider(row);
    if (!p) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function customModelRef(providerId: string, modelId: string): string {
  return `custom:${providerId.trim()}/${modelId.trim()}`;
}

export function parseCustomModelRef(
  modelRef: string,
): { providerId: string; modelId: string } | null {
  const raw = String(modelRef || '').trim();
  if (!raw.toLowerCase().startsWith('custom:')) return null;
  const rest = raw.slice('custom:'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  return {
    providerId: rest.slice(0, slash),
    modelId: rest.slice(slash + 1),
  };
}

export function findCustomProvider(
  providers: CustomProvider[],
  providerId: string,
): CustomProvider | undefined {
  return providers.find((p) => p.id === providerId);
}

export function customModelsForStatus(
  providers: CustomProvider[],
): { id: string; label: string; group: string }[] {
  const out: { id: string; label: string; group: string }[] = [];
  for (const p of providers) {
    for (const m of p.models) {
      out.push({
        id: customModelRef(p.id, m.id),
        label: m.label || m.id,
        group: p.name,
      });
    }
  }
  return out;
}

/** Missing API key for a custom modelRef when auth=apiKey. */
export function missingCustomApiKey(
  modelRef: string,
  providers: CustomProvider[],
): string | null {
  const parsed = parseCustomModelRef(modelRef);
  if (!parsed) return null;
  const p = findCustomProvider(providers, parsed.providerId);
  if (!p) return '自定义供应商';
  if (p.auth === 'none') return null;
  if (p.auth === 'oauth') return `${p.name}（OAuth 尚未就绪）`;
  if (!(p.apiKey || '').trim()) return p.name;
  return null;
}
