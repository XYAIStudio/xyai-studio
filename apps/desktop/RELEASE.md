# XYAI Studio 0.5.1 — 发布说明（候选）

**状态**：源码候选。Windows x64 NSIS 安装包 **待构建（pending build）**。本文不提供 0.5.1 下载链接。

计划中的安装包文件名：`XYAI-Studio-0.5.1-Setup-x64.exe`。

## 0.5.1 相对 0.5.0

- 对话里的网页链接会交给系统浏览器打开。只接受 `http` / `https`，不打开 `javascript:` 或 `file:`。
- 关于页和窗口标题显示产品版本 `0.5.1`。
- 打包脚本从 `apps/desktop/package.json` 读取版本，安装包文件名固定为 `XYAI-Studio-<version>-Setup-<arch>.exe`，与已发布的 0.5.0 文件名规则一致。
- 文档下载区把 0.5.1 标成待构建，已发布安装包仍指向 0.5.0。`v0.3.1` 只属于 `main` 上的旧预览，不是本线的当前下载。

## 仍可用的 0.5.0 安装包

**GitHub 下载**：[XYAI-Studio-0.5.0-Setup-x64.exe](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe)

### 安装

1. 运行 `XYAI-Studio-0.5.0-Setup-x64.exe`（NSIS）。
2. 按向导选择安装目录，完成安装后从开始菜单或桌面快捷方式启动。
3. 建议卸载旧版后再安装。安装包未签名。

## Codex 对话

- **真实 Codex**：本机需能解析到 Codex CLI（系统 `PATH` 中的 `codex`，或环境变量 `XYAI_CODEX_BIN` 指向可执行文件）。首次使用真实 Codex 时需要 **网络** 完成账号登录 / 鉴权（按 OpenAI Codex 官方流程）。
- **演示 / 无 Codex**：设置环境变量后启动即可走 MOCK 路径（无需网络鉴权）：

```bat
set XYAI_CODEX_MOCK=1
"XYAI Studio.exe"
```

或在 PowerShell：

```powershell
$env:XYAI_CODEX_MOCK = "1"
& "XYAI Studio.exe"
```

界面状态栏会显示当前为 Mock 或真实二进制来源。

## OpenXYOS

0.5 线仅含健康探针与业务空间嵌入。未安装 OpenXYOS submodule 时业务空间显示为未安装；不影响 Codex 对话。

## 反馈

请将复现步骤、是否 MOCK、以及是否已安装 Codex CLI 一并反馈给维护者。
