# 끊김 — 실행 TODO

2026-09-23 · 근거 [`끊김_검토.md`](끊김_검토.md)

> 항목 번호는 검토 §4 와 같다. **모든 결정은 권장으로 처리했다**(운영자 지시) —
> 무엇을 왜 그렇게 정했는지는 아래 「나온 것」에 있다.

## 끝난 상태

| | 기준 | 결과 |
|---|---|---|
| 서버 — git | `git.status()` 가 git 을 한 번 띄우고, 옛 결과와 필드가 같다 | 빈 레포 · 떨어진 HEAD · 앞섬/뒤처짐 · 변경 · 레포 아님 6곳 같음 |
| 서버 — 색인 | 새 색인이 옛 색인과 같은 경로·점수를 낸다 | 레포 4 · 질의 24 → 96건 중 95 같음, 1건은 동점끼리 순서 |
| 서버 — 멈춤 | `load()` 중 이벤트 루프 최장 정지 50ms 아래 | 21~25ms |
| 화면 — 큰 문서 | 테이블정의서 열기 long task 합 0.5초 아래 | 0.28~0.32초 |
| 화면 — 옳음 | 목차 이동이 제목에 닿는다 · 현재 섹션이 맞다 · 인쇄에서 표가 다 나온다 | 헤드리스 Chrome 으로 확인 |
| 회귀 | `npm test` · `npm run verify` · `npm run check:packages` | 77 통과 · ✓ 60 ✗ 0 · ok |

## 항목

- [x] **S1** `core/git.js` `status()` — `status --porcelain=v2 --branch` 하나로. `hooksPath` 는 설정 파일 시각 열쇠로 기억
- [x] **S2** `core/search.js` — MiniSearch 를 걷고 `Map` 색인. `package.json` 에서 `minisearch` 제거 · `test/search.test.mjs`
- [x] **S3** `core/store.js` — 전문 색인은 `search()` 가 처음 쓸 때 짓는다
- [x] **S4** `core/store.js` `fetchOnce()` — 한 번에 하나 · 60초 안이면 다시 안 함 · 도는 중이면 기다리지 않음
- [x] **C1** `doc.css` — `.doc > .tablewrap, .doc > .codeblock` 에 `content-visibility: auto` · 인쇄에서 `visible`
- [x] **C2** `markdown.js` — 렌더 결과 8장 기억
- [x] **C3** `markdown.js` `linkCoords` — 요소도 걷고 건너뛸 요소에서 가지째 돌아선다
- [x] **C4** `SectionRail.jsx` — 프레임당 한 번 · 제목 노드 한 번 찾기 · 목차 목록만 스크롤 · `memo`
- [x] **C5** 섹션 이동 — 즉시 이동 + 두 프레임 뒤 한 번 더
- [x] **C6** `DocView.jsx` — 진행률 프레임당 한 번
- [x] **C7** `CoordGraph.jsx` — 배치 기억
- [x] **C8** `StatusBar.jsx` — 포커스 새로고침 15초에 한 번
- [x] 문서 — `agent/manual/system.md` · `manual/개발자_설명서.md` 의 스택 표(MiniSearch → 자체 색인) · CHANGELOG

## 나온 것 — 권장으로 정한 것

| 무엇 | 정한 것 | 왜 |
|---|---|---|
| MiniSearch | **걷었다** | 느린 것이 자료 구조(기수 트리 × 한글 음절)라 설정으로 못 고친다. 점수 규칙은 60줄이라 옮기는 편이 싸다. 폐쇄망용 `ctx.mjs` 번들에서도 빠진다 |
| 살균(DOMPurify) | **남겼다** | 뷰어 설계서 v0.2 의 결정(*"로컬이라고 렌더 전 살균을 빼지 않는다"*). 대신 결과를 기억한다 |
| 목차 이동 | 부드러운 스크롤 → **즉시 이동** | 그려지지 않은 표가 도중에 그려지며 목표가 움직인다. 본문의 섹션 이동(`DocView`)은 원래 즉시 이동이었다 — 둘이 같아졌다 |
| `content-visibility` 범위 | **표와 코드 블록만** | 문단·목록까지 걸면 여백 겹침(margin collapse)이 바뀌어 본문 간격이 달라진다. 무게는 표에 있다 |
| fetch 신선도 | **60초** | 화면의 주기 fetch 가 5분이다. 그보다 짧아야 주기를 해치지 않고, 포커스 연타는 거른다 |
| CHANGELOG | **v0.9.0 절에 넣었다** | v0.9.0 태그가 아직 안 달렸다(메모 · 제품화 TODO). 태그 전에 들어간 것은 그 판의 것이다 |

## 남은 것

검토 §6 — 지금 규모에서는 고칠 값이 없어 둔 것들. 사람이 할 일은 없다.
