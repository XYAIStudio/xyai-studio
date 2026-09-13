import React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { PluginPriceResult } from '../pricing.ts'
import { COMMERCE_CHANNEL, type CommerceEnvelope } from '../protocol.ts'
import { en, zh, type XyaiCommerceKey } from './locales.ts'
import { injectXyaiSettingsCss } from './settings-layout.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Commerce copy. */
    xyaiCommerce: XyaiCommerceKey
  }
}

const NS = 'xyaiCommerce'

export const inject = ['slots', 'locale', 'connection']

/** One commerce answer read as an open record: each endpoint adds its own fields. */
type CommerceAnswer = CommerceEnvelope & Record<string, unknown>

/** One payment-answer shape the checkout and market cards render. */
type PayAnswer = CommerceEnvelope & { url?: string; url_qrcode?: string }

/** Call one Host commerce verb over this package's own Connection channel. */
type CommerceCall = <T extends CommerceEnvelope>(endpoint: string, payload?: unknown) => Promise<T>

type Stat = { label: string; value: string | number; accent?: boolean }
type Row = { name: string; kind: string; plan: string; expires: string; revenue: number }

/** One license row of the HQ stats payload. */
type StatsLicense = { order: string; product: string; channel: string; expires: string; status: string }

/** One order row of the HQ stats payload. */
type StatsOrder = {
  transaction_id: string
  title: string
  total_fee: number
  product: string
  channel: string
  status: string
  paid_at: string
}

/** One commission row of the HQ stats payload. */
type StatsCommission = {
  order: string
  channel: string
  type: string
  product: string
  total_fee: number
  factory_price: number
  suggest_price: number
  margin: number
  created_at: string
}

/** Payload of `GET {baseUrl}/api/xyai/stats` (deployed www.cnxy.tech backend). */
type LiveStats = {
  venues: number
  orders: number
  revenue: number
  commissions: number
  commission_total: number
  licenses: StatsLicense[]
  orders_list: StatsOrder[]
  commissions_list: StatsCommission[]
}
type CommissionRow = { order: string; channel: string; product: string; total_fee: number; factory_price: number; margin: number }

/** Read the HQ settle stats the Host fetched from the deployment backend. */
function useLiveStats(call: CommerceCall) {
  const [stats, setStats] = React.useState<LiveStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true); setError('')
      try {
        const res = await call<CommerceEnvelope & { data?: LiveStats | null }>('stats/get')
        if (alive) {
          if (res.errcode === '0' && res.data) setStats(res.data)
          else setError(res.errmsg || '未获取到统计')
        }
      } catch (e) {
        if (alive) setError(String(e))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [call])
  return { stats, loading, error }
}

/** Read one answer field as form text; the price sections answer numbers. */
const str = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

/** Read one Host config answer on mount so a settings card opens prefilled. */
function useConfigAnswer(call: CommerceCall, endpoint: string): CommerceAnswer | null {
  const [answer, setAnswer] = React.useState<CommerceAnswer | null>(null)
  React.useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await call<CommerceAnswer>(endpoint)
        if (alive && res.errcode === '0') setAnswer(res)
      } catch { /* only a transport fault reaches here; the Host answers refusals in-band */ }
    }
    void load()
    return () => { alive = false }
  }, [call, endpoint])
  return answer
}

/** One overview card's display facts. */
type CardProps = {
  title: string
  stats: Stat[]
  rows: Row[]
  cta: string
  emptyHint?: string | undefined
}

function Card({ title, stats, rows, cta, emptyHint }: CardProps) {
  return React.createElement('div', { style: { padding: '8px 0' } },
    React.createElement('h3', null, title),
    React.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' } },
      stats.map(s => React.createElement('div', {
        key: s.label,
        style: { padding: '10px 14px', borderRadius: '12px', background: s.accent ? '#1565c0' : 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)', color: s.accent ? '#fff' : '#0b3a66', minWidth: '120px' },
      },
      React.createElement('div', { style: { fontSize: '11px', opacity: .82 } }, s.label),
      React.createElement('div', { style: { fontSize: '18px', fontWeight: 800 } }, String(s.value)),
      )),
    ),
    React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
      React.createElement('thead', null, React.createElement('tr', null,
        ['名称', '类型', '套餐', '授权到期', '收入/元'].map(h => React.createElement('th', { key: h, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.4)' } }, h)),
      )),
      React.createElement('tbody', null, rows.length
        ? rows.map(r => React.createElement('tr', { key: r.name },
          React.createElement('td', { style: { padding: '6px 8px' } }, r.name),
          React.createElement('td', { style: { padding: '6px 8px' } }, r.kind),
          React.createElement('td', { style: { padding: '6px 8px' } }, r.plan),
          React.createElement('td', { style: { padding: '6px 8px', color: '#c2410c' } }, r.expires),
          React.createElement('td', { style: { padding: '6px 8px' } }, String(r.revenue)),
        ))
        : React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { padding: '10px 8px', opacity: .7 } }, emptyHint || '暂无数据'))),
    ),
    React.createElement('button', { type: 'button', style: { marginTop: '10px', padding: '7px 14px', borderRadius: '999px', border: '0', background: '#1565c0', color: '#fff', fontWeight: 700 } }, cta),
  )
}

