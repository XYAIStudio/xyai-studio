/**
 * Heuristic capability need from user text only.
 * accessMode is unused here: it maps to sandbox strength in planTurn,
 * and must never force tools (chitchat + 完全访问 stays on stream).
 */

import { inferTurnCapability } from '@xyai/core-runtime';
import type { AccessMode } from './settings.js';
import type { CapabilityNeed } from './harness/router.js';

export { isToolCapability } from '@xyai/core-runtime';

/**
 * @param userText Latest user message
 * @param _accessMode Ignored. Kept so call sites can pass the chip; need is text-only.
 * @returns chat | tools | planning
 */
export function inferCapabilityNeed(
  userText: string,
  _accessMode?: AccessMode,
): CapabilityNeed {
  void _accessMode;
  return inferTurnCapability(userText);
}

/** System line for stream-only turns that looked like create/write work. */
export const CHAT_ONLY_NO_WRITE_SYSTEM =
  '你当前无法在用户电脑上创建或修改文件，也不能安装插件。请用文字说明做法，不要声称已经写入本地文件，也不要让用户复制 PowerShell。';

export const CHAT_ONLY_NO_WRITE_TIP =
  '当前无法在本机写文件或安装插件。已按文字说明继续，不会在本机生成文件。';

export const HARNESS_PACKAGING_MESSAGE =
  '本机写文件组件未随安装包提供。已改用文字说明继续，不会在本机生成文件。';
