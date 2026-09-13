/**
 * @xyai/dsh-commerce — Host half.
 *
 * XunHuPay (虎皮椒) Alipay payments, plugin-market licensing, channel pricing,
 * and the super-admin configuration surfaces. Every merchant value lives in a
 * registered `settings` namespace that each verb reads afresh, and secrets carry
 * `role('secret')` so no wire surface reads them back. The browser half reaches
 * the verbs through this package's own Connection RPC channel; the payment
 * gateway reaches `PAYMENT_NOTIFY_PATH` directly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Activates the ctx.connection Context merge this plugin registers its channel on.
import type {} from '@deepseek-ai/dsh-client-connection'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
// Activates the ctx.webServer Context merge the public callback route uses.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { computePluginSplit, computePrice, type PluginPriceConfig, type PriceConfig } from './pricing.ts'
import { COMMERCE_CHANNEL, PAYMENT_NOTIFY_PATH, type CommerceEnvelope } from './protocol.ts'
import { handleNotifyHttp, sign, verifyNotify, type XunhupayNotify } from './xunhupay-notify.ts'

/** Default XunHuPay gateway; the merchant section overrides it per deployment. */
const DEFAULT_GATEWAY = 'https://api.xunhupay.com'

/** HQ settle-stats backend read when the deployment section names no base URL. */
const DEFAULT_STATS_BASE = 'https://www.cnxy.tech'

/** Default platform share of a third-party paid plugin's list price. */
const DEFAULT_PLATFORM_FEE_PCT = 0.2

/** One plugin SKU in the market registry the paid-plugin model sells. */
export type PluginDef = {
  /** Stable SKU id; also the license key and the `PLG-<id>-<ts>` order prefix. */
  id: string
  /** Operator-facing product name; a callback with no parsable order id matches on it. */
  name: string
  /** Revenue route: XYAI resells its own SKUs through channels, developers sell direct. */
  author: 'xyai' | 'developer'
  /** Developer display name for a third-party SKU. */
  developer?: string
  /** Whether buying this SKU creates a paid order. */
  isPaid: boolean
  /** User-paid list price in yuan for a paid SKU. */
  listPrice?: number
  /** Platform share of the list price for a third-party SKU. */
  platformFeePct?: number
  /** License lifetime in days; zero grants a perpetual license. */
  licenseDays: number
  /** One-line pitch shown on the market card. */
  desc: string
}

/**
 * Plugin-market registry. Paid plugins are SKUs per the plugin-ecommerce model:
 * XYAI 自研 (channel-resellable, XYAI sets the price) or 三方开发者 (direct, the
 * developer sets `listPrice` and the platform takes `platformFeePct`).
 */
const PLUGINS: PluginDef[] = [
  { id: 'xyai-knowledge-base', name: '行业知识库', author: 'xyai', isPaid: false, licenseDays: 0, desc: '行业资料/术语库，让智能体懂你的行业。' },
  { id: 'xyai-model-plaza', name: '模型广场', author: 'xyai', isPaid: false, licenseDays: 0, desc: '按任务选模型，混搭 DeepSeek/多模型。' },
  { id: 'industry-agent-thermo', name: '热电行业智能体', author: 'developer', developer: '李工（独立开发者）', isPaid: true, listPrice: 199, platformFeePct: 0.2, licenseDays: 365, desc: '热电工艺计算/巡检方案生成，行业垂直。' },
  { id: 'industry-agent-mfg', name: '制造业智能体', author: 'developer', developer: '启明智创工作室', isPaid: true, listPrice: 3600, platformFeePct: 0.2, licenseDays: 365, desc: '排产/质量/工艺，制造业全能助手。' },
  { id: 'xyai-ai-employees', name: 'AI 员工（多智能体）', author: 'xyai', isPaid: false, licenseDays: 0, desc: '公司级 AI 员工招聘与协同。' },
]

