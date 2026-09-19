# XYAI Studio 0.5

**下载（Windows x64 NSIS）**：[XYAI-Studio-0.5.0-Setup-x64.exe](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) · [Release 说明](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

> 源码分支：`release/0.5` · 仓库：[XYAIStudio/xyai-studio](https://github.com/XYAIStudio/xyai-studio) · OpenXYOS submodule：[XYAIStudio/openXYOS](https://github.com/XYAIStudio/openXYOS)

---
Cindy 同构分层的 AI 桌面基座脚手架：**自有 Core + Harness Adapters + OpenXYOS 独立组件**。Electron 薄宿主，契约优先，禁止 DOM 注入。

## 三条锁定决策（2026-09-17）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 首个 Harness | **Codex 优先**（`adapter-codex` 先行；DSH / Claude 后续） |
| 2 | OpenXYOS 打包 | **git submodule**（`components/openxyos`；**勿伪造远程 URL**，由用户执行 `git submodule add <url> components/openxyos`） |
| 3 | 首个内测范围 | **可不含 AI 员工**（路线图 M4 延后；0.5 beta = Electron + Codex + OpenXYOS 探针） |

## 仓库布局

```text
apps/desktop              # Electron 薄宿主 + 最小聊天窗 + smoke CLI + pack:win
packages/xyai-contracts   # 平台契约
packages/xyai-core        # AssemblyGraph / SessionRegistry
packages/xyai-core-runtime # SessionFacade / 权限映射 / 文本能力 / 模型与知识网关 / Forge / 资产登记处 / 停滞看门狗
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
XYAI_CODEX_MOCK=1 pnpm --filter desktop smoke

# Electron 聊天窗（需图形界面；无显示时请在 Windows 本机验证）
XYAI_CODEX_MOCK=1 pnpm --filter desktop dev
```

## Windows 安装包（NSIS）

在 **Windows x64** 上打包（完整 NSIS 建议在 Windows 执行；Linux 可跑 `pack:dir` 校验配置）：

```bash
pnpm install
pnpm --filter desktop pack:win
# 产物：apps/desktop/release/XYAI Studio-0.5.0-Setup-x64.exe
```

等价根脚本：`pnpm pack:win`。

打包流水线：`build` → `scripts/ensure-icons.mjs` → `scripts/bundle-for-pack.mjs`（CJS `pack-out/`）→ `electron-builder --win nsis`（`afterPack` 把 XYAI `build/icon.ico` 写入 exe）。  
Codex 原生二进制 **不强制打入安装包**；运行时用 PATH / `XYAI_CODEX_BIN`，否则 MOCK。用户说明见 `apps/desktop/RELEASE.md`。

## 文档

见 `docs-plan/`：`ARCHITECTURE`、`PRODUCT-VISION`、`MODULE-MAP`、`ROADMAP`、`OPENXYOS-PACKAGING`、`RELATION-TO-LEGACY`、`AGENTS`。Core 原则：[docs/XYAI-CORE.md](docs/XYAI-CORE.md)。

## 注意

- 本脚手架 **不下载** Codex 二进制到仓库；通过依赖 `@openai/codex@0.151.0` 解析平台 native；无二进制或 `XYAI_CODEX_MOCK=1` 时回退 MOCK。
- 不发明密钥或假远程地址。
