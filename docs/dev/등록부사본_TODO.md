# 등록부 사본 · 모순 TODO

> 운영자 요청(2026-09-30) R1~R8 — `dpms_wiki` `75a3c90` 이 `회의록:*` 을 더했는데 `BM_411` 머리 표 · `_vocab.md`
> 규칙이 그대로 남았고 예시 18건을 지울 길이 없었다. 검토 · 결정은 `docs/design/CDP_등록부사본_모순_검토_v0.1.md`
> (X1~X31). 결정은 전부 권장안. 커밋까지만 — push · 태그 · 실서버 upgrade · `dpms_wiki` 정리는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · 결정 | **완료** |
| ① 생성물 — 머리 표 · 생성 블록 (X1~X6) | **완료** — dpms 패키지 40 문서의 칸이 뜻으로 전부 맞는다(고칠 것 0) · `회의록:*` 을 더하면 `BM_411:10` 한 줄만 바뀐다 |
| ② 모순 검사 (X7~X9) | **완료** — 옛 문구 레포에 `managed: add 회의록:*` → `BM_411:3` · `_vocab.md` 규칙 4 · `_managed.md` 「32종」 세 줄. 새 패키지 그대로면 `check` 의 `registry-prose` 0 |
| ③ 예시 정리 (X10~X14) | **완료** — writer 한 번에 좌표 18 · 섹션 27 · 남은 표 행 35줄 목록 · 그 뒤 `example-coord` 0 |
| ④ `edits` (X15~X19) | **완료** — BM_411 머리말 · 비대상 문서 섹션 지우기 · 막는 자리 여덟(시험) |
| ⑤ `docs` 도구 · `match` (X20~X23) | **완료** — 문서 40 · 등록부 대상 14 · `match(["회의록"])` → `BM_411` |
| ⑥ 스킬 · 패키지 문구 (X4 · X24~X26 · X29) | **완료** |
| ⑦ 기본 레포 (X27 · X28) | **완료** |
| ⑧ 경고 해법 (X30 · X31) | **완료** — 로컬 뷰어(fixture) 검사 화면에 `fix` 줄(DOM 확인) |
| ⑨ 검증 · 판 | **완료** — 아래 「검증」 |

---

## ① 생성물 — `core/regen.js`(새)

- [x] `headRow(text)` — 머리말(첫 `##` 앞 · 펜스 밖)의 첫 표에서 `| 등록부 | … |` 줄 번호 · 칸
- [x] `cellPatterns(cell)` · `cellOff(cell)` — 뜻으로 읽기 (백틱 `type:glob` 집합 · 「비대상」)
- [x] `renderCell(rules, oldCell)` — 행이 있으면 `` `p` → `## {값}` `` · 로 잇기, 없으면 `**비대상**`(비대상→비대상은 옛 칸 그대로)
- [x] `vocabBlock(registry, vocab)` — `<!-- cdp:registry -->` 사이 표
- [x] `regenerate({ registry, vocab, files })` → `{ changed: Map<rel,text>, heads: [...], block: bool }` — 순수
- [x] `lintGenerated(...)` → 뜻이 다른 머리 칸 · 낡은 블록 (check 가 쓴다)
- [x] save 9단계 — INDEX 옆에서 `regenerate` → `snap.write` · 경고 한 줄
- [x] `ctx index` 가 같이 쓴다
- [x] check `registry-head` (error · `fix`)

## ② 모순 검사 — `core/regen.js` 의 `proseConflicts`

- [x] 입력 `{ type, doc, files }` → `[{ file, line, text, why }]` — 머리말 비대상 말 · `` `T:` `` 부정 · 개수 주장
- [x] save 5.5 — `plan.added` 마다, `edits` 적용 **뒤**의 글로. `reviewed` 에 든 `파일:행` 은 뺀다 → 남으면 `E_INPUT` `detail.lines`
- [x] `managedops` KEYS.add.may 에 `reviewed` · 모양 검사 · zod
- [x] check `registry-prose` (warn · 개수 주장 제외)

