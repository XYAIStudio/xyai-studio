import { describe, expect, it } from 'vitest';
import {
  chatModelRef,
  hubActionsFor,
  isProjectorModel,
} from './models-hub-actions.js';

describe('hubActionsFor', () => {
  it('shows 测速 + 注册 + 挂接 for an unregistered disk GGUF', () => {
    const actions = hubActionsFor({
      id: 'gguf:qwen3-1.7b-q4_k_m',
      displayName: 'Qwen3-1.7B-Q4_K_M.gguf',
      source: 'gguf',
      registered: false,
      isDefault: false,
    });
    expect(actions.map((a) => a.label)).toEqual(['测速', '注册', '挂接']);
  });

  it('shows 解挂 when the model is the default chat model', () => {
    const actions = hubActionsFor({
      id: 'ollama:qwen3:1.7b',
      displayName: 'qwen3:1.7b',
      source: 'ollama',
      registered: true,
      isDefault: true,
    });
    expect(actions.map((a) => a.label)).toEqual(['测速', '解挂']);
  });

  it('lists mmproj without 测速/挂接 but still allows 注册 to be refused in host', () => {
    expect(
      isProjectorModel({ displayName: 'mmproj-f16.gguf', role: 'vision' }),
    ).toBe(true);
    const actions = hubActionsFor({
      id: 'gguf:mmproj-f16',
      displayName: 'mmproj-f16.gguf',
      source: 'gguf',
      role: 'vision',
      registered: false,
      isDefault: false,
    });
    expect(actions.map((a) => a.label)).toEqual(['注册']);
  });
});

describe('chatModelRef', () => {
  it('keeps ollama ids', () => {
    expect(chatModelRef({ id: 'ollama:qwen3:1.7b', displayName: 'qwen3:1.7b' })).toBe(
      'ollama:qwen3:1.7b',
    );
  });
});
