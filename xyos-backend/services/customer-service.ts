/**
 * XYOS 客服收费系统
 *
 * 模块：
 * 1. CustomerManager — 客户信息管理（独立于 tenants）
 * 2. ServiceTicket — 服务工单（创建→处理→关闭）
 * 3. BillingEngine — 收费/计费引擎
 */

import { dbGet, dbAll, dbRun } from "../db";

// ============================================================
// 1. 客户管理
// ============================================================

export interface Customer {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  industry: string;
  level: "vip" | "premium" | "standard";
  status: "active" | "inactive";
  balance: number; // 账户余额（分）
  credit_limit: number;
  tenant_id: number;
  created_at: string;
}

export function createCustomer(data: {
  name: string; contact_person?: string; phone?: string; email?: string;
  industry?: string; level?: string; tenantId: number;
}): number {
  const r = dbRun(
    `INSERT INTO customers (name, contact_person, phone, email, industry, level, tenant_id)
     VALUES (?,?,?,?,?,?,?)`,
    [data.name, data.contact_person || "", data.phone || "", data.email || "",
     data.industry || "其他", data.level || "standard", data.tenantId]
  );
  return r.lastInsertRowid;
}

export function getCustomer(id: number, tenantId: number): Customer | null {
  return dbGet("SELECT * FROM customers WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Customer | null;
}

export function listCustomers(tenantId: number, opts?: { industry?: string; level?: string; status?: string }): Customer[] {
  let sql = "SELECT * FROM customers WHERE tenant_id = ?";
  const params: any[] = [tenantId];
  if (opts?.industry) { sql += " AND industry = ?"; params.push(opts.industry); }
  if (opts?.level) { sql += " AND level = ?"; params.push(opts.level); }
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as Customer[];
}

export function updateCustomer(id: number, tenantId: number, data: Partial<Customer>): boolean {
  const sets: string[] = [];
  const params: any[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && k !== "id" && k !== "tenant_id" && k !== "created_at") {
      sets.push(`${k} = ?`); params.push(v);
    }
  }
  if (sets.length === 0) return false;
  params.push(id, tenantId);
  dbRun(`UPDATE customers SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
  return true;
}

// ============================================================
// 2. 服务工单
// ============================================================

export interface ServiceTicket {
  id: number;
  ticket_no: string;
  customer_id: number;
  title: string;
  description: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: "open" | "processing" | "resolved" | "closed";
  assigned_to: number | null;
  resolution: string;
  tenant_id: number;
  created_at: string;
  resolved_at: string | null;
}

export function createTicket(data: {
  customer_id: number; title: string; description?: string;
  priority?: string; tenantId: number;
}): number {
  const ticketNo = `TK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const r = dbRun(
    `INSERT INTO service_tickets (ticket_no, customer_id, title, description, priority, tenant_id)
     VALUES (?,?,?,?,?,?)`,
    [ticketNo, data.customer_id, data.title, data.description || "",
     data.priority || "normal", data.tenantId]
  );
  return r.lastInsertRowid;
}

export function getTicket(id: number, tenantId: number): ServiceTicket | null {
  return dbGet("SELECT * FROM service_tickets WHERE id = ? AND tenant_id = ?", [id, tenantId]) as ServiceTicket | null;
}

export function listTickets(tenantId: number, opts?: { customer_id?: number; status?: string; priority?: string }): ServiceTicket[] {
  let sql = "SELECT * FROM service_tickets WHERE tenant_id = ?";
  const params: any[] = [tenantId];
  if (opts?.customer_id) { sql += " AND customer_id = ?"; params.push(opts.customer_id); }
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  if (opts?.priority) { sql += " AND priority = ?"; params.push(opts.priority); }
  sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at DESC";
  return dbAll(sql, params) as ServiceTicket[];
}

export function updateTicketStatus(id: number, tenantId: number, status: string, resolution?: string): void {
  dbRun(
    `UPDATE service_tickets SET status = ?, resolution = ?, resolved_at = CASE WHEN ? IN ('resolved','closed') THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = ? AND tenant_id = ?`,
    [status, resolution || "", status, id, tenantId]
  );
}

export function assignTicket(id: number, tenantId: number, userId: number): void {
  dbRun("UPDATE service_tickets SET assigned_to = ?, status = 'processing' WHERE id = ? AND tenant_id = ?", [userId, id, tenantId]);
}

// ============================================================
// 3. 收费计费引擎
// ============================================================

export interface Bill {
  id: number;
  bill_no: string;
  customer_id: number;
  amount: number; // 分
  paid_amount: number;
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
  item: string;
  description: string;
  due_date: string;
  tenant_id: number;
  created_at: string;
}

export function createBill(data: {
  customer_id: number; amount: number; item: string; description?: string;
  due_date?: string; tenantId: number;
}): number {
  const billNo = `BL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const r = dbRun(
    `INSERT INTO bills (bill_no, customer_id, amount, item, description, due_date, tenant_id)
     VALUES (?,?,?,?,?,?,?)`,
    [billNo, data.customer_id, data.amount, data.item, data.description || "",
     data.due_date || new Date(Date.now() + 30*86400000).toISOString().slice(0,10), data.tenantId]
  );
  return r.lastInsertRowid;
}

export function getBill(id: number, tenantId: number): Bill | null {
  return dbGet("SELECT * FROM bills WHERE id = ? AND tenant_id = ?", [id, tenantId]) as Bill | null;
}

export function listBills(tenantId: number, opts?: { customer_id?: number; status?: string }): Bill[] {
  let sql = "SELECT * FROM bills WHERE tenant_id = ?";
  const params: any[] = [tenantId];
  if (opts?.customer_id) { sql += " AND customer_id = ?"; params.push(opts.customer_id); }
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  sql += " ORDER BY created_at DESC";
  return dbAll(sql, params) as Bill[];
}

export function recordPayment(billId: number, amount: number, tenantId: number): void {
  const bill = getBill(billId, tenantId);
  if (!bill) throw new Error("账单不存在");
  const newPaid = bill.paid_amount + amount;
  const newStatus = newPaid >= bill.amount ? "paid" : "partial";
  dbRun("UPDATE bills SET paid_amount = ?, status = ? WHERE id = ? AND tenant_id = ?", [newPaid, newStatus, billId, tenantId]);
  // 记录流水
  dbRun("INSERT INTO bill_payments (bill_id, amount, tenant_id) VALUES (?,?,?)", [billId, amount, tenantId]);
}

export function getBillingStats(tenantId: number): {
  totalBilled: number; totalCollected: number; pending: number; overdue: number;
} {
  const row = dbGet(
    `SELECT COALESCE(SUM(amount),0) as billed, COALESCE(SUM(paid_amount),0) as collected,
     COUNT(CASE WHEN status='pending' THEN 1 END) as pending_count,
     COUNT(CASE WHEN status='overdue' THEN 1 END) as overdue_count
     FROM bills WHERE tenant_id = ?`,
    [tenantId]
  ) as any;
  return {
    totalBilled: row?.billed || 0,
    totalCollected: row?.collected || 0,
    pending: row?.pending_count || 0,
    overdue: row?.overdue_count || 0,
  };
}
