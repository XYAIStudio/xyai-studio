import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbAll } from "../db";
import { EfficiencyEngine } from "../services/efficiency";

export const efficiencyRoutes = Router();
efficiencyRoutes.use(authenticate);

efficiencyRoutes.get("/dashboard", (req: AuthRequest, res) => {
  try {
    const data = EfficiencyEngine.getDashboard(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

efficiencyRoutes.post("/calculate", (req: AuthRequest, res) => {
  try {
    const data = EfficiencyEngine.calculateDailyMetrics(req.user!.tenant_id);
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

efficiencyRoutes.get("/trends", (req: AuthRequest, res) => {
  try {
    const days = req.query.days ? Number(req.query.days as string) : 30;
    const data = dbAll(
      "SELECT * FROM org_efficiency_metrics WHERE tenant_id = ? ORDER BY metric_date DESC LIMIT ?",
      [req.user!.tenant_id, days]
    );
    res.json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
