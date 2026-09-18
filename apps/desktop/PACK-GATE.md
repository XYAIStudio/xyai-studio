# Desktop pack gate (do not skip)

## Why
Source is ESM; `bundle-for-pack` emits CJS (`main.cjs`). Bare `import.meta.url` becomes empty → `createRequire` / `fileURLToPath` crash at startup.

## Before every installer
1. `rg -n "createRequire\\(import\\.meta|fileURLToPath\\(import\\.meta" apps/desktop/src packages/adapter-codex/src` — must be zero bare uses (guards/`safeImportMetaUrl` only).
2. `pnpm --filter desktop build && node apps/desktop/scripts/bundle-for-pack.mjs`
3. Confirm `pack-out/renderer/index.html` contains `开发空间`.
4. Launch `apps/desktop/release/win-unpacked/XYAI Studio.exe` (or pack then unpacked) and keep alive ≥5s with no main-process dialog. Kill after.
5. Only then `electron-builder --win nsis` and copy Setup to Desktop.

## Settings rule
`settings.ts` must never `require('electron')`. Main calls `setSettingsUserDataDir(app.getPath('userData'))` before `CodexHost`.

## Windows icon embed
`signAndEditExecutable: false` skips embedding icons into `XYAI Studio.exe`.
After `electron-builder --dir`, always run:
`rcedit-x64.exe "release/win-unpacked/XYAI Studio.exe" --set-icon build/icon.ico`
then NSIS with `--prepackaged release/win-unpacked`.
Keep `build/icon.ico` multi-size (>=256) and `build/icon.png` at 512px.

