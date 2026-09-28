# 화면 · 권한 TODO — 관리 對 콘솔 · 역할 경계 · 껍데기 하나

> 원본: [`../design/CDP_화면_권한_검토_v0.1.md`](../design/CDP_화면_권한_검토_v0.1.md)(문제 P1~P12 · 권장안 R1~R10 · 결정 Q1~Q8 · §7 끝났다고 보는 기준) · 그림 [`화면_권한_검토_그림/`](화면_권한_검토_그림/).
> **상태는 실측한 것만 적는다 — 예정을 완료로 적지 않는다.** 시작 상태는 아래 표(검토 v0.1 · 2026-09-28 실측 그대로). 운영자 답이 없어 Q1~Q8 은 **권장안**으로 간다(페르소나 `.claude/agents/cdp-screen-engineer.md` — 묻지 않는다).
> 커밋까지만 — push · 태그 · 실서버 갱신은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 문서 v0.1 · 실측 · 문제 12 · 권장안 10 | **완료** (2026-09-28 · 커밋 7724d10) |
| 이 TODO | **완료** |
| 결정 Q1~Q8 | **권장안 전부** — 운영자 답 없음(페르소나 규칙) |
| ① 역할 경계 (R1~R4) | 예정 |
| ② 관리 · 상단 바 (R5~R6) | 예정 |
| ③ 껍데기 하나 (R7) | 예정 |
| ④ 세션 하나 · 캐시 (R8) | 예정 |
| ⑤ 주소가 상태 · 첫 페인트 전 테마 (R9) | 예정 |
| ⑥ 검증 · 문서 · 판 (R10) | 예정 |

### 시작 상태 (2026-09-28 실측 · v0.12.0 코드 7c87549)

```
writer(hong) 관리       메뉴 5(현황 · 지식 레포 · 작업 레포 · 진단 · 정보 · 문서로 돌아가기) · 「세우기」 폼 있음
POST /repos (writer)    400 E_INPUT — write 관문을 지난다(403 아님)
관리 › 진단 · 정보       「읽는 중…」 고정 — /api/<r>/diag 가 서버 모드에 없다
GET /workrepos (viewer)  users 에 명부 전원
GET /api/<r>/git         서버 모드에서도 200(origin 호스트 · 커밋 신원)
얼굴 전환               레포 ↔ 콘솔 · 로그인 → 레포 · 레포 바꾸기 · 스위처 전부 문서 교체(timeOrigin 바뀜) — 31곳
마운트 읽기             관리 탭 4 · 콘솔 7 · 설명서 책 · 검사 — 캐시 0 · 「읽는 중…」 22곳
첫 페인트               늘 밝다 — 인라인 테마 없음 · color-scheme 없음 · html 배경 없음
상단 바(admin)          조작 12 · ⋯ 메뉴 15(「관리 —」 포함) · 관리 메뉴 6(「콘솔」 · 「문서로 돌아가기」 포함)
주소                    topMode · adminTab 이 메모리 — 콘솔 → 「레포」 가 문서 모드로 떨어진다
```

---

## 0. 전제 · 결정

- [x] D1 · D2 · **D4**(권한 밖은 존재를 알리지 않는다 · 403) · D5 · **D12**(라우터 의존성 0) · 한 번들이 세 얼굴(§6.8) · 색 예산(초록 없음) · 화면 UX 검토 §6 · 검토 v0.1 §8 「하지 않는 것」 — 그대로
- [x] Q1 「소개」 탭 제거(표식 = 소개) · Q2 세우기는 admin · 콘솔만 · Q3 `POST /repos` 삭제(404) · Q4 서버 관리 메뉴 셋 · Q5 그래프 · 관리를 주소로(로컬도) · Q6 `POST /logout` JSON 200 · Q7 `/git` · `/git/config` 서버에서 제거 · `users` 는 write 만 · Q8 판 **v0.13.0** — 전부 권장안

---

## ① 역할 경계 — R1~R4 · 화면이 숨기는 것은 예의, 막는 것은 서버

