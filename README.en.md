# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> **Local-first agent workspace**: install, chat, mount knowledge, customize agents — add XYOS when you need a business workspace.  
> Open source for trust & adoption · enterprise rollout via XYOS / private deploy.

**Release: `v0.3.1-20260904-r2` (preview)** · Site [www.cnxyai.cn](https://www.cnxyai.cn/) · [Release notes](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

### Downloads

| Goal | Platform | Link |
| --- | --- | --- |
| **Try agent dev** (smaller) | Windows x64 | [Core `.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) |
| **Full offline setup** (recommended) | Windows x64 | [Full Setup `.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) |
| **Mac preview** (Apple silicon) | macOS arm64 | [Unsigned DMG](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) |

Mac install guide (Gatekeeper): [MACOS-INSTALL.md](MACOS-INSTALL.md) · Checksums: [`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

Stars / issues welcome. If install fails, open an Issue with OS version and the exact error text.

---

XYAI Studio is a local-first desktop AI workspace. This repository publishes the XYAI open-source layer: the Electron desktop shell, the local XYOS service, the industry-agent module, and integration patches for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## What v0.3 includes

- Recommends small local models based on the computer's hardware; users decide whether to download, deploy, and register them.
- Lets users choose local or cloud models in chat, with streaming responses. Cloud-model configuration remains user controlled.
- Mounts local folders or cloud knowledge bases. The tree shows only parseable files and directories.
- Supports four on-device agent customization paths: Professional Advisor, Workflow Automation, Research & Data Analysis, and Multi-agent Team.
- Provides a workspace welcome page, new-chat entry, Model Marketplace, Knowledge Base, Agent Customization, and the XYOS business workspace.

## Open-source scope

This is not a full mirror of DeepSeek Harness. To keep third-party foundations, build output, and local data clearly separated, the first open-source release follows an “upstream + XYAI overlay” model:

- `apps/desktop/` — XYAI Studio Electron desktop source.
- `packages/client/xyai-industry-agent/` — industry-agent extension source.
- `xyos-backend/` — XYOS local-service source, excluding user databases, uploads, workspaces, and credentials.
- `patches/xyai-studio-v0.3-overlay.patch` — XYAI integration patch for the documented upstream revision.

The repository excludes installers, model weights, user knowledge bases, logs, databases, secrets, and compiled XYOS web assets. Windows bundles carry a single shared `llama.cpp` runtime in the desktop resource directory; the agent module does not include a duplicate copy. Release binaries will be published through GitHub Releases with SHA-256 checksums.

## Development setup

XYAI Studio depends on the DeepSeek Harness upstream source. Use commit `dd6322d` as the baseline:

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

Before the first launch, copy `xyos-backend/.env.example` to `.env` and add only your own local service settings. Never commit `.env` files, model files, knowledge bases, or business data.

## License and acknowledgements

XYAI-owned code is released under the [MIT License](LICENSE). DeepSeek Harness is also MIT licensed. Any redistribution of a combined project must retain the upstream copyright and license notices. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Contributing and security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.
- Follow [SECURITY.md](SECURITY.md) for vulnerability reporting. Never post credentials or private data in a public issue.
- See [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md) for the release boundary and excluded material.
