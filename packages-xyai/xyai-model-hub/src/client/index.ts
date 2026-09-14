/** Model-hub client: settings editor + full Model Plaza conversation.view. */
import React, { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { catalogEntries, defaultModelHub, MAX_CATALOG_LENGTH, MODEL_HUB_FIELDS, MODEL_PREFERENCES, type ModelHub } from '../models.ts'
import { MODEL_HUB_CHANNEL, type ModelHubEnvelope } from '../protocol.ts'
import { en, zh, type XyaiModelHubKey } from './locales.ts'
import { ModelPlaza, type PlazaCall } from './plaza.ts'
import { injectXyaiSettingsCss } from './settings-layout.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model-hub copy. */
    xyaiModelHub: XyaiModelHubKey
  }
}

const NS = 'xyaiModelHub'

export const inject = ['slots', 'locale', 'settingsScope', 'connection']

const setOps = (hub: ModelHub) => MODEL_HUB_FIELDS.map(field => ({ op: 'set' as const, path: [field], value: hub[field] }))
const unsetOps = MODEL_HUB_FIELDS.map(field => ({ op: 'unset' as const, path: [field] }))

/**
 * Register settings catalog, Model Plaza conversation.view, and shell.overlay plaza.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xyai-model-hub: dictionary')
  ctx.effect(() => injectXyaiSettingsCss('@xyai/dsh-model-hub'), 'xyai-model-hub: settings layout css')

  const scope = ctx.settingsScope.bind<ModelHub>({ namespace: 'xyai-model-hub' })
  const connection = ctx.get('connection') as ConnectionHandle
  const call: PlazaCall = async <T extends ModelHubEnvelope>(endpoint: string, payload?: unknown): Promise<T> => {
    const result = await connection.rpc.call(MODEL_HUB_CHANNEL, endpoint, payload ?? null)
    if (!result.ok) return { errcode: result.error.code, errmsg: result.error.message } as T
    return (typeof result.value === 'object' && result.value !== null
      ? result.value
      : { errcode: '500', errmsg: 'empty response' }) as T
  }

  const settingsFace = () => ({ hooks: { modelHub: scope } })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'xyai-model-hub', label: () => ctx.locale.bind(NS)('hub.page'),
    order: 120, locale: NS,
    inject: () => ({
      ...settingsFace(),
      save: (hub: ModelHub) => scope.mutate(setOps(hub)),
      reset: () => scope.mutate(unsetOps),
    }),
  }, function ModelHubEditor(props) {
    const snapshot = props.useModelHub(s => s)
    const saved = snapshot.value ?? defaultModelHub
    const [draft, setDraft] = useState<ModelHub | null>(null)
    const [result, setResult] = useState<'saved' | 'error' | null>(null)
    const [pending, setPending] = useState(false)
    const t = props.t
    const value = draft ?? saved
    const edit = (field: keyof ModelHub, next: string) => {
      setDraft({ ...value, [field]: next }); setResult(null)
    }
    const commit = async (reset: boolean) => {
      setPending(true); setResult(null)
      try {
        if (reset) await props.reset()
        else await props.save(value)
        setDraft(null); setResult('saved')
      } catch { setResult('error') }
      finally { setPending(false) }
    }
    return React.createElement('form', { 'data-xyai-settings': '', onSubmit: (e: React.FormEvent) => { e.preventDefault(); void commit(false) } },
      React.createElement('h3', null, t('hub.page')),
      React.createElement('fieldset', { disabled: pending || !snapshot.writable, style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        React.createElement('section', { className: 'xyai-settings-card' },
          React.createElement('p', { className: 'xyai-settings-card-title' }, t('hub.page')),
          React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('hub.preference')),
            React.createElement('select', { value: value.preference, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => edit('preference', e.target.value) },
              MODEL_PREFERENCES.map(preference => React.createElement('option', { key: preference, value: preference }, t(`hub.preference.${preference}` as XyaiModelHubKey)))),
            React.createElement('small', null, t('hub.preferenceHint'))),
          React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('hub.catalog')),
            React.createElement('textarea', { rows: 6, maxLength: MAX_CATALOG_LENGTH, placeholder: t('hub.catalogHint'), value: value.catalog, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => edit('catalog', e.target.value) })),
          React.createElement('div', { className: 'xyai-settings-preview', 'aria-label': t('hub.preview') },
            catalogEntries(value.catalog).map(entry => React.createElement('small', { key: `${entry.name}|${entry.provider}|${entry.endpoint}` },
              `${entry.name} — ${entry.provider}${entry.endpoint ? ` · ${entry.endpoint}` : ''}`))),
        ),
        React.createElement('div', { className: 'xyai-settings-actions' },
          React.createElement('button', { type: 'submit', className: 'xyai-settings-btn xyai-settings-btn-primary' }, t('hub.save')),
          React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-secondary', onClick: () => { setDraft(null); setResult(null) } }, t('hub.cancel')),
          React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-secondary', onClick: () => { void commit(true) } }, t('hub.reset')),
        ),
      ),
      !snapshot.writable && React.createElement('p', { role: 'status' }, t(snapshot.status === 'loading' ? 'hub.loading' : 'hub.unavailable')),
      result && React.createElement('p', { role: result === 'error' ? 'alert' : 'status' }, t(result === 'error' ? 'hub.error' : 'hub.saved')),
    )
  }))


  // Fullscreen Model Plaza via shell.overlay — primary surface for sidebar「模型广场」.
  // Conversation.view remains registered for tab/header bridges; overlay listens for CustomEvents.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'xyai-model-plaza-overlay',
    order: 40,
    locale: NS,
    inject: () => ({ call, hooks: { modelHub: scope } }),
  }, function PlazaOverlay(props) {
    const [open, setOpen] = useState(false)
    useEffect(() => {
      if (typeof window === 'undefined') return
      const onOpen = () => setOpen(true)
      const onClose = () => setOpen(false)
      window.addEventListener('xyai:open-model-plaza', onOpen as EventListener)
      window.addEventListener('xyai:close-model-plaza', onClose as EventListener)
      return () => {
        window.removeEventListener('xyai:open-model-plaza', onOpen as EventListener)
        window.removeEventListener('xyai:close-model-plaza', onClose as EventListener)
      }
    }, [])
    const snapshot = props.useModelHub(s => s)
    const hub = (snapshot.value ?? defaultModelHub) as ModelHub
    if (!open) return null
    const close = () => {
      setOpen(false)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('xyai:close-model-plaza'))
      }
    }
    return React.createElement('div', {
      'data-xyai-model-plaza': '',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': props.t('plaza.title'),
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: '48px 24px 24px',
        background: 'var(--dsw-alias-bg-base, #f8fafc)',
        color: 'var(--dsw-alias-label-primary, #0f172a)',
      },
    },
      React.createElement('button', {
        type: 'button',
        onClick: close,
        'aria-label': props.t('plaza.close'),
        style: {
          position: 'fixed', top: 12, right: 16, zIndex: 81,
          appearance: 'none',
          border: '1px solid rgba(15,23,42,.16)',
          background: 'rgba(255,255,255,.92)',
          borderRadius: 999,
          padding: '6px 14px',
          cursor: 'pointer',
          font: 'inherit',
        },
      }, props.t('plaza.close')),
      React.createElement(ModelPlaza, { call: props.call as PlazaCall, t: props.t, hub }),
    )
  }))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'xyai-model-plaza',
    order: 40,
    locale: NS,
    label: () => ctx.locale.bind(NS)('plaza.title'),
    inject: () => ({ call, hooks: { modelHub: scope } }),
  }, function PlazaView(props) {
    const snapshot = props.useModelHub(s => s)
    const hub = (snapshot.value ?? defaultModelHub) as ModelHub
    return React.createElement(ModelPlaza, { call: props.call as PlazaCall, t: props.t, hub })
  }))

  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    document.documentElement.setAttribute('data-xyai-surface-models', '')
    return () => document.documentElement.removeAttribute('data-xyai-surface-models')
  }, 'xyai-model-hub: surface flag')
}
