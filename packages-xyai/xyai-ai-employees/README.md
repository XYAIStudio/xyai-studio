---
description: "Configure AI employees and start persistent single or group collaborations backed by DSH Agent Teams, with durable peer messaging and shared tasks."
kind: "package-reference"
---

# @xyai/dsh-ai-employees

English | [中文](README.zh.md)

## Summary

This plugin lets operators search and filter AI employees, configure and review drafts before publishing, and start one-person or two-to-six-person collaborations. Every employee card starts its one-to-one chat directly; group checkboxes enable a new group only after two members are selected. A created or reused Session opens directly in the collaboration View. An existing collaboration can invite additional employees into a new group while retaining its original Session. Running collaborations use DSH Agent Teams for teammate lifecycle, peer messages, tasks, and Session recovery. Each team Session also retains outcomes with revision, return, and acceptance actions; online outcome synchronization stays unavailable until an owning provider is composed. Group renaming uses the DSH Session controller and retains the editor with an error message when persistence fails.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **AI Team** from the conversation View tabs or use **Add AI employee** in the composer.

### When to choose it

Choose this plugin when an XYAI desktop profile already composes DSH Agent Teams and needs employee-oriented configuration and collaboration flows. Use the DSH Agent Teams UI directly when employee drafts and persistent single-chat bindings are unnecessary.

### Minimal configuration

```yaml
- id: xyai-ai-employees
  name: '@xyai/dsh-ai-employees'
```

This package has no plugin config fields. It requires the `connection`, `settings`, `agents`, and `agentTeams` Host services; the browser half requires slots, locale, connection, and Session controllers. The XYAI profile supplies these dependencies.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host stores the employee library, draft revisions, and single-chat bindings in the `xyai-ai-team` settings namespace. Its Connection RPC validates browser payloads and delegates teammate, mailbox, and task operations to `ctx.agentTeams`. The browser registers a full conversation View, a composer entry that opens the collaboration dialog, and a team-aware rename control.

| File | Purpose |
|---|---|
| `src/index.ts` | Validated Host RPC and DSH Agent Teams adapter |
| `src/protocol.ts` | Shared employee records and RPC envelopes |
| `src/client/plugin.tsx` | Employee editor, collaboration creation, roster, messaging, and tasks |
| `src/client/styles.ts` | Package-scoped responsive styles |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [DSH architecture](../../docs/architecture.md) — plugin composition and application launch
- [Agent Teams](../../packages/experimental/agent-team/README.md) — durable roster, mailbox, and task semantics
- [XYAI profile](../../profiles/xyai/package.json) — shipped bundle order

-----

<a id="model-experience"></a>
## Model Experience

### Employee teammate prompt

#### What the model sees

The selected employee's published `instructions`, memory, skills, routines, and integrations become the new teammate's initial user prompt. Team messages and tasks then use the logged DSH Agent Teams mechanisms.

#### Token effect

Each teammate pays once for its configured initial prompt; later peer messages and task tool calls consume their ordinary message and tool tokens.

#### KV Cache effect

Stable published employee instructions remain at the front of a fresh teammate Session and can participate in prefix caching; editing and publishing the instructions changes that prefix for later Sessions.

## Known Limitations and Deferred Work

- Scheduled routines remain employee configuration; this package does not register a scheduler job.
- Marketplace installation and online employee synchronization require their owning commerce or online adapters.
- Single-chat reuse applies while the bound Session remains in the browser Session list; a deleted Session creates a new binding target on the next start.
- The package publishes no `./invariant` because Loader composition tests and the DSH registries directly observe every owned registration.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
