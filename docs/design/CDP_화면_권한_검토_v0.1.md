# CDP 화면 · 권한 검토 v0.1 — 관리 對 콘솔 · 역할별 화면 · SPA 전환 깜빡임
> **v1.0 이후** — 권장안 R1~R10 은 [`CDP_화면_설계서_v1.0.md`](CDP_화면_설계서_v1.0.md)에 녹아 있다(권한 경계 · 주소 · 캐시 · 테마). 관리 메뉴는 「레포 관리」 묶음이 됐고 권한은 항목 단위 `need` 다.

> **판 v0.12.0 코드(7c87549) · 2026-09-28 실측.** 실서비스 `http://10.10.20.188:7374`(비로그인 · 읽기만 — 운영자 토큰은 넣지 않았다)와 개발용 서버 7380(명부 kjsa **admin** · hong **writer**(alpha · gamma) · 레포 alpha · beta · gamma)을 걸었다. 계산값은 브라우저의 `performance` · DOM 으로 잰 것이고 코드 근거는 `파일:줄` 이다. 코드 전수 조사(전환 31곳 · 마운트 읽기 24곳 · 중복 단추 47자리)는 페르소나 에이전트가 읽기만으로 했다([부록 A](#부록-a-문서-교체가-일어나는-전환-31곳) · [부록 B](#부록-b-마운트마다-다시-읽는-부품-24곳)).
> **상태 — 검토만.** 구현은 새 세션이 페르소나 [`.claude/agents/cdp-screen-engineer.md`](../../.claude/agents/cdp-screen-engineer.md) 로 한다 — 단계 · 확인 방법 · 끝났다고 보는 기준은 그 세션이 `docs/dev/화면_권한_TODO.md` 로 쓴다. 결정 [Q1~Q8](#6-결정할-것) 은 운영자 답이 없으면 **권장안**이다.
> **상태 — 구현 완료(v0.13.0 · 2026-09-28).** R1~R10 전부 · Q1~Q8 권장안 — 단계 · 확인 방법 · 실측은 [`docs/dev/화면_권한_TODO.md`](../dev/화면_권한_TODO.md) · 「후」 값은 [§2.7](#27-후--구현-뒤-실측-v0130--2026-09-28) · 그림 `docs/dev/화면_권한_검토_그림/`. 아래 본문(§2.1~2.6 · 문제 · 권장안)은 검토 때의 것이다 — 지우지 않는다.
> 전제로 두는 것: 제품관리서비스 검토 v0.1 의 D1(한 프로세스) · D2(소개 · 설명서 공개) · **D4(권한 밖은 존재를 알리지 않는다 · 403)** · D5(재인증 15분) · **D12(라우터 의존성 0)** · 한 번들이 세 얼굴에서 돈다(MCP 설계서 §6.8) · 화면 UX 검토 v0.1 §6 「하지 않는 것」 · `tokens.css` 색 예산(초록 없음). 바꾸자는 것은 [§8](#8-하지-않는-것) 에 왜를 적었다.

---

## 0. 한 줄

운영자의 말이 맞다. **관리(레포 화면 · `/r/<레포>/` 의 「관리」)와 콘솔(`/console`)이 같은 일 넷(현황 · 지식 레포 목록 · 지식 레포 세우기 · 작업 레포)을 두 얼굴에서 되풀이하고, 그중 지식 레포 세우기는 writer 에게 화면도 서버도 열려 있다** — `POST /repos` 는 `write` 만 본다(재인증 · 접근 부여 없음). 깜빡임은 SPA 가 아니어서다 — `main.jsx:39` 가 첫 렌더에서 얼굴을 한 번 고르고 `lib/api.js:53-56` 의 `mode · BASE` 가 모듈 상수라, **얼굴을 넘거나 레포를 바꾸는 전환 31곳이 전부 문서 교체**이고(`performance.timeOrigin` 이 바뀐다), 그 안에서도 관리 탭 넷 · 콘솔 페이지 일곱 · 설명서 책이 캐시 없이 마운트마다 「읽는 중…」 을 그린다. **권장안** — 관리는 「이 레포 · 내 것」 셋(현황 · 작업 레포 · 정보)으로 줄이고 세우기는 콘솔(admin · 재인증) 한 곳 · 껍데기 하나(Shell) + 세션 하나 + 데이터 캐시 + 첫 페인트 전 테마로 문서 교체 0 · 상단 바 12 → 11 조작 · 관리 메뉴 6 → 3 · 같은 일 하는 단추 47자리 → 성격별 한 자리.

---

## 1. 운영자의 말 · 검토의 틀

> 관리 버튼 안에서 지식 레포를 세울 수 있다. 관리와 콘솔의 역할이 똑같아 보인다. 의도는 사용자 · 권한에 따라 콘솔과 관리가 구분되는 것 — 일반 사용자는 작업 레포에 에이전트를 세팅하는 것은 할 수 있어도 지식 레포를 세우는 것은 못 한다. 버튼을 많이 만들지 말고 콤팩트하게, 작업의 성격에 맞게 그룹핑. SPA 인데 화면 전환마다 깜빡인다 — 근본적으로.

| 축 | 무엇을 봤나 | 원칙 |
|---|---|---|
| **역할 경계** | viewer · writer · admin 각각에게 관리 메뉴의 무엇이 보이나 · 그 화면이 부르는 API · 서버가 실제로 막나 | 권한의 근거는 명부(`core/auth.js`) · 화면이 숨기는 것은 예의, 막는 것은 서버 · D4 |
| **분담** | 관리(레포 하나)와 콘솔(서버 전부)이 같은 일을 하나 | 같은 일을 하는 자리가 둘이면 어느 쪽이 정본인지 사람이 모른다(AdminView 머리말) |
| **콤팩트** | 상단 바 · 관리 메뉴 · ⋯ 메뉴 · 콘솔 메뉴의 조작 수 · 같은 일을 하는 단추의 수 | Hick · 작업의 성격(읽는다 / 매일 바꾼다 / 처음 한 번 세운다 / 문제 났을 때 본다) |
| **전환** | 어느 전환이 문서를 교체하나 · 그 안에서 무엇이 다시 그려지나 · 테마가 언제 붙나 | `performance.timeOrigin` · `getEntriesByType('navigation')` · 첫 페인트 |

**실측만 적었다.** 열어 보지 않은 화면은 없다. 실서비스는 비로그인만이다 — 로그인 뒤의 값은 전부 개발용 서버(같은 번들 · 같은 서버 코드)의 것이다.

---

## 2. 어떻게 걸었나 — 실측

### 2.1 실서비스 — 비로그인 (`http://10.10.20.188:7374`)

| # | 어디 | 본 것 |
|---|---|---|
| 1 | `/r/gdi/` 직접 | 302 → `/login?next=%2Fr%2Fgdi%2F` (`redirectCount` 1 · DOMContentLoaded 194ms). 상단 `C CDP · 소개 · 설명서 · [로그인]` 48px |
| 2 | `/` → 설명서 → 로그인 → 소개 | `getEntriesByType('navigation').length` 내내 **1** · `timeOrigin` 불변 — **사이트 안은 pushState 다.** 깜빡임은 여기 없다 |
| 3 | `/manual/사용자_설명서` | 목차 `.man__nav` top 48 · sticky ✓ (v0.11.0 ⑤ 그대로) |
| 4 | head | `<script type=module>` · `<link rel=stylesheet>` · 인라인은 `window.__CDP_SERVER__=true` 하나. **테마 스크립트 없음** · `color-scheme` 없음(`getComputedStyle(html).colorScheme === 'normal'`) · `html` 배경 투명 · `body` `rgb(246,247,249)` = 밝은 `--bg` |
| 5 | `/site/info` | `version 0.10.0 · built 2026-09-24 00:46 · repos 1` — [§2.6](#26-범위-밖-관찰) |

### 2.2 개발용 서버 — kjsa(admin) · 1280×800

| # | 어디 | 본 것 |
|---|---|---|
| 1 | 로그인 → `/r/alpha/` | **문서 교체**(`navigation.type` navigate). 서버 응답 330ms · DCL 353 · **first-paint 520ms** · JS 507 KB · CSS 108 KB 는 캐시(transferSize 0)인데 다시 파싱 · 실행 · `/api/alpha/repo · docs · vocab · managed` 404~409ms · `/me` 414 · `/repos` 761 |
| 2 | 상단 바 | `C CDP · 소개 · 설명서 · 레포 alpha ▾ · 콘솔 ‖ 문서 · 그래프 · 관리 ‖ 검색 · 이동 ⌘K ‖ ⚠ 검증 2 ‖ kjsa admin ⏻ ⋯` — 조작 **12** |
| 3 | 「관리」 | 문서 교체 없음(state). 메뉴 **6** — 현황 · 지식 레포 · 작업 레포 · 진단 · 정보 · **콘솔 →/console** · 문서로 돌아가기 esc. 현황 카드 5(지식 레포 · 미러 · 검증 · 문서 상태 · 작업 레포) · 진입 직후 「읽는 중…」 1 → 2초 뒤 0 · 요청 5(`/repos` **둘** · `/api/alpha/status` · `/workrepos` · **`/api/alpha/diag` → 404**) |
| 4 | 관리 › 지식 레포 | 「이 서버가 든 지식 레포 3곳」 alpha · beta · gamma(미러 · 더러움 · [열기]) + **「새 지식 레포」 폼** — 이름 · 패키지 · origin · [세우기] |
| 5 | 관리 › 작업 레포 | 「대장을 읽는 중입니다…」 → 「작업 레포」(0행) + 「등록」 폼(이름 · 담당자 select **kjsa · hong** · 메모 · [등록]) |
| 6 | 관리 › 진단 · 정보 | **「읽는 중…」 고정** — 2초 뒤에도. `/api/alpha/diag` 가 서버 모드에 없다(`read-api.js` 43~132 에 `/diag` 없음 · 로컬의 `http.js:254` 만) |
| 7 | ⋯ 더보기 | 행 3(도움말 · 읽기 모드 · **관리 —**) + 세그 12(글자 5 · 폭 4 · 테마 3) = **15** |
| 8 | 관리 → 「콘솔」 | **문서 교체** — `timeOrigin` 1790557558979 → 1790557771637. JS · CSS 캐시 @22ms · `/me` @90 · `/admin/overview` @674 · DCL 51. 179ms 시점에 껍데기(메뉴 7 · who)는 섰고 **현황 카드는 674ms 까지 「읽는 중…」** |
| 9 | 콘솔 | 메뉴 **7** — 현황 · 사용자 · 토큰 · 지식 레포 · 작업 레포 · 서버 · 감사. 현황 카드 6(서버 · 사람 · 작업 레포 · 진단 · 최근 기록 · 최근 감사) — 「자세히 → 서버」 가 두 카드에 |
| 10 | 콘솔 → 「레포」 | 문서 교체 · `/r/alpha/` 가 **문서 모드**로 열린다 — 8번에서 보던 「관리」 자리는 잃는다(`topMode` 는 메모리 상태) |

### 2.3 개발용 서버 — hong(writer · alpha · gamma)

| # | 어디 | 본 것 |
|---|---|---|
| 1 | 로그인 → `/r/alpha/` | 스위처 **3**(소개 · 설명서 · 레포 alpha) · `hong writer` · 세그 문서 · 그래프 · **관리** (역할 무관 · `App.jsx:580`) |
| 2 | 관리 | 메뉴 **5** — 콘솔 없음 ✓. 현황 「미러」 카드의 노트가 「콘솔 › 지식 레포(관리자)」 를 말한다 — 못 들어가는 곳을 writer 에게 |
| 3 | 관리 › 지식 레포 | 「이 서버가 든 지식 레포 2곳」 alpha · gamma(권한 밖 beta 는 없다 ✓ D4) + **「새 지식 레포」 폼 · [세우기]** — admin 과 같은 화면 |
| 4 | `POST /repos` (writer · 무효 이름 `!!invalid name!!`) | **400 `E_INPUT` 「레포 이름 형식이 아니다」** — `write` 관문(`ctx-mcp-serve.mjs:1254`)을 **지났다.** 403 이 아니다. 아무것도 만들지 않았다(이름 검사가 앞이다 · `buildRepo` 532) |
| 5 | `GET /admin/repos` (writer) | **403** ✓ — 콘솔 API 는 admin 만(913) |
| 6 | 관리 › 작업 레포 | 「등록」 폼 있음(write · 의도대로) · 담당자 select 에 **명부 전원**(kjsa · hong) |
| 7 | 관리 › 진단 · 정보 | 「읽는 중…」 고정 — admin 과 같다 |
| 8 | `/console` 직접 | 「관리자 권한이 필요합니다」 카드 · 계정 hong writer · 셸 명령 · [레포 →/r/alpha/] [설명서 › 관리자 6장] · 상단 스위처 3 ✓ |
| 9 | `/r/beta/` 직접 | 302 → `/r?from=beta` · 「그 주소의 레포는 열 수 없습니다」 · [alpha 열기] [gamma 열기] ✓ (v0.11.0 ④) |

### 2.7 「후」 — 구현 뒤 실측 (v0.13.0 · 2026-09-28)

같은 개발용 서버(7380 · kjsa admin · hong writer)와 로컬 뷰어(5255 · fixture)를 Playwright(chromium 1243 · headless · 1280×800 라이트 · 900×760 다크)로 걸었다. 토큰은 이 실측 동안만 발급했고 끝나고 폐기했다. 자리를 맞추려고 §2 의 앞에 둔다 — §2.2 · §2.3 의 「전」 과 나란히 읽는다.

| 재는 것 | 전(§2.2 · §2.3) | 후 |
|---|---|---|
| 얼굴 순회 12정거장(소개 → 설명서 → 로그인 → 레포 → 그래프 → 관리 → 관리 › 작업 레포 → 콘솔 → 콘솔 › 지식 레포 → 「레포」 → 레포 ▾ gamma → 설명서 → 로그아웃 → 표식) | 얼굴을 넘을 때마다 문서 교체(`timeOrigin` 바뀜) | **`navigation.length` 1 · `timeOrigin` 불변 12/12** · 상단 바 DOM 1 |
| 콘솔 → 「레포」 | `/r/alpha/` 문서 모드(관리 자리를 잃음) | **`/r/alpha/manage/work`** · 관리 메뉴 현재 「작업 레포」 |
| 두 번째 방문 「읽는 중…」(관리 3 · 콘솔 7(+현황 한 번 더) · 설명서 3 · 레포 · 검사 — 16자리) | 마운트마다(첫 방문 9자리가 그렸다) | **0 / 16** |
| 관리 현황 진입 요청 | 5(`/repos` 둘 · `/api/alpha/diag` 404 포함) | 2(`/api/alpha/status` · `/workrepos`) — `/repos` 는 상태바와 한 키 · diag 없음 |
| hong 관리 메뉴 | 5(지식 레포 「세우기」 폼 포함) · 「진단 · 정보」 읽는 중 고정 | **3 — 현황 · 작업 레포 · 정보** · 「세우기」 0 · 「콘솔 ›」 문장 0 · 정보에 D-90 |
| kjsa 관리 메뉴 | 6(+ 콘솔 · 문서로 돌아가기) | **3** — 콘솔 › 지식 레포의 [+ 새 레포] 그대로 |
| writer `POST /repos` · `POST /admin/repos` | 400(관문 통과) · 403 | **404 · 403** (admin 도 `POST /repos` 404 · `/admin/repos` 는 재인증 401) |
| viewer `GET /workrepos` users · `GET /api/<r>/git` | 명부 전원 · 200 | **`[]` · 404**(하네스 100 · 101) |
| 상단 바 조작(레포 얼굴) | 12 · 스위처 소개 · 설명서 · 레포 · 콘솔 | **admin 11 · writer 10** · 스위처 설명서 · 레포 · 콘솔 · 높이 48 |
| ⋯ 더보기 | 15(「관리 —」 포함) | 14 — 「관리」 없음 |
| 첫 페인트(`cdp.theme=dark` 새로고침) | 밝은 토큰 · `colorScheme normal` · html 투명 | `commit` 직후 `data-theme=dark` · **`colorScheme dark`** · html `rgb(14,17,22)` · 인라인 스크립트가 stylesheet 앞 · meta `dark` |
| 로그아웃 | `GET /logout` 302 → 문서 교체 | `POST /logout` 200 JSON → pushState `/` |
| 권한 밖(hong → beta) | 302 → `/r?from=beta` | 화면 안 이동도 `/r?from=beta`(API 404 → 서버 판정 그대로 · D4) · 직접 진입은 302 그대로 |
| 화면 UX 「후」 값 | 상단 48 · 권한 밖 문장 · 900px 표식 메뉴 5줄 | 그대로 — 48 · 「그 주소의 레포는 열 수 없습니다」 · 소개 · 설명서 · 레포 · 콘솔 · 로그아웃 |
| 로컬 뷰어 | `?t=` · 라우터 없음 | `?t=` 가 첫 진입에서 지워진 뒤 `/graph` · `/manage/work` · 뒤로 가기 · 새로고침 · 메뉴 다섯 그대로 |

### 2.4 전환 계측 — 무엇이 문서를 교체하나

| 전환 | 문서 교체 | 근거 |
|---|:--:|---|
| 소개 ↔ 설명서 ↔ 로그인 (사이트 안) | ✗ | `Link` · pushState(`Site.jsx` · `router.jsx`) |
| 콘솔 메뉴 7 사이 | ✗ | `Link`(`Console.jsx:64-77`) — 그러나 페이지마다 「읽는 중…」 |
| 문서 ↔ 그래프 ↔ 관리 · 관리 메뉴 사이 | ✗ | state(`topMode` · `adminTab`) — 그러나 관리 탭마다 「읽는 중…」 · 뒤로 가기 없음 |
| 로그인 → 레포 · 콘솔 | **○** | `Login.jsx:30` `location.href` |
| 레포 → 소개 · 설명서 · 콘솔 (상단 스위처) | **○** | `TopBar.jsx:63-72` — `same` 이 아니면 `<a>` · App 은 `Link` 를 안 넘긴다(`App.jsx:505-617`) |
| 콘솔 → 레포 · 소개 · 설명서 | **○** | 같은 이유 — 「레포」 는 `same` 키 자체가 없다(`TopBar.jsx:59`) |
| 레포 → 다른 레포 (레포 ▾ · 「열기」) | **○** | `api.js:98-100` `gotoRepo` = `location.href` — `BASE` 가 상수라 다른 길이 없다 |
| 좁은 화면 표식 메뉴(≤1080px) | **○** | `TopBar.jsx:158` — 같은 얼굴 안(소개 ↔ 설명서)도 `<a>` |
| 로그아웃 | ○ (서버) | `GET /logout` 302 → `/` (`ctx-mcp-serve.mjs:836-839`) — 유일하게 서버가 필요한 전환 |
| 세션 끊김 401 | ○ | `api.js:152` `location.href = '/login?next='` |

한 번의 문서 교체가 겪는 순서(레포 → 콘솔 · 어두운 테마 사용자) —

| 단계 | 화면 | 근거 |
|---|---|---|
| 0 | 이전 문서 해체 · `index.html` 을 **다시 받는다** | `cache-control: no-store`(`ctx-mcp-serve.mjs:1969`) |
| 1 | **밝은 토큰 · 빈 `#root`** | CSS 가 스크립트보다 먼저 · `data-theme` 없음 → `--bg:#f6f7f9`(`tokens.css:24`). 어두움은 `:root[data-theme='dark']`(102) 뿐 |
| 2 | 어두운 토큰 · 빈 `#root` | `main.jsx:28-37` — 사이트 · 콘솔만 렌더 전에 붙인다 |
| 3 | 상단바(세션 없음 — 레포 · 콘솔 · 이름 없음) + 「불러오는 중…」 | `Console.jsx:62 · 183` · `Site.jsx:35` |
| 4 | 상단바(세션) + 「읽는 중…」 | `/me` · `/site/info` 도착(콘솔 실측 90ms) |
| 5 | 내용 | 페이지 API 도착(콘솔 현황 674ms) |

레포 얼굴(App)은 2단계가 없고 **3단계가 밝은 채**로 시작한다 — `App.jsx:207-217` 의 effect 가 `state?.theme || 'system'` 으로 먼저 한 번, `state` 가 온 뒤 한 번 더 붙인다. OS 는 밝은데 「어둡게」 를 고른 사람은 네트워크 4건이 끝날 때까지 밝다. 1단계의 프레임 수는 재지 못했다(pane 에서 paint 엔트리 0건) — 스크립트가 deferred · CSS 가 render-blocking 이라 **≥1 프레임은 밝다**는 것은 추정이다.

### 2.5 단추 세기

| 자리 | 지금 | 안에 든 것 |
|---|---|---|
| 상단 바(레포 · admin) | **12** | 표식 1 · 스위처 4(소개 · 설명서 · 레포 ▾ · 콘솔) · 세그 3 · 검색 1 · 검증 1 · who(이름 · 역할 · ⏻) 1 · ⋯ 1 |
| ⋯ 더보기 | **15** | 도움말 · 읽기 모드 · 글자 5 · 폭 4 · 테마 3 · **관리 —** |
| 관리 메뉴(서버 · admin) | **6** | 현황 · 지식 레포 · 작업 레포 · 진단 · 정보 · 콘솔 · 문서로 돌아가기 |
| 관리 메뉴(서버 · writer) | 5 | 콘솔 빠짐 |
| 콘솔 메뉴 | 7 | 현황 · 사용자 · 토큰 · 지식 레포 · 작업 레포 · 서버 · 감사 |
| 같은 일을 하는 단추 | **14묶음 · 47자리** | [부록 C](#부록-c-같은-일을-하는-단추-14묶음-47자리) — 콘솔로 가는 길 9(레포 얼굴 한 화면에 4) · 레포로 가는 길 11 · 설명서 9 · 소개 6(상단 바에만 2) · 검사 결과 4 · 관리 진입 2 · 문서로 3 |

### 2.6 범위 밖 관찰

- 실서비스 `/site/info` 는 **v0.10.0 · 빌드 2026-09-24 00:46** 인데 번들 `index-DD5VSHu8.js` · `index-D9qV6LOy.css` 는 이 PC 의 v0.12.0 빌드(2026-09-25 10:41 · 507,462 B)와 **해시가 같다.** 서버 `bin/` 만 옛 판이거나 `VERSION` 이 갱신되지 않은 것 — 사람이 `upgrade.sh` 뒤 `doctor` 로 확인한다. 이 검토는 코드 v0.12.0 기준이다.
- `/api/<레포>/diag` 404 는 화면 UX TODO ⑧ 의 「별건」 이었다 — 여기 R3 에 접는다.

---

## 3. 권한 — 무엇이 누구에게 보이고, 서버는 무엇을 막나

### 3.1 역할 셋 · 판정 한 곳

`core/auth.js:25` `ROLES = viewer · writer · admin` · `:50` `write = writer|admin` · `:58-70` `grantOf` 가 `admin · write · allow(레포)` 를 낸다. 서버는 매 요청 명부에서 읽고(`:406-412` — 쿠키에 권한을 담지 않는다) 화면은 `/me`(`ctx-mcp-serve.mjs:882-900`)로 `role · admin · write · repos` 를 받는다. **역할 정의 문구** — `console/Users.jsx:16` 「writer — save · 레포 세우기」 · `:241` 「writer 는 save 로 기록을 만들고 레포를 세우고 작업 레포를 등록한다」 · 관리자 설명서 3.4 (다) 「레포 화면의 관리 > 지식 레포에서도 세운다(`writer` 이상)」 · MCP 설계서 §6.6.3 표 「세우는 것은 `write` 만」(2026-09-22 제품화 R7). **운영자의 지금 말과 어긋나는 것은 코드가 아니라 이 정의다** — 코드는 정의대로 돌고 있다.

### 3.2 관리 메뉴 × 역할 × API × 서버 판정 (서버 모드 `/r/<레포>/`)

| 관리 메뉴 | viewer | writer | admin | 화면이 부르는 것 | 서버 판정 | 일치 |
|---|---|---|---|---|---|:--:|
| 현황 | ○ | ○ | ○ | `/api/<r>/status` · `/repos` · `/workrepos` · `/api/<r>/diag`(404) | `/api/<r>/*` 1368 allow · `/repos` GET 1271 allow · `/workrepos` GET 1297 allow | ✓ |
| 지식 레포 | 목록 · [열기] | 목록 · **[세우기]** | 같음 | `/me` · `/repos` · `/packages` · **`POST /repos`** | **1254 `a.write` 만** · 재인증 없음 · 접근 부여 없음 | **✗ P1** |
| 작업 레포 | 목록 · 설치 방법 · kit | + 등록 · 삭제 | 같음 | `/workrepos` GET/POST/DELETE · `/kit/<r>?workrepo=` | 1316 `write` · kit 1402 allow | ✓ |
| 진단 · 정보 | 「읽는 중…」 고정 | 같음 | 같음 | `/api/<r>/diag` · `/api/<r>/open` → 둘 다 404 | `handleRead` 에 없음 — 로컬 값(경로 · 로그 · pid)은 **안 나간다** | ✗ P2(구멍 아님 · 없는 상태를 그린다) |
| 콘솔(링크) | — | — | ○ | `/console` · `/admin/*` | 페이지는 세션(743) · API 는 **913 admin · 914 대역 · 943 재인증** | ✓ |
| 레포 ▾ 「관리자만」 | — | — | ○ | `/admin/repos`(`App.jsx:77-79`) | 913 · 비관리자는 호출 자체가 없다 | ✓ |

이름 유출은 없다 — `/me` 883 · `/repos` GET 1271 · `/workrepos` 1297 전부 `a.allow` 로 거른다(hong 에게 beta 는 어디에도 없었다).

### 3.3 관리 對 콘솔 — 겹침

| 일 | 관리(레포 하나 · 모든 역할) | 콘솔(서버 전부 · admin) | 어느 쪽이 정본인가 |
|---|---|---|---|
| 현황 | 이 레포 카드 5 | 서버 카드 6 | 다른 질문 — 둘 다 산다 |
| 지식 레포 **목록** | `/repos`(내가 볼 수 있는 것 — 제목은 「이 서버가 든」) | `/admin/repos`(전부 · 사람 · 복구 셋) | 목록은 **레포 ▾ 메뉴**가 이미 든다(볼 수 있는 레포 · 권한 칩) — 관리의 것은 셋째 사본 |
| 지식 레포 **세우기** | `POST /repos` — write · 재인증 없음 · grant 없음 | `POST /admin/repos` — admin · 재인증 · grant · clone 도 | **콘솔** — 같은 `buildRepo` 를 두 규칙으로 부른다 |
| 작업 레포 | 이 레포의 등록 · 꾸러미 · 설치 방법(write) | 서버 전체 대장(읽기) | **관리** — 꾸러미가 레포마다 다르다(MCP 설계서 §6.7.3 · 콘솔은 장부) |
| 진단 | 「읽는 중…」 | doctor · 서버 · 로그 | **콘솔** — 서버 경로 · 로그는 admin 의 것(§6.6.3) |
| 미러 상태 한 값 | 현황 「미러」 · 지식 레포 행 · 상태바 | 지식 레포 표 · 현황 경고 | 같은 `/repos` 를 **세 부품이 따로** 읽는다(StatusBar:65 · admin/Overview:29 · RepoServer:31) |

### 3.4 문제 — 권한 · 분담

| # | 심각도 | 문제 | 근거 |
|---|:--:|---|---|
| **P1** | 상 | **writer 가 레포 화면에서 지식 레포를 세운다.** 화면(`RepoServer.jsx:62 · 101`)과 서버(`ctx-mcp-serve.mjs:1253-1257`)가 둘 다 `write` 를 보고, 콘솔의 같은 일은 admin + 재인증 + 접근 부여인데 이 길은 셋 다 없다. 세운 사람에게 접근을 주지 않아(`buildRepo` 531~) `repos:['alpha']` 인 writer 가 `beta` 를 세우면 「열기」 → `/r?from=beta` 「열 수 없습니다」 | §2.3 #4 실측 400(관문 통과) |
| **P2** | 중 | **서버 모드의 「진단 · 정보」 는 영원한 「읽는 중…」** — `/api/<r>/diag` · `/open` 이 서버에 없다. MCP 설계서 §6.6.3 은 「일부(built · 레포 수 · 스캔 시각)」 라 적었고 「서버 모드의 메뉴는 현황 · 작업 레포 · 진단 셋」 이라 했는데 화면은 넷 + 콘솔이다. 불변조건 7(없는 상태를 그리지 않는다) | §2.2 #6 · §2.3 #7 |
| **P3** | 중 | **같은 일이 두 얼굴에 산다** — 지식 레포 목록 셋째 사본 · 세우기 둘(규칙 다름) · 현황 둘 · 미러 한 값을 다섯 자리가 각자 읽는다. 「관리와 콘솔이 같아 보인다」 의 실체 | §3.3 |
| **P4** | 하 | `/workrepos` GET 이 **명부의 활성 사용자 이름 전부**를 viewer 에게도 낸다(1306 `users: usersOf()`) — 화면은 write 일 때만 쓴다(`WorkReposServer.jsx:87`). 화면이 숨겼는데 API 가 열린 모양 | 코드 |
| **P5** | 하 | `handleRead` 의 `/git` · `/git/config`(`read-api.js:119 · 124`)가 서버 모드에서도 열려 있어 허용 레포의 viewer 가 서버 clone 의 origin 호스트 · 커밋 신원 · hooksPath 를 읽는다. 비밀은 아니나 서버 화면 어디도 안 쓰는 로컬형 문법(동기화 메뉴는 `local: true`) — 「없는 것」 이어야 한다(§6.2) | 코드 |
| **P6** | 하 | writer 의 현황 노트 · 지식 레포 노트가 「콘솔 › 지식 레포(관리자)」 를 안내한다 — 못 들어가는 곳. 관리 메뉴의 「콘솔」 은 상단 스위처와 중복(admin 에게 한 화면에 콘솔 길 4) | §2.3 #2 · 부록 C |

---

## 4. 깜빡임 — 왜 SPA 가 SPA 처럼 안 움직이나

### 4.1 원인 둘

**(가) 얼굴이 첫 렌더에서 고정된다.** `main.jsx:39` `const Root = face === 'console' ? Console : face === 'site' ? Site : App` — `face` 는 `lib/api.js:55` 의 모듈 상수(`readMode()` 가 `location.pathname` 을 **한 번** 읽는다). 그래서 `router.jsx:7-8` 이 「얼굴을 넘는 이동은 `location.href` 다」 라고 적어 두었고, `TopBar.jsx:63-72` 의 `A` 는 `same` 이 아니면 `<a>` 를 낸다. 얼굴 넷 사이의 길은 v0.11.0 에서 **생겼지만 전부 문서 교체**다.

**(나) 레포가 모듈 상수다.** `lib/api.js:53-56 · 104` `mode · isServer · BASE · LS` — `req()` 135 가 `BASE` 를, `localState` 104 가 `LS` 를 상수로 쓴다. 다른 레포로 가려면 모듈을 다시 실행하는 수밖에 없어 `gotoRepo`(98-100)가 `location.href` 다. 읽는 자리 **56곳**(+ 하드코딩 `face` prop 5) — [부록 A](#부록-a-문서-교체가-일어나는-전환-31곳) 끝의 표.

**쿠키는 원인이 아니다.** 세션 쿠키는 같은 origin 의 세 얼굴이 같이 쓴다. 서버 왕복이 진짜 필요한 전환은 `/logout`(쿠키 삭제) 하나다.

### 4.2 문서 교체 31곳 — 요약

| 종류 | 수 | 대표 |
|---|:--:|---|
| `location.href` · `location.reload` | 5 | `api.js:99`(gotoRepo) · `:152`(401) · `Login.jsx:30` · `NoRepo.jsx:27` · `admin/Repo.jsx:52`(로컬) |
| 얼굴 밖으로 가는 `<a href>` | 21 | `TopBar.jsx:63-72`(스위처) · `:93`(표식) · `:134 · 170`(로그아웃) · `:158`(표식 메뉴 — 같은 얼굴 안도) · `App.jsx:539 · 550 · 1023` · `AdminView.jsx:99` · `Console.jsx:214-215` · `console/Repos.jsx:189 · 208` · `console/WorkRepos.jsx:89` · `Landing.jsx:40`(같은 얼굴 안인데 `<a>`) · `Site.jsx:53 · 68` · `NoRepo.jsx:59 · 64 · 92 · 103` · `Setup.jsx:170` |
| 서버 302 | 4 | `ctx-mcp-serve.mjs:688`(세션 없음 → `/login`) · `:1539`(`/r` → 첫 레포) · `:1560`(권한 밖 → `/r?from=`) · `:832`(옛 HTML 폼 로그인 — SPA 는 안 탄다) |
| 네이티브 form submit | 0 | `Login.jsx:49` 는 `preventDefault` → JSON |

로그인 → `/r` 이고 lastRepo 가 없으면 **2홉**(`Login.jsx:30` → 서버 1539) 이다. 전체 표는 [부록 A](#부록-a-문서-교체가-일어나는-전환-31곳).

### 4.3 마운트마다 다시 읽기 24곳 — 요약

문서 교체가 없는 전환에서도 깜빡이는 이유다. 부품이 언마운트되고 다시 마운트되면 `useEffect(() => load(), [])` 가 처음부터 읽고 그 사이 「읽는 중…」 을 그린다(코드에 22곳). 캐시는 레포 ▾ 의 `allRepos`(`App.jsx:77-79`) 하나뿐이다.

| 언제 | 다시 읽는 부품 | 자리표시 |
|---|---|---|
| 관리 진입마다 | `AdminView` diag(`:66-68` — 서버는 404 → 영원히 null) | — |
| 관리 탭 오갈 때마다 | admin `Overview`(`:25-39` — `/status` · `/repos` · `/workrepos`) · `RepoServer`(`:29-36` — `/me` · `/repos` · `/packages`) · `WorkReposServer`(`:23-26`) · 로컬 `Sync` · `WorkRepos` · `Repo` | 「읽는 중…」 · 「패키지를 읽는 중…」 · 「대장을 읽는 중입니다…」 |
| 콘솔 메뉴 오갈 때마다 | 페이지 7 전부(`Console.jsx:86` `<Page>` 교체 · `console/*.jsx` 의 `load()`) | 「읽는 중…」 7곳 |
| 설명서 책 바꿀 때마다 | `Manual.jsx:41-53` `setText(null)` → `/site/manual/<id>.md` | 「읽는 중…」 |
| 검사 오버레이 열 때마다 | `CheckView.jsx:25-32` `/check` | 「불러오는 중…」 |
| 문서 교체마다 | `App`(다섯 요청 `Promise.all` · `/me` 는 await 안 해 **상단 바가 두 번** 그려진다 `:112 · 505-508`) · `Console`(`/me`) · `Site`(`/site/info` — `info` null 첫 렌더 → 상단 바 두 번) · `NoRepo`(`/me`) · `StatusBar`(`/repos`) | 「불러오는 중…」 · 「확인 중…」 |

전체 표는 [부록 B](#부록-b-마운트마다-다시-읽는-부품-24곳).

### 4.4 첫 페인트와 테마

`viewer/index.html` 에 인라인 테마 스크립트가 없고 `html` 에 배경 규칙이 없다(`tokens.css:135-143` — `body` 만) · `color-scheme` 0곳 · `:root[data-theme='auto-dark']`(`tokens.css:103`)는 어느 JS 도 안 쓰는 죽은 셀렉터(쓰는 값은 `'dark' | 'light'` — `main.jsx:32` · `App.jsx:212`). 스크롤바 · 폼 컨트롤은 `color-scheme` 이 없어 어두운 테마에서도 밝다(사실). 순서는 §2.4 의 단계 표.

### 4.5 문제 — 전환

| # | 심각도 | 문제 | 근거 |
|---|:--:|---|---|
| **P7** | 상 | **얼굴을 넘는 전환 · 레포 바꾸기 · 로그인 뒤가 전부 문서 교체** — 31곳. `index.html` `no-store` 재수신 → 밝은 첫 페인트 → 세션 없는 상단 바 → 세션 있는 상단 바 → 「읽는 중…」 → 내용, 다섯 단계 | §2.4 · §4.1 |
| **P8** | 상 | **뒤로 가기 · 새로고침 · 링크가 관리 · 그래프를 모른다** — `topMode` · `adminTab` 이 메모리 상태라 콘솔에서 「레포」 로 오면 문서 모드로 떨어진다. 사이트 · 콘솔은 「주소가 상태」(§6.6.2)인데 레포 얼굴만 예외 | §2.2 #10 |
| **P9** | 중 | 문서 교체가 없는 전환도 **마운트마다 「읽는 중…」** — 관리 탭 4 · 콘솔 7 · 설명서 · 검사 · 캐시 0 · 같은 `/repos` 를 세 부품이 따로 읽는다 | §4.3 |
| **P10** | 중 | **첫 페인트가 늘 밝다** — 테마가 CSS 뒤 · 스크립트 뒤에 붙는다. 레포 얼굴은 `state` 가 온 뒤라 더 늦다. `color-scheme` 없음 | §4.4 |
| **P11** | 하 | 상단 바가 문서마다 두 번 그려진다(`me` · `info` 가 null 인 첫 렌더) — 「레포 · 콘솔 · 이름」 이 늦게 나타난다 | `App.jsx:505-508` · `Site.jsx:35-46` |
| **P12** | 하 | 좁은 화면(≤1080px) 표식 메뉴 · 소개 히어로 「로그인」 · `Landing.jsx:40` 은 **같은 얼굴 안인데도** `<a>` 다 — 사이트 안에서도 문서 교체가 난다 | `TopBar.jsx:158` · `Landing.jsx:40` |

---

## 5. 권장안

### 5.1 역할 경계 — R1~R4

**R1 지식 레포 세우기는 admin · 콘솔 한 곳.** `POST /repos`(레포 얼굴 · 1253-1268)를 **없앤다**(라우트 삭제 — 「막은 것이 아니라 없는 것」 §6.2 · 화면이 안 부르면 남길 이유가 없다). 콘솔 `POST /admin/repos` 는 이미 같은 `buildRepo` + admin + 재인증 + 접근 부여 + clone 이다. 하네스에 「writer `POST /repos` → 404」 · 「writer `POST /admin/repos` → 403」 둘. 역할 정의 문구를 고친다 — `Users.jsx:16` 「writer — save · 작업 레포 등록」 · `:241` · 관리자 설명서 3.4 (다) · MCP 설계서 §6.6.3 표(정정 상자) · 사용자 설명서 8.8 표.

**R2 서버 모드의 관리 메뉴는 셋 — 현황 · 작업 레포 · 정보.** MCP 설계서 §6.6.3 이 원래 적은 셋으로 돌아간다. 「지식 레포」 화면(`RepoServer.jsx`)은 서버 모드에서 **내지 않는다** — 목록은 레포 ▾ 메뉴(볼 수 있는 레포 · 권한 칩 · admin 에게 이 서버의 레포 전부)가, 미러 한 값은 현황 「미러」 카드가, 세우기 · 복구는 콘솔이 든다. 관리 메뉴의 「콘솔」 줄과 「문서로 돌아가기」 줄을 뺀다(상단 스위처의 「콘솔」 · 세그의 「문서」 · Esc · 뒤로 가기가 있다). 로컬 모드의 메뉴 다섯(현황 · 지식 레포 · 동기화 · 작업 레포 · 진단)은 그대로.

**R3 「진단 · 정보」 → 「정보」(서버).** 값만 낸다 — 판 · 빌드(`/me` 의 `version` · `/site/info` 의 `built`) · 내 계정 · 역할 · 이 레포에서 내가 할 수 있는 것(읽기 / save · 작업 레포 등록) · 토큰 만료 D-n(`/me` 의 `expiresInDays` — 있는데 화면이 안 쓴다) · 볼 수 있는 레포 수 · 단축키 · 설명서 링크. `/api/<r>/diag` · `/open` 은 **부르지 않는다.** 서버 경로 · 로그 · pid 는 콘솔 › 서버의 것(§6.6.3 그대로). 로컬 모드의 「진단 · 정보」 는 그대로.

**R4 API 를 화면과 맞춘다.** `/workrepos` GET 의 `users` 는 `write` 일 때만(viewer 에게는 `[]`) · 서버 모드 `handleRead` 에서 `/git` · `/git/config` 를 뺀다(로컬 뷰어의 `http.js` 만 남긴다) · writer 에게 「콘솔 › …」 안내 문장을 내지 않는다(admin 에게만 · 아니면 「관리자에게」).

### 5.2 화면 — 적게 · 성격대로 — R5~R6

**R5 상단 바(레포 얼굴) — 12 → 11 · 묶음 다섯.**

```
전   [C CDP]  소개  설명서  레포 alpha ▾  콘솔  │  문서  그래프  관리  │  검색 ⌘K  │  ⚠ 검증 2  │  kjsa admin ⏻  ⋯
후   [C CDP]  설명서  레포 alpha ▾  콘솔          │  문서  그래프  관리  │  검색 ⌘K  │  ⚠ 검증 2  │  kjsa admin ⏻  ⋯
      ─얼굴(어디로)─────────────────────────────    ─이 레포의 화면─      ─찾기─      ─상태─      ─나 · 설정─
```

- 「소개」 탭을 뺀다 — 표식 `C CDP` 가 이미 소개다(화면 UX 검토 Q1). 소개에 있을 때 표식에 `aria-current`. 상단 바에서 소개로 가는 길이 둘이었다(부록 C).
- 세그 「문서 · 그래프 · 관리」 는 그대로 — **한 레포의 화면 셋**이고 성격이 같다(창 전체를 쓰는 모드). ⋯ 메뉴의 「관리 —」 줄을 뺀다(같은 일을 하는 단추 둘 · `App.jsx:676`).
- 「검증」 pill 은 그대로(아침에 제일 먼저 보는 값). 현황 카드의 「검사 결과」 단추는 그대로(다른 화면).
- who · ⏻ · ⋯ 는 그대로 — 세 얼굴이 같은 자리(v0.11.0 ①). 사이트 · 콘솔의 상단 바는 스위처만 셋으로 줄어든다.
- 스위처가 접히는 표식 메뉴(≤1080px)도 같은 항목(설명서 · 레포 · 콘솔 · 로그아웃).

**R6 관리(서버) 메뉴 6 → 3 · 성격이 곧 순서.**

| 후 | 성격 | 안에 든 것 | 누가 |
|---|---|---|---|
| 현황 | 읽는다 · 매일 | 지식 레포 · 미러 · 검증 · 문서 상태 · 작업 레포 카드(그대로) — 노트의 「콘솔 › …」 는 admin 에게만 | 모두 |
| 작업 레포 | 처음 한 번 세운다 · 가끔 | 대장(이 레포) · 설치 방법 · 꾸러미 · **등록 · 삭제(write)** | 모두 보고 · write 가 바꾼다 |
| 정보 | 문제 났을 때 본다 | R3 | 모두 |

콘솔 메뉴 7 은 그대로(서로 다른 일). 콘솔 현황의 「자세히 → 서버」 둘은 진단 카드의 것을 `/console/server#doctor` 로(같은 목적지 둘 → 하나로 보이게).

### 5.3 SPA — 근본 — R7~R9

**R7 껍데기 하나 · 라우트가 얼굴을 고른다.** `main.jsx` 는 `<Shell/>` 하나를 그리고, `Shell` 이 `useRoute()` 로 **매 렌더** 얼굴을 정한다(`/r/<repo>/…` → 레포 · `/console…` → 콘솔 · 나머지 → 사이트 · `__CDP_SERVER__` 없음 → 로컬). `TopBar` 는 `Shell` 이 한 번 그려 얼굴 사이에 **살아남는다.** `lib/api.js` 의 `mode · isServer · face · BASE · LS` 는 함수(`getMode()` · `currentRepo()`)가 되고 `req()` 는 부르는 시점의 레포로 `BASE` 를 만든다 · `gotoRepo` → `navigate('/r/<n>/')` · 401 → `navigate('/login?next=')` · `rememberRepo` 는 App 마운트 effect 로. 읽는 자리 56곳은 훅/props 로(부록 A 끝 표). `<App key={repo}>` 로 레포마다 상태를 새로 — `gotoRepo` 가 문서 교체였던 이유(「화면 상태를 들고 가지 않는다」 §6.6.2)를 그대로 지킨다. 얼굴 밖 `<a>` 21곳은 전부 `Link`. 서버의 `serveWeb` · `/r` 302 · `/r/<x>/` 302 는 **그대로** — 직접 진입 · 새로고침 · 북마크의 것이다. 클라이언트 라우터는 `/r` 을 만나면 `me.repos[0]` 로 `navigate(…, {replace})`, 권한 밖 레포는 `/api/<r>/repo` 404 를 받아 `/r?from=` 화면으로(서버 판정 그대로 · D4). 로그아웃은 `fetch('/logout', {method:'POST'})`(서버에 JSON 200 한 줄 추가 · GET 302 는 남긴다) → 세션 비움 → `navigate('/')`.

**R8 세션 하나 · 데이터 캐시.** `Shell` 이 `/me`(세션) 또는 `/site/info`(비로그인)를 **한 번** 읽어 `SessionCtx` 로 내린다 — `App` · `Console` · `Site` · `NoRepo` · `RepoServer` 의 개별 읽기 다섯을 지운다 · 로그인 성공은 `setMe` + `navigate(next)` · 상단 바가 두 번 그려지지 않는다(P11). `lib/cache.js` — `useResource(key, fetcher, { ttl })`: 모듈 캐시(키 = 레포 + 경로) · 마운트 때 캐시가 있으면 **즉시 그리고 뒤에서 갱신**(stale-while-revalidate) · 「읽는 중…」 은 캐시가 없을 때만 · 쓰기 뒤 `invalidate(key)`. 적용 — 관리 4 · 콘솔 7 · 설명서 · 검사 · StatusBar/Overview/RepoServer 의 `/repos` 는 **하나**로. 라우트 전환은 `startTransition` 으로 — 새 화면의 첫 렌더가 끝날 때까지 이전 화면이 남는다(React 18).

**R9 주소가 상태 · 첫 페인트 전 테마.** `/r/<repo>/`(문서) · `/r/<repo>/graph` · `/r/<repo>/manage/<overview|work|info>` — `topMode` · `adminTab` 을 라우트로(뒤로 가기 · 새로고침 · 링크 · 콘솔 → 레포가 관리로 돌아온다 · P8). 로컬 모드도 같다(`?t=` 는 `readToken` 이 첫 진입에서 지우므로 라우터가 없던 이유(`router.jsx:4-5`)가 사라졌다 — 확인하고 적는다). `index.html` head 에 **CSS 보다 앞** 인라인 5줄 — `cdp.theme` + `matchMedia` → `document.documentElement.dataset.theme` · `html { background: var(--bg); color-scheme: light dark }` · `<meta name="color-scheme" content="light dark">` · 서버 `serveWeb` 은 `__CDP_SERVER__` 한 줄을 그 앞에 심는다. `main.jsx` 의 테마 코드는 얼굴 무관 하나 · `App` 의 effect 는 `state.theme` 을 **바꿀 때만** 쓴다(읽지 않는다) · `auto-dark` 셀렉터 삭제.

### 5.4 문서 · 검증 · 판 — R10

- 하네스(`ops/verify/run.mjs`) — writer `POST /repos` 404 · writer `POST /admin/repos` 403 · viewer `GET /workrepos` 에 `users` 없음 · viewer `GET /api/<r>/git` 404 · `GET /r/<r>/` 의 `index.html` 에 인라인 테마 스크립트가 `<link rel=stylesheet>` 앞 · `POST /logout` 200.
- 브라우저 실측 스크립트(Playwright · `%LOCALAPPDATA%\ms-playwright\chromium-1243` 이 있다 · 화면 UX 검토 부록 B 의 절차) — 얼굴 순회에서 `navigation.length === 1` · `timeOrigin` 불변 · 두 번째 방문에서 「읽는 중…」 0 · 「후」 그림.
- 문서 — 사용자 설명서 8.8 표(상단 · 관리 메뉴) · 8.1 · 관리자 설명서 3.4 (다) · 5.2 · 6.1(역할) · MCP 설계서 §6.6.3 표 · 제품관리서비스 검토 §4.8 · 화면 UX 검토 §5.5 — 전부 **정정 상자** · CHANGELOG 「미출시」 · 판은 운영자(권장 **v0.13.0** — 화면 구조 · 권한 · 라우팅이 바뀐다).

---

## 6. 결정할 것

| # | 결정 | 권장 | 왜 |
|---|---|---|---|
| Q1 | 「소개」 탭을 빼고 표식이 소개를 맡는다 | **예** | 상단 바에 소개 길이 둘. 화면 UX 검토 Q1 이 표식 = 소개라 정했다 |
| Q2 | 지식 레포 세우기는 admin · 콘솔만 | **예** | 운영자의 말 그대로. 콘솔이 재인증 · 접근 부여까지 든다 |
| Q3 | `POST /repos` 를 삭제(404) — admin 전용으로 남기지 않는다 | **삭제** | 화면이 안 부르는 라우트는 「없는 것」(§6.2). 하네스 한 줄로 회귀를 잡는다 |
| Q4 | 서버 모드 관리 메뉴 셋(현황 · 작업 레포 · 정보) | **예** | MCP 설계서 §6.6.3 의 원래 셋. 목록은 레포 ▾ · 세우기는 콘솔 |
| Q5 | 그래프 · 관리를 주소로(`/r/<r>/graph` · `/manage/<tab>`) — 로컬도 | **예** | 뒤로 가기 · 새로고침 · 링크. `?t=` 는 첫 진입에서 지워진다 |
| Q6 | 로그아웃 `POST /logout` JSON 200 추가(GET 302 는 남긴다) | **예** | 유일한 서버 왕복 전환을 pushState 안으로 |
| Q7 | 서버 모드 `handleRead` 에서 `/git` · `/git/config` 제거 · `/workrepos` `users` 는 write 만 | **예** | 화면이 안 쓰는 로컬형 문법 · 명부 이름은 write 의 것 |
| Q8 | 판 | **v0.13.0** | 화면 구조 · 권한 · 라우팅 — 사용자 · 관리자 설명서가 바뀐다 |

---

## 7. 끝났다고 보는 기준 — 명령 하나로

| 재는 것 | 기준 |
|---|---|
| 얼굴 순회(소개 → 설명서 → 로그인 → 레포 → 그래프 → 관리 › 작업 레포 → 콘솔 › 지식 레포 → 「레포」 → 다른 레포 → 설명서 → 로그아웃 → 소개) | 브라우저 콘솔 `performance.getEntriesByType('navigation').length === 1` 이 끝까지 · `performance.timeOrigin` 불변 · 「레포」 로 돌아올 때 **관리 › 작업 레포**가 열려 있다 |
| hong(writer) `/r/alpha/` 관리 | `document.querySelectorAll('.admin__menu .astep').length === 3` · 「세우기」 0 · `fetch('/repos',{method:'POST'})` → 404 · `fetch('/admin/repos',{method:'POST'})` → 403 |
| kjsa(admin) | 관리 메뉴 3 · 상단 스위처 셋(설명서 · 레포 · 콘솔) · 콘솔 › 지식 레포에 [+ 새 레포] 그대로 |
| 두 번째 방문 | 관리 현황 · 콘솔 7 페이지 · 설명서 책을 두 번째 열 때 「읽는 중…」 이 **0 프레임**(`MutationObserver` 로 문자열 출현을 센다) |
| 첫 페인트 | `document.head.querySelector('script:not([src])')` 가 `link[rel=stylesheet]` **앞** · `localStorage['cdp.theme']='dark'` 뒤 새로고침 직후 `getComputedStyle(html).colorScheme === 'dark'` · `html` 배경이 `--bg` |
| 조작 수 | 상단 바 ≤ 11(admin) · 10(writer) · ⋯ 메뉴에 「관리」 없음 · 관리 메뉴에 「콘솔」 · 「문서로 돌아가기」 없음 |
| 회귀 | `npm test` · `npm run verify`(새 줄 6 ✓) · `npm run build` · 화면 UX 검토 「후」 값(상단 48px · 권한 밖 문장 · 900px 표식 메뉴) 그대로 |

---

## 8. 하지 않는 것

- **라우터 라이브러리** — D12. `router.jsx` 를 늘린다(파라미터 · `startTransition`).
- **번들을 얼굴마다 나누기** — §6.8. 한 번들이 셋에서 돈다는 전제는 그대로다 — 오히려 그 전제가 Shell 하나를 가능하게 한다.
- **콘솔을 레포 탭으로 · 관리를 콘솔로 합치기** — 화면 UX 검토 §6. 관리는 레포 하나 · 모든 역할, 콘솔은 서버 · admin — 분담은 그대로고 **겹치는 것만** 뺀다.
- **서버 302 지우기** — 직접 진입 · 새로고침 · 북마크의 것이다.
- **알림 · 실시간 갱신** — 캐시는 stale-while-revalidate 까지. SSE 는 서버 모드에 없다(§6.1).
- **새 색 · 새 글꼴 · 아이콘 라이브러리 · 2단 상단 바** — 화면 UX 검토 §6.
- **권한 밖과 없음을 갈라 말하기** — D4.

---

## 부록 A. 문서 교체가 일어나는 전환 31곳

| # | 파일:줄 | 출발 → 도착 | 종류 | 왜 |
|---|---|---|---|---|
| 1 | `lib/api.js:98-100` `gotoRepo` | 레포 → 다른 레포 | `location.href` | (나) 상수. 부르는 곳 `App.jsx:525` · `admin/RepoServer.jsx:86 · 163` |
| 2 | `lib/api.js:152` | fetch 401 → `/login?next=` | `location.href` | 세션 끊김 · (가) |
| 3 | `site/Login.jsx:30` | 로그인 → 레포 · 콘솔 · `/r` | `location.href` | (가). `/r` 이고 lastRepo 없으면 서버 302 한 번 더 — 2홉 |
| 4 | `site/NoRepo.jsx:27` | `/r` → 레포 | `location.href` | (가) |
| 5 | `admin/Repo.jsx:52` | 로컬 · 다른 레포 | `location.reload()` | (나) 로컬 |
| 6 | `TopBar.jsx:63-72` `A` | 스위처 넷 | `<a>` when `!same \|\| !Link` | 「레포」 는 `same` 키가 없다(59) · App 은 `Link` 를 안 넘긴다 → 레포 얼굴에서 전부 `<a>` |
| 7 | `TopBar.jsx:93` | 표식 → `/` | `<a>` | 레포 · 콘솔 |
| 8 | `TopBar.jsx:134 · 170` · `NoRepo.jsx:103` | ⏻ → `/logout` | `<a>` + 302 `/` | 서버가 필요한 유일한 전환 |
| 9 | `TopBar.jsx:158` | 표식 메뉴(≤1080px) | `<a>` 전부 | 같은 얼굴 안도 |
| 10 | `TopBar.jsx:144 · 179` | 로그인 | `<a>` | 144 는 Site 가 늘 Link 를 넘겨 죽은 가지 |
| 11 | `App.jsx:539 · 550` | 레포 ▾ → `/console/repos` | `<a>` | (가) |
| 12 | `App.jsx:1023` | 도움말 → `/manual` | `<a>` | (가) |
| 13 | `admin/AdminView.jsx:99` | 관리 메뉴 → `/console` | `<a>` | (가) |
| 14 | `console/Console.jsx:214 · 215` | NoAdmin → 레포 · 설명서 | `<a>` | (가) |
| 15 | `console/Repos.jsx:189 · 208` | 「열기」 → `/r/<n>/` | `<a>` | (가) |
| 16 | `console/WorkRepos.jsx:89` | 「그 레포로 →」 | `<a>` | (가) |
| 17 | `site/Landing.jsx:40` | 히어로 「로그인」 · 「레포 열기」 | `<a>` | 비로그인은 `/login?next=%2Fr` — 같은 얼굴 안인데 `<a>` |
| 18 | `site/Site.jsx:53 · 68` | 바닥글 「레포」 · NotFound | `<a>` | (가) |
| 19 | `site/NoRepo.jsx:59 · 64 · 92` | 레포 · 콘솔 | `<a>` | (가) |
| 20 | `site/Setup.jsx:170` | 「콘솔로」 | `<a>` | (가) |
| 21 | `ctx-mcp-serve.mjs:688` | 세션 없음 → `/login` | 302 | 직접 진입 — 남긴다 |
| 22 | `ctx-mcp-serve.mjs:1539` | `/r` → 첫 레포 | 302 | 직접 진입 — 남긴다 |
| 23 | `ctx-mcp-serve.mjs:1560` | 권한 밖 → `/r?from=` | 302 | D4 — 남긴다 |
| 24 | `ctx-mcp-serve.mjs:832` | 옛 HTML 폼 로그인 | 302 | SPA 는 안 탄다 |

**`mode · face · BASE · isServer` 를 읽는 자리(56 + 하드코딩 5)** — `lib/api.js` 19(40 · 53-56 · 78 · 104 · 109 · 118 · 135 · 140 · 151 · 198 · 200 · 202 · 214 · 231 · 280 · 297) · `main.jsx` 3(23 · 28 · 39) · `App.jsx` 13(112 · 121 · 162 · 182 · 506-510 · 524-525 · 565 · 594 · 1020) · `AdminView.jsx` 5(71 · 72 · 96 · 132 · 146) · `admin/Overview.jsx` 5 · `RepoServer.jsx` 4 · `WorkReposServer.jsx` 1(`location.pathname` 직접 · 33) · `StatusBar.jsx` 6 · 하드코딩 `face` prop `App.jsx:506` · `Site.jsx:39` · `Console.jsx:69 · 186 · 196`. `repoHref · lastRepo · rememberRepo` 는 localStorage 만 봐서 그대로 둬도 된다.

## 부록 B. 마운트마다 다시 읽는 부품 24곳

| 부품 | 파일:줄 | 부르는 것 | 자리표시 | 다시 읽는 때 |
|---|---|---|---|---|
| App | `App.jsx:102-149` | `/repo` `/docs` `/vocab` `/state` `/managed` + `/me`(await 안 함) | 「불러오는 중…」 479 | 문서마다 · 상단 바 두 번 |
| 레포 ▾ | `App.jsx:77-79` | `/admin/repos` | — | 열 때 한 번 · 캐시 ✓ |
| AdminView | `:66-68` | `/api/<r>/diag` | — | 관리 진입마다(서버 404) |
| admin/Overview | `:25-39` | `/status` + 서버 `/repos` `/workrepos` · 로컬 `/git` `/workrepos` | 「읽는 중…」 149 | 탭 전환마다 |
| admin/RepoServer | `:29-36` | `/me` `/repos` `/packages` | 68 · 110 | 탭 전환마다 |
| admin/WorkReposServer | `:23-26` | `/workrepos` | 45 | 탭 전환마다 |
| admin/Diag | `:12` | (diag) | 「읽는 중…」 | 서버는 고정 |
| admin/Repo · WorkRepos · Sync(로컬) | `Repo.jsx:26-29` · `WorkRepos.jsx:37-40` · `Sync.jsx:31-39` | `/repo/probe` · `/workrepos` · `/git` `/git/config` | 125 · 123 · 120 · 171 | 탭 전환마다 |
| StatusBar | `:55-90` | 서버 `/repos` · 로컬 `/git` → `?fetch=1` | 없음 | 문서마다 + focus 15s + 5분 |
| CheckView | `:25-32` | `/check` | 「불러오는 중…」 34 | 오버레이 열 때마다 |
| DocView · Explore · Palette | `DocView.jsx:40-55` · `Explore.jsx:46-56` · `Palette.jsx:32-45` | `/docs/<id>` · `/next` · `/search` | 198 | 내용이 바뀌는 것 — 정상 |
| Console | `:48-50` | `/me` | 「불러오는 중…」 62 | 콘솔 문서마다 · Bare → 다시 |
| 콘솔 페이지 7 | `Overview:15-18` · `Users:31-33` · `Tokens:24-27` · `Repos:35-51` · `WorkRepos:16-19` · `Server:20-26` · `Audit:25-28` | `/admin/overview` `/users` `/tokens` `/doctor`+`/repos` `/workrepos` `/server`+`/doctor`+`/log` `/audit` | 「읽는 중…」 7 | 메뉴 전환마다 · 캐시 0 |
| Site | `:21-24` | `/site/info` | — | 문서마다 · 상단 바 두 번 |
| Manual | `:41-53` | `/site/manual/<id>.md` | 「읽는 중…」 152 | 책 바꿀 때마다 |
| NoRepo | `:17-33` | `/me` | 「확인 중…」 34 | 문서마다 |

## 부록 C. 같은 일을 하는 단추 14묶음 47자리

| 일 | 자리 | 수 |
|---|---|:--:|
| 관리로 들어간다 | `App.jsx:580` 세그 · `:676` ⋯ | 2 |
| 문서로 돌아간다 | `App.jsx:572` 세그 · `AdminView.jsx:109` · `App.jsx:382` Esc | 3 |
| 콘솔로 간다 | `TopBar.jsx:60` · `:158` · `AdminView.jsx:99` · `App.jsx:550` · `:539` · `NoRepo.jsx:64 · 92` · `Setup.jsx:170` · `Site.jsx:68` | 9 |
| 소개로 간다 | `TopBar.jsx:89/93` 표식 · `:57` 탭 · `:158` · `Login.jsx:69` · `Setup.jsx:98` · `Site.jsx:68` | 6 |
| 검사 결과 | `App.jsx:598-606` pill · `admin/Overview.jsx:120` · `StatusBar.jsx:132` · `:166`(로컬) | 4 |
| 지식 레포 목록 | 레포 ▾ `App.jsx:517-556` · `RepoServer.jsx:66-94` · `console/Repos.jsx` · `admin/Overview.jsx:50` | 4 |
| 새 레포를 세운다 | `RepoServer.jsx:108-168` · `console/Repos.jsx:95 · 235` | 2 |
| 레포로 간다 | `TopBar.jsx:59` · `Site.jsx:53` · `Landing.jsx:40` · `Console.jsx:214` · `console/Repos.jsx:189 · 208` · `console/WorkRepos.jsx:89` · `RepoServer.jsx:86 · 163` · `App.jsx:525` · `NoRepo.jsx:59` | 11 |
| 설명서로 간다 | `TopBar.jsx:58` · `Site.jsx:52 · 68` · `App.jsx:1023` · `Landing.jsx:43 · 189` · `Console.jsx:215` · `NoRepo.jsx:93 · 102` | 9 |
| 로그인 · 로그아웃 | `TopBar.jsx:140` · `Site.jsx:53` · `Landing.jsx:40` · `Setup.jsx:32` / `TopBar.jsx:134 · 170` · `NoRepo.jsx:103` | 4 · 3 |
| 진단 다시 검사 · 「서버」 자세히 · 그래프 | `console/Overview.jsx:39` · `Server.jsx:51` / `Overview.jsx:58 · 95` / `App.jsx:575` · `Finder.jsx:142` | 2 · 2 · 2 |

## 부록 D. 실측 방법

- 실서비스 — 앱 내장 브라우저 · 1280×800 · 비로그인. `performance.getEntriesByType('navigation')` · `performance.timeOrigin` · `getComputedStyle` · `/site/info`.
- 개발용 서버 — `.claude/launch.json` 의 `cdp-serve`(7380 · `ops/out/dev-serve/`). 토큰은 `ctx serve token --user kjsa|hong` 으로 이 검토 동안만 발급했고 끝난 뒤 `token revoke` 했다(폐기 줄 둘이 `auth.json` 에 남는다). 화면 값은 DOM 질의, 전환은 `timeOrigin` 비교, 자리표시는 클릭 직후와 2초 뒤 두 번 세었다. `POST /repos` 검사는 무효 이름이라 아무것도 만들지 않았다.
- 코드 전수 — 페르소나 에이전트가 `viewer/src` 47파일 · 서버 · `core/auth.js` 를 읽기만으로 훑었다(부록 A · B · C). 추정으로 적은 것은 §2.4 의 「≥1 프레임」 하나다.
