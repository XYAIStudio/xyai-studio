import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STALL_TIMEOUT_CHAT_MS, STALL_TIMEOUT_TOOLS_MS } from '@xyai/core-runtime';
import { planTurn, resolveTurnRoute } from './turn-controller.js';

describe('resolveTurnRoute tools lift', () => {
  it('keeps custom chat-only on the HTTP stream path', () => {
    expect(
      resolveTurnRoute('custom:prov/model-a', { engineMode: 'auto' }),
    ).toEqual({
      kind: 'custom',
      providerId: 'prov',
      modelId: 'model-a',
    });
  });

  it('routes custom + tools through Codex with provider id', () => {
    expect(
      resolveTurnRoute('custom:prov/deepseek-chat', {
        engineMode: 'auto',
        capabilityNeed: 'tools',
      }),
    ).toEqual({
      kind: 'codex',
      modelId: 'deepseek-chat',
      customProviderId: 'prov',
    });
  });

  it('does not lift custom tools when engineMode is local-stream', () => {
    expect(
      resolveTurnRoute('custom:prov/deepseek-chat', {
        engineMode: 'local-stream',
        capabilityNeed: 'tools',
      }),
    ).toEqual({
      kind: 'custom',
      providerId: 'prov',
      modelId: 'deepseek-chat',
    });
  });

  it('lifts ollama + tools on auto onto Codex OSS', () => {
    expect(
      resolveTurnRoute('ollama:qwen', {
        engineMode: 'auto',
        capabilityNeed: 'tools',
      }),
    ).toEqual({
      kind: 'codex',
      modelId: 'qwen',
      oss: true,
      localProvider: 'ollama',
    });
  });
});

describe('planTurn', () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('DeepSeek create-plugin + auto → Codex writable sandbox', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-plan-'));
    const plan = planTurn({
      modelRef: 'custom:ds/deepseek-chat',
      userText: '帮我创建一个插件并安装到个性化',
      engineMode: 'auto',
      accessMode: 'default',
      userDataDir: tmp,
    });
    expect(plan.capabilityNeed).toBe('tools');
    expect(plan.permissionMode).toBe('default');
    expect(plan.stallTimeoutMs).toBe(STALL_TIMEOUT_TOOLS_MS);
    expect(plan.gateway.mode).toBe('agent');
    expect(plan.gateway.agent).toEqual({
      runtime: 'codex',
      modelId: 'deepseek-chat',
      injectProviderId: 'ds',
    });
    expect(plan.route).toEqual({
      kind: 'codex',
      modelId: 'deepseek-chat',
      customProviderId: 'ds',
    });
    expect(plan.sandbox).toEqual({
      sandbox: 'workspace-write',
      approval: 'never',
    });
    expect(plan.cwd).toBe(path.join(tmp, 'workspace'));
    expect(plan.addDirs).toEqual([path.join(tmp, 'personalize')]);
  });

  it('你好 + full access stays custom stream; sandbox still full', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-plan-'));
    const plan = planTurn({
      modelRef: 'custom:ds/deepseek-chat',
      userText: '你好',
      engineMode: 'auto',
      accessMode: 'full',
      userDataDir: tmp,
    });
    expect(plan.capabilityNeed).toBe('chat');
    expect(plan.permissionMode).toBe('bypass');
    expect(plan.stallTimeoutMs).toBe(STALL_TIMEOUT_CHAT_MS);
    expect(plan.gateway.mode).toBe('stream');
    expect(plan.route).toEqual({
      kind: 'custom',
      providerId: 'ds',
      modelId: 'deepseek-chat',
    });
    expect(plan.sandbox).toEqual({
      sandbox: 'danger-full-access',
      approval: 'never',
    });
  });

  it('你好 + full on ollama stays local stream', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-plan-'));
    const plan = planTurn({
      modelRef: 'ollama:qwen',
      userText: '你好',
      engineMode: 'auto',
      accessMode: 'full',
      userDataDir: tmp,
    });
    expect(plan.capabilityNeed).toBe('chat');
    expect(plan.gateway.mode).toBe('stream');
    expect(plan.route).toEqual({ kind: 'ollama', model: 'qwen' });
  });

  it('Anthropic Messages + tools stays stream and records the protocol gap', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-plan-'));
    const plan = planTurn({
      modelRef: 'custom:anth/claude-sonnet-4-5',
      userText: '帮我创建一个插件',
      engineMode: 'auto',
      accessMode: 'default',
      userDataDir: tmp,
      customProviders: [
        {
          id: 'anth',
          name: 'Anthropic',
          runtime: 'claude-code',
          auth: 'apiKey',
          protocol: 'anthropic-messages',
          baseUrl: 'https://api.anthropic.com',
          models: [{ id: 'claude-sonnet-4-5', label: 'Claude' }],
        },
      ],
    });
    expect(plan.capabilityNeed).toBe('tools');
    expect(plan.gateway.mode).toBe('stream');
    expect(plan.gateway.gap).toBe('anthropic-messages');
    expect(plan.route.kind).toBe('custom');
  });

  it('projectCwd overrides studio workspace; empty falls back', () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'xyai-plan-'));
    const custom = path.join(tmp, 'repo');
    const withCwd = planTurn({
      modelRef: 'ollama:qwen',
      userText: '你好',
      engineMode: 'auto',
      userDataDir: tmp,
      projectCwd: custom,
    });
    expect(withCwd.cwd).toBe(custom);
    expect(withCwd.addDirs).toEqual([path.join(tmp, 'personalize')]);

    const empty = planTurn({
      modelRef: 'ollama:qwen',
      userText: '你好',
      engineMode: 'auto',
      userDataDir: tmp,
      projectCwd: '  ',
    });
    expect(empty.cwd).toBe(path.join(tmp, 'workspace'));
  });
});
