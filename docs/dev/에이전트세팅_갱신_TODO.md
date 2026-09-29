# 에이전트 세팅 갱신 TODO — upgrade 가 지식 레포의 도구 층을 갈고, 작업 레포는 한 번에 갱신한다

> 운영자 요청(2026-09-29) — 「upgrade 작업에 에이전트 세팅 변경도 업데이트 되게 처리하고, 에이전트 세팅이 변경되었으면
> 작업 레포에서 일괄 갱신할 수 있도록 절차를 개선해라.」 **권장안으로 진행.**
> 계기: v0.18.0 에서 스킬 둘(cdp-import · cdp-save)을 고쳤는데, 서버를 올려도 **작업 레포에 가는 스킬이 바뀌지 않는다.**
> 커밋까지만 — push · 태그 · 실서버 upgrade 는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 결정 T1~T10 · T11 | **완료** (아래 · T11 은 하다가 나왔다) |
| ① 도구 층 갱신 — `core/toollayer.js` · `ctx serve kit-refresh` | **완료** |
| ② upgrade.sh 에 끼운다 — 멈춤 → 갱신 → 켬 · 되돌릴 때 옛 판으로 한 번 더 | **완료** — `bash -n` 만. **실서버 upgrade 로 돌려 본 적은 없다**(systemd 없는 이 PC) |
| ③ 콘솔 · 진단 — 레포마다 「에이전트 세팅」 · [갱신] | **완료** — 7383 에서 칩 · 건너뛴 사유 · 단추 · 재인증 → 갱신 커밋 · auth.log · 현황 경고 둘 확인 |
| ④ 작업 레포 일괄 갱신 — 설치기 `--update` · 이 PC 의 설치 목록 · `--commit` | **완료** — 하네스 108 |
| ⑤ 화면 · 스킬 · 설명서 | **완료** — 관리 › 작업 레포 카드(7383 확인) · cdp-load ⓪ · sync 명함 · 관리자 9.1~9.3 · 설치절차 10장 · 사용자 설명서 · 설계서 6.7.4 |
| ⑥ 검증 | 아래 「나온 것」 |

### 시작 상태 (v0.18.0 · 4760be2)

```
upgrade.sh     ctx.mjs · web/ · packages/ · manual/ 만 간다 — 「레포는 건드리지 않는다」
kit            작업 레포에 가는 스킬 묶음은 서버 번들이 아니라 **각 지식 레포 안의 .claude/skills/** 에서 만든다(collectKit · kitHash)
그래서         upgrade 뒤에도 지식 레포의 스킬은 옛 판 → kit 해시 그대로 → 대장 · sync 어디에도 「낡음」 이 안 뜬다
               → 작업 레포가 설치 한 줄을 다시 돌려도 옛 스킬을 받는다
작업 레포       레포마다 관리 화면의 행 한 줄을 따로 — 다섯 곳이면 다섯 번. 어느 PC 에 무엇이 깔렸는지 서버는 모른다
설명서 9.3     「서버 kit 이 바뀌면 낡음」 이라고 쓰여 있지만 서버 kit 이 바뀌는 길이 없다
```

---

## 0. 결정 (권장안)

