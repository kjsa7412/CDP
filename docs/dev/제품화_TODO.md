# CDP 제품화 — 실행 TODO

2026-09-22 · 근거 [`CDP_제품화_검토 v1.0`](../design/CDP_제품화_검토_v1.0.md) · 시작 v0.8.0 → 목표 **v0.9.0**

> **검토는 확정됐다.** 결정 R1~R17 을 더 고치지 않고 실행한다. 뒤집어야 하면
> 검토 문서 §7 을 먼저 고치고 여기를 따라 고친다 — 코드에서 조용히 갈라지지 않게.
>
> 절 번호는 검토 문서 §3 의 영역 번호와 맞춘다. 체크 항목마다 **끝났다고 보는
> 기준**이 있고, 그것은 전부 명령 하나로 확인된다 — 사람이 눈으로 보는 기준은 두지 않는다.
>
> **모든 결정은 권장으로 처리한다**(운영자 지시). 물어볼 것이 생기면 항목으로 올리고
> 권장안으로 진행한 뒤 「나온 것」 표에 적는다.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 문서 | **완료** |
| 0단계 전제 | **완료** — 검토 §7 |
| 1단계 CI 기반 (P0) | **완료** — `ci.yml` · `release.yml` · 테스트 70 · 하네스 ✗ 0 |
| 2단계 산출물 · 조립 (P1) | **완료** — `assemble.mjs` · `release:server` · CHANGELOG |
| 3단계 서버 설치 자동화 (P1) | **완료** — WSL 실측(install · upgrade · 되돌림) · Docker healthz |
| 4단계 패키지 관리 (P1) | **완료** — `_package.json` · `ctx package` · `check:packages` |
| 5단계 지식 레포 생성 (P1) | **완료** — `ctx repo new` · `POST /repos` · 화면(서버판) |
| 6단계 변환 · 이관 (P2) | **완료** — `ctx import-dir` |
| 7단계 MCP 클라이언트 마무리 (P2) | **완료** — `--also` · `--desktop` · 연결 상태 · 90일 경고 |
| 8단계 문서 · 정리 (P3) | **완료** — 태그 `v0.9.0` 만 남았다(운영자) |
| 9단계 검증 완주 | **완료** — 아래 「끝난 상태」 |

### 시작 상태 (2026-09-22 실측)

```
npm run build          OK
npm run build:ctx      OK   1,608 KB
node ops/verify/run.mjs
   ✓ 50  ✗ 1  – 18        ← 52번 실패. 꾸러미 kit/ 한 단(08f5436) 뒤 하네스가 낡았다
npm test               없음
.github/               없음
```

### 끝난 상태 (2026-09-22 실측)

```
npm test                 70 / 70  (12파일)
npm run verify           ✓ 57  ✗ 0  – 17   (§10 69줄 + 제품화 70~74)
npm run check:packages   ok  dpms  문서 40 · 패턴 15 · 타입 14 · 예시 18
npm run build:ctx        1,679 KB  (node20 · MCP SDK 포함)
npm run release:server   cdp-server-v0.9.0/  88파일 4.2MB → tar.gz 1.0MB
WSL Ubuntu (systemd)     install.sh ×2 · init · repo new · doctor fail 0 · POST /repos · upgrade.sh ✓ · 깨진 번들 → 되돌림 ✓
Docker                   이미지 빌드 · /healthz · HEALTHCHECK healthy
.github/                 ci.yml · release.yml — 첫 실행은 push 뒤 (사람)
```

---

## 0. 전제 — 닫혔다

검토 문서 §7 의 R1~R17 이 전부다. 여기서는 코드가 따라야 하는 것만 다시 적는다.

- [x] CI 는 GitHub Actions · 워크플로 둘(`ci.yml` · `release.yml`) — R1
- [x] 산출물 둘 — `cdp-v<버전>-win.zip` · `cdp-server-v<버전>.tar.gz` · `SHA256SUMS` — R2
- [x] 조립 함수 하나(`ops/lib/assemble.mjs`) — R3
- [x] 패키지 매니페스트 `_package.json` · 명령은 `ctx package …` — R4 · R5
- [x] `ctx repo new` 를 서버도 부른다 · 화면에 지식 레포(서버판) — R6 · R7
- [x] `import-dir` 는 md → work 만 · 좌표 추측 없음 — R8
- [x] 서버 설치 = sh 셋 + `doctor` · `init` · Docker 는 선택지 — R9 · R10
- [x] 테스트 = `node:test` · 화면 자동 테스트 없음 — R11 · R12
- [x] Node >=20 고정 · 0.9.0 · `cdp-managed` 모드 B 는 정하지 않는다 — R13 · R14 · R15

