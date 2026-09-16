# XYAI Studio 0.5

Cindy 同构分层的 AI 桌面基座脚手架：**自有 Core + Harness Adapters + OpenXYOS 独立组件**。Electron 薄宿主，契约优先，禁止 DOM 注入。

## 三条锁定决策（2026-09-17）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 首个 Harness | **Codex 优先**（`adapter-codex` 先行；DSH / Claude 后续） |
| 2 | OpenXYOS 打包 | **git submodule**（`components/openxyos`；**勿伪造远程 URL**，由用户执行 `git submodule add <url> components/openxyos`） |
| 3 | 首个内测范围 | **可不含 AI 员工**（路线图 M4 延后；M1 = 薄壳 + Codex 对话路径） |

## 仓库布局

```text
apps/desktop              # 薄宿主入口（当前为 Node smoke）
packages/xyai-contracts   # 平台契约
packages/xyai-core        # AssemblyGraph / SessionRegistry
packages/adapter-codex    # Codex Adapter（真实 exec --json + MOCK 回退）
packages/xyos-bridge      # OpenXYOS 健康探针桥
packages/xyai-ui-shell    # UI 壳占位
assembly/profiles/        # 声明式装配图
components/openxyos/      # OpenXYOS submodule 占位
docs-plan/                # 规划文档（简体中文）
```

## 环境

- Node.js `^22`
- pnpm `9` 或 `10`（`packageManager`: `pnpm@9.15.0`）

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm --filter desktop smoke
```

## 文档

见 `docs-plan/`：`ARCHITECTURE`、`PRODUCT-VISION`、`MODULE-MAP`、`ROADMAP`、`OPENXYOS-PACKAGING`、`RELATION-TO-LEGACY`、`AGENTS`。

## 注意

- 本脚手架 **不下载** Codex 二进制到仓库；通过依赖 `@openai/codex@0.151.0` 解析平台 native；无二进制或 `XYAI_CODEX_MOCK=1` 时回退 MOCK。
- 不发明密钥或假远程地址。
