/** Locale-owned copy for @xyai/dsh-tenancy (client-ui-i18n requires it). */
export const en = {
  'tenancy.page': 'Tenancy & License',
  'tenancy.tenant': 'Tenant',
  'tenancy.plan': 'Plan',
  'tenancy.plan.standard': 'Standard',
  'tenancy.plan.pro': 'Pro',
  'tenancy.plan.enterprise': 'Enterprise',
  'tenancy.seats': 'Seats',
  'tenancy.licenseKey': 'License key',
  'tenancy.expiresAt': 'Expires on',
  'tenancy.entitlements': 'Entitlements',
  'tenancy.entitlementsHint': 'Comma-separated feature keys consumed by feature gates.',
  'tenancy.save': 'Save tenancy',
  'tenancy.reset': 'Restore defaults',
  'tenancy.cancel': 'Discard edits',
  'tenancy.saved': 'Tenancy saved',
  'tenancy.error': 'Could not save tenancy. Your edits are retained; try again.',
  'tenancy.loading': 'Loading tenancy settings…',
  'tenancy.unavailable': 'Tenancy settings are not writable on this connection.',
} as const

/** Simplified-Chinese dictionary for the same key set. */
export const zh = {
  'tenancy.page': '租户与许可',
  'tenancy.tenant': '租户名称',
  'tenancy.plan': '套餐',
  'tenancy.plan.standard': '标准版',
  'tenancy.plan.pro': '专业版',
  'tenancy.plan.enterprise': '企业版',
  'tenancy.seats': '座席数',
  'tenancy.licenseKey': '授权密钥',
  'tenancy.expiresAt': '授权到期日',
  'tenancy.entitlements': '授权能力',
  'tenancy.entitlementsHint': '逗号分隔的功能键,供功能开关消费。',
  'tenancy.save': '保存租户',
  'tenancy.reset': '恢复默认',
  'tenancy.cancel': '放弃修改',
  'tenancy.saved': '租户信息已保存',
  'tenancy.error': '保存失败,修改已保留,请重试。',
  'tenancy.loading': '正在加载租户设置…',
  'tenancy.unavailable': '当前连接无法写入租户设置。',
} as const

/** The `xyaiTenancy` namespace key union. */
export type XyaiTenancyKey = keyof typeof en
