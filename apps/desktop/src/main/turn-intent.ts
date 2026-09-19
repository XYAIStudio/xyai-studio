/**
 * Heuristic capability need from user text + access mode.
 * Create / write / install language forces the tools path so cloud and local
 * models go through the advanced engine instead of bare chat.
 */

import type { AccessMode } from './settings.js';
import type { CapabilityNeed } from './harness/router.js';

/**
 * Chinese + English markers for file / plugin / skill / MCP / workspace work.
 * Bare chitchat must not match.
 */
const TOOLS_RE = new RegExp(
  [
    '创建.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录|页面|html)',
    '新建.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录)',
    '生成.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录|页面|html)',
    '写(入|一个|一份|些)?(文件|插件|技能|代码|脚本|文档|到)',
    '保存到',
    '安装.{0,12}(插件|技能|mcp|连接器|智能体)',
    '装到.{0,8}(个性化|工作目录)',
    '插件',
    '技能',
    '个性化',
    '工作目录',
    'mcp服务器',
    '\\bmcp\\b',
    '\\b(create|write|install|save|generate)\\b.{0,24}\\b(file|plugin|skill|agent|mcp|connector|document|workspace|html)\\b',
    '\\b(plugin|skill|mcp|connector)\\b',
    '\\bworkspace\\b',
    'personalize',
  ].join('|'),
  'i',
);

const PLANNING_RE =
  /制定.{0,8}(计划|方案)|长任务|分步|step[- ]by[- ]step|make a plan|规划任务/i;

/**
 * @param userText Latest user message
 * @param accessMode Composer permission chip; auto/full always need tools
 * @returns chat | tools | planning
 */
export function inferCapabilityNeed(
  userText: string,
  accessMode: AccessMode = 'default',
): CapabilityNeed {
  if (accessMode === 'auto' || accessMode === 'full') return 'tools';
  const text = (userText || '').trim();
  if (!text) return 'chat';
  if (TOOLS_RE.test(text)) return 'tools';
  if (PLANNING_RE.test(text)) return 'planning';
  return 'chat';
}

export function isToolCapability(need: CapabilityNeed): boolean {
  return need === 'tools' || need === 'planning';
}

/** System line for stream-only turns that looked like create/write work. */
export const CHAT_ONLY_NO_WRITE_SYSTEM =
  '你当前无法在用户电脑上创建或修改文件，也不能安装插件。请用文字说明做法，不要声称已经写入本地文件，也不要让用户复制 PowerShell。';

export const CHAT_ONLY_NO_WRITE_TIP =
  '当前是本机流式对话，创建/写入任务需要高级能力。已按文字说明继续，不会在本机生成文件。';

export const HARNESS_PACKAGING_MESSAGE =
  '高级能力组件未随安装包提供，无法在本机写文件或安装插件。这是安装包缺陷，不是路径配置问题。';
