# 관리문서 동적 생성 TODO — 서버가 새 관리 문서를 만들고 · 좌표를 붙이고 · 정리한다

> 운영자 요청(2026-09-30) — 「패키지 관리문서는 프로젝트 전체를 덮지 못한다. 필요에 따라 관리문서가 생성되고 · 정리되고(이름 변경 · 합치기 · 폐기) · 그 관리문서에 좌표가 붙는 동작이 되어야 한다. 지금은 어휘 타입만 열렸다.」 **권장안으로 진행.**
> 사건: dpms_wiki 에 도메인 지식 문서(PLC · CIMON · SCADA 용어 10개)를 `cdp-import` 로 들이려다 `save` 가 새 어휘 타입을 거절(d140164 로 고침) — 다음 벽은 `term:*` 를 받을 **등록부 행 · 관리 문서**가 서버에 없다는 것.
> 짝 문서 — [`../design/CDP_관리문서_동적생성_검토_v0.1.md`](../design/CDP_관리문서_동적생성_검토_v0.1.md) (M1~M12).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림(v0.19.3 후보 · 사이트 시험이 둘의 일치를 본다) · 실서버 upgrade · dpms_wiki 실제 편입은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 | **완료** — 실측 P1~P7 · 문제 G1~G7 · 결정 M1~M12 (커밋 3d2c9c2) |
| ① `core/managed.js` · `core/managedops.js` | **완료** — 글롭 포함 · 교차(전수 대조 시험) · 패턴 · 경로 · 행 글씨 · `lintRegistry` · `planManaged`(순수) |
| ② `save` · `check` · 서버 · MCP 명함 | **완료** — `managed[]`(add · rename · merge · retire) · 권한 2.5 · 4.5 등록부 · `Snap.remove` · `needSections` · 경로 이중 검사 · 응답 · 로그 · `check` 넷(`registry-path` 오류 · `-outside` · `-shadowed` · `-level-mix` 경고) · zod · 명함 · `saver` 가 `admin` 전달 |
| ③ 시험 · 하네스 | **완료** — `test/managedops.test.mjs`(21) · `test/save-managed.test.mjs`(16) · `test/toollayer.test.mjs`(+1) · 하네스 110 |
| ④ 설계서 · 스킬 · 설명서 | **완료** — 설계서 §4.5 · `cdp-save` ② 「등록부 변경」 · ⑤B · `cdp-import` ③-4 · ③-6 · 예시 · `cdp-managed` 「구조 정리」 · `cdp-load` · 설명서 여섯(`agent/manual` · `manual`) |
| 검증 | `node --test test/*.test.mjs` 초록(183 + 새 것) · 하네스는 아래 |

---

## 0. 전제 — 닫혔다

검토 §7 · §8. 코드가 따라야 하는 것만 다시 적는다.

- [x] 받는 자리는 **`save` 입력 `managed[]`** — 별도 도구 없음(M1). `managed` 가 없으면 옛 입력 그대로다
- [x] `add` = writer · `rename` · `merge` · `retire` = **admin** · 권한은 **파일을 만지기 전에**(M2)
- [x] 새 행은 등록부 **맨 끝**(마지막 규칙 행 바로 뒤) · 4번째 칸 `서버 추가 · <work.id>` — 기존 행은 안 바뀐다(M3)
- [x] 경로는 `docs/…md` 만 · 쓰기 전에 검사 + root 접두 검사 한 번 더 — **등록부에서 읽은 기존 행도**(M4 · G4)
- [x] 겹침 — 완전히 덮이면 거절 · 교차는 경고 · 같은 패턴은 멱등 / 다른 문서면 `E_CONFLICT`(M5)
- [x] 한 문서는 한 레벨 · `—` 는 새 문서 전용(M6)
- [x] 기존 좌표가 새 행에 걸려 섹션이 없으면 거절 `needSections`(M7)
- [x] 한 커밋 · 한 `Snap` · 검사 실패면 전부 되돌린다(지운 파일까지)
- [x] 판정은 `core/` 한 곳 — `lintRegistry` 를 `check` 와 `save` 가 같이(불변조건 1)
- [x] 판 올림 · push · 태그는 하지 않는다(M12)

---

## ① core — 글롭 · 경로 · 행 글씨 · 계획

**바뀌는 파일** — `core/managed.js`(순수 함수 더하기) · **`core/managedops.js`(새)**.

