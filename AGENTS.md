# AGENTS.md — 本仓库执行守则（0.5 脚手架）

面向在本仓库工作的 Agent / 开发者。

## 必须遵守的锁定决策

1. **Codex first** — 不要把 DSH 重新提升为默认脊椎；新 Adapter 可加，但不替换 M1 优先级。
2. **OpenXYOS submodule** — 不要伪造 `components/openxyos` 的远程 URL；占位保持 README + `.gitkeep`。
3. **AI employees optional** — 不要把 AI 员工当作首个内测门禁；装配图中保持可选/默认关闭直至 M4。

## 工程红线

- TypeScript strict；契约优先；改契约需同步测试。
- **禁止 DOM 注入** / 用 `executeJavaScript` 冒充集成。
- **禁止下载 Codex 二进制**到本仓库；通过 `@openai/codex@0.151.0` 解析平台 optional dep；MOCK 须保持标注（`forceMock` / `XYAI_CODEX_MOCK=1`）。
- 真实接线：`codex exec --json --ephemeral --skip-git-repo-check -s read-only -C <cwd> "<prompt>"`（见 `packages/adapter-codex/README.md`）。
- **禁止提交密钥**、`.env` 真值、token。
- 证据优先：结论区分代码证据 / 构建产物 / 人工验收 / 未验证。

## 常用命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter desktop smoke
```

工作区根路径：`/workspace/xyai-studio-0.5`（本机 Linux box）。
