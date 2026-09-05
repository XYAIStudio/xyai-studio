import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createGoal, getGoals, getGoal, updateGoal, deleteGoal,
  getGoalTree, linkTaskToGoal, getGoalTasks, autoCalculateGoalProgress
} from "../services/goal";

export const goalRoutes = Router();
goalRoutes.use(authenticate);

// 获取目标列表
goalRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const filters = {
      cycle: req.query.cycle as string | undefined,
      goal_type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
    };
    const goals = getGoals(req.user!.tenant_id, filters);
    res.json({ success: true, data: goals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取目标树形结构
goalRoutes.get("/tree", (req: AuthRequest, res) => {
  try {
    const tree = getGoalTree(req.user!.tenant_id);
    res.json({ success: true, data: tree });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取目标详情
goalRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const goal = getGoal(parseInt(req.params.id), req.user!.tenant_id);
    if (!goal) return res.status(404).json({ success: false, error: "目标不存在" });
    res.json({ success: true, data: goal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建目标
goalRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createGoal({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新目标
goalRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateGoal(parseInt(req.params.id), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除目标
goalRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteGoal(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 关联任务到目标
goalRoutes.post("/:id/link-task", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { task_id } = req.body;
    if (!task_id) return res.status(400).json({ success: false, error: "task_id必填" });
    linkTaskToGoal(task_id, parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取目标关联的任务
goalRoutes.get("/:id/tasks", (req: AuthRequest, res) => {
  try {
    const tasks = getGoalTasks(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true, data: tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 自动计算目标进度
goalRoutes.post("/:id/calculate", requireAdmin, (req: AuthRequest, res) => {
  try {
    const progress = autoCalculateGoalProgress(parseInt(req.params.id), req.user!.tenant_id);
    updateGoal(parseInt(req.params.id), req.user!.tenant_id, { progress });
    res.json({ success: true, data: { progress } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