/** Resolved XunHuPay merchant section; `appSecret` never leaves the Host. */
interface PaymentSection {
  appid?: string
  appSecret?: string
  gateway?: string
  notifyUrl?: string
  returnUrl?: string
}

/** Resolved channel payout-account section. */
interface ChannelAccountSection {
  method?: string
  account?: string
  holder?: string
  note?: string
}

/** Resolved invoicing-subject section; `type` selects the billing model. */
interface InvoiceSubjectSection {
  type?: string
  taxName?: string
  taxNo?: string
  agreement?: string
}

/** Resolved e-invoice merchant section; `merchantAppSecret` never leaves the Host. */
interface InvoiceMerchantSection {
  provider?: string
  merchantNo?: string
  merchantAppSecret?: string
  taxName?: string
  taxNo?: string
}

/** Resolved deployment section naming the callback domain and the stats backend. */
interface SysConfigSection {
  callbackDomain?: string
  appSiteUrl?: string
  baseUrl?: string
}

/** Resolved price-hierarchy section shared by HQ and the channel. */
interface PriceSection {
  product?: string
  factoryPrice?: number
  suggestPrice?: number
  xyaiDiscount?: number
  channelPrice?: number
  channelDiscount?: number
  coupon?: number
}

/** One granted plugin license row. */
interface PluginLicenseRow {
  id?: string
  expires?: string
  at?: string
  order?: string
}

/** Resolved license section: one row per granted plugin SKU. */
interface LicenseSection {
  licenses?: PluginLicenseRow[]
}

const paymentSchema: z<PaymentSection> = z.object({
  appid: z.string().default(''),
  appSecret: z.string().role('secret').default(''),
  gateway: z.string().default(DEFAULT_GATEWAY),
  notifyUrl: z.string().default(''),
  returnUrl: z.string().default(''),
})

const channelAccountSchema: z<ChannelAccountSection> = z.object({
  method: z.string().default(''),
  account: z.string().default(''),
  holder: z.string().default(''),
  note: z.string().default(''),
})

const invoiceSubjectSchema: z<InvoiceSubjectSection> = z.object({
  type: z.string().default('enterprise'),
  taxName: z.string().default(''),
  taxNo: z.string().default(''),
  agreement: z.string().default(''),
})

const invoiceMerchantSchema: z<InvoiceMerchantSection> = z.object({
  provider: z.string().default(''),
  merchantNo: z.string().default(''),
  merchantAppSecret: z.string().role('secret').default(''),
  taxName: z.string().default(''),
  taxNo: z.string().default(''),
})

const sysConfigSchema: z<SysConfigSection> = z.object({
  callbackDomain: z.string().default(''),
  appSiteUrl: z.string().default(''),
  baseUrl: z.string().default(''),
})

const priceSchema: z<PriceSection> = z.object({
  product: z.string().default('标准白标包'),
  factoryPrice: z.number().default(0),
  suggestPrice: z.number().default(0),
  xyaiDiscount: z.number().default(0),
  channelPrice: z.number().default(0),
  channelDiscount: z.number().default(0),
  coupon: z.number().default(0),
})

const licenseSchema: z<LicenseSection> = z.object({
  licenses: z.array(z.object({
    id: z.string(),
    expires: z.string().default(''),
    at: z.string().default(''),
    order: z.string().default(''),
  })).default([]),
})

/** Nonce for one gateway request: a random suffix plus the current instant. */
function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36).slice(-6)
}

/**
 * POST one urlencoded form and decode the JSON answer.
 * @param url - absolute gateway endpoint.
 * @param form - business parameters, already signed by the caller.
 * @returns the gateway's decoded answer.
 */
async function postForm(url: string, form: Record<string, string>): Promise<Record<string, string>> {
  const body = Object.entries(form)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body,
  })
  return await response.json() as Record<string, string>
}

