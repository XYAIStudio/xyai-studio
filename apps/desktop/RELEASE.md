# XYAI Studio 0.5 Beta — 安装说明（Windows）

**GitHub 下载**：[XYAI-Studio-0.5.0-Setup-x64.exe](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe)


## 安装

1. 运行 `XYAI Studio-0.5.0-Setup-x64.exe`（NSIS）。
2. 按向导选择安装目录，完成安装后从开始菜单或桌面快捷方式启动。

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

0.5 beta 仅含健康探针。未安装 OpenXYOS submodule 时业务空间显示为未安装；不影响 Codex 对话。

## 反馈

请将复现步骤、是否 MOCK、以及是否已安装 Codex CLI 一并反馈给维护者。
