# Phase 5 - DSH origin/master spike (pin stays dsh-v0.1.5-rc.2)

Status: spike-only (no product mainline merge)
Date: 2026-09-14 (Asia/Shanghai)
Product HEAD: `9163fe29be` on `xyai/v0.4-desktop-base`
Pin: `dsh-v0.1.5-rc.2` = `fb2c4b9e698e30edb738bca4cf0618587db7d203` (2026-09-10 21:50 +0800)
Upstream tip compared: `origin/master` = `c291e7961a515f6d7af9304e7fd1d257929aef26` (2026-09-10 22:17 +0800)
Local tip pointer (optional): `xyai/spike-dsh-master` -> same `c291e7961a` (no checkout, no worktree, not pushed to deepseek)

## Scope / non-goals

- Compare pin vs current `origin/master` for **plugin-relevant** / XYAI-touching surface.
- **Do not** rebase `xyai/v0.4-desktop-base` onto master.
- **Do not** merge master into product mainline.
- **Do not** push anything to `origin` (deepseek-ai/deepseek-harness).

Authoritative delta measured on clean upstream clone `E:\XYAI studio\XYAI-Studio-0.4-upstream` (product clone is shallow around the pin commit parents, so `rev-list` counts there are misleading).

## Delta summary

| Metric | Value |
|--------|-------|
| Commits on `origin/master` not in pin | **139** (~87 non-merge) |
| Commits on pin not in master | **0** (pin is ancestor of master) |
| Merge-base | pin itself (`fb2c4b9e69`) |
| Files touched (all paths) | ~1379 |
| `packages/` churn | ~1003 files, +11956 / -5019 |

Master tip is the release sync PR `#3977` (`release-0.1.5-sync-master`) shortly after the rc.2 cut - i.e. master absorbed parallel trunks that were **not** part of the rc.2 release line, not a new numbered RC.

## Breaking / plugin-relevant changes

### 1. Session APIs - synchronous history readers deprecated (`#3828`)

**Decision note:** `.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md`

Deprecated (JSDoc `@deprecated`; existing callers may remain; **new calls prohibited**):

- `Session.eventAt()`
- `Session.snapshotEvents()`
- `Session.ownEvents()`

Replacement direction: projections + incremental maintenance after resume; on-demand history via **async paged** reads; full-history ops (fork, etc.) need an explicit storage path - not new sync wrappers.

Lint: `typescript/no-deprecated` will flag both old and new call sites; migration of in-tree DSH callers is deferred.

**XYAI impact:** none observed today (see grep below). Future XYAI code must not add these readers.

### 2. Composer / command UI - menu, identities, File action (`#3745`, `#3917`, identity note)

Key notes:

- `2026-09-08-composer-menu-sections-and-localized-rows`
- `2026-09-10-command-identities-and-composer-file-action`
- `2026-09-10-composer-reference-previews`

Surface changes relevant to plugins:

| Area | Change |
|------|--------|
| `CommandContribution` | Optional `label()`, `description()`, `icon`; copy re-read each candidate pass |
| Action kind | Broader than feedback-only; bare invoke runs client callback, submits nothing |
| `CommandClaim` / input state | Adds `name` (catalog command name) beside `token` |
| Composer keyboard | New `bindFilePicker({ available, open })` - Conversation owns File row |
| Host commands | Stable `definitionId` / `CommandDefinitionId` for first-party identity; shadowing does not inherit identity |
| Paperclip | Removed from chrome; File lives in `+` / `/` menu via action contribution |
| Chat owner props | Additive `openSkill(name)` on `ChatNodeOwnerProps` / `ChatViewInjected` (sidebar skill preview) |
| Reference preview | `InputTriggerController.openReference(...)` |

**Slot catalog keys** for `conversation.*` are **unchanged** between pin and master (including `conversation.composer`, `conversation.composer.dock/bar`, `conversation.input.*`, `conversation.view`, `conversation.session.header.*`). No removal of the old top-level `conversation.composer` replace slot in this window - but XYAI already avoids replacing that top-level slot (see below).

**XYAI impact:** `packages-xyai/xyai-composer` injects **additive** slots only (`conversation.input.left/right`, `conversation.composer.dock`, `conversation.input.overlay`). Should remain compatible; verify after any future bump that File/`+` menu behavior does not collide with Cindy/status dock chips. No `commandUi` / `ActionSpec` registrations found in xyai-composer today.

### 3. agentTeams / agents

`packages/experimental/agent-team*` delta pin->master is **tiny** (README i18n + trivial mailbox/roster touches). No API reshape in this window.

Also on master: `feat(web): gate agent preset selection behind a setting (#3870)` - product UI setting, not host API break for `ctx.agentTeams`.

