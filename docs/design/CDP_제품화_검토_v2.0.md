# CDP 제품화 검토 v2.0 — 원큐 설치 · 쉬운 연결 · 줄인 화면

2026-10-10 · 대상 v1.1.6 (`39c431f`) · 앞 판 [`CDP_제품화_검토_v1.0`](CDP_제품화_검토_v1.0.md)(v0.8 — 산출물 · CI) · 후속 [`docs/dev/제품화2_TODO.md`](../dev/제품화2_TODO.md)

> **무엇인가** — 처음 온 사람이 **서버를 세우고 → 지식 레포를 만들고 → 작업 레포를 붙이고 → 판이 오르면 따라 올리는** 길을
> 실제로 걸어 보고, 손이 드는 자리 · 깨지는 자리 · 화면이 말을 너무 많이 하는 자리를 적는다.
> 설명서 · 공식 사이트(cdp-about.vercel.app) 최신화는 **이 작업이 끝난 뒤** 따로 한다 — 여기서는 화면 안 글과 코드만.
>
> 근거는 전부 샌드박스 실측이다(scratchpad · 포트 7811~7832 · 실서버 :7400 · `~/.cdp` 는 건드리지 않음).
> ① 서버 설치 · 레포 세우기(개인 · 팀 · Docker) ② 작업 레포 · 큐레이터 폴더 연결과 갱신 ③ 화면 22개 × 역할 넷.

---

## 0. 한 줄

**기능은 다 돈다. 그런데 처음 길이 「개인 5~6 명령 · 팀 약 14 단계 · 문서 넷」이고, 판이 오를 때마다 운영자가 6~10 단계를 손으로 반복한다.**
게다가 macOS 에서 싼 tar 가 한글 파일명 때문에 **조용히 깨진다**(§2 S1). 화면은 22개(admin 메뉴 17)인데 빈 상태가 다음 할 일을 말하지 않고,
설명서 2장이 화면에 그대로 옮겨져 있다.

제품화 v2 는 기능을 더하는 일이 아니라 **세 개의 「한 줄」을 만드는 일**이다.

```
ctx up <폴더>                         개인 서버 — 빈 틀 · 화면 · 토큰 · 브라우저 · (선택) 작업 레포 설치 · 서비스 등록
install.sh --admin <id> --repo …      팀 서버 — 설치 · 첫 관리자 · 첫 레포 · git 자격 · doctor · 설정 기억
node install.mjs --update             판이 오른 뒤 — 이 PC 의 작업 레포 · 큐레이터 폴더 전부(토큰 파일에서)
```

그리고 화면은 **「시작하기」 카드 하나**가 상태를 읽어 다음 할 일 한 줄을 내고, 나머지 안내는 한 줄 + 설명서 절 링크로 줄인다(22 → 16).

---

## 1. 지금의 길 — 실측

| 길 | 명령 | 읽을 문서 | 알아야 할 플래그 · 결정 | 손으로 옮기는 비밀 |
|---|---|---|---|---|
| **개인 서버** | 5~6 — tar 풀기 → `repo new` → `serve --personal --web <산출물>/web` → 주소 열기 → `install.mjs` 받기 → 폴더마다 설치 | 관리자 설명서 부록 D(번들 README 에는 없음) | `--web`(빠지면 화면 없음) · `--port` · `--data` · `--mirror` | `personal.token` 붙여넣기 |
| **팀(Linux)** | 약 14 — 풀기 → `install.sh` → 방화벽 → GitLab 프로젝트 → PAT → `git-auth` → `/setup` → 레포 → 사람 · 토큰 → 큐레이터 → `doctor`(플래그 7) → 작업 레포 | 넷이 겹친다 — 설치절차 543줄 · 관리자 741줄 · deploy/README · 번들 README | `--bind` `--port` `--prefix` `--user` · PAT/SSH · `--origin`+`--push` · `--root/--auth/--data/--web` 반복 | 부트스트랩 코드 · 관리자 토큰 · PAT · 사람마다 토큰 · 공개 키 |
| **Docker** | 3 — touch → `compose up` → `/setup` | deploy/README · 설명서 2.6 | 볼륨 · auth.json 자리 | 부트스트랩 코드(`compose logs` 에만) |
| **writer 합류** | 2 + 브라우저 — 토큰 받기 → 로그인 → 등록 → [설치 방법] 펼치기 → 한 줄 → 재시작 → 커밋 | 사용자 설명서 0 · 2장 | — | 토큰 2~3회(브라우저 · 설치기 · 받을 때) |
| **큐레이터 폴더** | 1 — `--curator --repo X .` → 재시작 | 큐레이터 설명서 1.1 | — | 토큰 0~1 |
| **작업 레포 N개** | N × 2(설치 · 커밋) · 묻는 창 N × 2 | — | — | — |
| **판 올림(개인 · 운영자 실제)** | 6~10 — release → 복사 → symlink → 재시작 → 레포마다 `--update` → 큐레이터 폴더 → 사본 cp → Claude Code 재시작 | 메모 | — | — |

