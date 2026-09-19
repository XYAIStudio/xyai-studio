# @xyai/core-runtime

XYAI Core connect layer: a `SessionFacade` over `AgentRuntime`, text-inferred `TurnCapability`, `PermissionMode` mapping, model catalog + gateway, knowledge retrieval into Session send, and a stall watchdog.

This package does **not** invent an Agent Loop. Adapters (`adapter-codex`, later `dsh` / `claude`) own execution. Workflows belong in Skill; rich UI belongs in later plugins.

See [docs/XYAI-CORE.md](../../docs/XYAI-CORE.md).

## Exports

| Export | Role |
|---|---|
| `RuntimeSession` | Live session: start / send / abort / dispose + event subscribe |
| `inferTurnCapability` | Text-only `chat \| tools \| planning` |
| `accessModeToPermissionMode` | Composer chip → approval policy |
| `normalizeGatewayCatalog` | One list: local Ollama + cloud/custom + builtin |
| `planModelGateway` | `modelRef` + `TurnCapability` → stream vs Codex (+ injection id) |
| `normalizeKnowledgeHits` / `planKnowledgeContext` | Local + cloud hits → Session-send prefix (empty sources / `你好` no-op) |
| `createStallWatchdog` / `watchStall` | Silence timer + abort callback |
| `STALL_TIMEOUT_TOOLS_MS` (45s) / `STALL_TIMEOUT_CHAT_MS` (3min) | Configurable defaults |

`PermissionMode` is approval policy only. It never forces a chitchat turn onto tools, and it never decides knowledge attach. Anthropic Messages cannot drive the Codex tools path yet. Knowledge backends stay outside Core (`@xyai/knowledge`, ima/HTTP, OpenXYOS import).
