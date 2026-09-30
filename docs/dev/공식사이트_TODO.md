# 공식 사이트 TODO — 제작 검토 v0.1 의 권장안 S1~S14 를 실행한다

> 짝 문서: [`../design/CDP_공식사이트_제작검토_v0.1.md`](../design/CDP_공식사이트_제작검토_v0.1.md).
> **운영자 지시(2026-09-30)** — 「vercel에 사외로 올릴 것이다. 전체 권장안으로 진행해.」
> Q1 은 **Vercel · 사외 공개**로 정해졌다. Q2~Q6 은 권장안 그대로 간다. 진행 중에 생긴 결정도 권장안으로 처리하고, 아래 「나온 것」 에 적는다.
> 커밋까지만 한다. push · 태그 · Vercel 연결은 사람이 한다.

## 결정이 바꾼 것 — Q1 = Vercel · 사외

| 자리 | 검토의 권장안 | 바뀐 것 |
|---|---|---|
| S4 호스팅 | 정하지 않고 zip 까지 | **`vercel.json`** 을 레포 루트에 둔다(빌드 명령 · 출력 폴더 · 헤더). 릴리스 zip 도 그대로 만든다 |
| S3 라우팅 | 주소별 `index.html` 사본 + `404.html` | 그대로. Vercel 은 `/screens` 를 `screens/index.html` 로, 없는 주소를 `404.html` 로 낸다. 재작성 규칙은 쓰지 않는다 |
| S11 메타 | Q3 가 사외면 색인 허용 | 색인 허용. `robots.txt` · `sitemap.xml` 을 낸다. 절대 주소는 빌드 변수 `CDP_SITE_URL` 에서 받는다(없으면 sitemap 을 상대 경로로 내지 않고 **생략**한다) |
| S1 외부 요청 0 | 말로 지킨다 | **CSP 헤더로 강제한다** — `default-src 'self'`. 인라인 테마 스크립트는 해시로 허용하고, 그 해시가 맞는지 테스트가 본다 |

## 단계

- [x] **①** 제품의 사내 예시를 일반 예시로 — `console/Repos.jsx` `예: gdi` · `console/WorkRepos.jsx` `C:\gdi` · 패키지 `dpms/관리번호.md` 의 고객 접두 파일명
- [x] **②** `site/` 뼈대 — vite 설정(`site/vite.config.js` → `ops/out/site`) · base 를 아는 라우터 · 상단 바 · 바닥글 · 테마 · npm `dev:site` · `build:site`
- [x] **③** `prerender.mjs` — 주소별 사본 · `404.html` · 메타 · `robots.txt` · `sitemap.xml` · SVG 복사 · `releases.json`
- [x] **④** 데모 레포 — `site/demo/run.mjs stage`(내용은 `content.mjs`): `ctx repo new --package dpms` 로 둘을 세우고, 예시를 걷고, 초기 설계 문서를 한 커밋으로 넣고, 작업은 **`save` 로** 넣는다 · 명부 `lead`/`dev.a`/`dev.b`
- [x] **⑤** 녹화 — `site/demo/record.mjs`: 시나리오 다섯의 진짜 MCP 요청 · 응답을 `site/src/data/examples/*.json` 으로
- [x] **⑥** 캡처 — `site/demo/capture.mjs`: `playwright-core` + Edge · 14장 × 라이트 · 다크 · 찍기 전 DOM 누출 검사
- [x] **⑦** 페이지 일곱 본문 · 화면 갤러리(확대 · `?shot=`) · 예제 재생기
- [x] **⑧** `check-leaks.mjs` · `test/site.test.mjs`
- [x] **⑨** CI(`build:site` + 검사) · 릴리스(`cdp-site-v<판>.zip`) · `vercel.json`
- [x] **⑩** 브라우저 실측 — 일곱 주소 · 직접 진입 · 뒤로가기 · 900 · 390px · 다크 · 키보드 · 콘솔 오류 0 · 외부 요청 0

## 나온 것

