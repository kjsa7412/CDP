# 어휘를 큐레이터가 고친다 — TODO

검토: [어휘_큐레이터_검토.md](어휘_큐레이터_검토.md) (R1~R15)

- [x] T1 `core/vocabops.js` — 순수 함수 `planVocab(text, ops, { today })`. add(옛 `addVocab` 이전) · update · retire · restore · rename(어휘 쪽). 결과 `{ text, added, updated, retired, restored, renamed, skipped, newTypes, warnings }`. CRLF 보존
- [x] T2 검사 — 후속 있음 · 고리 없음(R4) · alias 겹침(R9) · update 는 label/aliases 중 하나 · rename 의 `to` 는 없어야 한다
- [x] T3 `core/vocab.js` — alias 색인 살아 있는 좌표 먼저(R10) · `successorChain`
- [x] T4 `core/save.js` — 스키마(op 별) · `curatorOnly`(R2) · viewer `need`(R14) · 4단계를 `planVocab` 로 · rename 의 문서 쪽(헤딩 · 참조 · `_seed.json`, R6 · R7) · 태그 `registry`(R13) · 응답 `vocabOps` · `vocabSkipped`
- [x] T5 `core/tools.js` — `match` · `where` 의 `deprecated` · `successor` · `successorLatest`(R11)
- [x] T6 `core/check.js` — deprecated-coord 는 폐기일 뒤 기록만(R12)
- [x] T7 `core/edits.js` 거절 문구 · save 의 새 타입 경고(R15)
- [x] T8 `viewer/bin/ctx-mcp.mjs` — `vocab` 스키마(op · successor · reason · to · strict) · CARD(save · saveCurator · match · where)
- [x] T9 스킬 `cdp-registry` 「좌표(어휘)」 절 — 행 폐기 ↔ 좌표 폐기 구분 · `cdp-curate` 하지 않는 것 표 · `CLAUDE-큐레이터.md`
- [x] T10 시험 `test/vocabops.test.mjs` — dpms_wiki 표의 세 작업 모양 · writer/viewer 거절 · op 없는 기존 좌표 경고 · match/where 후속
- [x] T11 전체 시험 · CHANGELOG(Unreleased) · 커밋

## 나온 것

| 항목 | 정한 것 | 왜 |
|---|---|---|
| 기존 좌표를 op 없이 | 거절이 아니라 경고 + `vocabSkipped`(R8) | writer 기록 · `source update` 초안 · 세우기 재실행이 이미 있는 좌표를 같이 보낸다 — 거절하면 기록이 막힌다 |
| alias 겹침 | update · rename 은 E_INPUT · add 는 경고(R9) | 실레포의 옛 겹침으로 세우기 · 편입이 막히지 않게 |
| 판정 시점 | 저장 뒤의 어휘 하나로(후속 · 고리 · 겹침) | 한 save 안에서 옛 좌표의 alias 를 걷고 새 좌표에 거는 순서를 따지지 않게 |
| restore | 더했다(R5) | 잘못 폐기하면 `edits` 가 누구에게나 막혀 돌아올 길이 없다 |
| rename 의 범위 | 타입이 달라도 되나 섹션이 있으면 같은 문서 · 레벨만(R7) · `_managed.md` 의 참조는 바꾸지 않는다 | 섹션이 문서를 몰래 건너가지 않게 · 등록부는 `managed` 로 |
| 기록 태그 | 새 태그 없이 `registry` 를 서버가 붙인다(R13) | `vocab` 을 시스템 태그로 만들면 실레포의 사람 기록이 대기열에서 빠진다 |
| deprecated-coord | 폐기일 **뒤** 기록만 — 같은 날은 세지 않는다 | 날 단위라 같은 날의 앞뒤를 모른다 · 폐기 save 의 기록이 자기 경고를 내지 않게 |
| 판 · 태그 | CHANGELOG 「(다음 판)」 절까지 — 판 올림 · 태그 · push 는 사람 | 운영 규칙 |
| 시험 | 새 시험 13 ✓ · 전체 449 ✓ 2 ✗(tar NFC · symlink EPERM — 바꾸기 전 트리에서도 같다) | |
