import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLiveOllamaPresence,
  formatLocalModelScanResult,
  inferOllamaRole,
  listOllamaNamesFromDiskRoot,
  modelNameFromManifestPath,
  ollamaApiModelToEntry,
  parseOllamaListOutput,
  parseOllamaListRows,
  pickDiscoverySource,
  toOllamaModelEntry,
} from './ollama-discover.js';
import {
  explainOllamaHttpFailure,
  mapOllamaNetworkError,
  ollamaTagsIncludeModel,
  OLLAMA_NOT_RUNNING_CODE,
} from './ollama-errors.js';
import { startOllamaWithDeps } from './ollama-start.js';

describe('parseOllamaListOutput', () => {
  it('reads NAME column and skips header', () => {
    const stdout = [
      'NAME                 ID              SIZE      MODIFIED',
      'qwen3:8b             abc123          5.2 GB    2 days ago',
      'nomic-embed-text     def456          274 MB    1 week ago',
      '',
    ].join('\n');
    expect(parseOllamaListOutput(stdout)).toEqual([
      'qwen3:8b',
      'nomic-embed-text',
    ]);
  });
});

describe('parseOllamaListRows', () => {
  it('keeps short digest IDs from the ID column', () => {
    const stdout = [
      'NAME                         ID              SIZE      MODIFIED',
      'deepseek-v4-flash:latest     fb90415cde1e    2.3 GB    2 days ago',
      'qwen2.5vl:3b                 fb90415cde1e    2.3 GB    2 days ago',
    ].join('\n');
    expect(parseOllamaListRows(stdout)).toEqual([
      { name: 'deepseek-v4-flash:latest', digest: 'fb90415cde1e' },
      { name: 'qwen2.5vl:3b', digest: 'fb90415cde1e' },
    ]);
  });
});

describe('modelNameFromManifestPath', () => {
  it('maps library/name/tag to name:tag', () => {
    const root = path.join('C:', 'models', 'manifests');
    const file = path.join(root, 'registry.ollama.ai', 'library', 'qwen3', '8b');
    expect(modelNameFromManifestPath(file, root)).toBe('qwen3:8b');
  });
});

describe('listOllamaNamesFromDiskRoot', () => {
  it('walks manifests as a fallback when API is down', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'xyai-ollama-'));
    const file = path.join(
      root,
      'manifests',
      'registry.ollama.ai',
      'library',
      'llama3.2',
      'latest',
    );
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{}');
    expect(listOllamaNamesFromDiskRoot(root)).toEqual(['llama3.2:latest']);
  });
});

describe('pickDiscoverySource', () => {
  it('unions api + cli + disk instead of stopping at a short tags list', () => {
    const api = [toOllamaModelEntry('from-api')];
    const cli = [toOllamaModelEntry('from-cli')];
    const disk = [toOllamaModelEntry('from-disk')];
    const mixed = pickDiscoverySource(api, cli, disk);
    expect(mixed.source).toBe('mixed');
    expect(mixed.models.map((m) => m.displayName).sort()).toEqual([
      'from-api',
      'from-cli',
      'from-disk',
    ]);
    expect(pickDiscoverySource([], cli, disk).source).toBe('mixed');
    expect(pickDiscoverySource([], [], disk).source).toBe('disk');
    expect(pickDiscoverySource([], [], []).source).toBe('none');
  });

  it('keeps a 3-tag API list and still merges extra CLI/disk names', () => {
    const api = ['qwen3:1.7b', 'deepseek-v4-flash', 'qwen2.5vl:3b'].map((n) =>
      toOllamaModelEntry(n),
    );
    const disk = [toOllamaModelEntry('qwen2.5:14b'), toOllamaModelEntry('qwen3:1.7b')];
    const out = pickDiscoverySource(api, [], disk);
    expect(out.models).toHaveLength(4);
    expect(out.models.some((m) => m.displayName === 'qwen2.5:14b')).toBe(true);
  });
});

describe('ollamaApiModelToEntry', () => {
  it('copies digest and family from /api/tags and marks installed', () => {
    const entry = ollamaApiModelToEntry({
      name: 'deepseek-v4-flash:latest',
      digest: 'sha256:fb90415cde1eabcd',
      size: 2300,
      details: { family: 'qwen2', parameter_size: '3.2B' },
    });
    expect(entry.installed).toBe(true);
    expect(entry.family).toBe('qwen2');
    expect(entry.digest).toBe('sha256:fb90415cde1eabcd');
    expect(entry.version).toBe('3.2B');
  });
});