잘 되는 것 — `/setup` 마법사(코드 → 토큰 → 콘솔) · `POST /admin/repos` 의 origin 즉시 push · `doctor` 의 push 자격 줄 · `/login?auto=` · PAT stdin ·
`upgrade.sh` 의 백업 · 해시 대조 · 자동 되돌림 · `--update` 한 줄이 등록된 레포 전부를 도는 것 · 얼굴 전환에 문서 교체 없음(SPA 실측).

---

## 2. 깨지는 것 (S — 고치지 않으면 제품이 아니다)

| | 무엇 | 실측 · 근거 |
|---|---|---|
| **S1** | **macOS 에서 싼 서버 tar 의 한글 파일명이 NFD** — 설명서를 못 찾고(`/_설명서\.md$/` 불일치 · doctor `warn manual 없다`), Linux 에 올리면 `kit/CLAUDE-*.md` 를 못 읽어 작업 레포에 CLAUDE 블록이 안 갈 것으로 본다. `install.sh` 의 `cp …/설치절차.md` 는 `|| true` 로 조용히 빠진다 | `tar -tzf | od -c` → `\341\204\211…` · `ops/lib/release-server.mjs:150`(bsdtar). CI(ubuntu) tar 는 정상인데 설치절차 1장의 첫 길은 「개발 PC 의 release:server」 |
| **S2** | **`--update` 가 저장된 토큰 파일을 안 읽는다** — `CDP_TOKEN` env 만. rc 를 안 읽는 셸 · IDE 터미널 · cron 에서 「CDP_TOKEN 이 없거나…」 | `cdp-install.mjs:491` · `env -i HOME=…` 실측 |
| **S3** | **`.gitignore` 가 `.claude/*` 를 막으면 `--commit` 이 실패하고 스테이징을 남긴다** · 안내하는 `git add .mcp.json .claude CLAUDE.md` 는 exit 0 으로 스킬을 조용히 빼먹는다 · 그래도 대장엔 「최신」 | `cdp-install.mjs:343` · w1 실측 `M  CLAUDE.md` staged |
| **S4** | **큐레이터 폴더는 일괄 갱신 · 낡음 감지 밖** — 설치 목록에 안 남는다 | `installCurator` 에 `remember()` 없음(`cdp-install.mjs:238-284`) · kit 변경 뒤 `--update` 「이미 최신 2」 vs `--curator --dry` 「바뀔 것 2」 |
| **S5** | **Docker 의 auth.json 자리가 문서와 다르다** — 바인드 원본은 `deploy/auth.json`(없으면 Docker 가 디렉터리로 만든다) · 새 판 폴더에는 없어 **명부가 사라지는 길** · 빈 파일이면 `serve init` 실패(`Unexpected end of JSON input`) · `/setup` 은 성공(두 길이 다르다) · HOME(`/opt/cdp`)이 볼륨 밖이라 PAT 가 컨테이너와 같이 사라질 것으로 본다 | `compose config` · `Dockerfile:29` · `deploy/README.md:69` |
| **S6** | 포트가 겹치면 날 스택(`EADDRINUSE`) — 개인 서버 기본 7400 고정이라 레포 둘이면 바로 | 실측 |

---

## 3. 손이 드는 것 (F — 원큐를 막는 자리)

