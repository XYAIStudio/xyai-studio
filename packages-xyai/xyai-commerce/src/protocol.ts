/**
 * Commerce wire facts shared by the Host half and the browser half: the
 * Connection channel this plugin owns, the public callback route the payment
 * gateway calls, and the envelope every endpoint answer carries.
 */

/** Logical Connection channel: the Host registers it, the browser half calls it. */
export const COMMERCE_CHANNEL = '/xyai-commerce'

/**
 * Exact HTTP path of the public XunHuPay asynchronous callback. It sits outside
 * the reserved `/api` channel because the gateway authenticates the delivery
 * with its own signature instead of a browser session.
 */
export const PAYMENT_NOTIFY_PATH = '/xyai/payment/notify'

/**
 * Envelope every commerce endpoint returns. Each endpoint adds its own fields;
 * `errcode === '0'` marks success and every other value carries `errmsg`.
 */
export interface CommerceEnvelope {
  /** `'0'` on success; a gateway or HTTP status code on failure. */
  errcode?: string
  /** Operator-readable failure reason; empty on success. */
  errmsg?: string
}