const num = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 佣金/差价明细：售价 / 进货(出厂价) / 差价(毛利)。 */
function MoneyTable({ title, rows, emptyHint }: { title: string; rows: CommissionRow[]; emptyHint?: string | undefined }) {
  return React.createElement('div', { style: { padding: '8px 0' } },
    React.createElement('h3', null, title),
    React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
      React.createElement('thead', null, React.createElement('tr', null,
        ['订单', '渠道', '产品', '售价/元', '进货/元', '差价/佣金'].map(h => React.createElement('th', { key: h, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.4)' } }, h)),
      )),
      React.createElement('tbody', null, rows.length
        ? rows.map(r => React.createElement('tr', { key: r.order },
          React.createElement('td', { style: { padding: '6px 8px' } }, r.order),
          React.createElement('td', { style: { padding: '6px 8px' } }, r.channel),
          React.createElement('td', { style: { padding: '6px 8px' } }, r.product),
          React.createElement('td', { style: { padding: '6px 8px' } }, num(r.total_fee)),
          React.createElement('td', { style: { padding: '6px 8px' } }, num(r.factory_price)),
          React.createElement('td', { style: { padding: '6px 8px', color: '#047857', fontWeight: 700 } }, num(r.margin)),
        ))
        : React.createElement('tr', null, React.createElement('td', { colSpan: 6, style: { padding: '10px 8px', opacity: .7 } }, emptyHint || '暂无佣金/差价数据。客户支付成功后自动按「实付−进货价」算出差价归属。'))),
    ),
  )
}

function PaymentConfigPage({ call }: { call: CommerceCall }) {
  const stored = useConfigAnswer(call, 'pay/config/get')
  const [f, setF] = React.useState({ appid: '', appSecret: '', gateway: 'https://api.xunhupay.com', notifyUrl: '', returnUrl: '' })
  const [msg, setMsg] = React.useState('')
  React.useEffect(() => {
    if (stored === null) return
    // The Host never reads appSecret back, so the secret field keeps what the operator typed.
    setF(prev => ({
      ...prev,
      appid: str(stored.appid),
      gateway: str(stored.gateway),
      notifyUrl: str(stored.notifyUrl),
      returnUrl: str(stored.returnUrl),
    }))
  }, [stored])
  const save = async () => {
    try {
      const res = await call('pay/config/set', f)
      setMsg(res.errcode === '0' ? '已保存（超管后台）' : `保存失败：${res.errmsg}`)
    } catch (e) { setMsg('保存失败：' + String(e)) }
  }
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }) }
  const field = (k: string, label: string, type = 'text') => React.createElement('label', { className: 'xyai-settings-field' },
    React.createElement('span', null, label),
    React.createElement('input', { type, value: f[k as keyof typeof f], onChange: (e: React.ChangeEvent<HTMLInputElement>) => { set(k, e.target.value) } }),
  )
  return React.createElement('div', { 'data-xyai-settings': '' },
    React.createElement('h3', null, '支付配置（虎皮椒支付宝 · 超级管理员）'),
    React.createElement('section', { className: 'xyai-settings-card' },
    field('appid', 'AppID / 商户ID'),
    field('appSecret', stored?.appSecretSet === true ? 'AppSecret（已保存 · 留空则不修改）' : 'AppSecret（密钥，存服务端）', 'password'),
    field('gateway', '网关地址'),
    field('notifyUrl', '异步回调地址 notify_url（须外网可达，建议接 XYOS 后端）'),
    field('returnUrl', '支付成功跳转 return_url'),
    ),
    React.createElement('div', { className: 'xyai-settings-actions' },
    React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-primary', onClick: save }, '保存支付配置'),
    ),
    msg ? React.createElement('p', { role: 'status' }, msg) : null,
  )
}

