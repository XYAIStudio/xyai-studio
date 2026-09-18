import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commonModelRoots,
  DISK_WEIGHT_CAP,
  extraManualScanRoots,
  isProjectorWeightName,
  sanitizeOllamaCreateName,
  scanDiskWeightModels,
  walkWeightHits,
  weightFileToEntry,
} from './disk-weights.js';

describe('commonModelRoots', () => {
  it('includes huggingface, lm-studio, dsh/xyai, and Windows models/Freework letters', () => {
    const roots = commonModelRoots(
      {
        USERPROFILE: 'C:\\Users\\Lenovo',
        LOCALAPPDATA: 'C:\\Users\\Lenovo\\AppData\\Local',
        APPDATA: 'C:\\Users\\Lenovo\\AppData\\Roaming',
        SystemDrive: 'C:',
      },
      'win32',
    );
    const joined = roots.join('|').toLowerCase();
    expect(joined).toMatch(/huggingface/);
    expect(joined).toMatch(/lm-studio|\.lmstudio/);
    expect(joined).toMatch(/\.dsh[\\/]xyai[\\/]models/);
    expect(joined).toMatch(/nomic\.ai/);
    expect(roots.some((r) => /models$/i.test(r))).toBe(true);
  });
});

describe('extraManualScanRoots', () => {
  it('adds home Downloads Documents', () => {
    const roots = extraManualScanRoots({ HOME: '/home/u' });
    expect(roots.some((r) => r.endsWith('Downloads'))).toBe(true);
    expect(roots.some((r) => r.endsWith('Documents'))).toBe(true);
  });
});

describe('walkWeightHits', () => {
  it('finds GGUF including mmproj and sibling chat weights', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'xyai-weights-'));
    const models = path.join(root, 'models', 'Qwen3.5-2B-Q4_K_M-GGUF');
    mkdirSync(models, { recursive: true });
    writeFileSync(path.join(models, 'mmproj-f16.gguf'), 'x');
    writeFileSync(path.join(models, 'qwen3-5-2b-q4_k_m.gguf'), 'yyyy');
    const hits = walkWeightHits(root, [], { cap: DISK_WEIGHT_CAP });
    const names = hits.map((h) => h.displayName).sort();
    expect(names).toContain('mmproj-f16.gguf');
    expect(names).toContain('qwen3-5-2b-q4_k_m.gguf');
    expect(hits.find((h) => h.displayName.startsWith('mmproj'))?.projector).toBe(
      true,
    );
  });

  it('respects the 40-hit cap', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'xyai-cap-'));
    for (let i = 0; i < 50; i++) {
      writeFileSync(path.join(root, `m${i}.gguf`), 'x');
    }
    const hits = walkWeightHits(root, [], { cap: DISK_WEIGHT_CAP });
    expect(hits.length).toBe(DISK_WEIGHT_CAP);
  });
});

describe('weightFileToEntry', () => {
  it('marks mmproj as vision projector', () => {
    const entry = weightFileToEntry({
      filePath: 'E:\\models\\mmproj-f16.gguf',
      displayName: 'mmproj-f16.gguf',
      sizeBytes: 637 * 1024 * 1024,
      kind: 'gguf',
      projector: true,
    });
    expect(entry.role).toBe('vision');
    expect(entry.version).toBe('projector');
    expect(entry.path).toMatch(/mmproj-f16/);
  });
});

describe('scanDiskWeightModels', () => {
  it('scans extraRoots such as .dsh/xyai/models', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'xyai-dsh-'));
    const dsh = path.join(root, '.dsh', 'xyai', 'models');
    mkdirSync(dsh, { recursive: true });
    writeFileSync(path.join(dsh, 'Qwen3-1.7B-Q4_K_M.gguf'), 'abc');
    const found = scanDiskWeightModels({
      extraRoots: [dsh],
      mode: 'common',
      env: { HOME: root },
      platform: 'linux',
    });
    expect(found.some((m) => /Qwen3-1.7B/i.test(m.displayName))).toBe(true);
  });
});

describe('name helpers', () => {
  it('detects projector names', () => {
    expect(isProjectorWeightName('mmproj-f16.gguf')).toBe(true);
    expect(isProjectorWeightName('qwen3-1.7b-q4_k_m.gguf')).toBe(false);
  });

  it('sanitizes ollama create names', () => {
    expect(sanitizeOllamaCreateName('Qwen3-1.7B-Q4_K_M.gguf')).toBe(
      'qwen3-1.7b-q4_k_m',
    );
  });
});
