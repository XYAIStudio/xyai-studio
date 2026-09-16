import { describe, expect, it } from 'vitest';
import { resolveCodexBinary } from './resolve-codex-bin.js';
import path from 'node:path';
import { existsSync } from 'node:fs';

describe('resolveCodexBinary', () => {
  it('returns null path when override points at missing file', () => {
    const r = resolveCodexBinary({
      binaryPath: path.join('/tmp', 'xyai-no-such-codex-bin'),
    });
    expect(r.path).toBeNull();
    expect(r.source).toBeNull();
  });

  it('resolves override when file exists', () => {
    // This test file itself exists — use as a stand-in path check only
    const self = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      'resolve-codex-bin.test.ts',
    );
    // On Windows URL pathname may need decode; fall back to import.meta
    const candidate = existsSync(self)
      ? self
      : new URL('./resolve-codex-bin.test.ts', import.meta.url).pathname;
    if (!existsSync(candidate)) {
      // Skip soft if path quirks
      expect(true).toBe(true);
      return;
    }
    const r = resolveCodexBinary({ binaryPath: candidate });
    expect(r.path).toBe(candidate);
    expect(r.source).toBe('override');
  });

  it('returns a structured result (package|path|null) without throwing', () => {
    const r = resolveCodexBinary();
    expect(r).toHaveProperty('path');
    expect(r).toHaveProperty('source');
    if (r.path) {
      expect(existsSync(r.path)).toBe(true);
      expect(['package', 'path', 'env']).toContain(r.source);
    } else {
      expect(r.source).toBeNull();
    }
  });
});
