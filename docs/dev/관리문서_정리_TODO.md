# 관리문서 정리 TODO — 안 쓰는 관리 문서를 보고 · 지우고 · 끊긴 연결을 같이 닫는다

> 운영자 요청(2026-10-01) — 「프로그램내에서 관리문서 관리가 가능해야 할 듯하다. 패키지를 써서 관리문서를 가져왔는데 안쓰는 애들이 존재한다. 이때 삭제했으면 하고 연결관계도 잘 정리해줬으면 한다.」 **권장안으로 진행.**
> 짝 문서 — [`../design/CDP_관리문서_정리_검토_v0.1.md`](../design/CDP_관리문서_정리_검토_v0.1.md) (실측 Q1~Q10 · 문제 K1~K8 · 결정 N1~N12).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림(v0.22.0 후보 · 사이트 시험이 둘의 일치를 본다) · 실서버 upgrade · dpms_wiki 실제 정리는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 | **완료** — 이 커밋 |
| ① `docrefs` · `docusage` · `check` 둘 | 할 일 |
| ② `drop` · `save` · `edits` · MCP | 할 일 |
| ③ 화면 | 할 일 |
| ④ `ctx docs` (모드 A) | 할 일 |
| ⑤ 시험 · 스킬 · 설명서 | 할 일 |

---

## 0. 전제 — 닫혔다

- [x] 지우는 자리는 `save.managed[]` 의 `op: "drop"` · admin · 파일을 만지기 전에 권한(N1)
- [x] 실제 좌표 섹션 · `touches` 이력이 있으면 거절 — `merge` · `retire` 안내(N2)
- [x] 등록부 행 · 생성 블록 · 그 문서로만 가던 예시 좌표는 drop 이 같이(N3)
- [x] 나머지 참조는 `E_INPUT { refs }` → `edits` · `reviewed` · 같은 묶음 안 참조는 뺀다(N4)
- [x] 검사 둘은 warn(N6) · 화면은 `save`(`dryRun`)만 부른다(N10)
- [x] 판 올림 · push · 태그는 하지 않는다(N12)

---

## ① core — 참조 · 사용 현황 · 검사

- [ ] `core/docrefs.js`
  - [ ] `docKeys(path, title)` → `{ path, no, name }` — `no` 는 `tools.docNo` 를 옮겨 와 같이 쓴다 · `name` 은 파일명(또는 `# 제목`)에서 번호 · `_` 를 뗀 것
  - [ ] `findDocRefs({ files: Map<path,text>, keys: [...] })` → `[{ file, line, text, key, kind: 'link'|'code'|'prose', suggest }]`
    - 링크 대상 경로(상대경로 풀기 · `#` 꼬리 떼기) · 백틱 안이 열쇠와 같거나 열쇠 + 공백으로 시작 · 백틱 밖 이름은 그 줄에 백틱 참조가 없을 때만 `prose`
    - `cdp:registry` 생성 블록 · 머리 표 `등록부` 칸 · `_managed.md` 규칙 행은 **빼고**(기계가 닫는다) · `work/` 는 넘기지 않는다
    - `suggest` — 표 행이고 그 행의 열쇠가 이 문서 하나뿐 → `drop-row` / 링크 → `unlink` / 그 밖 → `review`
  - [ ] 대상 파일 = `docs/**.md` · `_vocab.md` · `_managed.md` · 뿌리 `*.md` − `toollayer.TOOL_FILES` − `INDEX.md`
- [ ] `core/docusage.js` — `docUsage(r, { gitLog })` → 문서마다 `{ kind, required, sections:{real,example}, touchedBy, mentionedBy, refsIn, lastChange, state }`(검토 §4.6)
  - [ ] `required` — 머리 표 `필수 제출` 칸 · 없으면 `null`
  - [ ] `lastChange` — `git log --name-only --format=…` **한 번**으로 전부(문서 40개에 git 40번 금지)
- [ ] `core/check.js`
  - [ ] `registry-missing`(warn) — `registry.rules[].doc` 가 `byPath` 에 없다 · 문구: 「`managed: retire` 나 `drop` · 손으로는 그 행을 지운다」
  - [ ] `doc-ref-dangling`(warn) — 없는 `.md` 링크 · 레포에 없는 번호의 백틱 · 「지운 관리 문서」 표에 있는 이름의 백틱

## ② save · managed · edits · MCP

- [ ] `core/managedops.js` — `OPS` 에 `drop` · `need: ['doc']` · `isRestructure` 에 포함(admin)
  - [ ] 계획: 파일 삭제 · 그 문서를 가리키는 **모든** 행 삭제 · 그 행들이 받던 예시 좌표(`example:`) 삭제(그 좌표가 다른 행에 걸리면 두지 않는다 — 걸리면 안 지운다) · 「지운 관리 문서」 표에 한 줄(표가 없으면 `_managed.md` 끝에 만든다)
  - [ ] 거절: 실제 좌표 섹션(`E_INPUT { realSections }`) · `touches` 이력(`E_INPUT { touchedBy }`) — 문구에 merge · retire
  - [ ] 경고: `필수 제출 예` · 비대상 문서의 `lastChange`
  - [ ] 같은 save 의 다른 op 가 그 문서를 만들거나 옮기면 `E_INPUT`(한 save 안 모순)
