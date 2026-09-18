import { describe, expect, it } from 'vitest';
import {
  chatModelRef,
  hubActionsFor,
  isProjectorModel,
} from './models-hub-actions.js';

describe('hubActionsFor', () => {
  it('shows only 注册 for an unregistered disk GGUF until it exists in Ollama', () => {
    const actions = hubActionsFor({
      id: 'gguf:qwen3-1.7b-q4_k_m',
      displayName: 'Qwen3-1.7B-Q4_K_M.gguf',
      source: 'gguf',
      registered: false,
      isDefault: false,
      availableInOllama: false,
    });
    expect(actions.map((a) => a.label)).toEqual(['注册']);
  });

  it('puts 挂接 before 测速 on a live non-default tag', () => {
    const actions = hubActionsFor({
      id: 'ollama:qwen3:1.7b',
      displayName: 'qwen3:1.7b',
      source: 'ollama',
      registered: true,
      isDefault: false,
      availableInOllama: true,
    });
    expect(actions.map((a) => a.label)).toEqual(['挂接', '测速']);
  });

  it('shows 解挂 + 测速 only when the tag is live in Ollama', () => {
    const actions = hubActionsFor({
      id: 'ollama:qwen3:1.7b',
      displayName: 'qwen3:1.7b',
      source: 'ollama',
      registered: true,
      isDefault: true,
      availableInOllama: true,
    });
    expect(actions.map((a) => a.label)).toEqual(['解挂', '测速']);
  });

  it('hides 测速 for recommended tags that are not installed', () => {
    const actions = hubActionsFor({
      id: 'ollama:qwen3:8b',
      displayName: 'qwen3:8b',
      source: 'ollama',
      registered: false,
      isDefault: false,
      availableInOllama: false,
    });
    expect(actions.map((a) => a.id)).toEqual(['register']);
  });

  it('lists mmproj without 测速/挂接 but still allows 注册 to be refused in host', () => {
    expect(
      isProjectorModel({ displayName: 'mmproj-f16.gguf', role: 'vision' }),
    ).toBe(true);
    expect(
      isProjectorModel({ displayName: 'qwen2.5vl:3b', role: 'vision' }),
    ).toBe(false);
    const actions = hubActionsFor({
      id: 'gguf:mmproj-f16',
      displayName: 'mmproj-f16.gguf',
      source: 'gguf',
      role: 'vision',
      registered: false,
      isDefault: false,
      availableInOllama: true,
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
