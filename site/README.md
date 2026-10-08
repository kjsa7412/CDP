# site — CDP 공식 사이트

제품을 **소개만** 하는 정적 SPA 다. 로그인 · 다운로드 · 폼이 없고 서버 API 를 부르지 않는다. 사외 공개(Vercel)가 기준이다.
서버마다 있는 소개 얼굴(`viewer/src/site/Landing.jsx` · `/`)과는 다른 물건이다 — 그것은 그 서버의 앞문이다.

검토 [`../docs/design/CDP_공식사이트_제작검토_v0.1.md`](../docs/design/CDP_공식사이트_제작검토_v0.1.md) · 실행 기록 [`../docs/dev/공식사이트_TODO.md`](../docs/dev/공식사이트_TODO.md)

```
src/            페이지 일곱 · 라우터(base 를 안다) · 재생기 · 스크린숏
  data/         screens.js(17장 설명) · examples/*.json(녹화 — 손으로 고치지 않는다) · facts.js(도구 12 · 스킬 5)
public/shots/   실사용 화면 17장 × 라이트 · 다크 (site:demo 가 찍는다 · 커밋한다)
demo/           데모 레포 줄거리(content.mjs) · 세우기 · 녹화(record.mjs) · 캡처(capture.mjs) · 한 줄(run.mjs) · 줄인 설명서 넷
tools/          prerender · 누출 검사(leaks.mjs · leak-names.txt) · 판 이력 · Vercel 흉내 미리보기
```

| | |
|---|---|
| `npm run dev:site` | 개발 — http://localhost:5174 |
| `npm run build:site` | `ops/out/site/` — vite → 주소별 사본 · 404 · robots · sitemap → **누출 검사**(걸리면 실패) |
| `npm run preview:site` | 산출물을 Vercel 처럼 낸다(폴더 → index.html · 404.html · `vercel.json` 헤더) — http://127.0.0.1:5176 |
| `npm run site:demo` | 데모 서버를 세우고 예제 다섯을 녹화하고 화면 34장(17 × 라이트 · 다크)을 찍는다. Chrome 또는 Edge 가 있어야 한다. **판을 올린 뒤에 사람이 돌리고 PNG 를 넘겨 본 뒤 커밋한다** — 녹화 · 그림에 package.json 의 판이 찍힌다 |

**화면은 진짜이고 내용은 가상이다.** 데모 레포 둘(「도서관 대출 관리 시스템 개편」 `library` · 운영 `library-ops`)은 v1.0 흐름 그대로 선다 —
`ctx repo new`(빈 틀) → 첫날 큐레이터의 save 한 번(서식집에서 관리 문서 · 등록부 행 · 어휘 · 대상 초안) → writer 의 작업 기록 save →
큐레이터의 큐레이션 save(반영 · 새 문서 · 기록으로 둠). 대기 몇 건은 일부러 남겨 대기열 · 미반영 · 이력이 화면에 보이게 한다.
사람은 넷 — `lead`(admin) · `doc.c`(library 의 큐레이터) · `dev.a`(writer · library-ops 의 큐레이터) · `dev.b`(viewer). 줄거리와 날짜는
`demo/content.mjs` 한 곳이다(남긴 대기가 14일을 넘으면 화면이 앰버가 된다 — 한참 뒤에 다시 찍으면 날짜를 같이 민다).
실물 fixture(`viewer/fixture`)와 기존 검토 그림은 사내 흔적이 있어 쓰지 않는다. 새 이름 · 주소가 보이면 `tools/leak-names.txt` · `tools/leaks.mjs` 에 더한다.

Vercel — 설정은 레포 루트 [`../vercel.json`](../vercel.json). 도메인은 환경변수 `CDP_SITE_URL`(없으면 Vercel 프로덕션 주소).
**사이트에 닿는 파일이 바뀐 push 만 빌드한다** — `ignoreCommand` 가 [`tools/vercel-ignore.mjs`](tools/vercel-ignore.mjs) 를 부르고, 마지막 배포 커밋(`VERCEL_GIT_PREVIOUS_SHA`) 이후 `WATCH`(site/ · vercel.json · package.json · lock · .nvmrc · CHANGELOG.md · docs/그림/ · 제품의 tokens.css · site.css · Icon.jsx · McpFlow.jsx)가 안 바뀌었으면 건너뛴다. 모르면(첫 배포 · 기준 커밋 없음 · git 실패) 빌드한다. 억지로 빌드하려면 환경변수 `CDP_SITE_FORCE=1`. 사이트가 `site/` 밖의 파일을 새로 import 하면 `WATCH` 에 더한다 — 빠지면 `test/site.test.mjs` 가 잡는다.
CSP 가 인라인 테마 스크립트를 해시로 허용한다 — `index.html` 의 그 스크립트를 고치면 `test/site.test.mjs` 가 새 해시를 알려 준다.
