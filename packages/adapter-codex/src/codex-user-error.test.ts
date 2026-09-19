import { describe, expect, it } from 'vitest';
import {
  CODEX_ERROR_CODE,
  isHarnessUnavailablePayload,
  mapCodexSpawnError,
  mapCodexUserError,
} from './codex-user-error.js';

describe('mapCodexUserError', () => {
  it('maps missing binary / spawn / ENOENT / mock-without-force to Chinese soft copy', () => {
    for (const code of Object.values(CODEX_ERROR_CODE)) {
      const mapped = mapCodexUserError(code);
      expect(mapped.soft).toBe(true);
      expect(mapped.code).toBe(code);
      expect(mapped.message).toMatch(/[\u4e00-\u9fff]/);
      expect(mapped.message).not.toMatch(/Error:|at |stack/i);
      expect(mapped.message).not.toMatch(/ENOENT|spawn /);
    }
  });

  it('does not leak spawn Error.message into the UI payload', () => {
    const err = Object.assign(new Error('spawn C:\\\\missing\\\\codex.exe ENOENT'), {
      code: 'ENOENT',
    });
    const mapped = mapCodexSpawnError(err);
    expect(mapped.code).toBe(CODEX_ERROR_CODE.ENOENT);
    expect(mapped.message).not.toContain('codex.exe');
    expect(mapped.message).not.toContain('ENOENT');
    expect(mapped.soft).toBe(true);
  });

  it('treats known codes as harness-unavailable for host fallback', () => {
    expect(
      isHarnessUnavailablePayload({
        code: CODEX_ERROR_CODE.BIN_MISSING,
        message: 'x',
      }),
    ).toBe(true);
    expect(isHarnessUnavailablePayload({ message: 'session not started' })).toBe(
      false,
    );
  });
});
