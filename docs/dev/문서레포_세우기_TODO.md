# 문서 레포에서 세우기 TODO — `ctx seed` · `ctx follow` · `ctx update`

> 검토 — [`../design/CDP_문서레포에서_세우기_검토_v0.1.md`](../design/CDP_문서레포에서_세우기_검토_v0.1.md)(S1~S13 · S13 은 운영자 결정 — 세우는 흔적은 `_seed.json`).
> 운영자 지시(2026-10-12) — 10-26 대조 전에 처리 · 권장안으로. 커밋까지 — push · 태그 · 실서버 upgrade 는 사람이.

| | 무엇 | 상태 |
|---|---|---|
| ⓪ | 앞선 결함 셋(암묵 전환 · 스냅샷 링크 · 종류 칸) | **완료** — 4a6a185 |
| ① | `core/seedmap.js` — 지도 · 쪼개기 · 다듬기 · 링크 · 섹션 비교 | **완료** — 3d68ebe |
| ② | `ctx seed` init · check · plan · apply · verify | **완료** — 3d68ebe · `_seed.json` 으로 바꿈(이 커밋) |
| ③ | `ctx follow` · `ctx update` | **완료** — 3d68ebe |
| ④ | 스킬 cdp-seed · cdp-save 절 · 설명서 셋 · 사이트 스킬 7 | **완료** |
| ⑤ | 시험 · dpms 리허설 | **완료** — 아래 · dpms_docs 에 지도 넣기는 남음 |
| ⑥ | 판 v1.3.0 · CHANGELOG | 남음(사람이 판을 올릴 때) |

## 한 것

- **core/seedmap.js** — `parseSeedMap` · `checkSeedMap` · `docSections`(h2 · whole · chapters · 머리말 · 부록 건너뜀) · `dropHistory` · `collapseNested` · `linkTable` · `relink`(장 문서는 앵커를 뗀다) · `coordMap` · `expandTouches`(`@<key>`) · `normForCompare`
- **ctx seed** — init(뼈대 짐작) · check · plan(전 단계 dryRun · 기록은 「앞 단계 뒤 통과」) · apply · verify(같음 · 형식 차이 · 확인 필요 · 위키에 없음 · drift · 대기)
- **apply = 세운 자리 `_seed.json`**(S13) — 서버 `save` 에 큐레이터 입력 `seed: { at, from, note?, record? }`
  - 구조(record 없음) — 기록 파일 없이 등록부 · 어휘 · 섹션(`applied: null`) · 첨부를 쓰고 좌표를 `_seed.json` 의 sections 에
  - 기록(record: true) — 함께 들이는 기록을 쓰고 id 를 records 에(판정 없이 반영됨 · 0699ec7 의 parseSeed)
  - `/api/<레포>/baseline` 도 `seed` 를 넘긴다 — 기준선 기록도 남지 않는다
  - 정본 스냅샷 단계는 없앴다 — 세운 섹션의 근거는 `_seed.json` 의 sections(drift)
- **ctx follow** — 커밋마다 바뀐 섹션(이력 줄만 바뀐 것은 아님) ↔ 그 날 뒤 그 좌표를 건드렸거나 출처로 그 커밋을 가리킨 기록 · 누락 비율
- **ctx update** — 초안 `.cdp-updates/<sha>.json` · `--save` 는 「## 왜」 확인 → dryRun → `--go`
- 시험 — `test/seedmap.test.mjs`(7) · `test/seed-cli.test.mjs`(임시 문서 레포 + 서버 하나로 끝까지) · 전체 432/434(남은 둘은 이 PC 의 tar · symlink 권한 — 전부터)

## dpms 리허설(로컬 7392 · dpms_docs@dbc46ef · 지도는 build2 표를 옮긴 것)

| | 값 |
|---|---|
| 기록 파일 | 22(편입한 판단 기록만 — 이관 · 기준선 · 스냅샷 기록 0) |
| `_seed.json` | records 22 · sections 124 · from `dd@dbc46ef` |
| verify | 같음 124/124 · 대기 0 · 근거 없음 0 · 검사 오류 0 · 링크 대상 없음 1(원본 버튼 표기) |
| drift | 비대 2(이슈 ISS-01 · ISS-14 — 진짜 대장) · 종류 칸 덕에 대상 섹션 오탐 0 |
| 다시 apply | 커밋 0(멱등) |

## 남은 것

- [ ] dpms_docs 루트에 `cdp-sources.json`(ops/out/live/cdp-sources.json — `target` 넣기) · `.gitignore` 에 `.cdp-updates/` — dpms_docs 커밋은 사람의 승인 뒤
- [ ] `C:\sjinc\dpms\CLAUDE.md` 규칙을 `node C:\project\CDP\viewer\bin\ctx-cli.mjs update …` 로(판이 나오면 `ctx update`)
- [ ] 판 v1.3.0 · CHANGELOG · 실서버 upgrade(서버의 `seed` 입력 · view 대기 · 종류 칸 · 스냅샷 링크가 서버 판을 탄다)
- [ ] 이슈 섹션을 표 칸으로 견주는 verify(지금은 intent 로 둔다)

## 나온 것

| # | 무엇 | 어떻게 |
|--:|---|---|
| ① | 이관 직후 `/snapshot` 이 마지막 문서(화면설계서 20 섹션)를 못 봤다 — `store.view` 가 save 뒤 다시 읽기를 기다리지 않고 옛 스캔을 냈다 | 서버 수정(view 가 진행 중인 다시 읽기를 기다린다) · 3d68ebe. 지금은 스냅샷 단계 자체가 없다 |
| ② | 「미리보기」 에서 기록은 늘 「어휘에 없는 좌표」 로 거절된다 — 앞 단계를 안 쓰므로 | plan 은 그것을 「앞 단계 뒤에 통과할 것」 으로 낸다 |
| ③ | follow 가 범위의 **시작** sha(`a..b` 의 a)를 그 커밋의 기록으로 셌다 | 출처는 `커밋 <sha>` · `@<sha>` · `..<sha>` 만 |
| ④ | 운영자 결정 S13(다른 세션이 0699ec7 · dpms_wiki 정리 adafbbb) — 세우는 흔적을 기록으로 남기지 않는다 | save 의 `seed` 입력 · apply 를 그쪽으로 · 스킬 ⑤ 를 「읽기」 로 |
| ⑤ | 첨부를 동시에 올리면 Windows 에서 서버 staging 의 rename 이 EPERM | apply 는 하나씩 올린다. 서버의 동시 올리기는 개선 후보(staging 이름 경합) |
| ⑥ | verify 가 실서버 dpms_wiki 의 ISS-02 를 「확인 필요」 로 냈다 — 다른 세션이 v0.2 제안을 반영하며 결정표를 지금(링 버퍼 미사용)으로 고쳤고, dpms_docs ISS-02 결정표는 아직 「R2(링 버퍼) 권장 유지」 | dpms_docs 내부 어긋남(같은 이슈의 10-11 경과와 모순) — dpms_docs 쪽 정정은 사람이 정한다 |
