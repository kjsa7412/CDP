# 화면 UX TODO — 얼굴 넷을 잇는 상단 바

> 원본: [`../design/CDP_화면_UX_검토_v0.1.md`](../design/CDP_화면_UX_검토_v0.1.md)(문제 P1~P22 · 개선안 §5 · 결정할 것 §8) · 목업 [`화면_UX_목업/index.html`](화면_UX_목업/index.html) · 그림 [`화면_UX_검토_그림/`](화면_UX_검토_그림/).
> **상태는 실측한 것만 적는다 — 예정을 완료로 적지 않는다.** 시작 상태는 아래 표. 운영자가 2026-09-24 "권장안으로 하고 바로 전체 구현" 이라 답해 Q1~Q8 전부 권장안으로 ①~⑨ 를 구현했다 — 커밋 3413615(코드) · 다음 커밋(문서 · 판 v0.11.0 · 「후」 그림).
> 커밋까지만 — push · 태그는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 문서 v0.1 · 이동 지도 · 문제 22 · 권장안 | **완료** (2026-09-24) |
| 목업 — 지금의 바 셋 vs 권장 · 소개 · 레포 · 콘솔 · 설명서 · 900px · 권한 밖 (그림 80~85 · 페이지 오류 0 · 권장 바 실측 48px) | **완료** |
| 스크린숏 실측 — 실서비스 비로그인 12 · 첫 설정 18 · kjsa 19 · hong 7 · 목업 6 | **완료** — `화면_UX_검토_그림/` 57장 |
| 운영자 결정 Q1~Q8 | **권장안 전부**(2026-09-24 "권장안으로 하고 바로 전체 구현") |
| ① 공통 상단 바 | **완료** — 세 얼굴 48px · 표식 → `/` · 스위처 2/3/4 · 탭 제목 규칙 · 빌드 ✓ |
| ② 이름 통일 | **완료** — grep 에 「문서로 돌아가기」 · 「열기」 만 남는다 |
| ③ 마지막 레포 | **완료** — beta → 설명서 → 레포 = beta · 콘솔 → 레포 = beta |
| ④ 없는 주소 · 권한 밖 | **완료** — 하네스 89 · 90 ✓ · 브라우저 실측 |
| ⑤ 목차 고정 · 높이 | **완료** — nav sticky top 48 · 바닥글 겹침 없음 · 소개 48 |
| ⑥ 900px | **완료** — 표식 메뉴 5줄 · 아이콘 이름 7 · 더보기 30px |
| ⑦ 대비 · 이름 · 라벨 · 테마 | **완료** — 부제 `--text-2` · 상단 바 이름 없는 조작 0 · 마법사 라벨 묶임 · `cdp.theme` |
| ⑧ 첫 설정 | **완료** — 마법사 ③ 「레포」 없음 · 재인증 모달 없음 · 표 즉시 |
| ⑨ 문서 · CHANGELOG · 판 · 검증 · 재촬영 | **완료** — v0.11.0 · 테스트 87/87 · 하네스 ✓ 75 · 「후」 21장 |

### 시작 상태 (2026-09-24 실측 · v0.10.0)

```
상단 바           .site-top 34/56px · App .topbar 48px · Console .topbar 30/25px   — 부품 셋 · 높이 다섯
표식              소개 → /  ·  콘솔 → /console  ·  레포 → 레포 메뉴(제품 이름 없음)
소개로 가는 길     레포 · 콘솔에 없음(로그아웃뿐)
레포로 가는 이름   들어가기 · 내 레포로 · 문서로 · 열기 (+ 문서로 돌아가기)
돌아오는 길       콘솔 → 문서로 = 첫 레포 · 설명서 → 내 레포로 = 첫 레포
없는 주소         JSON 401 "토큰이 없다" (로그인 뒤에도)
권한 밖 레포      말없이 첫 레포로 (200)
설명서 목차       스크롤을 따라오지 않음 · 바닥글이 목차를 덮음
900px 콘솔        상단 링크 사라짐 · 왼쪽은 이름 없는 아이콘
대비              --text-3 3.0:1(라이트) · 3.7:1(다크)
테스트 · 하네스   npm test · npm run verify (이 검토는 화면만 — 값은 그대로)
```

