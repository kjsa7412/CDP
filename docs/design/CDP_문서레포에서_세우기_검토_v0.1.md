# 기존 문서 레포에서 지식 레포 세우기 — 검토 v0.1

> 2026-10-12 · 운영자 — 「dpms_wiki 를 기존 문서를 기반으로 세우는 작업을 정식 기능으로」 · 「10.26 대조 전에 처리 · 권장안으로」.
> 사례 — [dpms_wiki 세팅 검토 v0.1](CDP_dpms_wiki_세팅_검토_v0.1.md)(§10 실행 결과 · §11 정본 둘) · 도구 `ops/out/live/`(build2 · verify2 · follow · update · cur).
> 실행 TODO — [`docs/dev/문서레포_세우기_TODO.md`](../dev/문서레포_세우기_TODO.md). 결정은 권장안으로 닫았다.

## 0. 한 줄

**원천 문서 레포가 지도(`cdp-sources.json`)를 갖고, `ctx seed` 가 그 지도대로 지식 레포를 세우고 대조하며, `ctx update` · `ctx follow` 가 정본 둘을 잇는다.** 판정(큐레이션)은 지금 스킬 그대로 — 기계는 옮기기만 한다.

## 1. 빈자리

| 있는 것 | 하는 일 | 문서 레포에서 세울 때 |
|---|---|---|
| `ctx repo new --records-from` | 옛 **지식 레포**의 기록 · 첨부 · 어휘를 옮긴다 | 원천이 지식 레포가 아니다 |
| `ctx import-dir` | md 를 **통째로 · 좌표 없이** 기록으로 · 로컬 레포에 | 관리 문서 · 섹션 · 서버 레포가 없다 |
| `ctx baseline extract · push` | 기계 추출 블록 | 테이블 · 코드뿐 |
| `ctx rebuild snapshot` | 근거 없는 섹션을 원문 기록으로 | 섹션이 있어야 한다 |

dpms 에서는 그 사이를 손 도구(build2 등 · 600줄)가 메웠다. 같은 일을 다음 프로젝트가 다시 짜지 않게 한다.

## 2. 무엇이 일반이고 무엇이 프로젝트 것인가

| 층 | 일반(제품) | 프로젝트(지도에) |
|---|---|---|
| 분류 — 문서마다 관리 문서 · 기록 · 들이지 않음 | 지도의 형식 · 검사 · 초안 만들기 | 어느 파일이 무엇인가 · 좌표 타입 · 서식 · 종류 · 별칭 |
| 섹션 쪼개기 | 세 모양 — `h2`(`## 값 — 설명`) · `whole`(문서 전체 좌표 하나) · `chapters`(`## n. 제목` → 값 표) · 머리말 버리기 / `개요` 섹션으로 | 문서마다 어느 모양 · 장 값 표 |
| 원문 다듬기 | 옛 이력 줄 걷기(정규식 목록) · 겹 링크 접기 · 상대 링크를 새 자리로 · 들이지 않는 대상은 글자만 | 이력 줄 정규식(기본값 있음) |
| 세우기 | 기준선 → 이관(등록부 행 · 서식 · 종류 · 어휘 · 섹션 · 첨부) → 스냅샷 → 기록(원문 · 출처 sha) · 전 단계 dryRun · 멱등 id | — |
| 대조 | 섹션 같음 / 형식 차이(지도의 `intent`) / 확인 필요 | 형식 차이 목록 |
| 정본 둘 잇기 | 바뀐 섹션만 좌표로 · 업데이트 기록 초안 · 「왜」 없으면 거절 · 누락 점검 | — |
| 판정 | **기계가 하지 않는다** — cdp-curate · cdp-registry · cdp-rebuild | — |

## 3. 결정

