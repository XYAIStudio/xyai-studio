import { Router } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware";
import {
  onboardEmployee, transferEmployee, addSecondPosition,
  terminateEmployee, reactivateEmployee, getEmployeeCode
} from "../services/employee-code";
import { dbGet } from "../db";

export const employeeCodeRoutes = Router();
employeeCodeRoutes.use(authenticate);

// 查询员工编码和岗位
employeeCodeRoutes.get("/:id/code", (req: AuthRequest, res) => {
  try {
    const result = getEmployeeCode(parseInt(req.params.id));
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 入职：分配PID + 主岗PCC
employeeCodeRoutes.post("/:id/onboard", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { dept_id } = req.body;
    const employeeId = parseInt(req.params.id);
    
    const employee = dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]) as any;
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在" });
    
    const tenant = dbGet("SELECT * FROM tenants WHERE id = ?", [employee.tenant_id]) as any;
    const tenantCode = tenant?.tenant_code || 'XY';
    
    const dept = dept_id ? dbGet("SELECT name FROM departments WHERE id = ?", [dept_id]) as any : null;
    const deptName = dept?.name || null;
    
    const result = onboardEmployee(employeeId, tenantCode, dept_id || null, deptName);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 调岗
employeeCodeRoutes.post("/:id/transfer", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { dept_id } = req.body;
    if (!dept_id) return res.status(400).json({ success: false, error: "部门ID必填" });
    
    const dept = dbGet("SELECT name FROM departments WHERE id = ?", [dept_id]) as any;
    if (!dept) return res.status(404).json({ success: false, error: "部门不存在" });
    
    transferEmployee(parseInt(req.params.id), dept_id, dept.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 兼岗
employeeCodeRoutes.post("/:id/second", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { dept_id } = req.body;
    if (!dept_id) return res.status(400).json({ success: false, error: "部门ID必填" });
    
    const dept = dbGet("SELECT name FROM departments WHERE id = ?", [dept_id]) as any;
    if (!dept) return res.status(404).json({ success: false, error: "部门不存在" });
    
    addSecondPosition(parseInt(req.params.id), dept_id, dept.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 离职/废除
employeeCodeRoutes.post("/:id/terminate", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { terminate_type } = req.body;
    if (!terminate_type || !['depart', 'decommission'].includes(terminate_type)) {
      return res.status(400).json({ success: false, error: "终止类型必填：depart 或 decommission" });
    }
    
    terminateEmployee(parseInt(req.params.id), terminate_type);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 重新入职
employeeCodeRoutes.post("/:id/rehire", requireAdmin, (req: AuthRequest, res) => {
  try {
    const { dept_id } = req.body;
    if (!dept_id) return res.status(400).json({ success: false, error: "部门ID必填" });
    
    const dept = dbGet("SELECT name FROM departments WHERE id = ?", [dept_id]) as any;
    if (!dept) return res.status(404).json({ success: false, error: "部门不存在" });
    
    reactivateEmployee(parseInt(req.params.id), dept_id, dept.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
