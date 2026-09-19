import { describe, expect, it } from 'vitest';
import { assetRegistryId } from '@xyai/contracts';
import { createAssetRegistry, indexAssetRegistry } from './registry.js';

describe('indexAssetRegistry', () => {
  it('returns an empty list for a missing or empty snapshot', () => {
    expect(indexAssetRegistry(undefined)).toEqual([]);
    expect(indexAssetRegistry({})).toEqual([]);
    expect(createAssetRegistry().list()).toEqual([]);
    expect(createAssetRegistry({ snapshot: {} }).get('missing')).toBeUndefined();
  });

  it('lists both spaces and auto-links the same source id', () => {
    const rows = indexAssetRegistry({
      personalize: [
        {
          id: 'p1',
          name: '值班插件',
          kind: 'plugin',
          ref: '/personalize/installed/plugin/p1',
        },
      ],
      workspace: [
        {
          id: 'w1',
          name: '手册',
          kind: 'doc',
          ref: '/workspace/docs/手册',
        },
      ],
      openxyos: [
        {
          id: 'p1',
          name: '值班插件',
          kind: 'plugin',
          ref: 'interop/p1',
        },
      ],
    });
    expect(rows.map((r) => r.space)).toEqual(['dev', 'dev', 'biz']);
    expect(rows.map((r) => r.origin)).toEqual([
      'personalize',
      'workspace',
      'openxyos',
    ]);
    const dev = rows.find((r) => r.origin === 'personalize');
    const biz = rows.find((r) => r.space === 'biz');
    expect(dev?.linkedId).toBe(biz?.id);
    expect(biz?.linkedId).toBe(dev?.id);
    expect(dev?.id).toBe(assetRegistryId('dev', 'personalize', 'p1'));
  });
});

describe('createAssetRegistry.promote', () => {
  it('no-ops promote when the biz root is absent', async () => {
    const called: string[] = [];
    const registry = createAssetRegistry({
      snapshot: {
        personalize: [{ id: 'p1', name: 'demo', kind: 'plugin' }],
        bizRootPresent: false,
      },
      promote: (entry) => {
        called.push(entry.id);
      },
    });
    const res = await registry.promote(
      assetRegistryId('dev', 'personalize', 'p1'),
    );
    expect(res).toMatchObject({
      ok: true,
      noop: true,
      message: 'no-biz-root',
    });
    expect(called).toEqual([]);
  });

  it('calls the host hook when the biz root is present', async () => {
    const called: string[] = [];
    const registry = createAssetRegistry({
      snapshot: {
        personalize: [{ id: 'p1', name: 'demo', kind: 'plugin' }],
        bizRootPresent: true,
      },
      promote: (entry) => {
        called.push(entry.sourceId);
      },
    });
    const res = await registry.promote(
      assetRegistryId('dev', 'personalize', 'p1'),
    );
    expect(res.ok).toBe(true);
    expect(res.noop).toBeUndefined();
    expect(called).toEqual(['p1']);
  });

  it('filters list by space and keeps an explicit link across refresh', () => {
    const registry = createAssetRegistry({
      snapshot: {
        personalize: [{ id: 'a', name: 'A', kind: 'skill' }],
        openxyos: [{ id: 'b', name: 'B', kind: 'skill' }],
      },
    });
    const linked = registry.link(
      assetRegistryId('dev', 'personalize', 'a'),
      assetRegistryId('biz', 'openxyos', 'b'),
    );
    expect(linked.ok).toBe(true);
    expect(linked.entry?.linkedId).toBe(
      assetRegistryId('biz', 'openxyos', 'b'),
    );
    registry.refresh({
      personalize: [{ id: 'a', name: 'A', kind: 'skill' }],
      openxyos: [{ id: 'b', name: 'B', kind: 'skill' }],
    });
    expect(registry.list({ space: 'dev' })).toHaveLength(1);
    expect(registry.list({ space: 'biz' })).toHaveLength(1);
    expect(registry.get(assetRegistryId('dev', 'personalize', 'a'))?.linkedId).toBe(
      assetRegistryId('biz', 'openxyos', 'b'),
    );
  });
});
