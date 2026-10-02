# 실서버 종합 시험 TODO — 작업 레포 · 로그 · 시계 · 콘솔 결함과 화면 줄바꿈을 고친다

> 운영자 지시(2026-10-02) — 「권장 순서대로 TODO 쓰고 진행해라」. **권장안으로 진행.**
> 짝 문서 — [`../design/CDP_실서버_종합시험_v0.1.md`](../design/CDP_실서버_종합시험_v0.1.md) (시나리오 A~Z · F1~F23 · L1~L11 · W1~W8 · §7 권장 순서).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림(v0.23.0 후보) · 실서버 upgrade · 운영 데이터(gdi 테이블정의서 · 시계 · 시험 흔적)는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 | **완료** — ec0ac3d |
| ① F1 · F2 — 작업 레포를 레포로 · 설치 꾸러미 막기 · 로그의 저장 레포 | 진행 |
| ② F4 — 서버 시각 기준 상대 시각 · 시계 어긋남 경고 | |
| ③ F3 · F5 · F6 · F7 · F8 — 발급 창 · 작업 레포 지우기 · 감사 행위자 · 서버형 훅 경고 · 검사 문구 | |
| ④ L1 · L2 · L3 — keep-all · `.field` · 고정폭 한글 | |
| ⑤ 나머지 F · L · W | |
| ⑥ 시험 · 빌드 · 실측 · 설명서 | |

---

## 0. 전제 — 정한 것(권장안)

- [x] **P1 작업 레포 목록은 화면이 거른다** — `GET /workrepos` 는 이미 권한으로 거른다. 레포 화면은 `knowledge === currentRepo()` 만 그린다(관리 › 현황 카드와 같은 거름). 서버 질의 인자는 더하지 않는다
- [x] **P2 설치 명령 · 꾸러미는 행의 레포로** — `row.knowledge`. 서버 `/kit/<레포>?workrepo=<id>` 는 등록의 레포가 주소와 다르면 **409** 로 막는다(이미 잘못 깔린 PC 의 `--update` 가 여기서 드러난다). 설치기는 409 의 문장을 그대로 보인다
- [x] **P3 로그의 레포 칸 = 실제로 쓴 레포** — 주소 레포와 다르면 `dpms_wiki←gdi`. 콘솔 최근 기록은 둘을 같이 보이고, 그런 save 가 있으면 현황에 경고 한 줄
- [x] **P4 시계는 화면이 맞춘다** — 응답 `Date` 로 서버와의 차를 재고 「N분 전」 은 서버 시각 기준. 차가 5분을 넘으면 콘솔 현황에 경고. 서버 · PC 의 NTP 는 사람이
- [x] **P5 작업 레포 등록은 지울 수 있다** — 레포 화면은 writer(그 레포를 볼 수 있는 사람), 지식 레포가 없어진 등록(고아)은 콘솔에서 admin. 서버 `DELETE` 는 그 레포 권한을 본다
- [x] **P6 감사의 행위자는 읽는 쪽이 고친다** — `workrepo add · <사람> · …` 줄은 웹에서만 생긴다(셸 명령이 없다). 쓰는 모양은 그대로 두고 `parseAudit` 가 둘째 칸을 행위자로 읽는다 — 옛 줄도 같이 바로 보인다
- [x] **P7 서버형은 훅 경고를 내지 않는다** — save 가 같은 계산으로 막는다. 검사 화면 머리 문구도 서버형 말로
- [x] **P8 CSS 는 원인에서 고친다** — `body` 에 `keep-all` · `app.css` 의 죽은 `.field` 규칙 삭제 · `site.css` `.field input` 은 체크박스 · 라디오를 뺀다 · `--font-mono` 에 한글 폴백
- [x] **P9 단축키 표기는 한 함수** — `kbd('⌘K')` 가 Mac 이 아니면 `Ctrl+K`. 표 · 팔레트 · 상단 · 도움말이 그것을 쓴다
- [x] **P10 판 올림 · push 는 하지 않는다**

---