---

## 1. CI 기반 (P0)

**관문이다.** 이것이 없으면 아래 전부가 "내 PC 에서 됐다" 에 머문다.

### 1.1 하네스를 CI 에서 돌 수 있게

- [x] **52번 수정** — 꾸러미의 `kit/` 한 단을 하네스가 알게. `kit/` 아래를 풀어 작업 레포로 옮긴 뒤 `.mcp.json` 을 읽는다 (`install.mjs` 가 하는 일과 같은 모양)
- [x] **fixture 의 `.claude/` 를 Python 없이 만든다** — `ops/lib/seed-kit.mjs`. `agent/skills` → `.claude/skills` · `agent/CLAUDE-프로젝트레포.md` → `.claude/work-repo/CLAUDE.md`. `seed_repo.py` 가 하는 일 중 그 부분만. 하네스 `stage()` 가 픽스처를 복사하기 **전에** 이것을 돈다 — fresh clone 에서 38 · 52 · 56 · 57 이 산다
- [x] 포트 · git 사용자를 환경에 기대지 않는다 — 포트는 `--port` 인자(기본 7377) · git 은 이미 `-c user.name` 을 쓴다. 확인만
- [x] `npm run verify` 스크립트 · `--slow` 는 그대로

**끝났다고 보는 기준** — `git stash -u` 로 미추적을 치운 상태(fixture/.claude 없음)에서
`npm run verify` 가 **✗ 0**.

### 1.2 단위 테스트

- [x] `test/` 폴더 · `node --test test/` · `npm test`
- [x] `auth.test.mjs` — `decide` 5단계(토큰 없음 · 무효 · 만료 · 고아 · 중지) · `userAdd/Set/List` · `issue`(명부 없는 이름 거부) · `revoke` · `signSession/readSession` 왕복 · 위조 서명 거부 · v1.0 형식 거부(`load`)
- [x] `setup.test.mjs` — `mergeClaude`(없음 · 블록 교체 · 옛 판 통째 교체 · 사람 파일 뒤에 붙임) · `kitOf` · `mergeMcpJson`(병합 · 깨진 JSON 거부) · `mcpEntryLocal`(win32 · posix) · `mcpEntryServer`
- [x] `vocab.test.mjs` — `parseVocab`(타입 순서 · alias · deprecated · 한글 타입 · `##` 산문 절 무시 · `example:`) · `reconcile`(정본 · alias · 값 · 미등재 · 정규화 키)
- [x] `managed.test.mjs` — `parseRegistry` · `resolveCoord`(첫 패턴 우선 · 대소문자 · 접두 패턴)
- [x] `validity.test.mjs` — `later` 의 세 질문 · 같은 날짜는 후속이 아니다 · 시각이 있으면 결판난다 · `supersedes` 순환 · 대상 없음
- [x] `tools.test.mjs` — `checkCoord/checkId`(`..` · 제어문자 · 절대경로) · `guardSize`
- [x] `workrepos.test.mjs` — `add`(이름 형식 · 중복 · 없는 레포 · 명부 밖 owner) · `state`(최신 · 낡음 · 미설치)
- [x] `zip.test.mjs` — `zip → unzip` 왕복 · 한글 이름 · `..` 경로가 그대로 나오는지(막는 것은 부르는 쪽)
- [x] `frontmatter.test.mjs` — `layerOf` · `parseDoc`(`확정` 소거 · `date` UTC 왕복 · `touches: []` 와 키 없음의 구분)

**끝났다고 보는 기준** — `npm test` 초록 · 테스트 파일 9 · 어느 것도 파일 시스템 밖(네트워크 · 시계)에 기대지 않는다 (`now` 를 인자로 준다)

### 1.3 Node 고정

- [x] `package.json` `engines.node >=20` · `.nvmrc` `20`
- [x] `npm run build:ctx` 의 `--target=node18` 을 **`node20`** 으로 — 서버가 20 을 요구하는데 번들만 18 을 말한다

### 1.4 `ci.yml`

- [x] `.github/workflows/ci.yml` — `push` · `pull_request` · ubuntu-latest · Node 20 · `npm ci` → `npm run build` → `npm run build:ctx` → `npm test` → `npm run verify` → `npm run check:packages`(4단계) → `npm audit --omit=dev || true`(R16)
- [x] 산출물 보관 — `ops/out/verify/result.json` 을 artifact 로 (실패했을 때 볼 것)
- [x] windows-latest 잡 하나 — `npm ci` → `npm run build:ctx` → `npm test` 까지만. exe 빌드는 릴리스에서

