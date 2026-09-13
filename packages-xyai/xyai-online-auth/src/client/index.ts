import React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { ONLINE_CHANNEL, type OnlineEnvelope, type OnlineUser } from '../protocol.ts'
import { en, zh, type XyaiOnlineAuthKey } from './locales.ts'
import { injectXyaiSettingsCss } from './settings-layout.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Online-auth copy. */
    xyaiOnlineAuth: XyaiOnlineAuthKey
  }
}

const NS = 'xyaiOnlineAuth'

export const inject = ['slots', 'locale', 'connection']

/** One issued device code the login card renders. */
type DeviceCodeAnswer = OnlineEnvelope & { deviceCode: string; userCode: string; verificationUri: string }

/** One link-state answer the login card opens with. */
type StatusAnswer = OnlineEnvelope & { baseUrl: string; loggedIn: boolean; user: OnlineUser | null }

/** One poll outcome the login card routes on. */
type PollAnswer = OnlineEnvelope & { status: string; user: OnlineUser | null }

/** One revalidated session the login card refreshes its account from. */
type MeAnswer = OnlineEnvelope & { user: OnlineUser | null }

/** Call one Host online-account verb over this package's own Connection channel. */
type OnlineCall = <T extends OnlineEnvelope>(endpoint: string, payload?: unknown) => Promise<T>

/** One step of the device authorization flow the card renders. */
type Stage = 'idle' | 'code' | 'ok' | 'err'

