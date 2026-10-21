# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 専門的な経験を、生産力へ。

**現行デスクトップ Beta：`v0.5.0`** · 製品ソース [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) · [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

### ダウンロード

インストールには次の Windows Setup だけを使います。GitHub Release から直接ダウンロードでき、プラットフォームアカウントは不要です。

| ファイル | プラットフォーム | リンク |
| --- | --- | --- |
| **`XYAI-Studio-0.5.0-Setup-x64.exe`** | Windows x64 | [v0.5.0 Setup をダウンロード](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) |

- サイズ：92,029,554 バイト（リリースページでは約 87.8 MB）。
- インストール前に「設定 → アプリ」で既存の XYAI Studio またはより古いビルドをアンインストールしてください。
- この Setup は Windows コード署名されていません。SmartScreen が表示されたら、ファイルが上記 Release のものであることを確認してから続行してください。
- この Release には `SHA256SUMS.txt` はまだありません。下の旧プレビューのチェックサムは `v0.3.1-20260904-r2` だけを対象にします。
- 0.5：ローカル優先の Electron + Codex チャット経路 + OpenXYOS ビジネス空間。

### 旧预览 / Legacy preview

<a id="legacy-preview"></a>

ここにあるのは **`v0.3.1-20260904-r2`** だけで、古いプレビューとの照合用です。現在のインストールは上の v0.5.0 Windows Setup を使います。macOS パッケージはこのプレビューにだけあります。[Release ノート](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

| ファイル | プラットフォーム | 説明 |
| --- | --- | --- |
| [`XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) | Windows x64 | 旧プレビュー（コア） |
| [`XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) | Windows x64 | 旧プレビュー（オフライン一式） |
| [`XYAI-Studio-0.3.1-arm64.dmg`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) | macOS arm64 | 旧プレビュー。未署名。Apple シリコンのみ |
| [`XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip) | Windows x64 | 旧プレビューのコンポーネント |
| [`XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip) | Windows x64 | 旧プレビューのコンポーネント |

Mac 手順（この旧プレビューのみ）：[MACOS-INSTALL.md](MACOS-INSTALL.md) · チェックサム（この旧プレビューのみ）：[`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

---

XYAI Studio は、ローカルファーストのデスクトップ AI ワークスペースです。本リポジトリでは、v0.3 の XYAI オープンソース層を公開します。Electron デスクトップシェル、ローカル XYOS サービス、業界エージェントモジュール、および [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 向け統合パッチが含まれます。

## v0.3 の主な機能

- コンピューターのハードウェアに応じて小規模なローカルモデルを推奨し、ダウンロード・導入・登録はユーザー自身が選択できます。
- チャットではローカルまたはクラウドモデルを選択でき、ストリーミング応答に対応します。クラウドモデルの設定はユーザーが管理します。
- ローカルフォルダーまたはクラウド知識ベースをマウントできます。ツリーには解析可能なファイルとフォルダーだけを表示します。
- 専門アドバイザー、ワークフロー自動化、研究・データ分析、マルチエージェントチームの 4 種類のオンデバイス・エージェントをカスタマイズできます。
- ワークスペースのウェルカムページ、新規チャット、モデルマーケット、知識ベース、エージェントカスタマイズ、XYOS ビジネスワークスペースを提供します。

## オープンソースの範囲

本リポジトリは DeepSeek Harness の完全なミラーではありません。第三者基盤、ビルド成果物、ローカルデータを明確に分離するため、初回公開では「上流 + XYAI オーバーレイ」方式を採用しています。

- `apps/desktop/` — XYAI Studio Electron デスクトップのソース。
- `packages/client/xyai-industry-agent/` — 業界エージェント拡張のソース。
- `xyos-backend/` — XYOS ローカルサービスのソース。ユーザーデータベース、アップロード、作業領域、資格情報は含みません。
- `patches/xyai-studio-v0.3-overlay.patch` — 指定された上流リビジョンに適用する XYAI 統合パッチ。

ソースツリーにはインストーラーのバイナリは含まれません。デスクトップのインストーラーは GitHub Releases で公開しており、現行 Beta は文頭の **v0.5.0** Windows Setup です。ソースツリーにはモデル重み、ユーザー知識ベース、ログ、データベース、秘密情報、コンパイル済み XYOS Web アセットは含まれません。Windows 統合パッケージはデスクトップリソース内の共有 `llama.cpp` ランタイムを 1 つだけ使用し、エージェントモジュールには重複コピーを含めません。v0.5.0 Release にはまだ SHA-256 チェックサムがありません。旧プレビュー `v0.3.1-20260904-r2` には `SHA256SUMS.txt` があります。

## どのブランチか

| ブランチ | 用途 |
| --- | --- |
| [`main`](https://github.com/XYAIStudio/xyai-studio/tree/main) | デフォルトブランチ。引数なしの `git clone` はここを取得します。公開ツリーは 0.3 のオープンソース層が中心で、README とコミュニティ文書はここで保守します。 |
| [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) | 現行デスクトップ Beta v0.5.0 の製品ソース。公開済み Windows インストーラーに対応するツリーを見るときはこのブランチを使います。 |

インストール自体は文頭の v0.5.0 Setup で足ります。

## 開発環境の準備

XYAI Studio は DeepSeek Harness 上流ソースに依存します。ベースラインにはコミット `dd6322d` を使用してください。

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

初回起動前に `xyos-backend/.env.example` を `.env` にコピーし、自分のローカルサービス設定だけを記入してください。`.env`、モデル、知識ベース、業務データは GitHub にコミットしないでください。

## ライセンスと謝辞

XYAI が所有するコードは [MIT License](LICENSE) で公開しています。DeepSeek Harness も MIT ライセンスです。結合プロジェクトを再配布する際は、上流の著作権表示とライセンス表示を保持してください。詳細は[第三者に関する通知](THIRD_PARTY_NOTICES.md)を参照してください。

## コントリビューションとセキュリティ

- Issue や Pull Request の前に [CONTRIBUTING.md](CONTRIBUTING.md) を確認してください。
- 脆弱性の報告は [SECURITY.md](SECURITY.md) に従ってください。公開 Issue に資格情報や非公開データを投稿しないでください。
- 公開範囲と除外項目は [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md) を参照してください。
