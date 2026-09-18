# XYAI Studio 0.5 — Brand

## Marks

| Asset | Path | Use |
| --- | --- | --- |
| Circular brand mark | `src/renderer/assets/logo.png` | Chrome wordmark companion, 通用智能体 avatar, About |
| App icon | `brand/xyai-logo.png` + `build/icon.png` (512) + `build/icon.ico` (16–256) | electron-builder / Windows shortcut / taskbar / installer |
| 小精灵 mascot | `src/renderer/assets/mascot/{wave,thumbs,hearts,idea,think}.png` | Empty transcript (pose cycle), About |

Wordmark text stays **XYAI Studio** beside the circular logo in the chrome header.

## UX placements (0.5)

1. **Chrome** — `logo.png` + 「XYAI Studio」.
2. **Empty transcript** — large mascot in a navy circle, gentle bob; poses fade every ~3.5s; tagline 「我是 XYAI 小精灵，随时帮你写代码～」.
3. **Agent rail** — default 通用智能体 uses the circular logo as avatar (no menu / no toggle).
4. **About** — logo + wave mascot + short product line.

Skipped on purpose: floating composer mascot and any brand option menus.

## Notes

- Mascot PNGs ship on black backgrounds; UI wraps them in rounded navy/black circles so they sit cleanly on the light-sky theme.
- `scripts/copy-static.mjs` recursively copies `src/renderer/assets/` (including `mascot/`) into `dist/renderer/assets/`.
- `build/` is gitignored except `icon.png` / `icon.ico` (see repo `.gitignore`). Pack scripts run `scripts/ensure-icons.mjs` and `afterPack` embeds the ICO into `XYAI Studio.exe` via rcedit (needed because `signAndEditExecutable: false`).
- After reinstalling a new NSIS build: delete the old desktop shortcut, install the new Setup, then confirm the pinwheel logo (not the Electron atom). If Windows still shows atom, refresh the icon cache (`ie4uinit.exe -show`) or sign out/in — Explorer caches shortcut icons.
