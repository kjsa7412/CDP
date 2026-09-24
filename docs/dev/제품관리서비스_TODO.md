# CDP 제품 관리 서비스 — 실행 TODO

2026-09-23 · 근거 [`CDP_제품관리서비스_검토 v0.1`](../design/CDP_제품관리서비스_검토_v0.1.md) · 시작 v0.9.0 → 목표 **v0.10.0**

> **검토는 확정됐다.** 결정 D1~D14 를 더 고치지 않고 실행한다. 뒤집어야 하면 검토 문서 §5 를 먼저
> 고치고 여기를 따라 고친다 — 코드에서 조용히 갈라지지 않게.
>
> 절 번호는 검토 §6 의 단계 번호와 맞춘다. 체크 항목마다 **끝났다고 보는 기준**이 있고, 브라우저
> 항목 말고는 전부 명령 하나로 확인된다. 브라우저 항목은 「나온 것」 표에 실측으로 적는다.
>
> **모든 결정은 권장으로 처리한다**(운영자 지시). 물어볼 것이 생기면 항목으로 올리고 권장안으로
> 진행한 뒤 「나온 것」 표에 적는다. 커밋까지만 — push · 태그는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 문서 | **완료** |
| 0 전제 | **완료** — 검토 §5 D1~D14 |
| ① 명부 v1.2 · 역할 · 부트스트랩 · CLI · 테스트 | **완료** — 테스트 86 / 86 · 하네스 ✓ 62 ✗ 0 |
| ② 서버 — 사이트 라우트 · 산출물 · 설치 스크립트 | **완료** — 하네스 78 · 79 · 80 ✓ |
| ③ 서버 — `/admin/*` · 재인증 · 감사 · 속도 제한 · CIDR · 하네스 | **완료** — 하네스 81~88 ✓ · 전체 ✓ 73 ✗ 0 – 16 |
| ④ · ⑤ 앞 — **목업 검토** (운영자 지시 2026-09-23) | **완료** — 운영자 "권장안으로 끝까지"(2026-09-23) → 정할 것 다섯 모두 권장안 · [`제품관리서비스_목업/index.html`](제품관리서비스_목업/index.html) 13 화면 · 모달 6 · 다크 · 900px |
| ④ 화면 — 라우터 · 소개 · 설명서 · 로그인 · 마법사 | **완료** — 빌드 ✓(index 495 kB · gzip 169 kB) · 실측 — 소개 · 설명서 네 권(관리자 설명서 목차 앵커 14/14) · 마법사 끝까지 · 로그인 → `/r/alpha/` |
| ⑤ 화면 — 콘솔 일곱 페이지 · 레포 화면의 상단 | **완료** — 일곱 페이지 실측 · 사용자 추가 → 재인증 → 토큰 발급 → 그 토큰으로 로그인 → 레포 2 · 새 레포 gamma · 다크 · 900px · 테스트 87 / 87 · 하네스 ✓ 73 ✗ 0 – 16 |
| ⑥ 문서 · CHANGELOG · 0.10.0 · 검증 완주 | **완료** — 테스트 87 / 87 · 하네스 ✓ 73 ✗ 0 – 16 · 빌드 ✓ · 번들 1667 KB(0.10.0 찍힘) · `cdp-server-v0.10.0.tar.gz` 2.0MB(227 파일 · manual 3권 + 그림 3) · **태그 v0.10.0 은 운영자가** |
| ⑦ (정하면) origin 맞추기 · 금고 · PAT 만료 메모 | 미착수 — D13 |

### 시작 상태 (2026-09-23 실측)

```
npm test               70 / 70 (12파일)
npm run verify         ✓ 57  ✗ 0  – 17   (§10 69줄 + 제품화 70~77)
서버 라우트            /healthz /login /logout /me /repos /packages /workrepos* /kit/* /mcp* /api/* /r/*
서버 산출물            bin · web · packages · deploy   (manual/ 없음)
명부                   v1.1 — users[].write · 토큰 해시 · CLI 만
```

---

## 0. 전제 — 닫혔다

검토 §5 의 D1~D14 가 전부다. 코드가 따라야 하는 것만 다시 적는다.