| | 결정 | 왜 |
|---|---|---|
| T1 | **「에이전트 세팅」 = 지식 레포의 도구 층**이다 — 배포본이 모든 패키지에 똑같이 붓는 것(`assemble.mjs` 의 「모든 패키지가 같은 것을 받는 층」): `.claude/skills/cdp-*` · `.claude/work-repo/CLAUDE.md` · `CLAUDE.md` · `TEMPLATE-work.md` · `MANUAL*.md` 셋 · `.githooks/pre-commit` · `bin/ctx` · `bin/ctx.mjs` · `bin/ctx.cmd` · `.gitattributes` | 스킬만 갈면 스킬이 말하는 도구(`bin/ctx`)와 훅이 옛 판으로 남는다 — 로컬 clone 의 훅은 레포의 `bin/ctx` 로 검사한다. **지식은 안 건드린다** — `_vocab.md` · `_managed.md` · `docs/` · `work/` · `README.md` · `.gitignore`(팀이 줄을 더한다) · `INDEX*` |
| T2 | 스킬 폴더는 **`cdp-` 로 시작하는 것만** 맞춘다 — 판에서 빠진 `cdp-*` 는 지우고, 레포가 따로 둔 스킬은 그대로 | `ctx setup` 이 작업 레포에서 지키는 규칙과 같다(setup.js) |
| T3 | 원본은 서버의 `packages/<아무거나>/` — 도구 층은 패키지마다 같다. 소스로 돌 때는 조립해서(`materializePackage`) | 산출물에 새 폴더를 만들지 않는다. 패키지가 여럿이면 첫 것(이름순)이고, 도구 층이 서로 다르면 멈춘다 |
| T4 | 갱신은 **한 커밋**(작성자 `cdp` · `에이전트 세팅 갱신 — <번들 시각>`) · 훅이 돈다 · 레포 뮤텍스 안 · 끝나면 미러 | save 와 같은 줄에 서야 한다. 훅이 막으면 되돌리고 사유를 낸다 — 반쯤 갈린 도구 층을 남기지 않는다 |
| T5 | 건너뛰는 경우 — git 이 아니다 · **트리가 더럽다** · **origin 이 앞서 있다(behind)** · 이미 같다 | 더러운 트리 위에 커밋하면 남의 줄이 딸려 간다(M8). origin 이 앞서 있는데 커밋하면 갈라진다 — 「origin 과 맞추기」 가 먼저다 |
| T6 | 줄바꿈은 비교에서 무시한다(CR 을 빼고 견준다) · 쓰는 것은 배포본 그대로(LF) | autocrlf 가 다른 곳에서 받은 레포가 매번 「다르다」 가 되지 않게 |
| T7 | **upgrade.sh 가 부른다** — 파일을 간 뒤 `systemctl stop` → `ctx serve kit-refresh`(cdp 사용자) → `start`. 멈춘 동안이라 save 와 겹치지 않는다. 갱신 실패는 upgrade 실패가 아니다(알리고 간다). 새 판이 안 떠서 **되돌리면 옛 packages 로 한 번 더** 갈아 도구 층도 옛 판으로. `--no-kit` 이면 건너뛴다 | 새 스킬은 새 서버의 스키마를 전제한다(`touchesEmpty`) — 서버만 되돌리고 스킬을 두면 에이전트가 옛 서버에 모르는 키를 보낸다 |
| T8 | 콘솔 › 지식 레포 — 레포마다 「에이전트 세팅」 한 줄(`최신` · `다름 N` · 건너뛴 사유) · [에이전트 세팅 갱신](재인증 · 뮤텍스 · `auth.log`) · 진단에 한 줄 | Docker · systemd 없는 배치 · upgrade 때 건너뛴 레포(더러움 · behind)를 사람이 치운 뒤 누를 자리 |
| T9 | 작업 레포 일괄 갱신 = **설치기 `--update`** — 이 PC 에 이 서버로 설치한 작업 레포 **전부**를 kit 을 받아 계획 → 한 번 묻고 → 적용 → 대장에 하나씩 보고. 설치할 때마다 설치기가 **이 PC 의 설치 목록**(`~/.config/cdp/workrepos.json` · Windows `%APPDATA%\cdp\workrepos.json` · `CDP_CONFIG_DIR` 로 바꿀 수 있다)에 `{ server, repo, workrepo, path }` 를 적는다 | 브라우저는 PC 에 못 쓰고 서버는 경로를 모른다(§6.7.1) — 경로를 아는 것은 그 PC 뿐이다. 대장의 담당자가 설치하고 커밋하는 사람이라(§6.7.2) 그 PC 에서 한 번이면 된다 |
| T10 | `--commit` 을 주면 레포마다 **바꾼 파일만** 커밋한다(`git commit -- <경로>`) · 기본은 커밋하지 않고 한 줄을 보여 준다 | 남의 git 에 기계가 커밋하는 것은 부탁받았을 때만. 경로를 한정하니 다른 변경은 안 딸려 간다 |

