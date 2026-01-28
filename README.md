# Node.js OTA 테스트 (GitHub 변경 추적)

이 프로젝트는 GitHub의 특정 파일(또는 텍스트)을 주기적으로 확인해 변경사항이 있으면 로컬 상태를 업데이트하고, 간이 웹서버에서 현재 OTA 문자열을 노출합니다.

## 목표

- 브라우저에서 `ota v1.0` → `ota v1.1` 처럼 변경되는지 확인
- GitHub 변동사항 감지 시 자동 업데이트

## 실행

1) Node.js 18+ 설치 권장(내장 `fetch` 사용)
2) 의존성 설치 없음(내장 모듈만 사용)
3) 실행:

```bash
npm start
```

## "전체 커밋 내용" OTA 업데이트(선택)

`ota.txt` 같은 단일 파일이 아니라, **리포 전체를 최신 커밋으로 자동 업데이트**하려면 `repo-updater.js`를 사용합니다.

- **동작**: GitHub 브랜치 HEAD 커밋 SHA 폴링 → 변경 감지 → `git pull`(기본) → 종료(재시작 유도)
- **라즈베리파이 권장**: systemd/pm2로 `npm run updater`를 항상 실행 (업데이트 시 자동 재시작)

실행:

```bash
npm run updater
```

추가 환경변수:
- `OTA_REPO_POLL_MS`: 리포 폴링 주기(ms). 미설정 시 `OTA_POLL_MS` 사용
- `OTA_REPO_UPDATE_STRATEGY`: `pull`(기본) 또는 `reset`
- `OTA_REPO_EXIT_ON_UPDATE`: `1`(기본)면 업데이트 후 exit=42로 종료(감시자가 재시작)

## 설정 (환경변수)

> `.env.local` 등 환경설정 파일은 건드리지 않습니다. 필요 시 PowerShell에서 환경변수를 설정해 실행하세요.

- `OTA_PORT`: 웹서버 포트 (기본: `3000`)
- `OTA_POLL_MS`: GitHub 폴링 주기(ms) (기본: `5000`)
- `OTA_GH_OWNER`: GitHub owner(유저/조직) (예: `myaccount`)
- `OTA_GH_REPO`: GitHub repo 이름 (예: `ota-test`)
- `OTA_GH_BRANCH`: 브랜치 (기본: `main`)
- `OTA_GH_PATH`: 리포 내 파일 경로 (예: `ota.txt`)
- `OTA_GH_TOKEN`: (선택) GitHub 토큰. private repo 또는 rate limit 회피용

PowerShell 예시:

```powershell
$env:OTA_GH_OWNER="myaccount"
$env:OTA_GH_REPO="ota-test"
$env:OTA_GH_PATH="ota.txt"
npm start
```

## 확인

- `http://localhost:3000/` : 현재 OTA 텍스트 표시
- `http://localhost:3000/version` : 순수 텍스트(테스트용)

