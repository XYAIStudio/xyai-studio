# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 専門的な経験を、生産力へ。

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

インストーラー、モデル重み、ユーザー知識ベース、ログ、データベース、秘密情報、コンパイル済み XYOS Web アセットは含まれません。Windows 統合パッケージはデスクトップリソース内の共有 `llama.cpp` ランタイムを 1 つだけ使用し、エージェントモジュールには重複コピーを含めません。配布バイナリは GitHub Releases で SHA-256 とともに公開します。

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
