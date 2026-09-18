# UX Fix — About / Models / KB / Biz OpenXYOS

Date: 2026-09-17 (Asia/Shanghai)

## Summary

Implemented in-app About card navigation, Biz OpenXYOS refresh, Models page scroll + section tabs, and KB local parse auto-pick + capsule modal inputs. No Windows pack.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/zones/index.ts` | Re-export `openBrowser` |
| `src/renderer/zones/browser.ts` | Already exports `openBrowser(url)` (zone chrome + navigate) |
| `src/renderer/about.ts` | Intercept card `<a href>` clicks, close overlay, call `openBrowser(url)` |
| `src/renderer/zones/biz.ts` | Toolbar **刷新**, contextmenu 刷新, re-resolve + reload |
| `src/renderer/index.html` | `#view-models` sections: 硬件 / 依赖 / tabs 本地 and 云端 |
| `src/renderer/main.ts` | Models tab wire, 全盘搜索, 设为默认 / 一键注册 |
| `src/renderer/styles.css` | Models scroll fix, biz toolbar, KB capsule inputs |
| `src/renderer/knowledge/panel.ts` | 开始解析 auto-picks selected/first local mount |
| `apps/desktop/UX-FIX-ABOUT-MODELS-KB.md` | This doc |

## Feature notes

### A) About → in-app browser

- `ABOUT_HTML` content kept (four site cards).
- On iframe `load`, capture-phase click interceptor calls `preventDefault` on `<a href>` and runs `openBrowser(url)`.
- Backup: `postMessage({ type: 'xyai-about-open', url })`.
- Opens the Browser zone webview — not `shell.openExternal`, not iframe navigation (avoids blue screen).

### B) Biz OpenXYOS refresh

- Capsule **刷新** toolbar above the webview.
- Right-click context menu → 刷新.
- `refresh()`: `loadedOnce=false`, status **正在刷新…**, re-calls `openXyosResolve`, reloads webview.
- On failure, status card keeps a **刷新** button.

### C) Models page

- `#view-models` only gets `display:flex` via `.active`.
- Removed vertical centering clip; `.models-scroll` is the scroll column (`max-width: 920px`, padding under nav).
- Sections: 本机硬件检测区 (+ 再次检测), 模型调用依赖区 (Ollama + 一键安装), tabs 本地 | 云端.
- 本地: 全盘搜索已下载模型、一键注册、设为默认、硬件推荐 + 一键下载.
- 云端: existing cloud provider form.

### D) KB parse + capsule inputs

- **开始解析** auto-selects the first local mount if none selected, then `kbStartParse(id)`.
- `onKbParseProgress` maps statuses to 已解析 / 待解析 / 正在解析 / 无法解析.
- Modal inputs use capsule style (`border-radius: 999px`, system blue/light fill).

## Verification

- `pnpm --filter @xyai/knowledge test` → pass (18)
- `pnpm --filter desktop typecheck` → pass
- `pnpm --filter desktop build` → pass

## Constraints honored

- Sky-blue frosted UI, capsule controls, Chinese labels
- No bare `import.meta` in main/CJS pack path
- Never leave `#view-models{display:flex}` without `.active`
