/**
 * Stall watchdog: abort when no events arrive within a timeout.
 * Cindy Session uses 45 minutes. XYAI uses a shorter turn-level default
 * because streaming dialogue should emit events often.
 */

import type { TurnCapability } from '@xyai/contracts';

/** Cindy-shaped hung-session ceiling (reference only; not the XYAI default). */
export const STALL_TIMEOUT_CINDY_MS = 45 * 60 * 1000;

/** Default stall for tools / planning turns: 45s of silence. */
export const STALL_TIMEOUT_TOOLS_MS = 45_000;

/** Default stall for chat turns: 3 minutes of silence. */
export const STALL_TIMEOUT_CHAT_MS = 180_000;

/**
 * @param need Text-inferred turn capability
 * @returns Stall timeout in milliseconds for that need
 */
export function stallTimeoutForCapability(need: TurnCapability): number {
  return need === 'chat' ? STALL_TIMEOUT_CHAT_MS : STALL_TIMEOUT_TOOLS_MS;
}

export interface StallWatchdog {
  /** Restart the silence timer (call on each event). */
  reset(): void;
  /** Cancel the timer. Safe to call more than once. */
  dispose(): void;
}

export interface StallWatchdogOptions {
  timeoutMs: number;
  onStall: () => void;
}

/**
 * Arm a one-shot silence timer. `reset()` postpones it; `dispose()` cancels it.
 * @param options Timeout and abort callback
 * @returns Watchdog handle
 */
export function createStallWatchdog(
  options: StallWatchdogOptions,
): StallWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const arm = (): void => {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      if (disposed) return;
      options.onStall();
    }, options.timeoutMs);
  };

  arm();

  return {
    reset: arm,
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/**
 * Pulse a stall watchdog around an async iterable. Each yielded item resets the timer.
 * @param iter Upstream events
 * @param options Timeout and abort callback
 */
export async function* watchStall<T>(
  iter: AsyncIterable<T>,
  options: StallWatchdogOptions,
): AsyncGenerator<T> {
  const dog = createStallWatchdog(options);
  try {
    for await (const item of iter) {
      dog.reset();
      yield item;
    }
  } finally {
    dog.dispose();
  }
}
