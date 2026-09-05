import { Router } from "express";
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from "../middleware";
import {
  createTenant, getTenants, getTenant, updateTenant, deleteTenant,
  suspendTenant, activateTenant, addTenantMember, removeTenantMember,
  getTenantMembers, updateMemberRole, getUserTenants, recordUsage,
  getTenantUsage, getPlans
} from "../services/tenant";

export const tenantRoutes = Router();

// 公开接口
tenantRoutes.get("/plans", (req, res) => {
  try {
    const plans = getPlans();
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 需要认证的接口
tenantRoutes.use(authenticate);

// 获取当前用户所属租户
tenantRoutes.get("/my", (req: AuthRequest, res) => {
  try {
    const tenants = getUserTenants(req.user!.id);
    res.json({ success: true, data: tenants });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 超级管理员接口
tenantRoutes.get("/", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string;
    const tenants = getTenants(status);
    res.json({ success: true, data: tenants });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.post("/", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const { name, slug, tenant_code, plan } = req.body;
    if (!name) return res.status(400).json({ success: false, error: "租户名称必填" });
    
    const tenant = createTenant({ name, slug, tenant_code, plan });
    
    // 自动添加创建者为owner
    addTenantMember(tenant.id, req.user!.id, 'owner');
    
    res.json({ success: true, data: tenant });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.get("/:id", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const tenant = getTenant(parseInt(req.params.id));
    if (!tenant) return res.status(404).json({ success: false, error: "租户不存在" });
    res.json({ success: true, data: tenant });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.put("/:id", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const tenant = getTenant(parseInt(req.params.id));
    if (!tenant) return res.status(404).json({ success: false, error: "租户不存在" });
    
    updateTenant(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.delete("/:id", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const tenant = getTenant(parseInt(req.params.id));
    if (!tenant) return res.status(404).json({ success: false, error: "租户不存在" });
    
    // 不允许删除默认租户
    if (tenant.tenant_code === 'XY') {
      return res.status(400).json({ success: false, error: "不能删除默认租户" });
    }
    
    deleteTenant(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.post("/:id/suspend", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    suspendTenant(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.post("/:id/activate", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    activateTenant(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.get("/:id/usage", requireSuperAdmin, (req: AuthRequest, res) => {
  try {
    const usageType = req.query.type as string;
    const usage = getTenantUsage(parseInt(req.params.id), usageType);
    res.json({ success: true, data: usage });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 租户管理员接口
tenantRoutes.get("/:id/members", (req: AuthRequest, res) => {
  try {
    const members = getTenantMembers(parseInt(req.params.id));
    res.json({ success: true, data: members });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.post("/:id/members", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { user_id, role } = req.body;
    if (!user_id) return res.status(400).json({ success: false, error: "用户ID必填" });
    
    addTenantMember(parseInt(req.params.id), user_id, role || 'member', req.user!.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.delete("/:id/members/:userId", requireAdmin, (req: AuthRequest, res) => {
  try {
    removeTenantMember(parseInt(req.params.id), parseInt(req.params.userId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tenantRoutes.put("/:id/members/:userId/role", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ success: false, error: "角色必填" });
    
    updateMemberRole(parseInt(req.params.id), parseInt(req.params.userId), role);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
