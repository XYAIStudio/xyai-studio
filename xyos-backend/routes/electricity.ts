/**
 * 电力市场系统路由
 */

import { Router } from "express";
import { authenticate, AuthRequest, requireAdmin } from "../middleware";
import {
  createPlant, listPlants, updatePlantOutput,
  createTrade, listTrades_Energy, confirmTrade,
  getGridSnapshot, recordGridSnapshot,
  getCurrentPrice,
} from "../services/electricity-market";

export const electricityRoutes = Router();
electricityRoutes.use(authenticate);

// ── 电厂 ──
electricityRoutes.get("/plants", (req: AuthRequest, res) => {
  res.json({ success: true, data: listPlants(req.user!.tenant_id, req.query.type as string) });
});

electricityRoutes.post("/plants", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createPlant({ ...req.body, tenantId: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

electricityRoutes.put("/plants/:id/output", (req: AuthRequest, res) => {
  updatePlantOutput(parseInt(req.params.id), req.user!.tenant_id, req.body.outputKw);
  res.json({ success: true });
});

// ── 交易 ──
electricityRoutes.get("/trades", (req: AuthRequest, res) => {
  res.json({ success: true, data: listTrades_Energy(req.user!.tenant_id, req.query as any) });
});

electricityRoutes.post("/trades", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = createTrade({ ...req.body, tenantId: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

electricityRoutes.post("/trades/:id/confirm", requireAdmin, (req: AuthRequest, res) => {
  confirmTrade(parseInt(req.params.id), req.user!.tenant_id);
  res.json({ success: true });
});

// ── 电网 ──
electricityRoutes.get("/grid/snapshot", (req: AuthRequest, res) => {
  res.json({ success: true, data: getGridSnapshot(req.user!.tenant_id) });
});

electricityRoutes.post("/grid/snapshot", (req: AuthRequest, res) => {
  const id = recordGridSnapshot(req.user!.tenant_id);
  res.json({ success: true, data: { id } });
});

// ── 电价 ──
electricityRoutes.get("/price", (req: AuthRequest, res) => {
  res.json({ success: true, data: getCurrentPrice(req.user!.tenant_id) });
});
