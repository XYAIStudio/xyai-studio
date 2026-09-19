import { afterEach, describe, expect, it } from 'vitest';
import { assetRegistryId } from '@xyai/contracts';
import {
  configureAssetRegistry,
  getAssetRegistry,
  interopKindForRegistry,
  refreshAssetRegistry,
  rowsFromInterop,
  rowsFromPersonalize,
} from './asset-registry-host.js';
import type { PersonalAsset } from './personalize/types.js';

afterEach(() => {
  configureAssetRegistry(null);
});

describe('asset-registry-host', () => {
  it('maps personalize + interop rows without a new store', () => {
    const personal: PersonalAsset = {
      id: 'p1',
      kind: 'plugin',
      name: 'demo',
      source: 'user',
      status: 'installed',
      pathOrRef: '/ws/plugins/demo',
      description: '工作目录 plugin',
    };
    expect(rowsFromPersonalize([personal])).toEqual([
      {
        id: 'p1',
        name: 'demo',
        kind: 'plugin',
        ref: '/ws/plugins/demo',
        description: '工作目录 plugin',
        linkedId: undefined,
      },
    ]);
    expect(
      rowsFromInterop([
        {
          id: 'p1',
          kind: 'plugin',
          name: 'demo',
          payload: { pathOrRef: 'interop/p1' },
          direction: 'dev-to-biz',
          status: 'pending',
          createdAt: 't',
          updatedAt: 't',
          sourceSpace: 'dev',
        },
      ]),
    ).toMatchObject([{ id: 'p1', kind: 'plugin', ref: 'interop/p1' }]);
    expect(interopKindForRegistry('doc')).toBe('knowledge-mount');
    expect(interopKindForRegistry('agent')).toBe('agent');
  });

  it('refreshes a dual-space list and no-ops promote without a biz root', async () => {
    configureAssetRegistry({
      loadSnapshot: () => ({
        personalize: [{ id: 'p1', name: 'demo', kind: 'plugin' }],
        openxyos: [{ id: 'b1', name: '业务手册', kind: 'knowledge-mount' }],
        bizRootPresent: false,
      }),
    });
    const items = await refreshAssetRegistry();
    expect(items.map((i) => i.space)).toEqual(['dev', 'biz']);
    expect(getAssetRegistry().list({ space: 'biz' })).toHaveLength(1);
    const promoted = await getAssetRegistry().promote(
      assetRegistryId('dev', 'personalize', 'p1'),
    );
    expect(promoted).toMatchObject({
      ok: true,
      noop: true,
      message: 'no-biz-root',
    });
  });
});
