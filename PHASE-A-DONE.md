# PHASE A DONE — Chat architecture base wiring

- Date: 2026-09-17 (CST)
- Scope: modelRef + ModelCatalogFacade + TurnController routing (no Cindy UI rebuild)

## Files changed / added

| Path | Change |
|---|---|
| `packages/xyai-contracts/src/model-ref.ts` | **new** — `parseModelRef` / `formatModelRef` / `normalizeModelRef` / `toCodexModelId` / `toOllamaModelName` |
| `packages/xyai-contracts/src/model-ref.test.ts` | **new** — unit tests |
| `packages/xyai-contracts/src/index.ts` | export `model-ref` |
| `packages/xyai-contracts/src/session.ts` | optional `Session.modelRef` |
| `apps/desktop/src/main/model-catalog-facade.ts` | **new** — merge Codex `DEFAULT_MODELS` + `listOllamaModels()` (groups local/codex) |
| `apps/desktop/src/main/turn-controller.ts` | **new** — `resolveTurnRoute`, `TurnAbortBag`, `runOllamaTurn` |
| `apps/desktop/src/main/codex-host.ts` | evolve: store modelRef via `settings.modelId`, route send, stop aborts both, status exposes `localModels` + `models` from facade |
| `apps/desktop/src/main/settings.ts` | `DEFAULT_MODELS` ids → `codex:…`; `normalizeSettings` upgrades legacy bare ids |
| `apps/desktop/src/main/main.ts` | status fallback includes `localModels` + `codex:gpt-5` |
| `apps/desktop/src/main/model-ref-phase-a.test.ts` | **new** — parse + facade (no Electron) + route smoke |
| `PHASE-A-DONE.md` | this file |

IPC names unchanged: `xyai:chat-send`, `xyai:chat-stop`, `xyai:status`, `xyai:set-settings`.

## Verify

```bash
cd /workspace/xyai-studio-0.5

# rebuild contracts then typecheck targets
pnpm --filter @xyai/contracts build
pnpm --filter @xyai/model-hub typecheck
pnpm --filter @xyai/contracts typecheck
pnpm --filter desktop typecheck

# unit / smoke (no Electron)
pnpm --filter @xyai/contracts test
pnpm --filter desktop test
```

Expected:
- modelRef tests pass (bare → `codex:`, `ollama:*` parse)
- facade test merges injected Ollama list + Codex defaults
- `resolveTurnRoute('ollama:…')` → ollama; else → codex bare id for adapter

## Out of scope (Phase B+)

- Cindy Composer / ModelPicker panel chrome
- SessionRail / Transcript refactor
- Per-session modelRef persistence beyond `settings.modelId`

## Superseded note (local harness P0)

- Phase A `resolveTurnRoute('ollama:…') → kind: 'ollama'` **bypass is superseded by default**: ollama refs now resolve to `{ kind: 'codex', oss: true, localProvider: 'ollama' }` unless `localModelViaHarness: false`.
- See `LOCAL-HARNESS.md`.

