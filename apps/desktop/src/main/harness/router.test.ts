import { describe, expect, it } from 'vitest';
import { chooseHarness, ollamaTurnUsesHarness } from './router.js';

const healthy = {
  codexReady: true,
  dshReady: false,
  localStreamReady: true,
};

const noHarness = {
  codexReady: false,
  dshReady: false,
  localStreamReady: true,
};

describe('chooseHarness', () => {
  it('auto chat always uses local stream even when Codex is healthy', () => {
    expect(chooseHarness('chat', healthy, 'auto')).toEqual({
      harness: 'local-stream',
      reason: 'auto: stream qualification',
    });
    expect(ollamaTurnUsesHarness('auto', 'chat')).toBe(false);
  });

  it('auto tools uses Codex when healthy, else stream', () => {
    expect(chooseHarness('tools', healthy, 'auto').harness).toBe('codex');
    expect(chooseHarness('tools', noHarness, 'auto').harness).toBe(
      'local-stream',
    );
    expect(ollamaTurnUsesHarness('auto', 'tools')).toBe(true);
  });

  it('local-stream forces ollama stream', () => {
    expect(chooseHarness('tools', healthy, 'local-stream').harness).toBe(
      'local-stream',
    );
    expect(ollamaTurnUsesHarness('local-stream', 'chat')).toBe(false);
  });

  it('codex-oss uses Codex when ready, else soft stream', () => {
    expect(chooseHarness('chat', healthy, 'codex-oss').harness).toBe('codex');
    expect(chooseHarness('chat', noHarness, 'codex-oss').harness).toBe(
      'local-stream',
    );
    expect(ollamaTurnUsesHarness('codex-oss', 'chat')).toBe(true);
  });

  it('dsh/claude stubs degrade chat to stream', () => {
    expect(chooseHarness('chat', healthy, 'dsh').harness).toBe('local-stream');
    expect(chooseHarness('chat', healthy, 'claude').harness).toBe(
      'local-stream',
    );
  });

  it('dsh/claude tools lift to Codex when the stub is not ready', () => {
    expect(chooseHarness('tools', healthy, 'dsh').harness).toBe('codex');
    expect(chooseHarness('tools', healthy, 'claude').harness).toBe('codex');
    expect(ollamaTurnUsesHarness('dsh', 'tools')).toBe(true);
    expect(ollamaTurnUsesHarness('claude', 'tools')).toBe(true);
  });
});
