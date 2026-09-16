import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createXyosBridge, OPENXYOS_REPO_URL } from './bridge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

describe('@xyai/xyos-bridge', () => {
  it('detects openXYOS submodule checkout as present', async () => {
    const bridge = createXyosBridge({
      componentRoot: path.join(repoRoot, 'components/openxyos'),
    });
    const status = await bridge.healthCheck();
    expect(status.ok).toBe(true);
    expect(status.reason).toBe('submodule-present');
    expect(String(status.details?.repo ?? '')).toContain('XYAIStudio/openXYOS');
  });

  it('returns not-installed for empty placeholder dir', async () => {
    const bridge = createXyosBridge({
      componentRoot: path.join(repoRoot, 'components', '__missing_openxyos__'),
    });
    const status = await bridge.healthCheck();
    expect(status.ok).toBe(false);
    expect(status.reason).toBe('not-installed');
    expect(String(status.details?.hint ?? '')).toContain(OPENXYOS_REPO_URL);
  });
});