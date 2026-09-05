/**
 * IP 地理位置解析服务
 * 使用 ip-api.com 免费 API（非商业用途 45次/分钟，无需密钥）
 * 结果缓存到 ip_geo_cache 表，24小时内不重复请求
 */
import { dbGet, dbRun } from "../db";

interface GeoInfo {
  city: string;
  region: string;
  country: string;
  isp: string;
}

/**
 * 根据 IP 获取地理位置信息（带缓存）
 * 本地/内网 IP 直接返回"本地"
 */
export async function lookupIP(ip: string): Promise<GeoInfo> {
  const empty = { city: "", region: "", country: "", isp: "" };

  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return { ...empty, city: "本地", region: "", country: "本地" };
  }

  // 内网IP不查询
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
    return { ...empty, city: "内网", region: "", country: "内网" };
  }

  // 查缓存（24小时内）
  const cached = dbGet("SELECT city, region, country, isp, queried_at FROM ip_geo_cache WHERE ip = ?", [ip]) as any;
  if (cached) {
    const age = Date.now() - new Date(cached.queried_at).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return { city: cached.city || "", region: cached.region || "", country: cached.country || "", isp: cached.isp || "" };
    }
  }

  // 查询 ip-api.com
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=city,regionName,country,isp`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) return empty;

    const data = await resp.json() as any;
    const result: GeoInfo = {
      city: data.city || "",
      region: data.regionName || "",
      country: data.country || "",
      isp: data.isp || "",
    };

    // 写入缓存
    dbRun(
      `INSERT OR REPLACE INTO ip_geo_cache (ip, city, region, country, isp, queried_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [ip, result.city, result.region, result.country, result.isp]
    );

    return result;
  } catch {
    return empty;
  }
}
