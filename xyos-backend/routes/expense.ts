import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { WorkflowEngine } from "../services/workflow";
import { dbAll, dbGet, dbRun } from "../db";

export const expenseRoutes = Router();
expenseRoutes.use(authenticate);

/** 报销记录列表 */
expenseRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const status = req.query.status as string;
    const expenseType = req.query.expense_type as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    let whereClauses = ["er.tenant_id = ?"];
    let params: any[] = [tenantId];

    if (!isAdmin) {
      whereClauses.push("er.employee_id = ?");
      params.push(userId);
    }
    if (status) {
      whereClauses.push("er.status = ?");
      params.push(status);
    }
    if (expenseType) {
      whereClauses.push("er.expense_type = ?");
      params.push(expenseType);
    }

    const where = whereClauses.join(" AND ");
    const total = dbGet(`SELECT COUNT(*) as count FROM expense_records er WHERE ${where}`, params)?.count ?? 0;

    const rows = dbAll(
      `SELECT er.*, e.name as employee_name, d.name as department_name,
              c.title as contract_title
       FROM expense_records er
       LEFT JOIN employees e ON er.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN contracts c ON er.contract_id = c.id
       WHERE ${where}
       ORDER BY er.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { list: rows, total, page, limit } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 提交报销申请 */
expenseRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { expense_type, amount, currency, expense_date, description, invoice_count, contract_id, supplier_name, items, workflow_id } = req.body;

    if (!expense_type || !amount || !expense_date) {
      return res.status(400).json({ success: false, error: "缺少必填字段" });
    }

    if (amount <= 0 || amount > 1000000) {
      return res.status(400).json({ success: false, error: "报销金额必须在 0.01-1000000 之间" });
    }

    const validTypes = ["travel", "business", "office", "communication", "vehicle", "entertainment", "training", "other"];
    if (!validTypes.includes(expense_type)) {
      return res.status(400).json({ success: false, error: "无效的费用类型" });
    }

    // 获取申请人部门
    const emp = dbGet("SELECT department_id FROM employees WHERE id = ?", [userId]);
    const departmentId = emp?.department_id || null;

    // 创建报销主记录
    const result = dbRun(
      `INSERT INTO expense_records (tenant_id, employee_id, department_id, expense_type, amount, currency, expense_date, description, invoice_count, contract_id, supplier_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [tenantId, userId, departmentId, expense_type, amount, currency || "CNY", expense_date, description || null, invoice_count || 0, contract_id || null, supplier_name || null]
    );
    const expenseId = result.lastInsertRowid;

    // 插入明细项
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        dbRun(
          `INSERT INTO expense_items (expense_record_id, item_type, amount, description, invoice_no, invoice_date) VALUES (?, ?, ?, ?, ?, ?)`,
          [expenseId, item.item_type || expense_type, item.amount, item.description || null, item.invoice_no || null, item.invoice_date || null]
        );
      }
    }

    // 创建审批流程
    let workflowInstanceId = null;
    if (workflow_id) {
      workflowInstanceId = WorkflowEngine.createInstance({
        tenant_id: tenantId,
        workflow_id: workflow_id,
        title: `费用报销：¥${amount}（${expense_date}）`,
        variables: { expense_id: expenseId, expense_type, amount, expense_date },
        started_by: userId,
      });
      dbRun("UPDATE expense_records SET workflow_instance_id = ? WHERE id = ?", [workflowInstanceId, expenseId]);
    }

    res.json({ success: true, message: "报销申请已提交", data: { id: expenseId, workflow_instance_id: workflowInstanceId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 获取报销记录详情（含明细） */
expenseRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    const userId = req.user!.id;

    const record = dbGet(
      `SELECT er.*, e.name as employee_name, d.name as department_name
       FROM expense_records er
       LEFT JOIN employees e ON er.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE er.id = ? AND er.tenant_id = ?`,
      [id, tenantId]
    );

    if (!record) return res.status(404).json({ success: false, error: "报销记录不存在" });
    if (!isAdmin && (record as any).employee_id !== userId) {
      return res.status(403).json({ success: false, error: "无权查看此记录" });
    }

    const items = dbAll("SELECT * FROM expense_items WHERE expense_record_id = ? ORDER BY id", [id]);
    res.json({ success: true, data: { ...record, items } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 撤回报销申请 */
expenseRoutes.put("/:id/cancel", (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const id = parseInt(req.params.id);

    const record = dbGet("SELECT * FROM expense_records WHERE id = ? AND tenant_id = ?", [id, tenantId]);
    if (!record) return res.status(404).json({ success: false, error: "报销记录不存在" });
    if ((record as any).employee_id !== userId) return res.status(403).json({ success: false, error: "无权操作" });
    if ((record as any).status !== "pending") return res.status(400).json({ success: false, error: "只有审批中的申请可以撤回" });

    dbRun("UPDATE expense_records SET status = 'cancelled' WHERE id = ?", [id]);
    res.json({ success: true, message: "报销申请已撤回" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 标记报销已付款（管理员/财务） */
expenseRoutes.put("/:id/pay", (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
    if (!isAdmin) return res.status(403).json({ success: false, error: "无权限操作" });

    const id = parseInt(req.params.id);
    const record = dbGet("SELECT * FROM expense_records WHERE id = ?", [id]);
    if (!record) return res.status(404).json({ success: false, error: "报销记录不存在" });
    if ((record as any).status !== "approved") return res.status(400).json({ success: false, error: "只有已审批通过的报销可以标记付款" });

    dbRun("UPDATE expense_records SET status = 'paid', payment_status = 'paid', paid_at = datetime('now') WHERE id = ?", [id]);
    res.json({ success: true, message: "已标记为已付款" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** 月度报销统计 */
expenseRoutes.get("/stats/monthly", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const month = req.query.month as string;
    const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

    if (!month) return res.status(400).json({ success: false, error: "缺少 month 参数" });

    let where = "tenant_id = ? AND strftime('%Y-%m', expense_date) = ?";
    let params: any[] = [tenantId, month];

    if (!isAdmin) {
      where += " AND employee_id = ?";
      params.push(req.user!.id);
    }

    const byType = dbAll(
      `SELECT expense_type, COUNT(*) as count, SUM(amount) as total
       FROM expense_records WHERE ${where} GROUP BY expense_type`,
      params
    );

    const summary = dbGet(
      `SELECT COUNT(*) as total, SUM(amount) as total_amount, AVG(amount) as avg_amount
       FROM expense_records WHERE ${where}`, params
    );

    res.json({ success: true, data: { byType, summary } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
