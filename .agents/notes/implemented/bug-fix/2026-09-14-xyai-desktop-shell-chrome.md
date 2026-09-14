# Agent Note: XYAI desktop shell chrome

Status: implemented

English | [中文](2026-09-14-xyai-desktop-shell-chrome.zh.md)

## Problem

XYAI Studio 0.4 desktop cold-starts with the window title already branded, but the renderer shows two overlapping product UIs: official DSH hero copy under the XYAI welcome, a leftover boot ring, a floating 模型广场 chip in the sidebar, and product space tabs that do nothing except 关于我们.

## Decision

Hero layout CSS keys off `[data-xyai-hero-welcome]`: it expands the fish hitbox, hides the adjacent official headline group, and hides leftover `[data-dsh-boot]` only when `[data-slot="root"]` exists. Sidebar footer `action` slots that hold product-nav or the interact list override `display: contents` into a column so 模型广场 cannot sit beside an empty interact block. Space overlays are siblings of the top bar, not children of a zero-height pointer-events-none wrapper. Electron `dsh-app:` windows cannot host remote `https:` iframes, so 业务/生态/浏览器 render an in-shell copyable address; 关于我们 keeps its `srcDoc` document. Model hub and knowledge stay in `@xyai/dsh-product-base` because their Host inject lists do not wait on `webServer`. AI employees stay in `@xyai/dsh-product-collab`; Host `agentTeams` is optional at load so the employee library activates on desktop, while team spawn, mailbox, and task RPC refuse with `AGENT_TEAMS_UNAVAILABLE` when Agent Teams is absent. Each of those three client plugins sets `data-xyai-surface-*` on `<html>`; product nav disables a destination until that attribute appears.

## Alternatives considered

**Hashed CSS-module class selectors.** Rebuilds change `HeroShell.module.css` hashes, so `.pXSMma_headline` and the removed `.pXSMma_headlineText` cannot hide official copy after a DSH UI rebuild.

**Emptying `xyai-collab/cordis.patch.yml` on desktop.** The web XYAI profile still mounts AI employees through that bundle, and composition tests require the insert. Optional `agentTeams` keeps the library alive without deleting the collab layer.

**`shell.openExternal` IPC for remote spaces.** The desktop Electron main process has no such channel yet. A copyable in-shell address is honest without inventing a Host API in this change.

**Forking DSH EmptyHero.** XYAI remains a patch-layer product; data-attribute CSS plus a locale-owned kicker keep the official conversation hero intact for other profiles.

## Consequences

开发空间 keeps DSH new-session, workspace, and composer chrome without a second headline. 关于我们 continues to work offline. 业务/生态/浏览器 are reachable as copyable URLs on desktop and as iframes on ordinary `http(s)` pages. Sidebar destinations degrade to disabled controls instead of stacked dead chips when a plugin is not in the composition. Desktop still does not compose experimental Agent Teams, so collaboration team operations remain unavailable there until a later profile change. Electron still has no `openExternal` path.

## Testing

Brand-pack `hero-layout.spec.ts` pins selector stability. Dev-shell `chrome.spec.ts` and `plugin.client.spec.tsx` cover remote-embed refusal, About `srcDoc`, nav disable/enable, and empty interact compaction. AI-employees `backend.spec.ts` covers library RPC without Agent Teams.