---

## 0. 전제 · 결정 대기

- [x] D1 · D2 · D4 · D5 · 색 예산 · 얼굴 넷의 분담은 그대로(검토 §7)
- [x] Q1 표식 = 소개 · Q2 「레포」 · Q3 48px · Q4 표식 메뉴 접힘 · Q5 권한 밖 문장 · Q6 부제 `--text-2` · Q7 마법사 재인증 쿠키 · Q8 히어로 「로그인」 — 운영자 답(2026-09-24): **전부 권장안**

---

## ① 공통 상단 바 부품 — 높이 하나 · 표식 하나 · 스위처 넷 · 현재 표시 · 탭 제목

**바뀌는 파일** — `viewer/src/components/TopBar.jsx`(새) · `viewer/src/App.jsx`(상단 `.topbar` 블록 → `<TopBar face="repo" center={…} />`) · `viewer/src/site/Site.jsx`(`SiteTop` 제거) · `viewer/src/console/Console.jsx`(상단 제거 · `NoAdmin` 에도 바) · `viewer/src/styles/app.css`(`.topbar` 높이 · `.topbar__brand` · `.faces` — 목업 `mockup.css` ② 를 옮긴다) · `viewer/src/styles/site.css`(`.site-top*` 삭제 · `:root[data-face='site'] #root{height:auto}`) · `viewer/src/styles/console.css`(`.con__brand` · `.con__links` 삭제) · `viewer/src/lib/api.js`(얼굴 · `me` 는 그대로).

- [x] `TopBar` — 슬롯 셋(`left` 고정 · `center` · `right`). 표식 `[C] CDP` → `/`(`<a>`). 스위처 `<nav class="faces">` — 소개 · 설명서 · (세션) 레포 · (admin) 콘솔. 현재 얼굴 `aria-current="page"`
- [x] 「레포」 탭 = 지금의 레포 메뉴(`.topbar__repo` + `.repomenu`)를 그대로 옮긴다 — 라벨 `레포 · <이름> ▾`. 서버 모드에서만
- [x] 가운데 슬롯 — 레포: 세그(문서 · 그래프 · 관리) · 검색 · (로컬) 동기화 · 검증. 콘솔 · 사이트: 없음
- [x] 오른쪽 — 이름 · `who__role` · 로그아웃(`aria-label`). 비로그인 사이트: [로그인](`/login` · `/setup` 에서는 없음)
- [x] 높이 — `.topbar{height:var(--topbar-h);flex:none}` 이 세 얼굴에 같이 먹는다. 로컬 뷰어(face=local)는 표식이 레포 이름표가 아니라 `CDP` 로 바뀐다 — 스위처는 없음(얼굴이 하나다)
- [x] 탭 제목 — `소개 · CDP` · `<책 제목> · CDP` · `로그인 · CDP` · `<레포> · CDP` · `콘솔 — <페이지> · CDP`
- [x] 콘솔 왼쪽 메뉴 맨 아래 「문서로 /r」 삭제(스위처가 받는다) · 레포 관리 메뉴의 「콘솔로 →」 는 이름 「콘솔」 로

**확인 방법** — 개발용 서버(`preview_start cdp-serve`)에서 kjsa · hong · 비로그인 셋으로 `/` · `/manual` · `/login` · `/r/alpha/` · `/console` 을 열고 브라우저 콘솔에서
`document.querySelector('.topbar').getBoundingClientRect().height` = 48 · `document.querySelector('.topbar__brand').getAttribute('href')` = `/` · `document.querySelectorAll('.faces a').length` = 2(비로그인) / 3(hong) / 4(kjsa) · `document.querySelector('.faces [aria-current]').textContent` 가 그 얼굴 이름 · `document.title` 규칙.
**끝났다고 보는 기준** — 다섯 주소 × 세 사람에서 위 값이 전부 맞고, 그림 14 · 20 · 21 자리를 다시 찍은 세 장에서 바가 같다. `npm run build` 통과.

