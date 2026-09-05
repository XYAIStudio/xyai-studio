import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createHeartbeatSchedule, getHeartbeatSchedules, getHeartbeatLogs,
  updateHeartbeatSchedule, deleteHeartbeatSchedule, triggerHeartbeat
} from "../services/heartbeat";

export const heartbeatRoutes = Router();
heartbeatRoutes.use(authenticate);

// 获取心跳计划列表
heartbeatRoutes.get("/schedules", (req: AuthRequest, res) => {
  try {
    const schedules = getHeartbeatSchedules(req.user!.tenant_id);
    res.json({ success: true, data: schedules });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建心跳计划
heartbeatRoutes.post("/schedules", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { agent_id, task_type, cron_expression } = req.body;
    if (!agent_id) return res.status(400).json({ success: false, error: "agent_id必填" });
    
    const id = createHeartbeatSchedule(agent_id, task_type || 'check_tasks', cron_expression || '*/30 * * * *', req.user!.tenant_id);
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新心跳计划
heartbeatRoutes.put("/schedules/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateHeartbeatSchedule(parseInt(req.params.id as string), req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除心跳计划
heartbeatRoutes.delete("/schedules/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteHeartbeatSchedule(parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取心跳日志
heartbeatRoutes.get("/logs", (req: AuthRequest, res) => {
  try {
    const agentId = req.query.agent_id ? parseInt(req.query.agent_id as string) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = getHeartbeatLogs(agentId, req.user!.tenant_id, limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 手动触发心跳
heartbeatRoutes.post("/trigger/:agentId", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await triggerHeartbeat(parseInt(req.params.agentId as string), req.user!.tenant_id);
    res.json({ success: true, data: { result } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