/** One payable checkout plan: its display label and its yuan amount. */
const CHECKOUT_PLANS: [label: string, amount: string][] = [
  ['标准白标包', '19800.00'],
  ['SaaS订阅', '199.00'],
  ['品牌授权服务', '3600.00'],
]

function Checkout({ call }: { call: CommerceCall }) {
  const [plan, setPlan] = React.useState({ label: '标准白标包', amount: '19800.00' })
  const [pay, setPay] = React.useState<{ url?: string; url_qrcode?: string; errcode?: string; errmsg?: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const orderNo = `XYAI${Date.now()}`
  const payNow = async () => {
    setBusy(true); setPay(null)
    try {
      const res = await call<PayAnswer>('pay/create', { orderNo, amountYuan: plan.amount, title: plan.label })
      setPay(res)
    } catch (e) { setPay({ errcode: '500', errmsg: String(e) }) } finally { setBusy(false) }
  }
  return React.createElement('div', { style: { padding: '8px 0' } },
    React.createElement('h3', null, '收银台 · 选择套餐并支付'),
    React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } },
      CHECKOUT_PLANS.map(([label, amount]) => React.createElement('button', {
        key: amount, type: 'button',
        style: { padding: '8px 12px', borderRadius: '999px', border: '1px solid rgba(255,255,255,.36)', background: plan.label === label ? '#1565c0' : 'rgba(255,255,255,.7)', color: plan.label === label ? '#fff' : '#0b3a66', fontWeight: 700 },
        onClick: () => { setPlan({ label, amount }) },
      }, `${label} · ¥${amount}`)),
    ),
    React.createElement('button', { type: 'button', disabled: busy, style: { padding: '9px 18px', borderRadius: '999px', border: '0', background: '#1565c0', color: '#fff', fontWeight: 800 }, onClick: payNow }, busy ? '创建订单中…' : '立即支付（虎皮椒支付宝）'),
    pay ? React.createElement('div', { style: { marginTop: '10px', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)', fontSize: '12px' } },
      pay.errcode && pay.errcode !== '0' ? `支付创建失败：${pay.errmsg}` : null,
      pay.url ? React.createElement('div', null, React.createElement('a', { href: pay.url, target: '_blank', rel: 'noreferrer' }, '打开支付宝支付链接')) : null,
      pay.url_qrcode ? React.createElement('div', null, '支付宝二维码：', React.createElement('img', { src: pay.url_qrcode, style: { width: '120px', height: '120px', marginTop: '6px' } })) : null,
    ) : null,
  )
}

/** One generic settings card: its copy, the fields it edits, and the Host verbs it reads and writes. */
type ConfigPageProps = {
  title: string
  fields: { key: string; label: string; type?: string }[]
  rpc: string
  load: string
  call: CommerceCall
}

