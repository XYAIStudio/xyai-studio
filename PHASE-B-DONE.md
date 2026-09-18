# PHASE B DONE — Composer + ModelPicker (Cindy-aligned)

- Date: 2026-09-17 (CST)
- Scope: Renderer chat split + Composer card + ModelPicker chip/panel + Send↔Stop UX
- Docs: `CHAT-ARCHITECTURE.md` §5 B / §8.2–8.4

## Files added

| Path | Role |
|---|---|
| `apps/desktop/src/renderer/chat/types.ts` | Shared status / message / event types |
| `apps/desktop/src/renderer/chat/composer.ts` | Textarea, IME Enter, focus unlock, Send↔Stop morph |
| `apps/desktop/src/renderer/chat/model-picker.ts` | ONE chip + ONE panel; 本地已注册 / Codex; search; setSettings(modelId) |
| `apps/desktop/src/renderer/chat/transcript.ts` | Delta coalesce → one in-progress bubble; flush on stop/done/error |
| `apps/desktop/src/renderer/chat/session-rail.ts` | Session list + new / switch / delete |
| `apps/desktop/src/renderer/chat/index.ts` | Assembler (`mountChat`) |
| `PHASE-B-DONE.md` | This file |

## Files updated

| Path | Change |
|---|---|
| `apps/desktop/src/renderer/main.ts` | Chrome + models hub only; mounts chat |
| `apps/desktop/src/renderer/index.html` | Composer card, model chip/panel, single `#primary-action` |
| `apps/desktop/src/renderer/styles.css` | Card/popover styles; stronger no-drag / pointer-events / user-select |
| `apps/desktop/src/renderer/xyai-api.d.ts` | Notes that `modelId` is modelRef |
| `MODULE-MAP.md` | Point at renderer chat modules |

## Behaviour checklist (§8)

- [x] Busy ≡ streaming (Phase B, no queue)
- [x] Stop click → optimistic leave streaming + flush, then `stopTurn` IPC
- [x] Single primary control morphs Send ↔ Stop (~150ms CSS transition)
- [x] Busy Enter ignores send (no queue)
- [x] Enter send / Shift+Enter newline / IME `isComposing` + keyCode 229
- [x] ModelPicker: one chip + one panel; groups 本地已注册 + Codex; search; next-send via `setSettings({ modelId })`
- [x] Input: no-drag on composer zone; not disabled/readonly; pointer-events auto; user-select text
- [x] No queue / slash / @ / attachments

## Verify

```bash
cd /workspace/xyai-studio-0.5

pnpm --filter desktop typecheck

# optional full desktop build (emits chat/*.js under dist/renderer)
pnpm --filter desktop build
```

### Manual UI smoke (when Electron available)

1. Open 开发空间 → 对话.
2. Confirm `#input` is focusable (no `disabled`/`readonly`); type Chinese with IME — Enter during composition must not send.
3. Open model chip → panel lists `status.localModels` under「本地已注册」and `status.models` under「Codex」; select one; chip label updates; next send uses that modelRef.
4. Send a message → primary becomes「停止」; Stop returns to「发送」immediately; transcript keeps coalesced assistant text.
5. While busy, Enter must not send another turn.

## Out of scope

- Phase C transcript polish / empty-error polish beyond current flush
- Phase D pack / installer
- Phase E queue, `/`, `@`, attachments
