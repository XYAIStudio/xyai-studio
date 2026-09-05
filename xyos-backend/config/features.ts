/*
 * XYOS V4.5 — 全局功能开关 (Feature Flags)
 * 所有新功能通过环境变量控制启用/禁用
 * 支持运行时动态降级，不修改代码即可回滚
 * 
 * 使用方式:
 *   import { FEATURES } from './config/features';
 *   if (FEATURES.ENABLE_HUMAN_IN_THE_LOOP) { ... }
 */

export const FEATURE_FLAGS = {
  // ============ V4.1 人在回路 ============
  /** 人在回路人工审核机制 */
  ENABLE_HUMAN_IN_THE_LOOP: process.env.ENABLE_HITL !== 'false',

  /** 治理引擎与任务编排打通 */
  ENABLE_GOVERNANCE_ORCHESTRATION: process.env.ENABLE_GOV_ORCH !== 'false',

  /** 关键决策点自动标记 */
  ENABLE_DECISION_MARKERS: process.env.ENABLE_DECISION_MARKERS !== 'false',

  // ============ V4.2 MCP 协议 ============
  /** MCP 协议服务端（XYOS 作为工具提供方） */
  ENABLE_MCP_SERVER: process.env.ENABLE_MCP_SERVER === 'true',

  /** MCP 协议客户端（XYOS 调用外部工具） */
  ENABLE_MCP_CLIENT: process.env.ENABLE_MCP_CLIENT === 'true',

  /** MCP 工具调用日志记录 */
  ENABLE_MCP_AUDIT_LOG: process.env.ENABLE_MCP_AUDIT !== 'false',

  // ============ V4.3 AI Agent 升级 ============
  /** 向量记忆检索 */
  ENABLE_VECTOR_MEMORY: process.env.ENABLE_VECTOR_MEM === 'true',

  /** SSE 流式输出 */
  ENABLE_STREAMING: process.env.ENABLE_STREAMING !== 'false',

  /** Function Calling 工具调用 */
  ENABLE_FUNCTION_CALLING: process.env.ENABLE_FUNCTION_CALLING === 'true',

  /** ReAct 推理模式 */
  ENABLE_REACT: process.env.ENABLE_REACT === 'true',

  // ============ V4.4 端云融合 ============
  /** 鸿蒙原生能力桥接 */
  ENABLE_NATIVE_BRIDGE: process.env.ENABLE_NATIVE !== 'false',

  /** 离线模式缓存 */
  ENABLE_OFFLINE_MODE: process.env.ENABLE_OFFLINE !== 'false',

  /** 鸿蒙推送通知 */
  ENABLE_PUSH_NOTIFICATIONS: process.env.ENABLE_PUSH === 'true',

  /** 端侧 SQLite 缓存 */
  ENABLE_LOCAL_SQLITE: process.env.ENABLE_LOCAL_DB === 'true',

  // ============ V4.5 信创部署 ============
  /** 国产数据库适配 */
  ENABLE_DB_ADAPTER: process.env.ENABLE_DB_ADAPTER === 'true',

  /** 达梦数据库 */
  ENABLE_DAMENG: process.env.DB_DIALECT === 'dameng',

  /** 金仓数据库 */
  ENABLE_KINGBASE: process.env.DB_DIALECT === 'kingbase',

  /** 离线 LLM (Ollama) */
  ENABLE_OFFLINE_LLM: process.env.LLM_PROVIDER === 'ollama',

  /** 纯离线模式 */
  ENABLE_AIR_GAP_MODE: process.env.AIR_GAP_MODE === 'true',

  /** 私有化部署 */
  ENABLE_PRIVATE_DEPLOY: process.env.DEPLOY_MODE === 'private',

  /** ARM64 架构优化 */
  ENABLE_ARM64_OPTIMIZATION: process.env.ARCH === 'arm64',

  // ============ V1.0 H2A2A2H 底座激活（影子接线）============
  /** 群聊 H2A2A2H 影子账本：并行记录结构化任务 + 12 态状态机流转（默认关，灰度开启，可随时回滚） */
  ENABLE_H2A2A2H_SHADOW: process.env.ENABLE_H2A2A2H_SHADOW === 'true',

  // ============ 通用功能 ============
  /** 多租户 */
  ENABLE_MULTI_TENANT: process.env.ENABLE_MULTI_TENANT !== 'false',

  /** WebSocket 实时通信 */
  ENABLE_WEBSOCKET: process.env.ENABLE_WS !== 'false',

  /** 审计日志 */
  ENABLE_AUDIT_LOGGING: process.env.ENABLE_AUDIT !== 'false',

  /** 开发调试模式 */
  ENABLE_DEBUG: process.env.NODE_ENV !== 'production',
} as const;

/**
 * 获取当前启用的模块列表
 */
export function getEnabledModules(): string[] {
  const modules: string[] = [];

  // 基础模块（始终启用）
  modules.push('core', 'auth', 'employees', 'tasks', 'chats', 'org', 'knowledge');

  // 条件模块
  if (FEATURE_FLAGS.ENABLE_HUMAN_IN_THE_LOOP) modules.push('hitl');
  if (FEATURE_FLAGS.ENABLE_MCP_SERVER) modules.push('mcp-server');
  if (FEATURE_FLAGS.ENABLE_MCP_CLIENT) modules.push('mcp-client');
  if (FEATURE_FLAGS.ENABLE_VECTOR_MEMORY) modules.push('vector-memory');
  if (FEATURE_FLAGS.ENABLE_STREAMING) modules.push('streaming');
  if (FEATURE_FLAGS.ENABLE_FUNCTION_CALLING) modules.push('function-calling');
  if (FEATURE_FLAGS.ENABLE_REACT) modules.push('react-agent');
  if (FEATURE_FLAGS.ENABLE_NATIVE_BRIDGE) modules.push('native-bridge');
  if (FEATURE_FLAGS.ENABLE_OFFLINE_MODE) modules.push('offline-mode');
  if (FEATURE_FLAGS.ENABLE_DB_ADAPTER) modules.push('db-adapter');
  if (FEATURE_FLAGS.ENABLE_PRIVATE_DEPLOY) modules.push('private-deploy');

  return modules;
}

/**
 * 获取当前版本信息
 */
export function getFeatureVersion(): string {
  const modules = getEnabledModules();
  if (modules.includes('private-deploy') && modules.includes('db-adapter')) return 'v4.5';
  if (modules.includes('native-bridge')) return 'v4.4';
  if (modules.includes('vector-memory') || modules.includes('react-agent')) return 'v4.3';
  if (modules.includes('mcp-server') || modules.includes('mcp-client')) return 'v4.2';
  if (modules.includes('hitl')) return 'v4.1';
  return 'v4.0';
}

/**
 * 检查模块是否启用
 */
export function isModuleEnabled(moduleName: string): boolean {
  return getEnabledModules().includes(moduleName);
}

export default FEATURE_FLAGS;
