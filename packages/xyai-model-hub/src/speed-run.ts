/**
 * 测速 with userData cache: reuse last successful tok/s unless force.
 */

import { formatSpeedTestMessage, speedTestOllamaModel } from './model-ops.js';
import type { SpeedTestResult } from './model-ops.js';
import { LocalSpeedCache } from './speed-cache.js';

export type PersistedSpeedTestResult = SpeedTestResult & { cached?: boolean };

export async function runPersistedSpeedTest(
  userDataPath: string,
  modelRef: string,
  options: { force?: boolean } = {},
): Promise<PersistedSpeedTestResult> {
  const cache = new LocalSpeedCache(userDataPath);
  if (!options.force) {
    const hit = cache.get(modelRef);
    if (hit?.ok) {
      return {
        ok: true,
        cached: true,
        tokensPerSec: hit.tokensPerSec,
        elapsedMs: hit.elapsedMs,
        evalCount: hit.evalCount,
        message: formatSpeedTestMessage(hit),
      };
    }
  }
  const result = await speedTestOllamaModel(modelRef);
  cache.putFromTest(modelRef, result);
  return { ...result, cached: false };
}