**끝났다고 보는 기준** — 워크플로가 부르는 명령이 **전부 `package.json` 의 스크립트**다. CI 에만 있는 명령이 없다 — 로컬에서 같은 것을 돌릴 수 있어야 한다

### 1.5 `release.yml`

- [x] 태그 `v*` 에서 — windows: `npm run release -- <버전>` → `ops/release/v<버전>/` 을 zip · ubuntu: `npm run release:server -- <버전>` → tar.gz · 둘의 `SHA256SUMS` · GitHub Release 생성 · `CHANGELOG.md` 의 그 절을 본문으로
- [x] 태그와 `package.json` 버전이 다르면 **실패한다** — 태그 없는 0.8.0 이 다시 생기지 않게

**끝났다고 보는 기준** — 로컬에서 같은 스크립트(`release` · `release:server`)가 돈다. 첫 태그 릴리스 뒤 로컬 릴리스와 `cdp.exe ctx version` · 크기를 대조한다(검토 §8 위험 1)

---

## 2. 산출물 · 조립 (P1)

### 2.1 조립 함수

- [x] `ops/lib/assemble.mjs` — `listPackages(root)` · `assembleKnowledgeRepo({ root, name, dest, exe, copyFile })`. `release.mjs` 의 패키지 루프(`need(...)` 열다섯 줄)를 그대로 옮긴다. **동작이 바뀌지 않는다** — 옮기기 전후 `ops/release/v<버전>/knowledge-repo-dpms` 를 `diff -r` 로 대조
- [x] `_package.json` 은 **담지 않는다** — 받는 사람에게 갈 것이 아니다(4단계)
- [x] `release.mjs` 가 `assemble.mjs` 를 부른다. LF 정규화 · exe 중복 가드 · `.gitkeep` 그대로

### 2.2 서버 산출물

- [x] `ops/lib/release-server.mjs` · `npm run release:server [-- <버전>]` → `ops/out/server/cdp-server-v<버전>/` —
  ```
  bin/ctx.mjs  bin/ctx  bin/ctx.cmd
  web/                       npm run build 결과
  packages/<이름>/           assemble 결과 · exe 없음
  deploy/cdp-serve.service  deploy/install.sh  deploy/upgrade.sh  deploy/Dockerfile
  README.md                  버전 · 번들 시각 · install.sh 한 줄
  ```
  → `ops/out/server/cdp-server-v<버전>.tar.gz` (`tar` 가 있으면 tar.gz · 없으면 `core/zip.js` 로 zip 을 내고 그 사실을 찍는다)
- [x] `SHA256SUMS` — 두 산출물 옆에
- [x] 빠진 것이 있으면 `exit 1` — `release.mjs` 와 같은 규칙

**끝났다고 보는 기준** — tar.gz 를 빈 폴더에 풀고 `node bin/ctx.mjs version` 이 `mcp: stdio · http` 를 내고, `node bin/ctx.mjs package list --packages packages` 가 dpms 를 낸다

### 2.3 CHANGELOG

- [x] `CHANGELOG.md` 신설 — `## v0.9.0` 절에 이 TODO 의 결과를 적는다 · 그 아래 `v0.8.0` ~ `v0.2.3` 은 태그 메시지 한 줄씩(이력이라 정확할 필요보다 있는 것이 값이다)

---

## 3. 서버 설치 자동화 (P1)

### 3.1 `install.sh`

- [x] `ops/deploy/install.sh` — 산출물 폴더 안에서 `sudo bash deploy/install.sh --bind <IP> [--port 7374] [--prefix /opt/cdp]`
  ```
  0  node ≥ 20 · git 확인.  없으면 무엇을 깔지 말하고 멈춘다 (설치절차 0장)
  1  useradd -r cdp · mkdir bin repos data web packages          (2장)      — 이미 있으면 건너뛴다
  2  bin/ · web/ · packages/ 배치 · chown                         (2장)
  3  유닛을 **command -v node 로 채워** /etc/systemd/system 에     (6장 sed)
  4  daemon-reload · enable --now · /healthz 를 5초 기다려 확인      (6장)
  5  방화벽 명령을 **안내만** (firewall-cmd · iptables 둘)          (6장)
  6  다음 할 일을 찍는다 — 3장(git 자격) · 4장(레포: repo new 또는 clone) · 5장(init)
  ```
- [x] **멱등** — 두 번 돌려도 같다. 있는 것은 건너뛰고 무엇을 건너뛰었는지 찍는다
- [x] `set -eu` · 실패 지점을 말하고 멈춘다 · 색 없음 · 한글 메시지(서버 로캘이 C 여도 깨지지 않게 **영문 병기**)

