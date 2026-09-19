import { describe, expect, it } from 'vitest';
import { inferCapabilityNeed, isToolCapability } from './turn-intent.js';

describe('inferCapabilityNeed', () => {
  it('keeps chitchat on chat', () => {
    expect(inferCapabilityNeed('你好')).toBe('chat');
    expect(inferCapabilityNeed('hello, how are you?')).toBe('chat');
    expect(inferCapabilityNeed('今天天气怎么样')).toBe('chat');
  });

  it('ignores accessMode for capability — 你好 + full stays chat', () => {
    expect(inferCapabilityNeed('你好', 'full')).toBe('chat');
    expect(inferCapabilityNeed('你好', 'auto')).toBe('chat');
    expect(inferCapabilityNeed('hello', 'full')).toBe('chat');
    expect(inferCapabilityNeed('你好', 'default')).toBe('chat');
  });

  it('forces tools for Chinese create/write/install language', () => {
    expect(inferCapabilityNeed('帮我创建一个插件')).toBe('tools');
    expect(inferCapabilityNeed('写一个技能到工作目录')).toBe('tools');
    expect(inferCapabilityNeed('安装这个 MCP')).toBe('tools');
    expect(inferCapabilityNeed('生成一份文档')).toBe('tools');
    expect(inferCapabilityNeed('放到个性化列表')).toBe('tools');
  });

  it('forces tools for English create/write/install language', () => {
    expect(inferCapabilityNeed('create a plugin in the workspace')).toBe(
      'tools',
    );
    expect(inferCapabilityNeed('write a file named hello.md')).toBe('tools');
    expect(inferCapabilityNeed('install this skill')).toBe('tools');
    expect(inferCapabilityNeed('add an MCP server')).toBe('tools');
  });

  it('create-plugin stays tools even under default access', () => {
    expect(inferCapabilityNeed('帮我创建一个插件', 'default')).toBe('tools');
    expect(inferCapabilityNeed('帮我创建一个插件', 'full')).toBe('tools');
  });

  it('marks planning phrases', () => {
    expect(inferCapabilityNeed('制定一个分步计划')).toBe('planning');
    expect(isToolCapability('planning')).toBe(true);
    expect(isToolCapability('chat')).toBe(false);
  });
});
