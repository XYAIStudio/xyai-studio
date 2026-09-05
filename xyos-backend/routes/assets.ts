import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware";
import { dbGet, dbRun, dbAll } from "../db";
import { logActivity, createNotification } from "../services/notification";

export const assetRoutes = Router();
assetRoutes.use(authenticate);

// ===== 采购审批链解析 =====

/**
 * 按照「直管领导 → 分管领导」二级审批链解析审批人
 * Step 1: 申请人直管领导（reporting_lines solid line 的直接上级）
 * Step 2: 分管领导（直管领导的直接上级，沿 reporting_lines 再走一层）
 *         如果二级上级缺失 → 仅需直管领导一级审批
 * 
 * 返回 { step1, step2 }，每个为 { user_id, name } 或 null
 */
function resolveProcurementApprovers(userId: number, tenantId: number): {
  step1: { user_id: number; name: string } | null;
  step2: { user_id: number; name: string } | null;
} {
  // Step 1: 直管领导（从申请人沿 reporting_lines solid 走一层）
  let step1: { user_id: number; name: string } | null = null;
  const employee = dbGet(
    "SELECT id FROM employees WHERE user_id = ? AND tenant_id = ?",
    [userId, tenantId]
  ) as any;
  if (employee) {
    const manager = dbGet(
      `SELECT rl.manager_id as employee_id, e.user_id, COALESCE(u.nickname, e.name) as name
       FROM reporting_lines rl
       JOIN employees e ON rl.manager_id = e.id
       LEFT JOIN users u ON e.user_id = u.id
       WHERE rl.employee_id = ? AND rl.tenant_id = ? AND rl.line_type = 'solid'
       LIMIT 1`,
      [employee.id, tenantId]
    ) as any;
    if (manager) step1 = { user_id: manager.user_id, name: manager.name };

    // Step 2: 分管领导（从直管领导沿 reporting_lines 再走一层）
    let step2: { user_id: number; name: string } | null = null;
    if (manager?.employee_id) {
      const secondManager = dbGet(
        `SELECT e.user_id, COALESCE(u.nickname, e.name) as name
         FROM reporting_lines rl
         JOIN employees e ON rl.manager_id = e.id
         LEFT JOIN users u ON e.user_id = u.id
         WHERE rl.employee_id = ? AND rl.tenant_id = ? AND rl.line_type = 'solid'
         LIMIT 1`,
        [manager.employee_id, tenantId]
      ) as any;
      if (secondManager) step2 = { user_id: secondManager.user_id, name: secondManager.name };
    }
    // Step 2 缺失时保持 null → 下游自动降级为单步审批（仅直管领导）
    return { step1, step2 };
  }

  // 申请人本身没有 reporting_lines 记录 → 降级到管理员单步审批
  const admin = dbGet(
    `SELECT id, COALESCE(nickname, username) as name FROM users
     WHERE tenant_id = ? AND role IN ('admin', 'super_admin') AND status = 'active'
     AND id != ? LIMIT 1`,
    [tenantId, userId]
  ) as any;
  return { step1: admin ? { user_id: admin.id, name: admin.name } : null, step2: null };
}

/**
 * 为采购申请创建工作流审批链
 * 创建 workflow_definition（如不存在）、workflow_instance、两个 workflow_tasks
 * 完成后 procurement 保持 pending 状态，等待审批链路推进
 */
function createProcurementWorkflow(
  procurementId: number,
  procurementName: string,
  tenantId: number,
  startedBy: number
): number {
  const approvers = resolveProcurementApprovers(startedBy, tenantId);

  // 构建审批步骤定义
  const steps: any[] = [];
  if (approvers.step1) {
    steps.push({ title: "直管领导审批", type: "approval", assignee_id: approvers.step1.user_id, assignee_name: approvers.step1.name });
  }
  if (approvers.step2) {
    steps.push({ title: "分管领导审批", type: "approval", assignee_id: approvers.step2.user_id, assignee_name: approvers.step2.name });
  }
  // 至少保留一步（兜底：管理员审批）
  if (steps.length === 0) {
    const admin = dbGet(
      `SELECT id, COALESCE(nickname, username) as name FROM users
       WHERE tenant_id = ? AND role IN ('admin', 'super_admin') AND status = 'active' LIMIT 1`,
      [tenantId]
    ) as any;
    steps.push({ title: "管理员审批", type: "approval", assignee_id: admin?.id || startedBy, assignee_name: admin?.name || "管理员" });
  }

  // 查找或创建「资产采购」工作流定义
  let wfDef = dbGet(
    "SELECT id FROM workflow_definitions WHERE tenant_id = ? AND name = '资产采购'",
    [tenantId]
  ) as any;
  if (!wfDef) {
    const wfResult = dbRun(
      `INSERT INTO workflow_definitions (tenant_id, name, description, definition, status, created_by)
       VALUES (?, '资产采购', '资产采购多级审批流程', ?, 'active', ?)`,
      [
        tenantId,
        JSON.stringify({
          steps: steps.map((s, i) => ({
            title: s.title,
            type: s.type,
            step_index: i,
          })),
        }),
        startedBy,
      ]
    );
    wfDef = { id: wfResult.lastInsertRowid };
  }

  // 创建 workflow_instance
  const instResult = dbRun(
    `INSERT INTO workflow_instances (tenant_id, workflow_id, title, status, variables, started_by)
     VALUES (?, ?, ?, 'running', ?, ?)`,
    [
      tenantId,
      wfDef.id,
      `资产采购: ${procurementName}`,
      JSON.stringify({ ref_type: "asset_procurement", ref_id: procurementId }),
      startedBy,
    ]
  );
  const instanceId = instResult.lastInsertRowid;

  // 创建所有审批任务（预分配审批人）
  steps.forEach((step, idx) => {
    dbRun(
      `INSERT INTO workflow_tasks (instance_id, tenant_id, step_index, title, type, status, assignee_id, assignee_type)
       VALUES (?, ?, ?, ?, 'approval', ?, ?, 'user')`,
      [instanceId, tenantId, idx, step.title, idx === 0 ? "pending" : "waiting", step.assignee_id]
    );
  });

  // 更新采购记录的 workflow_instance_id
  dbRun(
    "UPDATE asset_procurement_requests SET workflow_instance_id = ?, updated_at = datetime('now') WHERE id = ?",
    [instanceId, procurementId]
  );

  return instanceId;
}

// ===== 资产 CRUD =====

