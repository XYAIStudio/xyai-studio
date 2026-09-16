import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createXyosBridge } from './bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// monorepo root: packages/xyos-bridge/src -> ../../..
const repoRoot = path.resolve(here, '../../..');

describe('@xyai/xyos-bridge', () => {
  it('returns not-installed when component is placeholder only', async () => {
    const bridge = createXyosBridge({
      componentRoot: path.join(repoRoot, 'components/openxyos'),
    });
    const status = await bridge.healthCheck();
    expect(status.ok).toBe(false);
    expect(status.reason).toBe('not-installed');
  });

  it('returns submodule-present when package.json exists', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyos-bridge-'));
    try {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'openxyos-fixture', private: true }),
        'utf8',
      );
      const status = await createXyosBridge({ componentRoot: dir }).healthCheck();
      expect(status.ok).toBe(true);
      expect(status.reason).toBe('submodule-present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