- [ ] `core/save.js`
  - [ ] 4.5 등록부 뒤 · 6단계 앞에 **refs 단계** — 지울 문서 전부의 열쇠로 `findDocRefs` · 같은 묶음 안의 파일에서 나온 줄은 뺀다 · `edits` 가 그 줄을 고쳤거나 `reviewed` 에 `파일:행` 이 있으면 통과 · 남으면 `E_INPUT { refs }`
  - [ ] `dryRun: true` — 검증 · 계획 · refs · (가능하면) 검사까지 하고 `Snap` 으로 되돌린 뒤 `{ dryRun: true, plan, refs, warnings }` · 커밋 · 미러 0
  - [ ] 응답 `managedChanges` 에 `{ op: 'drop', doc, rules: [...], examples: n }` · `serve.log` 한 줄
- [ ] `core/edits.js` — `editableFile` 이 뿌리 `*.md` − 도구 층 − `INDEX.md` 를 받는다
- [ ] `viewer/bin/ctx-mcp.mjs` — zod `op` enum · `dryRun` · 명함 문구(save 설명 · docs 의 `usage`) · **도구 수 14 그대로**
- [ ] `core/tools.js` `toolDocs` — 목록 각 문서에 `usage`

## ③ 화면

- [ ] 서버 — `/api/<repo>/docs` 에 `usage` · 저장은 기존 save 경로(`POST` 가 없으면 MCP 와 같은 `saver` 를 부르는 얇은 경로 하나 — admin 만 · `dryRun` 허용)
- [ ] `viewer/src/components/admin/Docs.jsx`(새) · `AdminView` 메뉴에 「관리 문서」(server · local 둘 다 보기)
  - [ ] 표 — 번호 · 문서 · 유형 · 필수 · 섹션(실제 · 예시) · 작업 · 참조 · 마지막 변경 · 필터(쓰는 중 · 서식 그대로 · 필수) · 검색
  - [ ] 실제 섹션 · touches 이력 있는 행은 체크 불가 + 까닭 툴팁
  - [ ] 묶음 제안 — 같은 번호 앞 두 자리(`TE_20x`)를 하나 고르면 「같은 묶음도 고를까」
  - [ ] 미리보기(`dryRun`) → 지울 것 · 고칠 자리(라디오: 행 지우기 · 링크만 풀기 · 알고 둔다) · 사유(필수) → 지운다 → 결과(커밋 · 남은 언급)
  - [ ] writer · viewer — 표만 · 단추 없음(없는 상태를 그리지 않는다)
- [ ] `viewer/src/console/Repos.jsx` 새 레포 — 패키지를 고르면 「문서 고르기」 펼침(기본 전부) · 뺀 것이 있으면 세운 뒤 같은 drop save · 결과에 남은 언급 수
- [ ] 브라우저 실측 — 개발 서버에서 dpms 레포 세우기 → TE_201~203 빼기 → 탭에서 이관 3벌 지우기 · 스크린숏을 TODO 「나온 것」 에

## ④ 모드 A

- [ ] `ctx docs` — 사용 현황 표 · `--json`
- [ ] `ctx docs drop <문서…> [--dry-run] [--reason …]` — 같은 `planManaged` · refs 는 목록으로 보이고 `suggest` 가 `drop-row` · `unlink` 인 줄은 `--apply-suggest` 일 때만 고친다 · 커밋 안 함

## ⑤ 시험 · 문서

- [ ] `test/docrefs.test.mjs` — dpms 패키지 그대로: TE_202 의 참조가 검토 Q5 의 여섯(기계가 닫는 셋 제외)과 같다 · 이관 3벌 묶음이면 서로의 참조가 빠진다 · 생성 블록 · `work/` 제외
- [ ] `test/save-drop.test.mjs` — 권한(writer → E_FORBIDDEN, 파일 안 만짐) · 실제 섹션 거절 · touches 거절 · refs 거절 → `edits` 로 통과 · `reviewed` 로 통과 · 묶음 · 비대상 문서 · 지운 기록 표 · `dryRun` 은 트리 · 커밋 무변화 · 검사 실패 롤백(파일 되살아남)
- [ ] `test/check.test.mjs` — `registry-missing` · `doc-ref-dangling`
- [ ] `test/docusage.test.mjs` — 예시만 있는 문서 = `서식 그대로` · 섹션 하나 쓰면 `쓰는 중`
- [ ] 패키지 셋의 `ctx package check` 가 새 경고 0건
- [ ] 하네스 — 서버형 dpms 레포에서 drop 한 바퀴(번호는 이어서)
- [ ] 스킬 — `cdp-managed` 「문서 정리」 · `cdp-save` 【등록부 변경】 「지울 문서 · 고칠 자리」 · `retire` · `merge` · `drop` 표
- [ ] 패키지 README 셋 「첫날」 — 서버형 · 셸 나란히 · 「2를 빠뜨리면 조용하지 않다」 고침
- [ ] 설명서 — `manual/` 관리자 · 사용자 · `agent/manual` · 설계서 MCP §4.5 · 사이트 사실(기능 목록)
- [ ] `node --test test/*.test.mjs` 초록 · 하네스 ✗ 0

---

## 나온 것

| 언제 | 무엇 | 왜 그렇게 |
|---|---|---|
| 2026-10-01 | 검토 v0.1 · 이 TODO | 결정 N1~N12 는 전부 권장안 — 검토 §7 |