- [x] 한 프로세스 · 한 포트 · 한 번들 — 사이트 · 콘솔 · 레포는 **주소**가 가른다(D1)
- [x] 소개 · 설명서는 공개 · 레포 이름 없음 · `--private-pages` 로 닫힌다(D2)
- [x] 첫 관리자 = `install.sh` 의 일회용 코드 → `/setup` · `serve init` 도 남는다(D3)
- [x] `/admin/*` — 401(세션 없음) · 403(admin 아님 · CIDR 밖) · 401 `E_REAUTH`(쓰기에 재인증 없음)(D4 · D5)
- [x] 원문 보관 · 재배정 · 삭제 없음 · 갱신 · PAT 는 셸(D6 · D7 · D8)
- [x] 레포 붙이는 길 둘 — 세우기 · clone(D9) · 렌더는 화면(D10) · 개발자 설명서도 싣는다(D11) · 라우터는 손으로(D12)
- [x] ⑦ 은 정하면(D13) · 판 0.10.0(D14)

---

## ① 명부 v1.2 · 역할 · 부트스트랩 · CLI · 테스트

### 1.1 `core/auth.js`

- [x] `ROLES = ['viewer','writer','admin']` · `roleOf(u)` — `role` 이 유효하면 그것, 아니면 `write` 로 접는다(`true` → writer · 없으면 viewer)
- [x] `load()` 가 사용자마다 `role` 을 채우고 토큰마다 `id`(sha256 앞 8자) · `status`(없으면 `active`)를 채운다. **v1.1 파일이 그대로 읽힌다.** `store()` 는 `version: '1.2'` 를 쓴다
- [x] `userAdd({ name, label, repos, role, write })` — `role` 우선 · `write` 는 옛 이름. 유효하지 않은 역할은 `E_INPUT`
- [x] `userSet(db, name, patch, { actor })` — `role` · `write`(→ role) · `active`. **가드 둘** — 마지막 활성 admin 을 내리거나 끄면 `E_LAST_ADMIN` · `actor === name` 인데 `role` 또는 `active` 를 바꾸면 `E_SELF`
- [x] `decide` · `decideSession` 이 `role · admin · write(= role ≠ viewer)` 를 낸다 · `status: revoked` 토큰은 "폐기된 토큰" 으로 거절
- [x] `issue()` — 기본 만료를 **그 사람의 역할**로(admin `ADMIN_EXPIRES_DAYS = 30` · 나머지 90) · 레코드에 `id` · `status: 'active'`
- [x] `revoke(db, { user, id, by, now })` — 지우지 않고 `status · revokedAt · revokedBy`. 활성인 것만 센다 · 0 이면 `E_NOT_FOUND`
- [x] `reissue(db, { id, by, now })` → `{ raw, rec, old }` — 폐기 + 발급 한 번 · 메모는 옛 메모 + ` 재발급`
- [x] `tokenSet(db, { id, note, expires })` — `expires` 는 `YYYY-MM-DD` · 일수 · `never`
- [x] `tokenList(db, now)` 에 `status · revokedAt · revokedBy` · `userList` 에 `role · admin`
- [x] `admins(db)` — 활성 admin 목록
- [x] 부트스트랩 — `ensureBootstrap(dataDir, db)`(명부가 비면 `<data>/bootstrap.code` 0600 을 만들거나 읽어 돌려주고, 있으면 파일을 지우고 null) · `verifyBootstrap(dataDir, code)`(길이 비교 뒤 `timingSafeEqual`) · `clearBootstrap(dataDir)`
- [x] 재인증 쿠키 — `signSession(secret, user, { hours })` 로 15분(`minutes` 인자) · `readSession` 그대로

### 1.2 `core/net.js`

- [x] `parseCidrs('10.10.20.0/24, 127.0.0.1')` · `ipInCidrs(ip, cidrs)` — IPv4 · `::ffff:` 접두 제거 · IPv6 은 `::1` 과 정확 일치만
- [x] `makeLimiter({ limit, windowMs, now })` — IP 마다 미끄러지는 창 · `hit(ip) → { ok, remaining }` · 시계는 인자로

### 1.3 CLI — `ctx-cli.mjs` · `ctx-mcp-serve.mjs`(runAuthCmd) · `ctx-serve-doctor.mjs`

- [x] `--role <r>` 파싱 · `user add --role` · `user set --role`(가드 메시지 그대로 출력 · exit 2)
- [x] `token reissue --id` · `token set --id --note|--expires` · `token revoke --name [--id]` 가 상태를 바꾼다 · `token list` 에 상태 열
- [x] `serve init` 의 첫 사용자가 `admin`
- [x] `doctor` — `관리자 N`(0 이면 warn) · 30일 넘게 남은 admin 토큰 warn · `bootstrap.code` 가 있으면 한 줄 · `--manual` 폴더(없으면 warn)
- [x] `runDoctor` 를 **`doctorRows(opt) → rows`** 와 출력으로 가른다 — 서버가 같은 함수를 부른다

### 1.4 테스트

