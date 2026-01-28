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

## 라즈베리파이: 한 번만 설정하면, 이후엔 git push만 하면 됨

**당신은 PC에서 git push만 하고**, 라즈베리파이에서는 **수동 재시작 없이** pull + 서버 재시작이 자동으로 되게 하려면, Pi에서 **아래를 한 번만** 진행하세요.

### 1) 프로젝트 클론 및 경로 확인

```bash
cd ~
git clone https://github.com/kjh0772/otatest.git
cd otatest
```

경로가 `/home/pi/otatest`가 아니면 아래 단계에서 해당 경로로 바꿉니다.

### 2) systemd 서비스 설치

```bash
# 유닛 파일 복사 (경로/유저가 다르면 아래에서 수정)
sudo cp systemd/ota.service /etc/systemd/system/
sudo cp systemd/ota-updater.service /etc/systemd/system/
```

`/etc/systemd/system/ota.service`와 `ota-updater.service`를 열어 **WorkingDirectory**, **User**, **Environment** 값을 본인 Pi 경로/계정/리포에 맞게 수정합니다.

### 3) 재시작 명령 비밀번호 없이 허용 (한 번만)

updater가 `sudo systemctl restart ota`를 실행하려면, pi 계정에 해당 명령만 NOPASSWD로 허용합니다.

```bash
sudo visudo
```

맨 아래에 한 줄 추가 (저장 후 종료):

```
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart ota
```

### 4) 서비스 활성화 및 시작

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ota
sudo systemctl enable --now ota-updater
```

이후 **PC에서 git push만 하면** Pi가 주기적으로 리포를 확인하고, 변경이 있으면 `git pull` 후 웹서버를 자동 재시작합니다. Pi에서 수동으로 재시작할 필요 없습니다.

---

## "전체 커밋 내용" OTA 업데이트(수동 실행 시)

`ota.txt` 같은 단일 파일이 아니라, **리포 전체를 최신 커밋으로 자동 업데이트**하려면 `repo-updater.js`를 사용합니다.

- **동작**: GitHub 브랜치 HEAD 커밋 SHA 폴링 → 변경 감지 → `git pull` → (선택) 서버 재시작 명령 실행
- **자동 운영**: 위 "라즈베리파이 한 번만 설정"대로 systemd로 두 서비스를 켜두면, push만 해도 Pi에서 알아서 처리됩니다.

실행:

```bash
npm run updater
```

추가 환경변수:
- `OTA_REPO_POLL_MS`: 리포 폴링 주기(ms). 미설정 시 `OTA_POLL_MS` 사용
- `OTA_REPO_UPDATE_STRATEGY`: `pull`(기본) 또는 `reset`
- `OTA_REPO_EXIT_ON_UPDATE`: `1`(기본)면 업데이트 후 exit=42로 종료(감시자가 재시작)
- `OTA_REPO_POST_UPDATE_CMD`: (선택) 업데이트 직후 실행할 명령어 (예: `sudo systemctl restart ota`)

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

