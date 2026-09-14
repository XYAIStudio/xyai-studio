---
description: "XYAI dev-space shell browser workbench navigation over DSH layout and workspace services."
kind: "package-reference"
---

# @xyai/dsh-dev-shell

English | [中文](README.zh.md)

## Summary

The Workbench menu starts a conversation through `uiWorkspace` and opens, closes, or toggles panels through `layout`. Space tabs switch 开发空间, 业务空间, 生态空间, 浏览器, and 关于我们. Sidebar product navigation opens Model Plaza, Collaboration, and Knowledge Base when those plugins advertise themselves on `<html>`, and disables the control when they have not. The package adds navigation only and no model context or tools.

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

- **Electron remote embeds** — a `dsh-app:` window cannot load remote `https:` iframes. 业务空间, 生态空间, and 浏览器 then show an in-shell copyable address instead of an embed. 关于我们 stays in-process through `srcDoc`.
- **Sidebar destinations follow mounted plugins** — 模型广场, 协作, and 知识库 stay disabled until the owning plugin sets `data-xyai-surface-models`, `data-xyai-surface-employees`, or `data-xyai-surface-knowledge` on `<html>`.
- **Navigation only** — Electron window management, `shell.openExternal`, and installation belong to the desktop assembly, not this plugin.
- **No `./invariant`** — slot ownership is observed by the UI-slot registry; this package owns no independently diverging runtime observations.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
