# Phase 1 QA — XYAI 0.3 shell + Cindy chat minimum

Result: **19/19 passed**

- [PASS] 03-logo
- [PASS] 03-zones
- [PASS] 03-theme-about
- [PASS] 03-chrome-gradient
- [PASS] 03-dev-subtabs
- [PASS] cindy-session-rail
- [PASS] cindy-streaming
- [PASS] cindy-send-stop
- [PASS] cindy-enter-ime
- [PASS] cindy-model-select
- [PASS] cindy-abort-adapter
- [PASS] cindy-host-stop
- [PASS] cindy-ipc-stop
- [PASS] model-local
- [PASS] model-cloud
- [PASS] model-host
- [PASS] assets-logo
- [PASS] copy-static-assets
- [PASS] utf8-html

All static checks passed. Pack only after Electron smoke on target OS.


## Runtime smoke (cloud, mock CodexHost)
- forceMock send → message.delta + message.completed: PASS
- createSession / deleteSession: PASS
- stopTurn callable: PASS
- typecheck desktop + package tests: PASS

## Deferred vs full Cindy (not Phase 1 blockers)
- message queue / reorder
- slash `/` and `@` pickers
- attachments
- tool-call collapsible groups / thinking cards
- cross-device

## Next
Sync to `E:\XYAI studio\0.5`, then `pnpm --filter desktop pack:win`, place installer on Desktop.
