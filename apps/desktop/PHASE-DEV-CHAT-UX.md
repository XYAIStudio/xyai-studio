# PHASE-DEV-CHAT-UX — 开发空间对话 UX（历史横杠 / 右侧栏 / 权限与附件）

- 日期：2026-09-17（CST）
- 范围：`apps/desktop` 薄 Electron renderer + 必要 IPC（**无 machineId、未做 Windows pack**）
- 主题：蓝天 sky tokens（`styles.css`）

## Shipped

### 1. 历史横杠（History scrub bar）
- 新模块：`src/renderer/chat/history-nav-rail.ts`
- 挂在 `#transcript-wrap` 左侧；用户消息 ≥ 3 且高度/宽度够才显示
- 每条 user turn 一个 tick；hover 显示问题摘要（~40）+ 助手摘录（~80）
- 点击 `scrollIntoView` 到对应 `.bubble[data-id]`
- 空闲后 dim；hover 恢复

### 2. 右侧可折叠栏
- 新模块：`src/renderer/chat/right-sidebar.ts`
- 布局：`session-rail | chat-center(transcript+composer) | right panel`
- Tabs：打开文件 | 审查 | 后台任务 | 浏览器 | 终端
- 折叠状态：`localStorage` key `xyai.rightSidebar.collapsed`
- 各 pane 为可用 stub（非空壳）：
  - 打开文件：会话附件列表，点击聚焦、可移除
  - 审查：最近助手回复的 placeholder diff / 「暂无审查项」
  - 后台任务：collab 未归档任务 / 「无后台任务」
  - 浏览器：URL → IPC `xyai:open-external` → `shell.openExternal`
  - 终端：只读 session 事件 log（send/stop）+ 「即将接入真实 PTY」

### 3. 「+」与使用权限
- 「使用权限」真实控件：`default` / `auto` / `full`，菜单切换
- 持久化：`settings.accessMode`（`xyai-settings.json` via `setSettings` / `getSettings`），并出现在 `getStatus().accessMode`
- 「+」：IPC `xyai:pick-files` → `dialog.showOpenDialog`（多选）
- 附件 chips 在 textarea 上方；发送时把 markdown 附件列表前置到 message content，并写入「打开文件」pane

## Deferred
- 真实文件上传到 harness / 多模态
- 真实 pending review / diff 管道
- 内嵌 BrowserView / WebContentsView
- 真实 PTY 终端
- accessMode 对 tool permission 的主进程强制执行（当前仅 UI + 落盘）
- Windows pack / installer（明确不做）

## 主要改动文件
- `src/renderer/index.html`, `styles.css`
- `src/renderer/chat/{history-nav-rail,right-sidebar,access-mode,index,transcript,composer}.ts`
- `src/main/{main,settings,codex-host}.ts`
- `src/preload/preload.ts`, `src/renderer/xyai-api.d.ts`