---

## ① 도구 층 갱신

- [x] `core/toollayer.js` — `TOOL_FILES` · `planToolLayer(root, from)` · `refreshToolLayer(root, from, { dry, author, message })` → `{ state: same|updated|skipped|dry, reason, changes: [{ path, op }], commit }`
- [x] 되돌리기 — 커밋이 막히면 쓴 파일을 원래대로(없던 것은 지운다 · 지운 것은 되살린다)
- [x] `viewer/bin/ctx-serve-kit.mjs` — `ctx serve kit-refresh --root <repos> [--packages <dir>] [--repo <이름>] [--dry] [--no-push]` · 레포마다 한 줄 · 끝에 합계 · exit 0(갱신 실패가 있어도 · 1 은 인자 오류만)
- [x] `ctx-cli.mjs` 에 잇고 USAGE 한 줄
- [x] `test/toollayer.test.mjs`

## ② upgrade.sh

- [x] systemd 면 stop → kit-refresh → start(재시작 자리) · 아니면 파일만 갈고 kit-refresh 는 「서버를 멈춘 뒤 이 한 줄」 로 안내
- [x] 되돌릴 때 옛 packages 로 kit-refresh 한 번 더
- [x] `--no-kit` · 도움말 · 끝 줄

## ③ 콘솔 · 진단

- [x] `GET /admin/repos` 행에 `kit: { state, changes, reason }`(dry)
- [x] `POST /admin/repos/<이름>/kit` — 재인증 · 뮤텍스 · 미러 · `auth.log` · store.reload
- [x] 콘솔 지식 레포 화면에 한 줄 · 단추
- [x] 진단(doctor)에 「에이전트 세팅」 줄

## ④ 작업 레포 일괄 갱신

- [x] `core/localreg.js` — 이 PC 의 설치 목록 읽기 · 쓰기(경로 정규화 · 같은 경로면 바꿔 쓴다)
- [x] 설치기 — 설치 · 이미 최신 · dry 가 아닐 때 목록에 적는다 · `--update [경로…]` · `--commit`
- [x] 관리 › 작업 레포 — 낡음이 있으면 맨 위에 「일괄 갱신」(담당자별 · 셸 탭 · `--update` 한 줄)
- [x] `cdp-load` ⓪ — 낡았으면 알릴 한 줄을 `--update` 로
- [x] `test/localreg.test.mjs` · 하네스에 `--update`

## ⑤ 설명서

- [x] 관리자 설명서 9.1(upgrade 가 도구 층을 간다) · 9.2(로컬형) · 9.3(낡음 → 일괄 갱신) · 설치절차 10장
- [x] 사용자 설명서 — 작업 레포 갱신 한 줄

---

## 하다가 나온 것 — T11 커밋이 시간을 넘길 때

7383 콘솔에서 gamma 를 처음 갈았을 때 **빈 커밋 + 옛 파일**이 남았다(`auth.log` 는 `skipped=hook`). 원인 —
`git.commitPaths` 의 `git commit` 이 20초 제한인데 도구 층 커밋은 **새 번들로 훅(check · index)을 돈다.** 부하가 있으면
넘긴다(다시 해 보니 40.7초). 시간이 다 되면 호출은 실패로 끝나지만 Windows 에서는 `git` 실행기만 죽고 진짜 git 은 살아
있다 — 그 사이 되돌리기가 색인을 비우고 파일을 돌렸고, git 이 빈 색인을 커밋했다.

| | 결정 | 왜 |
|---|---|---|
| T11 | 도구 층 커밋은 제한 180초(`commitPaths` 가 `timeout` 을 받는다 · save 는 그대로 20초) · 실패로 돌아오면 **`.git/index.lock` 이 풀릴 때까지(최대 5분) 기다린 뒤** HEAD 를 본다 — 움직였으면 된 것(`late`) · 그대로면 되돌린다 · 끝내 잠겨 있으면 손대지 않는다 | 되돌리기는 git 이 확실히 끝난 뒤에만. 시험: `test/toollayer.test.mjs` 마지막(느린 훅 · 제한 0.8초 → 어느 쪽이든 빈 커밋 없음) |