## ② 이름 통일 — 검토 §5.5 의 「후」 열

**바뀌는 파일** — `viewer/src/site/Landing.jsx`(히어로 「들어가기」 → 「로그인」 · 「내 레포로」 → 「레포 열기」 · 바닥글) · `viewer/src/site/Login.jsx`(단추 「로그인」) · `viewer/src/site/NoRepo.jsx` · `viewer/src/console/Console.jsx`(`NoAdmin` 의 「문서로」 → 「레포」 · 「설명서 · 관리자 6장」 → 「설명서 › 관리자 6장」) · `viewer/src/components/admin/AdminView.jsx`(「콘솔로 →」 → 「콘솔」) · `viewer/src/App.jsx`(도움말 「매뉴얼」 → 「레포 문서」 · who 링크의 `title` 「제품 설명서」 제거).

- [x] 위 파일의 문구
- [x] `grep -rn "내 레포로\|문서로\b\|들어가기\|콘솔로\|제품 설명서\|매뉴얼" viewer/src` 가 「문서로 돌아가기」(관리 → 문서) 하나만 남긴다

**확인 방법** — 위 grep. 화면에서 소개(비로그인 · 로그인) · 콘솔 · 권한 없음 카드 · `/r` 빈 상태 · 도움말을 연다.
**끝났다고 보는 기준** — 용어 표(검토 §3.3)의 「지금」 열이 화면 어디에도 없다(「문서로 돌아가기」 · 「열기」 제외).

## ③ 마지막 레포 기억 — 「레포」 가 출발지로 돌아온다

**바뀌는 파일** — `viewer/src/lib/api.js`(`lastRepo()` · `rememberRepo()` — `localStorage['cdp.lastRepo']`) · `viewer/src/App.jsx`(열릴 때 기억) · `viewer/src/components/TopBar.jsx`(「레포」 href = `/r/<last>/` 없으면 `/r`) · `viewer/src/site/Landing.jsx` · `NoRepo.jsx`(같은 규칙).

- [x] `App` 이 `appMode.repo` 를 기억한다 · 서버 모드만
- [x] 스위처 · 히어로 · 바닥글 · 콘솔의 레포 링크가 `lastRepo()` 를 쓴다
- [x] 볼 수 없게 된 레포면 ④ 의 문장 페이지로(서버가 판단) — 화면은 지우고 `/r` 로

**확인 방법** — kjsa 로 `/r/gamma/` → 설명서 → 「레포」 → 주소가 `/r/gamma/`. 콘솔에서 「레포」 → `/r/gamma/`. hong 으로 gamma 를 본 뒤 관리자가 gamma 할당을 빼면 → 문장 페이지.
**끝났다고 보는 기준** — 검토 §3.4 의 첫 세 줄 도착이 전부 출발 레포다.

## ④ 없는 주소 · 권한 밖 레포 — 서버 · 화면 · 하네스

**바뀌는 파일** — `viewer/bin/ctx-mcp-serve.mjs`(미지 경로 + `Accept: text/html` → `serveWeb` · `/r/<x>/` 불허 → 302 `/r?from=<x>`) · `viewer/src/site/Site.jsx`(NotFound 문구에 스위처 넷 · `/r?from=` 을 `NoRepo` 가 받는다) · `viewer/src/site/NoRepo.jsx`(「그 주소의 레포는 열 수 없습니다」 + 볼 수 있는 레포 단추) · `viewer/src/console/Console.jsx`(없는 페이지 → 현황 `replace`) · `ops/verify/run.mjs`(하네스 셋).

- [x] 서버 — API 접두 밖의 GET 이 `text/html` 을 받으면 `index.html`. JSON 요청은 지금처럼 401/404
- [x] 서버 — `/r/<x>/…` 가 볼 수 있는 레포가 아니면 `/r?from=<x>`. 없는 레포와 권한 밖에 **같은** 처리(D4)
- [x] 화면 — `NoRepo` 가 `from` 을 읽어 문장 · 볼 수 있는 레포 단추 · 관리자면 「콘솔 › 지식 레포」
- [x] 화면 — `/console/<없음>` → `/console`(현황) `replace` · 메뉴 현재 표시
- [x] 하네스 — `GET /nowhere`(html) 200 + `<div id="root">` · `GET /nowhere`(json) 401 · hong `GET /r/beta/` 302 → `/r?from=beta`

