/** Register the tenancy/license document in the DSH Host settings. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { defaultTenancy, MAX_ENTITLEMENTS_LENGTH, TENANCY_PLANS } from './tenancy.ts'
export const inject = ['settings']
const PLAN = new RegExp(`^(?:${TENANCY_PLANS.join('|')})$`)
const DATE = /^(?:$|\d{4}-\d{2}-\d{2})$/

/** Register validated, durable tenancy fields on the plugin lifetime.
 * Feature gating reads this document from the Host settings store; the
 * browser half edits it as one atomic mutation.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.settings.register('xyai-tenancy', z.object({
    tenant: z.string().min(1).max(120).default(defaultTenancy.tenant),
    plan: z.string().pattern(PLAN).default(defaultTenancy.plan),
    seats: z.natural().min(1).max(100_000).default(defaultTenancy.seats),
    licenseKey: z.string().max(80).default(defaultTenancy.licenseKey),
    expiresAt: z.string().pattern(DATE).default(defaultTenancy.expiresAt),
    entitlements: z.string().max(MAX_ENTITLEMENTS_LENGTH).default(defaultTenancy.entitlements),
  }))
}
