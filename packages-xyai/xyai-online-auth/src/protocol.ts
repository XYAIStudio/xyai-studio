/**
 * Online-account wire facts shared by the Host half and the browser half: the
 * Connection channel this plugin owns, the envelope every endpoint answer
 * carries, and the linked-account record both halves render.
 */

/** Logical Connection channel: the Host registers it, the browser half calls it. */
export const ONLINE_CHANNEL = '/xyai-online'

/**
 * Envelope every online-account endpoint returns. Each endpoint adds its own
 * fields; `errcode === '0'` marks success and every other value carries `errmsg`.
 */
export interface OnlineEnvelope {
  /** `'0'` on success; the online backend's own HTTP status on failure. */
  errcode?: string
  /** Operator-readable failure reason; empty on success. */
  errmsg?: string
}

/** One linked www.cnxyai.cn account. */
export interface OnlineUser {
  /** Online user id. */
  id: number
  /** Display name the operator logged in with. */
  name: string
  /** Login email. */
  email: string
  /** Whether the online backend marks this email a super admin. */
  isAdmin: boolean
}
