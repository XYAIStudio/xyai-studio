# ROADMAP — 0.5 路线图

## 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M1** | 薄壳 + 契约 + Core 装配 + **Codex 对话路径**（可 MOCK） | **已完成** |
| **M2** | Electron 薄宿主单 chrome + Codex 接线（真实二进制优先，MOCK 回退） | **已完成** |
| **M3** | OpenXYOS submodule 真接入 + 桥接资产/登录 | **部分完成**（submodule 占位 + `xyos-bridge` 探针；`package.json` 存在 → `ok` + `submodule-present`；业务 runtime / 登录未做） |
| **M4** | **AI 员工**（首个内测可延后/省略） | **延后**（不阻塞 0.5 beta） |
| **M5** | DSH / Claude Adapter；多 Harness 切换 | **未开始** |

## 0.5 beta 出货标准（首个内测）

- [x] 契约 + Core 装配校验可跑通
- [x] Codex Adapter：真实 `exec --json` 或 `XYAI_CODEX_MOCK=1` MOCK 事件流
- [x] Electron 聊天窗（IPC → CodexHost）；`pnpm --filter desktop dev`
- [x] OpenXYOS：`healthCheck` 占位 → `not-installed`；有 `package.json` → `submodule-present`
- [x] Windows NSIS 打包配置 + `pack:win`（在 Windows 上产出安装包）
- [ ] **不含** AI 员工（M4）、Claude/DSH Adapter（M5）、OpenXYOS 完整业务 runtime

## 锁定决策对照

1. Codex first → M1/M2 只建 `adapter-codex`
2. OpenXYOS submodule → M3 探针完成；全量业务后续
3. AI employees optional for first beta → **M4 不阻塞首个内测**

## 非目标（0.5 beta）

- 不自研完整 Native Agent Loop 作为入场条件
- 不把产品脊椎绑在 DSH DOM / 双 View 硬桥
- 安装包内不强制分发 Codex 原生二进制（PATH / `XYAI_CODEX_BIN` / MOCK）
