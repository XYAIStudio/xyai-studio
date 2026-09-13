/** Durable tenancy values shared by the Host schema and Client editor. */
export interface Tenancy {
  /** Tenant/org name shown on license pages. */
  tenant: string
  /** Commercial plan key. */
  plan: string
  /** Licensed seat count. */
  seats: number
  /** License key (empty on free deployments). */
  licenseKey: string
  /** License expiry as YYYY-MM-DD; empty means no expiry. */
  expiresAt: string
  /** Comma-separated feature keys this deployment is entitled to. */
  entitlements: string
}
/** Default product tenancy used until Host settings arrive. */
export const defaultTenancy: Tenancy = {
  tenant: 'XYAI',
  plan: 'standard',
  seats: 1,
  licenseKey: '',
  expiresAt: '',
  entitlements: '',
}
/** Accepted plan keys, in display order. */
export const TENANCY_PLANS = ['standard', 'pro', 'enterprise'] as const
/** Tenancy fields in save/reset order. */
export const TENANCY_FIELDS = ['tenant', 'plan', 'seats', 'licenseKey', 'expiresAt', 'entitlements'] as const
/** Longest accepted entitlements text (comma-separated feature keys). */
export const MAX_ENTITLEMENTS_LENGTH = 400