**XYAI impact:** `xyai-ai-employees` uses `ctx.agents` + `ctx.agentTeams` (inject list `['connection','settings','agents','agentTeams']`). **No `ctx.agent` (singular)** usage found. Low risk for a future bump *from this window alone*.

### 4. Plugin manifest types (`#3899`)

`packages/util/package-manifest` reshaped public types:

- Adds `DshPackageManifest` (name/version/description/deps/peers/`engines`/`dsh`).
- Adds `engines.dsh` SemVer range declaration.
- Adds optional `dsh.manifestVersion?: 1`.
- **Removes from exported `DshManifest` surface** (in this tip): `configTrees`, `sessionFormatMigration`, `moduleFallback` (internal/experimental author fields relocated or dropped from the shared types module).

**XYAI impact:** check any XYAI `package.json` `dsh` blocks / tooling that imported removed types before a bump. Declarative `engines.dsh` is additive and desirable for desktop peer validation later.

### 5. Desktop host / packaging (large)

Substantial master work on `apps/desktop/**` and notes:

- Bundled runtime in `extraResources/dsh` + external plugins under `$DSH_HOME/profiles/desktop`
- In-place profile, immediate window before Host start, build/release validation
- Parallel macOS notarization, bundle-speed, startup recovery retry
- Removal of unused plugin classification query

**XYAI impact:** high **integration** risk on any desktop-host rebase (XYAI already layers product-online / packedXyai / desktop pack wiring on the rc.2 desktop tree). This spike does **not** attempt that rebase. Treat desktop host master delta as a dedicated follow-up, not a drive-by.

## packages-xyai deprecated-API grep (product tree @ `9163fe29be`)

Searched under `packages-xyai/**/*.{ts,tsx}`:

| Pattern | Status on product |
|---------|-------------------|
| `Session.events` | **not found** |
| `.snapshotEvents(` / `.ownEvents(` / `.eventAt(` | **not found** |
| `ctx.agent` (singular) | **not found** (uses `ctx.agents` / `ctx.agentTeams`) |
| Top-level `'conversation.composer'` replace | **not found** |
| Additive composer slots (`input.left/right`, `composer.dock`, `input.overlay`) | **in use** (`xyai-composer`, brand-pack tests) |
| `conversation.view` / `session.header.utilities` / `shell.overlay` | **in use** (commerce, ai-employees, agent-forge, dev-shell) |

Conclusion: XYAI packages are **already aligned** with the post-deprecation direction for session readers and agent APIs; composer work is additive-slot based, matching DSH guidance.

## Optional local spike tip

Created local branch ref only (no worktree, no checkout, no push to deepseek):

```text
xyai/spike-dsh-master -> c291e7961a515f6d7af9304e7fd1d257929aef26
```

Use upstream clone or this ref for read-only inspection. Do not merge into `xyai/v0.4-desktop-base`.

## Self-QA / recommendation

### Recommendation: **KEEP pin on `dsh-v0.1.5-rc.2`**

Reasons:

1. Master tip is a **sync of parallel work into master**, not a new official `0.1.5` RC/release cut for consumers.
2. Highest-value breaks (session sync reads) are **policy/deprecation**, not hard removals yet - XYAI has zero call sites.
3. Desktop host packaging on master is a large, separate migration surface that would destabilize current Phase 2-4 desktop work.
4. Composer changes are additive but touch shared chrome (`+` menu, File action ownership); safer to absorb with a named RC and fixture updates.
5. agentTeams delta in this window is negligible - no urgency from AI-employees.

### Tentative follow-ups (when a later official RC lands)

1. Re-run this spike against the new tag; prefer tag-to-tag over floating master.
2. Inventory XYAI for any **new** `snapshotEvents` / `eventAt` / `ownEvents` before merge; keep using projections / `ctx.agents` / `ctx.agentTeams`.
3. Composer: smoke `xyai-composer` dock/left/right against new File/`+` menu; adopt `label`/`icon` on any future `commandUi` contributions; ignore top-level `conversation.composer` replace.
4. Manifest: add `engines.dsh` where useful; confirm no imports of removed package-manifest types.
5. Desktop: plan a **dedicated** host-packaging port (bundled runtime + profile links) - do not fold into a casual master merge.
6. Keep product branch = `xyai/v0.4-desktop-base` until an explicit "bump pin to dsh-vX.Y.Z" phase.

### What was explicitly not done

- No rebase of product onto master
- No merge into `xyai/v0.4-desktop-base` beyond this note (+ tip ref)
- No push to `origin` (deepseek)
- No orphan worktree (product history around pin parents is incomplete; tip ref is enough)
