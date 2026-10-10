# 제품화 2 TODO — 원큐 설치 · 쉬운 연결 · 줄인 화면

> 운영자 요청(2026-10-10) — 「유저가 들어와서 쉽게 서비스를 쓸 수 있도록 설치부터 배포 · 사용까지 전체 흐름을 점검하고, 서버 세우고 · 지식 레포 만들고 · 변경사항을 작업 레포에 반영하는 작업이 가급적 원큐에. 프로그램의 설명은 핵심만 간결하게. 페이지를 줄일 수 있으면 줄인다.」
> 짝 문서 — [`../design/CDP_제품화_검토_v2.0.md`](../design/CDP_제품화_검토_v2.0.md) (깨짐 S1~S6 · 손 F1~F16 · 화면 §4 · 안 §5 · 결정 D1~D9).
> 시작 v1.1.6 (`39c431f`) → 목표 **v1.2.0**. 커밋까지만 — push · 태그 · 실서버 upgrade · 실레포 `--update` 는 사람이.
> **범위 밖(다음 단계)** — 설명서 네 권 본문 · 공식 사이트(cdp-about.vercel.app) · 데모 다시 찍기. 여기서는 화면 안 글 · kit 안 글 · `--help` · 설계서의 해당 절만.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 | **완료** — 실측 셋(서버 · 연결 · 화면) · D1~D9 확정(2026-10-10 · 전부 권장안) |
| ① 깨짐 S1~S6 | 대기 |
| ② `nextSteps` (core) | 대기 |
| ③ 한 줄 — 개인 `ctx up` | 대기 |
| ④ 한 줄 — 팀 `install.sh` · Docker | 대기 |
| ⑤ 한 줄 — `install.mjs` 연결 · 갱신 | 대기 |
| ⑥ 화면 22 → 16 | 대기 |
| ⑦ 안내 글 | 대기 |
| ⑧ 설계서 · 판 · 검증 | 대기 |

끝났다고 보는 기준(검토 §7) — **빈 macOS 사용자 폴더에서 `ctx up ~/cdp/team --install ~/code/a ~/code/b` 한 줄 + Claude Code 재시작 한 번으로 writer · curator 가 일하고, 판 올림은 `ctx self-update <tar>` + `install.mjs --update` 두 줄.** 팀은 `install.sh --admin …` 한 줄 뒤 콘솔 「시작하기」 만 따라가면 된다. ⑧ 의 원큐 시나리오가 이것을 명령으로 확인한다.

---

## 0. 전제 — 닫혔다

- [x] 판 v1.2.0 — 데이터 · save 모양은 그대로(D1)
- [x] 개인 진입은 새 명령 `ctx up` · `serve --personal` 은 남기고 같은 함수를 쓴다(D2)
- [x] 토큰 — 파일 폴백 확정 · `headersHelper` 는 실측 뒤 결정(D3)
- [x] kit — 레포 사본 유지 + 일괄 `--update` · 플러그인화는 안 한다(D4)
- [x] 낡음 알림 — SessionStart 훅은 확인만(D5)
- [x] 화면 22 → 16 전부(D6)
- [x] 팀 — `install.sh --admin …` 끝까지 + `serve.json` · `cdp` 래퍼 · `--admin` 없으면 `/setup` 유지(D7)
- [x] writer 의 `/queue` · `/curations` · `/forms` 200 은 그대로(D9)

---

## ① 깨짐 — S1~S6

- [ ] **S1 릴리스 NFC** — `ops/lib/release-server.mjs:150` 이 bsdtar 대신 이름을 NFC 로 맞춰 싼다(`core/zip.js` 처럼 직접 쓰거나 스테이징 이름을 `normalize('NFC')` 뒤 `tar`) · 읽는 쪽(`resolveManualDir` · kit · forms 의 `readdir`)도 `.normalize('NFC')` · `install.sh` · `upgrade.sh` 의 `cp …/설치절차.md 2>/dev/null || true` 를 실패로
  - 기준: macOS 에서 `npm run release:server` → `tar -tzf … | node -e` 로 모든 이름이 NFC · 산출물 서버 doctor 에 `manual` warn 0 · `test/release.test.mjs`
