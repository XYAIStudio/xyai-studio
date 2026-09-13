# Phase 6 — Desktop brand/install contracts + release QA matrix

Status: **docs + contract audit complete** (installer notarizing/signing and live cold-start QA are out of scope for this phase)
Date: 2026-09-14 (Asia/Shanghai)
Branch: `xyai/v0.4-desktop-base`
Product HEAD at audit: `1dcefce161`; Phase 6 docs land in the following commit
Pin: **`dsh-v0.1.5-rc.2`** = `fb2c4b9e698e30edb738bca4cf0618587db7d203`
Narrative: **XYAI Studio = official DSH Desktop + XYAI plugin assembly**, not a competing DSH desktop fork.

## 1. Packaging audit (apps/desktop)

### 1.1 Release identity / electron-builder

| Contract | Location | Observed value / rule |
|----------|----------|------------------------|
| App id env | desktop-release-environment.mjs | **DSH_DESKTOP_APP_ID** (required, reverse-DNS) |
| App id wiring | electron-builder.config.mjs | resolveDesktopAppId(env); fails if unset |
| Product display name | electron-builder.config.mjs | productName: XYAI Studio |
| Artifact name | same | xyai-studio-${version}-${os}-${arch}.${ext} |
| Package version | apps/desktop/package.json | 0.1.5-rc.2 |
| Package name | same | @deepseek-ai/dsh-desktop |

Recommended app id at pack time: com.xyaistudio.desktop
Do not invent a parallel Electron host.

### 1.2 Brand-pack wiring

| Layer | Package | Role |
|-------|---------|------|
| Brand engine | @xyai/dsh-brand-pack | Name/logo/colors/copy + theme/slots |
| Base product | @xyai/dsh-product-base | brand-pack + composer + dev-shell + model-hub + knowledge |
| Collab product | @xyai/dsh-product-collab | ai-employees after base |

product-base keeps commerce/auth/tenancy and Agent Forge out of the base bundle.

### 1.3 Package-set / pack roots (default desktop)

| Script | Constant | Roots |
|--------|----------|-------|
| pack-xyai-set.mjs | XYAI_ROOT_PACKAGES | product-base + product-collab |
| prepare-package-set.ts | XYAI_ROOT_PACKAGES | same + dsh + Desktop Host |
| project-manager.ts | DESKTOP_PROFILE_BUNDLES | dsh-base, dsh-web-app, product-base, product-collab |

Not in default desktop: product-online, product-forge.
Commands: pack:xyai; prepare:packages; package:desktop:win:x64.

### 1.4 Audit verdict

- Contracts already anchored on official DSH Desktop (P0-P4).
- Phase 6: no Host rewrite needed.
- Doc gap closed: QA matrix + README assembly note + honest profile draft.

## 2. Release QA checklist (matrix)

Mark results only from real runs. Never invent PASS.

### 2.1 Pin / identity

| # | Check | Expected | Result |
|---|-------|----------|--------|
| I1 | DSH pin | dsh-v0.1.5-rc.2 / fb2c4b9e69 | PINNED |
| I2 | Desktop package version | 0.1.5-rc.2 | OK |
| I3 | App id env at pack | reverse-DNS e.g. com.xyaistudio.desktop | PENDING |
| I4 | productName | XYAI Studio | OK |
| I5 | No deepseek origin push / no xyai main | policy | OK |

### 2.2 Cold start offline six-pack

Six-pack = brand-pack + dev-shell + composer + model-hub + knowledge + ai-employees.

| # | Check | Expected | Result |
|---|-------|----------|--------|
| C1 | Packaged/dir cold start offline | Window opens; seed reconcile offline | NOT RUN |
| C2 | Profile bundles prefix | DESKTOP_PROFILE_BUNDLES order | CONTRACT OK; runtime NOT RUN |
| C3 | Brand surfaces | Sidebar/hero brand-pack slots | NOT RUN |
| C4 | Dev shell | Workbench navigation | NOT RUN |
| C5 | Composer | Additive Cindy/status dock | NOT RUN |
| C6 | Model hub | Model Plaza offline inspect | NOT RUN |
| C7 | Knowledge | Mount/parse offline | NOT RUN |
| C8 | AI employees | Collab mounts; base isolation | NOT RUN |

### 2.3 Feature smoke

| # | Area | Check | Result |
|---|------|-------|--------|
| F1 | AI employee DM | Open DM; send/receive | NOT RUN |
| F2 | AI employee group | Agent-team / group path | NOT RUN |
| F3 | Cindy composer dock | Additive slots only | CONTRACT OK; UI NOT RUN |
| F4 | Model hub | GGUF/Ollama paths | NOT RUN |
| F5 | Knowledge mount | Mount folder; knowledge_search | NOT RUN |

### 2.4 Default desktop exclusions

| # | Surface | Default desktop? | Result |
|---|---------|------------------|--------|
| X1 | online-auth | No (product-online only) | CONTRACT OK |
| X2 | commerce | No | CONTRACT OK |
| X3 | tenancy | No | CONTRACT OK |
| X4 | agent-forge / product-forge | No (opt-in) | CONTRACT OK |
| X5 | Forge UI entry absent by default | Absent unless forge installed | NOT RUN (UI) |

### 2.5 Signing / notarization

| # | Check | Result |
|---|-------|--------|
| S1 | macOS Developer ID + notarize | OUT OF SCOPE |
| S2 | Windows EV SignTool | OUT OF SCOPE |

## 3. Self-QA (this phase)

| Check | Result |
|-------|--------|
| XYAI_ROOT_PACKAGES match pack-xyai-set + prepare-package-set | PASS |
| DESKTOP_PROFILE_BUNDLES has product-base + product-collab (+ DSH base/web-app) | PASS |
| product-online / product-forge not in those roots | PASS |
| App-id env required by release helper | PASS |
| productName / artifactName XYAI-branded | PASS |
| Live installer / cold-start / UI smokes | NOT RUN |
| Fabricated PASS in profile | None |

## 4. Follow-ups

1. Run packaged win-x64 with app-id com.xyaistudio.desktop; fill section 2 from a real machine.
2. Optional push of xyai/v0.4-desktop-base to remote xyai (never origin/deepseek; never xyai/main).
3. Keep pin on dsh-v0.1.5-rc.2 until a named later RC.
4. Do not enable forge or online layers on default desktop without an explicit product decision.

## 5. Related docs

- docs/xyai/P5-DSH-MASTER-SPIKE.md
- docs/xyai/ROADMAP-STATUS.md
- packages-xyai/xyai-base/README.md and xyai-collab/README.md
- apps/desktop/README.md (XYAI assembly note)
- build/profiles/0.4.0-20260914-r1.json (draft; incomplete QA)
