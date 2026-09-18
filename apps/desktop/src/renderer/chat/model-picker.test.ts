import { describe, expect, it } from 'vitest';
import { pickerRowHint } from './model-picker.js';

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
