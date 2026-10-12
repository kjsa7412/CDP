# dpms_wiki 세팅 TODO — dpms_docs 8c4a26b 로 관리 문서 · 작업 기록을 세운다

> 검토 — [`../design/CDP_dpms_wiki_세팅_검토_v0.1.md`](../design/CDP_dpms_wiki_세팅_검토_v0.1.md)(2026-10-12 · 권장안으로 닫음).
> 앞 판 — [`../design/CDP_dpms_검증계획_v0.1.md`](../design/CDP_dpms_검증계획_v0.1.md) · 도구 `ops/out/live/build.mjs` · `verify.mjs`(dpms 의 것 — 레포에 넣지 않는다).
> **이번 세션은 검토 · TODO 까지**다. 실서버 쓰기(①-3 부터)는 운영자가 「실행」 을 말한 뒤. push · 태그는 사람이.

---

## 지금 어디까지 됐나

| | 무엇 | 상태 |
|---|---|---|
| ⓪ | 검토 · 분류(md 35 → 관리 11 + 기준선 2 · 기록 22 · 들이지 않음 3) | **완료** |
| ① | 도구 — build2 · verify2 · follow | 할 일 |
| ② | 리허설 — 로컬 서버에서 A~H | 할 일 |
| ③ | 실서버 A~D — 기준선 · 이관 · 스냅샷 · 기록 | 운영자 「실행」 뒤 |
| ④ | 실서버 E~G — 큐레이션 · 머리말 · 경위 이관(큐레이터 폴더 · 스킬) | ③ 뒤 |
| ⑤ | H — 대조 · 검증 계획에 적기 · 운영 넘기기 | ④ 뒤 |

---

## ① 도구 — `ops/out/live/`

원본 — `git -C C:\sjinc\dpms\dpms_docs archive 8c4a26b "01. 산출물"` 를 `ops/out/live/dpms_docs-8c4a26b/` 에 푼다(작업 사본의 커밋 안 된 `_메일.txt` 를 막는다). build2 의 `SRC` 를 여기로.

### build2.mjs(build.mjs 를 고친다)

- [ ] `DAY0` = 실행일 · 모든 `source` 에 `dpms_docs@8c4a26b/01. 산출물/<경로>`
- [ ] **DOCS** — 검토 §3.1 표 그대로. 바뀌는 것:
  - [ ] `gw` — `whole` 을 빼고 `type: '게이트웨이설계'` · 장 → 값 표(검토 §3.1 · `개요` 는 첫 `##` 앞의 머리 — 제목 줄만 빼고 판 · 상태 · 근거 · 표기) · 헤딩 `<값> — <원래 장 제목>` · 별칭 「프로그램설계 §n」 · 「게이트웨이 설계서」
  - [ ] `arch` — 이관 기록에 `3.1_설계_전체아키텍처/DPMS_3.1.1_시스템구성도.html` 첨부(`text/html`) · 링크 고치기에 이 경로 → `work/assets/<이관 id>/DPMS_3.1.1_시스템구성도.html`
  - [ ] 머리말은 지금처럼 걷는다 — 뜻 있는 줄은 F 에서 `cdp-registry` 가 `edits` 로
