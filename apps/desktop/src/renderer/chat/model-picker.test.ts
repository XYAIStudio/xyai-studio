import { describe, expect, it } from 'vitest';
import { modelChipText, pickerRowHint } from './model-picker.js';

describe('pickerRowHint', () => {
  it('prefers hint over the raw ollama: id', () => {
    expect(
      pickerRowHint({
        id: 'ollama:deepseek-v4-flash:latest',
        label: 'Qwen2 3.2B（deepseek-v4-flash）',
        hint: '与 qwen2.5vl:3b 同权重',
      }),
    ).toBe('与 qwen2.5vl:3b 同权重');
  });

  it('strips the ollama: prefix when hint is missing', () => {
    expect(
      pickerRowHint({ id: 'ollama:qwen3:1.7b', label: 'Qwen3 1.7B' }),
    ).toBe('qwen3:1.7b');
  });
});

describe('modelChipText', () => {
  it('shows the model label without engine brands', () => {
    expect(modelChipText('Qwen3 1.7B', false)).toBe('Qwen3 1.7B');
    expect(modelChipText('Qwen3 1.7B', true)).toBe('Qwen3 1.7B · 未在本地列表');
    expect(modelChipText('Qwen3 1.7B', false)).not.toMatch(/高级引擎/);
  });
});
