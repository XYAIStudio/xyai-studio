# ROADMAP — 0.5 路线图

## 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M1** | 薄壳 + 契约 + Core 装配 + **Codex 对话路径**（可 MOCK） | **完成** |
| **M2** | Electron 薄宿主单 chrome；真实 Codex 二进制钉死接线 | **完成** |
| **M3** | OpenXYOS submodule 真接入 + 桥接探针 | **部分完成**（submodule + health；业务全量未做） |
| **M4** | **AI 员工**（首个内测可延后/省略） | **延后**（不阻塞内测） |
| M5 | DSH / Claude Adapter；多 Harness 切换 | 未开始 |

## 0.5 内测交付标准（已锁定）

1. 可安装的 Windows 桌面应用（Electron + NSIS）
2. 窗口内可与 Codex 对话（真实二进制优先；无二进制 / `XYAI_CODEX_MOCK=1` 时 MOCK）
3. OpenXYOS：`components/openxyos` submodule 可探测；桥接 `healthCheck` 返回 `submodule-present` 或 `not-installed`
4. **不含** AI 员工、不含 Claude/DSH 多 Harness

## 锁定决策对照

1. Codex first → M1/M2 只建 `adapter-codex`
2. OpenXYOS submodule → M3 探针级；业务全量后续
3. AI employees optional → **M4 不阻塞首个内测**

## 非目标（0.5 早期）

- 不自研完整 Native Agent Loop 作为入场条件
- 不把产品脊椎绑在 DSH DOM / 双 View 硬桥
- 不在仓库内下载或分发 Codex 二进制（依赖 `@openai/codex` 解析）