**바뀌는 파일** — `viewer/bin/ctx-mcp-serve.mjs`(`POST /repos` 라우트 삭제 · `/workrepos` GET 의 `users` 는 `write` 일 때만) · `viewer/server/adapter/read-api.js`(`/git` · `/git/config` 를 뺀다) · `viewer/server/adapter/http.js`(그 둘을 로컬 뷰어 라우트로 옮긴다 — 같은 코드) · `viewer/src/console/Users.jsx`(역할 문구 둘) · `viewer/src/components/admin/Overview.jsx`(미러 노트의 「콘솔 › …」 은 admin 에게만) · `viewer/src/lib/api.js`(`repoNew` 삭제).

- [ ] `POST /repos` 삭제 — 「막은 것이 아니라 없는 것」(§6.2). 콘솔 `POST /admin/repos`(admin · 재인증 · grant · clone)가 유일한 길
- [ ] `/workrepos` GET — `users: a.write ? usersOf() : []`
- [ ] 서버 모드 `handleRead` 에 `/git` · `/git/config` 없음 → `/api/<r>/git` 404. 로컬 `http.js` 는 그대로 200
- [ ] 역할 문구 — `Users.jsx` 「writer — save · 작업 레포 등록」 · 모달 노트 「지식 레포를 세우는 것은 admin(콘솔)」
- [ ] writer 에게 「콘솔 › …」 안내 문장 없음 — 관리 현황 미러 카드는 admin 에게만 「콘솔 › 지식 레포」, 아니면 「관리자에게」

**확인 방법** — 개발용 서버(7380 · hong writer 토큰)에서 `fetch('/repos',{method:'POST'})` → 404 · `fetch('/admin/repos',{method:'POST'})` → 403 · viewer 로 `GET /workrepos` 응답에 `users` 가 `[]` · `GET /api/alpha/git` 404 · 로컬 뷰어(5255)에서 `GET /api/git` 200. `grep -rn "레포 세우기\|레포를 세우고" viewer/src` 가 0.
**끝났다고 보는 기준** — 하네스 ⑥ 의 새 줄 넷(98~101) ✓ · hong 화면에 「세우기」 0 · 「콘솔 ›」 문장 0.

## ② 관리 · 상단 바 — R5~R6 · 적게 · 성격대로

**바뀌는 파일** — `viewer/src/components/admin/AdminView.jsx`(서버 MENU 셋 · 「콘솔」 줄 · 「문서로 돌아가기」 줄 제거) · `viewer/src/components/admin/Info.jsx`(새 — 서버의 「정보」) · `viewer/src/components/admin/RepoServer.jsx`(삭제 — 서버에서 그리지 않는다) · `viewer/src/App.jsx`(⋯ 메뉴 「관리 —」 줄 제거 · 단축키 표를 `lib/keys.js` 로) · `viewer/src/components/TopBar.jsx`(「소개」 탭 제거 · 표식 `aria-current`) · `viewer/src/console/Overview.jsx`(진단 카드 「자세히」 → `/console/server#doctor`) · `viewer/src/console/Server.jsx`(진단 카드 `id="doctor"` · 해시로 스크롤).

- [ ] 서버 관리 메뉴 **현황 · 작업 레포 · 정보** — 로컬 다섯(현황 · 지식 레포 · 동기화 · 작업 레포 · 진단)은 그대로
- [ ] 「정보」 — 판 · 빌드(`/site/info` 의 `built` — 세션이 이미 든다) · 내 계정 · 역할 · 이 레포에서 할 수 있는 것 · 토큰 만료 D-n(`/me` 의 `expiresInDays`) · 볼 수 있는 레포 수 · 단축키 · 설명서 링크. `/api/<r>/diag` · `/open` 을 부르지 않는다
- [ ] 관리 메뉴에 「콘솔」 · 「문서로 돌아가기」 없음(로컬도 — 세그 「문서」 · Esc · 뒤로 가기가 있다) · ⋯ 메뉴에 「관리 —」 없음
- [ ] 상단 스위처 셋(설명서 · 레포 ▾ · 콘솔) · 소개에 있을 때 표식에 `aria-current="page"` · 좁은 화면 표식 메뉴는 「소개」 줄을 **남긴다**(≤1080px 에서는 표식이 메뉴 토글이라 소개로 가는 유일한 길 — UX 검토 「후」 값 5줄 그대로)
- [ ] 콘솔 현황 진단 카드 「자세히」 → `/console/server#doctor`

