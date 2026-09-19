# PHASE — Zones / Browser / About / Model panel / KB / API key

Desktop typecheck: **pass**. No Windows pack in this phase.

## 1) 模型列表不被遮挡

- `apps/desktop/src/renderer/chat/model-picker.ts`：打开时将 `#model-panel` **portal 到 `document.body`**，按 chip 的 `getBoundingClientRect` 做 `position: fixed`，`z-index: 5000`。
- `styles.css`：`.model-panel-portaled`；`.composer` / `.composer-card` / `.chat-center` / `.chat-main` 在面板路径上 `overflow: visible`。

## 2) 云模型无 API key → 发送前拦截

- Renderer `chat/index.ts`：`missingCloudApiKey()` 检查 `openrouter|openai|anthropic|deepseek` 前缀的 modelRef；缺 key → `appendError('请先设置 API key…')` 并 **block send**。
- Main `cloud-api-key.ts` + `codex-host.ts`：同样门禁；`ollama:` 与普通 `codex:`（含 mock）**不误伤**。

## 3) 已挂载知识库必须被对话识别

- `@xyai/knowledge` `search.ts`：中文友好 tokenize（CJK 整段 + bigram）+ 整句 substring 加分；无命中但有 chunks → **overview 兜底**前 N 片。
- `knowledge-host.search`：始终 prepend `formatAttachedKbBanner`；无索引库写入 `formatEmptyIndexNote`（从未解析 / 解析未产生正文），返回 `emptyIndexNames` + `emptyIndexNotes`。
- Chat：`emptyIndexNotes`（或 `emptyIndexNames`）→ `transcript.appendError`；context 为空时仍注入挂载说明，**禁止静默丢弃**。
- 有真实命中时仍保留 citations。

## 4) 业务空间 → OpenXYOS

- Main `openxyos-host.ts`：解析 `components/openxyos` / env `XYAI_OPENXYOS_ROOT`；优先 `frontend/dist/index.html` 或 `dist/index.html` 的 `file://`；否则尝试 `npm start` 起本地服务；失败则状态卡 +「打开目录」。
- Renderer `zones/biz.ts`：`<webview partition=persist:openxyos allowpopups>`；IPC `openXyosResolve` / `openXyosOpenFolder`。
- `@xyai/xyos-bridge`：`package.json` 等标记仍视为已安装。

## 5) 生态空间 → https://cnxy.ai

- `zones/eco.ts`：全幅 `<webview>` 加载 `https://cnxy.ai`（`persist:eco`）。

## 6) 浏览器 → 多标签 + 地址栏

- `zones/browser.ts`：标签条、后退/前进/刷新/主页、URL 回车导航、多 webview；主页 `https://www.cnxyai.cn/`。
- BrowserWindow `webviewTag: true`；CSP 放行 https / 127.0.0.1 / file frame。

## 7) 关于我们 — 照搬 0.3

- `about.ts`：嵌入 0.3 `ABOUT_HTML`（四站：cnxy.ai / cnxyai.com / cnxyai.cn / ai.cnxy.tech），顶栏「关于我们」打开 modal + iframe `srcdoc`（注入 logo）。

## Docs

- `apps/desktop/KNOWLEDGE.md`：补充检索 overview 兜底与挂载横幅说明。

## 约束遵守

- 保留胶囊按钮、view hide safety、chat resize。
- Main CJS 路径无新增裸 `import.meta`。
- 无 Windows 打包步骤。
