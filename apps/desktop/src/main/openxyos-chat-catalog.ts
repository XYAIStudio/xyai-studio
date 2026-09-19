/**
 * Chat models Studio can offer to OpenXYOS 单聊/群聊:
 * local = live registered Ollama tags (可挂接), cloud = providers with an API key.
 */

import { formatModelRef } from '@xyai/contracts';
import { listOllamaModels } from '@xyai/model-hub';
import {
  CLOUD_PROVIDER_IDS,
  type CloudProviderId,
  type CloudProvidersSettings,
} from './cloud-providers.js';
import {
  isPickerLocalEntry,
  localModelsFromEntries,
} from './model-catalog-facade.js';
import { loadSettings } from './settings.js';
import type { CustomProvider } from './custom-providers.js';

export type OpenXyosChatModel = {
  id: string;
  label: string;
  kind: 'local' | 'cloud';
  hint?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: 'chat-completions' | 'anthropic-messages';
};

const CLOUD_MODELS: Record<
  CloudProviderId,
  { model: string; label: string; protocol: OpenXyosChatModel['protocol'] }[]
> = {
  openai: [
    { model: 'gpt-4o', label: 'GPT-4o', protocol: 'chat-completions' },
    { model: 'gpt-4.1', label: 'GPT-4.1', protocol: 'chat-completions' },
  ],
  deepseek: [
    { model: 'deepseek-chat', label: 'DeepSeek Chat', protocol: 'chat-completions' },
    { model: 'deepseek-reasoner', label: 'DeepSeek Reasoner', protocol: 'chat-completions' },
  ],
  openrouter: [
    { model: 'openrouter/auto', label: 'Auto Router', protocol: 'chat-completions' },
  ],
  anthropic: [
    { model: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', protocol: 'anthropic-messages' },
  ],
};

const OLLAMA_V1 = 'http://127.0.0.1:11434/v1';

function cloudModels(
  providers: CloudProvidersSettings,
): OpenXyosChatModel[] {
  const out: OpenXyosChatModel[] = [];
  for (const id of CLOUD_PROVIDER_IDS) {
    const cfg = providers[id];
    const key = (cfg?.apiKey || '').trim();
    if (!key) continue;
    const base = (cfg.baseUrl || '').replace(/\/+$/, '');
    if (!base) continue;
    for (const m of CLOUD_MODELS[id]) {
      out.push({
        id: `${id}:${m.model}`,
        label: `${id === 'openai' ? 'OpenAI' : id === 'deepseek' ? 'DeepSeek' : id === 'openrouter' ? 'OpenRouter' : 'Anthropic'} · ${m.label}`,
        kind: 'cloud',
        hint: '已配置 API key',
        baseUrl: base,
        apiKey: key,
        model: m.model,
        protocol: m.protocol,
      });
    }
  }
  return out;
}

function customModels(providers: CustomProvider[]): OpenXyosChatModel[] {
  const out: OpenXyosChatModel[] = [];
  for (const p of providers) {
    if (p.auth === 'apiKey' && !(p.apiKey || '').trim()) continue;
    if (p.auth === 'oauth') continue;
    const key = (p.apiKey || '').trim() || (p.auth === 'none' ? 'none' : '');
    if (!key || !p.baseUrl.trim()) continue;
    const protocol =
      p.protocol === 'anthropic-messages' ? 'anthropic-messages' : 'chat-completions';
    for (const m of p.models || []) {
      if (!m.id?.trim()) continue;
      out.push({
        id: `custom:${p.id}/${m.id}`,
        label: `${p.name} · ${m.label || m.id}`,
        kind: 'cloud',
        hint: '自定义供应商',
        baseUrl: p.baseUrl.replace(/\/+$/, ''),
        apiKey: key,
        model: m.id,
        protocol,
      });
    }
  }
  return out;
}

export async function buildOpenXyosChatCatalog(): Promise<OpenXyosChatModel[]> {
  const settings = loadSettings();
  let local: OpenXyosChatModel[] = [];
  try {
    const entries = (await listOllamaModels()).filter(isPickerLocalEntry);
    local = localModelsFromEntries(entries).map((item) => {
      const tag = item.id.startsWith('ollama:')
        ? item.id.slice('ollama:'.length)
        : item.id;
      return {
        id: item.id.startsWith('ollama:') ? item.id : formatModelRef('ollama', tag),
        label: item.label,
        kind: 'local' as const,
        hint: item.hint || (settings.modelId === item.id ? '已挂接' : '已注册'),
        baseUrl: OLLAMA_V1,
        apiKey: 'ollama',
        model: tag,
        protocol: 'chat-completions' as const,
      };
    });
  } catch {
    local = [];
  }
  return [...local, ...cloudModels(settings.cloudProviders), ...customModels(settings.customProviders)];
}
