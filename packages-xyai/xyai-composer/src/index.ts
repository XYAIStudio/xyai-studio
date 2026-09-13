/**
 * @xyai/dsh-composer Host plugin.
 *
 * Registers the durable quick-phrase schema consumed by the additive browser
 * controls. DSH continues to own session execution and composer state.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
export const inject = ['settings']
/** Register the validated quick-phrase namespace on the plugin lifetime.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.settings.register('xyai-composer', z.object({
    snippets: z.array(z.object({
      label: z.string().min(1).max(40),
      text: z.string().min(1).max(2000),
    })).max(50).default([]),
    mode: z.string().default('standard'),
    think: z.string().default('medium'),
    kb: z.string().default('off'),
    workspace: z.string().max(1024).default(''),
  }))
}
