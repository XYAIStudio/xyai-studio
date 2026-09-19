import { describe, expect, it } from 'vitest';
import { mapParseStatus } from './panel.js';

describe('mapParseStatus', () => {
  it('keeps successful parse green', () => {
    expect(mapParseStatus({ jobStatus: 'done', indexed: true })).toEqual({
      text: '已解析',
      cls: 'kb-st-done',
    });
  });

  it('does not paint warn-only empty extract as 已解析', () => {
    expect(
      mapParseStatus({
        jobStatus: 'warn',
        jobMessage: '未能提取到可索引正文',
        indexed: false,
      }),
    ).toEqual({ text: '无正文', cls: 'kb-st-failed' });
  });

  it('labels failed no-body parse as 无正文', () => {
    expect(
      mapParseStatus({
        jobStatus: 'failed',
        jobMessage: '解析未产生可检索正文，未写入索引',
      }),
    ).toEqual({ text: '无正文', cls: 'kb-st-failed' });
  });

  it('keeps generic failures as 无法解析', () => {
    expect(
      mapParseStatus({ jobStatus: 'failed', jobMessage: 'EACCES' }),
    ).toEqual({ text: '无法解析', cls: 'kb-st-failed' });
  });
});
