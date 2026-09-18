# Desktop pack gate (do not skip)

## Why
Source is ESM; `bundle-for-pack` emits CJS (`main.cjs`). Bare `import.meta.url` becomes empty → `createRequire` / `fileURLToPath` crash at startup.

## Before every installer
1. `pnpm --filter desktop test` (includes `pack-gate.test.ts`) — zero bare `createRequire(import.meta)` / `fileURLToPath(import.meta)` in main/preload/adapter-codex (guards/`safeImportMetaUrl` only). Optional: `rg -n "createRequire\\(import\\.meta|fileURLToPath\\(import\\.meta" apps/desktop/src packages/adapter-codex/src`.
2. `pnpm --filter desktop smoke` (assembly + Codex mock/real + xyos healthCheck).
3. `pnpm --filter desktop build && node apps/desktop/scripts/bundle-for-pack.mjs`
4. Confirm `pack-out/renderer/index.html` contains `开发空间`.
5. Launch `apps/desktop/release/win-unpacked/XYAI Studio.exe` (or pack then unpacked) and keep alive ≥5s with no main-process dialog. Kill after.
6. Only then `electron-builder --win nsis` and copy Setup to Desktop.

## Settings rule
`settings.ts` must never `require('electron')`. Main calls `setSettingsUserDataDir(app.getPath('userData'))` before `CodexHost`.

## Windows icon embed
`signAndEditExecutable: false` skips electron-builder's own exe icon edit.
`pnpm --filter desktop pack:win` now: `ensure-icons` → `bundle-for-pack` (pack-out) → `electron-builder --win nsis`.
`afterPack` (`scripts/after-pack.cjs`) runs `rcedit --set-icon build/icon.ico` when rcedit is available.
Keep tracked `build/icon.ico` multi-size (>=256, 16–256) and `build/icon.png` at 512px.
Manual fallback on Windows:
`rcedit-x64.exe "release/win-unpacked/XYAI Studio.exe" --set-icon build/icon.ico`

