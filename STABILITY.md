# XYAI Studio 0.5 stability notes

Branch: `release/0.5`. This is a living audit of P0/P1 items found while fixing icon / Ollama / OpenXYOS / hardware.

| ID | Sev | Finding | Status |
| --- | --- | --- | --- |
| S1 | P0 | Windows shortcut/exe used Electron **atom** because `build/icon.ico` was gitignored and `signAndEditExecutable: false` skipped embed | **Fixed** — tracked multi-size ICO, `ensure-icons`, `afterPack` rcedit, `BrowserWindow` icon |
| S2 | P0 | Chat to `ollama:*` showed bare `fetch failed` when `127.0.0.1:11434` was down | **Fixed** — `ensureOllamaRunning` before stream; mapped error + 「启动 Ollama」 |
| S3 | P0 | 「全盘搜索完成，未发现本地模型」when Ollama was installed but stopped; scan was only `refreshModels()` / `/api/tags` | **Fixed** — scan calls `startOllama`/`ensureOllamaRunning` first; snapshot auto-starts; `ollama list` + disk manifests fallback; dialog distinguishes stopped vs empty |
| S4 | P0 | OpenXYOS production boot needs `JWT_SECRET` / `CORS_ORIGIN` / `COOKIE_SECRET`; one spawn path only set `PORT` and used `stdio: 'ignore'` → 55s timeout with no reason | **Fixed** — all spawns use `buildOpenXyosServerEnv`; stdout/stderr → `userData/logs/openxyos-server.log`; fail fast on child exit; UI shows redacted log tail |
| S5 | P0 | `backend/server.ts` imports `./openxyos-identity` but some trees omit the file → `MODULE_NOT_FOUND` | **Fixed** — Studio writes the upstream-compatible stub; preflight lists other missing `./` imports (org-talent overlay); boot errors map MODULE_NOT_FOUND / CORS / JWT instead of only “55s 未就绪”. Last `npm.cmd`+PORT-only spawn now uses the same `startOpenXyosFullStack` path. |
| S6 | P1 | Hardware panel was a static snapshot (no live RAM/GPU ratios) | **Fixed** — poll ~1.5s while 模型 tab is visible; NVIDIA `nvidia-smi` usage when available |
| S7 | P1 | No GPU-overload guard on local pulls; no accel hint | **Fixed** — refuse heavy pull when pressure is critical; Chinese hint (driver/CUDA docs, no fake installer); recommend smaller models under load |
| S8 | P1 | Stale picker ref (e.g. `qwen3:8b` not in tags) still attempted chat | **Fixed** — empty tags now count as missing; HTTP 404 mapped to refresh/pull; chip shows「未在本地列表」 |
| S9 | P1 | `pack:win` bundled ESM `pack/` while electron-builder reads `pack-out/` | **Fixed** — pack scripts use `bundle-for-pack` + icons |
| S13 | P1 | Bare `import.meta.url` in Electron CJS pack-out empties `createRequire` / `fileURLToPath` | **Fixed** — main uses `__xyai_module_dir`/`safe` guard; pack-gate unit test; smoke steps in `PACK-GATE.md` |
| S14 | P1 | 业务空间 error card put multi-line child logs in a `<p>` (hard to read crash reason) | **Fixed** — `<pre class="zone-status-message">` with pre-wrap |
| S10 | P2 | Windows icon cache may keep atom after reinstall | **Open** — user must delete old shortcut / `ie4uinit.exe -show` (documented in BRAND.md) |
| S11 | P2 | OpenXYOS submodule is still a placeholder in this repo; live boot depends on a real checkout (`XYAI_OPENXYOS_ROOT`) | **Open** — do not invent a remote; follow `components/README.md` |
| S12 | P2 | Cross-pack `rcedit` on Linux may be missing | **Open** — `afterPack` warns; run NSIS pack on Windows for shortcut proof |

## Verify (Windows, after reinstall)

1. New NSIS Setup → desktop / taskbar / installer use the XYAI pinwheel (not atom).
2. Stop Ollama → 模型 page shows 「启动 Ollama」; after start, tags list refreshes. 「全盘搜索」starts Ollama first.
3. Chat `ollama:qwen3:8b` with API down → start action, not `fetch failed`. Missing tag → refresh/pull, chip「未在本地列表」.
4. 业务空间 timeout → error card includes child log / identity / CORS hint (multi-line), not only “55s 未就绪”.
5. 模型 hardware lines update RAM% (and GPU% if `nvidia-smi` works).
6. Pack gate (`apps/desktop/PACK-GATE.md`): no bare `createRequire(import.meta)` / `fileURLToPath(import.meta)` in main/preload/adapter-codex; `bundle-for-pack` → `pack-out/main.cjs`; `pnpm --filter desktop smoke`; win-unpacked stays up ≥5s before NSIS.

## Evidence

- Code + unit tests: this PR
- Windows NSIS shortcut, live Ollama, live OpenXYOS: **not verified** on the Linux agent
