import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAssemblyProfile } from '@xyai/core';
import { createCodexAdapter } from '@xyai/adapter-codex';
import { createXyosBridge } from '@xyai/xyos-bridge';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('desktop smoke path', () => {
  it('loads example profile and runs mock turn', async () => {
    const validation = await loadAssemblyProfile(
      path.join(repoRoot, 'assembly/profiles/0.5.0-dev.example.json'),
    );
    expect(validation.ok).toBe(true);
    expect(validation.profile.productVersion).toBe('0.5.0');
    expect(validation.profile.harnesses.map((h) => [h.id, h.enabled])).toEqual([
      ['codex', true],
      ['dsh', false],
      ['claude', false],
    ]);

    const adapter = createCodexAdapter({ forceMock: true });
    expect(adapter.isMock).toBe(true);
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

    const xyosRoot = path.join(repoRoot, 'components/openxyos');
    const health = await createXyosBridge({
      componentRoot: xyosRoot,
    }).healthCheck();

    const submodulePresent = await pathExists(path.join(xyosRoot, 'package.json'));
    expect(['not-installed', 'submodule-present']).toContain(
      health.reason,
    );
    if (submodulePresent) {
      expect(health.ok).toBe(true);
    } else {
      expect(health.ok).toBe(false);
      expect(health.reason).toBe('not-installed');
    }
  });
});
