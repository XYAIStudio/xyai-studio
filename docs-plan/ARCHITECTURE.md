# ARCHITECTURE — XYAI Studio 0.5

- 文档版本：v0.5.0-dev
- 日期：2026-09-17（CST）
- 状态：脚手架已落地；实现可演进，修订须同步 ROADMAP / MODULE-MAP

## 1. 决议摘要

采纳 **Cindy 同构分层**，拒绝「DSH 全插件脊椎」与「Octop 换壳」。

| 决策 | 选择 |
|---|---|
| 产品脊椎 | 自有 **XYAI Core** |
| Agent 智能来源 | **Harness Adapters**（首个 = **Codex**） |
| 业务层 | **OpenXYOS** 独立组件 + 壳侧桥接 |
| UI 壳 | Electron 薄宿主 + 自有 Renderer（单 chrome） |
| 扩展 | Core / Skill / 能力模块三分 |
| Native Harness | 后置 |

### 锁定决策（必须遵守）

1. **首个 Harness = Codex**（`packages/adapter-codex`）；DSH、Claude 后续。
2. **OpenXYOS = git submodule**（`components/openxyos`）；勿伪造远程。
3. **首个内测可不含 AI 员工**（M4 延后）。

## 2. 分层

```text
Electron 薄宿主（窗口 / IPC / 组件安装）
        │
   XYAI Core（Session · Task · Assembly · Approval · …）
        ├── Harness Adapters（Codex → DSH → Claude …）
        └── OpenXYOS Bridge（健康探针 / 资产；组件可缺省降级）
        │
   Product Surfaces（工作台 · Composer · …；非 DOM 注入）
```

## 3. 契约优先

包：`@xyai/contracts` — `session`、`session-facade`、`permission`、`agent-kind`、`turn-capability`、`agent-runtime`、`model-catalog`、`tool-mcp`、`approval`、`skill`、`asset`、`xyos-bridge`、`assembly`。薄实现：`@xyai/core-runtime`（见 [../docs/XYAI-CORE.md](../docs/XYAI-CORE.md)）。

原则：状态机、校验、权限写在代码里；不把确定性甩给 prompt。禁止 DOM 注入 / `executeJavaScript` 硬捅上游 UI。

## 4. 装配图

`assembly/profiles/0.5.0-dev.example.json` 由 `@xyai/core` 的 `loadAssemblyProfile` 校验：至少一个启用 harness；模块可声明 `optional`（如 `ai-employees`）。

## 5. 成功标准（架构级）

1. 更换 Adapter 无需重写工作台 / KB / XYOS 桥。
2. OpenXYOS 未安装时核心对话仍可启动。
3. 冷启动与「能对话」不依赖 DOM 注入。
4. 装配图可机器校验，失败原因人话可读。
