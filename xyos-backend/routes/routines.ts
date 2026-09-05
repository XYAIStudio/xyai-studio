import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createRoutine, getRoutines, getRoutine, updateRoutine, deleteRoutine,
  logRoutineExecution, getRoutineLogs, getAllRoutineLogs, updateRoutineLastRun
} from "../services/routine";

export const routineRoutes = Router();
routineRoutes.use(authenticate);

// 获取例行任务列表
routineRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const filters = {
      routine_type: req.query.type as string,
      status: req.query.status as string,
    };
    const routines = getRoutines(req.user!.tenant_id, filters);
    res.json({ success: true, data: routines });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取执行日志
routineRoutes.get("/logs", (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const logs = getAllRoutineLogs(req.user!.tenant_id, limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取例行任务详情
routineRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const routine = getRoutine(parseInt(req.params.id), req.user!.tenant_id);
    if (!routine) return res.status(404).json({ success: false, error: "例行任务不存在" });
    res.json({ success: true, data: routine });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建例行任务
routineRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createRoutine({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新例行任务
routineRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateRoutine(parseInt(req.params.id), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除例行任务
routineRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteRoutine(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取例行任务的执行日志
routineRoutes.get("/:id/logs", (req: AuthRequest, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const logs = getRoutineLogs(parseInt(req.params.id), req.user!.tenant_id, limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 手动触发执行记录
routineRoutes.post("/:id/execute", requireAdmin, (req: AuthRequest, res) => {
  try {
    const routine = getRoutine(parseInt(req.params.id), req.user!.tenant_id);
    if (!routine) return res.status(404).json({ success: false, error: "例行任务不存在" });
    
    const logId = logRoutineExecution({
      routine_id: routine.id,
      tenant_id: req.user!.tenant_id,
      status: 'success',
      result: '手动触发执行',
    });
    
    updateRoutineLastRun(routine.id, req.user!.tenant_id);
    
    res.json({ success: true, data: { log_id: logId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