| # | 무엇을 | 왜 그렇게 |
|---|---|---|
| ① | 제품 예시 — 새 레포 `예: gdi` → `예: alpha` · 작업 레포 `C:\gdi` → `C:\work\alpha` · 패키지 셋의 `관리번호.md` 고객 접두 파일명 → `<사업>_…` · 마법사 이름 칸 `kjsa` → `lead` · 소개 좌표 `table:rp_plnd_mst` → `테이블정의서:bk_loan_mst` · 구조 그림 둘의 `C:\gdi` · `C:\project\CDP` | 캡처 전 DOM 검사 · 산출물 검사가 **실제로 잡았다**(검토가 「공개 가능」 이라 적은 SVG 두 장도). 사이트만 고치면 서버 소개 얼굴에는 남는다 — 제품 쪽에서 고쳤다 |
| ① | 「MCP 가 도는 길」 — `ex` · `host` 를 받는다. **기본값을 데모 레포 값으로** 바꿨다(`화면설계서:LN030` · 연체 현황) | 기본값이 실물 fixture(`screen:PSC043` · 면접심사)라 모든 서버의 소개에 실렸다. 사이트는 `host="<서버>:7374"` 만 넘긴다 |
| ① | 배포물 전체의 사내 예시(스킬 · 설명서 · 도움말)는 **칩으로 떼었다** — 다른 세션이 aa1e301 · 2e910ee · c610971 로 걷었다 | 이 작업의 범위(사이트에 보이는 것)보다 넓다 |
| ② | `site/` 최상위 · `site/vite.config.js` → `ops/out/site` · 라우터는 base 를 아는 40줄(제품 라우터는 절대경로 전제) · 제품의 `tokens.css` · `site.css` · `Icon.jsx` · `McpFlow.jsx` 를 import | S2 그대로. 사본을 두지 않는다 |
| ③ | `prerender.mjs` — 주소별 사본 7 · `404.html` · `robots.txt` · 절대 주소가 있을 때만 `sitemap.xml` · og · canonical. 절대 주소는 `CDP_SITE_URL` → Vercel 의 `VERCEL_PROJECT_PRODUCTION_URL` | 상대 주소 sitemap 은 무효다. 도메인을 정하지 않아도 Vercel 에서는 제 주소가 박힌다 |
| ④ | 데모 — `ctx repo new --package dpms` 둘(`library` · `library-ops`) → **첫날 한 커밋**(패키지 예시 27 섹션 · 예시 어휘를 걷고 초안 섹션 · 어휘를 넣는다 — 사람이 첫날 하는 일) → 작업 기록 11 + 2 는 **전부 `save`**. 좌표 타입은 검토의 `table:` 식이 아니라 **패키지의 한글 타입**(`테이블정의서:` …) | 제품의 길 그대로라 화면의 applied · 변경 줄 · 커밋 이력 · 감사가 진짜다. 레포에 원격은 붙이지 않았다 — 로컬 bare 레포면 기계 경로가 화면에 찍히고, 가짜 URL 이면 미러가 실패로 보인다(미러 「원격 없음」) |
| ④ | 서버는 **빌드된 번들**(`ops/out/ctx/ctx.mjs`)로 띄운다 — run.mjs 가 먼저 build-ctx | 소스로 띄우면 화면에 「빌드 __CTX_BUILT__」 자리표시가 그대로 찍혔다 |
| ④ | 데모 서버의 `/manual` 은 `site/demo/manual/` 의 **줄인 판** 세 권 | 실물 설명서는 사내 주소가 박혀 있다(S5) |
| ⑤ | 녹화 다섯 — `site/src/data/examples/*.json`. 걸음마다 `note`(해설 · 사람이 쓴 말)와 `req` · `res`(녹화)를 나눠 싣고, 끝을 대조한다(③ E_CHECK · 로컬 exit 1 · ④ E_CONFLICT) | 손으로 쓴 출력은 판이 오르면 거짓말이 된다. 모델의 대답은 지어내지 않는다 |
| ⑤ | ③ 의 로컬형 걸음은 clone 에 같은 기록을 두고 `ctx check` — stdout 만 받으면 경고 한 줄뿐이라 stderr 까지 · 먼저 `ctx index` | 오류는 stderr 로 간다(실측) |
| ⑥ | 캡처 14 × 2 — `playwright-core` + 이 PC 의 Chrome(Edge 채널은 못 찾았다 · 두 번째 후보로 됐다) · 1440×900 · DPR 1.5 · `reducedMotion: reduce` | DPR 2 에서 줄이려면 이미지 라이브러리가 든다. 1.5 가 한 장 150~500KB |
| ⑥ | 06(검증) — 로컬형에서 훅 없이 들어온 기록을 git 으로 넣고 **새로 띄운 서버**로 찍는다 | 서버형 화면 Store 는 감시가 없고 `save` 만 다시 읽게 한다 — 밖에서 들어온 커밋은 재시작 전까지 안 보인다(제품 동작 · 실측) |
| ⑥ | 03(작업 기록) — 처음엔 정정 기록의 `supersedes` 가 화면 어디에도 안 보였다 | 칩으로 떼어 v0.19.2(382ac20)에 양방향으로 들어갔고, 그 뒤 정정 기록으로 다시 찍었다 |
| ⑦ | 캡션은 **찍힌 것에 맞췄다** — viewer 에게도 관리 탭은 보인다(빠지는 것은 콘솔 길 · 권한 칩 「읽기」) · 그래프는 좌표끼리의 이음 · 검색은 「대조」 → 관리문서 · 작업문서 · 좌표 | 검토 때의 기대와 화면이 달랐다 |
| ⑧ | `check-leaks.mjs` + `leaks.mjs`(패턴) + `leak-names.txt`(실명 · 산출물에 안 들어간다). `dpms` 는 허용(제품과 함께 나가는 서식 이름) · `dpms_wiki` 는 막는다 | 캡처와 산출물이 같은 규칙을 쓴다 |
| ⑧ | `test/site.test.mjs` 8 — 주소 · 그림 28장 · 녹화 끝 · 도구 13/스킬 7 이름 대조 · CSP 해시 · 누출 규칙 · 소스 누출 · 판 이력 | S13. 녹화 판이 package.json 과 다르면 실패가 아니라 diagnostic |
| ⑨ | `vercel.json` — `npm ci` · `npm run build:site` · `ops/out/site` · CSP(`default-src 'self'` · 인라인 테마 스크립트는 해시) · nosniff · no-referrer · DENY · `/assets` 1년 캐시. CI 에 `build:site` · 릴리스에 `cdp-site-v<판>.zip` | S1 의 「외부 요청 0」 을 헤더로 강제한다. 스타일은 `'unsafe-inline'` — React 의 style 속성 |
| ⑩ | `site/tools/serve-static.mjs`(`npm run preview:site`) — Vercel 처럼 폴더 → index.html · 없으면 404.html · vercel.json 헤더 | `vite preview` 는 모든 주소에 루트 index.html 을 내서 사본 · 404 · CSP 를 못 본다 |
| ⑩ | 실측 — 주소 7 + 없는 주소 × 1440/900/390 × 라이트/다크: 가로 스크롤 0 · 콘솔 오류 0(없는 주소의 404 만) · CSP 아래서 그려진다 | headless Chrome(playwright) — 앱의 Browser 창이 숨어 있어 0×0 이었다 |

## 사람이 할 것

1. Vercel 프로젝트를 이 레포에 잇는다 — 루트 디렉터리는 레포 루트, 설정은 `vercel.json` 이 든다. 비공개 레포라 Vercel 에 GitHub 권한을 준다
2. 도메인을 정했으면 Vercel 환경변수 `CDP_SITE_URL`(예 `https://cdp.example.com`) — 없으면 Vercel 의 프로덕션 주소로 sitemap · og 가 박힌다
3. 판을 올릴 때 — `npm run site:demo`(Chrome 또는 Edge 필요 · 10분 안팎) → 바뀐 PNG 28장을 넘겨 본다 → 커밋
4. push · 태그
