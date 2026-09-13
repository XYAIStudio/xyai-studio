/**
 * Locale-owned copy for @xyai/dsh-online-auth.
 */
export const en = {
  'online.auth.title': 'XYAI Online Login',
  'online.auth.desc': 'Link this desktop app to your XYAI online account.',
  'online.auth.login': 'Log in to XYAI Online',
  'online.auth.code.hint': 'Code',
  'online.auth.confirm': 'I have authorized on web, get token',
  'online.auth.logout': 'Log out',
  'online.auth.admin': 'Super Admin',
  'online.auth.retry': 'Retry',
} as const

/** Simplified-Chinese dictionary for the same key set. */
export const zh = {
  'online.auth.title': 'XYAI 线上版登录',
  'online.auth.desc': '把本机桌面端与你的 XYAI 线上账号关联。',
  'online.auth.login': '登录 XYAI 线上版',
  'online.auth.code.hint': '设备码',
  'online.auth.confirm': '我已在网页授权，取令牌',
  'online.auth.logout': '退出',
  'online.auth.admin': '超级管理员',
  'online.auth.retry': '重试',
} as const

/** The `xyaiOnlineAuth` namespace key union. */
export type XyaiOnlineAuthKey = keyof typeof en