// 列表
assetRoutes.get("/", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userRole = req.user!.role;
    const { category, status, department_id, search, page = "1", limit = "20" } = req.query as Record<string, string>;

    let sql = "SELECT a.*, d.name as department_name, e.name as custodian_name FROM assets a LEFT JOIN departments d ON a.department_id = d.id LEFT JOIN employees e ON a.custodian_id = e.id WHERE a.tenant_id = ? AND a.deleted_at IS NULL";
    const params: any[] = [tenantId];

    // 非全局角色只能看本机构
    const isGlobal = ["super_admin", "admin"].includes(userRole);
    if (!isGlobal && req.user?.department_id) {
      sql += " AND a.department_id = ?";
      params.push(req.user.department_id);
    }

    if (category) { sql += " AND a.category = ?"; params.push(category); }
    if (status) { sql += " AND a.status = ?"; params.push(status); }
    if (department_id && isGlobal) { sql += " AND a.department_id = ?"; params.push(department_id); }
    if (search) {
      sql += " AND (a.name LIKE ? OR a.asset_no LIKE ? OR a.model LIKE ? OR e.name LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    // 总数（轻量 COUNT，不走 JOIN 子查询）
    let countSql = "SELECT COUNT(*) as total FROM assets WHERE tenant_id = ? AND deleted_at IS NULL";
    const countParams: any[] = [tenantId];
    if (!isGlobal && req.user?.department_id) { countSql += " AND department_id = ?"; countParams.push(req.user.department_id); }
    if (category) { countSql += " AND category = ?"; countParams.push(category); }
    if (status) { countSql += " AND status = ?"; countParams.push(status); }
    if (department_id && isGlobal) { countSql += " AND department_id = ?"; countParams.push(department_id); }
    if (search) {
      countSql += " AND (a.name LIKE ? OR a.asset_no LIKE ? OR a.model LIKE ?)";
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    const countRow = dbGet(countSql, countParams) as any;
    const total = countRow?.total || 0;

    // 分页
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    sql += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
    params.push(limitNum, (pageNum - 1) * limitNum);

    const rows = dbAll(sql, params);

    // 分类统计（不受分页影响）
    let statsSql = "SELECT category, COUNT(*) as count FROM assets WHERE tenant_id = ? AND deleted_at IS NULL GROUP BY category";
    const statsParams: any[] = [tenantId];
    if (!isGlobal && req.user?.department_id) {
      statsSql += " AND department_id = ?";
      statsParams.push(req.user.department_id);
    }
    const stats = dbAll(statsSql, statsParams);

    res.json({ success: true, data: rows, total, page: pageNum, limit: limitNum, stats });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 新增
assetRoutes.post("/", (req: AuthRequest, res) => {
  try {
    const {
      asset_no, name, category, sub_category, model, sn, manufacturer,
      purchase_date, purchase_price, expected_life, status, owner_type,
      department_id, location_detail, custodian_id, remark
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({ success: false, error: "资产名称和分类必填" });
    }

    const tenantId = req.user!.tenant_id;

    // 生成资产编号（如未提供）
    const finalAssetNo = asset_no || `AST-${category}-${Date.now().toString(36).toUpperCase()}`;

    const result = dbRun(
      `INSERT INTO assets (asset_no, name, category, sub_category, model, sn, manufacturer,
        purchase_date, purchase_price, expected_life, status, owner_type,
        department_id, location_detail, custodian_id, remark, tenant_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalAssetNo, name, category, sub_category || null, model || null, sn || null,
        manufacturer || null, purchase_date || null, purchase_price || 0,
        expected_life || null, status || "in_stock", owner_type || "owned",
        department_id || null, location_detail || null, custodian_id || null,
        remark || null, tenantId, req.user!.id
      ]
    );

    const newAsset = dbGet("SELECT * FROM assets WHERE id = ?", [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: newAsset });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 编辑
assetRoutes.put("/:id", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = dbGet("SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [id, req.user!.tenant_id]) as any;
    if (!existing) return res.status(404).json({ success: false, error: "资产不存在" });

    const {
      asset_no, name, category, sub_category, model, sn, manufacturer,
      purchase_date, purchase_price, expected_life, status, owner_type,
      department_id, location_detail, custodian_id, remark
    } = req.body;

    const updates = [
      "asset_no = ?", "name = ?", "category = ?", "sub_category = ?",
      "model = ?", "sn = ?", "manufacturer = ?", "purchase_date = ?",
      "purchase_price = ?", "expected_life = ?", "status = ?", "owner_type = ?",
      "department_id = ?", "location_detail = ?", "custodian_id = ?", "remark = ?",
      "updated_at = datetime('now')"
    ];
    const params = [
      asset_no ?? existing.asset_no, name ?? existing.name, category ?? existing.category,
      sub_category ?? existing.sub_category, model ?? existing.model, sn ?? existing.sn,
      manufacturer ?? existing.manufacturer, purchase_date ?? existing.purchase_date,
      purchase_price ?? existing.purchase_price, expected_life ?? existing.expected_life,
      status ?? existing.status, owner_type ?? existing.owner_type,
      department_id ?? existing.department_id, location_detail ?? existing.location_detail,
      custodian_id ?? existing.custodian_id, remark ?? existing.remark, id
    ];

    dbRun(`UPDATE assets SET ${updates.join(", ")} WHERE id = ?`, params);
    const updated = dbGet("SELECT * FROM assets WHERE id = ?", [id]);
    res.json({ success: true, data: updated });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 软删除
assetRoutes.delete("/:id", (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    if (!["super_admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: "仅超级管理员可删除资产" });
    }
    const id = parseInt(req.params.id);
    const existing = dbGet("SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [id, req.user!.tenant_id]);
    if (!existing) return res.status(404).json({ success: false, error: "资产不存在" });

    dbRun("UPDATE assets SET deleted_at = datetime('now') WHERE id = ?", [id]);
    res.json({ success: true, message: "已删除" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 分类扩展字段 =====

assetRoutes.get("/:id/category", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const asset = dbGet("SELECT category FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [id, req.user!.tenant_id]) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });

    const table = asset.category === "INSTRUMENT" ? "asset_instruments" : asset.category === "VEHICLE" ? "asset_vehicles" : asset.category === "OFFICE" ? "asset_office" : null;
    if (!table) return res.json({ success: true, data: null });

    const row = dbGet(`SELECT * FROM ${table} WHERE asset_id = ?`, [id]);
    res.json({ success: true, data: row || null });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

assetRoutes.put("/:id/category", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const asset = dbGet("SELECT category FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [id, req.user!.tenant_id]) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });

    const table = asset.category === "INSTRUMENT" ? "asset_instruments" : asset.category === "VEHICLE" ? "asset_vehicles" : asset.category === "OFFICE" ? "asset_office" : null;
    if (!table) return res.status(400).json({ success: false, error: "该分类无扩展字段" });

    const data = req.body;
    const existing = dbGet(`SELECT * FROM ${table} WHERE asset_id = ?`, [id]);

    // 分类扩展字段白名单（防止列名注入）
    const ALLOWED_CATEGORY_FIELDS: Record<string, string[]> = {
      INSTRUMENT: ["calibration_cycle","last_calibration","next_calibration","calibration_agency","precision_level","measure_range","env_requirements"],
      VEHICLE: ["plate_no","vin","vehicle_type","fuel_type","seat_count","insurance_company","insurance_expire","last_inspection","next_inspection","current_mileage"],
      OFFICE: ["device_type","brand","cpu","ram","storage","os","ip_address","mac_address","consumable_model"],
    };
    const whitelist = ALLOWED_CATEGORY_FIELDS[asset.category] || [];
    const safeData = Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== "asset_id" && whitelist.includes(k))
    );

    if (!existing) {
      // INSERT
      const keys = Object.keys(safeData);
      if (keys.length === 0) return res.json({ success: true, data: null });
      const cols = ["asset_id", ...keys];
      const vals = [id, ...keys.map(k => safeData[k])];
      const placeholders = vals.map(() => "?").join(", ");
      dbRun(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`, vals);
    } else {
      // UPDATE
      const sets = Object.keys(safeData).map(k => `${k} = ?`);
      const vals = Object.keys(safeData).map(k => safeData[k]);
      if (sets.length > 0) {
        dbRun(`UPDATE ${table} SET ${sets.join(", ")} WHERE asset_id = ?`, [...vals, id]);
      }
    }

    const row = dbGet(`SELECT * FROM ${table} WHERE asset_id = ?`, [id]);
    res.json({ success: true, data: row });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 流转记录 =====

assetRoutes.get("/:id/transactions", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = dbAll(
      `SELECT t.*, fd.name as from_dept_name, td.name as to_dept_name,
              fu.name as from_user_name, tu.name as to_user_name
       FROM asset_transactions t
       LEFT JOIN departments fd ON t.from_dept_id = fd.id
       LEFT JOIN departments td ON t.to_dept_id = td.id
       LEFT JOIN employees fu ON t.from_user_id = fu.id
       LEFT JOIN employees tu ON t.to_user_id = tu.id
       WHERE t.asset_id = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 领用
assetRoutes.post("/:id/checkout", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet("SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [assetId, req.user!.tenant_id]) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (asset.status !== "in_stock" && asset.status !== "idle") {
      return res.status(400).json({ success: false, error: "仅「在库」或「闲置」的资产可领用" });
    }

    const { to_user_id, expected_return, remark } = req.body;
    if (!to_user_id) return res.status(400).json({ success: false, error: "领用人必填" });

    const tid = req.user!.tenant_id;

    dbRun(
      `INSERT INTO asset_transactions (asset_id, type, from_user_id, to_user_id, expected_return, remark, tenant_id, created_by)
       VALUES (?, 'checkout', ?, ?, ?, ?, ?, ?)`,
      [assetId, asset.custodian_id || null, to_user_id, expected_return || null, remark || null, tid, req.user!.id]
    );

    dbRun("UPDATE assets SET status = 'in_use', custodian_id = ?, updated_at = datetime('now') WHERE id = ?", [to_user_id, assetId]);

    const updated = dbGet("SELECT * FROM assets WHERE id = ?", [assetId]);
    res.json({ success: true, data: updated, message: "领用成功" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 归还
assetRoutes.post("/:id/return", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet("SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [assetId, req.user!.tenant_id]) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (asset.status !== "in_use") {
      return res.status(400).json({ success: false, error: "仅「使用中」的资产可归还" });
    }

    const { condition, remark } = req.body;

    dbRun(
      `INSERT INTO asset_transactions (asset_id, type, from_user_id, condition, remark, tenant_id, created_by)
       VALUES (?, 'return', ?, ?, ?, ?, ?)`,
      [assetId, asset.custodian_id, condition || "good", remark || null, req.user!.tenant_id, req.user!.id]
    );

    const newStatus = condition === "damaged" ? "repairing" : condition === "lost" ? "lost" : "in_stock";
    dbRun("UPDATE assets SET status = ?, custodian_id = NULL, updated_at = datetime('now') WHERE id = ?", [newStatus, assetId]);

    const updated = dbGet("SELECT * FROM assets WHERE id = ?", [assetId]);
    res.json({ success: true, data: updated, message: "归还成功" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 预警 =====

assetRoutes.get("/alerts", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const now = new Date().toISOString().split("T")[0];

    // 30天后
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const date30 = d30.toISOString().split("T")[0];

    // 60天后
    const d60 = new Date();
    d60.setDate(d60.getDate() + 60);
    const date60 = d60.toISOString().split("T")[0];

    // 90天前（闲置阈值）
    const d90ago = new Date();
    d90ago.setDate(d90ago.getDate() - 90);

    // 仪器校准到期预警
    const calibrationAlerts = dbAll(
      `SELECT a.id, a.asset_no, a.name, ai.next_calibration, ai.last_calibration, ai.calibration_cycle
       FROM assets a JOIN asset_instruments ai ON a.id = ai.asset_id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.status != 'scrapped'
         AND ai.next_calibration IS NOT NULL AND ai.next_calibration <= ?
       ORDER BY ai.next_calibration ASC`,
      [tenantId, date30]
    );

    // 车辆年检到期预警
    const vehicleInspectionAlerts = dbAll(
      `SELECT a.id, a.asset_no, a.name, av.next_inspection, av.plate_no
       FROM assets a JOIN asset_vehicles av ON a.id = av.asset_id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.status != 'scrapped'
         AND av.next_inspection IS NOT NULL AND av.next_inspection <= ?
       ORDER BY av.next_inspection ASC`,
      [tenantId, date30]
    );

    // 车辆保险到期预警
    const vehicleInsuranceAlerts = dbAll(
      `SELECT a.id, a.asset_no, a.name, av.insurance_expire, av.plate_no
       FROM assets a JOIN asset_vehicles av ON a.id = av.asset_id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.status != 'scrapped'
         AND av.insurance_expire IS NOT NULL AND av.insurance_expire <= ?
       ORDER BY av.insurance_expire ASC`,
      [tenantId, date30]
    );

    // 闲置资产（超过90天未变动）
    const idleAlerts = dbAll(
      `SELECT a.id, a.asset_no, a.name, a.category, a.status, a.updated_at, d.name as department_name
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL
         AND a.status IN ('in_stock','idle') AND a.updated_at <= ?
       ORDER BY a.updated_at ASC`,
      [tenantId, d90ago.toISOString().split("T")[0]]
    );

    // 保修到期预警（走 warranty_expire_date 冗余列+复合索引）
    const warrantyAlerts = dbAll(
      `SELECT a.id, a.asset_no, a.name, a.category, a.purchase_date, a.expected_life, a.warranty_expire_date
       FROM assets a
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.status != 'scrapped'
         AND a.warranty_expire_date IS NOT NULL AND a.warranty_expire_date <= ?
       ORDER BY a.warranty_expire_date ASC`,
      [tenantId, date60]
    );

    res.json({
      success: true,
      data: {
        calibration: calibrationAlerts,
        vehicle_inspection: vehicleInspectionAlerts,
        vehicle_insurance: vehicleInsuranceAlerts,
        idle: idleAlerts,
        warranty: warrantyAlerts,
        summary: {
          calibration: calibrationAlerts.length,
          vehicle_inspection: vehicleInspectionAlerts.length,
          vehicle_insurance: vehicleInsuranceAlerts.length,
          idle: idleAlerts.length,
          warranty: warrantyAlerts.length,
                  total: calibrationAlerts.length + vehicleInspectionAlerts.length
                  + vehicleInsuranceAlerts.length + idleAlerts.length + warrantyAlerts.length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 闲置池 =====

assetRoutes.get("/idle-pool", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const whereClause = "WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'idle'";

    // 轻量 COUNT
    const countRow = dbGet(`SELECT COUNT(*) as total FROM assets a ${whereClause}`, [tenantId]) as any;
    const total = countRow?.total || 0;

    const rows = dbAll(
      `SELECT a.*, d.name as department_name, e.name as custodian_name,
              CAST(julianday('now') - julianday(a.updated_at) AS INTEGER) as days_idle
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       LEFT JOIN employees e ON a.custodian_id = e.id
       ${whereClause}
       ORDER BY days_idle DESC LIMIT ? OFFSET ?`,
      [tenantId, limitNum, (pageNum - 1) * limitNum]
    );
    res.json({ success: true, data: rows, total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 标记为闲置
assetRoutes.post("/:id/idle", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet(
      "SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [assetId, req.user!.tenant_id]
    ) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (!["in_stock", "in_use"].includes(asset.status)) {
      return res.status(400).json({ success: false, error: "仅「在库」或「使用中」可标记为闲置" });
    }

    const { remark } = req.body;
    dbRun(
      `INSERT INTO asset_transactions (asset_id, type, from_user_id, remark, tenant_id, created_by)
       VALUES (?, 'transfer', ?, ?, ?, ?)`,
      [assetId, asset.custodian_id, remark || "标记为闲置", req.user!.tenant_id, req.user!.id]
    );
    dbRun(
      "UPDATE assets SET status = 'idle', custodian_id = NULL, updated_at = datetime('now') WHERE id = ?",
      [assetId]
    );

    const updated = dbGet("SELECT * FROM assets WHERE id = ?", [assetId]);
    res.json({ success: true, data: updated, message: "已标记为闲置" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message }); 
  }
});

// ===== 调拨流程 =====

// 发起调拨
assetRoutes.post("/:id/transfer", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet(
      "SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [assetId, req.user!.tenant_id]
    ) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (!["in_stock", "idle"].includes(asset.status)) {
      return res.status(400).json({ success: false, error: "仅「在库」或「闲置」的资产可调拨" });
    }

    const { to_dept_id, remark } = req.body;
    if (!to_dept_id) return res.status(400).json({ success: false, error: "目标机构必填" });

    const tid = req.user!.tenant_id;

    // 查找或创建"资产调拨"工作流定义
    let wfDef = dbGet(
      "SELECT id FROM workflow_definitions WHERE tenant_id = ? AND name = '资产调拨'",
      [tid]
    ) as any;
    if (!wfDef) {
      const wfResult = dbRun(
        "INSERT INTO workflow_definitions (tenant_id, name, description, definition, created_by) VALUES (?, ?, ?, ?, ?)",
        [
          tid,
          "资产调拨",
          "资产跨机构调拨审批流程",
          JSON.stringify([
            { step: 1, name: "部门负责人审批", role: "部门负责人" },
            { step: 2, name: "资产管理员确认", role: "资产管理员" },
          ]),
          req.user!.id,
        ]
      );
      wfDef = { id: wfResult.lastInsertRowid };
    }

    // 创建工作流实例（variables列存储引用信息）
    const instResult = dbRun(
      `INSERT INTO workflow_instances (tenant_id, workflow_id, title, status, variables, started_by)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [
        tid,
        wfDef.id,
        `资产调拨: ${asset.name} (${asset.asset_no})`,
        JSON.stringify({
          ref_type: "asset_transfer",
          ref_id: assetId,
          asset_id: assetId,
          asset_name: asset.name,
          asset_no: asset.asset_no,
          from_dept_id: asset.department_id,
          to_dept_id,
          remark: remark || "",
        }),
        req.user!.id,
      ]
    );
    const instanceId = instResult.lastInsertRowid;

    // 更新资产状态为"调拨中"
    dbRun(
      "UPDATE assets SET status = 'transferring', updated_at = datetime('now') WHERE id = ?",
      [assetId]
    );

    // 记录流转
    dbRun(
      `INSERT INTO asset_transactions (asset_id, type, from_dept_id, to_dept_id, remark, approval_id, tenant_id, created_by)
       VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?)`,
      [assetId, asset.department_id, to_dept_id, remark || "", String(instanceId), tid, req.user!.id]
    );

    res.status(201).json({
      success: true,
      data: { instance_id: instanceId, workflow_id: wfDef.id },
      message: "调拨申请已提交，等待审批",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 盘点 =====

// 盘点任务列表
assetRoutes.get("/count-tasks", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = dbAll(
      "SELECT * FROM asset_count_tasks WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
      [tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建盘点任务
assetRoutes.post("/count-tasks", (req: AuthRequest, res) => {
  try {
    const { title, description, department_id, scope, scope_ids } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "盘点标题必填" });

    const result = dbRun(
      `INSERT INTO asset_count_tasks (title, description, department_id, scope, scope_ids, tenant_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || null,
        department_id || null,
        scope || "all",
        scope_ids || null,
        req.user!.tenant_id,
        req.user!.id,
      ]
    );

    const task = dbGet("SELECT * FROM asset_count_tasks WHERE id = ?", [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: task });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新盘点任务
assetRoutes.put("/count-tasks/:id", (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = dbGet(
      "SELECT * FROM asset_count_tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [id, req.user!.tenant_id]
    ) as any;
    if (!existing) return res.status(404).json({ success: false, error: "盘点任务不存在" });

    const { title, description, status, start_date, end_date } = req.body;
    dbRun(
      `UPDATE asset_count_tasks SET title=?, description=?, status=?, start_date=?, end_date=?, updated_at=datetime('now') WHERE id=?`,
      [
        title ?? existing.title,
        description ?? existing.description,
        status ?? existing.status,
        start_date ?? existing.start_date,
        end_date ?? existing.end_date,
        id,
      ]
    );

    const task = dbGet("SELECT * FROM asset_count_tasks WHERE id = ?", [id]);
    res.json({ success: true, data: task });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 盘点任务详情+结果
assetRoutes.get("/count-tasks/:id/results", (req: AuthRequest, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = dbGet(
      "SELECT * FROM asset_count_tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [taskId, req.user!.tenant_id]
    );
    if (!task) return res.status(404).json({ success: false, error: "盘点任务不存在" });

    const results = dbAll(
      `SELECT cr.*, a.asset_no, a.name as asset_name, a.category,
              ec.name as expected_custodian_name, ac.name as actual_custodian_name
       FROM asset_count_results cr
       JOIN assets a ON cr.asset_id = a.id
       LEFT JOIN employees ec ON cr.expected_custodian_id = ec.id
       LEFT JOIN employees ac ON cr.actual_custodian_id = ac.id
       WHERE cr.task_id = ?
       ORDER BY a.category, a.asset_no`,
      [taskId]
    );

    res.json({ success: true, data: { task, results } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 录入盘点结果
assetRoutes.post("/count-tasks/:id/results", (req: AuthRequest, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = dbGet(
      "SELECT * FROM asset_count_tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [taskId, req.user!.tenant_id]
    ) as any;
    if (!task) return res.status(404).json({ success: false, error: "盘点任务不存在" });
    if (task.status !== "in_progress") {
      return res.status(400).json({ success: false, error: "盘点任务未在进行中" });
    }

    const { asset_id, actual_location, actual_status, actual_custodian_id, result, remark, force_overwrite } = req.body;
    if (!asset_id || !result) {
      return res.status(400).json({ success: false, error: "资产ID和盘点结果必填" });
    }

    const asset = dbGet(
      "SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [asset_id, req.user!.tenant_id]
    );
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });

    const existingRecord = dbGet(
      "SELECT id FROM asset_count_results WHERE task_id = ? AND asset_id = ?",
      [taskId, asset_id]
    ) as any;

    if (existingRecord && force_overwrite) {
      dbRun(
        `UPDATE asset_count_results SET actual_location=?, actual_status=?, actual_custodian_id=?, result=?, remark=?, counted_by=?, counted_at=datetime('now') WHERE id=?`,
        [
          actual_location ?? asset.location_detail,
          actual_status ?? asset.status,
          actual_custodian_id ?? asset.custodian_id,
          result, remark || null, req.user!.id, existingRecord.id,
        ]
      );
      return res.json({ success: true, message: "盘点结果已更新" });
    } else if (existingRecord) {
      return res.status(400).json({
        success: false,
        error: "该资产已盘点，请使用 force_overwrite=true 覆盖",
        existing_result: existingRecord,
      });
    }

    dbRun(
      `INSERT INTO asset_count_results (task_id, asset_id, expected_location, actual_location, expected_status, actual_status,
        expected_custodian_id, actual_custodian_id, result, remark, counted_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId, asset_id,
        asset.location_detail, actual_location ?? asset.location_detail,
        asset.status, actual_status ?? asset.status,
        asset.custodian_id, actual_custodian_id ?? asset.custodian_id,
        result, remark || null, req.user!.id, req.user!.tenant_id,
      ]
    );

    res.status(201).json({ success: true, message: "盘点结果已录入" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 盘点差异报告（汇总统计）
assetRoutes.get("/count-tasks/:id/report", (req: AuthRequest, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const task = dbGet(
      "SELECT * FROM asset_count_tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [taskId, req.user!.tenant_id]
    );
    if (!task) return res.status(404).json({ success: false, error: "盘点任务不存在" });

    const summary = dbGet(
      `SELECT
        COUNT(*) as total_counted,
        SUM(CASE WHEN result='match' THEN 1 ELSE 0 END) as match_count,
        SUM(CASE WHEN result='difference' THEN 1 ELSE 0 END) as diff_count,
        SUM(CASE WHEN result='not_found' THEN 1 ELSE 0 END) as not_found_count,
        SUM(CASE WHEN result='pending' THEN 1 ELSE 0 END) as pending_count
       FROM asset_count_results WHERE task_id = ?`,
      [taskId]
    );

    const differences = dbAll(
      `SELECT cr.*, a.asset_no, a.name as asset_name, a.category
       FROM asset_count_results cr
       JOIN assets a ON cr.asset_id = a.id
       WHERE cr.task_id = ? AND cr.result IN ('difference','not_found')
       ORDER BY a.category, a.asset_no`,
      [taskId]
    );

    res.json({ success: true, data: { task, summary, differences } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 车辆日志 =====

assetRoutes.get("/:id/vehicle-logs", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet(
      "SELECT category FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [assetId, req.user!.tenant_id]
    ) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (asset.category !== "VEHICLE") {
      return res.status(400).json({ success: false, error: "仅车辆资产支持使用日志" });
    }

    const rows = dbAll(
      "SELECT * FROM asset_vehicle_logs WHERE vehicle_asset_id = ? ORDER BY log_date DESC",
      [assetId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

assetRoutes.post("/:id/vehicle-logs", (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id);
    const asset = dbGet(
      "SELECT category FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
      [assetId, req.user!.tenant_id]
    ) as any;
    if (!asset) return res.status(404).json({ success: false, error: "资产不存在" });
    if (asset.category !== "VEHICLE") {
      return res.status(400).json({ success: false, error: "仅车辆资产支持使用日志" });
    }

    const { log_type, cost, mileage, log_date, description } = req.body;
    if (!log_type || !log_date) {
      return res.status(400).json({ success: false, error: "日志类型和日期必填" });
    }

    const result = dbRun(
      `INSERT INTO asset_vehicle_logs (vehicle_asset_id, log_type, cost, mileage, log_date, description, created_by, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [assetId, log_type, cost || 0, mileage || null, log_date, description || null, req.user!.id, req.user!.tenant_id]
    );

    const log = dbGet("SELECT * FROM asset_vehicle_logs WHERE id = ?", [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: log });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Phase 4: 离职清算 =====

// 查询某员工持有的全部资产
assetRoutes.get("/offboard-check/:employeeId", (req: AuthRequest, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const tenantId = req.user!.tenant_id;

    const employee = dbGet(
      "SELECT id, name, department_id FROM employees WHERE id = ? AND tenant_id = ?",
      [employeeId, tenantId]
    );
    if (!employee) return res.status(404).json({ success: false, error: "员工不存在" });

    const assets = dbAll(
      `SELECT a.*, d.name as department_name
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       WHERE a.custodian_id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'in_use'`,
      [employeeId, tenantId]
    );

    res.json({
      success: true,
      data: {
        employee,
        assets,
        count: assets.length,
        total_value: assets.reduce((sum: number, a: any) => sum + (a.purchase_price || 0), 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 一键归还某员工所有资产
assetRoutes.post("/offboard-clear/:employeeId", (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    if (!["super_admin", "admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: "仅管理员可执行离职清算" });
    }

    const employeeId = parseInt(req.params.employeeId);
    const tenantId = req.user!.tenant_id;

    const assets = dbAll(
      "SELECT id FROM assets WHERE custodian_id = ? AND tenant_id = ? AND deleted_at IS NULL AND status = 'in_use'",
      [employeeId, tenantId]
    ) as any[];

    if (assets.length === 0) {
      return res.json({ success: true, message: "该员工无持有资产", cleared: 0 });
    }

    for (const a of assets) {
      dbRun(
        `INSERT INTO asset_transactions (asset_id, type, from_user_id, remark, tenant_id, created_by)
         VALUES (?, 'return', ?, ?, ?, ?)`,
        [a.id, employeeId, "员工离职自动归还", tenantId, req.user!.id]
      );
    }

    dbRun(
      "UPDATE assets SET status = 'in_stock', custodian_id = NULL, updated_at = datetime('now') WHERE custodian_id = ? AND tenant_id = ? AND deleted_at IS NULL AND status = 'in_use'",
      [employeeId, tenantId]
    );

    res.json({ success: true, message: `已归还 ${assets.length} 件资产`, cleared: assets.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Phase 4: 车辆费用报表 =====

assetRoutes.get("/vehicle-expenses", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { start_date, end_date, vehicle_id, group_by, year } = req.query as Record<string, string>;

    let where = "WHERE vl.tenant_id = ?";
    const params: any[] = [tenantId];

    if (vehicle_id) { where += " AND vl.vehicle_asset_id = ?"; params.push(parseInt(vehicle_id)); }
    // 支持 year 参数：自动转换为年度范围
    if (year && !isNaN(parseInt(year))) {
      where += " AND vl.log_date >= ? AND vl.log_date <= ?";
      params.push(`${year}-01-01`, `${year}-12-31`);
    }
    if (start_date) { where += " AND vl.log_date >= ?"; params.push(start_date); }
    if (end_date) { where += " AND vl.log_date <= ?"; params.push(end_date); }

    const groupField = group_by === "month"
      ? "strftime('%Y-%m', vl.log_date)"
      : group_by === "type"
      ? "vl.log_type"
      : group_by === "vehicle"
      ? "vl.vehicle_asset_id"
      : null;

    let sql: string;
    if (groupField) {
      sql = `SELECT ${groupField} as group_key, COUNT(*) as count, SUM(vl.cost) as total_cost,
              a.name as vehicle_name, a.asset_no
             FROM asset_vehicle_logs vl
             JOIN assets a ON vl.vehicle_asset_id = a.id
             ${where}
             GROUP BY ${groupField}
             ORDER BY total_cost DESC`;
    } else {
      sql = `SELECT vl.*, a.name as vehicle_name, a.asset_no
             FROM asset_vehicle_logs vl
             JOIN assets a ON vl.vehicle_asset_id = a.id
             ${where}
             ORDER BY vl.log_date DESC`;
    }

    const rows = dbAll(sql, params);

    const totalCost = dbGet(
      `SELECT SUM(cost) as total FROM asset_vehicle_logs vl ${where}`,
      params
    ) as any;

    res.json({
      success: true,
      data: rows,
      summary: {
        total_cost: totalCost?.total || 0,
        record_count: rows.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Phase 4: 资产驾驶舱 =====

assetRoutes.get("/dashboard", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;

    const totalAssets = dbGet(
      "SELECT COUNT(*) as count, SUM(purchase_price) as total_value FROM assets WHERE tenant_id = ? AND deleted_at IS NULL",
      [tenantId]
    ) as any;

    const byCategory = dbAll(
      `SELECT category, COUNT(*) as count, SUM(purchase_price) as total_value
       FROM assets WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY category ORDER BY count DESC`,
      [tenantId]
    );

    const byStatus = dbAll(
      `SELECT status, COUNT(*) as count
       FROM assets WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY status ORDER BY count DESC`,
      [tenantId]
    );

    const byDepartment = dbAll(
      `SELECT a.department_id, d.name as department_name, COUNT(*) as count, SUM(a.purchase_price) as total_value
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.department_id IS NOT NULL
       GROUP BY a.department_id ORDER BY count DESC`,
      [tenantId]
    );

    const byOwnerType = dbAll(
      `SELECT owner_type, COUNT(*) as count, SUM(purchase_price) as total_value
       FROM assets WHERE tenant_id = ? AND deleted_at IS NULL
       GROUP BY owner_type ORDER BY count DESC`,
      [tenantId]
    );

    // 本月新增
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const newThisMonth = dbGet(
      "SELECT COUNT(*) as count, SUM(purchase_price) as total_value FROM assets WHERE tenant_id = ? AND deleted_at IS NULL AND created_at LIKE ?",
      [tenantId, `${thisMonth}%`]
    ) as any;

    // 本月流转
    const txThisMonth = dbGet(
      "SELECT COUNT(*) as count FROM asset_transactions WHERE tenant_id = ? AND deleted_at IS NULL AND created_at LIKE ?",
      [tenantId, `${thisMonth}%`]
    ) as any;

    // 待审批调拨数：查找 status=pending 且 variables 含 ref_type=asset_transfer 的工作流实例
    const pendingTransfers = dbGet(
      `SELECT COUNT(*) as count FROM workflow_instances
       WHERE tenant_id = ? AND status = 'pending' AND variables LIKE '%asset_transfer%'`,
      [tenantId]
    ) as any;

    res.json({
      success: true,
      data: {
        overview: {
          total: totalAssets?.count || 0,
          total_value: totalAssets?.total_value || 0,
          new_this_month: newThisMonth?.count || 0,
          new_value_this_month: newThisMonth?.total_value || 0,
          tx_this_month: txThisMonth?.count || 0,
          pending_transfers: pendingTransfers?.count || 0,
        },
        by_category: byCategory,
        by_status: byStatus,
        by_department: byDepartment,
        by_owner_type: byOwnerType,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 资产采购联动 =====

// 采购申请列表（含工作流审批进度）
assetRoutes.get("/procurements", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { status } = req.query as Record<string, string>;
    let where = "WHERE p.tenant_id = ?";
    const params: any[] = [tenantId];
    if (status) { where += " AND p.status = ?"; params.push(status); }

    const rows = dbAll(
      `SELECT p.*, u1.nickname as requester_name, u2.nickname as approver_name,
              b.name as budget_name, b.limit_amount as budget_limit, b.used_amount as budget_used,
              wi.status as workflow_status, d.name as department_name
       FROM asset_procurement_requests p
       LEFT JOIN users u1 ON p.requested_by = u1.id
       LEFT JOIN users u2 ON p.approved_by = u2.id
       LEFT JOIN budgets b ON p.budget_id = b.id
       LEFT JOIN workflow_instances wi ON p.workflow_instance_id = wi.id
       LEFT JOIN departments d ON p.department_id = d.id
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );

    // 为每个采购申请附加审批任务信息
    const enriched = rows.map((row: any) => {
      if (!row.workflow_instance_id) return row;
      const tasks = dbAll(
        `SELECT t.id, t.step_index, t.title, t.status, t.assignee_id,
                COALESCE(u.nickname, u.username) as assignee_name, t.result, t.comment, t.completed_at
         FROM workflow_tasks t
         LEFT JOIN users u ON t.assignee_id = u.id
         WHERE t.instance_id = ?
         ORDER BY t.step_index`,
        [row.workflow_instance_id]
      );
      return { ...row, workflow_tasks: tasks };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 创建采购申请（联动工作流引擎：直管领导 → 分管领导二级审批）
assetRoutes.post("/procurements", (req: AuthRequest, res) => {
  try {
    const { name, category, quantity, estimated_cost, reason, budget_id, department_id } = req.body;
    if (!name || !category) return res.status(400).json({ success: false, error: "名称和分类必填" });

    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;

    // 获取申请人信息
    const requester = dbGet(
      "SELECT COALESCE(nickname, username) as name FROM users WHERE id = ?",
      [userId]
    ) as any;
    const requesterName = requester?.name || "未知用户";

    // 解析审批人（提前拿，用于通知）
    const approvers = resolveProcurementApprovers(userId, tenantId);

    const result = dbRun(
      `INSERT INTO asset_procurement_requests (tenant_id, name, category, quantity, estimated_cost, reason, budget_id, department_id, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, category, quantity || 1, estimated_cost || 0, reason || null, budget_id || null, department_id || null, userId]
    );
    const procurementId = result.lastInsertRowid;

    // 创建工作流审批链
    const instanceId = createProcurementWorkflow(procurementId, name, tenantId, userId);

    const record = dbGet("SELECT * FROM asset_procurement_requests WHERE id = ?", [procurementId]);

    logActivity({
      userId,
      tenantId,
      action: "procurement_create",
      details: JSON.stringify({ procurement_id: procurementId, name, category, workflow_instance_id: instanceId }),
      targetType: "procurement",
      targetId: procurementId,
    });

    // 通知直管领导（step 0 审批人）
    if (approvers.step1) {
      createNotification({
        userId: approvers.step1.user_id,
        type: "procurement_approval",
        title: "新的采购审批",
        content: `${requesterName} 提交了采购申请「${name}」（¥${(estimated_cost || 0).toLocaleString()}），需要您审核`,
        link: `/assets/procurement`,
        tenantId,
      });
    }

    // 如果有二级审批人，也发预通知
    if (approvers.step2) {
      createNotification({
        userId: approvers.step2.user_id,
        type: "procurement_notice",
        title: "采购申请待关注",
        content: `${requesterName} 提交了采购申请「${name}」，待直管领导审核后将转给您审批`,
        link: `/assets/procurement`,
        tenantId,
      });
    }

    const tasks = dbAll(
      "SELECT id, step_index, title, assignee_id, status FROM workflow_tasks WHERE instance_id = ? ORDER BY step_index",
      [instanceId]
    );

    const msgParts: string[] = [];
    if (approvers.step1) msgParts.push(`直管领导 ${approvers.step1.name} 审核`);
    if (approvers.step2) msgParts.push(`分管领导 ${approvers.step2.name} 审批`);
    const flowDesc = msgParts.length > 0 ? msgParts.join(" → ") : "管理员审批";

    res.status(201).json({
      success: true,
      data: record,
      workflow: { instance_id: instanceId, tasks },
      message: `采购申请已提交，审批流程：${flowDesc}`,
      approvers: { step1: approvers.step1, step2: approvers.step2 },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 工作流审批采购（替代原 PUT 直改状态）
assetRoutes.post("/procurements/:id/approve", (req: AuthRequest, res) => {
  try {
    const procurementId = parseInt(req.params.id);
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;

    const record = dbGet(
      "SELECT * FROM asset_procurement_requests WHERE id = ? AND tenant_id = ?",
      [procurementId, tenantId]
    ) as any;
    if (!record) return res.status(404).json({ success: false, error: "采购申请不存在" });
    if (record.status !== "pending") {
      return res.status(400).json({ success: false, error: `当前状态「${record.status}」不可审批` });
    }
    if (!record.workflow_instance_id) {
      return res.status(400).json({ success: false, error: "该申请未关联工作流" });
    }

    const { result, comment } = req.body;
    if (!result || !["approve", "reject"].includes(result)) {
      return res.status(400).json({ success: false, error: "result 必须是 approve 或 reject" });
    }

    // 查找当前待处理的 workflow_task
    const task = dbGet(
      `SELECT * FROM workflow_tasks
       WHERE instance_id = ? AND tenant_id = ? AND status = 'pending'
       ORDER BY step_index LIMIT 1`,
      [record.workflow_instance_id, tenantId]
    ) as any;
    if (!task) {
      return res.status(400).json({ success: false, error: "无待审批任务，可能已处理完毕" });
    }

    // 校验审批权限：只有指定的审批人（assignee_id）可以操作
    // admin 角色也有旁路审批权限
    const userRole = req.user!.role;
    const isAdmin = ["super_admin", "admin"].includes(userRole);
    if (task.assignee_id && task.assignee_id !== userId && !isAdmin) {
      const assignee = dbGet("SELECT COALESCE(nickname, username) as name FROM users WHERE id = ?", [task.assignee_id]) as any;
      return res.status(403).json({
        success: false,
        error: `当前审批步骤需要 ${assignee?.name || "指定审批人"} 处理`,
      });
    }

    // 完成当前任务
    dbRun(
      `UPDATE workflow_tasks SET status = 'completed', result = ?, comment = ?, completed_at = datetime('now')
       WHERE id = ?`,
      [result, comment || null, task.id]
    );

    // 获取审批人姓名（用于通知）
    const approverInfo = dbGet(
      "SELECT COALESCE(nickname, username) as name FROM users WHERE id = ?",
      [userId]
    ) as any;
    const approverName = approverInfo?.name || "审批人";

    if (result === "reject") {
      // 驳回：终止工作流 + 更新采购状态
      dbRun(
        "UPDATE workflow_instances SET status = 'rejected', completed_at = datetime('now') WHERE id = ?",
        [record.workflow_instance_id]
      );
      dbRun(
        `UPDATE asset_procurement_requests SET status = 'rejected', reject_reason = ?, approved_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [comment || null, userId, procurementId]
      );

      logActivity({
        userId,
        tenantId,
        action: "procurement_rejected",
        details: JSON.stringify({ procurement_id: procurementId, reason: comment, workflow_instance_id: record.workflow_instance_id }),
        targetType: "procurement",
        targetId: procurementId,
      });

      // 通知申请人：采购被驳回
      createNotification({
        userId: record.requested_by,
        type: "procurement_rejected",
        title: "采购申请被驳回",
        content: `${approverName} 驳回了您的采购申请「${record.name}」${comment ? `，原因：${comment}` : ""}`,
        link: `/assets/procurement`,
        tenantId,
      });

      return res.json({ success: true, message: "采购申请已驳回", status: "rejected" });
    }

    // 批准：检查是否还有下一步
    const nextTask = dbGet(
      `SELECT * FROM workflow_tasks
       WHERE instance_id = ? AND tenant_id = ? AND step_index > ? AND status = 'waiting'
       ORDER BY step_index LIMIT 1`,
      [record.workflow_instance_id, tenantId, task.step_index]
    ) as any;

    if (nextTask) {
      // 激活下一步任务
      dbRun(
        "UPDATE workflow_tasks SET status = 'pending' WHERE id = ?",
        [nextTask.id]
      );
      dbRun(
        "UPDATE workflow_instances SET current_step = ? WHERE id = ?",
        [nextTask.step_index, record.workflow_instance_id]
      );

      const nextAssignee = dbGet(
        "SELECT COALESCE(nickname, username) as name FROM users WHERE id = ?",
        [nextTask.assignee_id]
      ) as any;

      logActivity({
        userId,
        tenantId,
        action: `procurement_approved_step${task.step_index + 1}`,
        details: JSON.stringify({ procurement_id: procurementId, next_step: nextTask.step_index, next_approver: nextAssignee?.name }),
        targetType: "procurement",
        targetId: procurementId,
      });

      // 通知下一步审批人
      if (nextTask.assignee_id) {
        createNotification({
          userId: nextTask.assignee_id,
          type: "procurement_approval",
          title: "新的采购审批",
          content: `${approverName} 已审核通过「${record.name}」，现需您进行审批（¥${(record.estimated_cost || 0).toLocaleString()}）`,
          link: `/assets/procurement`,
          tenantId,
        });
      }

      // 通知申请人当前进度
      createNotification({
        userId: record.requested_by,
        type: "procurement_progress",
        title: "采购申请进度更新",
        content: `${approverName} 已审核通过，已转交 ${nextAssignee?.name || "下一步审批人"} 审批`,
        link: `/assets/procurement`,
        tenantId,
      });

      return res.json({
        success: true,
        message: `已通过，转交 ${nextAssignee?.name || "下一步审批人"}`,
        next_step: nextTask.step_index,
        next_approver: nextAssignee?.name,
      });
    }

    // 所有步骤通过：完成工作流 + 更新采购状态为 approved + 更新预算
    dbRun(
      "UPDATE workflow_instances SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
      [record.workflow_instance_id]
    );
    dbRun(
      `UPDATE asset_procurement_requests SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [userId, procurementId]
    );

    // 更新预算已使用量
    if (record.budget_id) {
      dbRun(
        "UPDATE budgets SET used_amount = used_amount + ?, updated_at = datetime('now') WHERE id = ?",
        [record.estimated_cost || 0, record.budget_id]
      );
    }

    logActivity({
      userId,
      tenantId,
      action: "procurement_approved",
      details: JSON.stringify({ procurement_id: procurementId, workflow_instance_id: record.workflow_instance_id }),
      targetType: "procurement",
      targetId: procurementId,
    });

    // 通知申请人：采购已批准
    createNotification({
      userId: record.requested_by,
      type: "procurement_approved",
      title: "采购申请已批准",
      content: `${approverName} 批准了您的采购申请「${record.name}」（¥${(record.estimated_cost || 0).toLocaleString()}），可联系管理员下单采购`,
      link: `/assets/procurement`,
      tenantId,
    });

    res.json({ success: true, message: "采购申请已批准", status: "approved" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 采购后续操作（下单/入库 — 仅管理员）
assetRoutes.put("/procurements/:id", (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    if (!["super_admin", "admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: "仅管理员可操作" });
    }

    const { status } = req.body;
    if (!status || !["ordered", "received"].includes(status)) {
      return res.status(400).json({ success: false, error: "status 仅支持 ordered / received" });
    }

    const record = dbGet(
      "SELECT * FROM asset_procurement_requests WHERE id = ? AND tenant_id = ?",
      [parseInt(req.params.id), req.user!.tenant_id]
    ) as any;
    if (!record) return res.status(404).json({ success: false, error: "采购申请不存在" });
    if (record.status !== "approved" && record.status !== "ordered") {
      return res.status(400).json({ success: false, error: "仅「已批准」状态可进行下单/入库操作" });
    }
    if (status === "received" && record.status !== "ordered") {
      return res.status(400).json({ success: false, error: "请先标记「已下单」再标记「已入库」" });
    }

    dbRun(
      `UPDATE asset_procurement_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, parseInt(req.params.id)]
    );

    logActivity({
      userId: req.user!.id,
      tenantId: req.user!.tenant_id,
      action: `procurement_${status}`,
      details: JSON.stringify({ procurement_id: parseInt(req.params.id), status }),
      targetType: "procurement",
      targetId: parseInt(req.params.id),
    });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// 删除采购申请
assetRoutes.delete("/procurements/:id", (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    if (!["super_admin", "admin"].includes(userRole)) {
      return res.status(403).json({ success: false, error: "仅管理员可删除" });
    }
    dbRun("DELETE FROM asset_procurement_requests WHERE id = ? AND tenant_id = ?", [parseInt(req.params.id), req.user!.tenant_id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ===== 报表导出 =====

assetRoutes.get("/export/csv", (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { category, status, search, department_id } = req.query as Record<string, string>;

    let where = "WHERE a.tenant_id = ? AND a.deleted_at IS NULL";
    const params: any[] = [tenantId];

    if (category) { where += " AND a.category = ?"; params.push(category); }
    if (status) { where += " AND a.status = ?"; params.push(status); }
    if (department_id) { where += " AND a.department_id = ?"; params.push(parseInt(department_id)); }
    if (search) { where += " AND (a.name LIKE ? OR a.asset_no LIKE ? OR a.manufacturer LIKE ? OR a.model LIKE ?)"; const s = `%${search}%`; params.push(s, s, s, s); }

    const rows = dbAll(
      `SELECT a.asset_no, a.name, a.category, a.status, a.manufacturer, a.model, a.sn,
              a.purchase_price, a.purchase_date, a.location_detail, a.owner_type,
              d.name as department_name, e.name as custodian_name
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       LEFT JOIN employees e ON a.custodian_id = e.id
       ${where} ORDER BY a.id DESC`,
      params
    ) as any[];

    // Build CSV with BOM for Excel UTF-8 compatibility
    const BOM = "\uFEFF";
    const headers = ["资产编号", "名称", "分类", "状态", "厂商", "型号", "序列号", "价值", "购置日期", "存放位置", "权属", "所属部门", "领用人"];
    const headerLine = headers.map(h => `"${h}"`).join(",");

    const CAT_MAP: Record<string, string> = { INSTRUMENT: "仪器仪表", VEHICLE: "车辆", OFFICE: "办公设备", TOOL: "工具" };
    const STATUS_MAP: Record<string, string> = { in_stock: "在库", in_use: "使用中", idle: "闲置", transferring: "调拨中", repairing: "维修中", scrapped: "已报废", lost: "已丢失" };
    const OWNER_MAP: Record<string, string> = { owned: "自有", leased: "租赁", borrowed: "借用" };

    const dataLines = rows.map((r: any) => [
      r.asset_no, r.name, CAT_MAP[r.category] || r.category, STATUS_MAP[r.status] || r.status,
      r.manufacturer, r.model, r.sn, r.purchase_price, r.purchase_date, r.location_detail, OWNER_MAP[r.owner_type] || r.owner_type,
      r.department_name, r.custodian_name,
    ].map(v => `"${v ?? ""}"`).join(","));

    const csv = BOM + [headerLine, ...dataLines].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="asset_export_${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== 资产详情（通配路由放最后） =====

assetRoutes.get("/:id", (req: AuthRequest, res) => {
  try {
    const row = dbGet(
      `SELECT a.*, d.name as department_name, e.name as custodian_name
       FROM assets a LEFT JOIN departments d ON a.department_id = d.id
       LEFT JOIN employees e ON a.custodian_id = e.id
       WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL`,
      [parseInt(req.params.id), req.user!.tenant_id]
    );
    if (!row) return res.status(404).json({ success: false, error: "资产不存在" });
    res.json({ success: true, data: row });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

export default assetRoutes;
