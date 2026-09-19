import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STALL_TIMEOUT_CHAT_MS,
  STALL_TIMEOUT_CINDY_MS,
  STALL_TIMEOUT_TOOLS_MS,
  createStallWatchdog,
  stallTimeoutForCapability,
  watchStall,
} from './stall-watchdog.js';

describe('stallTimeoutForCapability', () => {
  it('uses the short tools default and a longer chat default', () => {
    expect(stallTimeoutForCapability('tools')).toBe(STALL_TIMEOUT_TOOLS_MS);
    expect(stallTimeoutForCapability('planning')).toBe(STALL_TIMEOUT_TOOLS_MS);
    expect(stallTimeoutForCapability('chat')).toBe(STALL_TIMEOUT_CHAT_MS);
    expect(STALL_TIMEOUT_TOOLS_MS).toBeGreaterThanOrEqual(20_000);
    expect(STALL_TIMEOUT_TOOLS_MS).toBeLessThanOrEqual(45_000);
    expect(STALL_TIMEOUT_CHAT_MS).toBeGreaterThan(STALL_TIMEOUT_TOOLS_MS);
    expect(STALL_TIMEOUT_CHAT_MS).toBeLessThan(STALL_TIMEOUT_CINDY_MS);
  });
});

describe('createStallWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onStall after timeout and reset postpones it', () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const dog = createStallWatchdog({ timeoutMs: 1_000, onStall });
    vi.advanceTimersByTime(999);
    expect(onStall).not.toHaveBeenCalled();
    dog.reset();
    vi.advanceTimersByTime(999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
    dog.dispose();
  });

  it('dispose prevents a pending fire', () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const dog = createStallWatchdog({ timeoutMs: 500, onStall });
    dog.dispose();
    vi.advanceTimersByTime(1_000);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe('watchStall', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('yields items and aborts when silence exceeds the timeout', async () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    async function* source(): AsyncGenerator<string> {
      yield 'a';
      await new Promise((r) => setTimeout(r, 2_000));
      yield 'b';
    }
    const collected: string[] = [];
    const run = (async () => {
      for await (const item of watchStall(source(), {
        timeoutMs: 1_000,
        onStall,
      })) {
        collected.push(item);
      }
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(collected).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onStall).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await run;
    expect(collected).toEqual(['a', 'b']);
  });
});
