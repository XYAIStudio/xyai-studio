/**
 * Locale-owned copy for @xyai/dsh-commerce (client-ui-i18n requires it).
 */
export const en = {
  'commerce.company': 'HQ Console',
  'commerce.channel': 'Channel Workspace',
  'commerce.payment': 'Payment',
  'commerce.channels': 'Channels',
  'commerce.users': 'Direct users',
  'commerce.revenue': 'Revenue',
  'commerce.expiries': 'License expiries',
  'commerce.myRevenue': 'My revenue',
  'commerce.renew': 'Renew',
  'commerce.pay': 'Pay now',
  'commerce.gateway': 'Payment gateway',
  'commerce.invoice': 'Invoice',
  'commerce.sys': 'System / License',
  'commerce.pricing': 'Pricing',
  'commerce.channelPrice': 'Channel pricing',
  'commerce.pluginSplit': 'Plugin split',
} as const

/** Simplified-Chinese dictionary for the same key set. */
export const zh = {
  'commerce.company': 'XYAI 后台',
  'commerce.channel': '渠道工作台',
  'commerce.payment': '支付',
  'commerce.channels': '渠道商',
  'commerce.users': '直销用户',
  'commerce.revenue': '总收入',
  'commerce.expiries': '授权到期',
  'commerce.myRevenue': '我的收入',
  'commerce.renew': '续费',
  'commerce.pay': '立即支付',
  'commerce.gateway': '支付网关',
  'commerce.invoice': '发票',
  'commerce.sys': '系统 / 授权',
  'commerce.pricing': '定价',
  'commerce.channelPrice': '渠道定价',
  'commerce.pluginSplit': '插件分成',
} as const

/** The `xyaiCommerce` namespace key union. */
export type XyaiCommerceKey = keyof typeof en
