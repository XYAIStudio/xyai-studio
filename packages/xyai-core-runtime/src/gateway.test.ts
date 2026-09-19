import { describe, expect, it } from 'vitest';
import { protocolDrivesCodexTools } from '@xyai/contracts';
import { inferProtocolFromRef, planModelGateway } from './gateway.js';

describe('planModelGateway', () => {
  it('keeps 你好 on stream for local and DeepSeek', () => {
    expect(
      planModelGateway({
        modelRef: 'ollama:qwen',
        capability: 'chat',
      }),
    ).toMatchObject({
      mode: 'stream',
      stream: { kind: 'ollama', modelId: 'qwen' },
    });
    expect(
      planModelGateway({
        modelRef: 'custom:ds/deepseek-chat',
        capability: 'chat',
        protocol: 'chat-completions',
      }),
    ).toMatchObject({
      mode: 'stream',
      stream: {
        kind: 'openai-compat',
        modelId: 'deepseek-chat',
        providerId: 'ds',
      },
    });
  });

  it('lifts create-plugin onto Codex with provider injection', () => {
    const plan = planModelGateway({
      modelRef: 'custom:ds/deepseek-chat',
      capability: 'tools',
      protocol: 'chat-completions',
    });
    expect(plan.mode).toBe('agent');
    expect(plan.agent).toEqual({
      runtime: 'codex',
      modelId: 'deepseek-chat',
      injectProviderId: 'ds',
    });
    expect(plan.gap).toBeUndefined();
  });

  it('lifts ollama tools onto Codex OSS', () => {
    expect(
      planModelGateway({
        modelRef: 'ollama:qwen',
        capability: 'tools',
      }),
    ).toMatchObject({
      mode: 'agent',
      agent: {
        runtime: 'codex',
        modelId: 'qwen',
        oss: true,
        localProvider: 'ollama',
      },
    });
  });

  it('keeps DeepSeek chat on stream even when lift=always', () => {
    expect(
      planModelGateway({
        modelRef: 'custom:ds/deepseek-chat',
        capability: 'chat',
        lift: 'always',
        protocol: 'chat-completions',
      }).mode,
    ).toBe('stream');
  });

  it('does not lift when lift=never (local-stream)', () => {
    expect(
      planModelGateway({
        modelRef: 'custom:ds/deepseek-chat',
        capability: 'tools',
        lift: 'never',
      }).mode,
    ).toBe('stream');
  });

  it('documents Anthropic Messages as a tools gap (stays on stream)', () => {
    const plan = planModelGateway({
      modelRef: 'custom:anth/claude-sonnet-4-5',
      capability: 'tools',
      protocol: 'anthropic-messages',
    });
    expect(plan.mode).toBe('stream');
    expect(plan.gap).toBe('anthropic-messages');
    expect(protocolDrivesCodexTools('anthropic-messages')).toBe(false);
    expect(protocolDrivesCodexTools('chat-completions')).toBe(true);
    expect(protocolDrivesCodexTools('openai-responses')).toBe(true);
  });

  it('builtin Codex refs always use the agent runtime', () => {
    expect(
      planModelGateway({ modelRef: 'codex:gpt-5', capability: 'chat' }),
    ).toEqual({
      mode: 'agent',
      capability: 'chat',
      modelRef: 'codex:gpt-5',
      agent: { runtime: 'codex', modelId: 'gpt-5' },
    });
  });

  it('infers protocol from modelRef when catalog is absent', () => {
    expect(inferProtocolFromRef('custom:ds/deepseek-chat')).toBe(
      'chat-completions',
    );
    expect(inferProtocolFromRef('ollama:qwen')).toBe('ollama');
    expect(inferProtocolFromRef('gpt-5')).toBe('codex');
  });
});