- [x] `test/auth.test.mjs` — 역할 정규화(v1.1 → writer) · `userAdd --role` · 마지막 admin 가드 · 자기 해제 거절 · `revoke` 가 상태를 바꾸고 `decide` 가 거절 · `reissue` 왕복 · admin 기본 30일 · `tokenSet` · 부트스트랩 만들기 · 검증 · 명부가 생기면 지운다
- [x] `test/net.test.mjs` — CIDR 안 · 밖 · `::ffff:` · 잘못된 CIDR · 속도 제한 창(20 → 21번째 거절 · 창이 지나면 다시)

**끝났다고 보는 기준** — `npm test` 초록 · 기존 70건 그대로 통과(`write` 를 넘기던 테스트가 `role` 로 바뀐 것 외에 동작 변화 없음) ·
`ctx serve user set --role viewer` 로 마지막 admin 을 내리면 exit 2 와 문장.

---

## ② 서버 — 사이트 라우트 · 산출물 · 설치 스크립트

### 2.1 라우트 (`ctx-mcp-serve.mjs`)

- [x] 인자 — `--manual <dir>`(기본 `<bin>/../manual`) · `--private-pages` · `--admin-from <cidr,…>`
- [x] `serveWeb` 이 `index.html` 을 낼 때 `</head>` 앞에 `<script>window.__CDP_SERVER__=true</script>` 를 심는다
- [x] `GET /site/info` — `{ version, built, repos: n, mirror, setupNeeded, privatePages, manuals: [{ id, title }], user, role }` · 레포 이름 없음
- [x] `GET /site/manual/<파일>` — `manual/` 의 `*.md` · `그림/*.svg` · `deploy/설치절차.md`. 목록 밖 · `..` 는 404. `--private-pages` 면 세션 필요
- [x] `GET /` · `/manual*` → SPA(공개 · `--private-pages` 면 세션 → 없으면 `/login?next=`)
- [x] `GET /setup` → SPA · `POST /setup { code, name, label }` — 명부 있으면 409 · 코드 틀리면 401(속도 제한) · 맞으면 admin + 토큰 · 코드 파일 삭제 · 쿠키 · `{ user, raw, id, expires }` · `auth.log` 두 줄
- [x] `GET /login` → SPA(`web/` 없으면 옛 HTML) · `POST /login` — form 은 302 · JSON 은 `{ ok, next }` / 401 `{ error }` · 속도 제한
- [x] `GET /logout` → `/`
- [x] `GET /r` — 볼 수 있는 레포가 있으면 첫 레포로 302 · 없으면 SPA(빈 상태 화면)
- [x] `GET /me` 에 `role · admin · sudo · expiresInDays`
- [x] `GET /console*` → SPA(세션 없으면 `/login?next=`)
- [x] 서버 시작 때 `ensureBootstrap` — 명부가 비면 stderr 한 줄(`/setup` 주소 · 코드)
- [x] `serve.log` 줄 끝에 토큰 id 열 하나(`lastUsed` 가 토큰별로도 집계되게) — 앞 열은 그대로

### 2.2 판 · 산출물 · 설치

- [x] `build-ctx.mjs` — 번들의 `__CDP_VERSION__` 을 `package.json` 의 `version` 으로 찍는다 → `appVersion()` 이 번들에서 판을 낸다
- [x] `release-server.mjs` — `manual/*.md` → `manual/` · `docs/그림/{1_세_레포_구조,2_설치_5단계,7_MCP_두_모드}.svg` → `manual/그림/` · README 한 줄
- [x] `install.sh` — `manual` 폴더 · 배치 · `/healthz` 뒤 `bootstrap.code` 가 있으면 **`/setup` 주소와 코드**를 찍는다 · 「다음 할 일」 을 3장(git 자격)과 브라우저 둘로
- [x] `upgrade.sh` — `manual/` 도 갈아 끼운다(`manual.bak` 한 세대)
- [x] `Dockerfile` — `COPY manual ./manual`

### 2.3 하네스

- [x] 78 `/site/info` — 200 · `repos` 가 숫자 · 본문에 레포 이름 없음 · `setupNeeded: false`
- [x] 79 `/site/manual/사용자_설명서.md` 200 · `/site/manual/../auth.json` 404 · 목록 밖 404
- [x] 80 명부를 비운 두 번째 서버 — `bootstrap.code` 생성 · 틀린 코드 401 · 맞는 코드 → admin · 원문 1회 · 파일 삭제 · 둘째 `/setup` 409

**끝났다고 보는 기준** — `npm run verify` 에 78~80 ✓ · 서버 산출물을 풀어 `manual/사용자_설명서.md` 와 `manual/그림/` 이 있고
`node bin/ctx.mjs version` 첫 줄에 판이 붙는다.