**확인 방법** — hong · kjsa 로 `/r/alpha/manage/overview` 에서 `document.querySelectorAll('.admin__menu .astep').length` = 3 · 상단 `document.querySelectorAll('.faces > *').length` = 3(kjsa) / 2(hong) · `document.querySelector('.topbar__brand[aria-current]')` 는 `/` 에서만 · ⋯ 메뉴 행에 「관리」 없음 · 「정보」 화면에 「읽는 중…」 없음.
**끝났다고 보는 기준** — 상단 바 조작 ≤ 11(admin) · 10(writer) · 관리 메뉴 3 · 「정보」 가 값만 낸다(요청 0).

## ③ 껍데기 하나 — R7 · 라우트가 얼굴을 고른다

**바뀌는 파일** — `viewer/src/main.jsx`(`<Shell/>` 하나 · 테마 코드 얼굴 무관) · `viewer/src/Shell.jsx`(새 — `useRoute()` 로 매 렌더 얼굴 결정 · `TopBar` 한 번 · `<App key={repo}>` · `/r` → `me.repos[0]`) · `viewer/src/lib/api.js`(`mode · isServer · face · BASE · LS` 상수 → `getMode()` · `isServer()` · `currentRepo()` 함수 · `req()` 는 부르는 시점의 레포 · `gotoRepo` → `navigate` · 401 → `navigate('/login?next=')` · `logout()` · `rememberRepo` 는 App 마운트) · `viewer/src/lib/router.jsx`(`startTransition` · `modeOf(path)`) · `viewer/src/components/TopBar.jsx`(레포 메뉴를 여기로 · `A` 는 항상 `Link` · 로그아웃 단추 · 가운데 · 오른쪽은 App 이 포털로 넣는 슬롯) · `viewer/src/App.jsx`(TopBar 를 그리지 않는다 · 가운데 · 오른쪽을 `createPortal` · 404 → `/r?from=`) · `viewer/src/site/Site.jsx` · `console/Console.jsx`(TopBar 제거 · `Link`) · 얼굴 밖 `<a href>` 21곳 → `Link`(`App.jsx` 도움말 · `Console.jsx` NoAdmin · `console/Repos.jsx` 열기 둘 · `console/WorkRepos.jsx` · `Landing.jsx` 히어로 · `Site.jsx` 바닥글 · NotFound · `NoRepo.jsx` 넷 · `Setup.jsx` 콘솔로) · `site/Login.jsx`(`location.href` → 세션 갱신 + `navigate`) · `site/NoRepo.jsx`(`location.href` → `navigate` replace) · `viewer/bin/ctx-mcp-serve.mjs`(`POST /logout` JSON 200 · `__CDP_SERVER__` 를 `<head>` 첫 줄에) · `viewer/src/styles/app.css` · `site.css` · `console.css`(상단 바가 얼굴 컨테이너 밖에 선다 — `.app` 그리드 첫 행 제거 · `.shell` 컨테이너).

- [ ] `Shell` — `/r/<repo>/…` 레포 · `/console…` 콘솔 · 나머지 사이트 · `__CDP_SERVER__` 없음 → 로컬. `document.documentElement.dataset.face` 는 effect 로
- [ ] TopBar 는 Shell 이 한 번 — App 의 세그 · 검색 · 검증 pill · ⋯ 는 포털(Shell 이 미리 만든 DOM 노드 둘 · App 상태와 핸들러는 App 에 남는다). 레포 ▾ 메뉴는 TopBar 안으로(세션 · 라우트 · `admin.repos` 만 쓴다)
- [ ] `req()` 가 부르는 시점의 레포로 `BASE` — 읽는 자리 56곳을 함수로. `<App key={repo}>` 로 레포마다 상태 새로
- [ ] 얼굴 밖 `<a href>` 21곳 → `Link` · `A` 헬퍼 삭제 · 로그아웃 `fetch('/logout',{method:'POST'})` → 세션 비움 → `navigate('/')`
- [ ] 클라이언트 `/r` → `lastRepo` 또는 `me.repos[0]` 로 `replace` · 권한 밖 레포는 `/api/<r>/repo` 404 → `/r?from=<r>`(서버 판정 그대로 · D4)
- [ ] 서버의 `serveWeb` · `/r` 302 · `/r/<x>/` 302 · `GET /logout` 302 는 그대로

