/**
 * XYOS 电力市场系统
 *
 * 模块：
 * 1. PowerPlantManager — 电厂/发电资源管理
 * 2. MarketEngine — 电力交易撮合引擎
 * 3. GridManager — 电网调度与输电管理
 * 4. PriceEngine — 电价计算与预测
 */

import { dbGet, dbAll, dbRun } from "../db";

// ============================================================
// 1. 电厂管理
// ============================================================

export interface PowerPlant {
  id: number;
  name: string;
  type: "thermal" | "hydro" | "wind" | "solar" | "nuclear" | "biomass";
  installed_capacity_kw: number; // 装机容量（千瓦）
  current_output_kw: number;    // 当前出力
  grid_connection_point: string; // 并网点
  status: "online" | "offline" | "maintenance";
  efficiency: number; // 发电效率（%）
  fuel_cost_per_kwh: number; // 燃料成本（分/kWh）
  tenant_id: number;
  created_at: string;
}

export function createPlant(data: {
  name: string; type: string; installedCapacityKw: number;
  gridPoint?: string; tenantId: number;
}): number {
  const r = dbRun(
    `INSERT INTO power_plants (name, type, installed_capacity_kw, grid_connection_point, tenant_id)
     VALUES (?,?,?,?,?)`,
    [data.name, data.type, data.installedCapacityKw, data.gridPoint || "", data.tenantId]
  );
  return r.lastInsertRowid;
}

export function listPlants(tenantId: number, type?: string): PowerPlant[] {
  let sql = "SELECT * FROM power_plants WHERE tenant_id = ?";
  const params: any[] = [tenantId];
  if (type) { sql += " AND type = ?"; params.push(type); }
  return dbAll(sql, params) as PowerPlant[];
}

export function updatePlantOutput(id: number, tenantId: number, outputKw: number): void {
  dbRun("UPDATE power_plants SET current_output_kw = ? WHERE id = ? AND tenant_id = ?", [outputKw, id, tenantId]);
}

// ============================================================
// 2. 电力交易撮合
// ============================================================

export interface ElectricityTrade {
  id: number;
  trade_no: string;
  seller_id: number;  // 卖方电厂
  buyer_id: number;   // 买方
  volume_kwh: number; // 交易电量
  price_per_kwh: number; // 单价（分/kWh）
  total_amount: number;  // 总金额（分）
  delivery_start: string;
  delivery_end: string;
  trade_type: "spot" | "forward" | "contract";
  status: "pending" | "confirmed" | "delivering" | "completed" | "cancelled";
  tenant_id: number;
  created_at: string;
}

export function createTrade(data: {
  sellerId: number; buyerId: number; volumeKwh: number;
  pricePerKwh: number; deliveryStart: string; deliveryEnd: string;
  tradeType: string; tenantId: number;
}): number {
  const totalAmount = Math.round(data.volumeKwh * data.pricePerKwh);
  const tradeNo = `ET-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const r = dbRun(
    `INSERT INTO electricity_trades (trade_no, seller_id, buyer_id, volume_kwh, price_per_kwh,
     total_amount, delivery_start, delivery_end, trade_type, tenant_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [tradeNo, data.sellerId, data.buyerId, data.volumeKwh, data.pricePerKwh,
     totalAmount, data.deliveryStart, data.deliveryEnd, data.tradeType, data.tenantId]
  );
  return r.lastInsertRowid;
}

export function getTrade(id: number, tenantId: number): ElectricityTrade | null {
  return dbGet("SELECT * FROM electricity_trades WHERE id = ? AND tenant_id = ?", [id, tenantId]) as ElectricityTrade | null;
}

export function listTrades_Energy(tenantId: number, opts?: { status?: string; tradeType?: string }): ElectricityTrade[] {
  let sql = "SELECT * FROM electricity_trades WHERE tenant_id = ?";
  const params: any[] = [tenantId];
  if (opts?.status) { sql += " AND status = ?"; params.push(opts.status); }
  if (opts?.tradeType) { sql += " AND trade_type = ?"; params.push(opts.tradeType); }
  sql += " ORDER BY created_at DESC LIMIT 200";
  return dbAll(sql, params) as ElectricityTrade[];
}

export function confirmTrade(id: number, tenantId: number): void {
  dbRun("UPDATE electricity_trades SET status = 'confirmed' WHERE id = ? AND tenant_id = ? AND status = 'pending'", [id, tenantId]);
}

// ============================================================
// 3. 电网调度
// ============================================================

export interface GridSnapshot {
  total_generation_kw: number;
  total_load_kw: number;
  frequency_hz: number;
  reserve_margin_pct: number;
  online_plants: number;
  timestamp: string;
}

export function getGridSnapshot(tenantId: number): GridSnapshot {
  const plants = listPlants(tenantId);
  const online = plants.filter(p => p.status === "online");
  const totalGen = online.reduce((sum, p) => sum + p.current_output_kw, 0);
  const totalCapacity = online.reduce((sum, p) => sum + p.installed_capacity_kw, 0);

  // 模拟负载（实际应接 SCADA 数据）
  const loadKw = Math.round(totalGen * (0.7 + Math.random() * 0.25));

  return {
    total_generation_kw: totalGen,
    total_load_kw: loadKw,
    frequency_hz: 50.0 + (Math.random() - 0.5) * 0.1,
    reserve_margin_pct: totalCapacity > 0 ? Math.round(((totalCapacity - loadKw) / totalCapacity) * 100) : 0,
    online_plants: online.length,
    timestamp: new Date().toISOString(),
  };
}

export function recordGridSnapshot(tenantId: number): number {
  const snap = getGridSnapshot(tenantId);
  const r = dbRun(
    `INSERT INTO grid_snapshots (total_gen_kw, total_load_kw, frequency_hz, reserve_margin_pct, online_plants, tenant_id)
     VALUES (?,?,?,?,?,?)`,
    [snap.total_generation_kw, snap.total_load_kw, snap.frequency_hz, snap.reserve_margin_pct, snap.online_plants, tenantId]
  );
  return r.lastInsertRowid;
}

// ============================================================
// 4. 电价引擎
// ============================================================

export interface PricePoint {
  timestamp: string;
  spot_price: number;   // 现货价格（分/kWh）
  peak_price: number;   // 峰时电价
  valley_price: number; // 谷时电价
  avg_trade_price: number;
}

export function getCurrentPrice(tenantId: number): PricePoint {
  // 基于最近交易的加权平均，带时间分时因子
  const recentTrades = dbAll(
    "SELECT price_per_kwh, volume_kwh FROM electricity_trades WHERE tenant_id = ? AND status IN ('confirmed','completed') ORDER BY created_at DESC LIMIT 50",
    [tenantId]
  ) as { price_per_kwh: number; volume_kwh: number }[];

  let avgPrice = 50; // 默认 0.5 元/kWh
  if (recentTrades.length > 0) {
    const totalVol = recentTrades.reduce((s, t) => s + t.volume_kwh, 0);
    const totalAmt = recentTrades.reduce((s, t) => s + t.price_per_kwh * t.volume_kwh, 0);
    avgPrice = Math.round(totalAmt / totalVol);
  }

  const hour = new Date().getHours();
  const isPeak = hour >= 8 && hour <= 11 || hour >= 18 && hour <= 21;
  const isValley = hour >= 23 || hour <= 6;

  return {
    timestamp: new Date().toISOString(),
    spot_price: avgPrice,
    peak_price: Math.round(avgPrice * (isPeak ? 1.5 : 1.2)),
    valley_price: Math.round(avgPrice * (isValley ? 0.5 : 0.7)),
    avg_trade_price: avgPrice,
  };
}
