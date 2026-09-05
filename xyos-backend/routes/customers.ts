/**
 * 客服收费系统路由
 */

import { Router } from "express";
import { authenticate, AuthRequest, requireAdmin } from "../middleware";
import {
  createCustomer, getCustomer, listCustomers, updateCustomer,
  createTicket, getTicket, listTickets, updateTicketStatus, assignTicket,
  createBill, getBill, listBills, recordPayment, getBillingStats,
} from "../services/customer-service";

export const customerRoutes = Router();
customerRoutes.use(authenticate);

// ── 客户 ──
customerRoutes.get("/", (req: AuthRequest, res) => {
  res.json({ success: true, data: listCustomers(req.user!.tenant_id, req.query as any) });
});

customerRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createCustomer({ ...req.body, tenantId: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

customerRoutes.get("/:id", (req: AuthRequest, res) => {
  const c = getCustomer(parseInt(req.params.id), req.user!.tenant_id);
  c ? res.json({ success: true, data: c }) : res.status(404).json({ success: false, error: "客户不存在" });
});

customerRoutes.put("/:id", requireAdmin, (req: AuthRequest, res) => {
  updateCustomer(parseInt(req.params.id), req.user!.tenant_id, req.body);
  res.json({ success: true });
});

// ── 工单 ──
customerRoutes.post("/tickets", (req: AuthRequest, res) => {
  try {
    const id = createTicket({ ...req.body, tenantId: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

customerRoutes.get("/tickets", (req: AuthRequest, res) => {
  res.json({ success: true, data: listTickets(req.user!.tenant_id, req.query as any) });
});

customerRoutes.get("/tickets/:id", (req: AuthRequest, res) => {
  const t = getTicket(parseInt(req.params.id), req.user!.tenant_id);
  t ? res.json({ success: true, data: t }) : res.status(404).json({ success: false, error: "工单不存在" });
});

customerRoutes.put("/tickets/:id/status", (req: AuthRequest, res) => {
  updateTicketStatus(parseInt(req.params.id), req.user!.tenant_id, req.body.status, req.body.resolution);
  res.json({ success: true });
});

customerRoutes.put("/tickets/:id/assign", requireAdmin, (req: AuthRequest, res) => {
  assignTicket(parseInt(req.params.id), req.user!.tenant_id, req.body.userId);
  res.json({ success: true });
});

// ── 账单 ──
customerRoutes.get("/bills", (req: AuthRequest, res) => {
  res.json({ success: true, data: listBills(req.user!.tenant_id, req.query as any) });
});

customerRoutes.post("/bills", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createBill({ ...req.body, tenantId: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

customerRoutes.get("/bills/:id", (req: AuthRequest, res) => {
  const b = getBill(parseInt(req.params.id), req.user!.tenant_id);
  b ? res.json({ success: true, data: b }) : res.status(404).json({ success: false, error: "账单不存在" });
});

customerRoutes.post("/bills/:id/pay", (req: AuthRequest, res) => {
  try {
    recordPayment(parseInt(req.params.id), req.body.amount, req.user!.tenant_id);
    res.json({ success: true, message: "收款记录已登记" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

customerRoutes.get("/stats/billing", (req: AuthRequest, res) => {
  res.json({ success: true, data: getBillingStats(req.user!.tenant_id) });
});
