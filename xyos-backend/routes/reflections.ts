import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  createReflection, getReflections, getReflection, deleteReflection,
  addSkill, getEmployeeSkills, getAllSkills, useSkill, deleteSkill, getReflectionStats
} from "../services/reflection";

export const reflectionRoutes = Router();
reflectionRoutes.use(authenticate);

// 获取反思记录列表
reflectionRoutes.get("/reflections", (req: AuthRequest, res) => {
  try {
    const filters = {
      employee_id: req.query.employee_id ? parseInt(req.query.employee_id as string) : undefined,
      reflection_type: req.query.type as string,
    };
    const reflections = getReflections(req.user!.tenant_id, filters);
    res.json({ success: true, data: reflections });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取反思记录详情
reflectionRoutes.get("/reflections/:id", (req: AuthRequest, res) => {
  try {
    const reflection = getReflection(parseInt(req.params.id), req.user!.tenant_id);
    if (!reflection) return res.status(404).json({ success: false, error: "反思记录不存在" });
    res.json({ success: true, data: reflection });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建反思记录
reflectionRoutes.post("/reflections", (req: AuthRequest, res) => {
  try {
    const id = createReflection({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除反思记录
reflectionRoutes.delete("/reflections/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteReflection(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 添加技能
reflectionRoutes.post("/skills", (req: AuthRequest, res) => {
  try {
    const id = addSkill({ ...req.body, tenant_id: req.user!.tenant_id });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取员工技能
reflectionRoutes.get("/skills/employee/:employeeId", (req: AuthRequest, res) => {
  try {
    const skills = getEmployeeSkills(parseInt(req.params.employeeId), req.user!.tenant_id);
    res.json({ success: true, data: skills });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有技能（按类别分组）
reflectionRoutes.get("/skills", (req: AuthRequest, res) => {
  try {
    const skills = getAllSkills(req.user!.tenant_id);
    res.json({ success: true, data: skills });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新技能使用
reflectionRoutes.post("/skills/:id/use", (req: AuthRequest, res) => {
  try {
    const { success } = req.body;
    useSkill(parseInt(req.params.id), req.user!.tenant_id, success !== false);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除技能
reflectionRoutes.delete("/skills/:id", requireAdmin, (req: AuthRequest, res) => {
  try {
    deleteSkill(parseInt(req.params.id), req.user!.tenant_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取员工反思统计
reflectionRoutes.get("/stats/:employeeId", (req: AuthRequest, res) => {
  try {
    const stats = getReflectionStats(parseInt(req.params.employeeId), req.user!.tenant_id);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
