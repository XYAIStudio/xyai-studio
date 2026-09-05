# macOS 未签名内部分发包说明 / Unsigned macOS Internal Build

> 面向 **内部试用**，不含 Apple Developer ID 签名与公证（notarization）。
> For **internal use only** — no Apple signing or notarization.

终端用户安装见 **[MACOS-INSTALL.md](./MACOS-INSTALL.md)** / End-user install: **[MACOS-INSTALL.md](./MACOS-INSTALL.md)**.

## 中文

### 1. 上传到 GitHub
将本源码树推送到仓库 **XYAI-Studio/xyai-studio**（或你的 fork）。用户自行上传；本包不包含 `.git` / `node_modules`。

### 2. 在 Actions 里打包
1. 打开仓库 → **Actions**
2. 选择工作流 **macOS unsigned (internal)**
3. **Run workflow**（仅 `workflow_dispatch`）
4. 等待 `macos-14` 任务完成
5. 下载产物 **xyai-studio-macos-unsigned**（含 `.dmg` 与 `mac*` 目录）

### 3. 本地下载后打开（Gatekeeper）
未签名应用会被 macOS 拦截，可在解压/挂载 DMG 后对 App 执行：

```bash
xattr -cr "/Applications/XYAI Studio.app"
```

仍提示无法打开时：系统设置 → 隐私与安全性 → 仍要打开。

### 4. 运行时：llama-cpp + XYOS deps
打包前由 `scripts/stage-llama-cpp-darwin.ts` 从官方 ggml-org/llama.cpp **b10809**（Metal arm64）暂存 darwin 二进制到 `resources/llama-cpp`（仓库内 Windows 文件保留）。
xyos-backend 生产依赖在打包前安装；afterPack 硬校验 tsx。详见脚本与 CI。

### 5. 本地 Mac 命令（可选）

```bash
pnpm install --frozen-lockfile
pnpm --filter @deepseek-ai/dsh-desktop run dist:mac:unsigned
```

Signed release still uses dist:mac / dist:mac:desktop (runs release-preflight).

---

## English

### Upload
Push this tree to XYAI-Studio/xyai-studio. Upload yourself.

### GitHub Actions
Actions then macOS unsigned (internal) then Run workflow then download artifact xyai-studio-macos-unsigned.

### Gatekeeper workaround
```bash
xattr -cr "/Applications/XYAI Studio.app"
```

### llama-cpp + XYOS
darwin llama-cpp staged from ggml-org/llama.cpp b10809 (Metal arm64) before pack; Windows binaries remain in git.

### Local build
```bash
pnpm --filter @deepseek-ai/dsh-desktop run dist:mac:unsigned
```

Signed path unchanged; still expects Apple credentials.


### Note
xyos-backend prod deps installed before pack; afterPack hard-requires tsx. End-user install: [MACOS-INSTALL.md](./MACOS-INSTALL.md). Remaining: unsigned/Gatekeeper; arm64-only; Metal not Vulkan.