**확인 방법** — `curl -H 'accept: text/html' -o /dev/null -w '%{http_code}' <서버>/nowhere` = 200 · `curl -s <서버>/nowhere` 는 JSON. 브라우저로 `/nowhere` · hong 으로 `/r/beta/` · `/console/nowhere`. `npm run verify`.
**끝났다고 보는 기준** — 그림 09 · 37 자리를 다시 찍은 두 장이 문장 페이지이고 하네스 셋이 ✓.

## ⑤ 설명서 목차 고정 · 높이 고정 — CSS

**바뀌는 파일** — `viewer/src/styles/site.css` · `viewer/src/styles/console.css`(①에 합쳐도 된다).

- [x] `:root[data-face='site'] #root{height:auto}` · `.site-top,.site-foot{flex:none}`(①이 `.site-top` 을 없애면 `.topbar` 에)
- [x] `.man__nav{position:sticky;top:var(--topbar-h);max-height:calc(100vh - var(--topbar-h));overflow-y:auto;align-self:start}` · 사이트의 바 `position:sticky;top:0`
- [x] 900px — `.man__nav` 는 `position:static`(지금 규칙 유지)

**확인 방법** — `/manual/관리자_설명서#6-사람-관리--명부와-토큰` 을 열고 `document.querySelector('.man__nav').getBoundingClientRect().top` = 48 · 바닥글 `top` > 목차 `bottom`. 소개 `/` 에서 바 높이 48(34 아님).
**끝났다고 보는 기준** — 그림 03 · 04 자리를 다시 찍은 두 장에서 목차가 보이고 바닥글이 겹치지 않는다.

## ⑥ 900px — 스위처 접힘 · 아이콘 이름

**바뀌는 파일** — `viewer/src/components/TopBar.jsx`(`<1080px` 표식 메뉴 `.brandmenu` — `.menu` 재사용) · `viewer/src/styles/app.css`(미디어 쿼리 · 더보기 `flex:none`) · `viewer/src/console/Console.jsx` · `components/admin/AdminView.jsx`(`.astep` 에 `title` · `aria-label`).

- [x] 표식 메뉴 — 소개 · 설명서 · 레포(마지막) · 콘솔 · 구분선 · 로그아웃. `aria-current` 로 현재
- [x] 콘솔 · 관리 왼쪽 메뉴 아이콘에 이름
- [x] 레포 상단 더보기 `flex:none` · 900px 에서 검색 칸 최소폭

**확인 방법** — `resize_window` 900 다크로 `/console/users` · `/r/alpha/` · `/`. `document.querySelector('.faces')` 가 숨고 표식에 `aria-haspopup`. 더보기 폭 30.
**끝났다고 보는 기준** — 그림 29 · 30 자리를 다시 찍은 두 장에서 얼굴을 떠나는 라벨 있는 길이 있고 눌린 단추가 없다.

## ⑦ 대비 · 이름 · 라벨 · 테마 키

**바뀌는 파일** — `viewer/src/styles/admin.css` · `console.css` · `site.css`(부제 클래스 색 `--text-2`) · `viewer/src/components/TopBar.jsx`(로그아웃 `aria-label`) · `viewer/src/site/Setup.jsx`(`Field` 부품 사용) · `viewer/src/main.jsx` · `App.jsx` · `lib/api.js`(테마 키 `cdp.theme` 하나).

- [x] `.astep__s` · `.acard__hint` · `.field__h` · `.site-foot` · `.man__crumb` · `.sub` · `.tcount` → `color: var(--text-2)`(토큰 값은 그대로)
- [x] 로그아웃 · 더보기 · 아이콘 단추 전부 `aria-label`
- [x] 마법사 ① ② 의 입력 — `Field`(`htmlFor`) 로
- [x] 테마 — `localStorage['cdp.theme']` 하나를 세 얼굴이 읽는다 · 레포 설정 세그가 그 키에 쓴다 · 기본 `system`

