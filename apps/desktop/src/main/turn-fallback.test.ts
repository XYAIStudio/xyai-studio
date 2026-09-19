import { describe, expect, it } from 'vitest';
import {
  classifyToolsFallback,
  isPlainUserCopy,
  TOOLS_FALLBACK_TIP,
  toolsFallbackPayload,
} from './turn-fallback.js';
import {
  CHAT_ONLY_NO_WRITE_TIP,
  HARNESS_PACKAGING_MESSAGE,
} from './turn-intent.js';

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

describe('tools fallback copy', () => {
  it('is plain Chinese without engine brand names', () => {
    for (const tip of Object.values(TOOLS_FALLBACK_TIP)) {
      expect(tip).toMatch(/[\u4e00-\u9fff]/);
      expect(isPlainUserCopy(tip)).toBe(true);
    }
    expect(isPlainUserCopy(toolsFallbackPayload('empty').message)).toBe(true);
    expect(isPlainUserCopy(CHAT_ONLY_NO_WRITE_TIP)).toBe(true);
    expect(isPlainUserCopy(HARNESS_PACKAGING_MESSAGE)).toBe(true);
  });
});