/** One created-order answer: the payer URL or QR image plus the gateway's own codes. */
type CreateOrderResult = CommerceEnvelope & { url?: string; url_qrcode?: string; hash?: string }

/**
 * Create one XunHuPay Alipay order.
 * @param section - the merchant section read for this call.
 * @param input - order id, yuan amount, and payer-visible title.
 * @returns the gateway answer carrying the payment URL or QR code.
 */
async function createAlipayOrder(
  section: PaymentSection,
  input: { orderNo: string; amountYuan: string; title: string },
): Promise<CreateOrderResult> {
  const base = (section.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, '')
  const params: Record<string, string> = {
    version: '1.1',
    appid: section.appid ?? '',
    trade_order_id: input.orderNo,
    total_fee: input.amountYuan,
    title: input.title,
    time: String(Math.floor(Date.now() / 1000)),
    notify_url: section.notifyUrl ?? '',
    return_url: section.returnUrl ?? '',
    nonce_str: nonce(),
  }
  params.hash = sign(params, section.appSecret ?? '')
  return await postForm(`${base}/payment/do.html`, params)
}

/** One verified-callback answer: the shared verification result plus the envelope. */
type VerifyResult = CommerceEnvelope & XunhupayNotify

/** One payment-config read: every merchant field except the secret, plus whether a secret is stored. */
type PaymentReadAnswer = CommerceEnvelope & {
  appid: string
  gateway: string
  notifyUrl: string
  returnUrl: string
  appSecretSet: boolean
}

/** One e-invoice merchant read: every field except the secret, plus whether a secret is stored. */
type InvoiceMerchantReadAnswer = CommerceEnvelope & {
  provider: string
  merchantNo: string
  taxName: string
  taxNo: string
  merchantAppSecretSet: boolean
}

/**
 * Read one decoded RPC payload as a field bag.
 * @param payload - the channel-delivered payload.
 * @returns its fields, or none when the payload is not an object.
 */
function fieldsOf(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

/**
 * Read one string field.
 * @param fields - decoded payload fields.
 * @param key - field name.
 * @returns the field value, or undefined when absent or not a string.
 */
function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Collect the present string fields of one section. An empty secret is skipped
 * so a form that does not re-enter it keeps the stored value.
 * @param fields - decoded payload fields.
 * @param keys - section field names to copy.
 * @param secretKeys - field names whose empty value must not overwrite a stored secret.
 * @returns the patch to merge into the section.
 */
function sectionPatch(
  fields: Record<string, unknown>,
  keys: readonly string[],
  secretKeys: readonly string[] = [],
): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const key of keys) {
    const value = stringField(fields, key)
    if (value === undefined) continue
    if (value === '' && secretKeys.includes(key)) continue
    patch[key] = value
  }
  return patch
}

/**
 * Read one finite number field, coercing the numeric strings a form posts.
 * @param fields - decoded payload fields.
 * @param key - field name.
 * @returns the numeric value, or zero when absent or not finite.
 */
function numberField(fields: Record<string, unknown>, key: string): number {
  const value = Number(fields[key])
  return Number.isFinite(value) ? value : 0
}

/**
 * Render one thrown value as an operator-facing message.
 * @param error - the caught value.
 * @returns its message when it is an Error, otherwise its string form.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @returns today's date as the `YYYY-MM-DD` string licenses compare with. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Wrap one endpoint answer as a successful channel result.
 * @param value - the endpoint's business answer.
 * @returns the Connection success result.
 */
function answered(value: unknown): ConnectionRpcResult<unknown> {
  return { ok: true, value }
}

/**
 * Wrap one refusal as a failed channel result.
 * @param code - stable machine code the browser half routes on.
 * @param message - operator-readable reason.
 * @returns the Connection failure result.
 */
function refused(code: string, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}

/**
 * Read one urlencoded POST body into string fields.
 * @param request - the delivered callback request.
 * @returns its decoded form fields.
 */