---

## ③ 서버 — `/admin/*` · 재인증 · 감사 · 속도 제한 · CIDR

### 3.1 공통

- [x] `/admin/*` 판정 순서 — 세션(401) → admin(403 `E_FORBIDDEN`) → CIDR(403) → 쓰기면 `cdp_su`(401 `E_REAUTH`)
- [x] `POST /admin/sudo { token }` — `decide` 로 판정 · 같은 사용자여야 한다 · 15분 `cdp_su` · 속도 제한
- [x] 쓰기마다 `auth.audit` — `admin <행위> · <행위자> · <대상> · <바뀐 값>` (토큰은 앞 8자)
- [x] 속도 제한 — `POST /login` · `/setup` · `/admin/sudo` IP 당 분당 20 → 429 `E_RATE`

### 3.2 엔드포인트

- [x] `GET /admin/overview` — 사용자 · 관리자 · 토큰(활성 · 7일 내 · 폐기) · 레포(수 · 미러) · 작업 레포 상태 수 · 마지막 doctor 요약 · 경고 목록
- [x] `GET /admin/users` · `POST /admin/users` · `PATCH /admin/users/<name>`(`E_LAST_ADMIN` 409 · `E_SELF` 400)
- [x] `GET /admin/tokens` · `POST /admin/tokens` · `POST /admin/tokens/<id>/reissue` · `POST /admin/tokens/<id>/revoke` · `PATCH /admin/tokens/<id>`
- [x] `GET /admin/repos`(전부 · 볼 수 있는 사람) · `POST /admin/repos`(세우기 · clone · `grant`)
- [x] `core/reponew.js` — `cloneRepo({ url, dest })` — `git clone` 120초 · 끝에 `_vocab.md` 없으면 폴더를 지우고 `E_CHECK` · `hooksPath`
- [x] `GET /admin/workrepos` — 대장 전부 + 상태
- [x] `GET /admin/doctor[?fresh=1]` — `doctorRows` · 60초 캐시 · `{ at, ok, fails, warns, rows }`
- [x] `GET /admin/server` — 설정값 · 판 · 빌드 · node · pid · 기동 시각
- [x] `GET /admin/audit?limit=` · `GET /admin/log?limit=` — 마지막 N 줄(회전분 포함)

### 3.3 하네스

- [x] 81 `/admin/users` — 세션 없음 401 · viewer 403 · admin 200
- [x] 82 쓰기 — 재인증 없음 401 `E_REAUTH` → `/admin/sudo`(틀린 토큰 401 · 남의 토큰 401) → 200 · 마지막 admin 내리기 409 · 자기 해제 400 · `auth.log` 마지막 줄에 행위자 · 대상
- [x] 83 토큰 — 발급 응답에 원문 · 목록에 원문 없음 · reissue 뒤 옛 토큰 401 · 새 토큰 200 · 옛 행이 `revoked` 로 남는다
- [x] 84 admin 기본 30일 · viewer 90일
- [x] 85 `/login` 21번째 실패 429
- [x] 86 `/admin/doctor` 줄마다 `state · what` · `/admin/server` 에 `version`
- [x] 87 v1.1 명부(`write:true`)를 서버가 읽으면 `/me.role === 'writer'`
- [x] 88 `--admin-from 10.0.0.0/8` 로 띄운 서버에 루프백 admin → 403 · `/site/info` 는 200

**끝났다고 보는 기준** — `npm run verify` ✗ 0 · 81~88 ✓.

---

## ④ · ⑤ 앞 — 목업 검토

> **화면은 목업을 먼저 만들어 검토를 받는다**(운영자 지시 2026-09-23). 목업은 실제 토큰(`tokens.css` ·
> `admin.css` · `app.css` · `doc.css`)을 그대로 물려 쓰는 정적 HTML 이고, 새 클래스 초안(`mockup.css` ②절)은
> 검토가 끝나면 `viewer/src/styles/site.css` · `console.css` 가 된다.

- [x] `docs/dev/제품관리서비스_목업/index.html` · `mockup.css` — 화면 13(소개 · 설명서 · 로그인 · 마법사 · /r 빈 상태 · 콘솔 7 · 레포 상단) · 모달 6 · 다크 · 900px · 화면마다 「봐 줄 것 · 정할 것」 노트
- [x] 브라우저 실측 — 13 화면 · 모달 6 · 다크 2 · 900px 2 를 찍어 확인. 잡은 것 — `.overlay{display:flex}` 가 `hidden` 을 밀어 모달이 기본으로 열려 있던 것 · 프레임이 노트 옆에서 잘리던 것(`flex-wrap`)
- [x] **운영자 검토** — 정할 것 다섯(§4.7 콘솔에서 작업 레포 등록 · D2 공개 기본 · D5 재인증 15분 · D13 ff-only 버튼 · 소개의 그림 수) 과 문구 · 배치 → **"권장안으로 끝까지 절차대로"**(2026-09-23) — 다섯 모두 권장안, 문구 · 배치 목업대로
- [x] 검토 결과를 이 문서 「나온 것」 과 검토 §5 에 적고 ④ · ⑤ 로