**확인 방법** — 검토 §3.6 의 계산(`--text-2` on `--surface-2` 6.3:1)을 부제 자리에서 `getComputedStyle(...).color` 로 확인 · 스크린 리더 없이도 `document.querySelectorAll('a,button')` 중 이름 없는 것 0 · alpha 에서 라이트 고정 → `/console` · `/` 도 라이트.
**끝났다고 보는 기준** — 위 셋.

## ⑧ 첫 설정 다듬기

**바뀌는 파일** — `viewer/src/site/Site.jsx` 또는 `TopBar.jsx`(레포 0 이면 「레포」 없음) · `viewer/bin/ctx-mcp-serve.mjs`(`POST /setup` 응답에 `cdp_su` 쿠키 · `POST /admin/repos` 가 `store.ensure` 뒤 응답) · `viewer/src/console/Repos.jsx`(완료 뒤 `load()` 순서).

- [x] 마법사 ③ 상단 — 레포 0 이면 「레포」 를 내지 않는다
- [x] Q7 이 「준다」 면 — `/setup` 응답에 재인증 쿠키(15분)
- [x] 새 레포 직후 표에 그 레포가 있다
- [x] (별건 · 기록만) 레포 관리 > 현황 작업 레포 카드 "읽는 중…" — `/api/<레포>/workrepos` · `/diag` 404 를 서버 모드에서 어떻게 할지 — 이 TODO 의 범위 밖. `제품화_TODO` 또는 다음 판 항목으로 — **뒤 판에서 풀렸다**: 서버형은 대장 `/workrepos` 에서 이 레포 것만 거르고 로컬형만 `/api/local/workrepos` 를 부른다(`viewer/src/components/admin/Overview.jsx` · 화면 · 권한 v0.13.0 R8)

**확인 방법** — 빈 명부 서버(`ops/out/dev-serve-setup/` 을 비우고 `cdp-serve-setup` 다시) 에서 마법사 → 새 레포 → 표.
**끝났다고 보는 기준** — 그림 64 · 68 · 69 자리를 다시 찍은 세 장에서 「내 레포로」 가 없고(레포 0), 재인증 모달이 뜨지 않으며(Q7), 표에 alpha 가 있다.

## ⑨ 문서 · CHANGELOG · 판 · 검증 · 재촬영

- [x] 사용자 설명서 8.1 · 8.8(상단 자리 · 이름) · 관리자 3.7 · 6장 머리 · 설치절차 7장 · 제품관리서비스 검토 §4.8 · §4.11 에 **정정 상자** · CHANGELOG「미출시」 · 판(운영자가 정한다 — v0.10.1 인지 v0.11.0 인지)
- [x] `npm test` · `npm run verify` · `npm run build`
- [x] 재촬영 — 그림 14 · 20 · 21 · 03 · 04 · 09 · 29 · 30 · 37 · 64 · 68 · 69(+ 01 · 13 · 15 · 16 · 19 · 23 · 33 · 36 · 38) 자리를 같은 이름 뒤에 `_후` 를 붙여 `화면_UX_검토_그림/` 에 · 검토 문서 §2.6 「후」 표. 절차 — Playwright(chromium) · 1280×800 라이트 · 900×760 다크 · 실서비스는 비로그인만 · 개발용 서버 토큰은 `ctx serve token` 으로 새로
- [x] 이 표의 상태를 실측으로 바꾼다

**끝났다고 보는 기준** — 테스트 · 하네스 · 빌드 ✓ · 재촬영 12장 · 문서 다섯 곳 갱신 · 커밋(push · 태그는 사람이).

---

## 나온 것 (2026-09-24 실측 · 빈 명부의 7381 에서 첫 설정부터 — 스크립트는 세션 스크래치패드)