## ③ 예시 정리 — `core/examples.js`(새)

- [x] `planPurge({ vocabText, registry, docs(텍스트 지도), touched })` → `{ vocab, files, coords, sections, kept, left }` — 순수
- [x] save 4.3 — `examples: "purge"` (다른 값은 E_INPUT)
- [x] 응답 `examples`
- [x] `ctx examples [--purge]`
- [x] `newRepo({ examples: false })` · `ctx repo new --no-examples` · 콘솔 체크 · `POST /admin/repos { examples }`

## ④ `edits` — `core/edits.js`(새)

- [x] 모양 — 배열 20 · `file` 경로 규칙 · `old` 1~20000자 · `new` 0~50000자
- [x] 막는 자리(X16) — 줄 범위로 판정
- [x] 없음 E_CONFLICT · 여럿 E_INPUT · CRLF
- [x] save 4.5 — 어휘 뒤 · 등록부 계획 앞(계획의 `read` 가 고친 글을 본다)
- [x] 응답 `edits: [{ file, line }]`

## ⑤ `docs` 도구 · `match`

- [x] `core/tools.js` `toolDocs(r, { doc })`
- [x] `toolMatch` 미등재에 `docs`
- [x] `ctx-mcp.mjs` 명함 · 등록
- [x] `ctx docs [<doc>] --json`

## ⑥ 스킬 · 패키지

- [x] 패키지 3벌 `_vocab.md` — 규칙 4 · 「여기 없는 일」 · 생성 블록 / `_managed.md` 「— 32종」
- [x] `cdp-import` ③-6 · `cdp-save` ⑤B 【등록부 변경】 영향 문구 · ⑤B-0 `brief({ repo })`
- [x] `cdp-edit` 예시 4 모드 분기 · 못 하는 일을 승인 전에
- [x] `cdp-managed` — 예시 정리 · `docs`
- [x] `save` 명함 — `edits` · `examples` · `reviewed`
- [x] 설계서 `CDP_MCP_설계서_v1.0.md` §4.5 · 설명서

## ⑦ 기본 레포

- [x] `brief({ repo })` — `repo ≠ fallback` 이면 경고 줄(서버형 · 연결이 `/mcp/<이름>` 일 때)
- [x] 설치 계획 줄 — 기존 `.mcp.json` 의 `cdp` url 레포가 다르면 「바로잡는다」

## ⑧ 경고 해법

- [x] finding `fix` — `example-coord` · `registry-head` · `registry-prose` · `index-stale`
- [x] `CheckView` 가 `fix` 를 보인다
- [x] save 「새 어휘 타입」 경고 뒷말

## ⑨ 검증 · 판

- [x] `test/regen.test.mjs` · `test/examples.test.mjs` · `test/edits.test.mjs` · `test/save-prose.test.mjs`(이번 사례를 dpms 패키지로 다시 돌린다 — writer 계정)
- [x] `node --test test/*.test.mjs`
- [x] `ctx package check` 3벌 · `npm run build`
- [x] 하네스 `node ops/verify/run.mjs`
- [x] CHANGELOG · 판 v0.21.0

---

## 나온 것