- [x] `core/managed.js` — `ADDED_NOTE = '서버 추가 · '` · `addedBy(rule)`(note 가 그 접두사로 시작하면 작업 기록 id) · `globContains(outer, inner)`(`inner` 의 `*` 를 패턴에 없는 글자 하나로 바꿔 `outer` 의 정규식에 넣는다) · `globIntersects(a, b)`(메모 재귀) · `checkPattern(p)`(타입은 `checkCoord` 와 같은 문자 집합의 구체적 타입 · 값 1~200자에 공백 · `|` · 백틱 · 제어문자 · `..` 없음) · `assertDocPath(rel)`(`docs/…md` · `..` · 절대 · `\` · `:` · `.` 로 시작하는 세그먼트 · 예약 이름 · 끝 공백/점 · 세그먼트 80 · 전체 200 · 깊이 4) · `levelText(level)`(`## {값}` / `—`) · `registryRow({ pattern, doc, level, note })` · `lintRegistry(rules)` → `{ path: [], shadowed: [], levelMix: [] }`
- [x] `core/managedops.js` — `planManaged({ ops, registryText, registry, docPaths, read, workId, admin })` **순수**(파일을 안 쓴다) → `{ registryText, registry, files: Map<rel, string|null>, events, warnings, added: [pattern…] }`
  - `add` — 패턴 · 경로 검사 → 같은 패턴이 있으면 멱등 / `E_CONFLICT { kind: 'managed', pattern, current }` → 앞 행에 완전히 덮이면 `E_INPUT { shadowedBy }` · 교차는 경고 → 문서 레벨 대조(같은 문서의 기존 행 레벨 · `—` 는 새 문서 전용) → 문서가 없으면 `# 제목` 한 줄로 만든다(대소문자만 다른 경로도 같은 문서) → 행을 마지막 규칙 행 바로 뒤에(`_managed.md` 가 없으면 표째 만든다)
  - `rename` — `to` 검사 · 없는 문서 `E_INPUT` · 이미 있으면 `E_EXISTS` · 그 문서의 모든 행 경로 칸 · 파일 이동 · 경고(링크는 사람이)
  - `merge` — 레벨 같음 · `—` 아님 · `into` 있음 · `doc` 머리 검사 · 행 돌림 · `doc` 삭제 · 경고
  - `retire` — 행 삭제 · 고아 문서 경고
  - 앞 op 가 만든 상태 위에서 뒤 op 가 돈다(같은 save 안의 `add` → `add`)

**확인 방법** — `node --test test/managed.test.mjs`(순수 — 임시 폴더 없음).
**끝났다고 보는 기준** — 글롭 포함 · 교차가 **전수 대조**(짧은 알파벳 · 길이 ≤ 4 문자열 전부)와 같다 · `planManaged` 가 파일을 안 쓴다.

## ② save · check · 서버 · 명함

**바뀌는 파일** — `core/save.js` · `core/check.js` · `viewer/bin/ctx-mcp-serve.mjs`(`saver` 가 `admin` 전달 · 로그 한 줄) · `viewer/bin/ctx-mcp.mjs`(zod · 명함).

- [x] `save.checkSchema` — `managed` 배열 ≤ 10 · 원소 모양(op · 필드 조합 · `level` 0~6 정수 · 모르는 키 거절)
- [x] `save.run` 1.5단계 — `managed` 중 `add` 가 아닌 것이 있고 `admin` 이 아니면 `E_FORBIDDEN { need: 'admin' }`(파일을 만지기 전 · 권한 바로 뒤)
- [x] `save.run` 4.5 단계(r0 를 읽은 뒤 · 좌표 대조 전) — `planManaged` → `_managed.md` · 새 문서 · 옮긴 문서를 `snap.write` · 지울 문서를 **`snap.remove`(새)**
- [x] `Snap.remove(rel)` — 원본을 들고 지운다 · `restore` 가 다시 쓴다 · `paths()` 에 든다(`git add -- <삭제 경로>` 가 삭제를 커밋한다 — P6)
- [x] 6단계가 **새 등록부 · 가상 파일**(`planManaged.files` 위에 디스크)로 섹션을 판정한다 — 옮긴 문서의 섹션이 같은 save 에서도 읽힌다
- [x] 6단계 **등록부에서 읽은 문서 경로에도 `assertDocPath` + root 접두 검사**(G4 · 기존 손 편집 행)
- [x] `needSections` — 새 행이 걸리는 기존 좌표(작업 기록 `touches` ∪ 이 save 의 `touches` · `sections`)의 섹션이 문서에 없고 이 save 가 안 보냈으면 `E_INPUT { needSections: [...] }` + 풀 길 문장
- [x] E_CHECK 에 새 행이 있으면 `detail.hint`(새 행이 걸리는 좌표는 sections 를 같이)
- [x] `sections` 좌표가 등록부에 안 걸릴 때의 메시지에 풀 길을 더한다(G2) — *managed 로 행을 같이 보내거나 sections 에서 빼고 touches 로만*
- [x] 응답 `managed: <건수>` · `managedChanges: [{ op, pattern, doc, to?, into? }]`(있을 때만) · `warnings` · `log?.('등록부 변경 …')`
- [x] `core/check.js` — `registry-path`(탈출 = error · `docs/` 밖 = warn) · `registry-shadowed`(warn) · `registry-level-mix`(warn) — `lintRegistry` 한 함수
- [x] `ctx-mcp.mjs` — zod `managed` · `CARD.save` 에 한 문장(등록부 변경은 【좌표 판정】 과 같이 승인 · 정리는 admin)
- [x] `ctx-mcp-serve.mjs` — `doSave(…, { admin: a.admin })`

**확인 방법** — `node --test test/save.test.mjs test/managed.test.mjs`.
**끝났다고 보는 기준** — 임시 레포에서 **한 save** 로 새 타입 + 새 행 + 새 문서 + 섹션 + 작업 기록이 **한 커밋** · 트리 깨끗 · 같은 입력을 `managed` 없이 보내면 옛 동작 그대로.

## ③ 시험 · 하네스

- [x] `test/managed.test.mjs` — `globContains` · `globIntersects` 전수 대조 · `checkPattern` · `assertDocPath` · `registryRow` ↔ `parseRegistry` 왕복 · `addedBy` · `lintRegistry`(덮임 · 레벨 섞임 · 탈출) · `planManaged`(행 위치 = 마지막 규칙 행 뒤 · 설명 표에 안 붙는다 · 멱등 · 충돌 · 없는 `_managed.md` · CRLF 레포 · rename · merge · retire · 같은 save 안 add → add)
- [x] `test/save.test.mjs` — **dpms_wiki 사례**(새 타입 `term:PLC` + `managed: add term:* → docs/용어집.md` + 섹션 · 한 커밋 · 행 note · 둘째 save 는 `managed` 없이 · `where`/`section` 이 읽는다) · 권한(writer 의 rename · merge · retire → E_FORBIDDEN · 트리 그대로) · 경로 일곱 가지 · 패턴(덮임 · 교차 경고 · 멱등 · 충돌) · 레벨 · 기존 좌표(needSections · 섹션과 함께면 통과) · 롤백(E_CHECK 뒤 `_managed.md` · 새 문서 · 지운 문서 복원 · 커밋 0 · 색인 깨끗) · admin rename · merge(성공 · dup 롤백) · retire(고아 문서 경고 · 파생 누락 해소) · 동시 두 save 가 같은 행 → 한 줄 · 등록부의 `..` 행 → 쓰기 전에 E_INPUT
- [x] `test/toollayer.test.mjs` — 서버가 더한 행 · 문서가 있는 레포에서도 도구 층 갱신 계획에 `_managed.md` · `docs/` 가 안 든다(M10)
- [x] `test/packages.test.mjs` 또는 `managed.test.mjs` — **패키지 셋의 등록부가 `lintRegistry` 세 검사에서 0건**
- [x] 하네스 `ops/verify/run.mjs` **110** — 서버에서 MCP `save` 한 번으로 새 타입 · 새 관리 문서 · 좌표 부착 · `where` 가 그 섹션을 가리킨다 · writer 가 `retire` 하면 E_FORBIDDEN (하네스 헤더 줄 수 문구 갱신)

**확인 방법** — `node --test test/*.test.mjs`(node_modules 가 비면 `npm ci`) · `node ops/verify/run.mjs`.
**끝났다고 보는 기준** — 전부 초록 · 하네스 110 ✓.

## ④ 설계서 · 스킬 · 설명서

- [x] `docs/design/CDP_MCP_설계서_v1.0.md` §4.5 — 입력 JSON 에 `managed` · 처리 순서 4.5 · 응답 · 정정 상자(v0.19.3) · 규칙 문장 「`_managed.md` 는 `save` 로 바꾸지 않는다」 를 정정 · 좌표 5번의 「등록부에 걸린다」 · `E_CONFLICT` 표 행 · 명함 문장
- [x] `agent/skills/cdp-save/SKILL.md` — ② 판정표 · ⑤B-0 에 【등록부 변경】 덩어리(신규 타입 · 신규 관리 문서 · 좌표 부착 · 기존 좌표 · 정리) · 모드 B 입력 예시에 `managed`
- [x] `agent/skills/cdp-import/SKILL.md` — ③-2 판정표 · ③-6 승인 · `registry: null` 의 풀 길(도메인 지식 문서 예시에 `term:*` 용어집)
- [x] `agent/skills/cdp-managed/SKILL.md` — 「구조 정리」 새 절(rename · merge · retire · admin · 사유는 `work.body` · admin 아니면 요청문)
- [x] `agent/skills/cdp-load` · `cdp-work` — 「등록부에 없다 = 정상」 문장에 「새 타입이면 기록할 때 만든다」 한 줄
- [x] `agent/manual/*.md` · `manual/*.md` — 「등록부에 없는 좌표」 · 「save」 자리에 한 문단(관리자 설명서에는 정리 · 권한 · 흔적)
- [x] 배포본에 사내 흔적 없음 — 예시는 일반 예시(`term:` 용어집 · `table:` 표) · `test/site.test.mjs` 초록
- [x] 이 TODO 의 「지금 어디까지」 · 체크 · 「나온 것」

**끝났다고 보는 기준** — `node --test test/*.test.mjs` 초록(사이트 시험 포함).

---

## 나온 것 · 권장안으로 정한 것

| | 무엇을 | 왜 |
|---|---|---|
| T1 | **새 섹션의 `heading` 은 제목 줄 전체(`값 — 설명`)** — 값으로 시작하지 않으면 `E_INPUT` | 구현 중 실측: `heading: '프로그래머블…'` 만 보내면 섹션 이름이 값 `PLC` 와 달라 **앵커 없음 E_CHECK** 가 났다. 설계서는 「`## <값> — <heading>`」 이라 적었으나 코드는 `heading || 값` 이었다 — 설계서를 코드에 맞췄고(제목 줄 전체) 틀린 입력을 E_CHECK 전에 잡는다 |
| T2 | `Snap.abs` 가 **모든 쓰기 · 삭제**에서 root 접두를 검사한다 | 검토 §5.3 「둘 다」 — 좌표 · id · 등록부 · 새 문서 경로가 파일 이름이 되는 마지막 문이 한 곳이다. 등록부에서 읽은 기존 행은 6단계에서 `docEscapes` 로 한 번 더(P5) |
| T3 | `Snap` 이 새로 만든 폴더를 롤백 때 치운다 · `remove` 가 비게 된 `docs/` 하위 폴더를 치운다 | 새 문서를 `docs/신규/…` 로 만들었다 되돌려도 빈 폴더가 남던 것 |
| T4 | `check` 의 새 검사는 **넷**(검토는 셋) — `registry-outside`(docs/ 밖 · warn)를 `registry-path`(탈출 · error)에서 갈랐다 | 탈출만 오류여야 기존 레포(docs/ 밖을 쓰는)가 잠기지 않는다 |
| T5 | `retire` 는 패턴 문법을 안 따진다 | 손으로 쓴 옛 행도 지울 수 있어야 한다 |
| T6 | `rename` · `merge` 의 행 고침은 **함수 치환**(`(구현하며 채운다)` 패턴 회피) · 대소문자만 다른 경로는 같은 파일로 본다(Windows) | 실제 사고 자리 |
| T7 | 「레벨 불일치」 는 `merge` 에서도 같은 규칙 — 두 문서의 행 레벨이 같고 `—` 가 아닐 때만 | 섹션이 겹친다(P3) |
| T8 | **판 올림 · CHANGELOG · `package.json` · push · 태그는 안 했다** — 다른 세션이 `package.json` · `CHANGELOG.md` 를 0.19.3 으로 만지는 중이라 그 두 파일은 커밋에 넣지 않았다 | 지시 · 사이트 시험이 둘의 일치를 본다 |
| T9 | 화면(콘솔 · 뷰어)은 만들지 않았다 · `cdp-screen-engineer` 는 안 썼다 | 등록부 행을 그리는 화면이 원래 없다(`viewer/src` 에서 `rules` 를 읽는 곳 0). 새 문서는 `docs/` 트리에 자동으로 뜬다 |

**남은 것(사람)** — 태그 때 CHANGELOG 절(이 기능을 v0.19.3 에 넣을지) · push · 실서버 upgrade · dpms_wiki 에서 `cdp-import` 로 PLC_CIMON_SCADA 문서를 **승인받아** 다시 들이기(용어집 + `term:*` 행) · 그때 `serve.log` 의 `등록부 add` 줄 확인.

