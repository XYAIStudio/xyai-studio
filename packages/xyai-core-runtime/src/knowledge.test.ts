import { describe, expect, it } from 'vitest';
import type { KnowledgeGateway, KnowledgeHit } from '@xyai/contracts';
import {
  applyKnowledgePrefix,
  emptyKnowledgeGateway,
  isKnowledgeSeekingQuery,
  normalizeKnowledgeHits,
  planKnowledgeContext,
  resolveKnowledgeContext,
  stubKnowledgeIngest,
} from './knowledge.js';

const localSrc = {
  id: 'kb-local',
  kind: 'local' as const,
  displayName: '手册',
};
const cloudSrc = {
  id: 'kb-cloud',
  kind: 'cloud' as const,
  displayName: '云资料',
};

const localHit: KnowledgeHit = {
  id: 'l1',
  sourceKind: 'local',
  sourceId: 'kb-local',
  title: '请假.md',
  snippet: '年假需提前三天申请。',
  score: 0.9,
};
const cloudHit: KnowledgeHit = {
  id: 'c1',
  sourceKind: 'cloud',
  sourceId: 'kb-cloud',
  title: '政策',
  snippet: '远程办公每周最多两天。',
  score: 0.8,
  uri: 'https://ima.example.invalid/policy',
};

describe('normalizeKnowledgeHits', () => {
  it('merges local + cloud, drops empty snippets, sorts by score', () => {
    const rows = normalizeKnowledgeHits({
      local: [
        { id: 'l1', sourceId: 'kb-local', title: '请假.md', snippet: '年假', score: 0.2 },
        { id: 'empty', snippet: '   ' },
      ],
      cloud: [
        {
          id: 'c1',
          sourceId: 'kb-cloud',
          title: '政策',
          snippet: '远程',
          score: 0.9,
          uri: 'https://example.invalid/p',
        },
        { id: 'l1', snippet: 'dup ignored' },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['c1', 'l1']);
    expect(rows[0]).toMatchObject({
      sourceKind: 'cloud',
      uri: 'https://example.invalid/p',
    });
    expect(rows[1]?.sourceKind).toBe('local');
  });
});

describe('planKnowledgeContext', () => {
  it('no-ops when sources are empty even if the query looks seeking', () => {
    expect(
      planKnowledgeContext({
        query: '公司请假政策是什么',
        sources: [],
        hits: [localHit],
      }),
    ).toEqual({
      attach: false,
      prefix: '',
      hits: [],
      reason: 'empty-sources',
    });
  });

  it('keeps 你好 on the same Session path with no prefix', () => {
    const plan = planKnowledgeContext({
      query: '你好',
      sources: [localSrc, cloudSrc],
      hits: [localHit, cloudHit],
    });
    expect(isKnowledgeSeekingQuery('你好')).toBe(false);
    expect(plan.attach).toBe(false);
    expect(plan.prefix).toBe('');
    expect(plan.reason).toBe('not-seeking');
    expect(applyKnowledgePrefix('你好', plan)).toBe('你好');
    expect(isKnowledgeSeekingQuery('帮我创建一个插件')).toBe(false);
    expect(
      planKnowledgeContext({
        query: '帮我创建一个插件',
        sources: [localSrc],
        hits: [localHit],
      }).reason,
    ).toBe('not-seeking');
  });

  it('attaches dual-source snippets for a seeking query', () => {
    const plan = planKnowledgeContext({
      query: '根据知识库，请假要提前几天？',
      sources: [localSrc, cloudSrc],
      hits: [localHit, cloudHit],
    });
    expect(plan.reason).toBe('attached');
    expect(plan.attach).toBe(true);
    expect(plan.hits.map((h) => h.sourceKind)).toEqual(['local', 'cloud']);
    expect(plan.prefix).toContain('【知识库检索：手册、云资料】');
    expect(plan.prefix).toContain('年假需提前三天申请。');
    expect(plan.prefix).toContain('远程办公每周最多两天。');
    expect(applyKnowledgePrefix('根据知识库，请假要提前几天？', plan)).toMatch(
      /【检索结束】\n\n根据知识库/,
    );
  });

  it('reports no-hits when seeking but retrieval is empty', () => {
    expect(
      planKnowledgeContext({
        query: '手册里的报销流程是什么',
        sources: [localSrc],
        hits: [],
      }).reason,
    ).toBe('no-hits');
  });

  it('does not double-attach when Composer already injected a banner', () => {
    expect(
      planKnowledgeContext({
        query: '【已挂载知识库：手册】\n请假政策',
        sources: [localSrc],
        hits: [localHit],
      }).reason,
    ).toBe('already-prefixed');
  });
});

describe('resolveKnowledgeContext', () => {
  it('does not call search for empty sources or 你好', async () => {
    let calls = 0;
    const gateway: KnowledgeGateway = {
      async search() {
        calls += 1;
        return [localHit];
      },
    };
    await resolveKnowledgeContext({
      query: '手册内容',
      sources: [],
      gateway,
    });
    await resolveKnowledgeContext({
      query: '你好',
      sources: [localSrc],
      gateway,
    });
    expect(calls).toBe(0);
    expect(await emptyKnowledgeGateway.search({ text: '手册' })).toEqual([]);
  });

  it('searches then attaches when the first plan is no-hits', async () => {
    const gateway: KnowledgeGateway = {
      async search(q) {
        expect(q.sourceIds).toEqual(['kb-local', 'kb-cloud']);
        return [cloudHit, localHit];
      },
    };
    const plan = await resolveKnowledgeContext({
      query: '知识库里的远程办公怎么规定',
      sources: [localSrc, cloudSrc],
      gateway,
    });
    expect(plan.reason).toBe('attached');
    expect(plan.hits).toHaveLength(2);
  });
});

describe('stubKnowledgeIngest', () => {
  it('keeps ingest as a real stub, not a silent skip', async () => {
    const result = stubKnowledgeIngest({
      sourceKind: 'cloud',
      title: 'note',
    });
    expect(result).toMatchObject({ ok: false, stub: true });
    expect(result.message).toContain('索引');
    expect(await emptyKnowledgeGateway.ingest?.({ sourceKind: 'local' })).toEqual(
      result,
    );
  });
});
