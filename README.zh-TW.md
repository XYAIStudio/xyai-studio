# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 讓專業經驗，進化為生產力。

XYAI Studio 是一款本地優先的桌面智慧工作台。本儲存庫發布 v0.3 的 XYAI 開源層：Electron 桌面殼、XYOS 本地服務、產業智慧體模組，以及相對於 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的整合修補程式。

## v0.3 已包含的能力

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

本儲存庫不含安裝程式、模型權重、使用者知識庫、日誌、資料庫、金鑰或已編譯的 XYOS Web 資源。Windows 整合安裝包只使用桌面端資源目錄中的單一共用 `llama.cpp` 執行階段，智慧體模組不再攜帶重複副本。發行版二進位檔將透過 GitHub Releases 提供，並附上 SHA-256 校驗值。

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
