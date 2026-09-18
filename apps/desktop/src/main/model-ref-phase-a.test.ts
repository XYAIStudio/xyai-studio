/**
 * Phase A smoke: modelRef parse + catalog facade without Electron.
 */
import { describe, expect, it } from 'vitest';
import {
  formatModelRef,
  normalizeModelRef,
  parseModelRef,
  toCodexModelId,
  toOllamaModelName,
  type ModelEntry,
} from '@xyai/contracts';
import {
  codexModelsFromDefaults,
  loadUnifiedModelCatalog,
  localModelsFromEntries,
  toStatusModelLists,
} from './model-catalog-facade.js';
import { resolveTurnRoute } from './turn-controller.js';
import { DEFAULT_MODELS, normalizeSettings } from './settings.js';

describe('Phase A modelRef', () => {
  it('parses / formats / normalizes', () => {
    expect(parseModelRef('codex:gpt-5')?.ref).toBe('codex:gpt-5');
    expect(parseModelRef('ollama:qwen2.5:7b')?.id).toBe('qwen2.5:7b');
    expect(normalizeModelRef('gpt-5')).toBe('codex:gpt-5');
    expect(formatModelRef('ollama', 'llama3')).toBe('ollama:llama3');
    expect(toCodexModelId('codex:o4-mini')).toBe('o4-mini');
    expect(toOllamaModelName('ollama:phi')).toBe('phi');
  });

  it('normalizeSettings upgrades legacy bare modelId', () => {
    const s = normalizeSettings({ modelId: 'gpt-5' });
    expect(s.modelId).toBe('codex:gpt-5');
  });
});

describe('Phase A model-catalog-facade', () => {
  it('builds codex group from DEFAULT_MODELS', () => {
    const codex = codexModelsFromDefaults(DEFAULT_MODELS);
    expect(codex.length).toBeGreaterThan(0);
    expect(codex.every((m) => m.id.startsWith('codex:'))).toBe(true);
    expect(codex.every((m) => m.group === 'codex')).toBe(true);
  });

  it('maps ollama entries to local group', () => {
    const entries: ModelEntry[] = [
      {
        id: 'ollama:qwen2.5:7b',
        displayName: 'qwen2.5:7b',
        provider: 'local',
        version: '7B',
        harnessIds: ['ollama'],
        role: 'chat',
        source: 'ollama',
        installed: true,
      },
      {
        id: 'ollama:nomic-embed-text',
        displayName: 'nomic-embed-text',
        provider: 'local',
        version: 'local',
        harnessIds: ['ollama'],
        role: 'embedding',
        source: 'ollama',
        installed: true,
      },
    ];
    const local = localModelsFromEntries(entries);
    expect(local).toHaveLength(1);
    expect(local[0]!.id).toBe('ollama:qwen2.5:7b');
    expect(local[0]!.group).toBe('local');
  });

  it('loadUnifiedModelCatalog merges without Electron', async () => {
    const catalog = await loadUnifiedModelCatalog(async () => [
      {
        id: 'ollama:llama3.2',
        displayName: 'llama3.2',
        provider: 'local',
        version: 'local',
        harnessIds: ['ollama'],
        role: 'chat',
        source: 'ollama',
        installed: true,
      },
    ]);
    expect(catalog.local).toHaveLength(1);
    expect(catalog.codex.length).toBe(DEFAULT_MODELS.length);
    const lists = toStatusModelLists(catalog);
    expect(lists.localModels[0]!.id).toBe('ollama:llama3.2');
    expect(lists.models[0]!.id.startsWith('codex:')).toBe(true);
  });
});

describe('Phase A turn route', () => {
  it('routes ollama:* to ollama and else to codex', () => {
    expect(resolveTurnRoute('ollama:qwen')).toEqual({
      kind: 'ollama',
      model: 'qwen',
    });
    expect(resolveTurnRoute('codex:gpt-5')).toEqual({
      kind: 'codex',
      modelId: 'gpt-5',
    });
    expect(resolveTurnRoute('gpt-5')).toEqual({
      kind: 'codex',
      modelId: 'gpt-5',
    });
  });
});