function LoginView({ call }: { call: OnlineCall }) {
  const [stage, setStage] = React.useState<Stage>('idle')
  const [code, setCode] = React.useState<DeviceCodeAnswer | null>(null)
  const [user, setUser] = React.useState<OnlineUser | null>(null)
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await call<StatusAnswer>('status')
        if (alive && res.errcode === '0' && res.loggedIn && res.user !== null) { setUser(res.user); setStage('ok') }
      } catch { /* only a transport fault reaches here; the Host answers refusals in-band */ }
    }
    void load()
    return () => { alive = false }
  }, [call])

  const start = async () => {
    setBusy(true); setMsg('')
    try {
      const res = await call<DeviceCodeAnswer>('device/code')
      if (res.errcode === '0') { setCode(res); setStage('code') } else { setMsg(res.errmsg ?? '获取设备码失败'); setStage('err') }
    } catch (e) { setMsg(String(e)); setStage('err') } finally { setBusy(false) }
  }

  const poll = async () => {
    if (code === null) return
    setBusy(true)
    try {
      const res = await call<PollAnswer>('device/poll', { deviceCode: code.deviceCode })
      if (res.status === 'authorized' && res.user !== null) { setUser(res.user); setStage('ok'); setMsg('') }
      else if (res.status === 'issued') { setMsg('授权已领取，请重新获取设备码。'); setCode(null); setStage('err') }
      else if (res.status === 'denied') { setMsg('网页端已拒绝该设备码。'); setCode(null); setStage('err') }
      else if (res.status === 'expired' || res.status === 'invalid') { setMsg('设备码已失效，请重新获取。'); setCode(null); setStage('err') }
      else setMsg(`等待网页授权… 请打开 ${code.verificationUri} 登录并输入 ${code.userCode}`)
    } catch (e) { setMsg(String(e)); setStage('err') } finally { setBusy(false) }
  }

  const verify = async () => {
    setBusy(true); setMsg('')
    try {
      const res = await call<MeAnswer>('me')
      if (res.errcode === '0' && res.user !== null) { setUser(res.user); setStage('ok'); setMsg('线上会话有效。') }
      else { setUser(null); setCode(null); setStage('idle'); setMsg(res.errmsg ?? '线上会话已失效，请重新登录。') }
    } catch (e) { setMsg(String(e)); setStage('err') } finally { setBusy(false) }
  }

  const logout = async () => {
    try {
      await call('logout')
    } catch { /* the Host token stays authoritative, so a transport fault only resets this card */ }
    setUser(null); setCode(null); setStage('idle'); setMsg('')
  }

  const btn = (label: string, onClick: () => void, primary = false) => React.createElement('button', {
    type: 'button', onClick, disabled: busy,
    className: primary ? 'xyai-settings-btn xyai-settings-btn-primary' : 'xyai-settings-btn xyai-settings-btn-secondary',
  }, label)

  const panel = (color: string, ...children: React.ReactNode[]) => React.createElement('section', {
    className: 'xyai-settings-card', style: { color },
  }, ...children)

  let body: React.ReactNode
  if (stage === 'code' && code !== null) {
    body = React.createElement('div', null,
      panel('var(--dsw-alias-label-primary,#0f172a)',
        React.createElement('div', null, '设备码（在网页输入）：',
          React.createElement('b', { style: { fontSize: '20px', letterSpacing: '2px', color: '#1565c0' } }, code.userCode)),
        React.createElement('div', null, '网页授权地址：',
          React.createElement('a', { href: code.verificationUri, target: '_blank', rel: 'noreferrer' }, '打开授权页')),
        React.createElement('div', { style: { opacity: .8, marginTop: '6px' } }, '在网页登录后输入该设备码；桌面端点下面按钮取令牌。'),
      ),
      React.createElement('div', { className: 'xyai-settings-actions' }, btn('我已在网页授权，取令牌', () => { void poll() }, true),
      btn('重新获取设备码', () => { void start() }),),
    )
  } else if (stage === 'ok' && user !== null) {
    body = React.createElement('div', null,
      panel('var(--dsw-alias-label-primary,#0f172a)',
        React.createElement('b', null, '已登录线上版：', user.name),
        React.createElement('div', null, user.email),
        user.isAdmin ? React.createElement('div', { style: { fontWeight: 700, color: '#c2410c' } }, '超级管理员') : null,
      ),
      React.createElement('div', { className: 'xyai-settings-actions' }, btn('校验线上会话', () => { void verify() }),
      btn('退出登录', () => { void logout() }),),
    )
  } else {
    body = React.createElement('div', null,
      React.createElement('div', { className: 'xyai-settings-actions' }, btn(stage === 'err' ? '重试' : '登录 XYAI 线上版', () => { void start() }, true)),
      React.createElement('div', { style: { fontSize: '12px', color: '#0b3a66', opacity: .75, marginTop: '8px' } },
        '登录后桌面端即与线上账号关联，可同步授权/插件。'),
    )
  }

  return React.createElement('div', { 'data-xyai-settings': '' },
    React.createElement('h3', null, 'XYAI 线上版登录'),
    body,
    msg ? React.createElement('p', { role: stage === 'err' ? 'alert' : 'status' }, msg) : null,
  )
}

/**
 * Register the online-account link settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xyai-online-auth: dictionary')
  ctx.effect(() => injectXyaiSettingsCss('@xyai/dsh-online-auth'), 'xyai-online-auth: settings layout css')
  const connection = ctx.get('connection') as ConnectionHandle
  const call: OnlineCall = async <T extends OnlineEnvelope>(endpoint: string, payload?: unknown): Promise<T> => {
    const result = await connection.rpc.call(ONLINE_CHANNEL, endpoint, payload ?? null)
    // Real wire boundary: the Host owns validation, so a decoded answer is read as this package's envelope.
    if (!result.ok) return { errcode: result.error.code, errmsg: result.error.message } as T
    return (typeof result.value === 'object' && result.value !== null ? result.value : { errcode: '500', errmsg: '空应答' }) as T
  }
  const face = () => ({ call })
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'xyai-online-auth', order: 130, locale: NS, label: () => ctx.locale.bind(NS)('online.auth.title'), inject: face },
    function OnlineAuthView({ call }: { call: OnlineCall }) { return React.createElement(LoginView, { call }) },
  ))
}
