# ROADMAP — 0.5 路线图

## 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M1** | 薄壳 + 契约 + Core 装配 + **Codex 对话路径**（可 MOCK） | 脚手架进行中 |
| M2 | Electron 薄宿主单 chrome；真实 Codex 二进制钉死接线 | 未开始 |
| M3 | OpenXYOS submodule 真接入 + 桥接资产/登录 | 未开始 |
| **M4** | **AI 员工**（首个内测可延后/省略） | **延后** |
| M5 | DSH / Claude Adapter；多 Harness 切换 | 未开始 |

## 锁定决策对照

1. Codex first → M1 只建 `adapter-codex`
2. OpenXYOS submodule → M1 占位 + bridge `not-installed`；M3 真接入
3. AI employees optional for first beta → **M4 不阻塞首个内测**

## 非目标（0.5 早期）

- 不自研完整 Native Agent Loop 作为入场条件
- 不把产品脊椎绑在 DSH DOM / 双 View 硬桥
- 不在仓库内下载或分发 Codex 二进制
