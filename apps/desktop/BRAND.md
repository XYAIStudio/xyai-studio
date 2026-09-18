# XYAI Studio 0.5 — Brand

## Marks

| Asset | Path | Use |
| --- | --- | --- |
| Circular brand mark | `src/renderer/assets/logo.png` | Chrome wordmark companion, 通用智能体 avatar, About |
| App icon | `build/icon.png` (square) + `build/icon.ico` | electron-builder / Windows shortcut |
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