- [ ] **S2 토큰 폴백** — `cdp-install.mjs:491` `resolveToken` 이 env → `~/.config/cdp/token` 순(Windows 는 사용자 환경변수 · `tokenstore.js` 한 곳)
  - 기준: `env -i HOME=<tmp> node install.mjs --update --yes` 가 저장된 토큰으로 돈다 · 시험
- [ ] **S3 커밋 가드** — add 전에 `git check-ignore` · 걸리면 멈추고 넣을 `!.claude/skills/` · `!.claude/cdp.json` 줄을 보인다 · `--fix-gitignore` 면 적용 · 커밋 실패하면 `git reset -- <rels>` · 대장 보고는 커밋된 레포만 「최신」 · 설치 후 안내의 `git add` 줄도 같은 검사
  - 기준: `.gitignore` 에 `.claude/*` 인 레포에서 `--commit` → staged 0 · exit ≠ 0 · 안내 줄 · 시험
- [ ] **S4 큐레이터 폴더 목록** — `installCurator` 가 설치 목록(`localreg`)에 `kind: 'curator'` 로 남긴다 · `--update` 가 같이 돈다 · 「낡음」 계산에 넣는다
  - 기준: kit 사본을 바꾼 뒤 `--update` 가 「바뀔 곳」 에 큐레이터 폴더를 센다
- [ ] **S5 Docker** — `--auth` 를 볼륨 안(`/opt/cdp/data/auth.json`) · HOME 을 data 쪽(git 자격 유지) · 엔트리포인트가 부트스트랩 코드를 찍는다 · `serve init` 이 빈 파일을 빈 명부로 · Dockerfile 에 `deploy/` 설치절차 포함 · `touch auth.json` 단계 삭제
  - 기준: `docker compose config` 의 바인드에 auth.json 없음 · `serve init` 빈 파일 시험 · (Docker 있으면) `compose up` → healthz · 재생성 뒤 명부 · 자격 유지
- [ ] **S6 포트** — `EADDRINUSE` 를 한 줄로(「7400 을 쓰는 서버가 있다 — 같은 레포면 그 주소 · 아니면 `--port`」) · `ctx up` 은 다음 빈 포트
  - 기준: 같은 포트 두 번 띄우기 → 스택 없음 · exit 2

## ② `nextSteps` — 다음 할 일 계산 한 곳 (I1)

- [ ] `core/nextsteps.js` — `nextSteps({ role, curate, write, server, repo, workrepos, kitStale, queue, drift })` → `[{ id, fact, action, cmd?, href?, manual: '<권>#<앵커>' }]` · 끝난 줄 · 권한 밖 줄은 내지 않는다
  - 줄: 레포 0(admin) · 관리 문서 0(curate) · 작업 레포 0(write) · 낡음 n(write) · 큐레이터 폴더 없음(curate) · 대기 n · 가장 오래된 d일(curate) · 어긋남 n(curate)
- [ ] 서버 `GET /api/next`(역할별 · 레포 선택적) · MCP `brief.lines` 에 첫 줄만(0 이면 없음)
- [ ] CLI 끝 출력 — `ctx up` · `repo new` · `install.sh`(래퍼 경유) · `install.mjs` 가 같은 함수로 체크리스트를 찍는다
- [ ] 시험 `test/nextsteps.test.mjs` — 역할 넷 × 상태 표

## ③ 한 줄 — 개인 `ctx up`