**끝났다고 보는 기준** — 운영자가 "이대로" 또는 고칠 목록을 준다. 목업 파일은 `docs/dev/` 에 남긴다(이력).

---

## ④ 화면 — 라우터 · 소개 · 설명서 · 로그인 · 마법사

- [x] `lib/api.js` — 모드 셋(`local · repo · site`) · `window.__CDP_SERVER__` · `site.info() · site.manual(id) · site.login(token, next) · site.setup(body)` · `admin.*` · 401 `E_REAUTH` 는 이동하지 않고 던진다
- [x] `lib/router.jsx` — `useRoute()` · `navigate()` · `<Link>` — `pushState` · `popstate` · 의존성 0
- [x] `main.jsx` — 경로 첫 조각으로 `App`(로컬 · `/r/<레포>/`) · `Site`(`/` · `/manual` · `/login` · `/setup` · `/r`) · `Console`(`/console`)
- [x] `lib/markdown.js` — 제목 slug 를 GitHub 규칙으로(소문자 · 공백 → `-` · 구두점 제거 · 한글 유지) — 세 권의 목차 링크가 그 규칙이다 · 기존 `sectionSlug` 호출이 같은 함수를 쓴다
- [x] `site/Site.jsx` — 상단(표식 · 설명서 · 로그인/내 레포 · 콘솔) · 바닥
- [x] `site/Landing.jsx` — 검토 §4.4 의 블록 · `/site/info` 하나
- [x] `site/Manual.jsx` — 책 목록 · 왼쪽 목차 · 본문 · 링크 재작성(`*.md` → `/manual/<이름>` · `../` → GitHub) · 앵커 이동 · 현재 절 표시
- [x] `site/Login.jsx` — 토큰 한 칸 · 보기 · 실패 한 문장 · `next`
- [x] `site/Setup.jsx` — 세 단계 · 토큰 원문 모달 · [콘솔로]
- [x] `site/NoRepo.jsx` — `/r` 빈 상태(관리자면 콘솔 링크)
- [x] `styles/site.css` — 읽는 면 · `doc.css` 조판 재사용 · 900px
- [x] `Icon.jsx` — users · key · server · shield · home · plus · trash · edit
- [x] `App.jsx` 도움말에 "설명서 →"

**끝났다고 보는 기준** — `npm run build` 통과 · 브라우저에서 `/` → 설명서 세 권이 열리고 목차 링크가 그 절로 간다 ·
`/setup` 이 명부 없는 서버에서 끝까지 · 로그인 뒤 `/r/<레포>/` (「나온 것」에 실측).

---

## ⑤ 화면 — 콘솔 · 레포 화면의 상단

- [x] `console/Console.jsx` — 상단(표식 · 사용자 · 역할 칩 · 설명서 · 문서로 · 로그아웃) · 왼쪽 메뉴 일곱 · `useRoute`
- [x] `console/ui.jsx` — `PageHead · Toolbar · Table · Modal · Field · Chip · Empty · Confirm · TokenReveal · SudoGate`
- [x] `console/Overview.jsx` — 카드 넷 · 경고 목록 · 최근 감사 5 · admin 0 안내
- [x] `console/Users.jsx` — 표 · 추가 모달 · 역할 · 레포 · 비활성 · 매트릭스(체크 → `PATCH users`)
- [x] `console/Tokens.jsx` — 표(폐기 회색) · 발급 · 재발급 · 연장 · 메모 · 폐기 · 원문 모달
- [x] `console/Repos.jsx` — 표 · 새 레포 모달(세우기 / clone · grant) · 열기
- [x] `console/WorkRepos.jsx` — 표 전부 · 그 레포로
- [x] `console/Server.jsx` — 설정 · 진단(다시 검사) · 패키지 · 갱신 안내 · 로그 · 파일 위치
- [x] `console/Audit.jsx` — 줄 · 걸러 보기
- [x] 재인증 — `E_REAUTH` → 모달 → `POST /admin/sudo` → 하던 동작 재시도
- [x] `styles/console.css` — 페이지 머리 · 툴바 · 표 확장 · 모달 폼 · 매트릭스 · 900px
- [x] `App.jsx` — 레포 이름표 **항상 메뉴**(권한 표시) · `who` 에 역할 칩 · 설명서 · 관리자면 콘솔 링크 · `AdminView` 맨 아래 콘솔로 →
- [x] writer 가 `/console` 에 오면 "관리자 권한이 필요합니다 — 셸에서 `ctx serve user set --name <이름> --role admin`"

