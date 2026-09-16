# 云电脑验证记录（同步到本机）

- 时间：2026-09-17 00:29 CST（云电脑）
- 来源：云电脑 /workspace/xyai-studio-0.5 → 本机 E:\XYAI studio\0.5

## 已拍板

- 首个 Harness：Codex（当前为 MOCK 适配器，未下载真实二进制）
- OpenXYOS：git submodule 占位于 components/openxyos
- 首个内测：可不含 AI 员工

## 校验结果（全部通过）

| 命令 | 结果 |
|---|---|
| pnpm install | PASS |
| pnpm typecheck | PASS |
| pnpm test | PASS（contracts/core/adapter-codex/xyos-bridge/desktop） |
| pnpm --filter desktop smoke | PASS（装配 OK + mock Codex 一轮 + xyos not-installed） |

## 本机下一步

```powershell
cd "E:\XYAI studio\0.5"
pnpm install
pnpm typecheck
pnpm test
pnpm --filter desktop smoke
```

OpenXYOS submodule（有仓库地址后）：

```powershell
git submodule add <openxyos-repo-url> components/openxyos
```

## 本机复验（WIN-NJ9C501A72U，2026-09-17 00:30 CST）

| 命令 | 结果 |
|---|---|
| pnpm install | PASS |
| pnpm typecheck | PASS |
| pnpm test | PASS |
| pnpm --filter desktop smoke | PASS |

说明：中途有一次 npmmirror 对 pnpm 元数据超时告警，不影响安装与校验完成。