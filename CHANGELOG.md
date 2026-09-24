# CHANGELOG

태그마다 한 절. 릴리스 노트는 여기서 나온다(`.github/workflows/release.yml`).
**무엇이 바뀌었나**만 적는다 — 왜는 커밋 메시지와 설계서에 있다.

## v0.10.0

제품 관리 서비스 — [`docs/design/CDP_제품관리서비스_검토_v0.1.md`](docs/design/CDP_제품관리서비스_검토_v0.1.md) · [`docs/dev/제품관리서비스_TODO.md`](docs/dev/제품관리서비스_TODO.md)

**세 얼굴 한 프로세스** — `ctx serve` 가 주소로 얼굴을 고른다
- 사이트 `/` 소개 · `/manual/<책>` 설명서(서버가 든 `manual/` 원문을 화면이 렌더 · GitHub 규칙 slug) · `/login`(JSON · `next`) · `/setup` 첫 관리자 마법사 · `/r` 빈 상태
- 콘솔 `/console` 일곱 — 현황 · 사용자(매트릭스) · 토큰(원문 1회 · 재발급 · 폐기 회색) · 지식 레포(세우기 · clone · grant) · 작업 레포 · 서버(진단 · 로그 · 파일 위치) · 감사
- 레포 화면 — 레포 메뉴 항상(쓰기/읽기 칩) · who 에 설명서 · 콘솔 · 역할 칩 · 관리 메뉴에 「콘솔로 →」 · 도움말에 제품 설명서
- 화면: `lib/router.jsx`(의존성 0) · `main.jsx` 가 `App` · `Site` · `Console` 을 고름 · `styles/site.css` · `console.css` · `Icon` 열 개

**명부 v1.2** — `core/auth.js`
- `role` viewer · writer · admin(`write: true` 는 writer 로 읽힘) · 토큰 `status` active · revoked(폐기가 행으로 남는다) · `reissue` = 폐기 + 발급 · `tokenSet`
- 기본 만료 관리자 30일 · 나머지 90일 · 남은 일수는 달력 날짜 차이 · 가드 `E_LAST_ADMIN` · `E_SELF`
- 부트스트랩 코드 `<data>/bootstrap.code`(명부가 비었을 때만 · 쓰면 삭제) · 재인증 쿠키 `cdp_su`(15분 · `kind: sudo`)
- CLI `serve init`(첫 사용자 admin) · `user add/set --role` · `token reissue` · `token set` · `serve doctor` 에 관리자 수 · 관리자 토큰 30일 · 부트스트랩 · manual 줄

**서버** — `viewer/bin/ctx-mcp-serve.mjs`
- `/site/info` · `/site/manual/<파일>` · `POST /setup` · `POST /admin/sudo` · `/admin/*` 열여덟(overview · users · tokens · repos · workrepos · doctor · server · audit · log) — 비관리자 403 · 쓰기는 `cdp_su` 없으면 401 `E_REAUTH`
- `--manual <dir>` · `--private-pages` · `--admin-from <CIDR,…>`(관리 API 대역) · 속도 제한 `/login` · `/setup` · `/admin/sudo` 20/분 → 429 `E_RATE`(`core/net.js`)
- `buildRepo` 하나를 `POST /repos` 와 `POST /admin/repos` 가 같이 쓴다 · `core/reponew.js` `cloneRepo`(지식 레포가 아니면 지운다)
- `serve.log` 끝 열에 토큰 id · `auth.log` 콘솔 줄은 `admin <행위> · <행위자> · …` · `index.html` 에 `window.__CDP_SERVER__` · `/logout` → `/` · `GET /` 는 소개(레포로 보내지 않는다)
- 정적 자원은 인증 앞에서 낸다 · `linkify` 가 `install.sh` 같은 파일 이름을 주소로 삼지 않는다(`fuzzyLink` off)

**산출물 · 설치**
- `cdp-server-v*.tar.gz` 에 `manual/`(세 권 · 설치 절차 · 그림) · `install.sh` 가 끝에 `/setup` 주소와 부트스트랩 코드 · `upgrade.sh` 가 `manual` 도 갈고 되돌린다 · Dockerfile `COPY manual`
- `build-ctx` 가 `__CDP_VERSION__` 을 찍어 서버가 판을 안다