### 3.1 서버 · 레포

| | 무엇 | 근거 |
|---|---|---|
| F1 | `web/` 만 번들 옆을 안 찾는다 — 산출물에서 `--web` 없이 띄우면 「npm run build 를 돌려…」(개발자 문구) | `ctx-mcp-serve.mjs:541` · forms · kit · manual 은 옆을 찾는다(설계서 §9.3) |
| F2 | 개인 서버의 「한 줄」이 없다 — `repo new` + `serve --personal --web` + 토큰 복사 + 설치기. `repo new` 의 「다음 —」 은 개인 서버를 모르고, 화면 이름도 틀리다(「에이전트 설치」 → 실제 「연결된 작업 레포」) | `ctx-repo.mjs:48` · `nav.js:95` |
| F3 | 개인 서버의 판 올림 도구가 없다 — 새 tar 마다 `--web` 경로가 바뀌어 실행 줄을 고친다 · 운영자는 `service-control/cdp.sh` 로 제품 밖에서 한다 | 운영 메모 |
| F4 | 팀 설치가 마지막에 사람에게 넘긴다 — 부트스트랩 → `/setup` → 레포 → git-auth → doctor 가 따로. 끝 문구는 옛 손 절차(`credential.helper store`)를 권한다 · systemd 없으면 「위 코드」 가 없는데 「위 코드」 라 한다 | `install.sh:156-157` |
| F5 | `doctor` · `user` · `repo new` 가 설정을 기억 못 한다 — 매번 플래그 7개 · `doctor --personal` 모름 · 서버는 이미 안다(유닛 ExecStart) | `ctx-serve-doctor.mjs:43` |
| F6 | CLI `repo new` 는 `--origin` 과 `--push` 를 따로 받는다(콘솔은 origin 이면 push) · push 실패 시 다시 하는 법이 없다 | `buildRepo` vs `ctx-repo.mjs` |
| F7 | `git-auth` 가 실행한 사람의 **전역** gitconfig 를 바꾼다 — 개인 PC 에서 내 git 설정을 건드린다 | 가짜 HOME 실측 |
| F8 | 팀 관리자 토큰 30일 만료 → 매달 재발급 · env 교체 | `/setup` 응답 `expires` |
| F9 | `ctx version` 에 semver 가 없다(빌드 시각만) · `user add --curate` 결과에 큐레이터가 안 찍힌다 · zsh 에서 문서의 `CTX="sudo -u cdp node …"; $CTX` 가 안 된다 | 실측 |

### 3.2 작업 레포 · 큐레이터 폴더 · 갱신

| | 무엇 | 근거 |
|---|---|---|
| F10 | 토큰이 **`.zshrc` export + Claude Code 재시작**에 기대고 있다 | `tokenstore.js` · 설치 실측(`~/.config/cdp/token` · `.zshrc` 한 줄 · `workrepos.json`) |
| F11 | 작업 레포를 하나씩 붙인다 — 등록 API 하나씩(`POST /workrepos`) · 설치기 레포 하나씩. 서버 대장엔 PC 경로가 없어 서버 기준 `--all` 은 불가 → **PC 의 설치 목록(localreg)** 이 기준이어야 한다 | §6.7.1 |
| F12 | 큐레이터 폴더에 kit 내부 `.claude/work-repo/CLAUDE.md` 가 그대로 깔린다(블록 두 벌) | `ctx-mcp-serve.mjs:1896` |
| F13 | 서버 주소가 요청 Host 로 정해진다 — `localhost` 로 받은 PC 와 `127.0.0.1` 로 받은 PC 의 설치 목록이 갈리고, 주소 · 포트를 바꾸면 행이 고아 | `publicOrigin` · `forServer()` |
| F14 | 개인 서버 시작 안내가 `install.mjs` 를 **cwd 에 쓰라** 한다(작업 레포에 낡은 사본 · 소스 실행이면 소스 경로 import 두 줄) · 작업 레포 설치 길은 안내 안 함 · 자동 로그인 URL(토큰 원문)이 stdout | `ctx-mcp-serve.mjs:2113` |
| F15 | 「워크스페이스 스킬 사본 cp」 는 제품에 없는 손일이다 | 운영 메모 |
| F16 | `~/.config/cdp` 가 755(토큰 파일은 600) | 실측 |

