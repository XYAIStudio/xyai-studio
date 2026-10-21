# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> **本地优先的智能体工作台**：装上就能对话、挂知识库、定制智能体；需要业务空间时再上 XYOS。  
> 开源获客与信任 · 企业落地走 XYOS / 私有化（边界见下文）。

**当前桌面 Beta：`v0.5.0`** · 产品源码分支 [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) · [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

### 下载

当前安装只使用这一份 Windows 安装包。从 GitHub Release 直接下载，不需要平台账号。

| 文件 | 平台 | 链接 |
| --- | --- | --- |
| **`XYAI-Studio-0.5.0-Setup-x64.exe`** | Windows x64 | [下载 v0.5.0 Setup](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) |

- 文件大小：92,029,554 字节（发布页约 87.8 MB）。
- 安装前请先在「设置 → 应用」卸载已有的 XYAI Studio 或更旧构建，避免路径和组件冲突。
- 该安装包未做 Windows 代码签名。若 SmartScreen 提示「Windows 已保护你的电脑」，请确认文件来自上面的 Release 后再继续。
- 本 Release 尚未附带 `SHA256SUMS.txt`。下文旧预览的校验文件只覆盖 `v0.3.1-20260904-r2`。
- 0.5：本地优先 Electron + Codex 对话路径 + OpenXYOS 业务空间。

官网：[www.cnxyai.cn](https://www.cnxyai.cn/) · 逐步安装见 [Wiki · Getting Started](https://github.com/XYAIStudio/xyai-studio/wiki/Getting-Started)

> Star / Issue / 讨论都欢迎。装上后卡在哪一步，直接开 Issue 并附系统版本与报错原文。

### 旧预览 / Legacy preview

<a id="legacy-preview"></a>

本节只保留 **`v0.3.1-20260904-r2`**，供对照旧构建。当前安装使用上一节的 v0.5.0 Windows Setup。macOS 安装包只存在于这一预览。[Release 说明](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| [`XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) | Windows x64 | 旧预览简洁包 |
| [`XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) | Windows x64 | 旧预览离线完整包（含 XYOS 与本地推理运行时；模型权重仍在应用内下载） |
| [`XYAI-Studio-0.3.1-arm64.dmg`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) | macOS arm64 | 旧预览，未签名，仅 Apple 芯片 |
| [`XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip) | Windows x64 | 旧预览组件：在应用内「设置 / 组件管理」安装，避免手工覆盖程序目录 |
| [`XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip) | Windows x64 | 旧预览组件：安装后到模型广场按硬件下载模型 |

- Mac 逐步教程（仅此旧预览）：[MACOS-INSTALL.md](MACOS-INSTALL.md)
- 校验文件（仅此旧预览）：[`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)、[`release-manifest.json`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/release-manifest.json)

核对旧预览文件时，用 PowerShell 计算哈希，再与 `SHA256SUMS.txt` 中的同名行比对。遇到 SmartScreen 时先核来源与哈希。

```powershell
Get-FileHash -Algorithm SHA256 '.\XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe'
```

---

XYAI Studio 是一款本地优先的桌面智能工作台。本仓库发布 XYAI 开源层：Electron 桌面壳、XYOS 本地服务、行业智能体模块，以及相对于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的集成补丁。

## 开源层能力概览

- 根据电脑硬件推荐本地小模型，并由用户决定是否下载、部署和注册。
- 在对话中选择本地或云端模型，支持流式输出；云端模型由用户自行配置。
- 挂接本地目录或云知识库，目录树仅显示可解析的文件与子目录。
- 本机定制四类智能体：专业顾问、工作流自动化、研究与数据分析、多智能体团队。
- 工作台欢迎页、新对话入口、模型广场、知识库、智能体定制与 XYOS 业务空间。

## 开源边界

本项目不是 DeepSeek Harness 的完整镜像。为避免把第三方底座、构建产物和本机数据混在一个公开仓库中，首个开源版本采用“上游 + XYAI 叠加层”方式：

- `apps/desktop/`：XYAI Studio Electron 桌面端源码。
- `packages/client/xyai-industry-agent/`：行业智能体扩展源码。
- `xyos-backend/`：XYOS 本地服务源码；不含用户数据库、上传文件、运行时工作区和凭据。
- `patches/xyai-studio-v0.3-overlay.patch`：应用到指定上游版本的 XYAI 集成补丁。

源码树不收录安装包二进制。桌面安装包由 GitHub Releases 提供，当前 Beta 是文首的 **v0.5.0** Windows Setup。源码树不包含模型权重、用户知识库、日志、数据库、密钥或已编译的 XYOS Web 资源。Windows 整合安装包只使用桌面端统一的一份 `llama.cpp` 运行时，智能体模块不再重复携带。v0.5.0 Release 目前未附带 SHA-256 校验文件；旧预览 `v0.3.1-20260904-r2` 附有 `SHA256SUMS.txt`。

## Windows 安装（v0.5.0）

1. 在「设置 → 应用」卸载已有 XYAI Studio 或更旧构建。
2. 下载 [`XYAI-Studio-0.5.0-Setup-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe)（[Release v0.5.0](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)）。
3. 运行安装向导。该包未做 Windows 代码签名；若 SmartScreen 拦截，先确认文件来自上述 Release。本 Release 未附带 SHA-256 校验文件。
4. 启动后按需配置模型与知识库。模型权重在应用内下载。

当前 Beta 没有 macOS 安装包。Apple 芯片 DMG 只在「旧预览 / Legacy preview」，教程见 [MACOS-INSTALL.md](MACOS-INSTALL.md)。

## 哪个分支

| 分支 | 用途 |
| --- | --- |
| [`main`](https://github.com/XYAIStudio/xyai-studio/tree/main) | 仓库默认分支。不带参数的 `git clone` 得到这里。公开树以 0.3 开源层为主，README 与社区文档在此维护。 |
| [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) | 当前桌面 Beta v0.5.0 的产品源码。要对照已发布的 Windows 安装包，使用这个分支。 |

安装使用文首的 v0.5.0 Setup 即可，不必为了安装去克隆分支。

## 开始开发

本仓库依赖 DeepSeek Harness 上游工程。建议以固定提交 `dd6322d` 为基线：

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git dsh-upstream
Set-Location dsh-upstream
git checkout dd6322d
git apply ..\xyai-studio\patches\xyai-studio-v0.3-overlay.patch
robocopy ..\xyai-studio\apps\desktop apps\desktop /E
robocopy ..\xyai-studio\packages\client\xyai-industry-agent packages\client\xyai-industry-agent /E
robocopy ..\xyai-studio\xyos-backend xyos-backend /E
pnpm install
pnpm --filter @deepseek-ai/dsh-desktop run dev
```

首次启动前，请将 `xyos-backend/.env.example` 复制为 `.env`，并仅在本机填写自己的服务配置。不要把 `.env`、模型、知识库或业务数据提交到 GitHub。

## 许可证与致谢

XYAI 自有代码以 [MIT](LICENSE) 许可证发布。DeepSeek Harness 上游同样采用 MIT；使用或再发布本仓库中的叠加补丁时，必须保留上游版权与许可声明。详细内容见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 社区与支持

- **Discussions**：[讨论区](https://github.com/XYAIStudio/xyai-studio/discussions)（公告 / Q&A / Ideas / Show and tell）
- **Wiki**：[文档首页](https://github.com/XYAIStudio/xyai-studio/wiki)（安装、FAQ、架构、路线图）
- **如何获得帮助**：[SUPPORT.md](SUPPORT.md)
- Issue 模板：Bug / Feature（中英字段）；规范见 [CONTRIBUTING.md](CONTRIBUTING.md)
- 安全问题请按 [SECURITY.md](SECURITY.md) 处理，不要在公开 Issue 中披露密钥或漏洞细节
- 发版范围见 [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md)
