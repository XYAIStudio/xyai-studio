import { describe, expect, it } from 'vitest';
import {
  localModelViaHarnessFromEngineMode,
  normalizeEngineMode,
} from './engine-mode.js';

describe('normalizeEngineMode', () => {
  it('defaults to auto when neither key is present', () => {
    expect(normalizeEngineMode({})).toBe('auto');
  });

  it('maps legacy localModelViaHarness only when engineMode is absent', () => {
    expect(
      normalizeEngineMode({
        localModelViaHarness: true,
        hasLocalModelViaHarness: true,
      }),
    ).toBe('codex-oss');
    expect(
      normalizeEngineMode({
        localModelViaHarness: false,
        hasLocalModelViaHarness: true,
      }),
    ).toBe('local-stream');
    expect(
      normalizeEngineMode({
        engineMode: 'auto',
        localModelViaHarness: true,
        hasLocalModelViaHarness: true,
      }),
    ).toBe('auto');
  });

  it('derives the boolean only for codex-oss', () => {
    expect(localModelViaHarnessFromEngineMode('auto')).toBe(false);
    expect(localModelViaHarnessFromEngineMode('local-stream')).toBe(false);
    expect(localModelViaHarnessFromEngineMode('codex-oss')).toBe(true);
    expect(localModelViaHarnessFromEngineMode('claude')).toBe(false);
  });
});
