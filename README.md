# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 让专业经验，进化为生产力。

> **发布状态：v0.3.0 内测预览版。** 当前用于功能体验与兼容性验证；请在安装前阅读下方的下载选择、安装提示与 SHA-256 校验说明。

XYAI Studio 是一款本地优先的桌面智能工作台。本仓库发布 v0.3 的 XYAI 开源层：Electron 桌面壳、XYOS 本地服务、行业智能体模块，以及相对于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的集成补丁。

官网：[www.cnxyai.cn](https://www.cnxyai.cn/) 。产品介绍、最新动态与下载入口以官网公告为准。

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

请从 [Releases](https://github.com/XYAIStudio/xyai-studio/releases) 下载与自己需求相符的 Windows x64 安装包。安装包适用于 64 位 Windows；本地推理运行包不包含模型权重，模型仍由用户按硬件推荐自主选择和下载。

| 文件 | 适合谁 | 安装或使用方式 |
| --- | --- | --- |
| `XYAI Studio Setup 0.3.0.exe` | 希望离线完成安装、需要本地 XYOS 与本地推理能力的用户 | 双击安装，按向导完成安装即可；包含 XYOS 本地服务和一份统一的 `llama.cpp` 运行时。 |
| `XYAI-Studio-0.3.0-core-win-x64.exe` | 只需先使用核心开发空间，或希望缩小初始下载量的用户 | 双击安装；启动后可在设置中按需下载 XYOS 与本地推理组件。 |
| `XYAI-Studio-0.3.0-xyos-local-runtime-win-x64.zip` | 已安装核心版、需要本机业务空间、账户服务或智能体安装的用户 | 在应用的设置/组件管理中选择 XYOS 本地组件并安装；请勿手工覆盖应用目录。 |
| `XYAI-Studio-0.3.0-local-inference-win-x64.zip` | 已安装核心版、准备运行本地 GGUF 模型的用户 | 在应用的设置/组件管理中选择本地推理运行时并安装；随后在模型广场按硬件建议下载模型。 |

首次启动时可以先不安装可选系统组件：云端模型由用户自行配置；需要本地模型时，再按硬件推荐下载安装模型。需要完全离线、即装即用的体验时，请优先选择完整离线版。

### 安全校验与安装提示

1. 下载 Release 中同批发布的 `SHA256SUMS.txt` 和 `release-manifest.json`。
2. 在 PowerShell 中执行以下命令，将输出值与 `SHA256SUMS.txt` 中同名文件的值逐项比对：

   ```powershell
   Get-FileHash -Algorithm SHA256 '.\XYAI Studio Setup 0.3.0.exe'
   ```

3. 仅在校验一致后运行安装程序；Windows 出现未知发布者或 SmartScreen 提示时，先核对下载来源和 SHA-256，不要跳过校验。
4. 安装后若选择稍后安装 XYOS 或本地推理组件，请在 XYAI Studio 的设置/组件管理中完成下载和安装，而非解压 ZIP 后直接替换程序文件。

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
