import { describe, expect, it } from 'vitest';
import {
  classifyToolsFallback,
  isPlainUserCopy,
  shouldShowWriteFallbackTip,
  TOOLS_FALLBACK_TIP,
  toolsFallbackPayload,
} from './turn-fallback.js';

describe('classifyToolsFallback', () => {
  it('does not fallback chat turns', () => {
    expect(
      classifyToolsFallback({ toolsNeed: false, sawUseful: false }),
    ).toBeNull();
  });

  it('falls back packaging / timeout / unavailable / empty on tools', () => {
    expect(
      classifyToolsFallback({
        toolsNeed: true,
        sawUseful: false,
        packagingMissing: true,
      }),
    ).toBe('packaging');
    expect(
      classifyToolsFallback({
        toolsNeed: true,
        sawUseful: false,
        timedOut: true,
      }),
    ).toBe('timeout');
    expect(
      classifyToolsFallback({
        toolsNeed: true,
        sawUseful: false,
        unavailable: true,
      }),
    ).toBe('unavailable');
    expect(
      classifyToolsFallback({ toolsNeed: true, sawUseful: false }),
    ).toBe('empty');
  });

  it('keeps a useful tools result', () => {
    expect(
      classifyToolsFallback({ toolsNeed: true, sawUseful: true }),
    ).toBeNull();
  });
});

describe('shouldShowWriteFallbackTip', () => {
  it('hides the write tip on chat / knowledge turns', () => {
    expect(shouldShowWriteFallbackTip(false)).toBe(false);
    expect(
      classifyToolsFallback({ toolsNeed: false, sawUseful: false }),
    ).toBeNull();
  });

  it('shows the write tip only when tools were intended', () => {
    expect(shouldShowWriteFallbackTip(true)).toBe(true);
    expect(isPlainUserCopy(TOOLS_FALLBACK_TIP.empty)).toBe(true);
    expect(TOOLS_FALLBACK_TIP.empty).toContain('没能完成写入');
  });
});

describe('tools fallback copy', () => {
  it('is plain Chinese without engine brand names', () => {
    for (const tip of Object.values(TOOLS_FALLBACK_TIP)) {
      expect(tip).toMatch(/[\u4e00-\u9fff]/);
      expect(isPlainUserCopy(tip)).toBe(true);
    }
    expect(isPlainUserCopy(toolsFallbackPayload('empty').message)).toBe(true);
  });
});
