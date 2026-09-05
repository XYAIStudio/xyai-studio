import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  saveConfigVersion, getConfigVersions, getCurrentConfig,
  rollbackConfig, deleteConfigVersion, getConfigStats
} from "../services/config-version";

export const configVersionRoutes = Router();
configVersionRoutes.use(authenticate);

// 获取配置版本列表
configVersionRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const versions = getConfigVersions(
      req.user!.tenant_id,
      req.query.type as string,
      req.query.key as string
    );
    res.json({ success: true, data: versions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取配置统计
configVersionRoutes.get("/stats", (req: AuthRequest, res) => {
  try {
    const stats = getConfigStats(req.user!.tenant_id);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取当前配置
configVersionRoutes.get("/current", (req: AuthRequest, res) => {
  try {
    const { type, key } = req.query;
    if (!type || !key) return res.status(400).json({ success: false, error: "type和key必填" });
    const config = getCurrentConfig(req.user!.tenant_id, type as string, key as string);
    res.json({ success: true, data: config || null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存配置版本
configVersionRoutes.post("/", requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = saveConfigVersion({ ...req.body, tenant_id: req.user!.tenant_id, created_by: req.user!.id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 回滚配置
configVersionRoutes.post("/rollback/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    const success = rollbackConfig(req.user!.tenant_id, parseInt(req.params.id));
    if (!success) return res.status(404).json({ success: false, error: "版本不存在" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除配置版本
configVersionRoutes.delete("/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteConfigVersion(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
