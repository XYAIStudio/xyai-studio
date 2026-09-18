import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createXyosBridge } from './bridge.js';

describe('@xyai/xyos-bridge', () => {
  it('returns not-installed when component is placeholder only', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xyos-bridge-empty-'));
    try {
      // empty dir — no package.json / dist markers
      const status = await createXyosBridge({ componentRoot: dir }).healthCheck();
      expect(status.ok).toBe(false);
      expect(status.reason).toBe('not-installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
