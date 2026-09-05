# XYAI Studio

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

> 전문 경험을 생산성으로 진화시킵니다.

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

이 저장소에는 설치 프로그램, 모델 가중치, 사용자 지식 베이스, 로그, 데이터베이스, 비밀 정보 또는 컴파일된 XYOS 웹 자산이 포함되지 않습니다. Windows 통합 패키지는 데스크톱 리소스 디렉터리의 공유 `llama.cpp` 런타임 한 개만 사용하며, 에이전트 모듈에는 중복 사본을 넣지 않습니다. 배포 바이너리는 GitHub Releases를 통해 SHA-256 체크섬과 함께 제공합니다.

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
