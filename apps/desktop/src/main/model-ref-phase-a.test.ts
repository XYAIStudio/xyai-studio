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
    expect(local[0]!.label).not.toMatch(/^本地 ·/);
    expect(local[0]!.label).toBe('Qwen2.5 7B');
    expect(local[0]!.hint).toBe('qwen2.5:7b');
  });

  it('drops recommended tags that are not live and notes shared digests', () => {
    const local = localModelsFromEntries([
      {
        id: 'ollama:qwen3:8b',
        displayName: 'qwen3:8b',
        provider: 'local',
        version: 'local',
        harnessIds: ['ollama'],
        role: 'chat',
        source: 'ollama',
        installed: false,
      },
      {
        id: 'ollama:deepseek-v4-flash:latest',
        displayName: 'deepseek-v4-flash:latest',
        provider: 'local',
        version: '3.8B',
        harnessIds: ['ollama'],
        role: 'chat',
        source: 'ollama',
        installed: true,
        digest: 'fb90415cde1e',
        family: 'qwen2',
        architecture: 'qwen25vl',
      },
      {
        id: 'ollama:qwen2.5vl:3b',
        displayName: 'qwen2.5vl:3b',
        provider: 'local',
        version: '3.8B',
        harnessIds: ['ollama'],
        role: 'vision',
        source: 'ollama',
        installed: true,
        digest: 'sha256:fb90415cde1eabcd',
        family: 'qwen2',
        architecture: 'qwen25vl',
      },
    ]);
    expect(local.map((m) => m.id)).toEqual([
      'ollama:deepseek-v4-flash:latest',
      'ollama:qwen2.5vl:3b',
    ]);
    expect(local[0]!.label).toBe('Qwen2.5-VL 3.8B');
    expect(local[0]!.label).not.toMatch(/deepseek/i);
    expect(local[0]!.hint).toMatch(/别名 deepseek-v4-flash/);
    expect(local[1]!.label).toBe('Qwen2.5-VL 3.8B');
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
  it('routes ollama:* to direct stream by default (qualification line)', () => {
    expect(resolveTurnRoute('ollama:qwen')).toEqual({
      kind: 'ollama',
      model: 'qwen',
    });
    expect(resolveTurnRoute('ollama:qwen3:8b')).toEqual({
      kind: 'ollama',
      model: 'qwen3:8b',
    });
    expect(
      resolveTurnRoute('ollama:qwen', { localModelViaHarness: true }),
    ).toEqual({
      kind: 'codex',
      modelId: 'qwen',
      oss: true,
      localProvider: 'ollama',
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

  it('keeps direct ollama stream when localModelViaHarness is false', () => {
    expect(
      resolveTurnRoute('ollama:qwen', { localModelViaHarness: false }),
    ).toEqual({
      kind: 'ollama',
      model: 'qwen',
    });
  });

  it('engineMode auto/local-stream stay on ollama; codex-oss uses --oss', () => {
    expect(resolveTurnRoute('ollama:qwen', { engineMode: 'auto' })).toEqual({
      kind: 'ollama',
      model: 'qwen',
    });
    expect(
      resolveTurnRoute('ollama:qwen', { engineMode: 'local-stream' }),
    ).toEqual({
      kind: 'ollama',
      model: 'qwen',
    });
    expect(
      resolveTurnRoute('ollama:qwen', { engineMode: 'codex-oss' }),
    ).toEqual({
      kind: 'codex',
      modelId: 'qwen',
      oss: true,
      localProvider: 'ollama',
    });
  });
});

describe('engineMode setting', () => {
  it('defaults to auto; maps legacy localModelViaHarness', () => {
    expect(normalizeSettings({}).engineMode).toBe('auto');
    expect(normalizeSettings({}).localModelViaHarness).toBe(false);
    expect(normalizeSettings({ localModelViaHarness: false }).engineMode).toBe(
      'local-stream',
    );
    expect(normalizeSettings({ localModelViaHarness: true }).engineMode).toBe(
      'codex-oss',
    );
    expect(normalizeSettings({ localModelViaHarness: true }).localModelViaHarness).toBe(
      true,
    );
    expect(normalizeSettings({ engineMode: 'auto' }).engineMode).toBe('auto');
    expect(
      normalizeSettings({
        engineMode: 'auto',
        localModelViaHarness: true,
      }).engineMode,
    ).toBe('auto');
  });
});