| # | 물음 | 권장안(닫음) | 까닭 |
|---|---|---|---|
| S1 | 지도는 어디에 | **원천 문서 레포 루트의 `cdp-sources.json`** — 그 레포와 같이 커밋된다 | `update` 는 그 레포를 고친 세션(어느 PC 든)이 부른다 — 지도가 원천 옆에 있어야 한다. 지식 레포에는 지식만 둔다(v1.0 I9) |
| S2 | 지도 형식 | JSON 하나 — `version` · `source.root`(문서 폴더) · `rules`(이력 줄 · 겹 링크 · 머리말) · `docs[]` · `records[]` · `ignore[]` · `alias{}` · `intent{}` | build2 의 표 그대로라 dpms 를 그대로 옮긴다. 손으로 고치기 쉽다 |
| S3 | 엔진 자리 | **CLI(`ctx seed`) — 서버의 기존 쓰기 길만 부른다**(MCP `save` · `/api/<레포>/assets` · `/baseline` · `/snapshot`). 새 서버 API 는 없다 | 권한 · 검사 · 커밋 · 미러가 그대로다. 서버 판이 낮아도 돈다(스냅샷 링크 고침만 서버 판을 탄다) |
| S4 | 명령 | `ctx seed check · plan · apply · verify` · `ctx follow` · `ctx update` | 아래 §4 |
| S5 | 지도 초안 | `ctx seed init` 은 **뼈대만** — md 목록 · `##` 헤딩 모양으로 `split` 짐작 · `작업문서/` · 회의록 · 보고는 기록 후보 · 서식은 제목이 같은 것을 후보로. **분류의 판단은 큐레이터 세션(cdp-seed 스킬)과 사람** | 「초안」 이라는 이름 · 상태 줄만으로는 대상인지 판단인지 못 가른다(dpms 에서 「초안」 은 미정이 아니었다) |
| S6 | 스킬 | 큐레이터 **`cdp-seed`**(새 · 지도 쓰기 → check → plan → apply → 스냅샷 → cdp-curate 로 판정 → verify) · writer 는 **cdp-save 에 「원천 문서 레포를 고쳤으면」 절**(`ctx update`) | writer 스킬을 늘리지 않는다 — 업데이트 기록도 작업 기록이다 |
| S7 | 스냅샷 | apply 가 이관 뒤 **스스로 부른다**(기록 편입 앞 — 세팅 검토 §5.2 의 순서) | 순서를 틀리면 기록이 닿은 섹션의 원문이 원천에서 빠진다 |
| S8 | 판정 | apply 는 큐레이션 save 를 하지 않는다 — 끝에 「대기 n · cdp-curate 로」 를 말한다 | day 0 의 실수(기계가 읽지 않고 reflect)를 되풀이하지 않는다 |
| S9 | 기록 id · 날짜 | 지도가 정한다(사람이 고른 원래 날) · 이관 기록 id 는 `<날>-이관-<key>` · 다시 돌리면 같은 id 는 E_EXISTS 로 건너뛴다(멱등) | 반쯤 돌다 멈춰도 다시 부르면 이어진다 |
| S10 | 첨부 | 지도의 `figs`(폴더) · `attach`(파일) — 그림 · pdf · html. 본문이 안 가리키는 첨부는 기록 끝에 「첨부 —」 줄 | HTML 시각 자료(v0.25)까지 같은 길 |
| S11 | follow · update 의 비교 | 같은 쪼개기(§2) + 이력 줄 걷기로 커밋 앞뒤를 견준다 — 이력 줄만 바뀐 것은 섹션 변경이 아니다 | dpms 에서 이력 줄 하나로 거짓 변경이 났다 |
| S12 | 「왜」 | `ctx update --save` 는 「## 왜」 가 비면 거절 | 정본 둘의 이유 — 위키가 「왜」 를 갖는다 |

## 4. 명령

```
ctx seed init   --from <문서 레포> [--root <폴더>]                 지도 뼈대를 쓴다(cdp-sources.json · 있으면 거절)
ctx seed check  --from <문서 레포>                                지도 검사 — 파일 있나 · 좌표 · 섹션 수 · 링크 대상 · 겹침 · 들이지 않은 md
ctx seed plan   --from <문서 레포> --server <주소> --repo <레포>    전 단계 dryRun — 문서 · 섹션 · 기록 · 첨부 · 경고
ctx seed apply  --from … --server … --repo … [--stage baseline|managed|snapshot|records] [--only <key|id>]
ctx seed verify --from … --clone <지식 레포 클론> [--at <sha>]      섹션 대조 — 같음 · 형식 차이(intent) · 확인 필요 · drift · 대기
ctx follow      --from … --clone … [--since <sha>]                커밋마다 바뀐 섹션 ↔ 그 뒤 위키 기록 — 누락
ctx update      --from … <from sha> [<to sha>]                    업데이트 기록 초안(.cdp-updates/<sha>.json — 문서 레포의 .gitignore)
ctx update --save <초안> --server … --repo … [--go]                「왜」 확인 → dryRun → save
```

토큰은 `CDP_TOKEN`(apply · plan 은 큐레이터 · update 는 writer). `--from` 을 안 주면 지금 폴더의 git 루트.

## 5. dpms 옮기기

- build2 의 표를 `C:\sjinc\dpms\dpms_docs\cdp-sources.json` 으로 옮긴다(`ctx seed check` 통과 · `ctx seed verify` 가 verify2 와 같은 숫자).
- 작업 레포 규칙(`C:\sjinc\dpms\CLAUDE.md`)을 `node …ops/out/live/update.mjs` → `ctx update` 로. 서버 판(Release)이 나오기 전에는 이 PC 의 `node C:\project\CDP\viewer\bin\ctx-cli.mjs` 로 부른다.
- `ops/out/live/` 의 손 도구는 남겨 둔다(기록) — 새로 쓰지 않는다.

## 6. 하지 않는 것

- 판정 · 섹션 다시 쓰기 자동화 — 스킬과 사람.
- 원천 문서 레포에 쓰기 — 읽기만(git show · archive).
- xlsx · hwp · pptx 의 내용 — 첨부까지만(내용은 사람이 md 로).
- 지식 레포 → 문서 레포 생성(정본 전환) — 별도 검토.

## 7. 시험 · 판

- 단위 — 지도 검사 · 쪼개기 세 모양 · 이력 줄 · 겹 링크 · 링크 다시 잇기 · 섹션 비교(follow) · 업데이트 초안 · 「왜」 거절.
- 통합 — 임시 git 문서 레포(문서 둘 · 기록 둘 · 그림) → 로컬 서버 → `seed apply` → 대기 · 스냅샷 · verify 같음.
- dpms 실측 — 리허설 서버에 `ctx seed apply` → verify2 와 같은 숫자.
- 판 — 기능이라 minor(v1.3.0). 태그 · push · 실서버 upgrade 는 사람.
