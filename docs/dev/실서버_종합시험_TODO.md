# 실서버 종합 시험 TODO — 작업 레포 · 로그 · 시계 · 콘솔 결함과 화면 줄바꿈을 고친다

> 운영자 지시(2026-10-02) — 「권장 순서대로 TODO 쓰고 진행해라」 · 「묻지 말고 개선까지 끝까지 진행해라」. **권장안으로 진행.**
> 짝 문서 — [`../design/CDP_실서버_종합시험_v0.1.md`](../design/CDP_실서버_종합시험_v0.1.md) (시나리오 A~Z · F1~F23 · L1~L11 · W1~W8 · §7 권장 순서).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림 · 실서버 upgrade · 운영 데이터(gdi 테이블정의서 · 시계 · 시험 흔적)는 사람이.
> ①~④ 는 다른 세션의 판 올림(5ab01fe · **v0.23.0**)에 실려 나갔다. ⑤ 는 그 뒤 커밋이라 **다음 판 후보**다.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 | **완료** — ec0ac3d |
| ① F1 · F2 — 작업 레포를 레포로 · 설치 꾸러미 막기 · 로그의 저장 레포 | **완료** — 36441c6 (v0.23.0) |
| ② F4 — 서버 시각 기준 상대 시각 · 시계 어긋남 경고 | **완료** — 36441c6 (v0.23.0) |
| ③ F3 · F5 · F6 · F7 · F8 — 발급 창 · 작업 레포 지우기 · 감사 행위자 · 서버형 훅 경고 · 검사 문구 | **완료** — 4c73edd (v0.23.0) |
| ④ L1 · L2 · L3 — keep-all · `.field` · 고정폭 한글 | **완료** — aee3e83 (v0.23.0) |
| ⑤ 나머지 F · L · W | **완료** — 144bde1 · 890ac19 · 52367a9 · 이 문서의 커밋 (다음 판 후보) |
| ⑥ 시험 · 빌드 · 실측 · 설명서 | **완료** — 아래 「나온 것」 |

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

- [x] `viewer/src/components/admin/WorkReposServer.jsx`
  - [x] 목록 · 「낡음」 일괄 카드 — `data.repos.filter((r) => r.knowledge === currentRepo())`
  - [x] `HowTo` — `installCommand(shell, { repo: row.knowledge, … })` · zip 링크 `api.kitUrl(row.id, row.knowledge)`
- [x] `viewer/src/lib/api.js` — `kitUrl(id, repo = currentRepo())`
- [x] `viewer/bin/ctx-mcp-serve.mjs` `/kit` — `row.knowledge !== name` 이면 409 `E_INPUT` 「그 등록(<id> · <이름>)은 <knowledge> 의 것이다 — …」
- [x] `viewer/bin/cdp-install.mjs` `fetchKit` — 404 밖의 실패도 서버 문장(`error.message`)을 보인다
- [x] `ctx-mcp-serve.mjs` MCP — `saver` 가 `ctxStore.outcome.repo = name` · 로그 `repo` = `logRepo(주소, 실제)`
- [x] `saveStats` — `parseSaveLine` 이 `repo` 칸에서 `via` 를 가른다 · `mismatch7d`
- [x] `/admin/overview` alerts — 「주소와 다른 레포에 쓴 save N」(to: workrepos)
- [x] `viewer/src/console/Overview.jsx` 최근 기록 — `(주소 gdi)` 표지

## ② F4 — 시계

- [x] `viewer/src/lib/clock.js` — `noteServerDate` · `serverNow` · `clockSkew` · `skewText`
- [x] `api.js` `req()` — 응답마다 `noteServerDate(res.headers.get('date'))`
- [x] `components/admin/ui.jsx` `when()` — 기본 `now = serverNow()`
- [x] `console/Overview.jsx` — `|skew| ≥ 5분` 이면 경고 줄

## ③ F3 · F5 · F6 · F7 · F8

