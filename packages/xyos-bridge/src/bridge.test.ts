import { describe, expect, it } from 'vitest';
import path from 'node:path';
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
});
