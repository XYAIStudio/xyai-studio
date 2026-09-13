/**
 * XYAI pricing engine — the franchise price hierarchy and its discount rules.
 *
 * Price levels per product (套餐):
 *   factoryPrice   (出厂价)    — HQ sets it; the channel's procurement cost.
 *   suggestPrice   (指导价)    — HQ sets it; what a direct XYAI buyer sees.
 *   channelPrice   (渠道销售价) — the channel sets it; at or above factoryPrice.
 * Promotions: xyaiDiscount / channelDiscount (优惠价) and coupon (优惠券), set by HQ and/or the channel.
 *
 * Margin-protection rule: the XYAI direct discount stays below suggestPrice - factoryPrice,
 * so the direct price never undercuts the channel's margin band.
 */

/** One product's stored price levels and promotions. */
export type PriceConfig = {
  /** Operator-facing product or plan name. */
  product: string
  /** 出厂价 (HQ): the channel's procurement cost. */
  factoryPrice: number
  /** 指导价 (HQ): the price a direct XYAI buyer sees. */
  suggestPrice: number
  /** XYAI 直销优惠额 (HQ). */
  xyaiDiscount?: number
  /** 渠道销售价 (channel). */
  channelPrice?: number
  /** 渠道优惠额 (channel). */
  channelDiscount?: number
  /** 优惠券金额 (HQ or channel). */
  coupon?: number
}

/** One buyer's resolved price, plus whether the margin-protection rule held. */
export type PriceResult = {
  /** Product the price was computed for. */
  product: string
  /** Display base price: 指导价 for a direct buyer, 渠道销售价 for a channel buyer. */
  base: number
  /** Applied discount amount. */
  discount: number
  /** Applied coupon amount. */
  coupon: number
  /** Amount the buyer actually pays. */
  final: number
  /** Whether the configured discounts satisfied the margin-protection rule. */
  ok: boolean
  /** Operator-readable explanation of the result. */
  note: string
  /** Which revenue route the price was computed for. */
  role: 'xyai-direct' | 'channel'
}

/** Clamp one optional amount to a non-negative finite number. */
function n(v: number | undefined): number { return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0 }

/**
 * One third-party paid plugin's revenue split. XYAI collects the developer's
 * list price and keeps `platformFeePct`; the developer takes the rest.
 * Third-party plugins sell direct, with no channel resale, so the platform
 * share is configurable per SKU and defaults to 20%.
 */
export type PluginPriceConfig = {
  /** Operator-facing plugin name. */
  product: string
  /** Revenue route: XYAI resells its own SKUs, developers sell direct. */
  author: 'developer' | 'xyai'
  /** Developer 定价 (the amount the user pays). */
  listPrice?: number
  /** 平台抽成率 in 0..1; defaults to 0.20. */
  platformFeePct?: number
  /** 授权有效天数; the market registry owns the per-SKU default. */
  licenseDays?: number
}

/** One plugin's resolved developer/platform split. */
export type PluginPriceResult = {
  /** Plugin the split was computed for. */
  product: string
  /** Revenue route the split applies to. */
  author: 'developer' | 'xyai'
  /** Clamped list price the user pays. */
  listPrice: number
  /** Platform share actually applied, in 0..1. */
  platformFeePct: number
  /** Developer share of the list price: 1 - platformFeePct. */
  developerRate: number
  /** Platform share of the list price. */
  platformRate: number
  /** Developer's yuan amount: listPrice × developerRate. */
  developerShare: number
  /** Platform's yuan amount: listPrice × platformRate. */
  platformCut: number
}

/**
 * Compute the developer/platform split for one paid plugin.
 * @param cfg - the plugin's list price, author route, and platform share.
 * @returns the applied rates and both yuan amounts.
 */
export function computePluginSplit(cfg: PluginPriceConfig): PluginPriceResult {
  const listPrice = n(cfg.listPrice)
  const pct = typeof cfg.platformFeePct === 'number' && Number.isFinite(cfg.platformFeePct)
    && cfg.platformFeePct >= 0 && cfg.platformFeePct <= 1
    ? cfg.platformFeePct : 0.20
  const platformCut = listPrice * pct
  const developerShare = listPrice - platformCut
  return {
    product: cfg.product,
    author: cfg.author,
    listPrice,
    platformFeePct: pct,
    developerRate: 1 - pct,
    platformRate: pct,
    developerShare,
    platformCut,
  }
}

/**
 * Compute one buyer's effective price and apply the margin-protection rule.
 * @param cfg - the product's stored price levels and promotions.
 * @param role - `'xyai-direct'` prices against 指导价; `'channel'` prices against 渠道销售价.
 * @returns the resolved price, and `ok: false` with an explanatory note when a discount had to be clamped.
 */
export function computePrice(cfg: PriceConfig, role: 'xyai-direct' | 'channel'): PriceResult {
  const factory = n(cfg.factoryPrice)
  const suggest = n(cfg.suggestPrice)
  // 指导价 - 出厂价 = the channel's margin band.
  const margin = Math.max(0, suggest - factory)

  if (role === 'xyai-direct') {
    const want = n(cfg.xyaiDiscount)
    // The direct discount never exceeds the margin band, so XYAI does not undercut its channels.
    const discount = Math.min(want, margin)
    const coupon = Math.min(n(cfg.coupon), Math.max(0, suggest - discount))
    const final = Math.max(0, suggest - discount - coupon)
    const ok = want <= margin
    return {
      product: cfg.product, role,
      base: suggest, discount, coupon, final, ok,
      note: ok
        ? `直销优惠 ${discount}，低于出厂-指导差价 ${margin}，未与渠道争市场。`
        : `直销优惠 ${want} 超过出厂-指导差价 ${margin}，已按 ${margin} 夹紧，保护渠道利润带。`,
    }
  }

  const base = n(cfg.channelPrice) || factory
  // The channel's total discount never exceeds its own margin over the factory price.
  const discount = Math.min(n(cfg.channelDiscount) + n(cfg.coupon), Math.max(0, base - factory))
  const final = Math.max(0, base - discount)
  const ok = base >= factory
  return {
    product: cfg.product, role,
    base, discount, coupon: n(cfg.coupon), final, ok,
    note: ok
      ? `渠道价 ${base} ≥ 出厂价 ${factory}，差价 ${base - factory} 为渠道毛利。`
      : `渠道价 ${base} 低于出厂价 ${factory}，存在负毛利，建议调高。`,
  }
}
