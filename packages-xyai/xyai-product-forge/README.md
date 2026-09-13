# @xyai/dsh-product-forge

Experimental / opt-in Agent Forge product bundle: one Cordis patch layer that
mounts `@xyai/dsh-agent-forge` over `@deepseek-ai/dsh-web-app`.

## Why a separate product-* layer

Matches `@xyai/dsh-product-online` / `@xyai/dsh-product-collab`: each optional
capability group is a failure-isolated patch bundle rather than a hard-wired
plugin inside `@xyai/dsh-xyai-app`. Agent Forge stays **explicitly gated** -

- `DESKTOP_PROFILE_BUNDLES` (offline desktop) never lists this package.
- Default `profiles/xyai` (full web) also omits it after Phase 4.
- Enable by adding `@xyai/dsh-product-forge` to a profile's
  `dependencies` and `dsh.profile.bundles` (after product-base / collab /
  online as needed).

## Contents

- `xyai-agent-forge` - create/configure agents and teams workbench UI.

Do not mount forge from product-base, product-collab, or product-online.