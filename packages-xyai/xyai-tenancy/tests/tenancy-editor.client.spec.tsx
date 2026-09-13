// @vitest-environment jsdom
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { ComponentType } from 'react'
import * as tenancy from '../src/client/index.ts'
import { defaultTenancy, TENANCY_FIELDS, type Tenancy } from '../src/tenancy.ts'

const contexts: Context[] = []
afterEach(async () => { cleanup(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  const scope = stubSettingsScope<Tenancy>()
  scope.publish({ status: 'ready', value: defaultTenancy, writable: true })
  ctx.provide('settingsScope', { bind: () => scope.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  const dir = await mkdtemp(join(tmpdir(), 'xyai-tenancy-'))
  const path = join(dir, 'cordis.yml'); await writeFile(path, '- name: xyai-subject\n')
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (name !== 'xyai-subject') throw new Error(name)
    return tenancy
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  function component(key: string) {
    const entry = slots.entries(key)[0]!
    const C = entry.component as ComponentType<Record<string, unknown>>
    const face = (entry.inject as (() => Record<string, unknown>) | undefined)?.() ?? {}
    return { C, props: { ...face, t: locale.bind(entry.locale ?? 'xyaiTenancy') } }
  }
  return { ctx, slots, scope, component }
}

it('saves tenant and license edits atomically, keeps failed drafts, resets and unloads cleanly', async () => {
  const b = await bench()
  const { C, props } = b.component('settings.section')
  render(<C {...props} useTenancy={bindSnapshotSelector(b.scope.scope)} />)
  expect((screen.getByLabelText('租户名称') as HTMLInputElement).value).toBe('XYAI')
  fireEvent.change(screen.getByLabelText('租户名称'), { target: { value: '启明智创' } })
  fireEvent.change(screen.getByLabelText('座席数'), { target: { value: '24' } })
  b.scope.mutate.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByText('保存租户'))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('租户名称') as HTMLInputElement).value).toBe('启明智创')
  b.scope.mutate.mockImplementationOnce(async () => { b.scope.publish({ value: { ...defaultTenancy, tenant: '启明智创', seats: 24 } }) })
  fireEvent.click(screen.getByText('保存租户'))
  await screen.findByText('租户信息已保存')
  expect(b.scope.mutate).toHaveBeenLastCalledWith([
    { op: 'set', path: ['tenant'], value: '启明智创' }, { op: 'set', path: ['plan'], value: 'standard' },
    { op: 'set', path: ['seats'], value: 24 }, { op: 'set', path: ['licenseKey'], value: '' },
    { op: 'set', path: ['expiresAt'], value: '' }, { op: 'set', path: ['entitlements'], value: '' },
  ])
  cleanup()
  render(<C {...props} useTenancy={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.click(screen.getByText('恢复默认'))
  await waitFor(() => expect(b.scope.mutate).toHaveBeenLastCalledWith(TENANCY_FIELDS.map(field => ({ op: 'unset', path: [field] }))))
  cleanup(); await b.ctx.fiber.dispose()
  expect(b.slots.entries('settings.section')).toHaveLength(0)
})

it('edits plan, expiry and entitlements through the form controls', async () => {
  const b = await bench()
  const { C, props } = b.component('settings.section')
  render(<C {...props} useTenancy={bindSnapshotSelector(b.scope.scope)} />)
  fireEvent.change(screen.getByLabelText('套餐'), { target: { value: 'pro' } })
  fireEvent.change(screen.getByLabelText('授权到期日'), { target: { value: '2026-12-31' } })
  fireEvent.change(screen.getByLabelText('授权能力'), { target: { value: 'brand,local-models' } })
  b.scope.mutate.mockImplementationOnce(async (ops: unknown) => { b.scope.publish({ value: { ...defaultTenancy, ...Object.fromEntries((ops as { path: string[]; value: unknown }[]).map(op => [op.path[0], op.value])) } }) })
  fireEvent.click(screen.getByText('保存租户'))
  await screen.findByText('租户信息已保存')
  expect(b.scope.mutate).toHaveBeenLastCalledWith(expect.arrayContaining([
    { op: 'set', path: ['plan'], value: 'pro' },
    { op: 'set', path: ['expiresAt'], value: '2026-12-31' },
    { op: 'set', path: ['entitlements'], value: 'brand,local-models' },
  ]))
})
