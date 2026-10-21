# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 讓專業經驗，進化為生產力。

**目前桌面 Beta：`v0.5.0`** · 產品原始碼分支 [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) · [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

### 下載

目前只使用這一份 Windows 安裝包。從 GitHub Release 直接下載，不需要平台帳號。

| 檔案 | 平台 | 連結 |
| --- | --- | --- |
| **`XYAI-Studio-0.5.0-Setup-x64.exe`** | Windows x64 | [下載 v0.5.0 Setup](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) |

- 檔案大小：92,029,554 位元組（發布頁約 87.8 MB）。
- 安裝前請先在「設定 → 應用程式」解除安裝既有的 XYAI Studio 或更舊組建。
- 此安裝包未做 Windows 程式碼簽章。若 SmartScreen 提示已保護你的電腦，請確認檔案來自上面的 Release 再繼續。
- 本 Release 尚未附帶 `SHA256SUMS.txt`。下方舊預覽的校驗檔只涵蓋 `v0.3.1-20260904-r2`。
- 0.5：本地優先 Electron + Codex 對話路徑 + OpenXYOS 業務空間。

### 旧预览 / Legacy preview

<a id="legacy-preview"></a>

本節只保留 **`v0.3.1-20260904-r2`**，供對照舊組建。目前安裝請用上一節的 v0.5.0 Windows Setup。macOS 安裝包只存在於這一預覽。[Release 說明](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

| 檔案 | 平台 | 說明 |
| --- | --- | --- |
| [`XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) | Windows x64 | 舊預覽精簡包 |
| [`XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) | Windows x64 | 舊預覽離線完整包 |
| [`XYAI-Studio-0.3.1-arm64.dmg`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) | macOS arm64 | 舊預覽，未簽章，僅 Apple 晶片 |
| [`XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip) | Windows x64 | 舊預覽元件 |
| [`XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip) | Windows x64 | 舊預覽元件 |

Mac 教學（僅此舊預覽）：[MACOS-INSTALL.md](MACOS-INSTALL.md) · 校驗（僅此舊預覽）：[`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

---

XYAI Studio 是一款本地優先的桌面智慧工作台。本儲存庫發布 v0.3 的 XYAI 開源層：Electron 桌面殼、XYOS 本地服務、產業智慧體模組，以及相對於 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的整合修補程式。

## 開源層能力概覽

- 依據電腦硬體推薦本地小型模型，並由使用者自行決定是否下載、部署及註冊。
- 在對話中選擇本地或雲端模型，支援串流回應；雲端模型設定由使用者自行管理。
- 掛接本地資料夾或雲端知識庫，目錄樹僅顯示可解析的檔案與子目錄。
- 在本機自訂四類智慧體：專業顧問、工作流程自動化、研究與資料分析、多智慧體團隊。
- 提供工作台歡迎頁、新對話入口、模型廣場、知識庫、智慧體自訂與 XYOS 業務空間。

## 開源範圍

本專案不是 DeepSeek Harness 的完整鏡像。為了清楚區隔第三方底座、建置產物與本機資料，第一個開源版本採用「上游 + XYAI 疊加層」方式：

- `apps/desktop/`：XYAI Studio Electron 桌面端原始碼。
- `packages/client/xyai-industry-agent/`：產業智慧體擴充原始碼。
- `xyos-backend/`：XYOS 本地服務原始碼；不含使用者資料庫、上傳檔案、工作區及憑證。
- `patches/xyai-studio-v0.3-overlay.patch`：套用至指定上游修訂版本的 XYAI 整合修補程式。

原始碼樹不收錄安裝包二進位檔。桌面安裝包由 GitHub Releases 提供，目前 Beta 是文首的 **v0.5.0** Windows Setup。原始碼樹不包含模型權重、使用者知識庫、日誌、資料庫、金鑰或已編譯的 XYOS Web 資源。Windows 整合安裝包只使用桌面端資源目錄中的單一共用 `llama.cpp` 執行階段，智慧體模組不再攜帶重複副本。v0.5.0 Release 目前未附帶 SHA-256 校驗檔；舊預覽 `v0.3.1-20260904-r2` 附有 `SHA256SUMS.txt`。

## 哪個分支

| 分支 | 用途 |
| --- | --- |
| [`main`](https://github.com/XYAIStudio/xyai-studio/tree/main) | 儲存庫預設分支。不帶參數的 `git clone` 會得到這裡。公開樹以 0.3 開源層為主，README 與社群文件在此維護。 |
| [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) | 目前桌面 Beta v0.5.0 的產品原始碼。要對照已發布的 Windows 安裝包，請使用這個分支。 |

安裝使用文首的 v0.5.0 Setup 即可。

## 開始開發

XYAI Studio 依賴 DeepSeek Harness 上游工程。請使用提交 `dd6322d` 作為基準：

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

首次啟動前，請將 `xyos-backend/.env.example` 複製為 `.env`，並僅在本機填入自己的服務設定。請勿將 `.env`、模型、知識庫或業務資料提交到 GitHub。

## 授權與致謝

XYAI 自有程式碼以 [MIT License](LICENSE) 發布。DeepSeek Harness 上游同樣採用 MIT 授權；使用或再發布結合專案時，必須保留上游的著作權與授權聲明。詳情請見[第三方聲明](THIRD_PARTY_NOTICES.md)。

## 參與與安全

- 提交規範請見 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全問題請依 [SECURITY.md](SECURITY.md) 處理，請勿在公開 Issue 揭露金鑰或漏洞細節。
- 發版範圍與未納入公開儲存庫的內容請見 [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md)。
