# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> **Local-first agent workspace**: install, chat, mount knowledge, customize agents — add XYOS when you need a business workspace.  
> Open source for trust & adoption · enterprise rollout via XYOS / private deploy.

**Current desktop beta: `v0.5.0`** · product source [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) · [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

### Download

Install from this Windows Setup only. The file is a direct GitHub Release download; no platform account is required.

| File | Platform | Link |
| --- | --- | --- |
| **`XYAI-Studio-0.5.0-Setup-x64.exe`** | Windows x64 | [Download v0.5.0 Setup](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) |

- Size: 92,029,554 bytes (about 87.8 MB on the release page).
- Uninstall any existing XYAI Studio or older build in Settings → Apps before installing, so leftover paths and components do not collide.
- This Setup is not Windows-code-signed. If SmartScreen says Windows protected your PC, confirm the file came from the Release above before you continue.
- This Release does not include `SHA256SUMS.txt`. The checksum file in the legacy section covers `v0.3.1-20260904-r2` only.
- 0.5: local-first Electron + Codex chat path + OpenXYOS business space.

Site: [www.cnxyai.cn](https://www.cnxyai.cn/) · steps: [Wiki · Getting Started](https://github.com/XYAIStudio/xyai-studio/wiki/Getting-Started)

Stars / issues welcome. If install fails, open an Issue with OS version and the exact error text.

### 旧预览 / Legacy preview

<a id="legacy-preview"></a>

These files are **`v0.3.1-20260904-r2`**, kept for comparison with the older preview. Current installs use the v0.5.0 Windows Setup above. The only macOS package is in this preview. [Release notes](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

| File | Platform | Notes |
| --- | --- | --- |
| [`XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) | Windows x64 | Legacy core preview |
| [`XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) | Windows x64 | Legacy offline full setup (includes XYOS and the local inference runtime; model weights still download in-app) |
| [`XYAI-Studio-0.3.1-arm64.dmg`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) | macOS arm64 | Legacy unsigned preview, Apple silicon only |
| [`XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip) | Windows x64 | Legacy component: install from in-app Settings / component manager |
| [`XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip) | Windows x64 | Legacy component: then download a model from the marketplace |

Mac install guide for this preview only: [MACOS-INSTALL.md](MACOS-INSTALL.md) · Checksums for this preview only: [`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

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

The source tree does not vendor installer binaries. Desktop installers are published on GitHub Releases; the current beta is the **v0.5.0** Windows Setup at the top of this file. The tree still excludes model weights, user knowledge bases, logs, databases, secrets, and compiled XYOS web assets. Windows bundles carry a single shared `llama.cpp` runtime in the desktop resource directory; the agent module does not include a duplicate copy. The v0.5.0 Release does not yet include a SHA-256 checksum file. Legacy preview `v0.3.1-20260904-r2` ships `SHA256SUMS.txt`.

## Windows install (v0.5.0)

1. Uninstall any existing XYAI Studio or older build in Settings → Apps.
2. Download [`XYAI-Studio-0.5.0-Setup-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) ([Release v0.5.0](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)).
3. Run the installer. The package is unsigned. If SmartScreen appears, confirm the file came from that Release. This Release does not include a SHA-256 checksum file.
4. Launch the app and configure models and knowledge bases as needed. Model weights download in-app.

There is no macOS package for the current beta. The Apple-silicon DMG is only in [旧预览 / Legacy preview](#legacy-preview). Guide: [MACOS-INSTALL.md](MACOS-INSTALL.md).

## Which branch

| Branch | Role |
| --- | --- |
| [`main`](https://github.com/XYAIStudio/xyai-studio/tree/main) | Default branch. A plain `git clone` lands here. The public tree is the 0.3 open-source layer, and this README plus community docs are maintained here. |
| [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) | Product source for desktop beta v0.5.0. Use this branch when you need the tree that matches the published Windows Setup. |

Installing does not require cloning either branch. Use the v0.5.0 Setup above.

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

## Community and support

- **Discussions**: [forum](https://github.com/XYAIStudio/xyai-studio/discussions) (Announcements / Q&A / Ideas / Show and tell)
- **Wiki**: [Home](https://github.com/XYAIStudio/xyai-studio/wiki)
- **How to get help**: [SUPPORT.md](SUPPORT.md)
- Issue templates: Bug / Feature (zh+en fields); see [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md) — never post secrets in public issues
- Scope: [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md)