describe('applyLiveOllamaPresence', () => {
  it('does not treat catalog/registry/disk-only names as installed', () => {
    const live = [toOllamaModelEntry('qwen3:1.7b', { installed: true })];
    const stale = toOllamaModelEntry('qwen3:8b', { installed: false });
    const recLike = toOllamaModelEntry('gemma3:4b', {
      source: 'catalog',
      installed: true,
    });
    const out = applyLiveOllamaPresence(
      [...live, stale, recLike],
      ['qwen3:1.7b'],
    );
    expect(out.find((m) => m.displayName === 'qwen3:1.7b')?.installed).toBe(
      true,
    );
    expect(out.find((m) => m.displayName === 'qwen3:8b')?.installed).toBe(
      false,
    );
    expect(out.find((m) => m.displayName === 'gemma3:4b')?.installed).toBe(
      false,
    );
  });
});

describe('inferOllamaRole', () => {
  it('classifies embedding vs chat', () => {
    expect(inferOllamaRole('nomic-embed-text')).toBe('embedding');
    expect(inferOllamaRole('qwen3:8b')).toBe('chat');
  });
});

describe('formatLocalModelScanResult', () => {
  it('does not claim full-disk miss when Ollama is only stopped', () => {
    expect(
      formatLocalModelScanResult({
        count: 0,
        installed: true,
        running: false,
      }),
    ).toMatch(/启动 Ollama/);
    expect(
      formatLocalModelScanResult({
        count: 0,
        installed: false,
        running: false,
      }),
    ).toMatch(/未检测到 Ollama/);
    expect(
      formatLocalModelScanResult({
        count: 2,
        installed: true,
        running: true,
      }),
    ).toBe('发现 2 个本地模型');
  });
});

describe('ollama stale-model helpers', () => {
  it('treats empty tags as missing (qwen3:8b)', () => {
    expect(ollamaTagsIncludeModel([], 'qwen3:8b')).toBe(false);
    expect(ollamaTagsIncludeModel(['qwen3:8b'], 'qwen3:8b')).toBe(true);
    expect(ollamaTagsIncludeModel(['qwen3:8b'], 'ollama:qwen3:8b')).toBe(true);
    expect(ollamaTagsIncludeModel(['llama3.2'], 'qwen3:8b')).toBe(false);
    expect(ollamaTagsIncludeModel(['qwen3:1.7b'], 'qwen3:8b')).toBe(false);
    expect(ollamaTagsIncludeModel(['qwen3'], 'qwen3:8b')).toBe(false);
    expect(ollamaTagsIncludeModel(['qwen3:8b'], 'qwen3:8b:latest')).toBe(true);
  });

  it('maps HTTP 404 / not found to a refresh/pull message', () => {
    expect(explainOllamaHttpFailure(404, 'model not found', 'qwen3:8b')).toMatch(
      /刷新列表/,
    );
    expect(explainOllamaHttpFailure(500, 'boom', 'qwen3:8b')).toMatch(/HTTP 500/);
  });
});

describe('mapOllamaNetworkError', () => {
  it('maps fetch failed to a recoverable start action', () => {
    const mapped = mapOllamaNetworkError(new Error('fetch failed'));
    expect((mapped as { code?: string }).code).toBe(OLLAMA_NOT_RUNNING_CODE);
    expect(mapped.message).toMatch(/启动 Ollama/);
  });

  it('keeps AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(mapOllamaNetworkError(err).name).toBe('AbortError');
  });
});

describe('startOllamaWithDeps', () => {
  it('no-ops when API is already up', async () => {
    const res = await startOllamaWithDeps({
      probe: async () => true,
      isInstalled: async () => true,
      spawnServe: () => {
        throw new Error('should not spawn');
      },
    });
    expect(res).toMatchObject({
      ok: true,
      running: true,
      started: false,
    });
  });

  it('refuses when the binary is missing', async () => {
    const res = await startOllamaWithDeps({
      probe: async () => false,
      isInstalled: async () => false,
      spawnServe: () => {
        throw new Error('should not spawn');
      },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/未检测到 Ollama/);
  });

  it('spawns then waits until tags succeed', async () => {
    let n = 0;
    const res = await startOllamaWithDeps(
      {
        probe: async () => {
          n += 1;
          return n >= 3;
        },
        isInstalled: async () => true,
        spawnServe: () => {},
        sleep: async () => {},
      },
      { timeoutMs: 5000 },
    );
    expect(res).toMatchObject({ ok: true, running: true, started: true });
  });

  it('reports a recoverable timeout after spawn', async () => {
    let t = 0;
    const res = await startOllamaWithDeps(
      {
        probe: async () => false,
        isInstalled: async () => true,
        spawnServe: () => {},
        now: () => t,
        sleep: async () => {
          t += 10_000;
        },
      },
      { timeoutMs: 1000 },
    );
    expect(res.ok).toBe(false);
    expect(res.started).toBe(true);
    expect(res.message).toMatch(/仍未就绪/);
  });
});