- [x] F3 `console/Tokens.jsx` — `?user=` 로 연 뒤 `navigate('/console/tokens', { replace: true })`
- [x] F5 `core/workrepos.js` `list(db, { kits, known })` — `orphan`
- [x] F5 서버 `DELETE /workrepos/<id>` — 없는 행 · 권한 밖 레포는 404 · 고아는 admin 만 · 감사 줄에 `고아`
- [x] F5 서버 `/admin/workrepos` · `/admin/overview` — `known` 을 넘긴다 · 고아 경고
- [x] F5 레포 화면 행 [삭제] · 콘솔 「지식 레포 없음」 칩 + [삭제] · 레포 휴지통 문장
- [x] F6 `lib/audit.js` `parseAudit`(콘솔 `ui.jsx` 에서 옮김) — 접두 없는 `workrepo (add|del) · <사람> · …`
- [x] F7 `core/store.js` — `settings.server` 면 `gitStatus: null` · `CheckView` 머리 문구
- [x] F8 `App.jsx` 검증 단추 제목 · 검토 문서 F8 정정(F2 때문에 그렇게 보였다 — gdi save 는 전부 E_CHECK)
- [x] F9 `docs-drop` 은 재스캔을 기다리고 답한다 · 지운 뒤 `onChanged` 로 레포를 다시 읽는다
- [x] F12 · F13 `Tokens.jsx` — 만료 기본 · 문구를 주인의 역할로 · 재발급 문장에 새 만료 · 발급 기본 사용자 비움 · 단추 순서 고정

## ④ L1 · L2 · L3 — CSS 원인 셋

- [x] `styles/tokens.css` `body` — `word-break: keep-all; overflow-wrap: break-word`
- [x] `styles/app.css` — 쓰는 곳 없는 `.field` · `.field--stack` · `.field > span:first-child` 삭제
- [x] `styles/site.css` — `.field input:not([type='checkbox']):not([type='radio'])` · `.field` `align-items: stretch`
- [x] `--font-mono` — `… 'Malgun Gothic', 'Apple SD Gothic Neo', Pretendard, monospace`
- [x] `.docpick__list label` — 번호 칸 고정폭
- [x] L5 `.nowrap` · 표의 날짜 · id 칸

## ⑤ 나머지

| | 무엇 | 커밋 |
|---|---|---|
| F10 | 이름 · origin 형식 문장(`field__h--bad`) · 작업 레포 등록 `<form>`(Enter) · 이름 규칙 문장 | 890ac19 · 36441c6 |
| F11 | 900px 아래 덮는 목록 — 문서를 고르면 · 문서 쪽을 누르면 접는다(`drawerShut` · 기억하지 않음) | 144bde1 |
| F14 | 토스트 z-index 60(모달 50 위) | 890ac19 |
| F15 | dryRun 등록부 로그 줄에 「(미리보기)」 · 콘솔 로그 보기의 퍼센트 인코딩을 푼다 | 144bde1 · 이 문서의 커밋 |
| F16 | 그래프 회전 기본 끔 · 카테고리 레일 112px | 52367a9 |
| F17 | `kbd()` — 표 · 팔레트 · 상단 · 문서 단추 | 144bde1 |
| F18 | 「작업 N」 · 「작업문서 N · 관리문서 M · 좌표 K」 | 52367a9 |
| F19 | PAT 저장 자리 host 디코드 | 890ac19 |
| F20 | [접근] → `/console/users?repo=<레포>#matrix` · 그 열 강조 | 890ac19 |
| F21 | 레포 × 사용자 · 문서 고르기 체크박스 · 「관리」 · 검색 단추의 접근 이름 | 890ac19 |
| F22 | 담당자 후보 = 그 레포를 볼 수 있는 사람(`usersByRepo`) · 등록도 그 목록으로 검사 | 36441c6 |
| F23 | 진단 「읽는 중…」 과 「아직 안 함」 | 890ac19 |
| F24 | (2차 실측에서 새로) 형식에서 거절된 save 를 「기록됨」 으로 적지 않는다 — `E_SCHEMA` | aee3e83 |
| L4 | 명령 · 경로 블록 `keep-all` + `anywhere` | 36441c6 |
| L6 | 판 · 패키지 둘째 줄을 `.asub` 로 | 36441c6 · 890ac19 |
| L7 | 목차 `label`(원문 `text` 는 좌표 맞추기용으로 그대로) · 검사 문장 `plainDetail` · 레포 설명 `oneLine` | 4c73edd · 52367a9 |
| L8 | 뻗어나가기 열 — 컨테이너 쿼리로 칸에 정수 개 | 52367a9 |
| L9 | 레포 홈 최근 기록 왼쪽 정렬 | 52367a9 |
| L10 | 설명서 휴대폰 목차 접기 · 그리드 칸 `min-width: 0`(표 때문에 820px 로 넘침) | 52367a9 |
| L11 | 모달 몸통 스크롤 · 바닥줄 고정 | 52367a9 |
| W1 | 지식 레포 안내 — 상태 → 단추 표 | 890ac19 |
| W2 | 레포 설명 — 인용 · 링크 · 강조 벗기고 문장 · 낱말에서 자른다 | 52367a9 |
| W3 | 소개 「읽기 도구 13종 + save(서버형 14)」 | 52367a9 |
| W4 | 검사 줄의 id 두 번 | 4c73edd |
| W5 | 사용자 설명서 8.8 — 900px 아래 이름 · 목록 접힘 | 52367a9 |
| W6 | `josa()` — 콘솔 문구의 을/를 · 이/가 | 890ac19 |
| W7 | (고칠 것 없음) 미러 카드는 이미 admin 에게만 「콘솔 › 지식 레포」 · 그 밖은 「관리자에게」 — 시험 계정이 admin 이라 그렇게 보였다 | — |
| W8 | 토큰 [연장] → [만료] | 4c73edd |

