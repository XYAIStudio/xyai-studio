---
description: "XYAI Agent Forge browser entry that surfaces agent and team creation through DSH agentLoop and agentTeams host services."
kind: "package-reference"
---

# @xyai/dsh-agent-forge

English | [中文](README.zh.md)

## Summary

The browser half registers the Agent Forge utility in the session header (`conversation.session.header.utilities`). Agent and team creation stay with the DSH `agentLoop` and `agentTeams` host services; this package only surfaces the entry point and adds no model context or tools.

## Table of Contents

- Summary
- Model Experience
- Known Limitations and Deferred Work
- Dev Note

## Model Experience

None, as this package registers a browser-side session utility and adds no model context or tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Entry only** — the forge wizard that selects a model, persona, roster, handoff, and task card is deferred to later phases and will ride `agentTeams` and the system-prompt section.
- **No `./invariant`** — slot registration is observed by the UI-slot registry, so the package owns no independently diverging runtime relationship.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