**문서**
- 관리자 설명서 3.5(마법사) · 3.7(세 얼굴) · 6장(콘솔 기준 · 셸은 같은 것) · 7.5 · 11장 · 부록 A · B · C · 사용자 설명서 0장 · 2.1 · 8.1 · 10.3 · 개발자 설명서 11.2 · 11.3 · 부록 C · 설치절차 5장 · 7장 · deploy README · 루트 README 「사이트 · 콘솔」
- MCP 설계서 §4.3 · §4.4.1 · §4.4.2 · §6.3 · §6.6.4 에 **정정** 상자(지우지 않는다) · 목업 `docs/dev/제품관리서비스_목업/`

**올리기 — v0.9.0 서버에서**
- `upgrade.sh` 한 번(`manual/` 도 갈고 `.bak` 한 세대) · 유닛은 그대로 — `manual/` 은 `bin/` 옆에서 찾는다
- 명부 v1.1 은 읽을 때 `write: true` → `writer` 로 접히고 첫 저장에서 `version: 1.2` 가 된다. **관리자가 0명**이라 콘솔이 잠겨 있다 — 셸에서 한 번 `ctx serve user set --name <아이디> --role admin`. 부트스트랩 코드 · `/setup` 은 명부가 빈 서버에만 있다
- 그 관리자의 옛 토큰은 90일이라 `doctor` 가 「관리자 토큰 … 30일 안으로 둔다」 를 낸다 — 콘솔 > 토큰 > [재발급]
- `GET /` 가 소개 페이지다(전에는 `/r/<레포>` 로 보냈다). `/r/<레포>/` 북마크 · 로그인 상태는 그대로 — 관리자 설명서 9.1

**검증**
- 테스트 87(auth 14 · net 3 · reponew clone) · 하네스 78~88(사이트 · 마법사 · `/admin/*` · 재인증 · 토큰 · 만료 · clone · v1.1 명부 · CIDR · 속도 제한) — ✓ 73 ✗ 0 – 16

## v0.9.0

제품화 1차 — [`docs/design/CDP_제품화_검토_v1.0.md`](docs/design/CDP_제품화_검토_v1.0.md) · [`docs/dev/제품화_TODO.md`](docs/dev/제품화_TODO.md)

**CI/CD**
- GitHub Actions `ci.yml`(push · PR: build · bundle · `npm test` · `check:packages` · `verify`) · `release.yml`(태그 `v*` → win zip · server tar.gz · SHA256SUMS → GitHub Release)
- 단위 테스트 `test/` 12파일(`node:test` · 의존성 0) · `npm test`
- 검증 하네스를 `npm run verify` 로 · fresh clone 에서 돈다(`ops/lib/seed-kit.mjs` 가 fixture 의 `.claude/` 를 Python 없이 만든다) · 52번(꾸러미 `kit/` 한 단) 수정 · 20번(번들 90일 경고) 살림 · 제품화 70~74 추가
- Node `>=20` 고정(`engines` · `.nvmrc`) · 번들 target `node20`

**산출물**
- 서버 산출물 `cdp-server-v<버전>.tar.gz`(`npm run release:server`) — `bin/` · `web/` · `packages/` · `deploy/`
- 조립 함수 하나(`ops/lib/assemble.mjs`)로 클라이언트 릴리스와 서버 산출물이 같은 지식 레포 폴더를 낸다
- `npm run release -- --no-build` — 조립만 다시
- 클라이언트 배포본의 `cdp.exe` 는 **루트에 하나**(2026-09-23) — 패키지마다 `tools/` 에 넣지 않는다. 조립은 빈 `tools/`(`.gitkeep`)를 남기고 받는 사람이 복사한다(설치.md ③). 패키지 셋에서 213MB → 75MB

**서버 설치**
- `ops/deploy/install.sh`(멱등 · node 경로를 유닛에 박음 · healthz 확인) · `upgrade.sh`(백업 · 교체 · 재시작 · built/자산 해시 대조 · 실패 시 되돌림)
- `ctx serve doctor` — 준비물 · 명부 · 레포 · origin 도달 · push 자격 · 포트를 한 번에 · `ctx serve init` — 첫 사용자 + 토큰
- `ops/deploy/Dockerfile` · `docker-compose.yml`(선택지)