**확인 방법** — 얼굴 순회(소개 → 설명서 → 로그인 → 레포 → 그래프 → 관리 › 작업 레포 → 콘솔 › 지식 레포 → 「레포」 → 다른 레포 → 설명서 → 로그아웃 → 소개)를 Playwright 로 돌며 매 정거장에서 `performance.getEntriesByType('navigation').length` 와 `performance.timeOrigin` 을 센다. `grep -rn "location.href\|location.reload\|<a .*href=\"/" viewer/src` 로 남은 것을 센다.
**끝났다고 보는 기준** — 순회 끝까지 `navigation.length === 1` · `timeOrigin` 불변 · `location.href` 0(`api.js` 의 절대 경로 문자열은 fetch 용) · 얼굴 밖 `<a href>` 0.

## ④ 세션 하나 · 캐시 — R8

**바뀌는 파일** — `viewer/src/lib/session.jsx`(새 — `SessionProvider` · `useSession()`: `/site/info` + `/me`(401 허용) 를 한 번 · `refresh` · `clear`) · `viewer/src/lib/cache.js`(새 — `useResource(key, fetcher, { ttl })` · `invalidate` · `load` · 구독) · 읽기를 지우는 곳 `App.jsx`(`/me`) · `Console.jsx` · `Site.jsx` · `NoRepo.jsx` · `RepoServer.jsx`(삭제) · 적용 `components/admin/Overview.jsx` · `WorkReposServer.jsx` · `console/Overview · Users · Tokens · Repos · WorkRepos · Server · Audit.jsx` · `site/Manual.jsx` · `components/CheckView.jsx` · `components/StatusBar.jsx`(`/repos` 를 Overview 와 한 키로) · `App.jsx`(다섯 요청도 캐시 — 「불러오는 중…」 은 캐시 없을 때만) · `lib/router.jsx`(`startTransition`).

- [ ] 세션 하나 — Shell 이 `ready` 전에는 아무것도 그리지 않는다(상단 바가 세션 없이 한 번 · 있이 한 번 그려지던 P11). 로그인은 `refresh()` 뒤 `navigate(next)`
- [ ] `useResource` — 모듈 캐시(키 = 레포 + 경로) · 마운트에 캐시가 있으면 즉시 · 뒤에서 갱신(ttl 안이면 생략) · 진행 중 요청 공유 · 구독자 전부 갱신 · 쓰기 뒤 `refresh()`/`invalidate()`
- [ ] 「읽는 중…」 은 캐시가 없을 때만 — 관리 현황 · 작업 레포 · 콘솔 7 · 설명서 책 · 검사 오버레이 · App
- [ ] `/repos` 는 StatusBar · 관리 현황이 한 키 — 요청 하나

**확인 방법** — 두 번째 방문에서 `MutationObserver` 로 「읽는 중…」 · 「불러오는 중…」 · 「대장을 읽는 중」 문자열 출현 횟수를 센다(관리 현황 · 작업 레포 · 콘솔 7 · 설명서 두 권 · 검사). 네트워크 탭에서 관리 현황 진입의 `/repos` 요청 수.
**끝났다고 보는 기준** — 두 번째 방문 「읽는 중…」 0 프레임 · 관리 현황 `/repos` 1건 · 첫 문서에서 상단 바 DOM 이 한 번 만들어진다.

## ⑤ 주소가 상태 · 첫 페인트 전 테마 — R9

**바뀌는 파일** — `viewer/src/App.jsx`(`topMode` · `adminTab` → 라우트 `/r/<repo>/` · `/graph` · `/manage/<overview|work|info>` · 로컬 `/` · `/graph` · `/manage/<tab>` · 마지막 경로 기억) · `viewer/src/lib/api.js`(`repoHref()` 가 마지막 경로) · `viewer/index.html`(head 의 CSS 앞 인라인 테마 스크립트 · `<meta name="color-scheme">`) · `viewer/src/styles/tokens.css`(`html{background:var(--bg)}` · `color-scheme` · 죽은 `auto-dark` 삭제) · `viewer/src/main.jsx`(테마 한 곳 · 얼굴 무관) · `viewer/bin/ctx-mcp-serve.mjs`(`__CDP_SERVER__` 주입을 `<head>` 첫 줄로).

