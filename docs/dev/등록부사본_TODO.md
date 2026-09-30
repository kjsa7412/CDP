# 등록부 사본 · 모순 TODO

> 운영자 요청(2026-09-30) R1~R8 — `dpms_wiki` `75a3c90` 이 `회의록:*` 을 더했는데 `BM_411` 머리 표 · `_vocab.md`
> 규칙이 그대로 남았고 예시 18건을 지울 길이 없었다. 검토 · 결정은 `docs/design/CDP_등록부사본_모순_검토_v0.1.md`
> (X1~X31). 결정은 전부 권장안. 커밋까지만 — push · 태그 · 실서버 upgrade · `dpms_wiki` 정리는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · 결정 | **완료** |
| ① 생성물 — 머리 표 · 생성 블록 (X1~X6) | |
| ② 모순 검사 (X7~X9) | |
| ③ 예시 정리 (X10~X14) | |
| ④ `edits` (X15~X19) | |
| ⑤ `docs` 도구 · `match` (X20~X23) | |
| ⑥ 스킬 · 패키지 문구 (X4 · X24~X26 · X29) | |
| ⑦ 기본 레포 (X27 · X28) | |
| ⑧ 경고 해법 (X30 · X31) | |
| ⑨ 검증 · 판 | |

---

## ① 생성물 — `core/regen.js`(새)

- [ ] `headRow(text)` — 머리말(첫 `##` 앞 · 펜스 밖)의 첫 표에서 `| 등록부 | … |` 줄 번호 · 칸
- [ ] `cellPatterns(cell)` · `cellOff(cell)` — 뜻으로 읽기 (백틱 `type:glob` 집합 · 「비대상」)
- [ ] `renderCell(rules, oldCell)` — 행이 있으면 `` `p` → `## {값}` `` · 로 잇기, 없으면 `**비대상**`(비대상→비대상은 옛 칸 그대로)
- [ ] `vocabBlock(registry, vocab)` — `<!-- cdp:registry -->` 사이 표
- [ ] `regenerate({ registry, vocab, files })` → `{ changed: Map<rel,text>, heads: [...], block: bool }` — 순수
- [ ] `lintGenerated(...)` → 뜻이 다른 머리 칸 · 낡은 블록 (check 가 쓴다)
- [ ] save 9단계 — INDEX 옆에서 `regenerate` → `snap.write` · 경고 한 줄
- [ ] `ctx index` 가 같이 쓴다
- [ ] check `registry-head` (error · `fix`)

## ② 모순 검사 — `core/regen.js` 의 `proseConflicts`

- [ ] 입력 `{ type, doc, files }` → `[{ file, line, text, why }]` — 머리말 비대상 말 · `` `T:` `` 부정 · 개수 주장
- [ ] save 5.5 — `plan.added` 마다, `edits` 적용 **뒤**의 글로. `reviewed` 에 든 `파일:행` 은 뺀다 → 남으면 `E_INPUT` `detail.lines`
- [ ] `managedops` KEYS.add.may 에 `reviewed` · 모양 검사 · zod
- [ ] check `registry-prose` (warn · 개수 주장 제외)

## ③ 예시 정리 — `core/examples.js`(새)

- [ ] `planPurge({ vocabText, registry, docs(텍스트 지도), touched })` → `{ vocab, files, coords, sections, kept, left }` — 순수
- [ ] save 4.3 — `examples: "purge"` (다른 값은 E_INPUT)
- [ ] 응답 `examples`
- [ ] `ctx examples [--purge]`
- [ ] `newRepo({ examples: false })` · `ctx repo new --no-examples` · 콘솔 체크 · `POST /admin/repos { examples }`

## ④ `edits` — `core/edits.js`(새)

- [ ] 모양 — 배열 20 · `file` 경로 규칙 · `old` 1~20000자 · `new` 0~50000자
- [ ] 막는 자리(X16) — 줄 범위로 판정
- [ ] 없음 E_CONFLICT · 여럿 E_INPUT · CRLF
- [ ] save 4.5 — 어휘 뒤 · 등록부 계획 앞(계획의 `read` 가 고친 글을 본다)
- [ ] 응답 `edits: [{ file, line }]`

## ⑤ `docs` 도구 · `match`

- [ ] `core/tools.js` `toolDocs(r, { doc })`
- [ ] `toolMatch` 미등재에 `docs`
- [ ] `ctx-mcp.mjs` 명함 · 등록
- [ ] `ctx docs [<doc>] --json`

## ⑥ 스킬 · 패키지

- [ ] 패키지 3벌 `_vocab.md` — 규칙 4 · 「여기 없는 일」 · 생성 블록 / `_managed.md` 「— 32종」
- [ ] `cdp-import` ③-6 · `cdp-save` ⑤B 【등록부 변경】 영향 문구 · ⑤B-0 `brief({ repo })`
- [ ] `cdp-edit` 예시 4 모드 분기 · 못 하는 일을 승인 전에
- [ ] `cdp-managed` — 예시 정리 · `docs`
- [ ] `save` 명함 — `edits` · `examples` · `reviewed`
- [ ] 설계서 `CDP_MCP_설계서_v1.0.md` §4.5 · 설명서

## ⑦ 기본 레포

- [ ] `brief({ repo })` — `repo ≠ fallback` 이면 경고 줄(서버형 · 연결이 `/mcp/<이름>` 일 때)
- [ ] 설치 계획 줄 — 기존 `.mcp.json` 의 `cdp` url 레포가 다르면 「바로잡는다」

## ⑧ 경고 해법

- [ ] finding `fix` — `example-coord` · `registry-head` · `registry-prose` · `index-stale`
- [ ] `CheckView` 가 `fix` 를 보인다
- [ ] save 「새 어휘 타입」 경고 뒷말

## ⑨ 검증 · 판

- [ ] `test/regen.test.mjs` · `test/examples.test.mjs` · `test/edits.test.mjs` · `test/save-prose.test.mjs`(이번 사례를 dpms 패키지로 다시 돌린다 — writer 계정)
- [ ] `node --test test/*.test.mjs`
- [ ] `ctx package check` 3벌 · `npm run build`
- [ ] 하네스 `node ops/verify/run.mjs`
- [ ] CHANGELOG · 판 v0.21.0

---

## 나온 것

| | 무엇 | 왜 그렇게 |
|---|---|---|
