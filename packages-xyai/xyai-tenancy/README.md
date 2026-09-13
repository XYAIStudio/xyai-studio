---
description: "XYAI tenancy browser settings page for tenant, plan, seats, and entitlements over a per-tenant Host settings namespace."
kind: "package-reference"
---

# @xyai/dsh-tenancy

English | [中文](README.zh.md)

## Summary

The Host registers the validated `xyai-tenancy` settings namespace — tenant, plan, seats, license key, expiry date, and comma-separated entitlements — and the browser half renders the Tenancy & License settings page over that scope: one atomic mutation per save, writable gating, and reset to defaults. Feature gates read the document from the Host settings store; the browser half adds no model context or tools.

## Table of Contents

- Summary
- Model Experience
- Known Limitations and Deferred Work
- Dev Note

## Model Experience

None, as this package registers a browser-side settings page and adds no model context or tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Single-deployment document** — the values describe the current deployment's tenant and license; tenant isolation and server-side license validation belong to the commercial infrastructure phase.
- **No `./invariant`** — slot registration is observed by the UI-slot registry, so the package owns no independently diverging runtime relationship.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
