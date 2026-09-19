import { describe, expect, it } from 'vitest';
import {
  accessModeToPermissionMode,
  permissionModeToAccessMode,
  normalizeAccessMode,
  normalizePermissionMode,
  normalizeAgentKind,
  isToolCapability,
  protocolDrivesCodexTools,
  normalizeForgeAssetKind,
  interopKindForForge,
  workspaceFolderForKind,
  inferForgeKindFromWorkspaceRel,
  type AssemblyProfile,
  type AgentEvent,
  type Session,
  type KnowledgeGateway,
  type KnowledgeHit,
  type ForgeRequest,
  type ForgeResult,
  type AssetRegistry,
  type AssetRegistryEntry,
  assetRegistryId,
  isAssetSpace,
  normalizeAssetRegistryKind,
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

  it('treats Anthropic Messages as unable to drive Codex tools', () => {
    expect(protocolDrivesCodexTools('anthropic-messages')).toBe(false);
    expect(protocolDrivesCodexTools('chat-completions')).toBe(true);
  });

  it('composes KnowledgeGateway search hits for local and cloud', async () => {
    const hit: KnowledgeHit = {
      id: 'h1',
      sourceKind: 'local',
      sourceId: 'kb1',
      title: 'note',
      snippet: 'body',
      score: 1,
    };
    const gateway: KnowledgeGateway = {
      async search() {
        return [hit];
      },
    };
    expect((await gateway.search({ text: 'note' }))[0]?.sourceKind).toBe(
      'local',
    );
  });

  it('normalizes ForgeAssetKind aliases and maps install folders', () => {
    expect(normalizeForgeAssetKind('插件')).toBe('plugin');
    expect(normalizeForgeAssetKind('skills')).toBe('skill');
    expect(normalizeForgeAssetKind('管理系统')).toBe('system');
    expect(normalizeForgeAssetKind('文档')).toBe('doc');
    expect(normalizeForgeAssetKind('nope')).toBeUndefined();
    expect(workspaceFolderForKind('plugin')).toBe('plugins');
    expect(workspaceFolderForKind('system')).toBe('systems');
    expect(inferForgeKindFromWorkspaceRel('docs/手册')).toBe('doc');
    expect(interopKindForForge('doc')).toBe('knowledge-mount');
    expect(interopKindForForge('system')).toBe('system');
    const req: ForgeRequest = {};
    const res: ForgeResult = { ok: true, noop: true, stage: 'noop' };
    expect(req.kind).toBeUndefined();
    expect(res.noop).toBe(true);
  });

  it('composes AssetRegistry list/get/link/promote for dual-space rows', async () => {
    expect(isAssetSpace('dev')).toBe(true);
    expect(isAssetSpace('cloud')).toBe(false);
    expect(normalizeAssetRegistryKind('知识挂接')).toBe('knowledge-mount');
    expect(normalizeAssetRegistryKind('connector')).toBe('connector');
    expect(assetRegistryId('dev', 'personalize', 'p1')).toBe(
      'dev:personalize:p1',
    );
    const entry: AssetRegistryEntry = {
      id: 'dev:personalize:p1',
      space: 'dev',
      kind: 'plugin',
      name: 'demo',
      origin: 'personalize',
      sourceId: 'p1',
    };
    const registry: AssetRegistry = {
      list: () => [entry],
      get: (id) => (id === entry.id ? entry : undefined),
      link: () => ({ ok: true, noop: true, message: 'stub' }),
      promote: async () => ({ ok: true, noop: true, message: 'no-biz-root' }),
    };
    expect(registry.list()[0]?.space).toBe('dev');
    expect((await registry.promote('missing')).noop).toBe(true);
  });
});