- [ ] **F1** `web/` 을 번들 옆에서 찾는다(`ctx-mcp-serve.mjs:541` · forms · kit · manual 과 같은 규칙 · 설계서 §9.3 에 web)
- [ ] `ctx up [<폴더>] [--port] [--install <폴더>…] [--curator <폴더>] [--service] [--no-open]`
  - [ ] 폴더에 `_vocab.md` 없으면 `newRepo()`(빈 폴더 · 없는 폴더는 묻지 않음 · 남이 쓰는 폴더면 멈춤)
  - [ ] 같은 레포의 서버가 떠 있으면 그 주소만 · 아니면 빈 포트(S6)
  - [ ] `preparePersonal()` → 브라우저 열기 · 토큰 원문 stdout 금지(F14 — 자동 로그인 주소는 파일 · 열기에만)
  - [ ] `--install` · `--curator` — 설치기를 프로세스 안에서 personal 토큰으로(복사 0 · 설치 목록에 남김)
  - [ ] `--service` — macOS launchd plist · Linux systemd --user 유닛 · `~/Documents` · `~/Desktop` 이면 TCC 경고와 `~/cdp/` 권장
  - [ ] 끝 출력 = `nextSteps`
- [ ] **F3** 산출물 자리 `~/.cdp/server/<v>` + `current` 를 `ctx up` 이 쓴다 · `ctx self-update <tar|url>` — 풀기 · 검증(SHA256SUMS) · symlink · 서비스 재시작 · `--update` 한 줄 안내(또는 `--update` 를 바로)
- [ ] **F14** 개인 서버 시작 안내 — `install.mjs` 를 cwd 에 쓰지 않는다(임시 폴더 · 또는 `ctx up --install`) · 작업 레포 길도 안내
- [ ] **F2** `repo new` 「다음 —」 을 `nextSteps` 로 · 「에이전트 설치」 → 「연결된 작업 레포」
- [ ] **F9** `ctx version` 에 semver · 빌드 시각
- [ ] 시험 — `test/up.test.mjs`(빈 폴더 · 있는 레포 · 포트 겹침 · `--install` 두 레포)

## ④ 한 줄 — 팀 `install.sh` · Docker

- [ ] `install.sh --admin <id> [--repo <이름> [--origin <url>]] [--pat-stdin | --ssh]` — healthz 뒤 `runInit`(토큰 한 번 · 파일 600) → `newRepo`(origin 이면 push · F6) → `git-auth` → `doctor`
- [ ] **F5** `<prefix>/serve.json`(root · auth · data · web · bind · port) · 유닛 ExecStart 가 이것을 읽는다 · `/usr/local/bin/cdp` 래퍼 — `cdp doctor` · `cdp user add` · `cdp repo new` 를 플래그 없이 · `doctor --personal` 도
- [ ] **F4** root 없이 `--prefix ~/…`(systemd 없으면 파일만 · 끝 문구에 실행 줄) · 끝 문구의 옛 `credential.helper store` 삭제 · 「위 코드」 는 코드를 찍었을 때만
- [ ] **F6** CLI `repo new --origin` 이면 push(콘솔과 같게) · push 실패 시 다시 하는 한 줄
- [ ] **F7** `git-auth` 는 서비스 사용자 HOME 에만 · 개인 서버면 레포 로컬 `credential.helper`(전역 금지)
- [ ] **F8** 관리자 토큰 만료 — 팀 관리자도 무기한 선택(`--no-expire`)· 만료 14일 전 `nextSteps` 줄
- [ ] **F9** `user add --curate` 출력 · `user list` 의 큐레이터 열 · 문서 · 화면의 `CTX=…; $CTX` 패턴을 `cdp` 래퍼로
- [ ] `upgrade.sh` — 끝에 kit 이 바뀌었으면 「작업 레포 · 큐레이터 폴더: `install.mjs --update`」 한 줄 · `doctor` 는 래퍼로
- [ ] 기준: WSL 또는 Linux 컨테이너에서 `install.sh --admin a --repo team --origin <bare>` 한 줄 → healthz · 로그인 · 레포 · push · `cdp doctor` ok

## ⑤ 한 줄 — `install.mjs` 연결 · 갱신

