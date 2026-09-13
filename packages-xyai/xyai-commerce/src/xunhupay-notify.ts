/**
 * XunHuPay (虎皮椒) asynchronous callback handling: signature computation,
 * delivery verification, and the settle dispatch a payment gateway retries
 * until it succeeds.
 *
 * This module is venue-agnostic. The Host half mounts it on
 * `PAYMENT_NOTIFY_PATH`; the same code can serve the www.cnxy.tech website
 * backend. It depends only on the merchant AppSecret and never on an HTTP
 * framework — callers adapt the request and response.
 */
import { createHash } from 'node:crypto'

/** Compute one MD5 hex digest over a UTF-8 string. */
function md5(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex')
}

/**
 * Compute the XunHuPay `hash` signature: drop `hash` itself and every empty
 * field, sort the remaining keys by ASCII, join them as `k=v&...`, append the
 * AppSecret directly, and take the lowercase MD5.
 * @param params - business parameters, with or without an incoming `hash`.
 * @param appSecret - merchant AppSecret the digest is keyed with.
 * @returns the lowercase hex signature the gateway compares against.
 */
export function sign(params: Record<string, string>, appSecret: string): string {
  const pairs = Object.keys(params)
    .filter(key => key !== 'hash' && params[key] !== '' && params[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(key => `${key}=${params[key]}`)
  return md5(pairs.join('&') + appSecret)
}

/** One verified callback delivery and the order facts it carries. */
export type XunhupayNotify = {
  /** Whether the delivered `hash` matched the recomputed signature. */
  valid: boolean
  /** Whether the delivery is authentic and reports `status === 'OD'` (paid). */
  paid: boolean
  /** Merchant order id delivered as `trade_order_id`. */
  orderNo?: string | undefined
  /** Paid amount in yuan delivered as `total_fee`. */
  totalFee?: string | undefined
  /** Gateway transaction id delivered as `transaction_id`. */
  transactionId?: string | undefined
  /** Payer-visible order title delivered as `order_title`. */
  orderTitle?: string | undefined
}

/**
 * Verify one XunHuPay asynchronous callback payload.
 * @param params - delivered urlencoded form fields, including `hash`.
 * @param appSecret - merchant AppSecret the signature is recomputed with.
 * @returns the verification verdict and every order fact the delivery carried.
 */
export function verifyNotify(params: Record<string, string>, appSecret: string): XunhupayNotify {
  const incoming = params.hash ?? ''
  const calculated = sign(params, appSecret)
  const valid = incoming.toLowerCase() === calculated.toLowerCase()
  return {
    valid,
    paid: valid && params.status === 'OD',
    orderNo: params.trade_order_id,
    totalFee: params.total_fee,
    transactionId: params.transaction_id,
    orderTitle: params.order_title,
  }
}

/** What one callback delivery needs to settle: the signing secret and the business handler. */
export type NotifyContext = {
  /** Merchant AppSecret the delivered signature is recomputed with. */
  appSecret: string
  /** Business settle handler: mark the order paid, extend the license, record the commission. */
  onPaid: (notify: XunhupayNotify) => Promise<void>
}

/** One settle outcome: the HTTP body to answer with and whether the gateway should stop retrying. */
export type NotifyOutcome = {
  /** Response body XunHuPay reads: `'success'` stops retries, `'fail'` keeps them. */
  body: string
  /** Whether the delivery was authentic, paid, and settled without error. */
  ok: boolean
  /** The verification result the settle decision was made from. */
  notify: XunhupayNotify
}

/**
 * Settle one callback delivery. An authentic paid delivery runs `onPaid` and
 * answers success; anything else answers fail so the gateway keeps retrying.
 * @param params - delivered urlencoded form fields, including `hash`.
 * @param ctx - signing secret and business settle handler.
 * @returns the response body, the settle verdict, and the verification result.
 */
export async function handleNotify(params: Record<string, string>, ctx: NotifyContext): Promise<NotifyOutcome> {
  const notify = verifyNotify(params, ctx.appSecret)
  if (!notify.valid || !notify.paid) return { body: 'fail', ok: false, notify }
  try {
    await ctx.onPaid(notify)
    return { body: 'success', ok: true, notify }
  } catch {
    // A settle failure must stay retryable, so the business error is not reported to the gateway.
    return { body: 'fail', ok: false, notify }
  }
}

/** One settle outcome rendered as an HTTP status and body. */
export type NotifyHttpOutcome = {
  /** 200 when the delivery settled, 400 so the gateway retries. */
  status: number
  /** Body XunHuPay reads. */
  body: string
  /** The verification result the settle decision was made from. */
  notify: XunhupayNotify
}

/**
 * Settle one POST `application/x-www-form-urlencoded` callback delivery.
 * @param raw - delivered form fields, including `hash`.
 * @param ctx - signing secret and business settle handler.
 * @returns the HTTP status and body the route answers with, plus the verification result.
 */
export async function handleNotifyHttp(raw: Record<string, string>, ctx: NotifyContext): Promise<NotifyHttpOutcome> {
  const result = await handleNotify(raw, ctx)
  return { status: result.ok ? 200 : 400, body: result.body, notify: result.notify }
}
