/**
 * V0.90 R4 工具网关路由
 *
 * GET  /api/tools           — 列出可用工具（按 category 筛选）
 * GET  /api/tools/categories — 列出工具分类
 * POST /api/tools/invoke     — 调用工具
 */

import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { ToolRegistry, invokeTool, ConnectorGateway } from "../services/tool-gateway";

export const toolRoutes = Router();

// 所有工具路由需认证
toolRoutes.use(authenticate);

// 列出工具
toolRoutes.get("/", (req: AuthRequest, res) => {
  const category = req.query.category as string | undefined;
  const tools = ToolRegistry.list(category);
  res.json({ success: true, data: tools });
});

// 工具分类
toolRoutes.get("/categories", (_req: AuthRequest, res) => {
  res.json({ success: true, data: ToolRegistry.categories() });
});

// 调用工具
toolRoutes.post("/invoke", async (req: AuthRequest, res) => {
  try {
    const { tool, parameters } = req.body;
    if (!tool) return res.status(400).json({ success: false, error: "tool 必填" });

    const result = await invokeTool({
      toolName: tool,
      parameters: parameters || {},
      caller: {
        userId: req.user!.id,
        tenantId: req.user!.tenant_id,
      },
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 连接器列表
toolRoutes.get("/connectors", (_req: AuthRequest, res) => {
  const connectors = ConnectorGateway.list().map(c => ({
    name: c.name,
    system: c.system,
  }));
  res.json({ success: true, data: connectors });
});
