---
description: "XYAI dev-space shell browser workbench navigation over DSH layout and workspace services."
kind: "package-reference"
---

# @xyai/dsh-dev-shell

English | [中文](README.zh.md)

## Summary

The Workbench menu starts a conversation through `uiWorkspace` and opens, closes, or toggles panels through `layout`. A sidebar footer action exposes New conversation even when no session is selected. The package adds navigation only and no model context or tools.

## Table of Contents

- Summary
- Model Experience
- Known Limitations and Deferred Work
- Dev Note

## Model Experience

None, as this package registers browser-side workbench navigation and adds no model context or tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Navigation only** — Electron window management and installation belong to the desktop assembly, not this plugin.
- **No `./invariant`** — slot ownership is observed by the UI-slot registry; this package owns no independently diverging runtime observations.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