function ConfigPage(props: ConfigPageProps) {
  const stored = useConfigAnswer(props.call, props.load)
  const [f, setF] = React.useState<Record<string, string>>({})
  const [msg, setMsg] = React.useState('')
  React.useEffect(() => {
    if (stored === null) return
    // The Host omits every secret from a read, so a blank secret field keeps the stored value.
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stored)) {
      if (key === 'errcode' || key === 'errmsg') continue
      next[key] = str(value)
    }
    setF(next)
  }, [stored])
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }) }
  const save = async () => {
    try {
      const res = await props.call(props.rpc, f)
      setMsg(res.errcode === '0' ? '已保存' : `保存失败：${res.errmsg}`)
    } catch (e) { setMsg('保存失败：' + String(e)) }
  }
  return React.createElement('div', { 'data-xyai-settings': '' },
    React.createElement('h3', null, props.title),
    React.createElement('section', { className: 'xyai-settings-card' },
      props.fields.map(field => React.createElement('label', { key: field.key, className: 'xyai-settings-field' },
        React.createElement('span', null, field.label),
        React.createElement('input', { type: field.type || 'text', value: f[field.key] || '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => { set(field.key, e.target.value) } }),
      )),
    ),
    React.createElement('div', { className: 'xyai-settings-actions' },
      React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-primary', onClick: save }, '保存'),
    ),
    msg ? React.createElement('p', { role: 'status' }, msg) : null,
  )
}

/** One revenue-split answer the plugin pricing card renders. */
type SplitAnswer = CommerceEnvelope & PluginPriceResult

/** 三方付费插件分账：开发者定价 × (1 - 平台抽成) = 开发者分成，平台抽成 = 定价 × 抽成率。 */
function PluginSplitView({ call }: { call: CommerceCall }) {
  const [f, setF] = React.useState({ product: '示例三方插件', author: 'developer', listPrice: '100', platformFeePct: '0.20' })
  const [res, setRes] = React.useState<SplitAnswer | null>(null)
  const [msg, setMsg] = React.useState('')
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }) }
  const field = (k: string, label: string, type = 'text') => React.createElement('label', { key: k, className: 'xyai-settings-field' },
    React.createElement('span', null, label),
    React.createElement('input', { type, value: f[k as keyof typeof f], onChange: (e: React.ChangeEvent<HTMLInputElement>) => { set(k, e.target.value) } }),
  )
  const compute = async () => {
    setMsg('')
    try {
      const r = await call<SplitAnswer>('price/plugin-split', f)
      if (r.errcode !== '0') { setMsg(`计算失败：${r.errmsg}`); return }
      setRes(r)
    } catch (e) { setMsg('计算失败：' + String(e)) }
  }
  return React.createElement('div', { 'data-xyai-settings': '' },
    React.createElement('h3', null, '插件定价与分账（三方开发者 · 平台抽成默认 20%）'),
    React.createElement('section', { className: 'xyai-settings-card' },
    field('product', '插件/产品名'),
    React.createElement('label', { className: 'xyai-settings-field' },
      React.createElement('span', null, '作者归属'),
      React.createElement('select', { value: f.author, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { set('author', e.target.value) } },
        React.createElement('option', { value: 'developer' }, '三方开发者'),
        React.createElement('option', { value: 'xyai' }, 'XYAI 自研'),
      ),
    ),
    field('listPrice', '开发者定价 listPrice（元，用户实付）'),
    field('platformFeePct', '平台抽成率（0~1，默认 0.20；三方插件只走直连，不走渠道）'),
    ),
    React.createElement('div', { className: 'xyai-settings-actions' }, React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-primary', onClick: compute }, '计算分账')),
    res ? React.createElement('section', { className: 'xyai-settings-card' },
      React.createElement('div', null, `开发者分成 ¥${res.developerShare.toFixed(2)}（${Math.round(res.developerRate * 100)}%）`),
      React.createElement('div', null, `平台抽成 ¥${res.platformCut.toFixed(2)}（${Math.round(res.platformRate * 100)}%）`),
      React.createElement('div', { style: { color: '#047857' } }, '说明：三方插件仅走「用户 → 平台代收 → 拆账给开发者」直连，不叠加渠道差价。'),
    ) : null,
    msg ? React.createElement('p', { role: 'alert' }, msg) : null,
  )
}

/** One plugin SKU as the market card renders it. */
type MarketPlugin = {
  id: string
  name: string
  author: 'xyai' | 'developer'
  developer?: string
  isPaid: boolean
  listPrice?: number
  licenseDays: number
  desc: string
  split: PluginPriceResult | null
  license: { expires: string; at: string } | null
  state: 'installed' | 'buy' | 'install'
}