- [ ] **RECORDS** — 검토 §3.2 표 그대로. 바뀌는 것:
  - [ ] 경로 셋 — SCADA기술질의서 `2.1_분석_요구사항분석/DPMS_2.1.3_SCADA기술질의서.md`(id `2026-1011-SCADA기술질의서-발송본` · 날 `2026-10-11`) · 인프라 `2.1_…/DPMS_2.1.5_인프라보안제약확인서.md`(id `2026-1011-인프라보안제약확인서`) · GDI `2.2_분석_현황분석/DPMS_2.2.3_GDI프레임워크분석서.md`(id 그대로)
  - [ ] 새 기록 다섯 — DID발주처협의질의서(10-11) · 현장연동시험_확인사항(10-11) · SCADA연계_질의응답정리(10-11) · SCADA기술질의서_Q2보강안(10-12) · v0.2제안(id `2026-1011-SCADA연계규격-v0.2제안` · 해설.html 첨부)
  - [ ] touches — 검토 §3.2 의 「touches(대표)」 를 문서를 읽고 좌표로 확정한다(cdp-save ② 「이 기록이 바꾼 것만」 — 참조 · 언급은 넣지 않는다). 옛 `프로그램설계:게이트웨이` 를 쓰던 자리는 `게이트웨이설계:<장>` 으로
  - [ ] `wait` 필드는 이제 build2 가 쓰지 않는다(판정은 E 의 일) — 지운다
- [ ] **stageCurate 를 지운다** — 판정은 스킬(E)
- [ ] 링크 고치기 표 — 옮긴 경로(통합_이동내역 7 · 8차) · 들이지 않는 문서(킥오프 TODO · 통합_이동내역 · xlsx)는 글자만 · 축약 → 1주차 기록
- [ ] `--dry` 는 모든 save 를 `dryRun: true` 로만 — 단계마다 「섹션 · 경고」 한 줄
- [ ] 단계 이름 `baseline` · `managed` · `records`(스냅샷은 build2 가 하지 않는다 — C 는 `ctx rebuild snapshot` 또는 `cdp-rebuild`)

### verify2.mjs(verify.mjs 를 고친다)

- [ ] `SRC` 를 8c4a26b 로 · PAIRS 에 `게이트웨이설계`(장 → 섹션 값 표로) · 문서 전체 좌표 다섯(범위 · 요구사항 · SCADA 규격 · API) 대조
- [ ] 다름을 셋으로 — **늦음**(dpms_docs 가 나중 커밋에서 바뀌었는데 기록 없음 · follow 와 같이 본다) · **일부러**(G 뒤 이슈 · 게이트웨이 개요) · **틀림**
- [ ] 이슈는 표 칸(유형 · 진행상태 · 처리 담당 · 완료 예정)과 결론 줄로 견준다 — G 뒤 본문은 다르다
- [ ] `drift` 합계 한 줄 · 대기 · 미반영 · 회신 대기 기록 수(따로)

### follow.mjs(새로)

