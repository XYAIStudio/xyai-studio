import { describe, expect, it } from 'vitest';
import {
  accessModeToPermissionMode,
  permissionModeToAccessMode,
  normalizeAccessMode,
  normalizePermissionMode,
} from './index.js';

describe('accessMode ↔ PermissionMode', () => {
  it('maps default/auto/full → default/auto/bypass', () => {
    expect(accessModeToPermissionMode('default')).toBe('default');
    expect(accessModeToPermissionMode('auto')).toBe('auto');
    expect(accessModeToPermissionMode('full')).toBe('bypass');
  });

  it('round-trips the three persisted chips', () => {
    for (const chip of ['default', 'auto', 'full'] as const) {
      expect(
        permissionModeToAccessMode(accessModeToPermissionMode(chip)),
      ).toBe(chip);
    }
  });

  it('does not invent a chip for ask', () => {
    expect(permissionModeToAccessMode('ask')).toBe('default');
    expect(normalizeAccessMode('ask')).toBe('default');
    expect(normalizePermissionMode(undefined)).toBe('default');
  });
});
