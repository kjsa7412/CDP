# 문서 레포에서 세우기 TODO — `ctx seed` · `ctx follow` · `ctx update`

> 검토 — [`../design/CDP_문서레포에서_세우기_검토_v0.1.md`](../design/CDP_문서레포에서_세우기_검토_v0.1.md)(S1~S12 권장안으로 닫음).
> 운영자 지시(2026-10-12) — 10-26 대조 전에 처리 · 권장안으로. 커밋까지 — push · 태그 · 실서버 upgrade 는 사람이.

| | 무엇 | 상태 |
|---|---|---|
| ⓪ | 앞선 결함 셋(암묵 전환 · 스냅샷 링크 · 종류 칸) | **완료** — 4a6a185 |
| ① | `core/seedmap.js` — 지도 읽기 · 검사 · 쪼개기 · 다듬기 · 링크 · 섹션 비교 | 할 일 |
| ② | `viewer/bin/ctx-seed.mjs` — init · check · plan · apply · verify | 할 일 |
| ③ | `ctx follow` · `ctx update` | 할 일 |
| ④ | 스킬 cdp-seed(큐레이터) · cdp-save 절(writer) · 설명서 · CLI 도움말 | 할 일 |
| ⑤ | 시험 · dpms 지도 옮기기 · 리허설 실측 | 할 일 |
| ⑥ | 판 v1.3.0 · CHANGELOG | 할 일 |

## ① core/seedmap.js

- [ ] `loadSeedMap(root)` — `cdp-sources.json` 읽기 · 모양 검사(E_INPUT 에 필드)
- [ ] `docSections(doc, text, rules)` — `h2` · `whole` · `chapters` · 머리말 `drop` / `section:<값>` · `skip` 접두
- [ ] `tidy(text, rules)` — 이력 줄 걷기(정규식 목록 · 기본값) · 겹 링크 접기
- [ ] `relink(text, src, out, map)` — 원천 경로 → 관리 문서 · 기록 · 첨부 · 들이지 않는 것은 글자만 · 버튼 표기 그대로
- [ ] `coordMap(doc, text, rules)` — follow · update 의 비교(이력 줄 걷은 뒤)
- [ ] `checkSeedMap(map, files)` — 파일 있나 · 좌표 · 겹침 · 기록 id · 들이지 않은 md 목록

## ② ctx seed

- [ ] init — 뼈대(md 목록 · split 짐작 · 기록 후보 · 서식 후보) · 있으면 거절
- [ ] check — ① 의 검사 · 문서별 섹션 수 · 기록 touches 가 지도의 좌표인가
- [ ] plan / apply — 단계 baseline → managed(종류 · 서식 · 어휘 · 섹션 · 첨부) → snapshot(서버 `/snapshot`) → records · `--dry` = 전 save dryRun · E_EXISTS 는 건너뜀(멱등) · 끝에 대기 n
- [ ] verify — 클론을 읽어 섹션 대조(intent) · drift · 대기 · 미반영

## ③ follow · update

- [ ] follow — `--since` · 커밋마다 바뀐 좌표 · 판단 문서 변경 · 위키 기록 있음/누락 · 비율
- [ ] update — 초안 `.cdp-updates/<sha>.json` · `--save` 는 「## 왜」 확인 → dryRun → `--go`

## ④ 문서

- [ ] `agent/skills/cdp-seed/SKILL.md`(큐레이터 kit) · cdp-save 「원천 문서 레포를 고쳤으면」 절
- [ ] 큐레이터 설명서 새 장 · 관리자 설명서(명령) · CLI 도움말

## ⑤ 시험 · 실측

- [ ] `test/seedmap.test.mjs` · `test/seed-apply.test.mjs`(임시 git 문서 레포 → 로컬 save)
- [ ] dpms 지도 `C:\sjinc\dpms\dpms_docs\cdp-sources.json` — check 통과 · 리허설 apply → verify 가 앞선 숫자와 같다
- [ ] `C:\sjinc\dpms\CLAUDE.md` 규칙을 `ctx update` 로

## 나온 것

- (구현 중에 채운다)