- [ ] **F11** `--connect <상위 폴더>` — 아래 git 레포 목록 → 고르기(한 번) → 서버 `POST /workrepos` 배열(새 모양 · 하나도 받음) → 설치 → 커밋은 `--commit` 일 때만
- [ ] **F12** 큐레이터 폴더 응답에서 `.claude/work-repo/` 를 거른다(`ctx-mcp-serve.mjs:1896`)
- [ ] **F13** 서버 주소 — `--public-url` 우선 · 설치 목록 비교에서 `localhost` · `127.0.0.1` · `[::1]` 을 하나로
- [ ] **F15** 워크스페이스 사본 — `--folder <경로>`(비 git · 스킬만)를 설치 목록에 `kind: 'folder'` 로 · `--update` 가 같이
- [ ] **F16** `~/.config/cdp` 를 0700 으로(먼저 만드는 쪽이 누구든)
- [ ] **D5** SessionStart 훅(writer · curator kit) — 블록의 `cdp:kit` ≠ 서버 kit 해시면 `install.mjs --update` 한 줄을 낸다 · 자동 적용 없음 · 서버가 안 닿으면 조용히
- [ ] **D3** `headersHelper` 실측 — `.mcp.json` 이 `~/.config/cdp/token` 을 읽는 헬퍼(macOS · Linux · Windows) · 워크스페이스 trust · 토큰 재발급 뒤 `/mcp` 재연결만으로 되는지
  - 통하면: 설치기의 `.zshrc` 줄을 선택(`--shell-env`)으로 내리고 사용자 안내에서 「재시작」 을 「`/mcp` 재연결」 로 · 안 통하면: 결과를 「나온 것」 에 적고 지금 길 유지
- [ ] 기준: 샌드박스 HOME 에서 `--connect <폴더>`(레포 둘) → 서버 대장 2 · kit 사본 변경 → `--update` 가 레포 둘 + 큐레이터 폴더 + 사본 폴더를 센다 · 시험

## ⑥ 화면 22 → 16

레포 화면(10 → 7)

- [ ] **읽기** — 문서 + 작업 기록 하나(왼쪽 목록 위 세그) · `/w` 는 거름 주소로 · 대기 배지는 세그 위
- [ ] 그래프 — 빈 상태 글(`CoordGraph.jsx:602` `_vocab.md` → 「좌표는 큐레이터의 save 로 생긴다」 + nextSteps)
- [ ] **대기열** — 이력을 탭으로(`manage/curation/log` 는 탭 주소) · 0 인 숫자 카드 · 빈 판정 재료 카드 안 그림 · 큐레이터 폴더 줄 제거(→ 시작하기)
- [ ] 진단 — 메뉴 아래쪽 · 신호 0 이면 [지시 복사] · [스냅샷] 없음(`Drift.jsx:153`)
- [ ] **관리 문서** — 서식집을 「문서 추가 › 서식집」 탭으로 · 0 종이면 서식집 → `cdp-registry` 지시 복사 · viewer 에게 지우기 요청 글 없음(`Docs.jsx:211`)
- [ ] 연결된 작업 레포 — 등록 직후 설치 줄 펼침(`LinkedWorkRepos.jsx:85`) · 설치 안내는 명령 한 줄 + 두 줄 + 설명서 절 링크 · viewer 에게 등록 카드 · 「아래에서 등록하세요」 없음 · `:198` / `:251` 두 문장 정리 · 낡음 카드는 시작하기로
- [ ] 현황 — 맨 위 「시작하기」 · 큐레이션 카드는 대기열 링크 한 줄 · 「탭을 다 닫은 자리」 삭제

콘솔(7 → 4)

- [ ] 현황 — 첫 진입에 진단(60초 캐시) · 「시작하기」(admin)
- [ ] 지식 레포 — 작업 레포 대장을 펼침 열로(`/console/workrepos` → 거름 주소)
- [ ] **사람** — 사용자 + 토큰 · [발급] 한 곳(`/console/tokens` → 거름 주소)
- [ ] **서버** — 설정 · 진단 · 감사 · 로그(감사 · 로그 접힘 · `/console/audit` → 거름 주소)

사이트 얼굴

