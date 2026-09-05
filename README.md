# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> **本地优先的智能体工作台**：装上就能对话、挂知识库、定制智能体；需要业务空间时再上 XYOS。  
> 开源获客与信任 · 企业落地走 XYOS / 私有化（边界见下文）。

**当前发版：`v0.3.1-20260904-r2`（内测预览）** · 官网 [www.cnxyai.cn](https://www.cnxyai.cn/) · [Release 说明](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

### 下载（点哪个？）

| 你想… | 平台 | 下载 |
| --- | --- | --- |
| **先试试**智能体开发（体积更小） | Windows x64 | [简洁包 `.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) |
| **一次装齐**少折腾（推荐大多数人） | Windows x64 | [离线完整包 `.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) |
| **Mac 试用**（Apple 芯片） | macOS arm64 | [未签名 DMG](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) |

- Windows 专业向（本机 XYOS）：先装简洁包，再在应用内「设置 / 组件管理」装 [`xyos-local-runtime` zip](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip)。  
- Mac 安装逐步教程（含 Gatekeeper）：[MACOS-INSTALL.md](MACOS-INSTALL.md)  
- 校验：同 Release 的 [`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

> Star / Issue / 讨论都欢迎。装上后卡在哪一步，直接开 Issue 并附系统版本与报错原文。

---

XYAI Studio 是一款本地优先的桌面智能工作台。本仓库发布 XYAI 开源层：Electron 桌面壳、XYOS 本地服务、行业智能体模块，以及相对于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的集成补丁。

## v0.3 已包含的能力

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

当前不包含任何安装包、模型权重、用户知识库、日志、数据库、密钥或已编译的 XYOS Web 资源。Windows 整合安装包只使用桌面端统一的一份 `llama.cpp` 运行时，不再在智能体模块重复携带。发布版二进制文件将通过 GitHub Releases 提供，并附带 SHA-256 校验值。

## Windows 安装与下载

请优先使用文首三个下载按钮对应的 **`v0.3.1-20260904-r2`** 文件；完整说明见 [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)。

| 文件 | 适合谁 | 怎么用 |
| --- | --- | --- |
| `XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe` | 先体验智能体开发 | 双击安装；XYOS 网络连接；更多组件可在设置中按需装 |
| `XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe` | 想一次装齐（推荐） | 双击安装；含 XYOS 与本地推理运行时等；**模型权重仍需在应用内下载** |
| `XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip` | 要本机 XYOS 业务空间 | 在「设置 / 组件管理」安装，勿手工覆盖程序目录 |
| `XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip` | 要本地 GGUF 运行时 | 在组件管理中安装后，到模型广场按硬件下载模型 |

### 安全校验与安装提示

1. 下载同批 `SHA256SUMS.txt` / `release-manifest.json`。
2. PowerShell 校验示例：

   ```powershell
   Get-FileHash -Algorithm SHA256 '.\XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe'
   ```

3. 与 `SHA256SUMS.txt` 中同名行比对一致后再安装；遇 SmartScreen 时先核来源与哈希。
4. 可选组件请在应用内组件管理安装，不要解压 ZIP 直接覆盖安装目录。

## macOS 安装与下载

- 包：`XYAI-Studio-0.3.1-arm64.dmg`（**仅 Apple 芯片**，未签名内测）
- 教程：[MACOS-INSTALL.md](MACOS-INSTALL.md)
- 已含 Metal 版 `llama-server` 与 XYOS 依赖；模型权重仍在应用内下载。

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

## 参与与安全

- 提交规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](SECURITY.md) 处理，不要在公开 Issue 中披露密钥或漏洞细节。
- 发版范围与不纳入公开仓库的内容见 [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md)。
