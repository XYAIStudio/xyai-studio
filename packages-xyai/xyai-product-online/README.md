# @xyai/dsh-product-online

Optional online / commercial product bundle: one Cordis patch layer that mounts
cloud-account link, tenancy (license/plan), and commerce (billing/plugins) over
`@deepseek-ai/dsh-web-app`.

- `xyai-online-auth` - device-authorization link to www.cnxyai.cn (settings only;
  login is never required to start the Host or open local AI-employee chats).
- `xyai-tenancy` - tenant / plan / entitlement settings for commercial installs.
- `xyai-commerce` - payment, licensing, and HQ admin surfaces.

Keep this out of `DESKTOP_PROFILE_BUNDLES`. Desktop stays offline-first with
`@xyai/dsh-product-base` + `@xyai/dsh-product-collab` only. The full `xyai`
web profile and optional desktop installs mount this layer when cloud sync,
license, or paid plugins are desired.

Agent Forge is **not** part of this layer - use `@xyai/dsh-product-forge`
(explicit opt-in; omitted from default `profiles/xyai` and desktop).