- [ ] 입력 — 지난 점검 sha(처음은 8c4a26b) · dpms_docs HEAD
- [ ] 커밋마다 바뀐 `01. 산출물` 파일 → 위키 좌표(DOCS · RECORDS 표) → 그 날 이후 그 좌표를 `touches` 한 위키 기록이 있나(MCP `where`)
- [ ] 출력 — 커밋 · 메시지 · 좌표 · 기록 있음/**누락** · 누락 비율. 서버에 쓰지 않는다

## ② 리허설 — 로컬

- [ ] 로컬 서버 하나(v1 리허설처럼 `npm run ctx -- serve …` · 새 data 폴더 · 포트 7392) · 빈 틀 레포 `dpms_wiki` · 토큰 파일
- [ ] A~D 를 build2 로(`CDP_BASE=http://127.0.0.1:7392`) — 각 단계 `--dry` 먼저
- [ ] C — `npm run ctx -- rebuild snapshot --server http://127.0.0.1:7392 --repo dpms_wiki --dry` → 89 확인 → 실행
- [ ] 통과 — verify2 섹션 124/124 같음 · `check` 오류 0 · `drift` 근거 없음 0 · 대기 22
- [ ] E~G 맛보기 — `ops/out/v1-rehearsal/curator-folder` 의 `cdp.json` 을 7392 로 돌려 묶음 1 · G 묶음 1 을 스킬로 한 번(판정표 모양 · 섹션 diff 크기 · 걸린 시간을 적는다)
- [ ] 걸린 것 · 고친 것을 이 TODO 「나온 것」 에

## ③ 실서버 A~D — 운영자 「실행」 뒤

환경 `CDP_BASE=http://10.10.20.188:7374` · `CDP_REPO=dpms_wiki` · 토큰은 사용자 환경변수 `CDP_TOKEN`(kjsa · 파일에 쓰지 않는다 — build2 가 `process.env.CDP_TOKEN` 을 먼저 읽게).

- [ ] 시작 sha 를 적는다 — `brief` 의 `sync.head`(20a86a2 이어야 한다 · 아니면 멈춘다)
- [ ] A 기준선 — `--dry` → 실행 → HEAD · 미러 ok
- [ ] B 이관 11 — `--dry` → 실행 → HEAD · 미러 ok
- [ ] C 스냅샷 — `ctx rebuild snapshot --server … --repo dpms_wiki --dry` → **사람 승인**(뜰 좌표 89) → 실행. 또는 큐레이터 폴더에서 「cdp-rebuild dpms_wiki — 근거 없는 섹션 스냅샷」
- [ ] D 기록 22 — `--dry` → 실행 → `brief` 대기 22
- [ ] 단계마다 멈추면 — 검토 §7 「되돌리기」 첫 줄(사람 · sudo)

## ④ 실서버 E~G — 큐레이터 폴더 `C:\sjinc\dpms_curator`

Claude Code 를 그 폴더에서 연다(kit e729f8 · 스킬 여섯). 지시는 한 줄씩.

- [ ] **E 묶음 1~5** — 「cdp-curate dpms_wiki <기록 id …>」(묶음 표는 검토 §5.2). 묶음마다 판정표 · 섹션 diff · dryRun → 승인 → save. 「dpms_docs 에 없음」 으로 반영한 사실은 따로 센다
- [ ] **E 묶음 6** — 대기 셋(v0.2 제안 · 질의응답정리 · Q2 보강안)은 판정하지 않는다. `queue` 에 남는 것만 확인
- [ ] **F** — 「cdp-registry dpms_wiki — 머리말 정리」: 문서 넷의 머리말에 뜻 있는 줄을 `edits` 로(사업계획서분석서 「기준 문서 · 값은 계획서 기준」 · 이슈 대장 「공식 양식으로 옮기기 전 작업본」 · 아키텍처 「절 구성」 · 프로그램사양서 · 화면설계서 「짝 문서」). 기록 `tags: ["registry"]`
- [ ] **G** — 「cdp-rebuild dpms_wiki 이슈 대장」: `drift({ doc })` → 비대 섹션 → 묶음 둘(SCADA 연계 01 · 02 · 03 / 범위 · 운영 04 · 08 · 14). 묶음마다 경위 기록(원문 그대로 · `경위이관`) save → 재큐레이션(정본 자리는 검토 §5.2 · 「사라지는 사실」 0 · `rebuild` · 진단 합계 한 줄) → 승인 → save
- [ ] 끝마다 `brief` — 대기 3 · 미반영은 SCADA 규격 · 이슈 01 · 02 쪽만

## ⑤ H — 대조 · 넘기기

- [ ] `C:\sjinc\dpms\dpms_wiki` pull → verify2 · `drift({ repo })` · `check` · `/next`(「시작하기」 남은 일)
- [ ] 작업 레포 하나(`C:\sjinc\dpms\dpms_gateway`)에서 `cdp-work` — 「명령 처리」 를 물어 `게이트웨이설계:명령처리` 가 주입되는지
- [ ] 큐레이터의 세팅 기록 하나(`cdp-save` · keep 거리 — 무엇을 어떤 순서로 · sha · 숫자)
- [ ] 검증 계획에 새 day 0 절(§6) — 숫자 표 · 다음 대조 날(day 0 + 14) · 통과 기준(검토 §6 표)
- [ ] 메모리 `project-dpms-validation` 갱신

---

## 나온 것

- (리허설 · 실행 때 채운다)