**패키지**
- 매니페스트 `_package.json` · `ctx package list · show · check · new` · `core/packages.js`
- `ctx package check` 가 부어서 `ctx check` 를 돌린다 — CI 가 패키지마다 돈다
- `_managed.md` 파서가 설명 표(첫 칸에 `배치:` 같은 타입)를 규칙으로 읽지 않는다
- 복제 패키지 `project_1` · `project_2`(dpms 에서 · 2026-09-23) — 다중 패키지 경로 실측. `package new` 가 README 제목 · 출처를 함께 고치고 `convert/` 는 복사하지 않는다 · 릴리스 README 가 패키지 표를 낸다 · 화면의 새 지식 레포가 패키지를 **고르게** 한다 · `repo new` 와 `POST /repos` 가 없는 패키지 이름에 있는 것을 같이 낸다 · 하네스 74번이 `--all`
- `ctx package rename <이름> <새 이름> [--title]` — 폴더 · 매니페스트 · README 제목을 한 번에. 패키지 이름은 적용하는 프로젝트에 맞춰 바뀌는 것이 정상이고 `project_*` 는 자리표시자다. 패키지 이름 ≠ 지식 레포 이름

**지식 레포 생성**
- `ctx repo new <경로> --package <이름> [--origin] [--push]` · `ctx repo list --root` · `core/reponew.js`
- 서버 `GET /packages` · `POST /repos`(write) · 관리 서비스에 **지식 레포** 메뉴(서버판) — 목록 · 미러 상태 · 새 레포 세우기
- `ctx serve --packages <dir>`

**변환 · 이관**
- `ctx import-dir <원본> --repo <지식레포>` · `core/importdir.js` — md 폴더 → `work/` (평면화 · id · date 근거 · 필드 접기 · 자산 · 링크 재작성 · 결정론 · 검사 뒤 되돌림)

**MCP 클라이언트**
- `ctx setup --also <지식레포>`(한 항목에 레포 여럿) · `ctx setup --desktop`(Claude Desktop 설정 병합)
- 작업 레포 화면에 MCP 연결 상태 · `inspect().mcp`
- `brief` 가 90일 넘은 번들을 경고한다(CLI · MCP 같은 줄)

**끊김** — [`docs/dev/끊김_검토.md`](docs/dev/끊김_검토.md)
- `git.status()` 가 git 을 한 번만 띄운다(`status --porcelain=v2 --branch`) — 재스캔 · 포커스마다 서버가 0.3~0.6초 멈추던 것
- 전문 색인을 자체 구현으로(`core/search.js`) · 쓸 때 짓는다 — **`minisearch` 의존성 제거**. 점수 규칙은 같다
- `git fetch` 는 한 번에 하나 · 60초 안에는 다시 안 한다 · 포커스 새로고침은 15초에 한 번
- 본문의 표·코드 블록은 화면 근처에 온 것만 그린다(`content-visibility`) · 렌더 결과를 기억한다 — 표 수백 개짜리 문서 열기 2~4초 → 0.3초, 그래프에서 돌아오기 7초 → 0.3~0.5초
- 목차 — 현재 섹션을 프레임당 한 번 · 목차 목록만 스크롤 · 섹션 이동이 즉시 이동으로
- 그래프 배치를 다시 풀지 않는다