**끝났다고 보는 기준** — 브라우저 실측 — 일곱 페이지가 그려지고 사용자 추가 → 토큰 발급 → 원문 복사 → 그 토큰으로 로그인 →
레포가 보인다 · 재인증 모달이 끼어들고 통과하면 동작이 이어진다 · 다크 · 900px (「나온 것」).

---

## ⑥ 문서 · CHANGELOG · 0.10.0 · 검증 완주

- [x] MCP 설계서 — §4.3 표에 사이트 · 콘솔 API 행 다섯 · §4.4.1 · §4.4.2 · §6.3 · §6.6.4 에 **정정** 상자(지우지 않는다)
- [x] 관리자 설명서 — 3장 머리 · 3.4(다) 콘솔 · 3.5(마법사 또는 `init`) · 3.7(세 얼굴 · 콘솔 일곱) · 5.2 · 6장을 **콘솔 기준**으로 다시 씀(6.1 역할 표 · 6.2 추가 · 6.3 발급 · 6.4 바꾸기 · 6.5 재발급 · 6.6 이력 — 셸은 "같은 것") · 7.5 · 10.1 `E_FORBIDDEN` · 11장 표 두 줄 · 부록 A(manual · bootstrap.code) · B(`--role` · `reissue` · `set` · `--manual` · `--private-pages` · `--admin-from`) · C 점검표
- [x] 사용자 설명서 — 0장(`/manual` 주소) · 2.1 ⑤ · 8.1(들어가기 · 메뉴 · 역할 칩) · 10.3(재발급 30초) · `write` → `writer`
- [x] 개발자 설명서 — 11.2(세 얼굴 한 번들) · 11.3(상단 · 콘솔 · 사이트 파일) · 7장 표 두 줄 · 부록 B 명령 · 부록 C(사이트 · 콘솔 엔드포인트 · 속도 제한 · 없는 것) · 부록 E R16 메모
- [x] `설치절차.md` 머리 · 5장(마법사 → 콘솔 · 셸은 같은 것) · 7장(세 얼굴) · 8장 `writer` · 6장 doctor 표본 · 판 0.10.0 · `deploy/README.md` 표 · 문단 · Docker 예. `agent/manual/admin.md` 는 토큰 · 화면 표가 없어 고칠 것이 없었다
- [x] 루트 `README.md` — 「사이트 · 콘솔 — 서버형의 세 얼굴」 절(표 · 없는 것 · 문서 링크). `docs/README.md` 링크와 사용자관리 검토 v0.1 의 "이어받았다" 머리는 이미 있었다
- [x] `CHANGELOG.md` `## v0.10.0` · `package.json` 0.10.0
- [x] `npm test` 87 / 87 · `npm run verify` ✓ 73 ✗ 0 – 16 · `npm run build` ✓ · `npm run build:ctx` ✓(1667 KB · `0.10.0` 찍힘 · fixture 사본 갱신) · `npm run release:server -- 0.10.0` → `cdp-server-v0.10.0.tar.gz` 2.0MB · 풀어 확인 — 227 파일 · `bin/ctx.mjs` 0.10.0 · `manual/` 세 권 + 그림 셋 · `deploy/설치절차.md` · `web/` · 패키지 3
- [ ] 태그 `v0.10.0` · push — **운영자가 한다**

---

## 나온 것

단계마다 실측 · 설계와 어긋난 곳 · 잡은 버그. **끝난 단계만 적는다** — 예정을 적지 않는다.

