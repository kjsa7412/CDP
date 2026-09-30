# site — CDP 공식 사이트

제품을 **소개만** 하는 정적 SPA 다. 로그인 · 다운로드 · 폼이 없고 서버 API 를 부르지 않는다. 사외 공개(Vercel)가 기준이다.
서버마다 있는 소개 얼굴(`viewer/src/site/Landing.jsx` · `/`)과는 다른 물건이다 — 그것은 그 서버의 앞문이다.

검토 [`../docs/design/CDP_공식사이트_제작검토_v0.1.md`](../docs/design/CDP_공식사이트_제작검토_v0.1.md) · 실행 기록 [`../docs/dev/공식사이트_TODO.md`](../docs/dev/공식사이트_TODO.md)

```
src/            페이지 일곱 · 라우터(base 를 안다) · 재생기 · 스크린숏
  data/         screens.js(14장 설명) · examples/*.json(녹화 — 손으로 고치지 않는다) · facts.js(도구 13 · 스킬 7)
public/shots/   실사용 화면 14장 × 라이트 · 다크 (site:demo 가 찍는다 · 커밋한다)
demo/           데모 레포 내용(content.mjs) · 세우기 · 녹화 · 캡처(run.mjs) · 줄인 설명서
tools/          prerender · 누출 검사(leaks.mjs · leak-names.txt) · 판 이력 · Vercel 흉내 미리보기
```

| | |
|---|---|
| `npm run dev:site` | 개발 — http://localhost:5174 |
| `npm run build:site` | `ops/out/site/` — vite → 주소별 사본 · 404 · robots · sitemap → **누출 검사**(걸리면 실패) |
| `npm run preview:site` | 산출물을 Vercel 처럼 낸다(폴더 → index.html · 404.html · `vercel.json` 헤더) — http://127.0.0.1:5176 |
| `npm run site:demo` | 데모 서버를 세우고 예제 다섯을 녹화하고 화면 28장을 찍는다. Chrome 또는 Edge 가 있어야 한다. **판을 올릴 때 사람이 돌리고 PNG 를 넘겨 본 뒤 커밋한다** |

**화면은 진짜이고 내용은 가상이다.** 데모 레포(「도서관 대출 관리 시스템 개편」 · 사람 `lead` · `dev.a` · `dev.b`)는
`ctx repo new --package dpms` 로 세우고 작업 기록은 전부 `save` 로 넣는다. 실물 fixture(`viewer/fixture`)와 기존 검토 그림은
사내 흔적이 있어 쓰지 않는다. 새 이름 · 주소가 보이면 `tools/leak-names.txt` · `tools/leaks.mjs` 에 더한다.

Vercel — 설정은 레포 루트 [`../vercel.json`](../vercel.json). 도메인은 환경변수 `CDP_SITE_URL`(없으면 Vercel 프로덕션 주소).
CSP 가 인라인 테마 스크립트를 해시로 허용한다 — `index.html` 의 그 스크립트를 고치면 `test/site.test.mjs` 가 새 해시를 알려 준다.