### 3.2 `upgrade.sh`

- [x] `ops/deploy/upgrade.sh <cdp-server-v*.tar.gz>` — 8장 ①②③ 그대로:
  ```
  1  tar 를 임시 폴더에 푼다.  bin/ctx.mjs · web/index.html 이 없으면 멈춘다
  2  /opt/cdp/bin/ctx.mjs.bak · web.bak 으로 되돌릴 것을 챙긴다
  3  ctx.mjs 교체 · web/ 은 **비우고** 넣는다 · packages/ 도 교체 · chown
  4  systemctl restart · /healthz 의 built 가 새 번들 시각인지 · index 의 자산 해시가 tar 의 것과 같은지
  5  다르면 .bak 으로 되돌리고 exit 1
  ```
- [x] 명부 · 대장 · 레포 · git 자격은 **건드리지 않는다** — 절차서의 그 문장을 스크립트가 지킨다

### 3.3 `ctx serve doctor`

- [x] `viewer/bin/ctx-serve-doctor.mjs` · `ctx serve doctor --root … --auth … --data … --web … [--bind] [--port]` — 유닛의 인자를 그대로 받는다
  ```
  node ≥ 20 · git 있음
  --auth 파일 존재 · POSIX 면 권한 600 · 형식(v1.1) · 사용자 수 · write 인 사람 수 · 만료 7일 내 토큰
  --root 의 폴더마다 _vocab.md · git 레포인가 · upstream · ahead(미러 밀림) · origin 도달(ls-remote · 10초) · push --dry-run
  --web/index.html · --data 쓰기 가능 · 포트 열려 있나(이미 뜬 서버면 /healthz 응답)
  packages/ 위치와 개수
  ```
- [x] 결과는 줄마다 `ok · warn · fail` · `--json` · fail 이 하나라도 있으면 exit 1 (warn 은 0)
- [x] git 자격 스코프 경고 — `.git-credentials` 에 `glpat-` 이 평문으로 있으면 **warn** 한 줄(검토 §3.10)

### 3.4 `ctx serve init`

- [x] `ctx serve init --auth <f> --data <d> --name <이름> [--label …] [--repos *] [--write]` — `user add` + `token` 을 한 번에. 이미 명부가 있으면 거절한다(덮지 않는다). 원문은 그 한 번만 출력 — `token` 과 같은 규칙

### 3.5 Docker (선택지)

- [x] `ops/deploy/Dockerfile` — `node:20-slim` + git · 산출물 폴더를 `/opt/cdp` 로 · `ctx serve --bind 0.0.0.0 --auth /opt/cdp/auth.json --root /opt/cdp/repos --data /opt/cdp/data --web /opt/cdp/web --packages /opt/cdp/packages` · `HEALTHCHECK /healthz`
- [x] `ops/deploy/docker-compose.yml` — 볼륨 `repos` · `data` · `auth.json`
- [x] **`--bind 0.0.0.0` 은 컨테이너 안이라 맞다** — README 에 그 이유를 적는다(호스트 포트 매핑이 경계)

### 3.6 절차서

- [x] `ops/deploy/설치절차.md` 를 스크립트 기준으로 다시 쓴다 — 0장(준비물 = `doctor`) · 1장(산출물 = tar.gz) · 2·6장(= `install.sh`) · 3장(git 자격 · 그대로 사람) · 4장(레포 = `repo new` 또는 clone) · 5장(= `init` + `user add`) · 7·8장 그대로 · 10장(갱신 = `upgrade.sh`)
- [x] `ops/deploy/README.md` — 무엇을 왜 · 스크립트 셋이 무엇을 하고 안 하는지

**끝났다고 보는 기준** — WSL Ubuntu 에서 `install.sh` 를 두 번 돌려 둘째가 전부 "건너뜀" · `doctor` 가 fail 0 · Docker 이미지로 `/healthz` 응답. systemd 는 WSL 에서 못 돌 수 있다 — 그때는 유닛 파일 생성까지 확인하고 `systemctl` 단계는 "건너뜀" 으로 찍힌다(스크립트가 systemd 부재를 알아야 한다)

---

## 4. 패키지 관리 (P1)

### 4.1 매니페스트

- [x] `agent/packages/dpms/_package.json` — `{ name, title, version: "1.0.0", description, source: "docs/attic/dpms-패키지/", updated }`
- [x] `agent/packages/README.md` 에 매니페스트 절 — 무엇을 적고 무엇을 **안 적나**(문서 수 · 타입 · 패턴은 계산한다)