/** 插件市场：浏览 → 付费授权 → 自动授权/激活（原型）。 */
function PluginMarket({ call }: { call: CommerceCall }) {
  const [list, setList] = React.useState<MarketPlugin[]>([])
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState('')
  const [pay, setPay] = React.useState<Record<string, { url?: string; url_qrcode?: string; errcode?: string; errmsg?: string }>>({})
  const [granting, setGranting] = React.useState('')
  const load = async () => {
    setLoading(true)
    try {
      const r = await call<CommerceEnvelope & { list?: unknown[] }>('plugin/market')
      if (r.errcode === '0' && Array.isArray(r.list)) setList(r.list as MarketPlugin[])
    } catch (e) { setMsg('加载插件市场失败：' + String(e)) } finally { setLoading(false) }
  }
  React.useEffect(() => { void load() }, [call])
  const grant = async (id: string) => {
    setGranting(id)
    try {
      const r = await call<CommerceEnvelope & { expires?: string }>('plugin/grant', { id })
      if (r.errcode === '0') { await load(); setMsg(`已授权，到期 ${r.expires || '长期'}`) }
      else setMsg(`授权失败：${r.errmsg}`)
    } catch (e) { setMsg('授权失败：' + String(e)) } finally { setGranting('') }
  }
  const buy = async (p: MarketPlugin) => {
    const orderNo = `PLG-${p.id.replace(/\W+/g, '-')}-${Date.now()}`
    const amountYuan = String(p.split?.listPrice ?? p.listPrice ?? 0)
    try {
      const res = await call<PayAnswer>('pay/create', { orderNo, amountYuan, title: p.name })
      setPay(s => ({ ...s, [p.id]: res }))
    } catch (e) { setPay(s => ({ ...s, [p.id]: { errcode: '500', errmsg: String(e) } })) }
  }
  const card = (p: MarketPlugin) => {
    const paid: boolean = p.isPaid && p.state !== 'installed'
    const payRes = pay[p.id]
    const act = p.state === 'installed'
      ? React.createElement('div', { style: { fontSize: '12px', fontWeight: 700, color: '#047857' } }, `已安装 · 授权到期 ${p.license?.expires || '长期'}`)
      : paid
        ? React.createElement('div', null,
          React.createElement('button', { type: 'button', style: { padding: '7px 14px', borderRadius: '999px', border: '0', background: '#1565c0', color: '#fff', fontWeight: 700 }, onClick: () => buy(p) }, '付费授权'),
          payRes ? React.createElement('div', { style: { marginTop: '6px', fontSize: '11px' } },
            (payRes.errcode && payRes.errcode !== '0') ? `支付创建失败：${payRes.errmsg}` : null,
            payRes.url ? React.createElement('div', null, React.createElement('a', { href: payRes.url, target: '_blank', rel: 'noreferrer' }, '打开支付宝支付链接')) : null,
            React.createElement('button', { type: 'button', disabled: granting === p.id, style: { marginTop: '4px', padding: '5px 10px', borderRadius: '999px', border: '1px dashed #1565c0', background: 'transparent', color: '#1565c0', fontWeight: 700 }, onClick: () => grant(p.id) }, granting === p.id ? '授权中…' : '模拟支付成功(测试授权)'),
            React.createElement('div', { style: { marginTop: '3px', color: '#0b3a66', opacity: .7 } }, '线上支付成功回调会自动授权；测试环境点此直接授权。'),
          ) : null,
        )
        : React.createElement('button', { type: 'button', disabled: granting === p.id, style: { padding: '7px 14px', borderRadius: '999px', border: '1px solid rgba(255,255,255,.36)', background: 'rgba(255,255,255,.7)', color: '#0b3a66', fontWeight: 700 }, onClick: () => grant(p.id) }, granting === p.id ? '安装中…' : '免费安装')
    return React.createElement('div', { key: p.id, style: { padding: '12px 14px', borderRadius: '14px', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)', marginBottom: '10px' } },
      React.createElement('div', { style: { fontWeight: 800, fontSize: '14px' } }, p.name,
        React.createElement('span', { style: { fontSize: '11px', fontWeight: 500, color: '#0b3a66', opacity: .7, marginLeft: '8px', background: 'rgba(255,255,255,.6)', padding: '1px 7px', borderRadius: '999px' } }, p.author === 'xyai' ? 'XYAI 自研' : (p.developer || '三方开发者'))),
      React.createElement('div', { style: { fontSize: '11px', color: '#0b3a66', opacity: .85, margin: '4px 0 6px' } }, p.desc),
      React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('div', { style: { fontSize: '13px', fontWeight: 700 } }, p.isPaid ? (p.split?.listPrice ? `¥${num(p.split.listPrice)}` : '付费') : '免费',
          p.licenseDays > 0 ? React.createElement('span', { style: { fontSize: '11px', color: '#047857', marginLeft: '6px' } }, `授权 ${p.licenseDays} 天`) : null),
        p.split ? React.createElement('span', { style: { fontSize: '11px', color: '#0b3a66', opacity: .8 } }, `开发者拿 ¥${num(p.split.developerShare)}（${Math.round(p.split.developerRate * 100)}%）· 平台抽 ¥${num(p.split.platformCut)}`) : null,
      ),
      React.createElement('div', { style: { marginTop: '8px' } }, act),
    )
  }
  return React.createElement('div', { style: { padding: '8px 0' } },
    React.createElement('h3', null, '插件市场 · 按需付费 / 免费安装（原型）'),
    loading ? React.createElement('div', { style: { fontSize: '12px', color: '#0b3a66' } }, '正在加载插件市场…') : list.map(card),
    msg ? React.createElement('div', { style: { marginTop: '8px', fontSize: '12px', color: '#047857' } }, msg) : null,
    React.createElement('div', { style: { marginTop: '10px', fontSize: '11px', color: '#0b3a66', opacity: .7 } }, '注：这是原型。付费插件 = 一个 SKU，三方开发者平台抽 20% 后开发者得 80%；XYAI 自研插件走渠道。'),
  )
}