- [ ] 라우트가 `topMode` · `adminTab` — 뒤로 가기 · 새로고침 · 링크. 콘솔 → 「레포」 는 마지막에 보던 경로(`cdp.lastPath`)
- [ ] 로컬도 같다 — `?t=` 는 `readToken()` 이 모듈 로드에서 지운다(라우터가 읽기 전) — 확인해서 「나온 것」 에 적는다
- [ ] 인라인 테마 5줄이 `<link rel=stylesheet>` 앞 · `html` 배경 `--bg` · `:root{color-scheme:light}` · `[data-theme=dark]{color-scheme:dark}` · `App` 의 effect 는 `state.theme` 을 바꿀 때만 쓴다(로컬은 서버 파일의 값을 첫 로드에 localStorage 로 맞춘다)

**확인 방법** — `document.head.querySelector('script:not([src])')` 가 `link[rel=stylesheet]` 앞(`compareDocumentPosition`) · `localStorage['cdp.theme']='dark'` 뒤 새로고침 직후 `getComputedStyle(document.documentElement).colorScheme === 'dark'` · `backgroundColor` 가 `rgb(14,17,22)` · 콘솔 › 지식 레포에서 「레포」 → 주소가 `/r/alpha/manage/work`.
**끝났다고 보는 기준** — 위 셋 · 뒤로 가기가 관리 → 그래프 → 문서를 되짚는다.

## ⑥ 검증 · 문서 · 판 — R10

**바뀌는 파일** — `ops/verify/run.mjs`(98~103 · skip 67 문구) · `docs/dev/화면_권한_검토_그림/`(「후」 그림) · `manual/사용자_설명서.md` 8.1 · 8.8 · `manual/관리자_설명서.md` 3.4 (다) · 5.2 · 6.1 · `manual/개발자_설명서.md` 11.3 · `docs/design/CDP_MCP_설계서_v1.0.md` §6.6.3 · `CDP_제품관리서비스_검토_v0.1.md` §4.8 · `CDP_화면_UX_검토_v0.1.md` §5.5 — 전부 **정정 상자** · `docs/design/CDP_화면_권한_검토_v0.1.md`(머리에 「구현 완료」 · §2.2~2.3 자리의 「후」 표) · `CHANGELOG.md`(v0.13.0) · `package.json`(0.13.0) · `README.md` · `docs/README.md` 한 줄.

- [ ] 하네스 여섯 — writer `POST /repos` 404 · writer `POST /admin/repos` 403 · viewer `GET /workrepos` 에 `users` 없음(`[]`) · viewer `GET /api/<r>/git` 404 · `GET /r/<r>/` 의 index.html 에서 인라인 테마 `<script>` 가 `<link rel=stylesheet>` 앞 · `POST /logout` 200
- [ ] Playwright(`%LOCALAPPDATA%\ms-playwright\chromium-1243` · `playwright-core` 는 세션 스크래치패드) — 얼굴 순회 · 두 번째 방문 · 「레포」 복귀 · 테마 · 「후」 그림(1280×800 라이트 · 900×760 다크 · kjsa · hong · 비로그인)
- [ ] `npm test` · `npm run verify` · `npm run build`
- [ ] 문서 정정 상자 아홉 · 검토 v0.1 머리 · 「후」 표 · CHANGELOG v0.13.0 · `package.json` · 이 표를 실측으로

**끝났다고 보는 기준** — 검토 v0.1 §7 표 그대로 · 화면 UX 검토 「후」 값(상단 48px · 권한 밖 문장 · 900px 표식 메뉴 5줄) 그대로 · 커밋(push · 태그는 사람이).

---

## 나온 것

(실측 뒤에 적는다)

**남은 것 — 사람이 한다.** 태그 v0.13.0 · push · 실서버 `upgrade.sh` · 검토 §2.6 의 실서비스 판 불일치(`/site/info` v0.10.0 · 번들은 v0.12.0 해시) 확인 — `upgrade.sh` 뒤 `doctor`.

---

## 하지 않는 것

라우터 라이브러리 · 번들 나누기 · 콘솔을 레포 탭으로 · 관리를 콘솔로 합치기 · 서버 302 지우기 · 알림 · 실시간 갱신 · 새 색 · 새 글꼴 · 아이콘 라이브러리 · 2단 상단 바 · 권한 밖과 없음을 갈라 말하기 — 검토 §8. `GET /packages` 는 남긴다(하네스 70 · 권한 무관 · 서식 목록) — 지우는 것은 `POST /repos` 하나. `/r/<레포>/doc/<id>` 주소는 이번 범위 밖(R9 는 그래프 · 관리만).