## ⑥ 시험 · 빌드 · 실측

- [x] 새 시험 — `test/serve-log.test.mjs`(logRepo · parseSaveLine · saveStats · oneLine) · `test/screen-fixes.test.mjs`(parseAudit · plainDetail · clock · 서버형 검사 · kbd · josa) · `test/workrepos.test.mjs`(orphan)
- [x] `npm run build` → 개발용 서버(7387 · 시험 토큰은 `ops/out/dev-serve-drop/token.txt` · 무시 폴더) — API 실측 · 헤드리스 375 · 859 · 1025 · 1100 · 1280 실측(`ops/out/qa-shots/`)
- [x] 하네스 — 「나온 것」
- [x] 설명서 — 관리자 5.2(작업 레포 목록 · 삭제 · 409) · 5.2-5 도구 14 · 10.1(주소와 다른 레포 · 409 · 시계 · 검증 빨강) · 사용자 8.6(회전) · 8.8(900px)

---

## 나온 것

| | 무엇을 왜 그렇게 정했나 |
|---|---|
| F1 화면 · 서버 둘 다 | 화면만 고치면 이미 잘못 깔린 PC 의 `--update` 가 계속 엉뚱한 레포 kit 을 받는다. `/kit` 409 가 그 PC 를 드러낸다 — 실측: `/kit/beta?workrepo=<dpms 등록>` → 409 · 문장 · `/kit/dpms?…` → 200 |
| F2 화살표 표기 | 로그 칸 수를 늘리지 않고 한 칸에 `실제←주소`. 옛 줄(화살표 없음)도 그대로 읽힌다. 실측: `/mcp/beta` 로 `repo: dpms` save → `dpms←beta` · 현황 경고 「주소 beta → dpms」 |
| F24 (새로 나온 것) | 2차 실측에서 `save` 인자 형식 오류(SDK 가 HTTP 200 · isError)가 saver 를 안 거쳐 코드가 비어 「기록됨」 으로 떴다. saver 가 안 돈 save 는 `E_SCHEMA` |
| F4 화면이 맞춘다 | 서버는 PC 의 시계를 모른다. `Date` 머리는 초 단위 · 응답 지연이 있어 5분 아래는 말하지 않는다. NTP 는 운영 일 — 설명서 10.1 |
| F5 고아는 콘솔 | 레포를 지우면 그 레포의 관리 화면이 없어진다 — 지울 자리가 콘솔뿐이다. 레포 화면의 [삭제] 는 writer, 고아는 admin. 실측: 세우기 → 등록 → 휴지통 → `orphan: true` → 삭제 200 · 감사 `… · 고아` · 없는 id 404 |
| F6 읽는 쪽 | 대장 줄의 모양을 바꾸면 옛 줄과 둘이 된다. 대장은 화면에서만 바뀌므로 둘째 칸이 언제나 사람이다 |
| F8 정정 | 검토 때 「gdi save 가 통과」 로 본 것은 F2 의 거짓 레포 칸이었다. `core/save.js` 8단계는 레포 전체 오류로 거절한다 — **gdi 의 테이블정의서 중복 섹션을 합칠 때까지 gdi save 는 전부 E_CHECK.** 운영 데이터라 사람이 |
| F11 기억하지 않음 | 읽기 모드(`reading.mode`)를 바꾸면 넓은 창으로 돌아갔을 때 목록이 접혀 있다. 좁은 창 덮개만 따로(`drawerShut`) |
| F12 init | 지금 `init` 은 이미 관리자 30일이다(`ctx-serve-doctor.mjs`). 실서버의 82일 토큰은 v0.9 의 write 사용자가 나중에 admin 으로 승격된 것 — **사람이 콘솔에서 재발급**(재발급은 역할 기본 30일) |
| L1 break-word | `anywhere` 는 표 칸의 최소 폭까지 줄여 다시 음절 끊김을 만든다. `break-word` 는 넘칠 때만 — 그 대신 칸이 넓어지므로 표는 가로 스크롤(콘솔 · 문서는 이미 있다) · 설명서는 그리드 칸 `min-width: 0` 을 더했다(L10) |
| L2 지우기 | `app.css` 의 `.field` 는 쓰는 JSX 가 없었다(옛 설정 팝오버). 이름을 바꾸는 대신 지웠다 |
| L7 `label` 따로 | 목차 원문(`text`)은 `sectionSlug` 가 좌표와 맞추는 재료다 — 벗기면 맞추기가 깨진다. 보이는 글만 `label` |
| L8 컨테이너 쿼리 | 240px 고정이면 칸 폭이 240 의 배수가 아닐 때 언제나 반쯤 잘린다. 칸 폭을 정수 개로 나눈다(1 · 2 · 3 · 4) |
| F16 라벨 겹침 | 라벨 자리 피하기(오른쪽 → 왼쪽 → 위아래 8줄)는 원래 있다. 실서버에서 겹쳐 보인 것은 회전 중이던 것 + 한글 글꼴 폴백 — 둘 다 고쳤다. 남는 겹침은 「이름 자동」 · 확대로 |
| 하지 않은 것 | 좌표 카테고리 이름의 한글/영문 섞임(`term`) — `_vocab.md` 의 타입 이름(데이터) · 실서버 시험 흔적 정리(휴지통 zz-test · 고아 등록 wr_3b3e11 — 다음 판을 올린 뒤 콘솔 [삭제] 로) · 서버 · PC 시계(NTP) · gdi 데이터(F8) — 전부 사람 |
| 시험 | 단위 `node --test test/*.test.mjs` **254 ✓ · 0 ✗** · 하네스 `node ops/verify/run.mjs` **✓ 100 · ✗ 0 · – 16**(건너뜀은 전과 같다) · `npm run build` 통과 · 로컬 서버 API 실측(409 · `dpms←beta` · 고아 삭제 · 감사 줄) · 헤드리스 화면 실측(로그인 375 · 새 레포 창 1280 · 토큰 859 · 사용자 열 강조 · 서버 859 · 설명서 375 목차 접기 · 소개 375 · 레포 홈 859 · 뻗어나가기 1025 · 그래프 1280) |
| F16 라벨 글꼴 | 캔버스 라벨이 `'Roboto Mono', … monospace` 라 한글 좌표 이름이 generic monospace 로 떨어져 벌어지고 길어져 겹쳤다 — 한글 폴백을 더했다(자리 피하기는 원래 있다) |
