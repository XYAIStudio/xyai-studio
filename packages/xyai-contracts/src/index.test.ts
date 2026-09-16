import { describe, expect, it } from 'vitest';
import type { AssemblyProfile, AgentEvent, Session } from './index.js';

describe('@xyai/contracts', () => {
  it('AssemblyProfile shape is usable', () => {
    const profile: AssemblyProfile = {
      productVersion: '0.5.0',
      profileId: '0.5.0-dev.example',
      harnesses: [{ id: 'codex', adapter: 'adapter-codex', enabled: true }],
      modules: [{ id: 'conversation', enabled: true }],
      components: [
        {
          id: 'openxyos',
          kind: 'submodule',
          path: 'components/openxyos',
          required: false,
          note: 'git submodule; user must add remote',
        },
      ],
    };
    expect(profile.harnesses[0]?.id).toBe('codex');
    expect(profile.modules.some((m) => m.id === 'ai-employees')).toBe(false);
  });

  it('AgentEvent and Session types compose', () => {
    const session: Session = {
      id: 's1',
      title: 'smoke',
      createdAt: '2026-09-17T00:00:00+08:00',
      updatedAt: '2026-09-17T00:00:00+08:00',
      harnessId: 'codex',
    };
    const event: AgentEvent = {
      type: 'message.completed',
      timestamp: session.updatedAt,
      sessionId: session.id,
      payload: { text: 'ok' },
    };
    expect(event.type).toBe('message.completed');
  });
});
