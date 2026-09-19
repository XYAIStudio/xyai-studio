import { describe, expect, it } from 'vitest';
import {
  forgePlan,
  personalizeKindForForge,
  sanitizeForgeName,
  workspaceRelForForge,
} from './forge.js';

describe('normalize / path mapping', () => {
  it('maps each kind onto its workspace folder and personalize kind', () => {
    expect(workspaceRelForForge('plugin', 'demo-plugin')).toBe(
      'plugins/demo-plugin',
    );
    expect(workspaceRelForForge('skill', 'demo-skill')).toBe('skills/demo-skill');
    expect(workspaceRelForForge('mcp', 'demo-mcp')).toBe('mcp/demo-mcp');
    expect(workspaceRelForForge('agent', '值班')).toBe('agents/值班');
    expect(workspaceRelForForge('doc', '手册')).toBe('docs/手册');
    expect(workspaceRelForForge('system', '请假系统')).toBe('systems/请假系统');
    expect(personalizeKindForForge('doc')).toBe('doc');
    expect(personalizeKindForForge('system')).toBe('system');
    expect(sanitizeForgeName('../evil/name')).toBe('evil-name');
  });
});

describe('forgePlan', () => {
  it('no-ops an empty request so stream chat stays unbroken', () => {
    expect(forgePlan(undefined)).toEqual({
      action: 'noop',
      reason: 'empty-request',
      files: [],
    });
    expect(forgePlan({})).toEqual({
      action: 'noop',
      reason: 'empty-request',
      files: [],
    });
    expect(forgePlan({ kind: 'plugin' })).toEqual({
      action: 'noop',
      reason: 'empty-request',
      files: [],
    });
    expect(forgePlan({ capability: 'chat', name: 'demo' })).toEqual({
      action: 'noop',
      reason: 'chat-capability',
      files: [],
    });
  });

  it('normalizes kind aliases and maps the install path', () => {
    const plan = forgePlan({ kind: '插件', name: 'demo-plugin' });
    expect(plan).toMatchObject({
      action: 'run',
      reason: 'ready',
      kind: 'plugin',
      name: 'demo-plugin',
      workspaceRel: 'plugins/demo-plugin',
      personalizeKind: 'plugin',
    });
    expect(
      forgePlan({ kind: '管理系统', name: 'oa' }).workspaceRel,
    ).toBe('systems/oa');
    expect(forgePlan({ workspaceRel: 'docs/手册' })).toMatchObject({
      action: 'run',
      kind: 'doc',
      name: '手册',
      workspaceRel: 'docs/手册',
      personalizeKind: 'doc',
    });
  });

  it('drops path-escaping files and keeps safe ones', () => {
    const plan = forgePlan({
      kind: 'skill',
      name: 'pack',
      files: [
        { relativePath: 'SKILL.md', contents: '# hi' },
        { relativePath: '../escape.md', contents: 'no' },
        { relativePath: '/abs.md', contents: 'no' },
      ],
    });
    expect(plan.files).toEqual([{ relativePath: 'SKILL.md', contents: '# hi' }]);
  });
});