| | 무엇 | 왜 그렇게 |
|---|---|---|
| 1 | 머리 표 `등록부` 줄은 `edits` 가 **건드려도 된다**(X16 에서 뺐다) — 뒤에서 save 가 등록부로 다시 찍는다 | 머리말을 통째로 바꾸려면 머리 표가 `old` 에 들어간다. 막으면 「머리말 교체」 가 안 되고, 막지 않아도 틀린 칸은 같은 커밋 안에서 고쳐진다 |
| 2 | 산문 판정의 부정은 **그 타입 표기 뒤 같은 문장**에서 「타입 · 좌표 + 없 · 아니」 · 「비대상」 · 「등록부에 없」 만 | 한 줄 전체로 보니 「`시스템아키텍처:` 넷만 예시가 아니다 · ID 가 없는」 이 걸렸다 — 새 패키지 그대로 `check` 가 경고를 냈다 |
| 3 | 등록부 **비대상** 문서의 `<!-- applied: null -->` 줄은 `edits` 로 지울 수 있다(새로 넣는 것은 막는다) | 비대상 문서의 applied 는 아무것도 가리키지 않는다. 막으면 회의록의 예시 섹션을 통째로 지울 수 없다(시험에서 잡았다) |
| 4 | 예시 정리는 작업 기록이 쓰는 예시 좌표를 지우지 않고 **`example:` 표시만 뗀다** | 패키지 규칙(「touches 에 적으면 그때는 좌표」). 지우면 미등재 오류로 E_CHECK · 표시가 남으면 `example-coord` 가 0 이 안 된다 |
| 5 | `search` 는 그대로(X23) · 문서 이름은 `match` 의 `docs` 와 `docs` 도구가 준다 | 좌표 후보 배열에 모양이 다른 행을 섞으면 부르는 쪽이 갈린다 |
| 6 | 패키지 `README.md` 의 「문서 40종 · 나머지 32종」 표는 두었다 — 첫날 5단계 3번만 `ctx examples --purge` · `examples: "purge"` 로 | 패키지를 **설명하는** 문서다(부은 순간의 모습). 등록부 판정은 `_vocab.md` · `_managed.md` · 머리 표가 하고 그 셋에서 사본을 걷었다 |
| 7 | 요청의 「관리 문서 42종」 은 dpms 패키지로는 40 이다 | `dpms_wiki` 에 문서 둘이 더 있는 것으로 보인다 — 수용 기준은 `total` 이 실제 수와 같은지로 본다 |
| 8 | 도구 수 13 → **14**(`docs`) — 사이트 facts · 소개 화면 · 설명서 · 하네스 11 · 15 · 41 · 새 레포 도구 수를 같이 | 사이트 시험(`도구 14 · 스킬 7`)이 등록된 도구와 대조한다 |
| 9 | `viewer/fixture/bin/ctx.mjs`(번들 편의 사본)는 커밋하지 않았다 | v0.12.0 뒤로 판마다 되돌려 왔다(`build:ctx` 가 덮는다) |
| 10 | 콘솔 「새 지식 레포」 의 체크는 브라우저로 보지 않았다 — API(`POST /admin/repos { examples: false }`)와 `newRepo` · `purgeTree` 는 시험으로 | 관리자 재인증이 있는 창이라 fixture 뷰어로는 못 연다. 다음 실서버 확인 때 한 번 |
| 11 | 실서버 `dpms_wiki` 정리(`BM_411` 머리말 · `_vocab.md` 규칙 4 · 예시 18건)는 **하지 않았다** | 요청의 마지막 줄 — 판을 올린 뒤 같은 경로(`edits` · `examples: "purge"`)로 사람이 한다. 올린 뒤 첫 save 가 `BM_411` 머리 표를 저절로 맞춘다 |

## 검증

| | 결과 |
|---|---|
| 단위 시험 | `node --test test/*.test.mjs` **205 / 205** (새로 `save-registry-copy` 10 · `regen` 4) |
| 하네스 | `node ops/verify/run.mjs` **✓ 99 ✗ 0 – 16** — 113(`docs` · `match` 문서 대조 · `brief` 기본 레포 경고) · 114(`edits` 커밋 · 낡은 old E_CONFLICT · 좌표 섹션 · 문서 전체 E_INPUT). 처음 돌렸을 때 ✗ 2(72 · 114)는 기대값 — 도구 수 13 이 한 곳 더 · 미러 레포에서는 회의록이 `note:*` 문서 전체라 비대상 문서를 프로그램목록으로 |
| 패키지 | `npm run check:packages` 3벌 ok — 경고는 예시 18건뿐(`registry-head` · `registry-prose` 0) |
| 빌드 | `npm run build` · `build:ctx` · `build:site`(누출 0) |
| 화면 | 로컬 뷰어(fixture) 「검사 결과」 — 「INDEX.md 불일치」 아래 `fix` 줄. 창이 가려져 스크린샷은 못 찍고 DOM 으로 확인 |
