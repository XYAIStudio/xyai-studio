// @vitest-environment jsdom
import React from 'react'
import type { ComponentType } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import * as onlineAuth from '../src/client/index.ts'

type CallRow = [channel: string, endpoint: string, payload: unknown]
const calls: CallRow[] = []
const contexts: Context[] = []

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  ctx.provide('connection', {
    rpc: {
      async call(channel: string, endpoint: string, payload: unknown) {
        calls.push([channel, endpoint, payload])
        return { ok: true, value: { errcode: '0', errmsg: '', baseUrl: 'https://www.cnxyai.cn', loggedIn: false, user: null } }
      },
    },
  })
  const fiber = ctx.plugin({ inject: [...onlineAuth.inject], apply: onlineAuth.apply })
  await fiber.await()
  const entry = slots.entries('settings.section')[0]!
  const C = entry.component as ComponentType<Record<string, unknown>>
  const face = entry.inject?.() ?? {}
  return { ctx, fiber, slots, locale, element: <C {...face} t={locale.bind('xyaiOnlineAuth')} /> }
}

afterEach(async () => {
  cleanup()
  calls.splice(0)
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

it('opens with status and exchanges the device code through connection.rpc.call', async () => {
  const b = await bench()
  render(b.element)
  await waitFor(() => { expect(calls).toContainEqual(['/xyai-online', 'status', null]) })
  fireEvent.click(screen.getByText('登录 XYAI 线上版'))
  await waitFor(() => { expect(calls).toContainEqual(['/xyai-online', 'device/code', null]) })
  expect(globalThis).not.toHaveProperty('host')
})