### 4.2 `core/packages.js`

- [x] `findPackagesDir({ explicit, env, bundleDir, sourceRoot })` — `--packages` → `CDP_PACKAGES` → `<bin>/../packages` → `<소스>/agent/packages`
- [x] `listPackages(dir)` → `[{ name, manifest, docs, types, patterns, path }]` — 매니페스트 없는 폴더는 **경고와 함께** 이름만 (옛 패키지가 조용히 빠지지 않게)
- [x] `readManifest(dir)` — 없으면 `{ name: 폴더명 }` · 있으면 검증(`name` 이 폴더명과 같아야 한다)
- [x] `checkPackage(dir, { kitRoot })` — 임시 폴더에 **부어서**(kit + 패키지 · 4.5 의 assemble 과 같은 함수) `loadRepo` → `runBuiltinCheck` → error 0 이어야 한다 · 등록부의 문서마다 존재 · `example:` 어휘 줄마다 그 섹션이 문서에 있는지 · 결과 `{ ok, findings, docs, patterns, missingDocs, exampleGaps }`

### 4.3 `ctx package …`

- [x] `ctx package list [--packages <dir>] [--json]`
- [x] `ctx package show <이름>` — 매니페스트 · 등록부 표 · 어휘 타입 순서 · 문서 목록
- [x] `ctx package check [<이름>|--all]` — 4.2 · fail 이면 exit 1
- [x] `ctx package new <이름> --from <이름>` — 폴더 복사 · 매니페스트 `name/title/version` 갱신 · `check` 한 번 · "문서 목록을 고치는 것은 사람이다" 를 찍는다(R17)

### 4.4 CI

- [x] `npm run check:packages` = `ctx package check --all` · `ci.yml` 에 넣는다

### 4.5 조립과 맞물림

- [x] `assemble.mjs` 가 `_package.json` 을 **빼고** 담는다 · `checkPackage` 가 같은 `assemble` 로 붓는다 — 검사한 것과 나가는 것이 같은 모양

**끝났다고 보는 기준** — `ctx package check --all` 이 dpms 에서 `ok` · 일부러 등록부에 없는 문서를 가리키면 `fail` 로 exit 1 (테스트에 넣는다)

---

## 5. 지식 레포 생성 (P1)

### 5.1 `core/reponew.js`

- [x] `newRepo({ from, dest, origin = null, push = false, exe = null })`
  ```
  0  dest 가 없거나 빈 폴더여야 한다.  있으면 거절 (남의 폴더에 쓰지 않는다)
  1  from(완성된 지식 레포 폴더)을 복사한다 — LF 그대로.  exe 는 안 담는다
  2  work/.gitkeep · git init · config core.hooksPath .githooks
  3  git add -A · commit "지식 레포 세움 — <패키지>"   ← 훅이 돈다.  실패면 dest 를 지우고 E_CHECK
  4  origin 이 있으면 remote add origin · push 면 push -u origin HEAD
  ```
- [x] `from` 은 둘 중 하나 — **완성 폴더**(서버 `packages/<이름>/`) 또는 **소스 패키지**(`agent/packages/<이름>` · 그때는 `assemble` 로 먼저 만든다)
- [x] 결과 `{ dest, commit, files, origin, pushed }` · 실패 코드 `E_INPUT`(경로) · `E_CHECK`(첫 커밋이 막힘) · `E_GIT`

### 5.2 `ctx repo new`

- [x] `ctx repo new <경로> --package <이름> [--packages <dir>] [--origin <url>] [--push] [--dry]` — `--dry` 는 무엇을 만들지만 적는다
- [x] `ctx repo list --root <폴더>` — 서버의 `<root>` 를 훑어 이름 · `_vocab.md` · head · mirror 를 낸다(`doctor` 의 한 조각을 재사용)

### 5.3 서버

