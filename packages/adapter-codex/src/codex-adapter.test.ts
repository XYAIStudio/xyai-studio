import { describe, expect, it } from 'vitest';
import {
  buildCodexExecArgs,
  createCodexAdapter,
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
});
