/** Tenancy editor: edit and persist the deployment's tenancy/license document. */
import React, { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { defaultTenancy, MAX_ENTITLEMENTS_LENGTH, TENANCY_FIELDS, TENANCY_PLANS, type Tenancy } from '../tenancy.ts'
import { en, zh, type XyaiTenancyKey } from './locales.ts'
import { injectXyaiSettingsCss } from './settings-layout.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Tenancy copy. */
    xyaiTenancy: XyaiTenancyKey
  }
}

const NS = 'xyaiTenancy'

export const inject = ['slots', 'locale', 'settingsScope']

const setOps = (tenancy: Tenancy) => TENANCY_FIELDS.map(field => ({ op: 'set' as const, path: [field], value: tenancy[field] }))
const unsetOps = TENANCY_FIELDS.map(field => ({ op: 'unset' as const, path: [field] }))

/**
 * Register the tenancy/license settings page over the Host settings scope.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xyai-tenancy: dictionary')
  ctx.effect(() => injectXyaiSettingsCss('@xyai/dsh-tenancy'), 'xyai-tenancy: settings layout css')
  const scope = ctx.settingsScope.bind<Tenancy>({ namespace: 'xyai-tenancy' })
  const face = () => ({ hooks: { tenancy: scope } })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'xyai-tenancy', label: () => ctx.locale.bind('xyaiTenancy')('tenancy.page'),
    order: 110, locale: NS,
    inject: () => ({
      ...face(),
      save: (tenancy: Tenancy) => scope.mutate(setOps({ ...tenancy, tenant: tenancy.tenant.trim() })),
      reset: () => scope.mutate(unsetOps),
    }),
  }, function TenancyEditor(props) {
    const snapshot = props.useTenancy(s => s)
    const saved = snapshot.value ?? defaultTenancy
    const [draft, setDraft] = useState<Tenancy | null>(null)
    const [result, setResult] = useState<'saved' | 'error' | null>(null)
    const [pending, setPending] = useState(false)
    const t = props.t
    const value = draft ?? saved
    const edit = (field: keyof Tenancy, next: string | number) => {
      setDraft({ ...value, [field]: next as never }); setResult(null)
    }
    const commit = async (reset: boolean) => {
      setPending(true); setResult(null)
      try {
        if (reset) await props.reset()
        else await props.save({ ...value, tenant: value.tenant.trim() })
        setDraft(null); setResult('saved')
      } catch { setResult('error') }
      finally { setPending(false) }
    }
    return React.createElement('form', { 'data-xyai-settings': '', onSubmit: (e: React.FormEvent) => { e.preventDefault(); void commit(false) } },
      React.createElement('h3', null, t('tenancy.page')),
      React.createElement('fieldset', { disabled: pending || !snapshot.writable, style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        React.createElement('section', { className: 'xyai-settings-card' },
          React.createElement('p', { className: 'xyai-settings-card-title' }, t('tenancy.page')),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.tenant')),
          React.createElement('input', { required: true, maxLength: 120, value: value.tenant, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit('tenant', e.target.value) })),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.plan')),
          React.createElement('select', { value: value.plan, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => edit('plan', e.target.value) },
            TENANCY_PLANS.map(plan => React.createElement('option', { key: plan, value: plan }, t(`tenancy.plan.${plan}` as XyaiTenancyKey))))),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.seats')),
          React.createElement('input', { type: 'number', min: 1, max: 100000, value: value.seats, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit('seats', Number(e.target.value) || 1) })),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.licenseKey')),
          React.createElement('input', { maxLength: 80, value: value.licenseKey, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit('licenseKey', e.target.value) })),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.expiresAt')),
          React.createElement('input', { type: 'date', value: value.expiresAt, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit('expiresAt', e.target.value) })),
        React.createElement('label', { className: 'xyai-settings-field' }, React.createElement('span', null, t('tenancy.entitlements')),
          React.createElement('input', { maxLength: MAX_ENTITLEMENTS_LENGTH, placeholder: t('tenancy.entitlementsHint'), value: value.entitlements, onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit('entitlements', e.target.value) })),
        ),
        React.createElement('div', { className: 'xyai-settings-actions' },
          React.createElement('button', { type: 'submit', className: 'xyai-settings-btn xyai-settings-btn-primary', disabled: !value.tenant.trim() }, t('tenancy.save')),
          React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-secondary', onClick: () => { setDraft(null); setResult(null) } }, t('tenancy.cancel')),
          React.createElement('button', { type: 'button', className: 'xyai-settings-btn xyai-settings-btn-secondary', onClick: () => { void commit(true) } }, t('tenancy.reset')),
        ),
      ),
      !snapshot.writable && React.createElement('p', { role: 'status' }, t(snapshot.status === 'loading' ? 'tenancy.loading' : 'tenancy.unavailable')),
      result && React.createElement('p', { role: result === 'error' ? 'alert' : 'status' }, t(result === 'error' ? 'tenancy.error' : 'tenancy.saved')),
    )
  }))
}