async function readFormBody(request: IncomingMessage): Promise<Record<string, string>> {
  const decoder = new TextDecoder()
  let body = ''
  for await (const chunk of request) body += decoder.decode(chunk as Uint8Array, { stream: true })
  body += decoder.decode()
  const fields: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(body)) fields[key] = value
  return fields
}

/** One computed price answer. */
type PriceComputeResult = CommerceEnvelope & ReturnType<typeof computePrice>

/** One computed third-party split answer. */
type PluginSplitResult = CommerceEnvelope & ReturnType<typeof computePluginSplit>

/** Host verbs behind {@link COMMERCE_CHANNEL}, each reading its section afresh. */
class CommerceBackend {
  private readonly payment: SettingsScope<PaymentSection>
  private readonly channelAccount: SettingsScope<ChannelAccountSection>
  private readonly invoiceSubject: SettingsScope<InvoiceSubjectSection>
  private readonly invoiceMerchant: SettingsScope<InvoiceMerchantSection>
  private readonly sysConfig: SettingsScope<SysConfigSection>
  private readonly price: SettingsScope<PriceSection>
  private readonly licenses: SettingsScope<LicenseSection>

  /**
   * Register every commerce settings namespace on the plugin's own lifetime.
   * @param ctx - Host plugin context providing the settings service.
   */
  constructor(ctx: Context) {
    this.payment = ctx.settings.register('xyai-payment', paymentSchema)
    this.channelAccount = ctx.settings.register('xyai-channel', channelAccountSchema)
    this.invoiceSubject = ctx.settings.register('xyai-invoice', invoiceSubjectSchema)
    this.invoiceMerchant = ctx.settings.register('xyai-invoice-merchant', invoiceMerchantSchema)
    this.sysConfig = ctx.settings.register('xyai-sys-config', sysConfigSchema)
    this.price = ctx.settings.register('xyai-price', priceSchema)
    this.licenses = ctx.settings.register('xyai-plugin-license', licenseSchema)
  }

  /**
   * Answer one channel call.
   * @param endpoint - channel-relative endpoint the browser half named.
   * @param payload - decoded request payload.
   * @returns the endpoint answer, or a refusal naming the failing endpoint.
   */
  async dispatch(endpoint: string, payload: unknown): Promise<ConnectionRpcResult<unknown>> {
    const fields = fieldsOf(payload)
    try {
      switch (endpoint) {
        case 'pay/create': return answered(await this.payCreate(fields))
        case 'pay/verify': return answered(this.payVerify(fields))
        case 'pay/config/get': return answered(this.paymentRead())
        case 'pay/config/set': return answered(await this.paymentWrite(fields))
        case 'pay/account/get': return answered({ errcode: '0', errmsg: '', ...this.channelAccount.get() })
        case 'pay/account/set': return answered(await this.write(this.channelAccount, sectionPatch(fields, ['method', 'account', 'holder', 'note'])))
        case 'invoice/subject/get': return answered({ errcode: '0', errmsg: '', ...this.invoiceSubject.get() })
        case 'invoice/subject/set': return answered(await this.write(this.invoiceSubject, sectionPatch(fields, ['type', 'taxName', 'taxNo', 'agreement'])))
        case 'invoice/model': return answered(this.invoiceModel())
        case 'invoice/merchant/get': return answered(this.invoiceMerchantRead())
        case 'invoice/merchant/set': return answered(await this.write(this.invoiceMerchant, sectionPatch(fields, ['provider', 'merchantNo', 'merchantAppSecret', 'taxName', 'taxNo'], ['merchantAppSecret'])))
        case 'sys/config/get': return answered({ errcode: '0', errmsg: '', ...this.sysConfig.get() })
        case 'sys/config/set': return answered(await this.write(this.sysConfig, sectionPatch(fields, ['callbackDomain', 'appSiteUrl', 'baseUrl'])))
        case 'stats/get': return answered(await this.statsRead())
        case 'price/save': return answered(await this.priceWrite(fields))
        case 'price/get': return answered({ errcode: '0', errmsg: '', ...this.price.get() })
        case 'price/compute': return answered(this.priceCompute(fields))
        case 'price/plugin-split': return answered(this.pluginSplit(fields))
        case 'plugin/market': return answered(this.market())
        case 'plugin/license/get': return answered({ errcode: '0', errmsg: '', licenses: this.licenseRows() })
        case 'plugin/grant': return answered(await this.grant(stringField(fields, 'id') ?? '', stringField(fields, 'order')))
        // The endpoint set is this package's own protocol, so an unknown name is a caller fault.
        default: return refused('commerce/unknown-endpoint', `unknown commerce endpoint ${JSON.stringify(endpoint)}`)
      }
    } catch (error) {
      return refused('commerce/internal', messageOf(error))
    }
  }