/**
 * Register HQ backend, channel workspace, checkout, and the super-admin payment
 * config page. `apply` is the client plugin body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xyai-commerce: dictionary')
  ctx.effect(() => injectXyaiSettingsCss('@xyai/dsh-commerce'), 'xyai-commerce: settings layout css')
  const connection = ctx.get('connection') as ConnectionHandle
  const call: CommerceCall = async <T extends CommerceEnvelope>(endpoint: string, payload?: unknown): Promise<T> => {
    const result = await connection.rpc.call(COMMERCE_CHANNEL, endpoint, payload ?? null)
    // Real wire boundary: the Host validated the payload, so a decoded answer is read as this package's envelope.
    if (!result.ok) return { errcode: result.error.code, errmsg: result.error.message } as T
    return (typeof result.value === 'object' && result.value !== null ? result.value : { errcode: '500', errmsg: '空应答' }) as T
  }
  const face = () => ({ call })
  ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'xyai-commerce-hq', order: 50, locale: NS, inject: face },
    function HqConsole() {
      const { stats, loading, error } = useLiveStats(call)
      if (loading) return React.createElement('div', { style: { padding: '8px 0', fontSize: '12px', color: '#0b3a66' } }, '正在读取总部统计（连接 www.cnxy.tech）…')
      const orders = stats?.orders_list ?? []
      const licenses = stats?.licenses ?? []
      const orderRows: Row[] = orders.map(o => ({
        name: o.channel || '—', kind: '渠道/用户', plan: o.product || o.title || '—', expires: o.paid_at || '—', revenue: o.total_fee,
      }))
      const licRows: Row[] = licenses.map(l => ({
        name: l.channel || '—', kind: '授权', plan: l.product || '—', expires: l.expires, revenue: 0,
      }))
      const label = error ? `未接通后端：${error}` : undefined
      const commissionRows: CommissionRow[] = (stats?.commissions_list ?? []).map(c => ({
        order: c.order, channel: c.channel, product: c.product, total_fee: c.total_fee, factory_price: c.factory_price, margin: c.margin,
      }))
      const overview = Card({
        title: 'XYAI 后台 · 商业化总览（实时数据）',
        stats: [
          { label: '渠道商', value: stats?.venues ?? 0 },
          { label: '订单', value: stats?.orders ?? 0 },
          { label: '总收入(元)', value: stats?.revenue ?? 0, accent: true },
          { label: '佣金合计(元)', value: stats?.commission_total ?? 0, accent: true },
        ],
        rows: [...orderRows, ...licRows],
        cta: '导出报表（待接入）',
        emptyHint: error ? label : orders.length || licenses.length ? undefined : '暂无订单/授权数据。在「系统配置」填好接口基础地址 baseUrl 后即可读取 www.cnxy.tech 的订单、授权与佣金。',
      })
      return React.createElement('div', null,
        overview,
        MoneyTable({ title: '佣金 / 差价明细（售价→进货→差价）', rows: commissionRows }),
      )
    },
  ))
  ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'xyai-commerce-channel', order: 51, locale: NS, inject: face },
    function ChannelConsole({ call }: { call: CommerceCall }) {
      const { stats, loading } = useLiveStats(call)
      const [acct, setAcct] = React.useState({ method: '支付宝', account: '', holder: '', note: '' })
      const [msg, setMsg] = React.useState('')
      const set = (k: string, v: string) => { setAcct({ ...acct, [k]: v }) }
      const saveAcct = async () => {
        try {
          const res = await call('pay/account/set', acct)
          setMsg(res.errcode === '0' ? '收款账户已保存' : `保存失败：${res.errmsg}`)
        } catch (e) { setMsg('保存失败：' + String(e)) }
      }
      const fee = React.createElement('div', { style: { padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)', marginBottom: '10px', fontSize: '12.5px' } },
        React.createElement('b', null, '收费政策（我按出厂价向 XYAI 拿货，零售差价归我）'),
        React.createElement('div', null, '标准白标包 出厂价 ¥19,800 / 套 · 品牌授权 ¥3,600/年 · SaaS ¥199/租户·月'),
      )
      const licRows: Row[] = (stats?.licenses ?? []).map(l => ({
        name: l.channel || '—', kind: '授权', plan: l.product || '—', expires: l.expires, revenue: 0,
      }))
      const commRows: CommissionRow[] = (stats?.commissions_list ?? []).map(c => ({
        order: c.order, channel: c.channel, product: c.product, total_fee: c.total_fee, factory_price: c.factory_price, margin: c.margin,
      }))
      const commission = React.createElement('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '0 0 10px' } },
        [{ k: '我的佣金合计(元)', v: num(stats?.commission_total ?? 0) }, { k: '佣金笔数', v: String(stats?.commissions ?? 0) }, { k: '联网状态', v: loading ? '读取中…' : '在线' }].map(s => React.createElement('div', { key: s.k, style: { padding: '10px 14px', borderRadius: '12px', background: '#1565c0', color: '#fff', border: '1px solid #fff', minWidth: '130px' } },
          React.createElement('div', { style: { fontSize: '11px', opacity: .85 } }, s.k),
          React.createElement('div', { style: { fontSize: '18px', fontWeight: 800 } }, s.v),
        )),
      )
      const acctForm = React.createElement('div', { style: { padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)' } },
        React.createElement('b', null, '收款账户设置（用于收我的提成）'),
        React.createElement('div', { style: { marginTop: '8px' } },
          React.createElement('select', { value: acct.method, style: { width: '100%', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { set('method', e.target.value) } },
            ['支付宝', '微信', '银行卡'].map(m => React.createElement('option', { key: m, value: m }, m)),
          ),
          React.createElement('input', { placeholder: '收款账号', value: acct.account, style: { display: 'block', width: '100%', margin: '6px 0', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { set('account', e.target.value) } }),
          React.createElement('input', { placeholder: '户名', value: acct.holder, style: { display: 'block', width: '100%', margin: '0 0 6px', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { set('holder', e.target.value) } }),
          React.createElement('button', { type: 'button', style: { padding: '7px 14px', borderRadius: '999px', border: '0', background: '#1565c0', color: '#fff', fontWeight: 700 }, onClick: saveAcct }, '保存收款账户'),
          msg ? React.createElement('div', { style: { marginTop: '6px', fontSize: '12px', color: '#047857' } }, msg) : null,
        ),
      )
      const [inv, setInv] = React.useState({ type: 'enterprise', taxName: '', taxNo: '' })
      const [invMsg, setInvMsg] = React.useState('')
      const setInvField = (k: string, v: string) => { setInv({ ...inv, [k]: v }) }
      const saveInv = async () => {
        try {
          const res = await call('invoice/subject/set', inv)
          setInvMsg(res.errcode === '0' ? '开票主体已保存' : `保存失败：${res.errmsg}`)
        } catch (e) { setInvMsg('保存失败：' + String(e)) }
      }
      const invForm = React.createElement('div', { style: { padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.36)' } },
        React.createElement('b', null, '开票主体与税务（兼容 企业 / 个体户 / 个人）'),
        React.createElement('div', { style: { marginTop: '8px' } },
          React.createElement('select', { value: inv.type, style: { width: '100%', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setInvField('type', e.target.value) } },
            [['enterprise', '企业'], ['individual-business', '个体户'], ['personal', '个人']].map(m => React.createElement('option', { key: m[0], value: m[0] }, m[1])),
          ),
          React.createElement('input', { placeholder: '开票名称（公司名/个体户名）', value: inv.taxName, style: { display: 'block', width: '100%', margin: '6px 0', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setInvField('taxName', e.target.value) } }),
          React.createElement('input', { placeholder: '纳税人识别号（统一社会信用代码）', value: inv.taxNo, style: { display: 'block', width: '100%', margin: '0 0 6px', padding: '6px 8px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.36)' }, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setInvField('taxNo', e.target.value) } }),
          React.createElement('div', { style: { fontSize: '11px', color: '#047857', marginBottom: '6px' } },
            inv.type === 'personal' ? '个人渠道：平台给用户开售价发票，你按佣金结算（个税代扣）。' : '企业/个体户渠道：你给用户开售价发票，总部给你开出厂价发票，差价=你的毛利。',
          ),
          React.createElement('button', { type: 'button', style: { padding: '7px 14px', borderRadius: '999px', border: '0', background: '#1565c0', color: '#fff', fontWeight: 700 }, onClick: saveInv }, '保存开票主体'),
          invMsg ? React.createElement('div', { style: { marginTop: '6px', fontSize: '12px', color: '#047857' } }, invMsg) : null,
        ),
      )
      return React.createElement('div', { style: { padding: '8px 0' } },
        React.createElement('h3', null, '渠道工作台 · 我的收费、提成、开票与收款账户'),
        commission, fee,
        MoneyTable({ title: '我的差价 / 佣金明细（售价→进货→差价）', rows: commRows }),
        Card({ title: '我的用户授权到期（便于跟踪维护/促续费）', stats: [], rows: licRows, cta: '提醒续费', emptyHint: '暂无授权数据。客户支付成功后，www.cnxy.tech 会自动记录授权到期时间。' }), acctForm, invForm,
      )
    },
  ))
  ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'xyai-commerce-checkout', order: 52, locale: NS, inject: face },
    function CheckoutView({ call }: { call: CommerceCall }) { return React.createElement(Checkout, { call }) },
  ))
  ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'xyai-commerce-market', order: 60, locale: NS, inject: face },
    function PluginMarketView({ call }: { call: CommerceCall }) { return React.createElement(PluginMarket, { call }) },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-payment', order: 120, locale: NS, label: () => ctx.locale.bind(NS)('commerce.gateway'), inject: face },
    function PaymentConfigView({ call }: { call: CommerceCall }) { return React.createElement(PaymentConfigPage, { call }) },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-invoice', order: 121, locale: NS, label: () => ctx.locale.bind(NS)('commerce.invoice'), inject: face },
    function InvoiceMerchantView({ call }: { call: CommerceCall }) {
      return React.createElement(ConfigPage, {
        title: '电子发票配置（诺诺 / 百望 / 航天云开票 · 超级管理员）',
        call,
        rpc: 'invoice/merchant/set',
        load: 'invoice/merchant/get',
        fields: [
          { key: 'provider', label: '发票服务商（诺诺/百望/航天）' },
          { key: 'merchantNo', label: '开票商户号 / appid' },
          { key: 'merchantAppSecret', label: '开票密钥 appSecret（存服务端）', type: 'password' },
          { key: 'taxName', label: '开票税名（公司/个体户名）' },
          { key: 'taxNo', label: '纳税人识别号（统一社会信用代码）' },
        ],
      })
    },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-sys', order: 122, locale: NS, label: () => ctx.locale.bind(NS)('commerce.sys'), inject: face },
    function SystemConfigView({ call }: { call: CommerceCall }) {
      return React.createElement(ConfigPage, {
        title: '系统 / 授权域名配置（超级管理员）',
        call,
        rpc: 'sys/config/set',
        load: 'sys/config/get',
        fields: [
          { key: 'callbackDomain', label: '异步回调域名（虎皮椒/发票回调可达，建议接 XYOS 后端，如 https://你的域名）' },
          { key: 'appSiteUrl', label: '本站地址 appSiteUrl（用于支付返回/发票展示）' },
          { key: 'baseUrl', label: '接口基础地址 baseUrl' },
        ],
      })
    },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-pricing', order: 123, locale: NS, label: () => ctx.locale.bind(NS)('commerce.pricing'), inject: face },
    function PricingConfigView({ call }: { call: CommerceCall }) {
      return React.createElement(ConfigPage, {
        title: '定价与优惠（超级管理员 · 出厂价/指导价/直销优惠）',
        call,
        rpc: 'price/save',
        load: 'price/get',
        fields: [
          { key: 'product', label: '产品/套餐（如 标准白标包）' },
          { key: 'factoryPrice', label: '出厂价（元，给渠道的成本价）' },
          { key: 'suggestPrice', label: '销售指导价（元，XYAI 直销展示价）' },
          { key: 'xyaiDiscount', label: 'XYAI 直销优惠额（元，须 < 指导价-出厂价，不与渠道争市场）' },
          { key: 'coupon', label: '优惠券金额（元，促销）' },
        ],
      })
    },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-channel-price', order: 124, locale: NS, label: () => ctx.locale.bind(NS)('commerce.channelPrice'), inject: face },
    function ChannelPriceView({ call }: { call: CommerceCall }) {
      return React.createElement(ConfigPage, {
        title: '渠道工作台 · 我的销售价与优惠（代理商自己定）',
        call,
        rpc: 'price/save',
        load: 'price/get',
        fields: [
          { key: 'channelPrice', label: '我的销售价（元，≥ 出厂价）' },
          { key: 'channelDiscount', label: '我的优惠额（元）' },
          { key: 'coupon', label: '我发的优惠券金额（元）' },
        ],
      })
    },
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-commerce-plugin-split', order: 125, locale: NS, label: () => ctx.locale.bind(NS)('commerce.pluginSplit'), inject: face },
    function PluginSplitViewIn({ call }: { call: CommerceCall }) { return React.createElement(PluginSplitView, { call }) },
  ))
}