## ① F1 · F2 — 작업 레포 · 설치 꾸러미 · 로그

- [ ] `viewer/src/components/admin/WorkReposServer.jsx`
  - [ ] 목록 · 「낡음」 일괄 카드 — `data.repos.filter((r) => r.knowledge === currentRepo())`
  - [ ] `HowTo` — `installCommand(shell, { repo: row.knowledge, … })` · zip 링크 `api.kitUrl(row.id, row.knowledge)`
- [ ] `viewer/src/lib/api.js` — `kitUrl(id, repo = currentRepo())`
- [ ] `viewer/bin/ctx-mcp-serve.mjs` `/kit` — `row.knowledge !== name` 이면 409 `E_INPUT` 「그 등록(<id> · <이름>)은 <knowledge> 의 것이다 — <knowledge> 의 관리 › 작업 레포에서 설치 한 줄을 다시 받는다」
- [ ] `viewer/bin/cdp-install.mjs` `fetchKit` — 404 밖의 실패도 서버 문장(`error.message`)을 보인다
- [ ] `ctx-mcp-serve.mjs` MCP — `saver` 가 `ctxStore.outcome.repo = name` · 로그 `repo` = 실제 레포, 주소와 다르면 `실제←주소`
- [ ] `saveStats` — `repo` 칸에서 `via`(주소 레포)를 가른다 · `mismatch7d` 를 센다
- [ ] `/admin/overview` alerts — `mismatch7d` 가 있으면 warn 「주소와 다른 레포에 쓴 save N건 — 그 작업 레포의 `.mcp.json` 과 `.claude/cdp.json` 이 갈렸다 · 그 레포의 설치 한 줄을 다시」
- [ ] `viewer/src/console/Overview.jsx` 최근 기록 — `via` 가 있으면 「주소 gdi」 칩(warn)

## ② F4 — 시계

- [ ] `viewer/src/lib/clock.js` — `noteServerDate(header)` · `serverNow()` · `clockSkew()`
- [ ] `api.js` `req()` — 응답마다 `noteServerDate(res.headers.get('date'))`
- [ ] `components/admin/ui.jsx` `when()` — 기본 `now = serverNow()`
- [ ] `console/Overview.jsx` — `|skew| ≥ 5분` 이면 경고 줄 「이 PC 시계가 서버보다 N분 빠르다/늦다 — 시각은 서버 기준으로 보인다. 서버 `timedatectl` · PC `w32tm /resync`」

## ③ F3 · F5 · F6 · F7 · F8

- [ ] F3 `console/Tokens.jsx` — `?user=` 로 연 뒤 `navigate('/console/tokens', { replace: true })`
- [ ] F5 `core/workrepos.js` `list(db, { kits, known })` — `known` 에 없는 지식 레포면 `orphan: true`
- [ ] F5 서버 `DELETE /workrepos/<id>` — 행이 없으면 404 · 지식 레포가 있으면 그 레포 권한(없으면 404) · 고아면 admin 만
- [ ] F5 서버 `/admin/workrepos` · `/workrepos` — `known` 을 넘겨 `orphan` 을 싣는다
- [ ] F5 레포 화면 행에 [삭제](writer · 확인 창) · 콘솔 작업 레포에 「지식 레포 없음」 칩 + [삭제] · 레포 휴지통 응답 문장에 「콘솔 › 작업 레포에서 지운다」
- [ ] F6 `console/ui.jsx` `parseAudit` — 접두 없는 `workrepo (add|del) · <사람> · …` 은 행위자 = 그 사람
- [ ] F7 `core/store.js` — `settings.server` 면 `check()` 에 `gitStatus: null` · 서버가 `server: true` 로 만든다 · `CheckView` 머리 문구를 서버형 말로
- [ ] F8 `App.jsx` 검증 단추 제목 — 서버형 「이 레포에 검사 오류가 있다 — 고칠 때까지 이 레포의 save 가 전부 거절된다」 · 검토 문서 F8 의 「save 는 통과」 를 바로잡는다(F2 때문에 그렇게 보였다)