  /**
   * Answer one XunHuPay callback delivery on the public route.
   * @param request - delivered urlencoded POST.
   * @param response - receives the gateway's own success or fail answer.
   */
  async notify(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const fields = await readFormBody(request)
    const result = await handleNotifyHttp(fields, {
      appSecret: this.payment.get().appSecret ?? '',
      onPaid: async (notify) => { await this.settlePaid(notify.orderNo ?? '', notify.orderTitle) },
    })
    response.writeHead(result.status, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(result.body)
  }

  private async payCreate(fields: Record<string, unknown>): Promise<CreateOrderResult> {
    const orderNo = stringField(fields, 'orderNo') ?? ''
    const amountYuan = stringField(fields, 'amountYuan') ?? ''
    const title = stringField(fields, 'title') ?? ''
    if (orderNo === '' || amountYuan === '' || title === '') {
      return { errcode: '400', errmsg: 'missing order params' }
    }
    const section = this.payment.get()
    if ((section.appid ?? '') === '' || (section.appSecret ?? '') === '') {
      return { errcode: '400', errmsg: 'merchant appid/appSecret not configured' }
    }
    return await createAlipayOrder(section, { orderNo, amountYuan, title })
  }

  private payVerify(fields: Record<string, unknown>): VerifyResult {
    const callback: Record<string, string> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') callback[key] = value
    }
    return { errcode: '0', errmsg: '', ...verifyNotify(callback, this.payment.get().appSecret ?? '') }
  }

  private paymentRead(): PaymentReadAnswer {
    const section = this.payment.get()
    return {
      errcode: '0',
      errmsg: '',
      appid: section.appid ?? '',
      gateway: section.gateway ?? DEFAULT_GATEWAY,
      notifyUrl: section.notifyUrl ?? '',
      returnUrl: section.returnUrl ?? '',
      appSecretSet: (section.appSecret ?? '') !== '',
    }
  }

  private async paymentWrite(fields: Record<string, unknown>): Promise<CommerceEnvelope> {
    return await this.write(this.payment, sectionPatch(fields, ['appid', 'appSecret', 'gateway', 'notifyUrl', 'returnUrl'], ['appSecret']))
  }

  private invoiceMerchantRead(): InvoiceMerchantReadAnswer {
    const section = this.invoiceMerchant.get()
    return {
      errcode: '0',
      errmsg: '',
      provider: section.provider ?? '',
      merchantNo: section.merchantNo ?? '',
      taxName: section.taxName ?? '',
      taxNo: section.taxNo ?? '',
      merchantAppSecretSet: (section.merchantAppSecret ?? '') !== '',
    }
  }

  /** Derive the billing model from the channel's invoicing-subject type. */
  private invoiceModel(): CommerceEnvelope & { type: string; model: string; note: string } {
    const type = this.invoiceSubject.get().type ?? 'enterprise'
    return {
      errcode: '0',
      errmsg: '',
      type,
      model: type === 'personal' ? 'agency-commission' : 'batch-resale',
      note: type === 'personal'
        ? '个人渠道：平台给用户开售价发票，个人按佣金结算（个税代扣）。'
        : '企业/个体户渠道：渠道商给用户开售价发票，总部给渠道开出厂价发票，差价=毛利。',
    }
  }

