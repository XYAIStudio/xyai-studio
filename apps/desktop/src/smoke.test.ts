import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssemblyProfile } from '@xyai/core';
import { createCodexAdapter } from '@xyai/adapter-codex';
import { createXyosBridge } from '@xyai/xyos-bridge';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('desktop smoke path', () => {
  it('loads example profile, runs mock Codex turn, detects openXYOS submodule', async () => {
    const validation = await loadAssemblyProfile(
      path.join(repoRoot, 'assembly/profiles/0.5.0-dev.example.json'),
    );
    expect(validation.ok).toBe(true);
    expect(validation.profile.productVersion).toBe('0.5.0');

    const adapter = createCodexAdapter();
    await adapter.start({ sessionId: 't', harnessId: 'codex' });
    const types: string[] = [];
    for await (const ev of adapter.send({
      sessionId: 't',
      taskId: 't1',
      content: 'x',
    })) {
      types.push(ev.type);
    }
    expect(types).toContain('message.completed');

    const health = await createXyosBridge({
      componentRoot: path.join(repoRoot, 'components/openxyos'),
    }).healthCheck();
    expect(health.ok).toBe(true);
    expect(health.reason).toBe('submodule-present');
  });
});