| 잰 것 | 값 |
|---|---|
| 상단 바 높이 · top | 소개 48@0 · 설명서 48@0(sticky) · 레포 48@0 · 콘솔 48@0 · 마법사 ③ 48 · 권한 없음 카드 48 · 900px 다크 레포 · 콘솔 48 |
| 표식 | 전부 `C CDP → /` — 레포 표식 클릭 · 콘솔 표식 클릭 = `/` |
| 스위처 | 비로그인 `소개• 설명서` · 마법사 ③(레포 0) `소개 설명서 콘솔` · kjsa 레포 `소개 설명서 레포 alpha• 콘솔` · kjsa 설명서(beta 에서 옴) `… 레포 beta …` · hong `소개 설명서 레포 alpha•`(콘솔 없음) |
| 돌아오는 길 | beta → 설명서 → 「레포」 = `/r/beta/` · 콘솔 → 「레포」 = `/r/beta/` · 첫 로그인(lastRepo 없음) = `/r/alpha/` |
| 없는 주소 | `/nowhere` 세션 있음 → 404 · 탭 `없는 주소 · CDP` · 카드 「없는 주소입니다」 · `/console/nowhere` → `/console` · 메뉴 현재 「현황」 |
| 권한 밖 | hong `/r/beta/` → `/r?from=beta` 200 · 카드 「그 주소의 레포는 열 수 없습니다」 · [alpha 열기] |
| 설명서 목차 | `.man__nav` sticky · top 48 · clientH 752 / scrollH 1558~1699 · 바닥글 겹침 false |
| 900px | 표식 메뉴 `소개 · 설명서 · 레포 alpha · 콘솔 지금 여기 · 로그아웃 kjsa` · 왼쪽 메뉴 aria-label 7 · 더보기 30px |
| 탭 제목 | 소개 · CDP / 첫 설정 · CDP / 사용자 설명서 · CDP / 관리자 설명서 · CDP / alpha · CDP / 콘솔 — 현황 · CDP / 콘솔 — 사용자 · CDP / 레포 · CDP / 없는 주소 · CDP |
| 관리 메뉴 | 현황 · 지식 레포 · 작업 레포 · 진단 · 정보 · **콘솔** · 문서로 돌아가기 |
| 콘솔 왼쪽 메뉴 | 일곱 — 「문서로」 없음 |
| 도움말 절 | 화면 · 단축키 · 설명서 · **레포 문서** |
| 첫 설정 | 마법사 라벨 `for` 묶임 · [콘솔로] → `/console` · 새 레포 첫 쓰기에 관리자 확인 모달 **안 뜸** · 직후 표 첫 행 alpha |
| 이름 없는 조작(a · button) | 상단 바 0 — 설명서 본문의 `.codeblock__copy`(글자 있음)와 숨은 링크는 검사 스크립트의 오탐 |
| 로컬 뷰어(5255 · fixture) | 같은 바 — `C CDP` · 「레포 · fixture」 · 문서 · 그래프 · 관리 · 검색 · 동기화 · 검사 · 더보기 |
| 테스트 · 하네스 · 빌드 | 87 / 87 · ✓ 75 ✗ 0 – 16(89 · 90 추가) · vite ✓ (index 499.9 kB · gzip 170.5 kB) |
| 개발용 서버에서 본 404(범위 밖 · 별건) | 관리 > 현황의 `/api/<레포>/workrepos` · `/api/<레포>/diag` — 작업 레포 카드 "읽는 중…" 그대로 |

**남은 것 — 사람이 한다.** 태그 v0.11.0 · push · 실서버 `upgrade.sh` · 그 뒤 그림 01 · 03 · 04 · 09 자리를 실서비스에서 한 번 더.

---

## 하지 않는 것

2단 상단 바 · 데스크톱 햄버거 · 로그인 뒤 허브 페이지 · 콘솔을 레포 탭으로 · 브레드크럼 전면 · 새 색 · 새 글꼴 · 아이콘 라이브러리 · 라우터 의존성 · 소개 · 설명서 비공개 · 초록 · 권한 밖과 없음을 갈라 말하기 — 검토 §6.
