import { describe, expect, it } from 'vitest';
import {
  accessModeToPermissionMode,
  permissionModeToAccessMode,
  normalizeAccessMode,
  normalizePermissionMode,
  normalizeAgentKind,
  isToolCapability,
  type AssemblyProfile,
  type AgentEvent,
  type Session,
} from './index.js';

describe('@xyai/contracts', () => {
  it('AssemblyProfile shape is usable', () => {
    const profile: AssemblyProfile = {
      productVersion: '0.5.0',
      profileId: '0.5.0-dev.example',
      harnesses: [
        { id: 'codex', adapter: 'adapter-codex', enabled: true },
        { id: 'dsh', adapter: 'adapter-dsh', enabled: false },
        { id: 'claude', adapter: 'adapter-claude', enabled: false },
      ],
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

  it('maps accessMode default/auto/full onto PermissionMode default/auto/bypass', () => {
    expect(accessModeToPermissionMode('default')).toBe('default');
    expect(accessModeToPermissionMode('auto')).toBe('auto');
    expect(accessModeToPermissionMode('full')).toBe('bypass');
  });

  it('maps PermissionMode back onto the persisted chip', () => {
    expect(permissionModeToAccessMode('default')).toBe('default');
    expect(permissionModeToAccessMode('auto')).toBe('auto');
    expect(permissionModeToAccessMode('bypass')).toBe('full');
    expect(permissionModeToAccessMode('ask')).toBe('default');
  });

  it('normalizes unknown access and permission values to default', () => {
    expect(normalizeAccessMode('nope')).toBe('default');
    expect(normalizePermissionMode('bypassPermissions')).toBe('default');
    expect(normalizePermissionMode('bypass')).toBe('bypass');
    expect(normalizeAgentKind('pi')).toBe('codex');
    expect(normalizeAgentKind('dsh')).toBe('dsh');
  });

  it('treats planning as a tool capability and chat as not', () => {
    expect(isToolCapability('planning')).toBe(true);
    expect(isToolCapability('tools')).toBe(true);
    expect(isToolCapability('chat')).toBe(false);
  });
});
