import { Router } from "express";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware";
import { dbGet, dbAll, dbRun } from "../db";

export const paymentRoutes = Router();
paymentRoutes.use(authenticate);
paymentRoutes.use(requireSuperAdmin);

// 支付渠道定义
const PROVIDER_TEMPLATES: Record<string, any> = {
  wechat: {
    name: "微信支付",
    icon: "💚",
    fields: [
      { key: "app_id", label: "AppID", required: true },
      { key: "mch_id", label: "商户号", required: true },
      { key: "api_key", label: "API密钥", required: true, secret: true },
      { key: "api_v3_key", label: "API v3密钥", required: false, secret: true },
      { key: "notify_url", label: "回调地址", required: true },
    ],
    modes: ["jsapi", "native", "h5"],
  },
  alipay: {
    name: "支付宝",
    icon: "💙",
    fields: [
      { key: "app_id", label: "AppID", required: true },
      { key: "private_key", label: "应用私钥", required: true, secret: true },
      { key: "alipay_public_key", label: "支付宝公钥", required: true },
      { key: "notify_url", label: "回调地址", required: true },
    ],
    modes: ["page", "wap", "qr"],
  },
  hupijiao: {
    name: "虎皮椒",
    icon: "🐯",
    fields: [
      { key: "app_id", label: "AppID", required: true },
      { key: "app_secret", label: "AppSecret", required: true, secret: true },
      { key: "notify_url", label: "回调地址", required: true },
    ],
    modes: ["native", "jsapi", "h5"],
    note: "聚合支付，同时支持微信/支付宝扫码",
  },
};

// 获取所有支付渠道模板
paymentRoutes.get("/providers", (req: AuthRequest, res) => {
  try {
    const configs = dbAll(
      "SELECT provider, enabled, config_json FROM payment_configs WHERE tenant_id = ?",
      [req.user!.tenant_id]
    ) as any[];

    const providers = Object.entries(PROVIDER_TEMPLATES).map(([key, tmpl]) => {
      const saved = configs.find(c => c.provider === key);
      const cfg = saved?.config_json ? JSON.parse(saved.config_json) : {};
      return {
        provider: key,
        name: tmpl.name,
        icon: tmpl.icon,
        modes: tmpl.modes,
        fields: tmpl.fields.map((f: any) => ({
          ...f,
          value: cfg[f.key] || "",
          // 已配置的密钥字段返回掩码值
          masked: f.secret && cfg[f.key] ? "••••••••" + cfg[f.key].slice(-4) : undefined,
        })),
        enabled: saved?.enabled || 0,
        configured: Object.values(cfg).some(v => v),
        note: (tmpl as any).note || "",
      };
    });

    res.json({ success: true, data: providers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
});

// 保存支付配置
paymentRoutes.put("/config/:provider", (req: AuthRequest, res) => {
  try {
    const { provider } = req.params;
    const { enabled, fields } = req.body;
    const tmpl = PROVIDER_TEMPLATES[provider];
    if (!tmpl) return res.status(400).json({ success: false, error: "不支持的支付渠道" });

    const tid = req.user!.tenant_id;

    // 读取现有配置
    const existing = dbGet(
      "SELECT config_json FROM payment_configs WHERE tenant_id = ? AND provider = ?",
      [tid, provider]
    ) as any;

    let configJson: Record<string, string> = {};
    if (existing?.config_json) {
      try { configJson = JSON.parse(existing.config_json); } catch {}
    }

    // 合并字段值（空值保留原值）
    for (const f of (fields || [])) {
      if (f.value !== undefined && f.value !== "" && !f.value.startsWith("••••••••")) {
        configJson[f.key] = f.value;
      }
    }

    dbRun(
      `INSERT INTO payment_configs (tenant_id, provider, name, enabled, config_json, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(tenant_id, provider) DO UPDATE SET
       enabled = excluded.enabled, config_json = excluded.config_json, updated_at = CURRENT_TIMESTAMP`,
      [tid, provider, tmpl.name, enabled ? 1 : 0, JSON.stringify(configJson)]
    );

    res.json({ success: true, data: { provider, enabled: enabled ? 1 : 0 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
});

// 测试支付配置
paymentRoutes.post("/config/:provider/test", async (req: AuthRequest, res) => {
  try {
    const { provider } = req.params;
    const tmpl = PROVIDER_TEMPLATES[provider];
    if (!tmpl) return res.status(400).json({ success: false, error: "不支持的支付渠道" });

    const config = dbGet(
      "SELECT config_json FROM payment_configs WHERE tenant_id = ? AND provider = ? AND enabled = 1",
      [req.user!.tenant_id, provider]
    ) as any;

    if (!config) return res.json({ success: false, error: "支付渠道未配置或未启用" });

    const cfg = JSON.parse(config.config_json);
    const missing = tmpl.fields.filter((f: any) => f.required && !cfg[f.key]);

    if (missing.length > 0) {
      return res.json({ success: false, error: `缺少必要配置: ${missing.map((f: any) => f.label).join("、")}` });
    }

    res.json({ success: true, data: { message: "配置验证通过", provider, name: tmpl.name } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
});
