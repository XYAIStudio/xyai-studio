import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createReview, getReviews, getReview, updateReview, deleteReview,
  recordMetric, getMetrics, getEmployeePerformanceSummary, calculatePerformanceScore
} from "../services/performance";

export const performanceRoutes = Router();
performanceRoutes.use(authenticate);

// 获取绩效评估列表
performanceRoutes.get("/reviews", (req: AuthRequest, res) => {
  try {
    const filters = {
      employee_id: req.query.employee_id ? parseInt(req.query.employee_id as string) : undefined,
      employee_type: req.query.employee_type as string,
      review_period: req.query.period as string,
    };
    const reviews = getReviews(req.user!.tenant_id, filters);
    res.json({ success: true, data: reviews });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取绩效评估详情
performanceRoutes.get("/reviews/:id", (req: AuthRequest, res) => {
  try {
    const review = getReview(parseInt(req.params.id as string), req.user!.tenant_id);
    if (!review) return res.status(404).json({ success: false, error: "评估记录不存在" });
    res.json({ success: true, data: review });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 创建绩效评估
performanceRoutes.post("/reviews", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createReview({ ...req.body, tenant_id: req.user!.tenant_id, reviewed_by: req.user!.id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 更新绩效评估
performanceRoutes.put("/reviews/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    updateReview(parseInt(req.params.id as string), req.user!.tenant_id, req.body);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除绩效评估
performanceRoutes.delete("/reviews/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteReview(parseInt(req.params.id as string), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 记录绩效指标
performanceRoutes.post("/metrics", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = recordMetric({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取绩效指标
performanceRoutes.get("/metrics", (req: AuthRequest, res) => {
  try {
    const filters = {
      employee_id: req.query.employee_id ? parseInt(req.query.employee_id as string) : undefined,
      metric_type: req.query.metric_type as string,
      period: req.query.period as string,
    };
    const metrics = getMetrics(req.user!.tenant_id, filters);
    res.json({ success: true, data: metrics });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 获取员工绩效汇总
performanceRoutes.get("/employee/:id/summary", (req: AuthRequest, res) => {
  try {
    const summary = getEmployeePerformanceSummary(parseInt(req.params.id as string), req.user!.tenant_id);
    res.json({ success: true, data: summary });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 自动计算绩效分数
performanceRoutes.post("/calculate/:employeeId", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { period } = req.body;
    if (!period) return res.status(400).json({ success: false, error: "period必填" });
    const scores = calculatePerformanceScore(parseInt(req.params.employeeId as string), req.user!.tenant_id, period);
    res.json({ success: true, data: scores });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
