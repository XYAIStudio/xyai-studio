import { dbGet, dbAll, dbRun } from "../db";
import fs from "fs";
import path from "path";

// ===== 类型定义 =====
export interface Contract {
  id: number;
  tenant_id: number;
  title: string;
  contract_no: string;
  party_a: string;
  party_b: string;
  direction: "receivable" | "payable";
  our_side: "party_a" | "party_b";
  contract_type: string;
  amount: number;
  collected_paid: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  sign_date: string | null;
  key_terms: string | null;
  alert_days: number;
  workflow_instance_id: number | null;
  created_by: number | null;
  department_id: number | null;
  budget_id: number | null;
  file_path: string | null;
  file_type: string | null;
  parsed_text: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractPayment {
  id: number;
  tenant_id: number;
  contract_id: number;
  payment_no: number;
  label: string;
  amount: number;
  paid: number;
  paid_date: string | null;
  due_date: string | null;
  completion_condition: string | null;
  condition_met: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractAlertConfig {
  id: number;
  tenant_id: number;
  default_alert_days: number;
  enable_feishu: number;
  feishu_webhook: string | null;
}

// ===== 合同编号生成 =====
function generateContractNo(tenantId: number): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const count = dbGet(
    "SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND contract_no LIKE ?",
    [tenantId, `XY-${ym}-%`]
  ) as any;
  const seq = String((count?.c || 0) + 1).padStart(3, "0");
  return `XY-${ym}-${seq}`;
}

// ===== 合同 CRUD =====
export function getContracts(tenantId: number, filters?: {
  status?: string; direction?: string; contract_type?: string;
  department_id?: number; search?: string;
}): (Contract & { payment_count: number; pending_count: number; overdue_count: number; next_payment: string | null })[] {
  let sql = `SELECT c.*,
    (SELECT COUNT(*) FROM contract_payments WHERE contract_id = c.id) as payment_count,
    (SELECT COUNT(*) FROM contract_payments WHERE contract_id = c.id AND paid = 0) as pending_count,
    (SELECT COUNT(*) FROM contract_payments WHERE contract_id = c.id AND paid = 0 AND due_date < date('now')) as overdue_count,
    (SELECT label || ' ¥' || CAST(ROUND(amount/10000.0, 1) AS TEXT) || '万 ' || due_date
     FROM contract_payments
     WHERE contract_id = c.id AND paid = 0 AND due_date IS NOT NULL
     ORDER BY due_date ASC LIMIT 1) as next_payment
    FROM contracts c WHERE c.tenant_id = ?`;
  const params: any[] = [tenantId];

  if (filters?.status) { sql += " AND c.status = ?"; params.push(filters.status); }
  if (filters?.direction) { sql += " AND c.direction = ?"; params.push(filters.direction); }
  if (filters?.contract_type) { sql += " AND c.contract_type = ?"; params.push(filters.contract_type); }
  if (filters?.department_id) { sql += " AND c.department_id = ?"; params.push(filters.department_id); }
  if (filters?.search) {
    sql += " AND (c.title LIKE ? OR c.contract_no LIKE ? OR c.party_b LIKE ?)";
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }

  sql += " ORDER BY c.created_at DESC";
  return dbAll(sql, params) as any[];
}

export function getContract(id: number, tenantId: number): (Contract & { payments: ContractPayment[] }) | null {
  const contract = dbGet("SELECT * FROM contracts WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Contract | undefined;
  if (!contract) return null;
  const payments = dbAll(
    "SELECT * FROM contract_payments WHERE contract_id = ? ORDER BY payment_no ASC",
    [id]
  ) as ContractPayment[];
  return { ...contract, payments };
}

export function getContractStats(tenantId: number) {
  const total = (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [tenantId]) as any)?.c || 0;
  const pendingReview = (dbGet(
    "SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND status IN ('draft','review')", [tenantId]
  ) as any)?.c || 0;
  const receivable = dbGet(
    "SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(collected_paid),0) as done FROM contracts WHERE tenant_id = ? AND direction = 'receivable'",
    [tenantId]
  ) as any;
  const payable = dbGet(
    "SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(collected_paid),0) as done FROM contracts WHERE tenant_id = ? AND direction = 'payable'",
    [tenantId]
  ) as any;
  const expiringCount = (dbGet(
    `SELECT COUNT(DISTINCT p.contract_id) as c FROM contract_payments p
     JOIN contracts c ON p.contract_id = c.id
     WHERE p.tenant_id = ? AND p.paid = 0 AND p.due_date <= date('now', '+' || COALESCE(c.alert_days, 7) || ' days')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))`,
    [tenantId]
  ) as any)?.c || 0;

  // V4: 逾期统计
  const overdueCount = (dbGet(
    `SELECT COUNT(DISTINCT p.contract_id) as c FROM contract_payments p
     JOIN contracts c ON p.contract_id = c.id
     WHERE p.tenant_id = ? AND p.paid = 0 AND p.due_date < date('now')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))`,
    [tenantId]
  ) as any)?.c || 0;

  const overduePaymentCount = (dbGet(
    `SELECT COUNT(*) as c FROM contract_payments p
     WHERE p.tenant_id = ? AND p.paid = 0 AND p.due_date < date('now')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))`,
    [tenantId]
  ) as any)?.c || 0;

  return {
    total,
    pendingReview,
    receivable: { total: receivable.total || 0, done: receivable.done || 0 },
    payable: { total: payable.total || 0, done: payable.done || 0 },
    expiringCount,
    overdueCount,
    overduePaymentCount,
  };
}

export function createContract(data: Partial<Contract>): number {
  const contractNo = generateContractNo(data.tenant_id || 1);

  const cols = ["tenant_id", "contract_no"];
  const vals = [data.tenant_id || 1, contractNo];
  const fields: string[] = [
    "title", "party_a", "party_b", "direction", "our_side", "contract_type",
    "amount", "currency", "start_date", "end_date", "status",
    "key_terms", "alert_days", "created_by", "department_id", "budget_id",
    "file_path", "file_type", "parsed_text", "remarks",
  ];

  for (const f of fields) {
    if (data[f as keyof Contract] !== undefined) {
      cols.push(f);
      vals.push(data[f as keyof Contract] as string | number);
    }
  }

  const placeholders = cols.map(() => "?").join(", ");
  const result = dbRun(
    `INSERT INTO contracts (${cols.join(", ")}) VALUES (${placeholders})`,
    vals
  );
  return result.lastInsertRowid;
}

export function updateContract(id: number, tenantId: number, data: Partial<Contract>): void {
  const existing = dbGet("SELECT id FROM contracts WHERE id = ? AND tenant_id = ?", [id, tenantId]);
  if (!existing) throw new Error("合同不存在");

  const updates: string[] = [];
  const vals: any[] = [];
  const fields: string[] = [
    "title", "party_a", "party_b", "direction", "our_side", "contract_type",
    "amount", "currency", "start_date", "end_date", "status", "sign_date",
    "key_terms", "alert_days", "department_id", "budget_id", "remarks",
  ];

  for (const f of fields) {
    if (data[f as keyof Contract] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(data[f as keyof Contract] as string | number);
    }
  }

  if (updates.length === 0) return;
  updates.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(id, tenantId);

  dbRun(`UPDATE contracts SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, vals);
}

export function deleteContract(id: number, tenantId: number): void {
  dbRun("DELETE FROM contract_payments WHERE contract_id = ? AND tenant_id = ?", [id, tenantId]);
  dbRun("DELETE FROM contracts WHERE id = ? AND tenant_id = ?", [id, tenantId]);
}

// ===== 进度款 CRUD =====
export function getPayments(contractId: number, tenantId: number): ContractPayment[] {
  return dbAll(
    "SELECT * FROM contract_payments WHERE contract_id = ? AND tenant_id = ? ORDER BY payment_no ASC",
    [contractId, tenantId]
  ) as ContractPayment[];
}

export function addPayment(contractId: number, tenantId: number, data: Partial<ContractPayment>): number {
  const maxNo = (dbGet(
    "SELECT MAX(payment_no) as m FROM contract_payments WHERE contract_id = ?",
    [contractId]
  ) as any)?.m || 0;

  const result = dbRun(
    `INSERT INTO contract_payments (tenant_id, contract_id, payment_no, label, amount, due_date, completion_condition, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, contractId, maxNo + 1, data.label || "", data.amount || 0, data.due_date, data.completion_condition || null, data.remarks || null]
  );

  updateContractTotals(contractId);
  return result.lastInsertRowid;
}

export function updatePayment(paymentId: number, tenantId: number, data: Partial<ContractPayment>): void {
  const existing = dbGet("SELECT id, contract_id FROM contract_payments WHERE id = ? AND tenant_id = ?", [paymentId, tenantId]);
  if (!existing) throw new Error("付款节点不存在");

  const updates: string[] = [];
  const vals: any[] = [];
  const fields = ["label", "amount", "due_date", "completion_condition", "remarks", "payment_no"];

  for (const f of fields) {
    if (data[f as keyof ContractPayment] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(data[f as keyof ContractPayment]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(paymentId, tenantId);
    dbRun(`UPDATE contract_payments SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`, vals);
  }

  updateContractTotals((existing as any).contract_id);
}

export function deletePayment(paymentId: number, tenantId: number): void {
  const existing = dbGet("SELECT contract_id FROM contract_payments WHERE id = ? AND tenant_id = ?", [paymentId, tenantId]);
  if (!existing) throw new Error("付款节点不存在");

  dbRun("DELETE FROM contract_payments WHERE id = ? AND tenant_id = ?", [paymentId, tenantId]);
  updateContractTotals((existing as any).contract_id);
}

export function markPaymentPaid(paymentId: number, tenantId: number, paidDate: string): void {
  const existing = dbGet("SELECT * FROM contract_payments WHERE id = ? AND tenant_id = ?", [paymentId, tenantId]) as any;
  if (!existing) throw new Error("付款节点不存在");

  dbRun(
    "UPDATE contract_payments SET paid = 1, paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [paidDate, paymentId, tenantId]
  );
  updateContractTotals(existing.contract_id);
}

function updateContractTotals(contractId: number): void {
  const totals = dbGet(
    "SELECT COALESCE(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 0) as paid_total FROM contract_payments WHERE contract_id = ?",
    [contractId]
  ) as any;

  dbRun(
    "UPDATE contracts SET collected_paid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [totals.paid_total || 0, contractId]
  );
}

// ===== V4: 批量操作 =====
export interface BatchPaymentInput {
  label: string;
  amount: number;
  due_date?: string;
  completion_condition?: string;
}

export function batchAddPayments(contractId: number, tenantId: number, payments: BatchPaymentInput[]): number[] {
  const ids: number[] = [];
  for (const p of payments) {
    const id = addPayment(contractId, tenantId, {
      label: p.label,
      amount: p.amount || 0, // 单位：元（与 addPayment 保持一致）
      due_date: p.due_date || null,
      completion_condition: p.completion_condition || null,
    });
    ids.push(id);
  }
  return ids;
}

export function batchMarkPaid(contractId: number, tenantId: number, paymentIds: number[], paidDate?: string): number {
  const date = paidDate || new Date().toISOString().split("T")[0];
  let count = 0;
  for (const pid of paymentIds) {
    const existing = dbGet(
      "SELECT id FROM contract_payments WHERE id = ? AND tenant_id = ? AND contract_id = ?",
      [pid, tenantId, contractId]
    );
    if (existing) {
      markPaymentPaid(pid, tenantId, date);
      count++;
    }
  }
  return count;
}

// ===== 预警配置 =====
export function getAlertConfig(tenantId: number): ContractAlertConfig {
  let config = dbGet(
    "SELECT * FROM contract_alert_config WHERE tenant_id = ?", [tenantId]
  ) as ContractAlertConfig | undefined;

  if (!config) {
    dbRun(
      "INSERT INTO contract_alert_config (tenant_id, default_alert_days) VALUES (?, 7)",
      [tenantId]
    );
    config = dbGet(
      "SELECT * FROM contract_alert_config WHERE tenant_id = ?", [tenantId]
    ) as ContractAlertConfig;
  }

  return config;
}

export function updateAlertConfig(tenantId: number, data: Partial<ContractAlertConfig>): void {
  const existing = dbGet("SELECT id FROM contract_alert_config WHERE tenant_id = ?", [tenantId]);
  if (!existing) {
    // Ensure config exists
    getAlertConfig(tenantId);
  }

  const updates: string[] = [];
  const vals: any[] = [];
  const fields: (keyof ContractAlertConfig | string)[] = ["default_alert_days", "enable_feishu", "feishu_webhook",
    "level1_days", "level2_days", "level3_days", "level4_days", "enable_multi_level"];

  for (const f of fields) {
    if (data[f as keyof ContractAlertConfig] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(data[f as keyof ContractAlertConfig]);
    }
  }

  if (updates.length === 0) return;
  updates.push("updated_at = CURRENT_TIMESTAMP");
  vals.push(tenantId);

  dbRun(`UPDATE contract_alert_config SET ${updates.join(", ")} WHERE tenant_id = ?`, vals);
}

// ===== 预警检测（供 heartbeat 调用）=====
export interface UpcomingPayment {
  id: number;
  tenant_id: number;
  contract_id: number;
  contract_title: string;
  contract_no: string;
  direction: string;
  party_b: string;
  alert_days: number;
  created_by: number;
  label: string;
  amount: number;
  due_date: string;
  days_left: number;
  last_alerted_at: string | null;
  alert_count: number;
}

export function getUpcomingPayments(tenantId: number, days?: number): UpcomingPayment[] {
  const config = getAlertConfig(tenantId);
  const alertDays = days || config.default_alert_days;

  // V4: 包含逾期（days_left < 0）和即将到期的节点
  return dbAll(
    `SELECT p.id, p.tenant_id, p.contract_id, c.title as contract_title,
     c.contract_no, c.direction, c.party_b, COALESCE(c.alert_days, ?) as alert_days,
     c.created_by, p.label, p.amount, p.due_date,
     CAST(julianday(p.due_date) - julianday('now') AS INTEGER) as days_left,
     p.last_alerted_at, COALESCE(p.alert_count, 0) as alert_count
     FROM contract_payments p
     JOIN contracts c ON p.contract_id = c.id
     WHERE p.tenant_id = ? AND p.paid = 0
       AND p.due_date IS NOT NULL
       AND p.due_date <= date('now', '+' || COALESCE(c.alert_days, ?) || ' days')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))
     ORDER BY p.due_date ASC`,
    [alertDays, tenantId, alertDays]
  ) as UpcomingPayment[];
}

// V4: 获取逾期付款（已过期的）
export function getOverduePayments(tenantId: number): UpcomingPayment[] {
  return dbAll(
    `SELECT p.id, p.tenant_id, p.contract_id, c.title as contract_title,
     c.contract_no, c.direction, c.party_b, COALESCE(c.alert_days, 7) as alert_days,
     c.created_by, p.label, p.amount, p.due_date,
     CAST(julianday('now') - julianday(p.due_date) AS INTEGER) as days_left,
     p.last_alerted_at, COALESCE(p.alert_count, 0) as alert_count
     FROM contract_payments p
     JOIN contracts c ON p.contract_id = c.id
     WHERE p.tenant_id = ? AND p.paid = 0
       AND p.due_date IS NOT NULL
       AND p.due_date < date('now')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))
     ORDER BY p.due_date ASC`,
    [tenantId]
  ) as UpcomingPayment[];
}

// V4: 确认预警已处理
export function acknowledgeAlert(paymentId: number, tenantId: number): void {
  const existing = dbGet(
    "SELECT id FROM contract_payments WHERE id = ? AND tenant_id = ?",
    [paymentId, tenantId]
  );
  if (!existing) throw new Error("付款节点不存在");

  dbRun(
    "UPDATE contract_payments SET alert_dismissed_until = datetime('now', '+30 days'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [paymentId, tenantId]
  );
}

// V4: 忽略预警（临时推迟）
export function dismissAlert(paymentId: number, tenantId: number, dismissDays: number = 3): void {
  const existing = dbGet(
    "SELECT id FROM contract_payments WHERE id = ? AND tenant_id = ?",
    [paymentId, tenantId]
  );
  if (!existing) throw new Error("付款节点不存在");

  dbRun(
    "UPDATE contract_payments SET alert_dismissed_until = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
    [`+${dismissDays} days`, paymentId, tenantId]
  );
}

// V4: 记录预警发送
export function recordAlertSent(paymentId: number): void {
  dbRun(
    "UPDATE contract_payments SET last_alerted_at = CURRENT_TIMESTAMP, alert_count = COALESCE(alert_count, 0) + 1 WHERE id = ?",
    [paymentId]
  );
}

// ===== Phase 4: 多级预警 (30/15/7/3天) =====
export interface MultiLevelAlertConfig {
  id: number;
  tenant_id: number;
  default_alert_days: number;
  level1_days: number;
  level2_days: number;
  level3_days: number;
  level4_days: number;
  enable_multi_level: number;
  enable_feishu: number;
  feishu_webhook: string | null;
}

export interface AlertEscalation {
  id: number;
  payment_id: number;
  contract_id: number;
  alert_level: number;
  level_label: string;
  message: string | null;
  created_at: string;
}

export interface MultiLevelAlertItem {
  // payment info
  id: number;
  tenant_id: number;
  contract_id: number;
  contract_title: string;
  contract_no: string;
  direction: string;
  party_b: string;
  label: string;
  amount: number;
  due_date: string;
  days_left: number;
  alert_count: number;
  // alert level info
  alert_level: number;        // 1=30天, 2=15天, 3=7天, 4=3天/逾期
  level_label: string;        // "⚠️ 远期提醒" / "🔔 中期预警" / "⚠️ 近期警报" / "🔴 紧急逾期"
  last_escalated_at: string | null;
  escalation_count: number;
}

export interface MultiLevelAlertResult {
  level1: MultiLevelAlertItem[];  // 30天
  level2: MultiLevelAlertItem[];  // 15天
  level3: MultiLevelAlertItem[];  // 7天
  level4: MultiLevelAlertItem[];  // 3天 + 逾期
  summary: {
    total: number;
    critical: number;   // level4
    urgent: number;     // level3
    warning: number;    // level2
    info: number;       // level1
  };
}

export function getAlertLevelConfig(tenantId: number): MultiLevelAlertConfig {
  let config = dbGet(
    "SELECT * FROM contract_alert_config WHERE tenant_id = ?", [tenantId]
  ) as MultiLevelAlertConfig | undefined;

  if (!config) {
    dbRun(
      "INSERT INTO contract_alert_config (tenant_id, default_alert_days, level1_days, level2_days, level3_days, level4_days, enable_multi_level) VALUES (?, 7, 30, 15, 7, 3, 1)",
      [tenantId]
    );
    config = dbGet(
      "SELECT * FROM contract_alert_config WHERE tenant_id = ?", [tenantId]
    ) as MultiLevelAlertConfig;
  }

  return config!;
}

// 计算单个付款节点的预警级别
export function computeAlertLevel(daysLeft: number, config: MultiLevelAlertConfig): { level: number; label: string } {
  const absDays = Math.abs(daysLeft);
  if (daysLeft < 0) {
    // 已逾期 → Level 4
    if (absDays <= 3) return { level: 4, label: "🔴 紧急逾期" };
    if (absDays <= 7) return { level: 4, label: "🔴 严重逾期" };
    return { level: 4, label: "🔴 长期逾期" };
  }
  // 即将到期
  if (daysLeft <= config.level4_days) return { level: 4, label: "🔴 紧急到期" };
  if (daysLeft <= config.level3_days) return { level: 3, label: "⚠️ 近期警报" };
  if (daysLeft <= config.level2_days) return { level: 2, label: "🔔 中期预警" };
  if (daysLeft <= config.level1_days) return { level: 1, label: "⚠️ 远期提醒" };
  return { level: 0, label: "正常" };
}

// 获取多级预警列表
export function getMultiLevelAlerts(tenantId: number): MultiLevelAlertResult {
  const config = getAlertLevelConfig(tenantId);

  // 查询所有未支付的付款节点（即将到期或已逾期）
  const allPayments = dbAll(
    `SELECT p.id, p.tenant_id, p.contract_id, c.title as contract_title,
     c.contract_no, c.direction, c.party_b, p.label, p.amount, p.due_date,
     CAST(julianday(p.due_date) - julianday('now') AS INTEGER) as days_left,
     COALESCE(p.alert_count, 0) as alert_count
     FROM contract_payments p
     JOIN contracts c ON p.contract_id = c.id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.paid = 0
       AND p.due_date IS NOT NULL
       AND p.due_date <= date('now', '+' || ? || ' days')
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))
     ORDER BY p.due_date ASC`,
    [tenantId, config.level1_days]
  ) as any[];

  const result: MultiLevelAlertResult = {
    level1: [], level2: [], level3: [], level4: [],
    summary: { total: 0, critical: 0, urgent: 0, warning: 0, info: 0 },
  };

  for (const p of allPayments) {
    const { level, label } = computeAlertLevel(p.days_left, config);

    // 获取最新升级记录
    const lastEscalation = dbGet(
      "SELECT created_at FROM contract_alert_escalations WHERE payment_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1",
      [p.id, tenantId]
    ) as any;

    const escalationCount = (dbGet(
      "SELECT COUNT(*) as cnt FROM contract_alert_escalations WHERE payment_id = ? AND tenant_id = ?",
      [p.id, tenantId]
    ) as any)?.cnt || 0;

    const item: MultiLevelAlertItem = {
      ...p,
      alert_level: level,
      level_label: label,
      last_escalated_at: lastEscalation?.created_at || null,
      escalation_count: escalationCount,
    };

    if (level === 4) { result.level4.push(item); result.summary.critical++; }
    else if (level === 3) { result.level3.push(item); result.summary.urgent++; }
    else if (level === 2) { result.level2.push(item); result.summary.warning++; }
    else { result.level1.push(item); result.summary.info++; }
    result.summary.total++;
  }

  return result;
}

// 获取升级历史
export function getEscalationHistory(paymentId: number, tenantId: number): AlertEscalation[] {
  return dbAll(
    "SELECT * FROM contract_alert_escalations WHERE payment_id = ? AND tenant_id = ? ORDER BY created_at DESC",
    [paymentId, tenantId]
  ) as AlertEscalation[];
}

// 记录预警升级事件
export function recordEscalation(paymentId: number, contractId: number, tenantId: number, alertLevel: number, levelLabel: string, message?: string): number {
  const result = dbRun(
    `INSERT INTO contract_alert_escalations (tenant_id, payment_id, contract_id, alert_level, level_label, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, paymentId, contractId, alertLevel, levelLabel, message || null]
  );
  return result.lastInsertRowid as number;
}

// 批量检测并自动升级（heartbeat 调用）
export function detectAndEscalateAlerts(tenantId: number): { escalated: number; summary: MultiLevelAlertResult['summary'] } {
  const result = getMultiLevelAlerts(tenantId);
  let escalated = 0;

  const processLevel = (items: MultiLevelAlertItem[]) => {
    for (const item of items) {
      // 检查是否需要升级（alert_count 小于当前 level，或从未升级过）
      const lastEsc = dbGet(
        "SELECT alert_level FROM contract_alert_escalations WHERE payment_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1",
        [item.id, tenantId]
      ) as any;

      const lastLevel = lastEsc?.alert_level || 0;
      if (item.alert_level > lastLevel) {
        // 需要升级
        recordEscalation(item.id, item.contract_id, tenantId, item.alert_level, item.level_label,
          `合同[${item.contract_no}] ${item.label} ${item.days_left < 0 ? `逾期${Math.abs(item.days_left)}天` : `${item.days_left}天后到期`}`);
        recordAlertSent(item.id);
        escalated++;
      }
    }
  };

  processLevel(result.level4);
  processLevel(result.level3);
  processLevel(result.level2);
  processLevel(result.level1);

  return { escalated, summary: result.summary };
}

// ===== 合同条款节点 CRUD (Phase 1) =====
export interface ContractClause {
  id?: number;
  contract_id: number;
  tenant_id: number;
  clause_type: string;
  clause_title: string;
  clause_content: string;
  sort_order: number;
  is_critical: number;
  ai_confidence: number;
}

export function getClauses(contractId: number, tenantId: number): ContractClause[] {
  return dbAll(
    "SELECT * FROM contract_clauses WHERE contract_id = ? AND tenant_id = ? ORDER BY sort_order",
    [contractId, tenantId]
  ) as ContractClause[];
}

export function addClause(contractId: number, tenantId: number, clause: Partial<ContractClause>): number {
  const result = dbRun(
    `INSERT INTO contract_clauses (contract_id, tenant_id, clause_type, clause_title, clause_content, sort_order, is_critical, ai_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, tenantId,
      clause.clause_type || "other",
      clause.clause_title || "",
      clause.clause_content || "",
      clause.sort_order || 0,
      clause.is_critical || 0,
      clause.ai_confidence || 0]
  );
  return result.lastInsertRowid as number;
}

export function batchAddClauses(contractId: number, tenantId: number, clauses: Partial<ContractClause>[]): number {
  let count = 0;
  for (const c of clauses) {
    addClause(contractId, tenantId, c);
    count++;
  }
  return count;
}

export function updateClause(clauseId: number, tenantId: number, updates: Partial<ContractClause>): void {
  const existing = dbGet("SELECT id FROM contract_clauses WHERE id = ? AND tenant_id = ?", [clauseId, tenantId]);
  if (!existing) throw new Error("条款节点不存在");
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && k !== "id" && k !== "contract_id" && k !== "tenant_id") {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length > 0) {
    values.push(clauseId, tenantId);
    dbRun(`UPDATE contract_clauses SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, values);
  }
}

export function deleteClause(clauseId: number, tenantId: number): void {
  dbRun("DELETE FROM contract_clauses WHERE id = ? AND tenant_id = ?", [clauseId, tenantId]);
}

export function deleteAllClauses(contractId: number, tenantId: number): void {
  dbRun("DELETE FROM contract_clauses WHERE contract_id = ? AND tenant_id = ?", [contractId, tenantId]);
}

// ===== 进度验收 CRUD + 审核 + 财务联动 (Phase 2) =====
export interface ContractProgress {
  id?: number;
  contract_id: number;
  tenant_id: number;
  stage_name: string;
  planned_date?: string | null;
  actual_date?: string | null;
  acceptance_criteria?: string | null;
  attachments?: string;
  submitter_id?: number | null;
  submitted_at?: string | null;
  reviewer_id?: number | null;
  reviewed_at?: string | null;
  review_status?: string;
  review_comment?: string | null;
  completion_ratio?: number;
  linked_payment_ids?: string;
  sort_order?: number;
}

export function getProgressList(contractId: number, tenantId: number): ContractProgress[] {
  return dbAll(
    "SELECT * FROM contract_progress WHERE contract_id = ? AND tenant_id = ? ORDER BY sort_order",
    [contractId, tenantId]
  ) as ContractProgress[];
}

export function getPendingReviews(tenantId: number): ContractProgress[] {
  return dbAll(
    `SELECT p.*, c.title as contract_title, c.contract_no, c.direction, c.party_b
     FROM contract_progress p
     JOIN contracts c ON c.id = p.contract_id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.review_status = 'pending' AND p.submitted_at IS NOT NULL
     ORDER BY p.submitted_at DESC`,
    [tenantId]
  ) as any[];
}

export function addProgress(contractId: number, tenantId: number, data: Partial<ContractProgress>): number {
  const result = dbRun(
    `INSERT INTO contract_progress (contract_id, tenant_id, stage_name, planned_date, acceptance_criteria, attachments,
       completion_ratio, linked_payment_ids, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, tenantId,
      data.stage_name || "",
      data.planned_date || null,
      data.acceptance_criteria || null,
      data.attachments || "[]",
      data.completion_ratio || 0,
      data.linked_payment_ids || "[]",
      data.sort_order || 0]
  );
  return result.lastInsertRowid as number;
}

export function submitProgress(progressId: number, tenantId: number, submitterId: number, data: Partial<ContractProgress>): void {
  const exist = dbGet("SELECT id FROM contract_progress WHERE id = ? AND tenant_id = ?", [progressId, tenantId]);
  if (!exist) throw new Error("进度节点不存在");
  dbRun(
    `UPDATE contract_progress SET attachments = ?, completion_ratio = ?, submitter_id = ?, submitted_at = CURRENT_TIMESTAMP,
       review_status = 'pending', actual_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [data.attachments || "[]", data.completion_ratio || 0, submitterId, data.actual_date || null, progressId, tenantId]
  );
}

export function reviewProgress(progressId: number, tenantId: number, reviewerId: number, approved: boolean, comment?: string): void {
  const exist = dbGet("SELECT id, contract_id, linked_payment_ids FROM contract_progress WHERE id = ? AND tenant_id = ?", [progressId, tenantId]) as any;
  if (!exist) throw new Error("进度节点不存在");

  const newStatus = approved ? "approved" : "rejected";
  dbRun(
    `UPDATE contract_progress SET review_status = ?, reviewer_id = ?, reviewed_at = CURRENT_TIMESTAMP,
       review_comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
    [newStatus, reviewerId, comment || null, progressId, tenantId]
  );

  // 验收通过 → 自动触发关联付款节点（财务联动）
  if (approved && exist.linked_payment_ids) {
    try {
      const paymentIds: number[] = JSON.parse(exist.linked_payment_ids);
      for (const pid of paymentIds) {
        // 将关联付款节点标记为条件已满足
        dbRun(
          "UPDATE contract_payments SET condition_met = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND contract_id = ? AND tenant_id = ? AND paid = 0",
          [pid, exist.contract_id, tenantId]
        );
      }
    } catch (parseErr) {
      // linked_payment_ids 解析失败不影响主流程
    }
  }
}

export function updateProgress(progressId: number, tenantId: number, data: Partial<ContractProgress>): void {
  const exist = dbGet("SELECT id FROM contract_progress WHERE id = ? AND tenant_id = ?", [progressId, tenantId]);
  if (!exist) throw new Error("进度节点不存在");
  const fields: string[] = [];
  const values: any[] = [];
  const allowedFields = ["stage_name", "planned_date", "acceptance_criteria", "completion_ratio", "linked_payment_ids", "sort_order"];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && allowedFields.includes(k)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length > 0) {
    values.push(progressId, tenantId);
    dbRun(`UPDATE contract_progress SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, values);
  }
}

export function deleteProgress(progressId: number, tenantId: number): void {
  dbRun("DELETE FROM contract_progress WHERE id = ? AND tenant_id = ?", [progressId, tenantId]);
}

// ===== 审批权限引擎 (Phase 3) =====
export interface ContractApprovalRule {
  id?: number;
  tenant_id: number;
  rule_name: string;
  min_amount: number | null;
  max_amount: number | null;
  contract_type: string | null;
  direction: string | null;
  approval_chain_json: string;
  is_active: number;
}

export interface ContractApprovalRecord {
  id?: number;
  tenant_id: number;
  contract_id: number;
  step_order: number;
  approver_id: number | null;
  approver_position_level_id: number | null;
  status: string;
  comment: string | null;
  approved_at: string | null;
}

// 审批规则 CRUD
export function getApprovalRules(tenantId: number): ContractApprovalRule[] {
  return dbAll(
    "SELECT * FROM contract_approval_rules WHERE tenant_id = ? ORDER BY id",
    [tenantId]
  ) as ContractApprovalRule[];
}

export function addApprovalRule(tenantId: number, data: Partial<ContractApprovalRule>): number {
  const result = dbRun(
    `INSERT INTO contract_approval_rules (tenant_id, rule_name, min_amount, max_amount, contract_type, direction, approval_chain_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId,
      data.rule_name || "",
      data.min_amount ?? null,
      data.max_amount ?? null,
      data.contract_type || null,
      data.direction || null,
      data.approval_chain_json || "[]",
      data.is_active ?? 1]
  );
  return result.lastInsertRowid as number;
}

export function batchAddApprovalRules(tenantId: number, rules: Partial<ContractApprovalRule>[]): number {
  let count = 0;
  for (const r of rules) {
    addApprovalRule(tenantId, r);
    count++;
  }
  return count;
}

export function updateApprovalRule(ruleId: number, tenantId: number, data: Partial<ContractApprovalRule>): void {
  const exist = dbGet("SELECT id FROM contract_approval_rules WHERE id = ? AND tenant_id = ?", [ruleId, tenantId]);
  if (!exist) throw new Error("审批规则不存在");
  const fields: string[] = [];
  const values: any[] = [];
  const allowed = ["rule_name", "min_amount", "max_amount", "contract_type", "direction", "approval_chain_json", "is_active"];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && allowed.includes(k)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length > 0) {
    values.push(ruleId, tenantId);
    dbRun(`UPDATE contract_approval_rules SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`, values);
  }
}

export function deleteApprovalRule(ruleId: number, tenantId: number): void {
  dbRun("DELETE FROM contract_approval_rules WHERE id = ? AND tenant_id = ?", [ruleId, tenantId]);
}

// 匹配审批规则：按金额+类型+方向找到最匹配的规则
export function matchApprovalRule(tenantId: number, amount: number, contractType?: string, direction?: string): ContractApprovalRule | null {
  const rules = dbAll(
    `SELECT * FROM contract_approval_rules WHERE tenant_id = ? AND is_active = 1
     AND (min_amount IS NULL OR ? >= min_amount)
     AND (max_amount IS NULL OR ? <= max_amount)
     ORDER BY COALESCE(max_amount, 999999999) ASC LIMIT 1`,
    [tenantId, amount, amount]
  ) as ContractApprovalRule[];

  if (rules.length === 0) return null;

  // 进一步按类型和方向筛选
  let best: ContractApprovalRule | null = null;
  for (const r of rules) {
    if (r.contract_type && contractType && r.contract_type !== contractType) continue;
    if (r.direction && direction && r.direction !== direction) continue;
    best = r;
    break;
  }
  return best || rules[0];
}

// 审批记录管理
export function getApprovalRecords(contractId: number, tenantId: number): ContractApprovalRecord[] {
  return dbAll(
    `SELECT r.*, e.name as approver_name, pl.name as position_level_name
     FROM contract_approval_records r
     LEFT JOIN employees e ON e.id = r.approver_id
     LEFT JOIN position_levels pl ON pl.id = r.approver_position_level_id
     WHERE r.contract_id = ? AND r.tenant_id = ?
     ORDER BY r.step_order`,
    [contractId, tenantId]
  ) as any[];
}

export function getPendingApprovals(tenantId: number, approverId: number): any[] {
  return dbAll(
    `SELECT r.*, c.title as contract_title, c.contract_no, c.amount, c.direction, c.contract_type,
            pl.name as position_level_name
     FROM contract_approval_records r
     JOIN contracts c ON c.id = r.contract_id AND c.tenant_id = r.tenant_id
     LEFT JOIN position_levels pl ON pl.id = r.approver_position_level_id
     WHERE r.tenant_id = ? AND r.approver_id = ? AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [tenantId, approverId]
  ) as any[];
}

// 提交合同进入审批流程
export function submitContractForApproval(contractId: number, tenantId: number): ContractApprovalRecord[] {
  const contract = dbGet(
    "SELECT * FROM contracts WHERE id = ? AND tenant_id = ?",
    [contractId, tenantId]
  ) as any;
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "draft" && contract.status !== "review") {
    throw new Error(`合同当前状态(${contract.status})不可提交审批`);
  }

  // 查找匹配的审批规则
  const rule = matchApprovalRule(tenantId, contract.amount || 0, contract.contract_type, contract.direction);
  if (!rule) throw new Error("未找到匹配的审批规则，请先配置审批规则");

  // 清除旧的审批记录
  dbRun("DELETE FROM contract_approval_records WHERE contract_id = ? AND tenant_id = ?", [contractId, tenantId]);

  // 解析审批链
  let chain: { position_level_id: number; description?: string }[];
  try {
    chain = JSON.parse(rule.approval_chain_json);
  } catch {
    throw new Error("审批规则中的审批链配置无效");
  }

  if (!chain || chain.length === 0) throw new Error("审批规则中未配置审批链");

  // 更新合同状态为审批中
  dbRun("UPDATE contracts SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?", [contractId, tenantId]);

  // 生成审批记录：为每一步找到对应职级的员工
  const records: ContractApprovalRecord[] = [];
  chain.forEach((step, index) => {
    // 查找该职级下第一个在职员工
    const approver = dbGet(
      `SELECT e.id, e.name FROM employees e
       JOIN position_levels pl ON pl.id = e.position_level_id
       WHERE pl.id = ? AND e.tenant_id = ? AND e.status = 'active'
       ORDER BY e.id LIMIT 1`,
      [step.position_level_id, tenantId]
    ) as any;

    const result = dbRun(
      `INSERT INTO contract_approval_records (tenant_id, contract_id, step_order, approver_id, approver_position_level_id, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [tenantId, contractId, index, approver?.id || null, step.position_level_id]
    );

    records.push({
      id: result.lastInsertRowid as number,
      tenant_id: tenantId,
      contract_id: contractId,
      step_order: index,
      approver_id: approver?.id || null,
      approver_position_level_id: step.position_level_id,
      status: "pending",
      comment: null,
      approved_at: null,
    } as ContractApprovalRecord);
  });

  return records;
}

// 审批（通过/驳回）某一步
export function approveStep(recordId: number, tenantId: number, approverId: number, approved: boolean, comment?: string): { nextStatus: string; allDone: boolean } {
  const record = dbGet(
    "SELECT * FROM contract_approval_records WHERE id = ? AND tenant_id = ?",
    [recordId, tenantId]
  ) as any;
  if (!record) throw new Error("审批记录不存在");
  if (record.status !== "pending") throw new Error("该步骤已审批过");

  const newStatus = approved ? "approved" : "rejected";
  dbRun(
    `UPDATE contract_approval_records SET status = ?, comment = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
    [newStatus, comment || null, recordId, tenantId]
  );

  if (!approved) {
    // 驳回：合同退回草稿
    dbRun("UPDATE contracts SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
      [record.contract_id, tenantId]);
    return { nextStatus: "draft", allDone: false };
  }

  // 检查是否所有步骤都已通过
  const remaining = dbGet(
    "SELECT COUNT(*) as cnt FROM contract_approval_records WHERE contract_id = ? AND tenant_id = ? AND status != 'approved'",
    [record.contract_id, tenantId]
  ) as any;

  if (remaining.cnt === 0) {
    // 全部通过：合同状态改为已审批
    dbRun("UPDATE contracts SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
      [record.contract_id, tenantId]);
    return { nextStatus: "approved", allDone: true };
  }

  return { nextStatus: "review", allDone: false };
}

// 删除合同审批记录（用于重新提交）
export function deleteApprovalRecords(contractId: number, tenantId: number): void {
  dbRun("DELETE FROM contract_approval_records WHERE contract_id = ? AND tenant_id = ?", [contractId, tenantId]);
}

// ===== 统计导出 =====
export interface PaymentStats {
  receivable: { total: number; done: number; pending: number; count: number; overdue: number };
  payable: { total: number; done: number; pending: number; count: number; overdue: number };
}

export function getPaymentStats(tenantId: number, dateRange: { start: string; end: string }): PaymentStats {
  const stats = (direction: string) => {
    const data = dbGet(
      `SELECT
        COALESCE(SUM(p.amount), 0) as total,
        COALESCE(SUM(CASE WHEN p.paid = 1 THEN p.amount ELSE 0 END), 0) as done,
        COALESCE(SUM(CASE WHEN p.paid = 0 THEN p.amount ELSE 0 END), 0) as pending,
        COUNT(p.id) as count,
        COALESCE(SUM(CASE WHEN p.paid = 0 AND p.due_date < date('now') THEN 1 ELSE 0 END), 0) as overdue
       FROM contract_payments p
       JOIN contracts c ON p.contract_id = c.id
       WHERE p.tenant_id = ? AND c.direction = ?
         AND p.due_date >= ? AND p.due_date <= ?`,
      [tenantId, direction, dateRange.start, dateRange.end]
    ) as any;
    return { total: data.total || 0, done: data.done || 0, pending: data.pending || 0, count: data.count || 0, overdue: data.overdue || 0 };
  };

  return { receivable: stats("receivable"), payable: stats("payable") };
}

export function getPaymentDetails(tenantId: number, dateRange: { start: string; end: string }, direction?: string) {
  let sql = `SELECT p.*, c.title as contract_title, c.contract_no, c.direction, c.party_b
    FROM contract_payments p
    JOIN contracts c ON p.contract_id = c.id
    WHERE p.tenant_id = ? AND p.due_date >= ? AND p.due_date <= ?`;
  const params: any[] = [tenantId, dateRange.start, dateRange.end];

  if (direction) { sql += " AND c.direction = ?"; params.push(direction); }

  sql += " ORDER BY p.due_date ASC";
  return dbAll(sql, params) as any[];
}

// ===== V4: 合同归档到知识库 =====
export interface ArchiveToKnowledgeResult {
  knowledgeFileId: number;
  knowledgeNoteId: number;
  folderCreated: boolean;
}

export function archiveContractToKnowledge(
  contractId: number,
  tenantId: number,
  filePath?: string,
  fileType?: string,
  extractedText?: string,
): ArchiveToKnowledgeResult | null {
  const contract = dbGet("SELECT * FROM contracts WHERE id = ? AND tenant_id = ?", [contractId, tenantId]) as Contract | undefined;
  if (!contract) throw new Error("合同不存在");

  // 1. 确保 /合同 文件夹存在
  const contractFolder = "/合同";
  const existingFolder = dbGet(
    "SELECT id FROM knowledge_folders WHERE tenant_id = ? AND parent_folder = '/' AND name = '合同'",
    [tenantId]
  );
  let folderCreated = false;
  if (!existingFolder) {
    dbRun(
      "INSERT INTO knowledge_folders (tenant_id, name, parent_folder) VALUES (?, '合同', '/')",
      [tenantId]
    );
    folderCreated = true;
  }

  // 2. 保存文件到知识库（如果有文件路径）
  let knowledgeFileId = 0;
  if (filePath && fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const ext = fileType || path.extname(filePath).toLowerCase();
      const fileSizeKB = Math.round(stats.size / 1024);

      // 检查是否已归档过
      const existingFile = dbGet(
        "SELECT id FROM knowledge_files WHERE source_contract_id = ? AND tenant_id = ?",
        [contractId, tenantId]
      );

      if (!existingFile) {
        const extractedSummary = extractedText
          ? extractedText.replace(/\n/g, " ").slice(0, 300)
          : `合同文档 · ${contract.contract_no} · ${contract.title}`;

        const keywords = [
          "合同", contract.contract_type || "", contract.direction || "",
          contract.party_a || "", contract.party_b || "",
        ].filter(Boolean).join(",");

        const result = dbRun(
          `INSERT INTO knowledge_files
           (tenant_id, name, original_name, file_path, file_size, file_type,
            folder, status, content_extracted, extracted_summary, keywords,
            source_contract_id, source_contract_no, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'parsed', ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            fileName,
            contract.title || fileName,
            filePath,
            fileSizeKB,
            ext,
            contractFolder,
            extractedText ? extractedText.slice(0, 10000) : "",
            extractedSummary,
            keywords,
            contractId,
            contract.contract_no,
            contract.created_by,
          ]
        );
        knowledgeFileId = result.lastInsertRowid;
      } else {
        knowledgeFileId = (existingFile as any).id;
      }
    } catch (e) {
      console.error("[合同归档] 文件保存失败:", e);
    }
  }

  // 3. 创建知识笔记（合同摘要）
  let knowledgeNoteId = 0;
  const existingNote = dbGet(
    "SELECT id FROM knowledge_notes WHERE source = ? AND tenant_id = ?",
    [`合同:${contractId}`, tenantId]
  );

  if (!existingNote) {
    const noteContent = [
      `## ${contract.title}`,
      ``,
      `- **合同编号**: ${contract.contract_no}`,
      `- **甲方**: ${contract.party_a}`,
      `- **乙方**: ${contract.party_b}`,
      `- **方向**: ${contract.direction === "receivable" ? "收款" : "付款"}`,
      `- **身份**: ${contract.our_side === "party_a" ? "甲方" : "乙方"}`,
      `- **类型**: ${contract.contract_type}`,
      `- **金额**: ¥${(contract.amount / 10000).toFixed(2)}万元`,
      `- **起始日期**: ${contract.start_date || "未指定"}`,
      `- **截止日期**: ${contract.end_date || "未指定"}`,
      `- **状态**: ${contract.status}`,
      ``,
      contract.key_terms ? `**关键条款**: ${contract.key_terms}` : "",
      contract.remarks ? `**备注**: ${contract.remarks}` : "",
    ].filter(Boolean).join("\n");

    const result = dbRun(
      `INSERT INTO knowledge_notes (title, content, source, tags, tenant_id, company_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `[合同] ${contract.title}`,
        noteContent,
        `合同:${contractId}`,
        `合同,${contract.contract_type},${contract.direction}`,
        tenantId,
        1,
      ]
    );
    knowledgeNoteId = result.lastInsertRowid;
  } else {
    knowledgeNoteId = (existingNote as any).id;
  }

  // 4. 更新合同的 parsed_text 字段
  if (extractedText && !contract.parsed_text) {
    dbRun("UPDATE contracts SET parsed_text = ? WHERE id = ? AND tenant_id = ?",
      [extractedText.slice(0, 5000), contractId, tenantId]);
  }

  return { knowledgeFileId, knowledgeNoteId, folderCreated };
}

// ===== Phase 5: 甘特图 + 仪表盘 =====
export interface GanttContract {
  contract_id: number; contract_no: string; title: string;
  direction: string; party_b: string; amount: number; status: string;
  start_date: string | null; end_date: string | null;
  payments: { id: number; label: string; amount: number; due_date: string | null; paid: number }[];
  progress_nodes: { id: number; stage_name: string; planned_date: string | null; actual_date: string | null; review_status: string }[];
}

export function getGanttData(tenantId: number, filters?: { direction?: string; status?: string }): GanttContract[] {
  let contractSql = `SELECT c.id as contract_id, c.contract_no, c.title, c.direction, c.party_b, c.amount, c.status,
    c.start_date, c.end_date FROM contracts c WHERE c.tenant_id = ?`;
  const params: any[] = [tenantId];

  if (filters?.direction) { contractSql += " AND c.direction = ?"; params.push(filters.direction); }
  if (filters?.status) { contractSql += " AND c.status = ?"; params.push(filters.status); }
  contractSql += " ORDER BY c.start_date ASC NULLS LAST, c.created_at DESC LIMIT 50";

  const contracts = dbAll(contractSql, params) as any[];

  return contracts.map((c: any) => {
    const payments = dbAll(
      "SELECT id, label, amount, due_date, paid FROM contract_payments WHERE contract_id = ? AND tenant_id = ? ORDER BY due_date ASC",
      [c.contract_id, tenantId]
    ) as any[];

    const progress_nodes = dbAll(
      "SELECT id, stage_name, planned_date, actual_date, review_status FROM contract_progress WHERE contract_id = ? AND tenant_id = ? ORDER BY sort_order",
      [c.contract_id, tenantId]
    ) as any[];

    return { ...c, payments, progress_nodes };
  });
}

export interface DashboardData {
  overview: { total: number; active: number; expired: number; signed: number; newThisMonth: number };
  financial: { totalReceivable: number; collected: number; totalPayable: number; paid: number };
  typeDistribution: { contract_type: string; count: number; amount: number }[];
  amountTrend: { month: string; receivable: number; payable: number }[];
  alertSummary: { critical: number; urgent: number; warning: number; info: number };
  upcomingTop5: { id: number; title: string; contract_no: string; direction: string; days_left: number; due_date: string }[];
}

export function getDashboardData(tenantId: number): DashboardData {
  // 1. 概览统计
  const overview = {
    total: (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ?", [tenantId]) as any)?.c || 0,
    active: (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND status IN ('active','signed','approved')", [tenantId]) as any)?.c || 0,
    expired: (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND status = 'expired'", [tenantId]) as any)?.c || 0,
    signed: (dbGet("SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND status = 'signed'", [tenantId]) as any)?.c || 0,
    newThisMonth: (dbGet(
      "SELECT COUNT(*) as c FROM contracts WHERE tenant_id = ? AND created_at >= date('now','start of month')",
      [tenantId]
    ) as any)?.c || 0,
  };

  // 2. 财务汇总
  const financial = {
    totalReceivable: (dbGet("SELECT COALESCE(SUM(amount),0) as t FROM contracts WHERE tenant_id = ? AND direction = 'receivable'", [tenantId]) as any)?.t || 0,
    collected: (dbGet("SELECT COALESCE(SUM(collected_paid),0) as t FROM contracts WHERE tenant_id = ? AND direction = 'receivable'", [tenantId]) as any)?.t || 0,
    totalPayable: (dbGet("SELECT COALESCE(SUM(amount),0) as t FROM contracts WHERE tenant_id = ? AND direction = 'payable'", [tenantId]) as any)?.t || 0,
    paid: (dbGet("SELECT COALESCE(SUM(collected_paid),0) as t FROM contracts WHERE tenant_id = ? AND direction = 'payable'", [tenantId]) as any)?.t || 0,
  };

  // 3. 合同类型分布
  const typeDistribution = dbAll(
    `SELECT contract_type, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
     FROM contracts WHERE tenant_id = ? GROUP BY contract_type ORDER BY count DESC`,
    [tenantId]
  ) as any[];

  // 4. 近6个月金额趋势
  const amountTrend: { month: string; receivable: number; payable: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = `date('now','start of month','-${i} months')`;
    const monthEnd = `date('now','start of month','-${i} months','+1 month','-1 day')`;
    const receivable = (dbGet(
      `SELECT COALESCE(SUM(p.amount),0) as t FROM contract_payments p
       JOIN contracts c ON c.id = p.contract_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND c.direction = 'receivable'
       AND p.due_date >= ${monthStart} AND p.due_date <= ${monthEnd}`,
      [tenantId]
    ) as any)?.t || 0;
    const payable = (dbGet(
      `SELECT COALESCE(SUM(p.amount),0) as t FROM contract_payments p
       JOIN contracts c ON c.id = p.contract_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? AND c.direction = 'payable'
       AND p.due_date >= ${monthStart} AND p.due_date <= ${monthEnd}`,
      [tenantId]
    ) as any)?.t || 0;

    const d = new Date();
    d.setMonth(d.getMonth() - i);
    amountTrend.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      receivable: Number(receivable),
      payable: Number(payable),
    });
  }

  // 5. 预警概览（复用多级预警）
  const alertResult = getMultiLevelAlerts(tenantId);
  const alertSummary = alertResult.summary;

  // 6. Top5 即将到期付款
  const upcomingTop5 = dbAll(
    `SELECT p.id, c.title, c.contract_no, c.direction,
     CAST(julianday(p.due_date) - julianday('now') AS INTEGER) as days_left, p.due_date
     FROM contract_payments p
     JOIN contracts c ON c.id = p.contract_id AND c.tenant_id = p.tenant_id
     WHERE p.tenant_id = ? AND p.paid = 0 AND p.due_date IS NOT NULL
       AND (p.alert_dismissed_until IS NULL OR p.alert_dismissed_until <= datetime('now'))
     ORDER BY p.due_date ASC LIMIT 5`,
    [tenantId]
  ) as any[];

  return { overview, financial, typeDistribution, amountTrend, alertSummary, upcomingTop5 };
}
