// @vitest-environment jsdom
import React from 'react'
import type { ComponentType } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import * as commerce from '../src/client/index.ts'

type CallRow = [channel: string, endpoint: string, payload: unknown]
const calls: CallRow[] = []
const contexts: Context[] = []

async function bench() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' } } } as never, () => null)
  const locale = new LocaleRuntime(ctx); locale.setLocale('zh'); ctx.provide('locale', locale)
  ctx.provide('connection', {
    rpc: {
      async call(channel: string, endpoint: string, payload: unknown) {
        calls.push([channel, endpoint, payload])
        return {
          ok: true,
          value: { errcode: '0', errmsg: '', data: { venues: 1, orders: 0, revenue: 0, commissions: 0, commission_total: 0, licenses: [], orders_list: [], commissions_list: [] } },
        }
      },
    },
  })
  const fiber = ctx.plugin({ inject: [...commerce.inject], apply: commerce.apply })
  await fiber.await()
  const entry = slots.entries('conversation.view')[0]!
  const C = entry.component as ComponentType<Record<string, unknown>>
  const face = entry.inject?.() ?? {}
  return { ctx, fiber, slots, locale, element: <C {...face} t={locale.bind('xyaiCommerce')} /> }
}

afterEach(async () => {
  cleanup()
  calls.splice(0)
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

it('renders the HQ console and reads settle stats through connection.rpc.call', async () => {
  const b = await bench()
  render(b.element)
  await waitFor(() => { expect(calls).toContainEqual(['/xyai-commerce', 'stats/get', null]) })
  expect(globalThis).not.toHaveProperty('host')
})
