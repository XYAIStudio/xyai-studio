/**
 * Tools-turn stream fallback: packaging / empty / timeout / unavailable
 * always continue on ollama or custom HTTP stream with a soft Chinese tip.
 * Never silent, never brand names, never leave the host sending flag stuck
 * (host `finally` clears busy).
 */

export type ToolsFallbackReason =
  | 'packaging'
  | 'unavailable'
  | 'empty'
  | 'timeout';

export const TOOLS_STREAM_FALLBACK_CODE = 'TOOLS_STREAM_FALLBACK';

export const TOOLS_FALLBACK_TIP: Record<ToolsFallbackReason, string> = {
  packaging:
    '本机写文件组件未随安装包提供。已改用文字说明继续，不会在本机生成文件。',
  unavailable: '暂时无法在本机写文件或安装插件。已改用文字说明继续。',
  empty: '这次没能完成写入。已改用文字说明继续，请稍后再试。',
  timeout: '这次操作时间过长。已改用文字说明继续，请稍后再试。',
};

/**
 * Write-path soft tip is only for real tools / write turns.
 * Chat and knowledge `@` Q&A must never show「没能完成写入」.
 *
 * @param toolsNeed True when turn capability needs tools
 * @returns Whether the host may emit a write-fallback chip
 */
export function shouldShowWriteFallbackTip(toolsNeed: boolean): boolean {
  return toolsNeed === true;
}

/**
 * Decide whether a tools turn must leave the write path and keep chatting.
 * Chat turns return null (their stream path is already the qualification line).
 *
 * @param input Turn outcome flags after the write attempt (or before it, for packaging)
 * @returns Reason to stream-fallback, or null to keep the write result
 */
export function classifyToolsFallback(input: {
  toolsNeed: boolean;
  sawUseful: boolean;
  packagingMissing?: boolean;
  unavailable?: boolean;
  timedOut?: boolean;
}): ToolsFallbackReason | null {
  if (!shouldShowWriteFallbackTip(input.toolsNeed)) return null;
  if (input.packagingMissing) return 'packaging';
  if (input.timedOut) return 'timeout';
  if (input.unavailable) return 'unavailable';
  if (!input.sawUseful) return 'empty';
  return null;
}

/**
 * Soft transcript payload for a tools → stream fallback.
 *
 * @param reason Classified fallback
 * @returns Soft error payload (system chip, not a red banner)
 */
export function toolsFallbackPayload(reason: ToolsFallbackReason): {
  message: string;
  code: string;
  soft: true;
} {
  return {
    message: TOOLS_FALLBACK_TIP[reason],
    code:
      reason === 'packaging'
        ? 'HARNESS_PACKAGING'
        : reason === 'timeout'
          ? 'TIMEOUT'
          : TOOLS_STREAM_FALLBACK_CODE,
    soft: true,
  };
}

const BANNED_UI = /高级引擎|Codex|harness/i;

/** True when copy is safe to show in chat / settings chips. */
export function isPlainUserCopy(text: string): boolean {
  return !BANNED_UI.test(text);
}
