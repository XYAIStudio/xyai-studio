/** Host provider for durable, governed agent-customization drafts. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { FORGE_CHANNEL } from './protocol.ts'
import { ForgeStore } from './store.ts'
export const inject = ['connection', 'settings', 'tools']
const schema = z.object({ draftsJson: z.string().max(2_000_000).default('[]') })
/** Register the customization production-line RPC service. */
export function apply(ctx: Context): void {
  const store = new ForgeStore(ctx.settings.register('xyai-agent-forge', schema))
  ctx.effect(() => ctx.connection.rpc.handle(FORGE_CHANNEL, async (endpoint, payload) => {
    try {
      const id = typeof payload === 'object' && payload !== null ? String((payload as { id?: unknown }).id ?? '') : ''
      switch (endpoint) {
        case 'snapshot': return { ok: true, value: { ok: true, value: store.snapshot() } }
        case 'resources/capabilities': return { ok: true, value: { ok: true, value: ctx.tools.schemas().map(tool => ({ id: tool.name, name: tool.name, version: 'live-registry', kind: 'capability', status: 'ready' })) } }
        case 'drafts/save': return { ok: true, value: { ok: true, value: await store.save(payload) } }
        case 'drafts/preflight': return { ok: true, value: { ok: true, value: await store.preflight(id) } }
        case 'release/checklist': return { ok: true, value: { ok: true, value: store.checklist(id) } }
        default: return { ok: true, value: { ok: false, error: { code: 'agent-forge/unknown-operation', message: '未知智能体定制操作' } } }
      }
    } catch (error) {
      return { ok: true, value: { ok: false, error: { code: 'agent-forge/rejected', message: error instanceof Error ? error.message : String(error) } } }
    }
  }), 'xyai-agent-forge: durable customization rpc')
}