  /** Resolve the HQ stats backend the consoles read. */
  private statsBase(): string {
    const section = this.sysConfig.get()
    for (const candidate of [section.baseUrl, section.appSiteUrl, section.callbackDomain]) {
      if (candidate !== undefined && candidate.trim() !== '') return candidate.trim().replace(/\/+$/, '')
    }
    return DEFAULT_STATS_BASE
  }

  private async statsRead(): Promise<CommerceEnvelope & { data: Record<string, unknown> | null }> {
    try {
      const response = await fetch(`${this.statsBase()}/api/xyai/stats`, { headers: { Accept: 'application/json' } })
      if (!response.ok) return { errcode: String(response.status), errmsg: `stats HTTP ${String(response.status)}`, data: null }
      return { errcode: '0', errmsg: '', data: await response.json() as Record<string, unknown> }
    } catch (error) {
      return { errcode: '500', errmsg: messageOf(error), data: null }
    }
  }

  private async priceWrite(fields: Record<string, unknown>): Promise<CommerceEnvelope> {
    const product = stringField(fields, 'product')
    const patch: PriceSection = {
      ...product === undefined ? {} : { product },
      factoryPrice: numberField(fields, 'factoryPrice'),
      suggestPrice: numberField(fields, 'suggestPrice'),
      xyaiDiscount: numberField(fields, 'xyaiDiscount'),
      channelPrice: numberField(fields, 'channelPrice'),
      channelDiscount: numberField(fields, 'channelDiscount'),
      coupon: numberField(fields, 'coupon'),
    }
    return await this.write(this.price, patch)
  }

  private priceCompute(fields: Record<string, unknown>): PriceComputeResult {
    const config: PriceConfig = {
      product: stringField(fields, 'product') ?? '标准白标包',
      factoryPrice: numberField(fields, 'factoryPrice'),
      suggestPrice: numberField(fields, 'suggestPrice'),
      xyaiDiscount: numberField(fields, 'xyaiDiscount'),
      channelPrice: numberField(fields, 'channelPrice'),
      channelDiscount: numberField(fields, 'channelDiscount'),
      coupon: numberField(fields, 'coupon'),
    }
    const role = stringField(fields, 'role') === 'channel' ? 'channel' : 'xyai-direct'
    return { errcode: '0', errmsg: '', ...computePrice(config, role) }
  }

  private pluginSplit(fields: Record<string, unknown>): PluginSplitResult {
    const feePct = numberField(fields, 'platformFeePct')
    const config: PluginPriceConfig = {
      product: stringField(fields, 'product') ?? '三方插件',
      author: stringField(fields, 'author') === 'xyai' ? 'xyai' : 'developer',
      listPrice: numberField(fields, 'listPrice'),
      platformFeePct: feePct > 0 ? feePct : DEFAULT_PLATFORM_FEE_PCT,
    }
    return { errcode: '0', errmsg: '', ...computePluginSplit(config) }
  }

  private licenseRows(): PluginLicenseRow[] {
    return this.licenses.get().licenses ?? []
  }

  private market(): CommerceEnvelope & { list: unknown[]; licenses: PluginLicenseRow[] } {
    const rows = this.licenseRows()
    const now = today()
    const list = PLUGINS.map((plugin) => {
      const row = rows.find(candidate => candidate.id === plugin.id)
      const expiry = row?.expires ?? ''
      const active = row !== undefined && (expiry === '' || expiry >= now)
      return {
        ...plugin,
        split: plugin.isPaid
          ? computePluginSplit({
            product: plugin.name,
            author: plugin.author,
            listPrice: plugin.listPrice ?? 0,
            platformFeePct: plugin.platformFeePct ?? DEFAULT_PLATFORM_FEE_PCT,
          })
          : null,
        license: active ? row : null,
        state: active ? 'installed' : plugin.isPaid ? 'buy' : 'install',
      }
    })
    return { errcode: '0', errmsg: '', list, licenses: rows }
  }

