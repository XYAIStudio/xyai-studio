import { describe, expect, it } from 'vitest';
import { CodexAdapter } from '@xyai/adapter-codex';
import { listHarnesses } from '@xyai/core';
import {
  createAdapterForHarnessId,
  createCodexHostAdapter,
  resolveListedHarnessId,
} from './factory.js';
import { DEFAULT_STUDIO_ASSEMBLY } from './default-profile.js';

describe('harness factory', () => {
  it('resolves the enabled Codex adapter from the assembly profile', () => {
    const adapter = createCodexHostAdapter({ forceMock: true });
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.harnessId).toBe('codex');
    expect(adapter.isMock).toBe(true);
  });

  it('constructs disabled stubs by id without throwing', () => {
    const dsh = createAdapterForHarnessId('dsh', {
      profile: DEFAULT_STUDIO_ASSEMBLY,
    });
    const claude = createAdapterForHarnessId('claude', {
      profile: DEFAULT_STUDIO_ASSEMBLY,
    });
    expect(dsh.harnessId).toBe('dsh');
    expect(claude.harnessId).toBe('claude');
  });

  it('lists dsh/claude as disabled and falls back unknown ids to codex', () => {
    const ids = listHarnesses(DEFAULT_STUDIO_ASSEMBLY).map((h) => ({
      id: h.id,
      enabled: h.enabled,
    }));
    expect(ids).toEqual([
      { id: 'codex', enabled: true },
      { id: 'dsh', enabled: false },
      { id: 'claude', enabled: false },
    ]);
    expect(resolveListedHarnessId(DEFAULT_STUDIO_ASSEMBLY, 'unknown')).toBe(
      'codex',
    );
  });
});
