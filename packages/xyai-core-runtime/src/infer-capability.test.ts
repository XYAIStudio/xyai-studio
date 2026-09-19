import { describe, expect, it } from 'vitest';
import { inferTurnCapability, isToolCapability } from './infer-capability.js';

describe('inferTurnCapability', () => {
  it('keeps chitchat on chat', () => {
    expect(inferTurnCapability('你好')).toBe('chat');
    expect(inferTurnCapability('hello, how are you?')).toBe('chat');
    expect(inferTurnCapability('今天天气怎么样')).toBe('chat');
  });

  it('ignores PermissionMode for capability — 你好 + bypass stays chat', () => {
    expect(inferTurnCapability('你好', 'bypass')).toBe('chat');
    expect(inferTurnCapability('你好', 'auto')).toBe('chat');
    expect(inferTurnCapability('hello', 'bypass')).toBe('chat');
    expect(inferTurnCapability('你好', 'default')).toBe('chat');
    expect(inferTurnCapability('你好', 'ask')).toBe('chat');
  });

  it('forces tools for Chinese create/write/install language', () => {
    expect(inferTurnCapability('帮我创建一个插件')).toBe('tools');
    expect(inferTurnCapability('写一个技能到工作目录')).toBe('tools');
    expect(inferTurnCapability('安装这个 MCP')).toBe('tools');
    expect(inferTurnCapability('生成一份文档')).toBe('tools');
    expect(inferTurnCapability('放到个性化列表')).toBe('tools');
  });

  it('forces tools for English create/write/install language', () => {
    expect(inferTurnCapability('create a plugin in the workspace')).toBe(
      'tools',
    );
    expect(inferTurnCapability('write a file named hello.md')).toBe('tools');
    expect(inferTurnCapability('install this skill')).toBe('tools');
    expect(inferTurnCapability('add an MCP server')).toBe('tools');
  });

  it('create-plugin stays tools even under default access', () => {
    expect(inferTurnCapability('帮我创建一个插件', 'default')).toBe('tools');
    expect(inferTurnCapability('帮我创建一个插件', 'bypass')).toBe('tools');
  });

  it('marks planning phrases', () => {
    expect(inferTurnCapability('制定一个分步计划')).toBe('planning');
    expect(isToolCapability('planning')).toBe(true);
    expect(isToolCapability('chat')).toBe(false);
  });
});
