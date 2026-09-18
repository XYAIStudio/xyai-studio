import { describe, expect, it } from 'vitest';
import {
  formatArchToken,
  formatFamilyLabel,
  formatOllamaTagLabel,
  identityLabelFor,
  presentLocalPickerItem,
  presentLocalPickerItems,
} from './local-model-label.js';
import { ollamaApiModelToEntry, toOllamaModelEntry } from './ollama-discover.js';

describe('formatArchToken', () => {
  it('formats qwen25vl as Qwen2.5-VL without a DeepSeek or 通义 brand', () => {
    expect(formatArchToken('qwen25vl')).toBe('Qwen2.5-VL');
    expect(formatArchToken('qwen2.5vl')).toBe('Qwen2.5-VL');
    expect(formatArchToken('qwen3')).toBe('Qwen3');
  });
});

describe('formatOllamaTagLabel', () => {
  it('formats family:size tags without inventing brands', () => {
    expect(formatOllamaTagLabel('qwen3:1.7b')).toBe('Qwen3 1.7B');
    expect(formatOllamaTagLabel('ollama:gemma3:4b')).toBe('Gemma3 4B');
    expect(formatOllamaTagLabel('qwen2.5vl:3b')).toBe('Qwen2.5-VL 3B');
    expect(formatOllamaTagLabel('deepseek-v4-flash:latest')).toBe(
      'deepseek-v4-flash',
    );
  });
});

describe('formatFamilyLabel', () => {
  it('uses the Ollama architecture token, not a marketing name', () => {
    expect(formatFamilyLabel('qwen25vl', '3.8B')).toBe('Qwen2.5-VL 3.8B');
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

  it('uses show architecture as the only title when tags share a digest', () => {
    const deepseek = ollamaApiModelToEntry({
      name: 'deepseek-v4-flash:latest',
      digest: 'sha256:fb90415cde1eabcd',
      details: { family: 'qwen2', parameter_size: '3.8B' },
    });
    deepseek.architecture = 'qwen25vl';
    const vl = ollamaApiModelToEntry({
      name: 'qwen2.5vl:3b',
      digest: 'fb90415cde1e',
      details: { family: 'qwen2', parameter_size: '3.8B' },
    });
    vl.architecture = 'qwen25vl';
    const rows = presentLocalPickerItems([deepseek, vl]);
    expect(rows[0]!.label).toBe('Qwen2.5-VL 3.8B');
    expect(rows[1]!.label).toBe('Qwen2.5-VL 3.8B');
    expect(rows[0]!.label).not.toMatch(/deepseek/i);
    expect(rows[0]!.hint).toMatch(/别名 deepseek-v4-flash/);
    expect(rows[0]!.hint).toMatch(/qwen2\.5vl:3b/);
    expect(rows[1]!.hint).toMatch(/另有别名 deepseek-v4-flash/);
    expect(identityLabelFor(deepseek, [deepseek, vl])).toBe('Qwen2.5-VL 3.8B');
  });

  it('still avoids a DeepSeek title when only the sibling tag is family-like', () => {
    const deepseek = toOllamaModelEntry('deepseek-v4-flash:latest', {
      installed: true,
      digest: 'fb90415cde1e',
    });
    const vl = toOllamaModelEntry('qwen2.5vl:3b', {
      installed: true,
      digest: 'fb90415cde1e',
    });
    expect(presentLocalPickerItem(deepseek, [deepseek, vl]).label).toBe(
      'Qwen2.5-VL 3B',
    );
    expect(presentLocalPickerItem(deepseek, [deepseek, vl]).label).not.toMatch(
      /deepseek/i,
    );
  });
});
