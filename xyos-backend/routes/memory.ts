import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  saveShortMemory, getShortMemories, getLongMemories, searchMemories,
  runDreamCycle, getDreamLogs, getMemoryStats, deleteShortMemory
} from "../services/memory";

export const memoryRoutes = Router();
memoryRoutes.use(authenticate);

// 获取短期记忆
memoryRoutes.get("/short/:agentId", (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const memories = getShortMemories(parseInt(req.params.agentId), limit, req.user!.tenant_id);
    res.json({ success: true, data: memories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取长期记忆
memoryRoutes.get("/long/:agentId", (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const memories = getLongMemories(parseInt(req.params.agentId), limit, req.user!.tenant_id);
    res.json({ success: true, data: memories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存短期记忆
memoryRoutes.post("/short", (req: AuthRequest, res) => {
  try {
    const { agent_id, memory_type, content, reasoning_content, context } = req.body;
    if (!agent_id || !content) return res.status(400).json({ success: false, error: "agent_id和content必填" });
    
    const id = saveShortMemory(agent_id, memory_type || 'conversation', content, reasoning_content, context, req.user!.tenant_id);
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除短期记忆
memoryRoutes.delete("/short/:id", (req: AuthRequest, res) => {
  try {
    deleteShortMemory(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 搜索记忆
memoryRoutes.get("/search", (req: AuthRequest, res) => {
  try {
    const { agent_id, query, limit } = req.query;
    if (!agent_id || !query) return res.status(400).json({ success: false, error: "agent_id和query必填" });
    
    const memories = searchMemories(parseInt(agent_id as string), query as string, parseInt(limit as string) || 10, req.user!.tenant_id);
    res.json({ success: true, data: memories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 触发Dream整合
memoryRoutes.post("/dream", requireAdmin, (req: AuthRequest, res) => {
  try {
    const report = runDreamCycle(req.user!.tenant_id);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Dream日志
memoryRoutes.get("/dream/logs", (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = getDreamLogs(req.user!.tenant_id, limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取记忆统计
memoryRoutes.get("/stats/:agentId", (req: AuthRequest, res) => {
  try {
    const stats = getMemoryStats(parseInt(req.params.agentId), req.user!.tenant_id);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
