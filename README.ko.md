# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 전문 경험을 생산성으로 진화시킵니다.

**현재 데스크톱 Beta: `v0.5.0`** · 제품 소스 [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) · [Release](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.5.0)

### 다운로드

설치에는 이 Windows Setup 하나만 사용합니다. GitHub Release에서 바로 받으며, 플랫폼 계정은 필요하지 않습니다.

| 파일 | 플랫폼 | 링크 |
| --- | --- | --- |
| **`XYAI-Studio-0.5.0-Setup-x64.exe`** | Windows x64 | [v0.5.0 Setup 다운로드](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.5.0/XYAI-Studio-0.5.0-Setup-x64.exe) |

- 크기: 92,029,554바이트(릴리스 페이지 기준 약 87.8 MB).
- 설치 전에 설정 → 앱에서 기존 XYAI Studio 또는 더 오래된 빌드를 제거하세요.
- 이 Setup은 Windows 코드 서명이 되어 있지 않습니다. SmartScreen이 뜨면 파일이 위 Release에서 온 것인지 확인한 뒤 계속하세요.
- 이 Release에는 `SHA256SUMS.txt`가 아직 없습니다. 아래 이전 미리보기의 체크섬은 `v0.3.1-20260904-r2`만 다룹니다.
- 0.5: 로컬 우선 Electron + Codex 대화 경로 + OpenXYOS 비즈니스 공간.

### 旧预览 / Legacy preview

<a id="legacy-preview"></a>