- [x] `ctx serve --packages <dir>` 인자 · 기본은 `<ctx.mjs 위치>/../packages`
- [x] `GET /packages` (쿠키 · Bearer) — `listPackages` 결과. 권한과 무관 — 패키지는 서식이라 숨길 것이 없다
- [x] `POST /repos { name, package, origin? }` (쿠키 · Bearer + **`write`**) — 이름 형식 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` · 이미 있으면 `E_EXISTS` · `newRepo` → `store.refresh()` → `auth.audit("repo new · …")` · 응답 `{ name, commit, origin }`
- [x] `push` 는 **하지 않는다** — 서버의 첫 push 는 `--mirror` 가 다음 `save` 때 한다… 가 아니다: `--mirror` 는 `save` 뒤에만 돈다. **첫 커밋을 origin 에 보내는 것은 `POST /repos` 가 `origin` 을 받았을 때 한 번 한다** — 그것이 없으면 `mirror: lag` 로 남아 사람이 손으로 풀어야 한다. 기록에 남긴다(auth.log)
- [x] 하네스 추가 — `GET /packages` 1건 이상 · `POST /repos`(write 없음 403 · 이름 형식 · 중복) · 만든 레포가 `/repos` 에 뜬다 · `tools/list` 가 그 레포로 답한다

### 5.4 화면 — 관리 > 지식 레포 (서버판)

- [x] `viewer/src/components/admin/RepoServer.jsx` — 레포 목록(이름 · 문서 · 좌표 · head · 미러) · **새 지식 레포** 카드(이름 · 패키지 select · origin 선택 입력 · 만들기) · `write` 없으면 카드 대신 안내(`WorkReposServer` 와 같은 규칙)
- [x] `AdminView.jsx` MENU — `repo` 의 `local: true` 를 풀고 `isServer ? <RepoServer/> : <Repo/>`
- [x] `api.js` — `packages()` · `repoNew(body)` · `repos()`
- [x] 만든 뒤 **주소를 바꾼다** — `gotoRepo(name)`. 화면 상태를 들고 가지 않는다(§6.6.2)

**끝났다고 보는 기준** — 하네스에서 `POST /repos` 로 세운 레포에 `save` 가 한 번 성공한다(훅 · 등록부 · 어휘가 다 살아 있다는 뜻)

---

## 6. 변환 · 이관 (P2)

### 6.1 `core/importdir.js`

- [x] `planImport(src, repo, { author, dateFrom })` → `{ files: [{ from, to, id, title, date, dateSource, author, tags, dropped, kind: 'work'|'asset' }], warnings }` — **파일을 쓰지 않는다**
- [x] 규칙(검토 §3.6 표 그대로) — 평면화 이름 · id · title · date 근거 순서(프론트매터 → 파일명 → git 최초 커밋 → mtime) · author · `touches: []` · `status` 소거 · 모르는 필드 → `tags` · 비 md → `work/assets/<조각>/` · 상대 링크 재작성 · **결정론**
- [x] `applyImport(plan)` — 쓴다. 끝에 `loadRepo` + `runBuiltinCheck` 로 error 0 확인 · 아니면 쓴 것을 지운다(`save.js` 의 `Snap` 과 같은 되돌리기)
- [x] 이름 충돌 — 같은 `to` 가 둘이면 `-2` 접미 · 보고에 적는다
- [x] 150자 넘는 파일명은 자른다(Windows MAX_PATH · 02 §4.3)

### 6.2 `ctx import-dir`

- [x] `ctx import-dir <원본> --repo <지식레포> [--author <이름>] [--dry] [--json]` — `--dry` 가 표를 찍고 끝난다 · 실행 뒤 `ctx check` 결과와 "좌표 0건 — P2 는 사람이" 안내

### 6.3 테스트

- [x] `test/importdir.test.mjs` — 임시 폴더에 하위 폴더 3단 · 프론트매터 있는/없는 md · `status: Done` · `.png` 하나 · 같은 basename 둘 → 계획이 결정론적(두 번 돌려 같다) · 충돌 접미 · 자산 링크 재작성 · 적용 뒤 `runBuiltinCheck` error 0

---

## 7. MCP 클라이언트 마무리 (P2)

- [x] `ctx setup --desktop` — `claude_desktop_config.json`(mac · win 경로) 에 `mcpServers["cdp-<폴더명>"]` 병합 · 다른 키 보존 · `mergeMcpJson` 의 형제 함수 · 테스트
- [x] `ctx setup <작업레포> --also <지식레포>` — `.mcp.json` 의 `args` 를 `["mcp","--repo",A,"--repo",B]` 로 · 항목은 하나(§2.9) · 테스트
- [x] `inspect()` 에 `mcp` 상태(`ok · update · none`) · `WorkRepos.jsx` 에 한 줄
- [x] `version.built` 90일 경과 → `brief` 에 한 줄(`ctx-mcp.mjs` 의 `notice` 자리 · CLI `brief` 도) · 하네스 20번을 **살린다**(BUILT 를 인자로 주입할 수 있게 `--built-at` 시험용 플래그 — 하네스 전용)

---

## 8. 문서 · 정리 (P3)

- [x] `docs/README.md` — 첫 줄 "보존되는가" · 폴더 표(design · dev · attic · 관리문서패키지 · 그림 · 용어)
- [x] `docs/dev/시나리오_*` 두 묶음 → `docs/attic/` · `docs/이집이지_이관/` → `docs/attic/이집이지_이관/` (링크 갱신 — `import-dir` 가 인용하는 03 §3 포함)
- [x] 루트 `README.md` 문서 표에 검토 · TODO · `docs/README` · CHANGELOG · `npm test` · `verify` · `release:server` · `ctx package/repo/import-dir` 줄
- [x] `agent/README.md` — 패키지 매니페스트 한 줄 · `ops/README.md` — 새 스크립트 셋 · `deploy/`
- [x] 설계서 §2.8 폴더 절 — `test/` · `.github/` · `ops/deploy` 스크립트 · `core/packages.js` `reponew.js` `importdir.js`
- [x] MCP 설계서 §4.2 에 한 줄 — "등록 = 폴더를 두는 것. clone 또는 `repo new`" · §6.6.3 표의 지식 레포 줄을 "서버판 있음" 으로
- [x] `package.json` 0.9.0 · `CHANGELOG.md`
- [ ] 태그 `v0.9.0` — **운영자가 단다**(push 는 사람이). `release.yml` 이 태그 = `package.json` 을 확인한다

---

## 9. 검증 완주

- [x] `npm test` 초록 · `npm run verify` ✗ 0 · `npm run check:packages` ok
- [x] `npm run build:ctx` → 번들 크기 기록 · `npm run release:server -- 0.9.0` → tar.gz 를 풀어 `ctx version` · `package list`
- [x] WSL 에서 `install.sh` 두 번 · `doctor` · `upgrade.sh` (3단계 기준)
- [x] `ctx repo new` 로 세운 레포에서 `ctx check` 이상 없음 · `ctx import-dir --dry` 표
- [x] 결과를 이 문서 「나온 것」 에 실측값으로 적는다

---

## 나온 것

단계마다 실측 · 설계와 어긋난 곳 · 잡은 버그. 2026-09-22 하루에 다 돌았다 — 결정은 전부 권장안으로.

| 단계 | 무엇 |
|---|---|
| 1 CI | 52번의 원인은 꾸러미 `kit/` 한 단 — 하네스 `stage()` 가 `seedKit` 을 먼저 돌아 fresh clone 에서도 ✗ 0. 단위 테스트가 잡은 **실제 버그** — `parseManagedSections` 의 applied 주석 탐색이 다음 제목을 넘어가 섹션 수가 하나 부풀었다. `expiresInDays` 는 그날 끝까지라 91 이 정상(테스트가 90~91 을 받는다). 테스트 12파일 70건 |
| 2 산출물 | `release.mjs` 의 패키지 루프를 `assemble.mjs` 로 옮긴 전후 `diff -r` — README 버전 줄과 뺀 `_package.json` 만 다르다. tar 는 **상대 경로 + cwd** 로 — Git for Windows 의 GNU tar 가 `C:` 를 원격 호스트로 읽는다. 서버 산출물 88파일 4.2MB → tar.gz 1.0MB |
| 3 설치 | WSL Ubuntu(systemd · node 20.20.2) — `install.sh` 두 번(둘째는 건너뜀 표시) · `serve init`(토큰 한 줄 stdout · 나머지 stderr) · `repo new` · `doctor` fail 0 warn 1(upstream 없음) · `POST /repos` → 커밋 · `upgrade.sh` 같은 판 ✓ · **깨진 번들 → 되돌림 ✓**(exit 1 · 서비스는 옛 번들로 살아 있다). 잡은 버그 — `upgrade.sh` 가 산출물 폴더를 `-maxdepth 2` 로 찾아 한 단이 모자랐다(늘 "없다"). Windows 에서 만든 tar 는 실행 비트가 없을 수 있어 `sudo bash deploy/install.sh` 로 부른다. Docker — 이미지 빌드 · `/healthz` · HEALTHCHECK healthy ✓(컨테이너 안 `init` 은 시험 셸(Git Bash)의 경로 변환에 걸려 못 봤다 — 코드는 WSL 과 같다) |
| 4 패키지 | `ctx package check dpms` 가 처음엔 FAIL — `_managed.md` 의 설명 표(첫 칸 `배치:` 등)를 규칙으로 읽었다 → `parseRegistry` 에 `ruleLike` 가드. `RE_COORD` 가 한글 타입을 거절해 dpms 좌표 전부가 `E_COORD` 였다 → 한글 첫 글자 타입을 받는다(ASCII 는 소문자만 — 대문자를 열면 `C:/…` 가 좌표가 된다, 하네스 2번) |
| 5 레포 | `newRepo` 는 `_package.json` · `convert/` · `*.exe` 를 안 담는다. 훅이 첫 커밋을 막으면 dest 를 지운다(E_CHECK). 서버는 `repos/` 를 요청 때 1분에 한 번 훑는다 — 셸로 둔 폴더는 1분 안에, 화면으로 만든 것은 즉시(설치절차 4장에 적었다) |
| 6 이관 | 검토 §3.6 과 다르게 정한 것 하나 — `touches` 는 **비우고 `tags` 에 `touches/<좌표>` 로 보존**이 기본, `--keep-touches` 가 선택. 남겨 두면 파생 문서가 없어 `runBuiltinCheck` 가 E_CHECK 로 전부 되돌리기 때문 — 이관 첫 회에 좌표를 살릴 길이 없다. 링크 재작성은 `)` 까지 읽어 공백 있는 대상도 잡는다 |
| 7 MCP | `--also` · `--desktop` · `inspect().mcp` · 90일 경고. `--built-at` 는 하네스 전용 플래그 — 20번이 살아났다 |
| 8 문서 | 구조정리 원칙(`docs/dev/` 는 안 건드린다) 그대로 — 옮긴 폴더를 가리키던 링크만 고쳤다(`MCP_적용검토_설계서` 1곳). attic 안의 옛 경로 문구는 기록이라 둔다 |
| 9 검증 | 위 「끝난 상태」. 시험 셸이 Git Bash 면 `MSYS_NO_PATHCONV=1` — `/opt/…` 인자를 `C:/Program Files/Git/opt/…` 로 바꿔 wsl · docker 에 넘긴다 |
| 10 설명서 걷기 (2026-09-23) | 세 설명서를 처음부터 그대로 따라갔다 — 로컬형(Windows · 배포본 복사 → 훅 → setup → `.mcp.json` 으로 MCP → exe) · 서버형(WSL · install → repo new → init → doctor → 로그인 → 등록 → 꾸러미 → install.mjs → MCP HTTP 13종). 잡은 것 다섯 — ① 조립이 `bin/ctx.cmd` 를 LF 로 바꿔 cmd.exe 에서 죽었다(모드 A 의 MCP 전부) → `.cmd` 는 바이트 그대로 · 지식 레포 `.gitattributes` 에 `*.cmd eol=crlf` ② `--no-build` 뒤 exe 만 낡아 세 곳의 `ctx version` 이 달랐다 → `release` 가 대조해 exit 1 ③ `repo new` 직후 등록이 "그런 지식 레포가 없다"(1분 주기) → 모르는 이름이면 다시 훑는다 ④ 뷰어 exe 가 자기 레포를 안 열었다(저장된 설정만) → 자기 위치의 부모 ⑤ 토큰을 나중에 두는 순서라 설치 보고가 안 갔다 → 순서 바꿈 · 바뀐 것 없어도 보고 |

---

## 남은 것 — 사람이 한다

| | 무엇 | 왜 사람인가 |
|---|---|---|
| 1 | `git push` · 태그 `v0.9.0` — `release.yml` 이 태그 = `package.json` 을 확인하고 zip · tar.gz · SHA256SUMS 를 Release 로 | push 는 사람이 — 결정 그대로 |
| 2 | 첫 CI 실행을 본다(ubuntu · windows 잡) · 첫 Release 의 zip 과 로컬 `npm run release` 를 대조 — 검토 §8 위험 1 | GitHub 에서만 보인다 |
| 3 | `10.10.20.188` 에 `sudo bash deploy/install.sh --bind 10.10.20.188` — 설치절차 0~7장. PAT(3장)은 스크립트가 대신할 수 없다 | 실서버 · 자격 |
| 4 | `cdp-managed` 모드 B — 설계서 §4.8 을 먼저 고친다 | R15 |

---

## 하지 않는 것

검토 §4 그대로다. 구현 중에 "겸사겸사" 넣지 않는다.

| | 왜 |
|---|---|
| 화면 자동 테스트 | R12 |
| xlsx 변환기 | R8 — 문서 구조마다 다르다. 패키지 안 `convert/` 자리만 |
| `cdp-managed` 모드 B | R15 — 설계서를 먼저 고친다 |
| HTTP 토큰 발급 | §4.4.1 — `init` 도 서버 셸의 CLI 다 |
| 관리 서비스의 명부 화면 | 명부는 서버 셸의 것 |
| 두 번째 패키지 | R17 — 만드는 길만. **정정 2026-09-23** — 운영자 지시로 `project_1` · `project_2` 를 dpms 에서 복제해 두었다(다중 패키지 경로 실측) |
| macOS CI | 실사용자 없음 |
