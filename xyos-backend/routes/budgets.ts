import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createBudget, getBudgets, getBudget, updateBudget, deleteBudget,
  recordTokenUsage, getTokenUsage, getTokenUsageStats, getBudgetAlerts, updateBudgetUsage
} from "../services/budget";

export const budgetRoutes = Router();
budgetRoutes.use(authenticate);

// 获取预算列表
budgetRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const filters = {
      budget_type: req.query.type as string,
      status: req.query.status as string,
    };
    const budgets = getBudgets(req.user!.tenant_id, filters);
    res.json({ success: true, data: budgets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取预算预警
budgetRoutes.get("/alerts", (req: AuthRequest, res) => {
  try {
    const alerts = getBudgetAlerts(req.user!.tenant_id);
    res.json({ success: true, data: alerts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取预算详情
budgetRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const budget = getBudget(parseInt(req.params.id), req.user!.tenant_id);
    if (!budget) return res.status(404).json({ success: false, error: "预算不存在" });
    res.json({ success: true, data: budget });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建预算
budgetRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createBudget({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新预算
budgetRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateBudget(parseInt(req.params.id), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除预算
budgetRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteBudget(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 记录Token使用
budgetRoutes.post("/usage", (req: AuthRequest, res) => {
  try {
    const id = recordTokenUsage({ ...req.body, tenant_id: req.user!.tenant_id, user_id: req.user!.id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Token使用记录
budgetRoutes.get("/usage/list", (req: AuthRequest, res) => {
  try {
    const filters = {
      user_id: req.query.user_id ? parseInt(req.query.user_id as string) : undefined,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
    };
    const usage = getTokenUsage(req.user!.tenant_id, filters);
    res.json({ success: true, data: usage });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Token使用统计
budgetRoutes.get("/usage/stats", (req: AuthRequest, res) => {
  try {
    const period = req.query.period as string;
    const stats = getTokenUsageStats(req.user!.tenant_id, period);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新预算使用量
budgetRoutes.post("/:id/usage", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    if (amount === undefined) return res.status(400).json({ success: false, error: "amount必填" });
    updateBudgetUsage(parseInt(req.params.id), req.user!.tenant_id, amount);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