### 3.3 문서 ↔ 코드 어긋남 (설명서 최신화 단계로 넘기되 화면 · kit 안의 것은 여기서)

큐레이터 스킬 「다섯」 → 실제 여섯(`agent/README.md` · `core/kit.js:7` · 설계서 §11.1 · `CuratorFolder.jsx:20`) ·
큐레이터 도구 「12」 → 실제 13(`agent/install.md:86` · 사용자 설명서 661) ·
설계서 §11.3 「`--curator` 는 병합 없이」 → 코드는 `mergeCuratorFile`(`setup.js:242`) ·
`docs/dev/에이전트세팅_갱신_TODO.md` 가 없는 모듈(`toollayer.js` · `kit-refresh` · `cdp-load`)을 완료로 적음 ·
deploy/README 가 옛 설계서 이름을 가리킴 · compose 주석에만 `init --write` · 설명서 네 권 머리 「v1.0 · 2026-10-07」(화면은 v1.1.6).

---

## 4. 화면 — 22개 · 안내 글

### 4.1 지금

레포 화면 10 · 콘솔 7 · 사이트 얼굴 5(소개 · 설명서 · 로그인 · 셋업 · 레포 없음) + 겹쳐 뜨는 창 5. 메뉴 항목 — viewer 6 · writer 6 · curator 10 · **admin 17**.
메뉴 표 · 얼굴 고르기는 한 곳(`shell/nav.js:37-111` · `shell/routes.js:29`)이라 **구조는 깨끗하다. 문제는 항목 수와 겹침이다.**

| 겹침 | |
|---|---|
| 문서 ↔ 작업 기록(`/w`) | 오른쪽이 한 글자도 다르지 않다 — 왼쪽 목록만 바뀐다(`App.jsx:901`) |
| 사용자 ↔ 토큰 | [발급] 이 두 곳 |
| 콘솔 작업 레포 대장 ↔ 레포 › 연결된 작업 레포 | 같은 대장의 두 얼굴 |
| 큐레이터 폴더 설치 줄 | 대기열(`Queue.jsx:174`)과 연결된 작업 레포(`LinkedWorkRepos.jsx:99`) 두 곳 |
| 레포 현황 카드 | 검증 = 상단 칩 · 큐레이션 = 대기열 · 미러 = 콘솔 지식 레포 |
| 서식집 ↔ 관리 문서 추가 | 서식을 보는 때는 문서를 들일 때뿐 |
| 콘솔 서버 · 감사 · 현황 진단 카드 | 같은 진단의 세 자리 · 서버 설정이 5,177자로 가장 길다 |

### 4.2 처음 쓰는 사람이 막히는 자리 (불변조건 7 — 빈 상태는 다음 할 일)

- 빈 레포 문서 화면 — 「0건 · 0종 · 0개」 + 빈 zip 단추 둘, 다음 할 일 없음(`App.jsx:905-918`)
- 그래프 — 「`_vocab.md` 를 확인하세요」(v1.x 는 save 로만 쓴다 — 잘못 이끈다 · `CoordGraph.jsx:602`)
- 관리 문서 0 — 서식집 → `cdp-registry` 로 안 이어 준다
- 진단 · 대기열 — 신호 0 · 대기 0 이어도 단추 · 숫자 카드(0 · — · 0 · —)를 그린다
- 새 writer — 등록 직후 설치 줄이 접혀 있다(`LinkedWorkRepos.jsx:85`) · 펼치면 사용자 설명서 2장이 거의 그대로
- viewer — 못 하는 일(등록 · 지우기 요청)을 안내한다(`LinkedWorkRepos.jsx:73,113` · `Docs.jsx:211`)
- admin — 콘솔 현황은 「진단 아직 없음」 인데 서버 설정에 들어가면 fail 1(`console/Overview.jsx:50`)

### 4.3 안내 글

