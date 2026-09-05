/**
 * 雄元智脑XYOS — SaaS 订阅 API
 *
 * GET  /api/subscription/plans            套餐列表（公开）
 * GET  /api/subscription/current          当前租户订阅状态 + 用量
 * POST /api/subscription/subscribe        申请订阅/升级/续费（创建 pending 记录）
 * POST /api/subscription/cancel           取消订阅（到期不续）
 * GET  /api/subscription/history          订阅历史
 * GET  /api/subscription/admin/pending    超管：待开通列表
 * POST /api/subscription/admin/activate   超管：确认收款开通
 */
import { Router, Request, Response } from "express";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware";
import {
  listPlans,
  getTenantSubscriptionStatus,
  createSubscription,
  cancelSubscription,
  listSubscriptions,
  activateSubscription,
} from "../services/subscription";
import { createPaymentOrder, getPaymentOrder, availableProviders } from "../services/payment";

const router = Router();

// 套餐列表（公开）
router.get("/plans", (_req: Request, res: Response) => {
  res.json({ success: true, data: listPlans() });
});

router.use(authenticate);

// 当前订阅状态 + 用量
router.get("/current", (req: AuthRequest, res: Response) => {
  const status = getTenantSubscriptionStatus(req.user!.tenant_id);
  res.json({ success: true, data: status });
});

// 订阅历史
router.get("/history", (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: listSubscriptions(req.user!.tenant_id, 50) });
});

// 申请订阅/升级/续费（pending，等待付款确认；免费版直接激活）
router.post("/subscribe", (req: AuthRequest, res: Response) => {
  const { plan_slug, months, payment_method, note } = req.body || {};
  if (!plan_slug) return res.status(400).json({ success: false, error: "plan_slug 必填" });
  try {
    const activate = plan_slug === "free";
    const sub = createSubscription({
      tenantId: req.user!.tenant_id,
      planSlug: String(plan_slug),
      months: Number(months) || 1,
      paymentMethod: payment_method || "transfer",
      createdBy: req.user!.id,
      note,
      activate,
    });
    res.status(activate ? 200 : 202).json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 取消订阅
router.post("/cancel", (req: AuthRequest, res: Response) => {
  const { sub_id } = req.body || {};
  if (!sub_id) return res.status(400).json({ success: false, error: "sub_id 必填" });
  try {
    cancelSubscription(req.user!.tenant_id, String(sub_id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 在线支付：创建支付订单 / 查询状态 ──
router.post("/pay", async (req: AuthRequest, res: Response) => {
  try {
    const { sub_id, provider } = req.body || {};
    if (!sub_id) return res.status(400).json({ success: false, error: "sub_id 必填" });
    const sub = listSubscriptions(req.user!.tenant_id, 10).find((s) => s.id === sub_id && s.status === "pending");
    if (!sub) return res.status(404).json({ success: false, error: "订阅申请不存在或已处理" });
    const order = await createPaymentOrder({
      tenantId: req.user!.tenant_id,
      subId: sub_id,
      amount: sub.amount,
      provider: provider || "hupijiao",
    });
    res.json({ success: true, data: { order_id: order.id, qrcode_url: order.qrcode_url, amount: order.amount, status: order.status } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get("/pay/status", (req: AuthRequest, res: Response) => {
  const order = getPaymentOrder(String(req.query.order_id || ""));
  if (!order) return res.status(404).json({ success: false, error: "订单不存在" });
  res.json({ success: true, data: { status: order.status, paid_at: order.paid_at } });
});

router.get("/pay/providers", (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: availableProviders() });
});

// ── 超管：待开通 / 确认收款开通（对公转账模式）──
router.get("/admin/pending", requireSuperAdmin, (_req: AuthRequest, res: Response) => {
  const rows = listSubscriptions(undefined, 200).filter((s) => s.status === "pending");
  res.json({ success: true, data: rows });
});

router.post("/admin/activate", requireSuperAdmin, (req: AuthRequest, res: Response) => {
  const { sub_id } = req.body || {};
  if (!sub_id) return res.status(400).json({ success: false, error: "sub_id 必填" });
  try {
    const sub = activateSubscription(String(sub_id), req.user!.id);
    res.json({ success: true, data: sub });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export const subscriptionRoutes = router;
