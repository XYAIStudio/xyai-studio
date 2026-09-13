/** Register the brand in the DSH Host settings document. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { defaultBrand, MAX_ICP_LENGTH, MAX_LOGO_DATAURL, MAX_SITES_LENGTH } from './brand.ts'
export const inject = ['settings']
const HEX = /^#[0-9a-fA-F]{6}$/
const HEX_OR_EMPTY = /^(?:$|#[0-9a-fA-F]{6})$/
/** Register validated, durable brand fields on the plugin lifetime.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.settings.register('xyai-brand', z.object({
    name: z.string().min(1).max(80).default(defaultBrand.name),
    initials: z.string().min(1).max(4).default(defaultBrand.initials),
    accent: z.string().pattern(HEX).default(defaultBrand.accent),
    text: z.string().pattern(HEX_OR_EMPTY).default(defaultBrand.text),
    gradientFrom: z.string().pattern(HEX).default(defaultBrand.gradientFrom),
    gradientTo: z.string().pattern(HEX).default(defaultBrand.gradientTo),
    vision: z.string().max(200).default(defaultBrand.vision),
    site: z.string().max(MAX_SITES_LENGTH).default(defaultBrand.site),
    icp: z.string().max(MAX_ICP_LENGTH).default(defaultBrand.icp),
    logo: z.string().pattern(/^(?:$|data:image\/)/).max(MAX_LOGO_DATAURL).default(defaultBrand.logo),
  }))
}