| 종류 | 자리 |
|---|---|
| 낡음 · 틀림 | 「탭을 다 닫은 자리」(`admin/Overview.jsx:123`) · `_vocab.md` 안내 · 「스킬 다섯」 · 「설명서 › 관리자 6장」(실제 3장 · `Console.jsx:80`) · `/opt/cdp/auth.json` 박힘(개인 서버에서도 · `Console.jsx:75`) · 소스 실행 시 `__CTX_BUILT__` |
| 설계 근거가 화면에 | 「알림을 띄우지 않습니다 — 무시되기…」(두 곳) · 「서버는 LLM 을 부르지 않는다」 · 상태 칩 범례 표(`Repos.jsx:328`) |
| 두 곳 · 서로 어긋나 보임 | 「커밋과 push 는 서버가…」 두 곳 · 「팀원은 pull 로 받는다 — 돌릴 필요 없다」(`:198`) vs 「pull 뒤 같은 한 줄을 한 번」(`:251`) |
| 설명서 링크 | 절(#) 링크 0 · 권 링크 3(하나는 장 번호 틀림). `Manual.jsx` 는 이미 hash 를 받는다(`:24,:47`) |

---

## 5. 안 — 무엇을 만드나

### 5.1 개인 서버 한 줄 — `ctx up [<폴더>]`

1. 폴더에 `_vocab.md` 가 없으면 `newRepo()` 로 빈 틀(빈 폴더면 묻지 않음 · git 레포면 그 자리)
2. `web/` 을 번들 옆에서 찾는다(F1) · 7400 이 쓰이면 다음 빈 포트(S6) · 같은 레포 서버가 이미 떠 있으면 그 주소만 낸다
3. `preparePersonal()` → 브라우저를 연다(토큰 원문을 stdout 에 찍지 않는다 — F14)
4. `--install <작업 폴더>…` · `--curator <폴더>` — 설치기를 프로세스 안에서 personal 토큰으로(복사 0)
5. `--service` — launchd plist / systemd --user 유닛(`~/Documents` 면 TCC 경고와 대안 자리)
6. 끝 출력은 **다음 할 일 체크리스트 한 장**(§5.5 와 같은 판단)

판 올림 — `ctx up` 이 쓰는 산출물 자리를 `~/.cdp/server/current` 로 고정하고 `ctx self-update <tar|url>`(풀기 · symlink · 재시작 · `--update` 안내)를 둔다.

### 5.2 팀 서버 한 줄 — `install.sh` 를 끝까지

```
sudo bash deploy/install.sh --bind <IP> --admin <id> [--repo <이름> --origin <url>] [--pat-stdin | --ssh]
```

설치 → healthz → `runInit`(관리자 · 토큰 한 번) → `newRepo`(origin 이면 push · F6) → `git-auth`(서비스 사용자 HOME 에만 · F7) → `doctor` →
`<prefix>/serve.json` 에 root/auth/data/web/bind/port 를 적고 `/usr/local/bin/cdp` 래퍼(F5 — `cdp doctor` · `cdp user add` 를 플래그 없이) → 끝 문구는 체크리스트.
`--admin` 이 없으면 지금처럼 `/setup` 마법사(부트스트랩 코드). root 없이 `--prefix ~/…` 를 허용(F4).

Docker — `--auth` 를 볼륨 안(`/opt/cdp/data/auth.json`)으로 · HOME 을 data 쪽으로 · 엔트리포인트가 부트스트랩 코드를 찍는다 · `serve init` 이 빈 파일을 빈 명부로(S5).

### 5.3 연결 · 갱신 한 줄 — `install.mjs`

| | |
|---|---|
| 토큰 | 읽는 순서 env → `~/.config/cdp/token`(S2) · `.zshrc` 줄은 남기되 「필수」 가 아니게 · `headersHelper` 로 `.mcp.json` 이 토큰 파일을 직접 읽는 길은 **실측 후 결정**(D3) |
| 여러 레포 | `--connect <상위 폴더>` — 아래 git 레포들을 고르고 서버에 한 번에 등록(`POST /workrepos` 배열) · 설치 · 묻는 창 한 번(F11) |
| 큐레이터 폴더 | 설치 목록에 `kind: curator` 로 남기고 `--update` 가 같이 돈다(S4) · kit 내부 파일은 거른다(F12) |
| 커밋 | add 전에 `git check-ignore` — 걸리면 멈추고 넣을 `!` 줄을 보인다(`--fix-gitignore` 로 적용) · 실패하면 `git reset -- <rels>` · 대장 보고는 커밋된 것만(S3) |
| 서버 주소 | `--public-url` 우선 · 설치 목록 비교에서 루프백 별칭을 하나로(F13) |
| 낡음 알림 | SessionStart 훅이 **확인만** — 블록의 `cdp:kit` ≠ 서버 해시면 `--update` 한 줄을 낸다. 자동 적용은 안 한다(스킬은 시작 때 읽힌다 · 세션 중 dirty · 커밋은 사람) |
| 사본 cp | 워크스페이스 사본은 `--update` 의 설치 목록에 「폴더(비 git)」 로 등록해 같이 돈다(F15) |

### 5.4 화면 — 22 → 16 (admin 메뉴 17 → 11 · curator 10 → 7)

| 레포 화면(10 → 7) | |
|---|---|
| **읽기** | 문서 + 작업 기록 하나로 — 왼쪽 목록 위 세그(문서 · 기록) · `/w` 는 거름 주소로 남김 |
| 그래프 | 그대로 · 빈 상태 글 고침 |
| **대기열** | 이력을 탭으로 · 0 인 숫자 카드 안 그림 · 큐레이터 폴더는 「시작하기」 로 |
| 진단 | 그대로 · 메뉴 아래쪽 · 신호 0 이면 단추 없음 |
| **관리 문서** | 서식집을 「문서 추가 › 서식집」 탭으로 |
| 연결된 작업 레포 | 등록 직후 설치 줄을 펼친다 · 설치 안내는 명령 한 줄 + 두 줄 + 설명서 링크 · viewer 에게 등록 카드 없음 |
| 현황 | 맨 위 「시작하기」 · 큐레이션 카드는 링크 한 줄 |

| 콘솔(7 → 4) | |
|---|---|
| 현황 | 첫 진입에 진단(60초 캐시) · 「시작하기」(admin 줄) |
| 지식 레포 | 작업 레포 대장을 펼침 열로 |
| **사람** | 사용자 + 토큰 · [발급] 한 곳 |
| **서버** | 설정 · 진단 · 감사 · 로그 — 감사 · 로그는 접힘 |

사이트 얼굴 — 로그인한 사람에게 소개의 「이 서버」 숫자 대신 「시작하기」 · 설명서 목록에서 개발자 · deploy 두 권은 접힘.

### 5.5 「시작하기」 카드 — 부품 하나

문서 화면 빈 상태 · 레포 현황 맨 위 · 콘솔 현황에 같은 부품. 근거는 `/me` · `/api/<레포>/repo` · `/workrepos` · `/drift`(curate) — **계산은 서버 한 곳**(`core/`, I1)에서 `nextSteps(역할, 상태)` 로 내고, `ctx up` · `install.sh` · `repo new` 의 끝 출력도 같은 함수를 쓴다.

| 상태 | 대상 | 한 줄 |
|---|---|---|
| 레포 0 | admin | 레포가 없다 → [새 레포] (`NoRepo.jsx` 를 이 부품으로) |
| 관리 문서 0 | curate | 등록부가 비었다 → 서식집 고르기 · `cdp-registry` 지시 복사 |
| 작업 레포 0 | write | 코드 레포가 안 붙었다 → [등록] → 그 자리에 설치 줄 |
| 낡음 n | write | 에이전트 세팅이 바뀌었다 · n곳 → `--update` 한 줄 |
| 큐레이터 폴더 없음 | curate | 큐레이터 폴더 한 줄(접힘 · 이 한 곳에만) |
| 대기 n | curate | 대기 n · 가장 오래된 d일 → [대기열] |
| 어긋남 n | curate | 어긋남 n → [진단] |

끝난 줄은 안 그리고, 다 끝나면 카드가 사라진다. 권한 밖 줄은 안 그린다.

### 5.6 안내 글 규칙 (화면 설계서에 넣는다)

1. **화면 하나에 한 줄**(Card `hint` · 40자 안쪽). 「왜」 는 설명서 절 링크 `?` 로
2. **빈 상태는 한 문장 + 다음 할 일 하나**, 아니면 그리지 않는다 — 0 인 숫자 카드 · 대상 없는 단추 없음
3. **권한 밖 일은 안내하지 않는다** — 「권한이 필요합니다」 는 콘솔 진입 하나만
4. **설계 근거는 화면에서 뺀다** — 설계서 · 설명서로
5. **숫자 · 장 번호 · 경로는 손으로 쓰지 않는다** — 서버가 준 값(도구 수 · 스킬 수 · auth 경로 · 설명서 앵커)
6. **설명서와 같은 글은 지우고 절 링크로**

---

## 6. 결정 — 닫혔다(2026-10-10 · 운영자 확정 · 전부 권장안)

| | 물음 | 확정 |
|---|---|---|
| **D1** | 판 | **v1.2.0**(마이너) — 데이터 · save 모양은 그대로, 설치 · 화면 · CLI 만 |
| **D2** | 개인 서버 진입 | **`ctx up`** 새 명령 하나 · `serve --personal` 은 그대로 남김(내부가 같은 함수) |
| **D3** | 토큰 전달 | **토큰 파일 폴백(확정)** + `headersHelper` 는 실측 항목으로 두고 통하면 `.zshrc` 줄을 선택으로 내린다 |
| **D4** | kit 배포 방식 | **지금처럼 레포마다 사본 + 일괄 `--update`** · Claude Code plugin 화는 이번에 안 한다(pull 로 받는 성질 · 폐쇄망) — 검토 항목으로만 |
| **D5** | 낡음 알림 | **SessionStart 훅은 확인만**(자동 적용 없음) |
| **D6** | 화면 줄이기 | **22 → 16 전부**(읽기 합치기 · 이력 탭 · 서식집 탭 · 콘솔 넷) |
| **D7** | 팀 설치 | **`install.sh --admin …` 으로 끝까지 + `serve.json` · `cdp` 래퍼** · `--admin` 없으면 `/setup` 마법사 유지 |
| **D8** | 범위 밖 | 설명서 · 공식 사이트 본문 최신화는 **이 작업 다음 단계**(여기선 화면 안 글 · kit 안 글 · `--help` 만) |
| **D9** | 권한 덧붙임 | writer 의 `/queue` · `/curations` · `/forms` 200 은 의도된 공개 — **그대로**(화면 숨김 ≠ 막힘을 화면 설계서에 한 줄) |

---

## 7. 순서 (TODO 의 큰 틀)

```
① 깨짐(S1~S6)            릴리스 NFC · 토큰 폴백 · 커밋 가드 · 큐레이터 폴더 목록 · Docker auth · 포트
② 한 줄 셋                ctx up · install.sh 끝까지(+serve.json · cdp 래퍼) · install.mjs --connect/--update 확장
③ nextSteps(core)          CLI 끝 출력 · 화면 「시작하기」 가 같은 계산
④ 화면 22 → 16            읽기 합치기 · 대기열 이력 탭 · 서식집 탭 · 콘솔 넷 · 빈 상태 · 권한 밖 안내 제거
⑤ 안내 글                 규칙 6개 적용 · 설명서 절 앵커 링크 · 낡은 글 · 숫자를 서버 값으로
⑥ 검증                    단위 · 하네스(원큐 시나리오: 빈 PC → up → 연결 2 → kit 변경 → --update) · 브라우저 실측 · release tar 를 macOS 에서
⑦ (다음 단계) 설명서 네 권 · cdp-about 사이트 · 데모 다시 찍기
```

끝났다고 보는 기준 — **빈 macOS 사용자 폴더에서 `ctx up ~/cdp/team --install ~/code/a ~/code/b` 한 줄 + Claude Code 재시작 한 번으로 writer · curator 가 일할 수 있고,
판 올림은 `ctx self-update <tar>` + `install.mjs --update` 두 줄이다.** 팀 서버는 `install.sh --admin …` 한 줄 뒤 콘솔의 「시작하기」 만 따라가면 된다.
