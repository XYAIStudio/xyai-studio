import { describe, expect, it } from 'vitest';
import {
  normalizeImaKnowledgeBases,
  normalizeImaKnowledgeList,
  normalizeImaSearchHits,
  parseImaEnvelope,
} from './ima-client.js';

describe('parseImaEnvelope', () => {
  it('accepts retcode/errmsg envelope', () => {
    const env = parseImaEnvelope({
      retcode: 0,
      errmsg: 'ok',
      data: { info_list: [] },
    });
    expect(env.ok).toBe(true);
    expect(env.retcode).toBe(0);
    expect(env.data).toEqual({ info_list: [] });
  });

  it('accepts code/msg aliases', () => {
    const env = parseImaEnvelope({ code: 0, msg: 'success', data: { x: 1 } });
    expect(env.ok).toBe(true);
    expect(env.retcode).toBe(0);
  });

  it('surfaces errmsg when retcode != 0', () => {
    const env = parseImaEnvelope({
      retcode: 10001,
      errmsg: '没有权限',
      data: null,
    });
    expect(env.ok).toBe(false);
    expect(env.errmsg).toBe('没有权限');
  });
});

describe('normalize ima payloads', () => {
  it('normalizes knowledge bases from nested list', () => {
    const list = normalizeImaKnowledgeBases({
      searched_knowledge_base_list: [
        {
          knowledge_base: {
            knowledge_base_id: 'kb_1',
            title: '产品库',
          },
        },
      ],
    });
    expect(list).toEqual([{ id: 'kb_1', title: '产品库', raw: expect.any(Object) }]);
  });

  it('normalizes knowledge_list + folders', () => {
    const files = normalizeImaKnowledgeList({
      knowledge_list: [{ media_id: 'media_a', title: '说明.md' }],
      folders: [{ folder_id: 'folder_1', title: '归档' }],
    });
    expect(files.map((f) => f.id)).toEqual(['media_a', 'folder_1']);
    expect(files[0]?.name).toBe('说明.md');
    expect(files[1]?.name).toContain('归档');
  });

  it('normalizes search hits with highlight_content', () => {
    const hits = normalizeImaSearchHits({
      knowledge_list: [
        {
          media_id: 'media_x',
          title: 'FAQ',
          highlight_content: '答案片段',
        },
      ],
    });
    expect(hits).toEqual([
      {
        mediaId: 'media_x',
        title: 'FAQ',
        highlightContent: '答案片段',
        url: undefined,
      },
    ]);
  });
});
