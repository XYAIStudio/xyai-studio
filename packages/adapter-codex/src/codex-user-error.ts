/**
 * Map Codex adapter failure codes to plain Chinese UI copy.
 * Never leak spawn stacks or engineer jargon into the chat surface.
 */

export const CODEX_ERROR_CODE = {
  BIN_MISSING: 'CODEX_BIN_MISSING',
  SPAWN_ERROR: 'SPAWN_ERROR',
  ENOENT: 'ENOENT',
  MOCK_WITHOUT_FORCE: 'MOCK_WITHOUT_FORCE',
  TIMEOUT: 'TIMEOUT',
} as const;

export type CodexErrorCode =
  (typeof CODEX_ERROR_CODE)[keyof typeof CODEX_ERROR_CODE];

const ZH: Record<CodexErrorCode, string> = {
  CODEX_BIN_MISSING:
    '写文件组件暂未就绪，已用本机模型继续流式回答。可稍后在设置中配置组件路径。',
  SPAWN_ERROR: '暂时无法启动本机写文件，已改用本机模型继续回答。',
  ENOENT: '未找到本机写文件组件，已用本机模型继续回答。',
  MOCK_WITHOUT_FORCE:
    '写文件组件暂未就绪，已用本机模型继续流式回答。可稍后在设置中配置组件路径。',
  TIMEOUT: '这次操作时间过长，已改用本机对话继续。',
};

export interface CodexUserErrorPayload {
  message: string;
  code: string;
  soft: true;
}

export function isCodexErrorCode(code: unknown): code is CodexErrorCode {
  return (
    code === CODEX_ERROR_CODE.BIN_MISSING ||
    code === CODEX_ERROR_CODE.SPAWN_ERROR ||
    code === CODEX_ERROR_CODE.ENOENT ||
    code === CODEX_ERROR_CODE.MOCK_WITHOUT_FORCE ||
    code === CODEX_ERROR_CODE.TIMEOUT
  );
}

/** True when a harness turn should soft-fallback to local stream. */
export function isHarnessUnavailablePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (isCodexErrorCode(p.code)) return true;
  if (p.soft === true && typeof p.code === 'string' && isCodexErrorCode(p.code)) {
    return true;
  }
  return false;
}

/**
 * @param code Structured adapter failure code
 * @returns Soft payload suitable for a system chip (not a red error)
 */
export function mapCodexUserError(code: string): CodexUserErrorPayload {
  const known = isCodexErrorCode(code) ? code : CODEX_ERROR_CODE.SPAWN_ERROR;
  return {
    message: ZH[known],
    code: known,
    soft: true,
  };
}

/**
 * Classify a spawn/ENOENT failure without exposing the raw Error message.
 * @param err Node spawn error (may carry `code`)
 */
export function mapCodexSpawnError(err: { code?: string } | Error): CodexUserErrorPayload {
  const code =
    err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT'
      ? CODEX_ERROR_CODE.ENOENT
      : CODEX_ERROR_CODE.SPAWN_ERROR;
  return mapCodexUserError(code);
}
