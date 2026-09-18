# PHASE C DONE — Transcript / SessionRail + multi-turn + Stop UX + Composer card

- Date: 2026-09-17 (CST)
- Scope: Ollama multi-turn history, Stop ≠ error, 0.4-aligned composer card, denser transcript
- Docs: `CHAT-ARCHITECTURE.md` §5 C

## Shipped

### A. Multi-turn Ollama history
- `CodexHost` keeps per-session `{role, content}[]` (cap 40).
- On Ollama send: append user → pass full history to `runOllamaTurn` → on `message.completed` append assistant.
- `streamOllamaChat` accepts `messages[]`; `content` alone still wraps as single user msg.
- History cleared on session delete; new session starts empty.

### B. Stop / abort UX
- Transcript: `code==='ABORTED'` / `message==='cancelled'` → `flushStreaming` only (keep partial assistant). **No** red「错误 / 已停止生成」.
- `ChatMsg.role` includes `'system'` (subtle chip styles ready; Stop prefers silent flush).
- Ollama early abort (no throw) still emits cancelled from `runOllamaTurn`.
- Optimistic Stop in assembler ignores later abort-like catch errors.

### C. Composer card (0.4 InputBar IA)
- Tall frosted card (~22px radius), placeholder「继续聊一聊…」.
- Toolbar: `+` (disabled) | 「完全访问」 chip | model chip | circular send/stop icon.
- ModelPicker ids unchanged (`#model-chip`, `#model-panel`, …).

### D. Transcript denser
- Centered column max-width ~760px; tighter gaps; compact user/assistant bubbles.
- Empty copy mentions multi-turn.

### E. SessionRail
- Active session highlight polished for glass theme; no behaviour regression.

## Deferred (Phase E)
- Message queue / steer
- Slash `/`, `@` mentions
- Attachments tray (composer `+` stays disabled placeholder)
- Tool / thinking cards
- Cloud route into chat
- SQLite persistence of transcripts / history

## Files touched
| Path | Change |
|---|---|
| `packages/xyai-model-hub/src/ollama.ts` | `messages[]` + backward-compat `content` |
| `packages/xyai-model-hub/src/index.ts` | export `OllamaChatMessage` |
| `apps/desktop/src/main/turn-controller.ts` | pass messages; accumulate text; abort signal |
| `apps/desktop/src/main/codex-host.ts` | per-session history |
| `apps/desktop/src/renderer/chat/types.ts` | `system` role |
| `apps/desktop/src/renderer/chat/transcript.ts` | abort ≠ error; denser empty copy |
| `apps/desktop/src/renderer/chat/composer.ts` | SVG send/stop |
| `apps/desktop/src/renderer/chat/index.ts` | ignore abort catch after Stop |
| `apps/desktop/src/renderer/index.html` | composer card layout |
| `apps/desktop/src/renderer/styles.css` | glass card, toolbar, transcript col |
| `CHAT-ARCHITECTURE.md` | Phase C done note |
| `apps/desktop/PHASE-C-DONE.md` | this file |

## Verify
```bash
cd /workspace/xyai-studio-0.5
pnpm --filter @xyai/model-hub --filter desktop build
```