## ④ L1 · L2 · L3 — CSS 원인 셋

- [ ] `styles/tokens.css` `body` — `word-break: keep-all; overflow-wrap: break-word`
- [ ] `styles/app.css` — 쓰는 곳 없는 `.field` · `.field--stack` · `.field > span:first-child` 삭제
- [ ] `styles/site.css` — `.field input:not([type='checkbox']):not([type='radio'])` · `.field` 는 `align-items: stretch` 를 명시
- [ ] `--font-mono` — `… 'Nanum Gothic Coding', 'Malgun Gothic', 'Apple SD Gothic Neo', monospace`
- [ ] `.docpick__list label` — 번호 칸 고정폭 · 제목이 남은 폭

## ⑤ 나머지

| | 무엇 | 어디 |
|---|---|---|
| F9 | 지우기 · 삭제 뒤 캐시 무효화(관리 문서 · 검사 · 콘솔 레포) | `admin/Docs.jsx` · `console/Repos.jsx` |
| F10 | 이름 · origin 형식 문장 · 작업 레포 등록 `<form>` | `console/Repos.jsx` · `WorkReposServer.jsx` |
| F11 | 900px 아래 덮는 목록 — 문서를 고르면 접고, 바깥 클릭 · Esc 로도 | `App.jsx` |
| F12 | 만료 창 — 기본 · 문구를 토큰 주인의 역할로 · 재발급 확인 문장에 새 만료 | `Tokens.jsx` |
| F13 | 발급 창 기본 사용자 「— 고른다 —」 · 만료 단추 순서 고정 | `Tokens.jsx` |
| F14 | 토스트를 모달 위로 | CSS |
| F15 | dryRun 은 등록부 로그 줄에 「(미리보기)」 | `core/save.js` |
| F16 | 그래프 회전 기본 끔 · 카테고리 이름 폭 | `CoordGraph.jsx` · CSS |
| F17 | `kbd()` | `lib/keys.js` · `App.jsx` · `Palette.jsx` · `DocView.jsx` |
| F18 | 「문서 N」 → 「작업 N」 | 상태바 · 관리 현황 · 레포 홈 |
| F19 | PAT 저장 자리 host 디코드 | `GitAuth.jsx` |
| F20 | [접근] → 그 레포 열 강조 | `Repos.jsx` · `Users.jsx` |
| F21 | 체크박스 · 단추 접근성 이름 | `Users.jsx` · `Repos.jsx` · `App.jsx` |
| F22 | 담당자 후보 = 그 레포를 볼 수 있는 사람 | 서버 `/workrepos` `users` |
| F23 | 진단 「읽는 중…」 과 「아직 안 함」 | `console/Server.jsx` |
| L4 | 명령 · 경로 블록 `keep-all` + `anywhere` | `admin.css` |
| L5 | 날짜 · id · 유형 · 상태 칸 `nowrap` | `console.css` · `admin.css` |
| L6 | 판 · 패키지 둘째 줄의 「·」 | `console/Overview.jsx` · `Server.jsx` |
| L7 | 목차 · 검사 문장 · 설명의 인라인 마크다운 벗기기 | `SectionRail` · `Manual` · `CheckView` · 레포 설명 |
| L9 | 레포 홈 최근 기록 왼쪽 정렬 | CSS |
| L10 | 설명서 휴대폰 목차 접기 | `site/Manual.jsx` · CSS |
| L11 | 모달 바닥줄 고정 | CSS |
| W1~W8 | 문구 | 각 자리 |

## ⑥ 시험 · 빌드 · 실측

- [ ] `node --test test/` — 새 시험: 작업 레포 고아 · 감사 읽기 · `kbd` · 서버형 검사
- [ ] `npm run build` → 개발용 서버(7387)에서 375 · 859 · 1440 실측
- [ ] 하네스 `node ops/verify/run.mjs`
- [ ] 설명서 — 관리자(작업 레포 지우기 · 시계) · 사용자(단축키 표기)

---

## 나온 것

| | 무엇을 왜 그렇게 정했나 |
|---|---|