**`save` 에도 같은 틈이 있다**(20초 · 되돌리기) — 이번 범위 밖이라 따로 올렸다(작업 칩 「Fix save rollback race on slow commit hook」).

## 나온 것

| | 무엇 | 어디 |
|---|---|---|
| 1 | 도구 층 계획 · 갱신 · 되돌리기 · 늦은 커밋 판정 | `core/toollayer.js` (새) |
| 2 | `ctx serve kit-refresh` · 원본 고르기(패키지끼리 견줌) · 서버용 공유 원본 | `viewer/bin/ctx-serve-kit.mjs` (새) · `ctx-cli.mjs` |
| 3 | upgrade — 멈춤 → kit-refresh → 켬 · 되돌릴 때 한 번 더 · `--no-kit` · 옛 번들엔 안 부른다 · `--mirror` 없으면 `--no-push` | `ops/deploy/upgrade.sh` |
| 4 | `GET /admin/repos` 의 `kit` · `POST /admin/repos/<이름>/kit` · 현황 경고 둘(레포 · 작업 레포) · 진단 줄 | `ctx-mcp-serve.mjs` · `ctx-serve-doctor.mjs` |
| 5 | 콘솔 › 지식 레포 — 칩 · 사유 · 단추 | `viewer/src/console/Repos.jsx` · `api.js` |
| 6 | 이 PC 의 설치 목록 | `core/localreg.js` (새) |
| 7 | 설치기 `--update` · `--commit`(바꾼 파일만 · 고치던 파일이 있으면 그 레포는 안 함) · 설치마다 목록에 적는다 · 한 레포 설치도 같은 계획 함수 | `viewer/bin/cdp-install.mjs` |
| 8 | 관리 › 작업 레포 — 낡음이 있으면 담당자별 「일괄 갱신」 카드 | `WorkReposServer.jsx` · `admin.css` |
| 9 | `commitPaths` 가 `timeout` 을 받는다 | `core/git.js` |
| 10 | 시험 — toollayer 6 · localreg 3 · 하네스 108(일괄 갱신) · 109(kit-refresh) · 106 · 107 은 설치 목록을 `CDP_CONFIG_DIR` 로 | `test/` · `ops/verify/run.mjs` |
| 11 | 문서 | 관리자 설명서 9.1 · 9.2(로컬형도 스킬을 덮는다) · 9.3 · 설치절차 10장 · 사용자 설명서 · 설계서 6.7.4 · sync 명함 · cdp-load ⓪ |

**검증** — 단위 테스트 125 / 125(`node --test test/*.test.mjs`) · 빌드 ✓ · 하네스 `node ops/verify/run.mjs` 마지막 완주 **✓ 93 · ✗ 1 · – 16**
(108 · 109 통과). ✗ 는 88(`--admin-from` · 7379 서버에 `fetch failed`) — 같은 순서를 따로 떼어 돌리면 통과한다(writer · 403 · admin 뒤
CIDR 403 · info 200). 그 앞 두 번의 91~97 실패는 다른 프로젝트 테스트가 CPU 를 쓰던 때였고 부하가 빠지자 통과했다. 88 은 끊긴 하네스가
남긴 서버 · **같은 체크아웃에서 돌던 다른 세션의 하네스**(save 수정 · `ops/out/verify` 와 포트를 같이 쓴다)와 겹친 것으로 보지만
확인은 못 했다 — 다음 판을 올리기 전에 하네스를 혼자 한 번 더 돌린다.

**남은 것(사람)** — push · 태그 · 실서버 upgrade(이 판의 upgrade.sh 가 처음으로 도구 층을 간다 — 출력의 「에이전트 세팅」 줄을 본다) ·
그 뒤 각 담당자가 자기 PC 에서 「일괄 갱신」 한 줄. **이 기능 전에 설치한 PC 는 설치 목록이 비어 있다** — 행의 [설치 방법] 한 줄을
한 번 돌리면 들어간다(카드의 2번에 적어 두었다).