여기 파일은 **`v0.3.1-20260904-r2`** 이며, 이전 미리보기와 대조할 때만 사용합니다. 현재 설치는 위의 v0.5.0 Windows Setup을 사용합니다. macOS 패키지는 이 미리보기에만 있습니다. [Release 설명](https://github.com/XYAIStudio/xyai-studio/releases/tag/v0.3.1-20260904-r2)

| 파일 | 플랫폼 | 설명 |
| --- | --- | --- |
| [`XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-core-win-x64.exe) | Windows x64 | 이전 미리보기 코어 |
| [`XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-full-Setup-0.3.1-20260904-r2.exe) | Windows x64 | 이전 미리보기 오프라인 전체 설치 |
| [`XYAI-Studio-0.3.1-arm64.dmg`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-arm64.dmg) | macOS arm64 | 이전 미리보기, 서명 없음, Apple Silicon 전용 |
| [`XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-xyos-local-runtime-win-x64.zip) | Windows x64 | 이전 미리보기 구성 요소 |
| [`XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/XYAI-Studio-0.3.1-20260904-r2-local-inference-win-x64.zip) | Windows x64 | 이전 미리보기 구성 요소 |

Mac 안내(이 이전 미리보기만): [MACOS-INSTALL.md](MACOS-INSTALL.md) · 체크섬(이 이전 미리보기만): [`SHA256SUMS.txt`](https://github.com/XYAIStudio/xyai-studio/releases/download/v0.3.1-20260904-r2/SHA256SUMS.txt)

---

XYAI Studio는 로컬 우선 방식의 데스크톱 AI 작업 공간입니다. 이 저장소는 v0.3의 XYAI 오픈 소스 계층을 공개합니다. Electron 데스크톱 셸, 로컬 XYOS 서비스, 산업 에이전트 모듈, 그리고 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 통합 패치가 포함됩니다.

## v0.3 주요 기능

- 컴퓨터 하드웨어에 따라 소형 로컬 모델을 추천하며, 다운로드·배포·등록 여부는 사용자가 결정합니다.
- 대화에서 로컬 또는 클라우드 모델을 선택할 수 있고 스트리밍 응답을 지원합니다. 클라우드 모델 설정은 사용자가 직접 관리합니다.
- 로컬 폴더 또는 클라우드 지식 베이스를 마운트합니다. 트리에는 파싱 가능한 파일과 하위 폴더만 표시됩니다.
- 전문 자문, 워크플로 자동화, 연구·데이터 분석, 멀티 에이전트 팀의 네 가지 온디바이스 에이전트를 맞춤 설정할 수 있습니다.
- 작업 공간 환영 페이지, 새 대화 진입점, 모델 마켓플레이스, 지식 베이스, 에이전트 맞춤 설정, XYOS 비즈니스 작업 공간을 제공합니다.

## 오픈 소스 범위

이 프로젝트는 DeepSeek Harness의 전체 미러가 아닙니다. 서드파티 기반, 빌드 산출물, 로컬 데이터를 명확히 분리하기 위해 첫 오픈 소스 릴리스는 “업스트림 + XYAI 오버레이” 방식을 사용합니다.

- `apps/desktop/` — XYAI Studio Electron 데스크톱 소스.
- `packages/client/xyai-industry-agent/` — 산업 에이전트 확장 소스.
- `xyos-backend/` — XYOS 로컬 서비스 소스. 사용자 데이터베이스, 업로드 파일, 작업 공간, 자격 증명은 제외됩니다.
- `patches/xyai-studio-v0.3-overlay.patch` — 문서화된 업스트림 리비전에 적용하는 XYAI 통합 패치.

소스 트리에는 설치 프로그램 바이너리가 들어 있지 않습니다. 데스크톱 설치 파일은 GitHub Releases에 있으며, 현재 Beta는 글 앞의 **v0.5.0** Windows Setup입니다. 소스 트리에는 모델 가중치, 사용자 지식 베이스, 로그, 데이터베이스, 비밀 정보 또는 컴파일된 XYOS 웹 자산이 포함되지 않습니다. Windows 통합 패키지는 데스크톱 리소스 디렉터리의 공유 `llama.cpp` 런타임 한 개만 사용하며, 에이전트 모듈에는 중복 사본을 넣지 않습니다. v0.5.0 Release에는 아직 SHA-256 체크섬 파일이 없습니다. 이전 미리보기 `v0.3.1-20260904-r2`에는 `SHA256SUMS.txt`가 있습니다.

## 어느 브랜치인가

| 브랜치 | 용도 |
| --- | --- |
| [`main`](https://github.com/XYAIStudio/xyai-studio/tree/main) | 기본 브랜치입니다. 인자 없는 `git clone`은 여기를 받습니다. 공개 트리는 0.3 오픈 소스 계층이 중심이고, README와 커뮤니티 문서는 여기서 유지합니다. |
| [`release/0.5`](https://github.com/XYAIStudio/xyai-studio/tree/release/0.5) | 현재 데스크톱 Beta v0.5.0의 제품 소스입니다. 게시된 Windows 설치 파일과 맞는 트리를 보려면 이 브랜치를 사용합니다. |

설치는 글 앞의 v0.5.0 Setup으로 하면 됩니다.

## 개발 환경 준비

XYAI Studio는 DeepSeek Harness 업스트림 소스에 의존합니다. 기준 커밋으로 `dd6322d`를 사용하세요.

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

처음 실행하기 전에 `xyos-backend/.env.example`을 `.env`로 복사하고, 자신의 로컬 서비스 설정만 입력하세요. `.env`, 모델, 지식 베이스 또는 업무 데이터는 GitHub에 커밋하지 마세요.

## 라이선스 및 고지

XYAI 소유 코드는 [MIT License](LICENSE)로 공개됩니다. DeepSeek Harness도 MIT 라이선스를 사용합니다. 결합 프로젝트를 사용하거나 재배포할 때는 업스트림의 저작권 및 라이선스 고지를 유지해야 합니다. 자세한 내용은 [서드파티 고지](THIRD_PARTY_NOTICES.md)를 참조하세요.

## 기여 및 보안

- Issue 또는 Pull Request를 열기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 확인하세요.
- 취약점 보고는 [SECURITY.md](SECURITY.md)를 따르세요. 공개 Issue에 자격 증명이나 비공개 데이터를 게시하지 마세요.
- 공개 범위와 제외 항목은 [docs/OPEN_SOURCE_SCOPE.md](docs/OPEN_SOURCE_SCOPE.md)에서 확인할 수 있습니다.