| 단계 | 무엇 |
|---|---|
| ⑥ | 문서를 화면 기준으로 돌렸다 — 관리자 설명서 6장은 콘솔이 본문이고 셸은 "같은 것" 한 줄 · 설치절차 5장은 마법사 → 콘솔 · MCP 설계서는 지우지 않고 **정정** 상자 다섯. 남은 `write` 를 전부 `writer` 로. 검증 완주 — 테스트 87 / 87 · 하네스 ✓ 73 ✗ 0 – 16 · 빌드 ✓ · 번들 1667 KB(`__CDP_VERSION__` 0.10.0) · `cdp-server-v0.10.0.tar.gz` 2.0MB(227 파일 · 8.5MB · manual 3권 + 그림 3 · `bin/ctx.mjs version` 2026-09-23 13:35 · mcp: stdio · http). **잡은 것** — 하네스 검사 없음(문서만). `SHA256SUMS` 는 산출물 안이 아니라 릴리스 워크플로가 만든다 · `agent/manual/admin.md` 에는 고칠 표가 없었다 |
| ④·⑤ 앞 | 목업 검토 — 운영자 "권장안으로 끝까지 절차대로"(2026-09-23). 정할 것 다섯: §4.7 작업 레포 등록은 콘솔에서 하지 않는다(그 지식 레포의 관리 > 작업 레포 · 콘솔은 대장만) · D2 소개 · 설명서 공개 기본(`--private-pages`) · D5 재인증 15분 · D13 ff-only 버튼은 ⑦ · 소개의 그림은 둘(세 레포 구조 · MCP 두 모드). 목업 `mockup.css` ②절이 그대로 `site.css` · `console.css` 가 됐다 |
| ④ | 세 얼굴 한 번들 — `main.jsx` 가 경로 첫 조각으로 `App` · `Site` · `Console` 을 고르고 `<html data-face>` 를 찍는다 · `router.jsx`(pushState · 의존성 0) · `api.js` 의 `face` · `site.*` · `admin.*` · 401 `E_REAUTH` 는 던진다. 빌드 ✓ index 495 kB(gzip 169 kB). **실측(dev 서버 · 레포 alpha · beta)** — `/` 소개(`/site/info` 200 · 그림 SVG 2 · "첫 관리자가 없습니다 → 마법사") · `/setup` 3단계 끝까지(코드 → kjsa admin → 원문 1회 · 만료 2026-10-23 · 브라우저 로그인 상태 · 코드 파일 삭제) · `/manual/관리자_설명서` 목차 앵커 14/14 일치 · 네 권 순서 사용자 · 관리자 · 개발자 · 설치절차 · `/login?next=/r/alpha/` → hong 토큰 → `/r/alpha/`. **잡은 것** — 정적 자원 라우트가 사이트 라우트에 밀려 `/assets/*` 401(자원 라우트를 인증 앞으로) · 설명서 안 다른 책 링크가 렌더러 인코딩 위에 한 번 더 인코딩돼 `%25EC…`(풀고 넣는다) · linkify 가 `install.sh` · `설치절차.md` 를 주소로 삼음(`.sh` · `.md` 가 TLD — `fuzzyLink` off) · 설명서 순서가 파일명 정렬(개발자 먼저) |
| ⑤ | 콘솔 일곱 페이지 + 레포 화면 상단. **실측** — 현황(카드 셋 · 진단 · 최근 감사 5) · 사용자 추가 hong(writer · alpha) → **재인증 모달**(`E_REAUTH` → 토큰 → `POST /admin/sudo` → 하던 추가가 이어진다 · 15분) · 매트릭스에 hong 줄 · 토큰 발급 940ab5a7(90일 · 원문 1회 · "확인 — 전했다") · 새 레포 gamma(패키지 project_2 · grant hong · 3410 ms · 파일 67) → 목록 · `/r/gamma/` · 작업 레포 빈 상태 · 서버(진단 ok 8 warn 3 fail 0 · serve.log 52줄 · 파일 위치) · 감사 7줄(행위자 kjsa · 마법사) · hong 으로 로그인 → 레포 메뉴 2(alpha · gamma · 쓰기 · beta 없음 · 콘솔 줄 없음) · `/console` → "관리자 권한이 필요합니다" · `/r/beta/` → alpha 로 302 · 관리자의 관리 메뉴 넷 + 「콘솔로 →」 · 다크 900px(메뉴 56px 아이콘 · 가로 스크롤 없음). 테스트 87 / 87 · 하네스 ✓ 73 ✗ 0 – 16(67~69 는 브라우저 실측 메모로). **잡은 것** — 감사 줄 파서가 `setup · ` 을 (셸)로 · 갓 발급한 30일 토큰이 31일(`daysLeft` 를 달력 날짜 차이로 · doctor 의 하루 봐주기 제거) · 발급 모달에 기본과 같은 30일이 둘 · `Field` 라벨이 입력과 안 묶임(`htmlFor`) · `repo new` · `clone` 감사 줄에 `admin` 접두 없음 · doctor 패키지 수가 README.md 를 세어 4 |
| ② | 사이트 라우트 — `/site/info`(집계 · 레포 이름 없음 · 세션이 있으면 user · role) · `/site/manual/<파일>`(색인 밖은 404 — 경로 순회가 여기서 끝난다) · `/` `/manual*` `/setup` 은 공개 SPA · `/console*` 은 세션 → SPA · `POST /setup`(코드 · 명부 비었을 때만 · 원문 1회 · 쿠키 · 코드 파일 삭제) · `/login` form + JSON · 속도 제한 · `/logout` → `/` · `/r` 빈 상태 · `/me` 에 role · admin · sudo · index.html 에 `window.__CDP_SERVER__` 표식 · `serve.log` 끝 열에 토큰 id. `build-ctx` 가 `__CDP_VERSION__` 을 찍어 서버가 판을 안다(v0.9.0 실측). 산출물 `manual/` + 그림 셋 · `install.sh` 가 끝에 `/setup` 주소와 코드 · `upgrade.sh` `manual.bak` · Dockerfile. **잡은 것** — 하네스 62 가 옛 계약(`GET /` 빈 상태 HTML)을 봤다 → `/r` 200 + `/me.repos` 0 으로 · `--auth` 없는 개발 모드가 `authenticate.browser` 가 없어 죽던 것(객체로) |
| ③ | `/admin/*` 열여덟 — sudo(15분 `cdp_su` · `kind: sudo` · 세션 쿠키로 흉내 불가) · overview · users · tokens(issue · reissue · revoke · PATCH) · repos(전부 · 세우기 · clone · grant) · workrepos · doctor(60초 캐시) · server · audit · log. 판정 401 → 403(admin · CIDR) → 401 `E_REAUTH`. `buildRepo` 하나를 `POST /repos` 와 `POST /admin/repos` 가 같이 쓴다 · `core/reponew.js` `cloneRepo`(지식 레포 아니면 지운다 · 테스트 87). 하네스 81~88(62 재계약 포함) ✓ · 전체 ✓ 73 ✗ 0 – 16. **잡은 것** — 하네스 앞 검사(37)가 TK 를 폐기해 두어 콘솔 검사가 전부 401 — 살아 있는 토큰을 새로 받는다 |
| ① | 명부 v1.2 — `role` 을 저장하고 `write` 는 읽을 때만 접는다(v1.1 파일 그대로 읽힘 · 저장하면 `version: 1.2`). 폐기는 `status: revoked` 로 남고 `decide` 가 "폐기된 토큰" 으로 거절. `reissue` · `tokenSet` · 가드 둘(`E_LAST_ADMIN` · `E_SELF`) · 부트스트랩 셋 · `signSession` 에 `kind: sudo` · `doctorRows` 분리(관리자 수 · 관리자 토큰 30일 · 부트스트랩 코드 · manual) · CLI `--role` · `token reissue/set` · `serve.log` 토큰별 마지막 사용. 테스트 70 → 86(auth 14 · net 3) · 하네스 ✓ 62 ✗ 0. **잡은 것** — 갓 발급한 30일 토큰이 올림으로 31 로 세어 doctor 가 "30일보다 멀다" 를 냈다(하루를 봐준다) · `token revoke` 가 줄을 지워 이력이 사라지던 것 |

