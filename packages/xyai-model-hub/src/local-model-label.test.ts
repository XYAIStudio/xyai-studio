import { describe, expect, it } from 'vitest';
import {
  formatFamilyLabel,
  formatOllamaTagLabel,
  presentLocalPickerItem,
  presentLocalPickerItems,
} from './local-model-label.js';
import { ollamaApiModelToEntry, toOllamaModelEntry } from './ollama-discover.js';

describe('formatOllamaTagLabel', () => {
  it('formats family:size tags without inventing brands', () => {
    expect(formatOllamaTagLabel('qwen3:1.7b')).toBe('Qwen3 1.7B');
    expect(formatOllamaTagLabel('ollama:gemma3:4b')).toBe('Gemma3 4B');
    expect(formatOllamaTagLabel('deepseek-v4-flash:latest')).toBe(
      'deepseek-v4-flash',
    );
  });
});

describe('formatFamilyLabel', () => {
  it('uses the Ollama family token, not a marketing name', () => {
    expect(formatFamilyLabel('qwen2', '3.2B')).toBe('Qwen2 3.2B');
    expect(formatFamilyLabel('qwen3', 'local')).toBe('Qwen3');
  });
});

describe('presentLocalPickerItems', () => {
  it('does not prefix 本地 · or repeat ollama: in the subtitle', () => {
    const [row] = presentLocalPickerItems([
      toOllamaModelEntry('qwen3:1.7b', {
        installed: true,
        family: 'qwen3',
        version: '1.7B',
      }),
    ]);
    expect(row!.label).toBe('Qwen3 1.7B');
    expect(row!.hint).toBe('qwen3:1.7b');
    expect(row!.label).not.toMatch(/本地/);
    expect(row!.hint).not.toMatch(/^ollama:/);
  });

  it('surfaces a shared digest so mis-tagged aliases are not different families', () => {
    const deepseek = ollamaApiModelToEntry({
      name: 'deepseek-v4-flash:latest',
      digest: 'sha256:fb90415cde1eabcd',
      details: { family: 'qwen2', parameter_size: '3.2B' },
    });
    const vl = ollamaApiModelToEntry({
      name: 'qwen2.5vl:3b',
      digest: 'fb90415cde1e',
      details: { family: 'qwen2', parameter_size: '3.2B' },
    });
    const rows = presentLocalPickerItems([deepseek, vl]);
    expect(rows[0]!.label).toBe('Qwen2 3.2B（deepseek-v4-flash）');
    expect(rows[0]!.hint).toMatch(/与 qwen2\.5vl:3b 同权重/);
    expect(rows[1]!.label).toBe('Qwen2 3.2B（qwen2.5vl:3b）');
    expect(rows[1]!.hint).toMatch(/deepseek-v4-flash/);
    expect(presentLocalPickerItem(deepseek, [deepseek, vl]).label).not.toMatch(
      /DeepSeek V4/i,
    );
  });
});
