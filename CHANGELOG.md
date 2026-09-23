# CHANGELOG

태그마다 한 절. 릴리스 노트는 여기서 나온다(`.github/workflows/release.yml`).
**무엇이 바뀌었나**만 적는다 — 왜는 커밋 메시지와 설계서에 있다.

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

**서버 설치**
- `ops/deploy/install.sh`(멱등 · node 경로를 유닛에 박음 · healthz 확인) · `upgrade.sh`(백업 · 교체 · 재시작 · built/자산 해시 대조 · 실패 시 되돌림)
- `ctx serve doctor` — 준비물 · 명부 · 레포 · origin 도달 · push 자격 · 포트를 한 번에 · `ctx serve init` — 첫 사용자 + 토큰
- `ops/deploy/Dockerfile` · `docker-compose.yml`(선택지)

**패키지**
- 매니페스트 `_package.json` · `ctx package list · show · check · new` · `core/packages.js`
- `ctx package check` 가 부어서 `ctx check` 를 돌린다 — CI 가 패키지마다 돈다
- `_managed.md` 파서가 설명 표(첫 칸에 `배치:` 같은 타입)를 규칙으로 읽지 않는다

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
