/**
 * V4.2 MCP 协议路由
 * 
 * 对外暴露标准 MCP JSON-RPC 2.0 接口
 * 同时支持 Server（暴露能力）和 Client（连接外部服务）管理
 */
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware";
import { FEATURE_FLAGS } from "../config/features";
import {
  handleInitialize,
  handleListTools,
  handleToolCall,
  getConnectedClients,
  MCP_TOOLS,
} from "../services/mcp-server";
import {
  getServerConfigs,
  addServerConfig,
  removeServerConfig,
  connectAllServers,
  getRemoteTools,
  callRemoteTool,
  pingServer,
} from "../services/mcp-client";

const router = Router();

// ─────────────────────────────────────────────
// MCP JSON-RPC 2.0 入口（标准 MCP 协议）
// ─────────────────────────────────────────────

// 支持 GET 和 POST，兼容不同的 MCP 客户端实现
router.all("/", (req: Request, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return res.status(503).json({
      jsonrpc: "2.0",
      error: { code: -32601, message: "MCP Server 功能未启用" },
      id: null,
    });
  }

  const { method, params, id } = req.method === "GET" ? req.query : req.body;

  // 处理 JSON-RPC 请求
  (async () => {
    try {
      let result: any;

      switch (method) {
        case "initialize":
          result = handleInitialize();
          break;
        case "tools/list":
          result = handleListTools();
          break;
        case "tools/call":
          result = await handleToolCall(params as any);
          break;
        case "ping":
          result = { pong: true, timestamp: new Date().toISOString() };
          break;
        default:
          return res.json({
            jsonrpc: "2.0",
            error: { code: -32601, message: `未知方法: ${method}` },
            id,
          });
      }

      res.json({ jsonrpc: "2.0", result, id });
    } catch (err: any) {
      res.json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err.message },
        id,
      });
    }
  })();
});

// 简化的 RESTful 端点（方便调试和 Web 直接访问）
router.get("/initialize", (req: Request, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return res.status(503).json({ error: "MCP Server 功能未启用" });
  }
  res.json(handleInitialize());
});

router.get("/tools", (req: Request, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return res.status(503).json({ error: "MCP Server 功能未启用" });
  }
  res.json(handleListTools());
});

router.post("/tools/call", authenticate, (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_SERVER) {
    return res.status(503).json({ error: "MCP Server 功能未启用" });
  }
  const { name, arguments: args } = req.body;
  handleToolCall({ name, arguments: args || {} }).then(result => res.json(result));
});

// ─────────────────────────────────────────────
// MCP 客户端管理 API（需要认证）
// ─────────────────────────────────────────────

// 获取外部 MCP 服务配置列表
router.get("/client/servers", authenticate, (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  res.json({ servers: getServerConfigs() });
});

// 添加外部 MCP 服务
router.post("/client/servers", authenticate, (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  const { id, name, url, apiKey, apiKeyRef, enabled, allowedToolNames } = req.body;
  if (!id || !name || !url) {
    return res.status(400).json({ error: "缺少必填字段: id, name, url" });
  }
  addServerConfig({
    id,
    name,
    url,
    apiKey,
    apiKeyRef,
    tenantId: req.user?.tenant_id,
    allowedToolNames: Array.isArray(allowedToolNames) ? allowedToolNames.map(String) : undefined,
    enabled: enabled !== false,
  });
  res.json({ success: true, server: getServerConfigs().find((server) => server.id === id) });
});

// 删除外部 MCP 服务
router.delete("/client/servers/:serverId", authenticate, (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  removeServerConfig(req.params.serverId);
  res.json({ success: true });
});

// 连接所有外部 MCP 服务
router.post("/client/connect", authenticate, async (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  const result = await connectAllServers();
  res.json(result);
});

// 获取外部 MCP 服务提供的工具列表
router.get("/client/tools", authenticate, (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  res.json({ tools: getRemoteTools() });
});

// 调用外部 MCP 工具
router.post("/client/tools/call", authenticate, async (req: any, res: Response) => {
  if (!FEATURE_FLAGS.ENABLE_MCP_CLIENT) {
    return res.status(503).json({ error: "MCP Client 功能未启用" });
  }
  const { serverId, toolName, args } = req.body;
  if (!serverId || !toolName) {
    return res.status(400).json({ error: "缺少必填字段: serverId, toolName" });
  }
  const result = await callRemoteTool(serverId, toolName, args || {});
  res.json(result);
});

// Ping 外部 MCP 服务
router.get("/client/ping/:serverId", authenticate, async (req: any, res: Response) => {
  const ok = await pingServer(req.params.serverId);
  res.json({ serverId: req.params.serverId, alive: ok });
});

// ─────────────────────────────────────────────
// 已连接的客户端状态
// ─────────────────────────────────────────────

router.get("/connected-clients", authenticate, (req: any, res: Response) => {
  res.json({ clients: getConnectedClients() });
});

export { router as mcpRoutes };
