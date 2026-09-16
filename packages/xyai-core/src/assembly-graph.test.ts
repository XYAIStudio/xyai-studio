import { describe, expect, it } from 'vitest';
import { validateAssemblyProfile, enabledModuleIds } from './assembly-graph.js';
import { SessionRegistry } from './session-registry.js';

describe('@xyai/core assembly', () => {
  it('accepts a valid 0.5 profile without ai-employees', () => {
    const result = validateAssemblyProfile({
      productVersion: '0.5.0',
      profileId: '0.5.0-dev.example',
      harnesses: [{ id: 'codex', adapter: 'adapter-codex', enabled: true }],
      modules: [
        { id: 'conversation', enabled: true },
        { id: 'ai-employees', enabled: false, optional: true, note: 'M4 deferred' },
      ],
      components: [],
    });
    expect(result.ok).toBe(true);
    expect(enabledModuleIds(result.profile)).toEqual(['conversation']);
  });

  it('rejects profile with no enabled harness', () => {
    const result = validateAssemblyProfile({
      productVersion: '0.5.0',
      profileId: 'bad',
      harnesses: [{ id: 'codex', adapter: 'adapter-codex', enabled: false }],
      modules: [],
      components: [],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'harnesses')).toBe(true);
  });
});

describe('@xyai/core SessionRegistry', () => {
  it('creates and retrieves sessions', () => {
    const reg = new SessionRegistry();
    const s = reg.create({ id: 's1', title: 't', harnessId: 'codex' });
    expect(reg.get('s1')?.title).toBe('t');
    expect(reg.list()).toHaveLength(1);
    expect(s.harnessId).toBe('codex');
  });
});