**고친 것**
- MCP 도구가 한글 타입 좌표(`테이블정의서:…`)를 `E_COORD` 로 거절하던 것 — dpms 레포의 좌표 전부가 그랬다
- `# 제목` 바로 아래 `## 첫 섹션` 의 applied 주석을 제목의 것으로 읽어 섹션 수가 하나 부풀던 것
- 조립이 `bin/ctx.cmd` 를 LF 로 바꿔 cmd.exe 에서 죽던 것 — `.mcp.json` 이 띄우는 파일이라 **모드 A 의 MCP 가 통째로 빠졌다**(설명서 걷기 2026-09-23). `.cmd` 는 바이트 그대로 담고, 지식 레포 `.gitattributes` 에 `*.cmd text eol=crlf`. 있는 레포는 그 한 줄을 넣고 `git add --renormalize .`
- `npm run release` 가 exe 안의 ctx 판과 번들 판을 대조한다 — 다르면 빠진 것으로 exit 1 (`--no-build` 뒤 exe 만 낡는 사고 · 같은 걷기에서 잡았다)
- 서버가 새 지식 레포 폴더를 그 이름의 첫 요청에서 바로 알아본다 — 전에는 1분 주기만이라 `repo new` 직후의 등록이 "그런 지식 레포가 없다" 였다
- 뷰어 exe 가 **자기가 든 지식 레포**(`<레포>/tools/cdp.exe`)를 연다 — 전에는 저장된 설정만 봐서 첫 더블클릭이 경로 지정 화면이었다
- 꾸러미 `install.mjs` 가 바뀐 것이 없어도 `CDP_TOKEN` 이 있으면 설치 대장에 보고한다 — pull 로 받은 사람도 한 번 돌리면 행이 `최신`. 사용자 설명서 2.1 은 토큰을 먼저 두게 순서를 바꿨다
- **헤딩이 두 번 들어가 섹션이 비던 것** — `section` 의 `body`(헤딩부터 실린 원문)를 그대로 고쳐 `save` 에 보내면 서버가 헤딩을 또 붙여 파서가 둘째 헤딩을 새 섹션으로 읽었다. save 는 성공하고 check 도 where 도 조용했다(실사용 2026-09-23). 셋을 두었다 — `section` 이 `content`(헤딩 · applied 없는 본문)를 준다 · `save` 가 섹션 레벨 이하 헤딩이 든 body 를 `E_INPUT` 으로 거절한다 · `ctx check` 가 같은 좌표 섹션 둘을 `dup-anchor` 오류로 낸다. 스킬 넷의 save 안내도 `content` 로

**문서**
- `docs/README.md`(보존 기준) · `CHANGELOG.md` · 설치 절차서를 스크립트 기준으로 · 시나리오 실측 출력과 이집이지 이관을 `docs/attic/` 으로
- 역할별 **제품 설명서** 세 권 — [`manual/`](manual/) 사용자 · 관리자 · 개발자. 원천은 여기, `agent/manual/` 은 레포 안 짧은 판

## v0.8.0 — 2026-09-19 (태그 없음)

- 좌표 타입을 어휘가 정한다 · 서식 예시는 좌표로 세지 않는다(`example:`)
- MCP 서버 두 모드(stdio · HTTP) · 명부 · `save` · 관리 서비스 · 설치 꾸러미 · 검증 하네스 51건 (2026-09-21~22)

## v0.7.0 — 2026-09-16

- 검색 세 갈래 · 상단 동기화

## v0.6.0 — 2026-09-16

- 관리 화면 — 현황 · 지식 레포 · 동기화 · 작업 레포 · 진단
- 동기화 순서를 `core/sync.js` 로 · 단계를 SSE 로 · `syncLog` `setupLog`

## v0.5.0 — 2026-09-15

- 왼쪽을 세 층으로 · 아이콘을 인라인 SVG 17종으로 · 토큰 재설계

## v0.4.1 — 2026-09-14

- 목차를 세워서 본문 옆에

## v0.4.0 — 2026-09-11

- 왼쪽이 한 번에 하나만 한다 · 그래프 전체화면 · 상단바 9→4

## v0.3.8 — 2026-09-09

- postject 선언 · 문서 정정

## v0.3.3 ~ v0.3.7 — 2026-09-09

- `ctx search` · 검토 출력에 주입 범위 · 파생 초안이 목차를 보인다 · `issue:` 누락 검사

## v0.3.2 — 2026-09-08

- 찾기만 · 뻗어나가기 접기 · 구 배치 · 이름 토글

## v0.3.1 — 2026-09-08

- 앱에서 작업 레포 세팅 · 경로 포인터(`.claude/cdp.json`)

## v0.3.0 — 2026-09-08

- `date` 에 시각 · 그래프 렌즈 배치

## v0.2.9 — 2026-09-08

- `MANUAL-시스템.md` 정본 · 스킬 실사용 예시

## v0.2.8 — 2026-09-08

- 읽기 전 최신 확인

## v0.2.7 — 2026-09-08

- `cdp-import` · `cdp-edit`

## v0.2.6 — 2026-09-08

- `status` 값 전면 폐지 · 같은 날 파생 누락 경고

## v0.2.0 ~ v0.2.5 — 2026-09-08

- 판정 모델 정리 · 폴더 재편 · 배포본 원클릭