- [ ] 소개 — 로그인한 사람에게 「이 서버」 숫자 대신 「시작하기」
- [ ] 설명서 목록 — 개발자 · 서버 설치 절차는 접힘
- [ ] 문서 화면 빈 상태(`App.jsx:905-918`) · `NoRepo.jsx` 를 「시작하기」 로

공통

- [ ] `components/Start.jsx` — `GET /api/next` 를 그리는 부품 하나(줄 = 사실 · 단추 · `?` 절 링크) · 세 자리(문서 빈 상태 · 레포 현황 · 콘솔 현황)
- [ ] 메뉴 표(`shell/nav.js`) · 얼굴 고르기(`shell/routes.js`) · 옛 주소 거름 · 메뉴 수 viewer 5 · writer 5 · curator 7 · admin 11
- [ ] 화면 시험 · 브라우저 실측(역할 넷 × 빈 레포 · fixture) · 전환 깜빡임 없음 유지

## ⑦ 안내 글

규칙(화면 설계서에 넣는다) — ① 화면 하나에 한 줄(`hint` 40자 안쪽) ② 빈 상태는 한 문장 + 다음 할 일 하나 ③ 권한 밖 일은 안내 안 함 ④ 설계 근거는 화면에서 뺌 ⑤ 숫자 · 장 번호 · 경로는 서버 값 ⑥ 설명서와 같은 글은 절 링크로

- [ ] 설명서 절 앵커 — `Manual.jsx` 의 hash 를 쓰는 `manualLink(권, 앵커)` · 앵커 표는 서버가 설명서에서 뽑아 낸다(손으로 장 번호 안 씀 — `Console.jsx:80` 「6장」)
- [ ] 서버 값으로 — 스킬 수 · 도구 수(`CuratorFolder.jsx:20` 「다섯」) · auth 경로(`Console.jsx:75` `/opt/cdp/auth.json`) · `__CTX_BUILT__` 없으면 안 그림
- [ ] 설계 근거 문장 빼기 — 「알림을 띄우지 않습니다」(두 곳) · 「서버는 LLM 을 부르지 않는다」(`Queue.jsx:169`) · 상태 칩 범례(`Repos.jsx:328` → `?`) · 「커밋과 push 는 서버가」 한 곳으로
- [ ] kit 안 글 · `--help` — 큐레이터 스킬 여섯 · 도구 13(`agent/README.md` · `core/kit.js:7` · `agent/install.md:86`) · CLAUDE 블록의 설치 · 갱신 안내를 한 줄 명령으로
- [ ] 기준: `grep` 시험 — 화면 소스에 「N장」 · 「다섯」 · `/opt/cdp` 리터럴 0 · 화면마다 `hint` 하나

## ⑧ 설계서 · 판 · 검증

- [ ] 시스템 설계서 v2.0 §9(배포 — `ctx up` · `self-update` · `serve.json` · 래퍼 · Docker 자리) · MCP 설계서 §11(설치 목록 kind · `--connect` · 토큰 폴백 · 훅 · §11.1 스킬 여섯 · §11.3 병합) · 화면 설계서(메뉴 표 · 시작하기 · 글 규칙 · 「숨김 ≠ 막힘」 한 줄) · 용어(시작하기 · 다음 할 일)
- [ ] `docs/dev/에이전트세팅_갱신_TODO.md` 머리에 「v1.0 이후 — 낡음」 한 줄 · `ops/deploy/README.md` 의 옛 설계서 이름 · compose 주석
- [ ] 하네스(`npm run verify`) 원큐 시나리오 — 빈 HOME → `ctx up <tmp> --install a b --curator c` → MCP `brief` 200 → kit 사본 변경 → `install.mjs --update --commit` 이 넷을 센다 → `self-update` → `/api/next` 가 빈 배열
- [ ] 단위 시험 전부 · 하네스 ✗ 0 · `npm run build` · `release:server` 를 macOS 에서(S1)
- [ ] 판 1.2.0 · CHANGELOG 절
- [ ] 「나온 것」 표 채우기

---

## 나온 것

| | |
|---|---|
| | |