  /**
   * Grant or extend one plugin license.
   * @param pluginId - the SKU to grant.
   * @param order - paid order id; the same order never extends a license twice.
   * @returns the committed expiry (empty for a perpetual license), or the write refusal.
   */
  private async grant(pluginId: string, order?: string): Promise<CommerceEnvelope & { expires: string }> {
    const plugin = PLUGINS.find(candidate => candidate.id === pluginId)
    if (plugin === undefined) return { errcode: '404', errmsg: 'plugin not found', expires: '' }
    const rows = this.licenseRows()
    const existing = rows.find(candidate => candidate.id === pluginId)
    if (existing !== undefined && order !== undefined && order !== '' && existing.order === order) {
      return { errcode: '0', errmsg: '', expires: existing.expires ?? '' }
    }
    const previousExpiry = existing?.expires ?? ''
    const start = previousExpiry !== '' && previousExpiry >= today()
      ? new Date(`${previousExpiry}T00:00:00`)
      : new Date()
    const expires = plugin.licenseDays > 0
      ? new Date(start.getTime() + plugin.licenseDays * 86_400_000).toISOString().slice(0, 10)
      : ''
    const next: PluginLicenseRow[] = [
      ...rows.filter(candidate => candidate.id !== pluginId),
      { id: pluginId, expires, at: new Date().toISOString(), order: order ?? '' },
    ]
    const committed = await this.write(this.licenses, { licenses: next })
    return committed.errcode === '0' ? { errcode: '0', errmsg: '', expires } : { ...committed, expires: '' }
  }

  /**
   * Settle one paid callback: match the order to a SKU and grant its license.
   * @param orderNo - the paid order id, `PLG-<id>-<ts>` for a market order.
   * @param orderTitle - payer-visible title, the fallback match for a SKU.
   */
  private async settlePaid(orderNo: string, orderTitle: string | undefined): Promise<void> {
    const byOrder = orderNo.startsWith('PLG-')
      ? PLUGINS.find(plugin => orderNo.startsWith(`PLG-${plugin.id}-`))
      : undefined
    const plugin = byOrder ?? PLUGINS.find(candidate => candidate.isPaid && candidate.name === orderTitle)
    // A core-plan order carries no SKU: the website settle path owns it.
    if (plugin === undefined) return
    await this.grant(plugin.id, orderNo)
  }

  private async write<T>(scope: SettingsScope<T>, patch: object): Promise<CommerceEnvelope> {
    try {
      await scope.update(patch)
      return { errcode: '0', errmsg: '' }
    } catch (error) {
      return { errcode: '500', errmsg: messageOf(error) }
    }
  }
}

/** Services this plugin cannot serve without: the RPC carrier and durable config. */
export const inject = ['connection', 'settings']

/**
 * Register the commerce settings namespaces, the Connection RPC channel the
 * browser half calls, and — in a composition that serves HTTP — the public
 * payment-callback route.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  const backend = new CommerceBackend(ctx)
  ctx.effect(
    () => ctx.connection.rpc.handle(COMMERCE_CHANNEL, (endpoint, payload) => backend.dispatch(endpoint, payload)),
    'xyai-commerce: rpc channel',
  )
  ctx.inject(['webServer'], (webServerCtx) => {
    webServerCtx.effect(
      () => webServerCtx.webServer.register({
        kind: 'exact',
        path: PAYMENT_NOTIFY_PATH,
        handler: (request, response) => { void backend.notify(request, response) },
      }),
      'xyai-commerce: payment notify route',
    )
  })
}
