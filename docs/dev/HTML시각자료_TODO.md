# HTML 시각 자료 TODO

> 검토 — [`docs/design/CDP_HTML시각자료_검토_v0.1.md`](../design/CDP_HTML시각자료_검토_v0.1.md).
> 운영자 지시(2026-10-06): 권장안대로 TODO 를 쓰고 구현까지 한다. 묻지 않고 권장안으로 정하며, 정한 것은 「나온 것」 에 적는다.

| | 무엇 | 상태 |
|---|---|---|
| ① | 파일 API 의 HTML 격리 — H0 를 닫는다(S1 · S2) | **완료** |
| ② | 첨부로 받기 — 올리기 · save(S4 · W1 · W3) | **완료** |
| ③ | 문서별 자료 목록 · 제목(V1 · V2) | **완료** |
| ④ | 화면 — 탭 줄 · 자료 틀 · 링크 · 주소 · 테마 · 트리 표시(V2~V7 · S3) | 할 일 |
| ⑤ | 스킬 · MCP 명함 · 설명서(W4) | 할 일 |
| ⑥ | 시험 · 실측 · 판 | 할 일 |

---

## ① 파일 API 의 HTML 격리

**바뀌는 파일** — `viewer/server/adapter/read-api.js`(새 `htmlCsp` 는 `core/assets.js` 에 둔다. 화면 · 서버 · 시험이 같은 글을 쓴다).

- [x] `.html` · `.htm` 응답에 `content-security-policy: sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline' <CDN>; style-src 'unsafe-inline' https://fonts.googleapis.com <CDN>; font-src data: https://fonts.gstatic.com <CDN>; img-src data: blob:; connect-src 'none'; frame-ancestors 'self'`
- [x] MIME 에 `.htm`
- [x] **이 항목만 따로 먼저 커밋한다** — 이 기능과 상관없이 막아야 하는 구멍이다

## ② 첨부로 받기

**바뀌는 파일** — `core/assets.js` · `core/save.js`.

- [x] KINDS 에 `text/html`(`.html` · `.htm`). 가리기: BOM · 공백 · `<!-- -->` 주석 뒤 첫 태그가 `<!doctype html` 또는 `<html`(대소문자 무시). UTF-8 로 풀려야 한다(`TextDecoder fatal`)
- [x] 그 밖의 규칙(10 MB · staging · save 한 커밋 · `work/assets/<id>/`)은 그대로
- [x] save 경고(W3) — ① HTML 첨부를 들인 기록의 본문이 짧다(링크 · 제목 · 공백을 뺀 글이 120자 아래) → 「요지를 본문에」 ② HTML 이 S2 밖의 외부 자원을 부른다(`src=` · `href=` · `url(` · `@import` 의 `http(s)://` · `//` 중 허용 호스트가 아닌 것) ③ CDN 을 부른다 → 「폐쇄망에서 빌 수 있다」
- [x] 「올린 첨부를 아무도 안 가리킨다」 경고의 예시 — HTML 이면 `![…]` 가 아니라 `[…](…)`

## ③ 문서별 자료 목록 · 제목

**바뀌는 파일** — 새 `core/visuals.js`(모으기 · 제목 · 외부 자원 — 순수 함수) · `core/store.js`(로드 때 모으고 문서 응답 · 목록에 싣는다).

- [x] `visualRefs(docPath, body, attachments)` → 레포 안 `.html` · `.htm` 경로 목록(순서 유지 · 중복 제거). 프론트매터 `attachments` 먼저, 다음 본문 링크. 코드 블록 안은 뺀다(`mdRefs`)
- [x] 문서 응답에 `visuals: [{ path, title }]` — 파일이 있는 것만. `title` 은 `<title>`(앞 64 KB 에서 · 엔티티 몇 개 풀기), 없으면 파일 이름에서 확장자를 뺀 것
- [x] 문서 목록(트리)에 `hasVisual: true` — 트리 표시(V7)용. 본문을 다시 읽지 않게 스캔 때 계산한다

## ④ 화면

**바뀌는 파일** — `viewer/src/components/DocView.jsx` · 새 `viewer/src/components/VisualFrame.jsx` · `viewer/src/App.jsx` · `viewer/src/lib/doclink.js` · 트리 컴포넌트 · `styles/app.css`.

- [ ] 탭 줄(V2) — `doc.visuals.length > 0` 일 때만. 「본문」 + 자료마다 하나(`title`). 고른 탭은 `?v=<경로>`(V4) — 「‹ 이전」 · 뒤로 가기 · 열린 문서 탭이 함께 기억한다
- [ ] 자료 틀(V3 · S3) — 본문 자리를 꽉 채우는 `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer">`. 위에 얇은 줄: 새 탭에서 ↗ · 내려받기 · 경로
- [ ] 테마(V6) — 틀 요소 `style.colorScheme` 을 앱 테마(밝게 · 어둡게)로. **실측으로 틀 안 `prefers-color-scheme` 이 따라오는지 본다**
- [ ] 본문의 `.html` 링크(V5) — 새 탭 대신 그 자료 탭으로. 링크 뒤에 작은 「자료」 표시. 첨부 목록의 HTML 행에 「보기」
- [ ] 트리 문서 행에 자료 표시(V7)
- [ ] 좁은 창(375)에서도 탭 줄이 가로로 넘치지 않는다(가로 스크롤)

## ⑤ 스킬 · 명함 · 설명서

- [ ] `agent/skills/cdp-save/SKILL.md` 「그림 · 첨부」 — HTML 을 받는 종류에 더하고, **요지를 본문에 md 로** 적는 규칙과 링크 모양(`[제목](assets/<id>/x.html)`)을 넣는다
- [ ] `cdp-import` — 작업 레포의 `*.html` 시각 자료를 들이는 한 줄
- [ ] MCP `save` 명함의 `assets` 줄 — 종류 목록
- [ ] 사용자 설명서 — 「시각 자료(HTML)」 짧은 절

## ⑥ 시험 · 실측 · 판

- [ ] 단위 — sniff html(문서 · 주석 앞 · BOM · 아닌 것) · save html 한 커밋 · W3 경고 셋 · `visualRefs` · `htmlTitle` · `/file` CSP 헤더
- [ ] 단위 전체(`node --test test/*.test.mjs`) · 빌드
- [ ] 실측(로컬 뷰어) — `SCADA_연계_구성도.html` 을 fixture 레포에 기록으로 들여 탭 · 틀 · 어둡게 · 새 탭 열기(CSP) · 뒤로 가기 · 375 폭
- [ ] 판 v0.25.0 · CHANGELOG

---

## 나온 것

| | 무엇 | 어디 |
|---|---|---|
