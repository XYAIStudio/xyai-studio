# XYAI Studio 0.5 stability notes

Branch: `release/0.5`. This is a living audit of P0/P1 items found while fixing icon / Ollama / OpenXYOS / hardware.

| ID | Sev | Finding | Status |
| --- | --- | --- | --- |
| S1 | P0 | Windows shortcut/exe used Electron **atom** because `build/icon.ico` was gitignored and `signAndEditExecutable: false` skipped embed | **Fixed** — tracked multi-size ICO, `ensure-icons`, `afterPack` rcedit, `BrowserWindow` icon |
| S2 | P0 | Chat to `ollama:*` showed bare `fetch failed` when `127.0.0.1:11434` was down | **Fixed** — `ensureOllamaRunning` before stream; mapped error + 「启动 Ollama」 |
| S3 | P0 | 「全盘搜索完成，未发现本地模型」when Ollama was installed but stopped; scan was only `refreshModels()` / `/api/tags` | **Fixed** — scan calls `startOllama`/`ensureOllamaRunning` first; snapshot auto-starts; `ollama list` + disk manifests fallback; dialog distinguishes stopped vs empty |
| S4 | P0 | OpenXYOS production boot needs `JWT_SECRET` / `CORS_ORIGIN` / `COOKIE_SECRET`; one spawn path only set `PORT` and used `stdio: 'ignore'` → 55s timeout with no reason | **Fixed** — all spawns use `buildOpenXyosServerEnv`; stdout/stderr → `userData/logs/openxyos-server.log`; fail fast on child exit; UI shows redacted log tail |
| S5 | P0 | `backend/server.ts` imports `./openxyos-identity` but some trees omit the file → `MODULE_NOT_FOUND` | **Fixed** — Studio writes the upstream-compatible stub; preflight lists other missing `./` imports (org-talent overlay); boot errors map MODULE_NOT_FOUND / CORS / JWT instead of only “55s 未就绪”. Last `npm.cmd`+PORT-only spawn now uses the same `startOpenXyosFullStack` path. |
| S6 | P1 | Hardware panel was a static snapshot (no live RAM/GPU ratios) | **Fixed** — poll ~1.5s while 模型 tab is visible; stop on leave / other zones; RAM used/total %; NVIDIA `nvidia-smi` usage; last-known GPU kept for AMD/Intel poll |
| S7 | P1 | No GPU-overload guard on local pulls; no accel hint | **Fixed** — one pull at a time; refuse all pulls when critical; refuse 14B+ when elevated; prefer smaller recs; vendor hints only for discrete GPU (no iGPU/CUDA-only push) |
| S15 | P1 | Hardware/recs assumed NVIDIA (RTX) — AMD / iGPU / no-GPU PCs got empty GPU lines or CUDA copy | **Fixed** — tiers by RAM + useful VRAM; RAM-only pressure when nvidia-smi missing; GPU line「暂无利用率数据」; UI note「因电脑配置不同，推荐与限流会自动调整」 |
| S8 | P1 | Stale picker ref (e.g. `qwen3:8b` not in tags) still attempted chat | **Fixed** — empty tags now count as missing; HTTP 404 mapped to refresh/pull; chip shows「未在本地列表」 |
| S9 | P1 | `pack:win` bundled ESM `pack/` while electron-builder reads `pack-out/` | **Fixed** — pack scripts use `bundle-for-pack` + icons |
| S13 | P1 | Bare `import.meta.url` in Electron CJS pack-out empties `createRequire` / `fileURLToPath` | **Fixed** — main uses `__xyai_module_dir`/`safe` guard; pack-gate unit test; smoke steps in `PACK-GATE.md` |
| S14 | P1 | 业务空间 error card put multi-line child logs in a `<p>` (hard to read crash reason) | **Fixed** — `<pre class="zone-status-message">` with pre-wrap |
| S10 | P2 | Windows icon cache may keep atom after reinstall | **Open** — user must delete old shortcut / `ie4uinit.exe -show` (documented in BRAND.md) |
| S11 | P2 | OpenXYOS submodule is still a placeholder in this repo; live boot depends on a real checkout (`XYAI_OPENXYOS_ROOT`) | **Open** — do not invent a remote; follow `components/README.md` |
| S12 | P2 | Cross-pack `rcedit` on Linux may be missing | **Open** — `afterPack` warns; run NSIS pack on Windows for shortcut proof |
| S16 | P0 | Chat composer stopped accepting text (Windows). Hidden Electron `<webview>`s in 业务/浏览器 zones plus portaled model panel/`#view-models` could sit above `#input` | **Fixed** — inactive views/webviews `display:none` + `pointer-events:none`; `#input` isolated `no-drag`; pointerdown re-unlocks |
| S17 | P0 | Local inventory used only Ollama `/api/tags` (3 tags) and first-wins discovery; FreeOS probe lists disk GGUF under common roots + user dirs (`E:\models`, `%USERPROFILE%\.dsh\xyai\models`, `360Downloads\Freework Models`) | **Fixed** — union API+CLI+manifests + capped disk weight scan (GGUF/GGML/HF, cap 40); scan bar 搜索本机模型 / 选择文件夹 / 全盘 |
| S18 | P0 | Hub cards dropped 测速 / 注册 / 挂接 / 解挂 | **Fixed** — 注册 = GGUF `ollama create` or tag→registry; 测速 = `/api/generate`; 挂接/解挂 = set/clear default chat model |
| S19 | P1 | Chat picker labeled `本地 · raw-tag` and repeated `ollama:tag`; mis-tagged aliases (same digest) looked like different families | **Fixed** — family/size or formatted tag; shared digest → 同权重 |
| S20 | P0 | Hub 测速 POSTed `/api/generate` for catalog/stale tags (`qwen3:8b` 404); mmproj/`role:vision` confused with VL chat | **Fixed** — 测速/挂接 only when live tags include the name; projectors by filename; recs use exact tag match |
| S21 | P0 | 挂接/注册 did not refresh composer `本地已注册` (fire-and-forget catalog) | **Fixed** — await `refreshLocalModels` on modelId/register/snapshot; renderer `syncChatCatalog` |