---

## 남은 것 — 사람이 한다

| | 무엇 | 왜 사람인가 |
|---|---|---|
| 1 | `git push` · 태그 `v0.10.0` | push 는 사람이 — 결정 그대로 |
| 2 | 실서버 `10.10.20.188` — 절차는 [`ops/deploy/설치절차.md`](../../ops/deploy/설치절차.md) 10장 「갱신 — v0.9.0 → v0.10.0」 · 관리자 설명서 9.1: `upgrade.sh` → `ctx serve user set --name kjsa --role admin`(v1.1 명부라 관리자가 0명) → 관리자 토큰 재발급 → 브라우저 `/` · `/console` | 실서버 · 셸 |
| 3 | 소개 · 설명서를 한 번 읽고 문구를 다듬는다 — 사내 IP 예시를 자리표시자로 바꿀지 | 문서 정리 |
| 4 | ⑦ 을 정한다 — origin 맞추기 · 금고 · PAT 만료 메모 | D13 |

---

## 하지 않는 것

검토 §7 그대로다. 구현 중에 "겸사겸사" 넣지 않는다.

| | 왜 |
|---|---|
| 판매자 화면 | R5 |
| 브라우저에서 설치 · 갱신 · 재시작 · PAT | D7 · D8 |
| 문서 · 어휘 · 등록부 편집 · `import-dir` | §6.5 · 사람 PC 의 파일 |
| 토큰 원문 보관 · 재배정 · 사용자 삭제 | 검토 v0.1 D3~D5 |
| 화면 자동 테스트 | R12 — API 는 하네스가 덮고 화면은 실측 표에 |
| 새 의존성(라우터 · UI 라이브러리) | 의존성 0 · CDN 없음 |
