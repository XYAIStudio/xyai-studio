# XYAI Studio macOS 转包说明（BuildId: 0.3.1-20260904-r2）

## 这是什么
Windows 组合构建树源码快照（DeepSeek Harness + XYAI 叠加层），用于在 **macOS** 机器上尝试打包 `.app` / `.dmg`。
对应已产出的 Windows 安装包 BuildId：`0.3.1-20260904-r2`。
DSH 锁定 commit：`dd6322d604e00eec1ba5e0c8541159906a21094a`

## 已排除（勿再打包进云）
- 所有 `node_modules/`
- `.git/`
- Windows 安装包与 `apps/desktop/dist`、`apps/desktop/release`
- `.env`、运行时数据目录

## 在 Mac 上建议步骤
1. 解压本包到工作目录。
2. 安装 Node `^22.19 || >=24`、pnpm、Xcode CLT。
3. 在仓库根执行：`pnpm install`
4. 桌面壳：
   - `pnpm --filter @deepseek-ai/dsh-desktop run typecheck`
   - `pnpm --filter @deepseek-ai/dsh-desktop run build`
   - 或 `pnpm --filter @deepseek-ai/dsh-desktop run dist:mac`（见 `apps/desktop/scripts/release-mac.ts`）
5. Apple 公证：需要有效 Developer ID + notary 凭据；本包 **不含** 证书。
6. `llama-cpp` / 原生模块在 Mac 上需重新编译或替换为 darwin 产物；Windows 版二进制不能直接用。

## 关键目录
- `apps/desktop` — Electron 壳与打包配置（含 `build.mac`）
- `xyos-backend` / `xyos-dist` — XYOS 本地运行时
- `packages/client/xyai-industry-agent` — 行业 Agent 客户端叠加

## 已知限制（请如实告知用户）
- 官方 `RELEASE-PIPELINE` 目前只支持 win-x64；本包是源码转包，不是正式 macOS 发布物。
- 在 Mac 上首次成功前，可能还需改 shell/native/路径与 electron-builder mac target（当前多为 `dir`）。
