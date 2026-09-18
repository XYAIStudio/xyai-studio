import { describe, expect, it } from 'vitest';
import {
  formatCustomModelRef,
  formatModelRef,
  isCustomModelRef,
  isOllamaModelRef,
  normalizeModelRef,
  parseCustomModelRef,
  parseModelRef,
  toCodexModelId,
  toOllamaModelName,
} from './model-ref.js';

describe('modelRef helpers', () => {
  it('parses codex and ollama refs', () => {
    expect(parseModelRef('codex:gpt-5')).toEqual({
      kind: 'codex',
      id: 'gpt-5',
      ref: 'codex:gpt-5',
    });
    expect(parseModelRef('ollama:qwen2.5:7b')).toEqual({
      kind: 'ollama',
      id: 'qwen2.5:7b',
      ref: 'ollama:qwen2.5:7b',
    });
  });

  it('normalizes legacy bare modelId to codex:', () => {
    expect(parseModelRef('gpt-5')?.ref).toBe('codex:gpt-5');
    expect(normalizeModelRef('o4-mini')).toBe('codex:o4-mini');
    expect(normalizeModelRef('  ')).toBe('codex:gpt-5');
  });

  it('formats and round-trips', () => {
    expect(formatModelRef('codex', 'gpt-5')).toBe('codex:gpt-5');
    expect(formatModelRef('ollama', 'llama3.2')).toBe('ollama:llama3.2');
    expect(formatModelRef('codex', 'codex:gpt-5')).toBe('codex:gpt-5');
  });

  it('extracts adapter / ollama bare names', () => {
    expect(toCodexModelId('codex:gpt-5')).toBe('gpt-5');
    expect(toCodexModelId('gpt-5')).toBe('gpt-5');
    expect(toOllamaModelName('ollama:qwen2.5')).toBe('qwen2.5');
    expect(toOllamaModelName('codex:gpt-5')).toBeNull();
    expect(isOllamaModelRef('ollama:x')).toBe(true);
    expect(isOllamaModelRef('gpt-5')).toBe(false);
  });

  it('parses custom provider modelRefs', () => {
    expect(parseModelRef('custom:deepseek1/deepseek-chat')).toEqual({
      kind: 'custom',
      id: 'deepseek1/deepseek-chat',
      ref: 'custom:deepseek1/deepseek-chat',
    });
    expect(normalizeModelRef('custom:p1/m1')).toBe('custom:p1/m1');
    expect(isCustomModelRef('custom:p1/m1')).toBe(true);
    expect(parseCustomModelRef('custom:p1/m1')).toEqual({
      providerId: 'p1',
      modelId: 'm1',
      ref: 'custom:p1/m1',
    });
    expect(formatCustomModelRef('p1', 'm1')).toBe('custom:p1/m1');
    expect(parseModelRef('custom:nopath')).toBeNull();
  });
});
