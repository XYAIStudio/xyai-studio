/**
 * @xyai/dsh-model-hub — Host half.
 *
 * Registers the validated `xyai-model-hub` settings namespace and the
 * Connection RPC channel backed by ModelHubBackend: real OS inspect, GGUF
 * scan, HTTP download with verification, Ollama pull, and measured TTFT.
 * Missing runtimes stay unavailable.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { ModelHubBackend } from './host-backend.ts'
import { defaultModelHub, MAX_CATALOG_LENGTH, MODEL_PREFERENCES } from './models.ts'
import { MODEL_HUB_CHANNEL } from './protocol.ts'

export const inject = ['connection', 'settings']

const PREFERENCE = new RegExp(`^(?:${MODEL_PREFERENCES.join('|')})$`)

/**
 * Register durable model-hub settings and the Wave-1 RPC channel.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register('xyai-model-hub', z.object({
    preference: z.string().pattern(PREFERENCE).default(defaultModelHub.preference),
    catalog: z.string().max(MAX_CATALOG_LENGTH).default(defaultModelHub.catalog),
    registryJson: z.string().max(200_000).default('[]'),
    defaultModelId: z.string().max(200).default(''),
    cloudConfiguredJson: z.string().max(8_000).default('{}'),
    cloudSecretsJson: z.string().role('secret').max(40_000).default('{}'),
    autoCheck: z.boolean().default(true),
    scanRoots: z.string().max(8_000).default(''),
  }))
  const backend = new ModelHubBackend(scope)
  ctx.effect(() => {
    const disposeRpc = ctx.connection.rpc.handle(
      MODEL_HUB_CHANNEL,
      (endpoint, payload) => backend.dispatch(endpoint, payload),
    )
    return () => {
      backend.dispose()
      disposeRpc()
    }
  }, 'xyai-model-hub: rpc channel')
}
