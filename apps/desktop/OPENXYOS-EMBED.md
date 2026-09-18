# OpenXYOS embed (业务空间)

## Why blank under `file://`

Packaged OpenXYOS is a Vite build. `index.html` references assets with **absolute** root paths:

```html
<script type="module" src="/assets/index-….js"></script>
<link href="/assets/index-….css" rel="stylesheet" />
```

Loading `file:///…/resources/openxyos/index.html` makes the webview resolve `/assets/…` against the **drive root** (e.g. `file:///E:/assets/…`), so scripts/CSS never load → blank page. Refresh cannot fix that.

## Resolve order (host)

`apps/desktop/src/main/openxyos-host.ts`:

1. Prefer an already-healthy **full stack** (`/api/health` on :3000… / managed child).
2. If a **runtime root** exists (`backend/server.ts` or `package.json` `scripts.start`), **auto-start** the full stack via shared `startOpenXyosFullStack` (same path as 「重启前后端服务」) — do **not** prefer static-http when login/API is needed.
3. Only when no runnable runtime root: serve static `index.html` over `http://127.0.0.1:<port>/` (`mode: 'static-http'`, try 3921…).
4. Never `file://` when a static pack exists.

`restartOpenXyosServices()` stops prior children/static, then calls the **same** `startOpenXyosFullStack` helper — it does **not** call `resolveOpenXyos`, so a static-http result cannot loop with restart.

## 重启前后端服务 (full stack)

Toolbar button **重启前后端服务** (left of **刷新**) calls `restartOpenXyosServices()`:

1. Locates a **runtime** root: `backend/server.ts` or `package.json` `scripts.start`, preferring `dist/index.html`.
2. Search order: `XYAI_OPENXYOS_ROOT` → monorepo candidates (e.g. `E:\XYAI studio\0.5\components\openxyos`, cwd relatives) → packaged `resources/openxyos` last.
3. Stops prior npm/node child and the in-process static HTTP server.
4. Spawns via **one** helper (`startOpenXyosFullStack`) — never a PORT-only/`stdio:'ignore'` child. Env always comes from `buildOpenXyosServerEnv`: `PORT`, `NODE_ENV` (defaults to `production`), `ALLOW_PUBLIC_REGISTRATION=true`, `CORS_ORIGIN` for that port (required by `backend/config/runtime.ts` in production), ephemeral `JWT_SECRET` / `COOKIE_SECRET` if missing (never logged), `SEED_*`.
5. Child **stdout/stderr** are piped to `userData/logs/openxyos-server.log` (redacted in the UI). If the child exits, wait fails immediately instead of spinning 55s.
6. **Preflight** writes missing `backend/openxyos-identity.ts` (org-talent `MODULE_NOT_FOUND`) and lists other missing `./` imports from `server.ts` before spawn.
7. Waits until `http://127.0.0.1:PORT/` is healthy (~55s), then reloads the webview so login/register hit the real Express API. Timeout errors include the explained crash (CORS/JWT/MODULE_NOT_FOUND) plus a log tail.

**Static-only packs** (`resources/openxyos` without backend) cannot start the API — set `XYAI_OPENXYOS_ROOT` to the full monorepo OpenXYOS directory for registration/login.

## Renderer belt (biz zone)

`zones/biz.ts`:

- If resolve still returns `static-http`, auto-call restart once (legacy / race).
- On activate, if last `src` was `:3921` / static, force restart so login works.

With current host auto-start, resolve should return `mode: 'server'` whenever a runtime root is present.

## Belt-and-suspenders: stage rewrite

`scripts/stage-openxyos.mjs` optionally rewrites leading `/assets/`, `/logo.png`, `/manifest…` to `./…` after copying the dist into `components/openxyos-pack`. The HTTP host remains the primary fix.

## Verify in 业务空间

1. Ensure a full OpenXYOS monorepo is findable (`XYAI_OPENXYOS_ROOT` or `components/openxyos` with backend), **or** only static `resources/openxyos` for UI-only.
2. Open **业务空间** — with a runtime root, Studio auto-starts full stack (message like「已自动启动 OpenXYOS 前后端」); origin should be `http://127.0.0.1:3000` (or next free), not `:3921`.
3. Login/register should hit `/api` without manually clicking **重启前后端服务**.
4. If load fails or times out (20s), a status card with **刷新** / **重试重启** appears.

## Layouts

| Layout | Serve root |
|--------|------------|
| Flat pack `resources/openxyos/index.html` | that folder (static-http only if no runtime) |
| `root/dist/index.html` | `root/dist` |
| `root/frontend/dist/index.html` | `root/frontend/dist` |
| Full monorepo + `npm start` | Express serves API + `dist` on :3000 |

## 演示账号登录（Studio 自动启动 / 重启前后端后）

Studio `buildOpenXyosServerEnv` 在启动时固定：

- `SEED_DEMO_DATA=true`
- `SEED_DEMO_PASSWORD=openxyos-demo-2026`
- `SEED_ADMIN_PASSWORD=openxyos-demo-2026`（≥12）

并在服务健康后调用 `ensureOpenXyosDemoUsers`（login 失败则 `/api/auth/register` 补齐）。

验证：

```bash
curl -sS -X POST 'http://127.0.0.1:<port>/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@demo.com","password":"openxyos-demo-2026"}'
```

期望：`{"success":true,...}`。UI：`demo@demo.com` / `openxyos-demo-2026`。
