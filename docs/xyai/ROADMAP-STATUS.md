# ROADMAP-STATUS — XYAI Studio v0.4 autonomous P0–P6

Date: 2026-09-14 (Asia/Shanghai)
Branch: `xyai/v0.4-desktop-base`
Pin: **`dsh-v0.1.5-rc.2`** (`fb2c4b9e698e30edb738bca4cf0618587db7d203`)
Narrative: XYAI Studio is **DSH Desktop + XYAI plugin assembly**, not a fork of the DSH desktop host.

## Track status

| Phase | Title | Outcome | Key commit(s) |
|-------|-------|---------|----------------|
| P0 | Hygiene / product-base + desktop pack wiring | **DONE** — product-base, pack:xyai, prepare-package-set roots, profile bundles | `5a0a925f5e`, `e8235b6028` |
| P1 | product-collab (AI employees) | **DONE** — collab layer separate from base | `a853fee897` |
| P2 | Desktop six-pack polish | **DONE** — composer, shell, hub, knowledge | `a80ceec347` |
| P3 | Offline desktop / product-online split | **DONE** — auth/commerce/tenancy behind product-online | `4fa4de370a` |
| P4 | Agent Forge opt-in | **DONE** — forge behind product-forge only | `9163fe29be` |
| P5 | DSH origin/master spike | **DONE (spike-only)** — keep pin rc.2; no mainline merge | `1dcefce161` |
| P6 | Brand/install contracts + release QA matrix | **DONE (docs/contracts)** — audit + QA checklist + profile draft; live installer QA not executed | this commit |

**Autonomous P0–P6 track: COMPLETE** (except optional remote push backlog to `xyai`).

## Default desktop composition (six-pack)

Mounted via DESKTOP_PROFILE_BUNDLES:

1. @deepseek-ai/dsh-base
2. @deepseek-ai/dsh-web-app
3. @xyai/dsh-product-base → brand-pack, dev-shell, composer, model-hub, knowledge
4. @xyai/dsh-product-collab → ai-employees

Explicitly not default: product-online (auth/tenancy/commerce), product-forge (Agent Forge).

## Policy reminders

- NEVER push origin / deepseek-ai/deepseek-harness from this product track.
- NEVER touch xyai/main.
- Optional: push xyai/v0.4-desktop-base to remote xyai; kill if hang >2 min.
- Do not notarize/sign production installers in this track unless separately staffed.

## Open backlog (post-track)

1. Real win-x64 packaged cold-start + fill P6 QA matrix from machine results.
2. Optional xyai remote push of this branch.
3. Future pin bump only against a named DSH RC.
4. Phase 5 master merge remains out of scope until an explicit bump phase.
