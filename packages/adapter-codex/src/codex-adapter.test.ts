import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  buildCodexExecArgs,
  CODEX_ERROR_CODE,
  createCodexAdapter,
  mapCodexUserError,
  MOCK_MARKER,
} from './codex-adapter.js';

describe('@xyai/adapter-codex mock', () => {
  it('returns deterministic mock event stream for one turn', async () => {
    const adapter = createCodexAdapter({ forceMock: true });
    expect(adapter.isMock).toBe(true);
    await adapter.start({ sessionId: 's1', harnessId: 'codex' });

    const events = [];
    for await (const ev of adapter.send({
      sessionId: 's1',
      taskId: 't1',
      content: 'hello',
    })) {
      events.push(ev);
    }

    expect(events.map((e) => e.type)).toEqual([
      'session.started',
      'message.delta',
      'message.completed',
    ]);
    const completed = events[2];
    expect(String((completed?.payload as { text?: string })?.text)).toContain(
      MOCK_MARKER,
    );
    expect(String((completed?.payload as { text?: string })?.text)).toContain(
      'hello',
    );

    await adapter.stop('s1');
  });
});

describe('buildCodexExecArgs', () => {
  it('builds cloud/codex argv without oss flags', () => {
    expect(
      buildCodexExecArgs({
        sandbox: 'read-only',
        cwd: '/tmp/ws',
        content: 'hello',
        modelId: 'gpt-5',
      }),
    ).toEqual([
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '-s',
      'read-only',
      '-C',
      '/tmp/ws',
      '-m',
      'gpt-5',
      'hello',
    ]);
  });

  it('adds --oss and --local-provider before -m for Ollama', () => {
    expect(
      buildCodexExecArgs({
        sandbox: 'workspace-write',
        cwd: 'E:\\proj',
        content: 'fix bug',
        modelId: 'qwen3:8b',
        oss: true,
        localProvider: 'ollama',
      }),
    ).toEqual([
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '-s',
      'workspace-write',
      '-C',
      'E:\\proj',
      '--oss',
      '--local-provider',
      'ollama',
      '-m',
      'qwen3:8b',
      'fix bug',
    ]);
  });

  it('keeps --oss --local-provider ollama -m <bare> when session.oss', () => {
    const args = buildCodexExecArgs({
      sandbox: 'read-only',
      cwd: '/tmp',
      content: 'hi',
      modelId: 'qwen3:8b',
      oss: true,
      localProvider: 'ollama',
    });
    const ossAt = args.indexOf('--oss');
    const providerAt = args.indexOf('--local-provider');
    const mAt = args.indexOf('-m');
    expect(ossAt).toBeGreaterThan(-1);
    expect(args[providerAt + 1]).toBe('ollama');
    expect(args[mAt + 1]).toBe('qwen3:8b');
    expect(args[mAt + 1]).not.toMatch(/^ollama:/);
    expect(ossAt).toBeLessThan(mAt);
  });
});

describe('CodexAdapter missing binary', () => {
  it('is mock when binary is absent unless forceMock was requested', () => {
    const adapter = createCodexAdapter({
      binaryPath: path.join('/tmp', 'xyai-no-such-codex-bin'),
    });
    expect(adapter.isMock).toBe(true);
    expect(adapter.binary.path).toBeNull();
    const mapped = mapCodexUserError(CODEX_ERROR_CODE.MOCK_WITHOUT_FORCE);
    expect(mapped.soft).toBe(true);
    expect(mapped.message).toMatch(/本机/);
  });
});
