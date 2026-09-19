/**
 * Heuristic capability need from user text only.
 * PermissionMode / accessMode are unused: they are approval policy,
 * and must never force tools (chitchat + bypass stays on stream).
 */

import {
  isToolCapability,
  type PermissionMode,
  type TurnCapability,
} from '@xyai/contracts';

export { isToolCapability };
export type { TurnCapability };

/**
 * Chinese + English markers for file / plugin / skill / MCP / workspace work.
 * Bare chitchat must not match.
 */
const TOOLS_RE = new RegExp(
  [
    '创建.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录|页面|html|系统)',
    '新建.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录|系统)',
    '生成.{0,16}(文件|插件|技能|智能体|工作流|连接器|文档|目录|页面|html|系统)',
    '写(入|一个|一份|些)?(文件|插件|技能|代码|脚本|文档|到)',
    '保存到',
    '安装.{0,12}(插件|技能|mcp|连接器|智能体)',
    '装到.{0,8}(个性化|工作目录)',
    '插件',
    '技能',
    '个性化',
    '管理系统',
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
 * Infer turn capability from the latest user message.
 * @param userText Latest user message
 * @param _permissionMode Ignored. Approval policy is not routing.
 * @returns chat | tools | planning
 */
export function inferTurnCapability(
  userText: string,
  _permissionMode?: PermissionMode,
): TurnCapability {
  void _permissionMode;
  const text = (userText || '').trim();
  if (!text) return 'chat';
  if (TOOLS_RE.test(text)) return 'tools';
  if (PLANNING_RE.test(text)) return 'planning';
  return 'chat';
}
