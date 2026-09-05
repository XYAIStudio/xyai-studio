/**
 * 雄元智脑XYOS — 支付服务
 *
 * 渠道：虎皮椒（聚合扫码，微信/支付宝均可扫）；微信/支付宝预留同接口。
 * 流程：订阅申请(pending) → 创建支付订单 → 返回扫码二维码 → 用户支付
 *       → 渠道回调 notify → 验签 → 标记已付 → 激活订阅（applyPlanToTenant）。
 * 渠道参数由超级管理员在后台配置（payment_configs 表）。
 */
import crypto from "crypto";
import { dbGet, dbAll, dbRun } from "../db";
import { activateSubscription } from "./subscription";

export interface PaymentOrderInfo {
  id: string;
  sub_id: string | null;
  tenant_id: number;
  provider: string;
  amount: number;
  status: string;
  qrcode_url: string | null;
  trade_no: string | null;
  created_at: string;
  paid_at: string | null;
}

const HUPIJIAO_API = "https://api.xunhupay.com/payment/do.html";

/** 读取已启用渠道配置（配置存于 payment_configs，超管后台维护）。 */
export function getProviderConfig(provider: string): Record<string, string> | undefined {
  const row = dbGet(
    "SELECT config_json FROM payment_configs WHERE provider = ? AND enabled = 1 ORDER BY id DESC LIMIT 1",
    [provider]
  ) as any;
  if (!row?.config_json) return undefined;
  try { return JSON.parse(row.config_json); } catch { return undefined; }
}

/** 可用的在线支付渠道（已配置并启用）。 */
export function availableProviders(): string[] {
  return (dbAll("SELECT provider FROM payment_configs WHERE enabled = 1") as any[]).map((r) => r.provider);
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input, "utf8").digest("hex");
}

/** 虎皮椒签名：参数按 key 升序拼接 + appsecret，MD5。 */
function hupijiaoSign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join("&");
  return md5(str + secret);
}

/**
 * 创建支付订单并请求虎皮椒扫码。
 * 返回 { orderId, qrcodeUrl }；渠道未配置时抛错（前端回退对公转账）。
 */
export async function createPaymentOrder(opts: {
  tenantId: number;
  subId: string;
  amount: number;
  provider?: string;
}): Promise<PaymentOrderInfo> {
  const provider = opts.provider || "hupijiao";
  const cfg = getProviderConfig(provider);
  if (!cfg?.app_id || !cfg.app_secret) {
    throw new Error("支付渠道未配置，请联系管理员设置后使用在线支付（当前可走对公转账）");
  }

  const orderId = `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tradeOrderId = `XY${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  dbRun(
    `INSERT INTO payment_orders (id, sub_id, tenant_id, provider, amount, status, created_at) VALUES (?,?,?,?,?,'pending',?)`,
    [orderId, opts.subId, opts.tenantId, provider, opts.amount, new Date().toISOString()]
  );

  if (provider === "hupijiao") {
    const params: Record<string, string> = {
      version: "1.1",
      appid: cfg.app_id,
      trade_order_id: tradeOrderId,
      total_fee: opts.amount.toFixed(2),
      title: `雄元智脑XYOS 订阅（订单 ${orderId.slice(-8)}）`,
      time: Math.floor(Date.now() / 1000).toString(),
      nonce_str: Math.random().toString(36).slice(2, 12),
      type: "WAP",
      wap_url: cfg.wap_url || "",
      wap_name: cfg.wap_name || "雄元智脑XYOS",
      notify_url: cfg.notify_url || "",
    };
    params.hash = hupijiaoSign(params, cfg.app_secret);

    const resp = await fetch(HUPIJIAO_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data = await resp.json().catch(() => ({})) as any;
    if (data.errcode !== 0 || !data.url_qrcode) {
      dbRun(`UPDATE payment_orders SET status = 'failed', raw = ? WHERE id = ?`, [JSON.stringify(data), orderId]);
      throw new Error(`支付下单失败：${data.errmsg || "渠道返回异常"}`);
    }
    dbRun(`UPDATE payment_orders SET qrcode_url = ?, trade_no = ?, raw = ? WHERE id = ?`, [data.url_qrcode, tradeOrderId, JSON.stringify(data).slice(0, 2000), orderId]);
  }

  const row = dbGet("SELECT * FROM payment_orders WHERE id = ?", [orderId]) as any;
  return rowToOrder(row);
}

/** 查询支付订单状态。 */
export function getPaymentOrder(orderId: string): PaymentOrderInfo | undefined {
  const row = dbGet("SELECT * FROM payment_orders WHERE id = ?", [orderId]) as any;
  return row ? rowToOrder(row) : undefined;
}

/**
 * 虎皮椒回调验签并激活订阅。
 * 返回 true = 已处理成功（渠道可结束）。
 */
export async function handleNotify(provider: string, body: any): Promise<{ ok: boolean; message: string }> {
  if (provider === "hupijiao") {
    const cfg = getProviderConfig("hupijiao");
    if (!cfg?.app_secret) return { ok: false, message: "渠道未配置" };
    const params: Record<string, string> = {};
    for (const k of Object.keys(body)) {
      if (k !== "hash" && body[k] !== undefined) params[k] = String(body[k]);
    }
    const sign = hupijiaoSign(params, cfg.app_secret);
    if (sign !== body.hash) return { ok: false, message: "签名校验失败" };

    const tradeNo = String(body.trade_order_id || "");
    const order = dbGet("SELECT * FROM payment_orders WHERE trade_no = ?", [tradeNo]) as any;
    if (!order) return { ok: false, message: "订单不存在" };
    if (order.status === "paid") return { ok: true, message: "已处理" };

    // 标记已付 + 激活订阅（仅当回调金额与订单一致）
    const paidFee = Number(body.total_fee || 0);
    if (Math.abs(paidFee - order.amount) > 0.01) return { ok: false, message: "金额不一致" };

    dbRun(`UPDATE payment_orders SET status = 'paid', paid_at = ? WHERE id = ?`, [new Date().toISOString(), order.id]);
    if (order.sub_id) {
      try {
        activateSubscription(order.sub_id, 0);
      } catch (err: any) {
        return { ok: false, message: `订阅激活失败：${err.message}` };
      }
    }
    return { ok: true, message: "success" };
  }
  return { ok: false, message: "不支持的渠道" };
}

function rowToOrder(row: any): PaymentOrderInfo {
  return {
    id: row.id,
    sub_id: row.sub_id,
    tenant_id: row.tenant_id,
    provider: row.provider,
    amount: row.amount,
    status: row.status,
    qrcode_url: row.qrcode_url,
    trade_no: row.trade_no,
    created_at: row.created_at,
    paid_at: row.paid_at,
  };
}