## Verify (Windows, after reinstall)

1. New NSIS Setup → desktop / taskbar / installer use the XYAI pinwheel (not atom).
2. Stop Ollama → 模型 page shows 「启动 Ollama」; after start, tags list refreshes. 「搜索本机模型」starts Ollama and unions tags + disk GGUF (not only 3 `/api/tags`).
3. Chat `ollama:qwen3:8b` with API down → start action, not `fetch failed`. Missing tag → refresh/pull, chip「未在本地列表」.
4. 业务空间 timeout → error card includes child log / identity / CORS hint (multi-line), not only “55s 未就绪”.
5. 模型 hardware：任意机器都有 RAM%；无独显/AMD 显示「暂无利用率数据」，不出现「请安装 CUDA」作为唯一路径。推荐随配置缩放。
6. Pack gate (`apps/desktop/PACK-GATE.md`): no bare `createRequire(import.meta)` / `fileURLToPath(import.meta)` in main/preload/adapter-codex; `bundle-for-pack` → `pack-out/main.cjs`; `pnpm --filter desktop smoke`; win-unpacked stays up ≥5s before NSIS.
7. 本机已有模型 shows disk GGUF (mmproj marked 非对话) plus Ollama tags; 测速/挂接 only on live Ollama tags; disk GGUF starts as 注册. Composer on 对话 tab accepts typing after visiting 业务空间.
8. 挂接/注册 a live tag → 对话 ModelPicker「本地已注册」updates without restart. Shared-digest aliases show the same family + 同权重.

## Evidence

- Code + unit tests: this PR
- Windows NSIS shortcut, live Ollama, live OpenXYOS: **not verified** on the Linux agent
