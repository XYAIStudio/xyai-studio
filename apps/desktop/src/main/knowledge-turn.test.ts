import { afterEach, describe, expect, it } from 'vitest';
import type { KnowledgeHit } from '@xyai/contracts';
import {
  configureKnowledgeTurn,
  createStudioKnowledgeGateway,
  maybeAttachKnowledgeContext,
  sourcesFromMounts,
} from './knowledge-turn.js';

afterEach(() => {
  configureKnowledgeTurn(null);
});

describe('sourcesFromMounts / createStudioKnowledgeGateway', () => {
  it('maps local + cloud mounts and searches both', async () => {
    const sources = sourcesFromMounts([
      { id: 'loc', kind: 'local', name: '手册' },
      { id: 'cld', kind: 'cloud', name: 'ima' },
    ]);
    expect(sources).toEqual([
      { id: 'loc', kind: 'local', displayName: '手册' },
      { id: 'cld', kind: 'cloud', displayName: 'ima' },
    ]);

    const gateway = createStudioKnowledgeGateway({
      getState: () => ({
        mounts: [
          { id: 'loc', kind: 'local', name: '手册' },
          { id: 'cld', kind: 'cloud', name: 'ima' },
        ],
      }),
      search: async ({ kbIds, query }) => {
        expect(kbIds).toEqual(['loc', 'cld']);
        expect(query).toBe('请假政策');
        return {
          hits: [
            {
              score: 0.9,
              chunk: {
                id: '1',
                kbId: 'loc',
                sourceKind: 'local',
                title: '请假.md',
                relativePath: '请假.md',
                text: '年假三天前申请',
                sourcePath: '/tmp/请假.md',
              },
            },
            {
              score: 0.7,
              chunk: {
                id: '2',
                kbId: 'cld',
                sourceKind: 'cloud',
                title: '政策',
                relativePath: '政策',
                text: '云端条款',
                sourcePath: 'media-1',
                sourceUrl: 'https://ima.example.invalid/p',
              },
            },
          ],
        };
      },
    });

    const hits = await gateway.search({
      text: '请假政策',
      sourceIds: ['loc', 'cld'],
    });
    expect(hits.map((h: KnowledgeHit) => h.sourceKind)).toEqual([
      'local',
      'cloud',
    ]);
    const ingested = await gateway.ingest?.({ sourceKind: 'local' });
    expect(ingested?.stub).toBe(true);
  });

  it('returns no hits when the host has no mounts', async () => {
    const gateway = createStudioKnowledgeGateway({
      getState: () => ({ mounts: [] }),
      search: async () => {
        throw new Error('should not search');
      },
    });
    expect(await gateway.search({ text: '手册' })).toEqual([]);
  });
});

describe('maybeAttachKnowledgeContext', () => {
  it('no-ops without a provider, empty sources, or 你好', async () => {
    expect(await maybeAttachKnowledgeContext('手册里写了什么')).toBe(
      '手册里写了什么',
    );

    configureKnowledgeTurn(() => ({
      gateway: {
        async search() {
          throw new Error('should not search');
        },
      },
      sources: [],
    }));
    expect(await maybeAttachKnowledgeContext('公司政策是什么')).toBe(
      '公司政策是什么',
    );

    configureKnowledgeTurn(() => ({
      gateway: {
        async search() {
          return [
            {
              id: 'x',
              sourceKind: 'local',
              sourceId: 'loc',
              title: 'doc',
              snippet: 'secret',
              score: 1,
            },
          ];
        },
      },
      sources: [{ id: 'loc', kind: 'local', displayName: '手册' }],
    }));
    expect(await maybeAttachKnowledgeContext('你好')).toBe('你好');
  });

  it('prepends hits on a seeking chat/tools query when sources exist', async () => {
    configureKnowledgeTurn(() => ({
      gateway: {
        async search() {
          return [
            {
              id: 'x',
              sourceKind: 'local',
              sourceId: 'loc',
              title: '插件说明.md',
              snippet: '插件入口是 index.ts',
              score: 1,
            },
          ];
        },
      },
      sources: [{ id: 'loc', kind: 'local', displayName: '手册' }],
    }));
    const out = await maybeAttachKnowledgeContext(
      '根据知识库创建一个插件',
    );
    expect(out).toContain('【知识库检索：手册】');
    expect(out).toContain('插件入口是 index.ts');
    expect(out.endsWith('根据知识库创建一个插件')).toBe(true);
  });
});
