# CDP v1.0 개편안 — 쓰는 길 하나 · 관리 문서는 큐레이션으로만 · 레포에는 지식만

> **2026-10-06 · 운영자 지시** — 「구조적으로 한 번만 더 검토해라. 에이전트 세팅(스킬), 프로그램(viewer) 구조 등 메이저 버전을 올린다는 생각으로 개편안을 작성해라.」
> **근거 — 다섯 갈래 조사(읽기 · 실측) + 실서버 사용 실측.** ① 에이전트 세팅(스킬 7 · CLAUDE 서식 · 설명서) ② 코어 · MCP · save ③ 화면(viewer) ④ 배포 · 설치 · 패키지 ⑤ 데이터 모델 · 불변조건. 실서버(10.10.20.188:7374, v0.23.0)의 `/admin/{overview,repos,users,workrepos}` 를 읽었고, gdi 의 생성기(`C:\project\gdi_wiki_gen`)를 봤다. 수치 옆의 (추정)은 손으로 센 값이다.
> **상태 — 개편안 · 운영자 지시로 개발 진행.** 결정은 권장안으로 닫았다([§11](#11-결정--권장으로-닫는다)). 짝 문서 `docs/dev/v1.0_개편_TODO.md`. dpms_wiki 는 운영자 지시대로 **다시 세운다**(§9.1).
> **이어받는 것** — [`CDP_관리문서_파생_검토_v0.1.md`](CDP_관리문서_파생_검토_v0.1.md)(문제) · [`CDP_큐레이터_모델_설계_v0.1.md`](CDP_큐레이터_모델_설계_v0.1.md)(모델 · K1~K12) · [`CDP_좌측메뉴_셸_설계_v0.1.md`](CDP_좌측메뉴_셸_설계_v0.1.md)(셸 · L1~L7) · 목업 [`CDP_큐레이터_모델_목업.html`](CDP_큐레이터_모델_목업.html). 이 문서가 그 셋의 **구멍을 메우고(§1.3) 셋을 한 판으로 묶는다.**

---

## 0. 한 줄

**v1.0 은 세 가지를 동시에 바꾼다 — 그래서 메이저다.** ① **쓰는 길은 서버 `save` 하나다** — 모드 A(PC 의 지식 레포 + git 훅 + stdio MCP)의 쓰기를 끝낸다. ② **관리 문서는 큐레이션으로만 바뀐다** — 사용자는 작업 기록만 쌓고, 큐레이터(레포별 권한)가 기록을 보고 반영하고, 기계(기준선 생성기)는 추출 블록만 갈아 끼운다. 늦은 반영은 막지 않고 **도구가 미반영 기록을 섹션과 함께 낸다.** ③ **레포에는 지식만 둔다** — 도구 층 · 훅 · 스킬 사본 · 색인 · 등록부 사본 · 서식 예시가 레포에서 나간다. 그 결과로 **스킬 3,837줄 → ≈1,250줄 · MCP 도구 14 → 12 · 설치 · 갱신 길 16 → 3 · 산출물 3 → 2 · 서버 tar ≈14MB → ≈3MB · 레포마다 커밋되던 1.7MB 번들 → 0 · writer 한 작업의 스킬 맥락 ≈52k자 → ≈15k자**(추정). 판은 **v0.26(토대) → v0.27(큐레이터) → v1.0.0(전환 · 제거)** 셋으로 나눠 탄다. dpms_wiki 는 빈 레포에 작업 기록만 옮겨 큐레이션부터 다시 세운다.

---

## 1. 왜 메이저인가 — 실측

### 1.1 실제로 어떻게 쓰이고 있나

| 잰 것 | 값 | 출처 |
|---|---|---|
| 지식 레포 | **2** — dpms_wiki(관리 문서 39 · 기록 14 · 좌표 104) · gdi(관리 문서 86 · 좌표 1,133) | `/admin/repos` |
| 사용자 | 활성 2 — admin 1(kjsa) · viewer 1(hong). writer 0 | `/admin/users` |
| 최근 save 10건 | **전부 서버 경로**(모드 B) · 한 번에 3.8~5.1초 | `/admin/overview` |
| 작업 레포 설치 | 2 — 둘 다 설치 한 줄(모드 B) | `/admin/workrepos` |
| 모드 A 지식 레포 | `C:\project\gdi_wiki`(마지막 커밋 2026-10-02) — 서버 `gdi` 의 옛 로컬 사본 | 로컬 |
| **gdi 관리 문서의 원천** | 화면설계서 310 섹션 · 테이블 · 코드 · 용어 등 대부분을 **프로젝트 밖 생성기**(`gdi_wiki_gen`, Python 34개)가 운영 DB · 소스 · 매뉴얼에서 뽑아 「`### 기준선`」 블록으로 찍었다. 생성기는 「작업 기록이 쓴 섹션(applied ≠ null)은 덮지 않는다」 를 **스스로** 지킨다 | `gdi_wiki_gen/run_baseline.sh` · `gen/gen_tables.py` |

> 마지막 줄이 이 개편의 숨은 사실이다. **관리 문서의 원천은 작업 기록 하나가 아니라 셋이다** — 작업 기록(사건 · 결정) · 큐레이터의 판단(정본 · 현재형) · **추출(코드 · DB 에서 기계로)**. 제품은 첫째만 알고, 셋째는 프로젝트가 제품 밖에서 규칙을 지어 가며 하고 있다. dpms_wiki 의 「GDI-CLEAN 기록 7.3KB → 섹션 48KB」(파생 검토 §2.1)도 실은 DB 추출을 작업 기록 이름으로 넣은 것이다.

### 1.2 다섯 갈래에서 나온 것

| 층 | 실측 | 뜻 |
|---|---|---|
| **스킬** | 7종 **3,837줄 · 99,314자**. 파생 전용 ≈22% · 모드 A 전용 ≈12% · 예시 30% · 복제 ≈13%. writer 한 작업 단위(work + load + save) ≈51.8k자. 「섹션은 홀로 서야 한다」 33줄이 3곳에 바이트째 같다. 충돌 대처 규칙이 스킬끼리 **반대**다(load · work 「section 다시 읽기」 對 save · edit · import · managed 「detail.content 위에」). **cdp-save · cdp-push 의 설명이 YAML 파싱에 실패해 H1 만 실린다** | 큐레이터 모델의 writer 에게 필요한 몫은 ≈27% |
| **설명서** | `agent/manual` 2,198줄 중 **모드 A · 로컬 앱 41%** · 파생 필수 12% · **서버형 2%** | 실제 쓰는 길(서버형)이 거의 안 적혀 있다 |
| **코어 · 서버** | 진입점 7(로컬 뷰어 · CLI · 훅 · stdio MCP · HTTP 서버 · 설치기 둘 · exe). 검색 3벌(문턱이 다르다) · INDEX 2벌 · 상태 표기 2벌. `ctx-mcp-serve.mjs` 한 파일 2,491줄(한 클로저 1,518줄 · if 사슬 43 패턴). save 한 번에 loadRepo 3~4회 + **훅이 node 2회 더**(서버 save 커밋도 레포의 `bin/ctx` 훅을 돈다 — 40초 사례). MCP 레포 캐시가 `docs/` 하위 폴더 문서 변경을 못 본다(public-si 레포는 40/40 이 하위 폴더 · 추정 — 경로만 확인) | 같은 판정이 여러 벌 · 쓰기마다 검사가 세 번 |
| **배포** | 산출물 3 · **설치 · 갱신 길 16**. 서버 tar 의 ≈79% 가 같은 `ctx.mjs` 6벌. 작업 레포 kit 이 서버 번들이 아니라 **각 지식 레포의 `.claude/skills`** 에서 나와 upgrade 마다 레포마다 도구 층 커밋이 생기고 · 더럽거나 뒤처진 레포는 건너뛴다(옛 스킬이 계속 나간다). exe 72MB | 레포와 도구가 묶여 있다 |
| **데이터 · 원칙** | 불변조건 목록이 **3벌**(설계서 14 · 개발자 설명서 16 · system.md 14) — 번호가 서로 다르고 큐레이터 설계가 두 번호를 섞어 인용했다. 「섹션이 기록을 못 따라간 상태」 의 이름이 **8개**(밀림 · stale · 파생 누락 · derive-pending · 파생 남음 · pendingDerive · 미작성 · 미반영). 같은 사실의 저장이 8곳(등록부 사본 · INDEX · 예시 짝 …) | 말과 규칙이 갈라져 있다 |

### 1.3 큐레이터 설계 v0.1 의 구멍 — 코드로 확인

| # | 구멍 | 근거 | 그대로 가면 |
|---|---|---|---|
| H1 | 설계는 `derive-missing` 만 내린다. **`dangling-anchor` 도 error 다** | `check.js:230-241` — 기록의 touches 가 등록부 패턴에 걸리는데 섹션이 없으면 error · 실측: 기록만 담은 save 가 error 2건 | writer 가 **새 좌표**(가장 흔한 일)를 건드리면 여전히 `E_CHECK` |
| H2 | 레포 전체 오류가 모든 writer save 를 막는다 | gdi 의 `## rp_plnd_mst` 중복 동안 save 전부 `E_CHECK`(실서버 종합시험 F8) | writer 는 섹션을 못 고치니 **풀 길이 없다** |
| H3 | `applied` 를 무엇으로 쓰나 | `save.js:641` — 언제나 그 save 의 기록 id | 큐레이션 기록 id 가 들어가 「어느 기록까지 반영했나」 가 깨진다 |
| H4 | 관리 문서에 YAML `form:` 을 달면 섹션이 밀린다 | 섹션 줄은 프론트매터 뒤 기준(`frontmatter.js:200-201`) · 자르기는 전체 기준(`tools.js:103`) · 실측 3줄 어긋남 · `—` 문서 치환은 프론트매터를 지운다(`save.js:250-253`) | `section` · `E_CONFLICT.content` · 검색이 **조용히** 틀린다 |
| H5 | `pending` 에 구멍 둘 | 섹션이 없으면 `items: []`(`validity.js:130-145`) · 날짜 기준 `later()` 는 원문 날짜를 단 편입 기록 · 일부만 큐레이션한 묶음을 applied 앞으로 숨긴다 | 새 좌표의 기록이 주입에서 빠진다 — 새 보증이 깨진다 |
| H6 | 보증이 스킬에 걸려 있다 | 설계 §6 이 미반영 본문 싣기를 `cdp-load` 스킬 몫으로 적었다 | 「결정론적 보증은 검사뿐」 과 어긋난다 — LLM 의 선의에 기댄다 |
| H7 | K2(정본 작성자 하나)의 뒷문 | writer 의 `edits` 가 `docs/` 머리말 · 비대상 문서를 쓴다(`edits.js:31-35`) · 예약 태그와 `curates` 를 누구나 보낸다(`save.js:799`) | writer 가 자기 기록을 대기열에서 빼거나 정본 층을 고칠 수 있다 |
| H8 | 큐레이터 = 전역 admin | `auth.js:58-69` — admin 은 서버 전체 역할 | 큐레이션을 맡기려면 명부 · 토큰 · 서버 설정 권한까지 줘야 한다 |
| H9 | 훅과 레포 번들의 판 어긋남 | 서버 save 커밋이 레포 안 `bin/ctx check` 를 돈다(`git.js:362-374` · `pre-commit:32`) | kit 갱신을 건너뛴 레포는 **옛 `derive-missing` error 로 커밋이 실패**한다 |

> 이 아홉은 따로따로 고칠 수 있지만, 고치는 방향이 전부 같다 — **쓰기를 서버 한 곳으로 모으고(H2 · H7 · H9), 보증을 도구로 내리고(H5 · H6), 섹션 모양을 데이터로 정하고(H3 · H4), 역할을 레포별로 나눈다(H1 · H8).** 그것이 이 개편이다.

---

## 2. v1.0 원칙 — 불변조건 한 벌

세 벌을 하나로 합치고 **번호를 고정한다.** 이 목록이 정본이고, 설명서 · 스킬 · 코드 주석은 번호로만 가리킨다.

| # | v1.0 불변조건 | 옛 번호(설계서 S · system.md M) | 바뀐 것 |
|---|---|---|---|
| **I1** | 판정은 `core/` 한 곳에서 순수 함수로 한다. CLI · 서버 · 화면은 부르기만 한다 | S1 = M12 | 검색 · INDEX · 상태 표기의 사본을 지운다 |
| **I2** | **쓰기 길은 서버 `save` 하나다.** 한 번의 save 가 한 커밋이다 | (새) | 모드 A 쓰기 종료 |
| **I3** | `work/` 는 불변이다. 작업 기록은 사건이고 원천이다 | S3 = M1 | 큐레이션 · 기준선 기록도 `work/` 에 |
| **I4** | 좌표는 `_vocab.md` 에만 등재된다 | S4 = M5 | |
| **I5** | 좌표 하나에 정본 섹션 하나 — **사실 하나에 정본 자리 하나.** 다른 섹션은 좌표를 건다 | M2 | 확장 |
| **I6** | **관리 문서는 큐레이션으로만 바뀐다**(큐레이터 · 기준선). writer 는 기록만 쓴다 | M4 「파생 필수」 대체 | |
| **I7** | **미반영은 상태다. 섹션을 내보내는 모든 자리(도구 · 화면)는 그 섹션의 미반영 기록을 같이 낸다** — 보증은 도구가 한다 | S5 · M7 · M10 대체 | 「섹션이 최신이다」 → 「미반영이 함께 실린다」 |
| **I8** | 상태는 계산할 뿐 저장하지 않는다 — `status` 필드 · 대기열 필드 없음 | M6 · M7 | |
| **I9** | **레포에는 지식만** — 도구 · 사본 · 색인을 레포에 커밋하지 않는다 | (새) | 도구 층 · INDEX · 등록부 사본 제거 |
| **I10** | writer 의 save 는 **자기 변경분으로만** 막힌다 | (새) | H2 |
| **I11** | 서버는 LLM 을 부르지 않는다 · CDN · 인터넷 없음 | S12 = M13 · K12 | |
| **I12** | 기계는 merge 하지 않는다 · origin 으로는 미러가 민다 | S10 · S11 | |
| **I13** | 정렬은 상태를 보지 않는다 · 읽는 경계에서 개행 정규화 · 실패는 조용하지 않다 · 토큰 원문은 저장하지 않는다 · 빌드는 스스로 검증한다 | S8 · S9 · M14 · D16 · S13 | 유지 묶음 |

**죽는 원칙** — 「밀림이라는 상태는 없다」(설계서 §1.5①) · 「빈 섹션을 두려워하지 말라」(수행 §3.4) · 「미반영을 별도 용어로 만들지 않는다」(수행 §6.4) · 「결정론적 보증은 git 훅 하나」(M10).

---

## 3. 운영 모델 — 누가 무엇을 쓰나

### 3.1 원천 셋 · 역할 넷

```
                 ┌───────────── 작업 기록 work/ (불변 · 원천) ─────────────┐
 writer 세션 ──save(work)──▶ 기록 ──▶ 대기열 ──▶ 큐레이터 세션(cdp-curate) ──save(curation)──┐
 (cdp-work · cdp-save)                                 판단 · 정본 · 현재형                     │
                                                                                               ▼
 생성기(프로젝트 스크립트) ──save(baseline)── 코드 · DB · 매뉴얼에서 기계로 ──────▶ 관리 문서 docs/
                                                                                  섹션 = 정본 서술
 읽는 쪽(사람 · 에이전트) ◀── section / load ── 섹션 + 기준선 블록 + 미반영 기록 ◀────  + 기준선 블록
                                                                                     + 경과
```

| 역할 | 범위 | 할 수 있는 것 |
|---|---|---|
| **viewer** | 레포별 | 읽기 · 검색 · 주입 |
| **writer** | 레포별 | + 작업 기록 save(기록 · 어휘 추가 · 첨부) |
| **curator** (새) | **레포별** | + 큐레이션 save(섹션 · 새 문서 · 등록부 행 · 이름 · 합치기 · 폐기 · 지우기 · 기록으로 둠) · **기준선** save · 서식집 |
| **admin** | 서버 | + 사용자 · 토큰 · 레포 세우기 · 서버 설정 · 감사. **admin 은 모든 레포의 curator 다** |

- **명부 모양** — 전역 `role`(viewer · writer · admin)은 그대로 두고 사람마다 **`curate: [레포]`** 한 줄을 더한다(`*` 는 전부). 판정은 `grantOf` 하나가 `curate(레포)` 를 낸다 — admin 은 늘 참, writer 는 목록에 있으면 참, viewer 는 거짓. 명부 모양을 갈아엎지 않아 옛 `auth.json` 이 그대로 돈다.
- **화면은 항목마다 권한을 단다** — 묶음 전체를 admin 으로 막으면 지금 writer 가 쓰는 기능(작업 레포 등록 · 설치 한 줄 · 내려받기 · 관리 문서 사용 현황 읽기)이 갈 곳을 잃는다(화면 조사 §2.5 A). 메뉴 항목마다 `need: read | write | curate | admin` 이고, 막는 것은 언제나 서버다.
- **운영자가 앞서 물은 것 — 「일반 사용자가 큐레이션하면 안 되는 이유가 있나」 의 답(V2)**: 막을 이유는 「아무나 문서를 세우면 이름 · 구조가 갈라진다」 하나이고, 그것은 **사람을 고르는 문제**지 역할을 writer 전체로 묶을 문제가 아니다. 그래서 큐레이터를 **레포별로 줄 수 있는 권한**으로 만든다 — admin 이 그 레포의 writer 중 누구에게나 준다(팀 리드 · 문서 담당). 반영과 구조를 가르는 안(앞 답변)은 버린다 — 가르면 「구조 필요」 왕복이 생기고 한 판단을 두 사람이 나눠 진다.

### 3.2 기준선 — 기계가 쓰는 자리를 제품이 받는다

gdi 가 제품 밖에서 이미 하고 있는 것을 제품 안의 **한 자리**로 만든다.

| | |
|---|---|
| 무엇 | 섹션 안의 **추출 블록** — `<!-- cdp:baseline src="운영 DB sy_pgm_info" asof="2026-10-02" -->` … `<!-- /cdp:baseline -->` |
| 누가 쓰나 | 기준선 save 만(curator 토큰을 가진 생성기) — `save({ baseline: [{ coord, body }], work: { tags: ["baseline"], source, … } })`. 블록을 **통째로 갈아 끼운다**(멱등) |
| 누가 못 쓰나 | 큐레이션 save 는 블록 안을 못 고친다(save 가 거절). 큐레이터의 서술은 블록 밖에 |
| 대기열 · 미반영 | 기준선 기록은 대기열에 안 들어가고 **미반영을 만들지 않는다**(310 화면을 매번 큐레이터에게 보내지 않는다). 블록의 `asof` 가 그 신선도다 |
| 생성기 | 프로젝트 것이다(도메인 · DB 가 프로젝트마다 다르다). 제품은 블록 형식 · save 입력 · `ctx baseline push <파일>`(JSON 을 save 로) 만 준다 |
| 왜 | ① 「GDI-CLEAN 7.3KB → 48KB」 같은 **추출을 작업 기록인 척하는 일**이 없어진다 ② 큐레이터가 300개 섹션의 컬럼 표를 손으로 옮기지 않는다 ③ gdi 생성기가 지키던 「applied ≠ null 은 덮지 않는다」 규칙이 블록 경계 하나로 바뀐다 |

### 3.3 하루의 흐름

| 누가 | 하는 것 | 막히는가 |
|---|---|---|
| writer | 작업 → `cdp-save` → `save(work)` → 「큐레이션 대기 n번째」 | 자기 기록의 형식 · 미등재 좌표로만(I10) |
| curator | 화면 대기열 → [에이전트 지시 복사] → 자기 PC 의 Claude Code(`cdp-curate`) → 판정표 + diff 승인 → `save(curation)` | 섹션 충돌(E_CONFLICT) · 구조 결함 |
| 생성기 | 야간 또는 손으로 → `ctx baseline push` | 블록 형식 |
| 누구나 | 섹션을 읽으면 **미반영 기록이 같이 온다**(화면 칩 · 도구 `pending`) | — |

---

## 4. 데이터 모델 v1.0

### 4.1 레포에 남는 것 · 나가는 것

| 남는다 | 나간다(레포에서) | 어디로 |
|---|---|---|
| `work/*.md` · `work/assets/<id>/` | `INDEX.md` · `INDEX-by-coord.md` | 화면 · 도구가 계산(읽는 스킬 · 도구 0) |
| `docs/**.md` | `CLAUDE.md` · `TEMPLATE-work.md` · `MANUAL*.md` ×3 | 서버 `/manual` · kit |
| `_vocab.md` · `_managed.md` | `.claude/skills/*` · `.claude/work-repo/` | 서버 번들 `kit/` |
| `README.md` · `.gitignore` · `.gitattributes` | `.githooks/` · `bin/ctx{,.mjs,.cmd}`(1.7MB) · `tools/` | 없앤다(I2 · I9) |
| | `관리번호.md` · 문서 머리 표의 `등록부` 칸 · `_vocab.md` 생성 블록(`regen.js`) | 화면이 `_managed.md` 에서 그린다 |
| | `(예시)` 섹션 · `example:` 어휘 · `## 작성지침` | 서식집(§8) |

### 4.2 작업 기록

| 필드 | 누가 | 규칙 |
|---|---|---|
| `id` · `title` · `date` · `author` · `source` · `touches` · `supersedes`(문자열만) · `attachments` · `tags` | 모두 | 지금과 같다. `touchesEmpty` 는 writer 기록에만 |
| **`curates: [{ id, verdict, into?, reason? }]`** | curator | 이 큐레이션이 다룬 기록과 **판정** — `verdict` 는 `reflect`(반영 · `into` 에 좌표들) · `new`(새 문서를 세워 반영 · `into`) · `keep`(기록으로 둠 · `reason`). **키가 있으면 큐레이션 기록이다**(태그로 가르지 않는다). 판정을 본문 표에만 두면 화면(S2 의 「반영됨 → 섹션」 · S4 의 판정 수)이 마크다운을 파싱해야 한다 — 데이터로 둔다. save 가 `into` 와 이번 `sections` 가 맞는지 본다 |
| **`baseline: { source, asof }`** | curator(생성기) | 기준선 기록 |
| ~~`status`~~ · ~~`{id, scope}` supersedes~~ · ~~`knowledge/` 층~~ | — | 지운다 |
| 예약 키 · 태그(`curates` · `baseline` · `registry` · `docs-prune` · `curate`) | curator 이상 | writer 가 보내면 `E_FORBIDDEN`(H7) |

### 4.3 관리 문서 · 섹션

```markdown
# 테이블정의서
<!-- cdp:form public-si/DE_431 -->            ← 서식 표지 — YAML 이 아니라 주석(H4). 화면은 칩으로 그린다

테이블의 지금 상태. 섹션 하나가 테이블 하나다.   ← 서식의 head 문단만

## sy_user_info — 사용자정보
<!-- applied: 2026-1006-SYA030-사원번호-직접입력 -->   ← 서버가 계산(§4.4) — 반영한 기록 중 가장 늦은 것

사용자 계정. 사원번호는 화면에서 직접 넣는다(SYA030) …     ← 정본 서술 · 현재형 · 큐레이터

<!-- cdp:baseline src="개발 DB pg_catalog" asof="2026-10-04" -->
| 컬럼 | 타입 | NULL | 키 | 설명 |                          ← 기준선 블록 · 생성기만
…
<!-- /cdp:baseline -->

**경과**                                                   ← 한 줄씩 쌓는다. 본문을 일지로 만들지 않는다
- 2026-10-06 [`GDI-CLEAN-베이스`](…) 테이블 가져옴
- 2026-10-06 [`SYA030-사원번호-직접입력`](…) `emp_no` 를 화면 입력으로
```

| 규칙 | |
|---|---|
| 헤딩 | `## <값> — <설명>` · 레벨은 `##` 하나로 통일한다(`###` 는 DE_421 · fixture 둘뿐 · `—` 문서 전체 레벨은 사용 0 — 지운다) · 분류는 `<!-- 분류 -->` 주석 |
| 서식 표지 | `<!-- cdp:form <묶음>/<번호> -->` H1 바로 아래 한 줄. 모르는 id 는 `check` info |
| 문서 종류 | 문서에 적지 않는다 — **서식 머리의 `kind:`** 에서 온다(§8.1). 서식 없이 만든 문서는 종류가 없다 |

### 4.4 계산값 — 저장하지 않는다(I8)

| 값 | 정의 | 어디 |
|---|---|---|
| **대기열** | 작업 기록 − (`curates` 키 · `baseline` 키 · registry · docs-prune 기록) − ⋃ curates. 오래된 순. 기록마다 좌표를 넷으로: 섹션 있음 · 등록부 있음 · 섹션 없음 · 등록부 없음 · **좌표 0** | `core/judge/curation.js` |
| **미반영(pending)** | `later(applied, C) ∪ (대기열 ∩ C 를 건드린 기록)` — 섹션이 없어도 같은 규칙(H5). `later()` 는 하나로 유지 | 같은 곳 |
| **섹션 상태** | `ok` · `pending`(+ 목록) · `missing` 셋 | 같은 곳 |
| **applied** | 큐레이션 save 의 `curates` 중 `into` 에 그 좌표가 있는 기록의 **가장 늦은 것**(날짜 → id). 서버가 쓴다 · 클라이언트가 보낸 값은 낙관 잠금으로만 쓴다(H3) | `core/plan/` |
| **기록의 큐레이션 상태** | `대기` · `반영됨 → [좌표]` · `기록으로 둠(사유)` — 그 기록을 다룬 가장 늦은 큐레이션 기록의 판정 | `core/judge/curation.js` |
| 같은 날 동배(`peers`) · `derive-sameday` | **지운다** — 대기열 합집합이 그 틈을 덮는다 | |

### 4.5 이름 — 용어 v1.0

| 쓴다 | 버린다 |
|---|---|
| **작업 기록** | 지식공유문서 · 지식 단위 · 작업문서 |
| **큐레이션 기록 · 기준선 기록 · 전환 기록**(이행 때 한 번 남기는 큐레이션 기록) | 파생 정리 기록 · (설계 v0.1 의) 「기준선」 — 이 이름은 추출 블록에 준다 |
| **관리 문서 · 섹션 · 정본**(한 사실이 적히는 유일한 섹션) | 정본 문서 · 「원본 파일」 뜻의 정본 |
| **반영** · **미반영** · **대기열** · **판정**(반영 · 새 문서 · 기록으로 둠) | 파생 · 따라잡기 · 밀림 · stale · 파생 누락 · derive-pending · 파생 남음 · pendingDerive · 미작성 |
| **서식 · 서식집 · 묶음** · **기준선(추출 블록)** | 패키지 · 템플릿 · 서식 예시 |
| **큐레이터**(레포별 권한) | |

정본은 `docs/용어.md` v1.0 한 곳 — 스킬 · 설명서 · 화면 문구가 이 표를 따른다.

---

## 5. 서버 · 코어 v1.0

### 5.1 모듈 배치

```
core/            순수 — 판정은 여기 한 곳(I1)
  errors.js · layout.js(예약 키 · 태그 · 레포 틀)
  model/   frontmatter · vocab · registry · sections · repopath · visuals
  judge/   validity · curation(새) · check · docrefs · docusage
  plan/    save 단계 계획 · managedops · edits · docdrop · baseline(새) · forms(새) · migrate(새 — 옛 레포)
  read/    where · section · work · search · docs · queue(새) · forms(새) · brief
node/            I/O 껍데기
  repo/    scan · loadRepo · RepoCache(키 = HEAD sha + 더러움 · 도구 · 화면 공용)
  git/     git · mirror · lock · gitauth
  write/   save(단계 함수) · commit(--no-verify) · assets
  ops/     reponew(빈 틀 하나) · formslib · kit
server/          main · router · auth/(레포별 역할) · mcp(역할별 등록) · routes/{api, curate, admin, kit, site, install} · log
cli/             사람용 출력만 — 계산은 core/read
```

| 지금의 부채 | v1.0 |
|---|---|
| `ctx-mcp-serve.mjs` 2,491줄 · 라우트 if 사슬 · CLI(`runAuthCmd`)까지 한 파일 | `server/routes/*` 로 라우트 그대로 옮긴다 — harness 번호 유지 |
| `store.js` 960줄에 조립 · 화면 view-model · git · 감시 · 검색 · check · `repoInfo()` 가 부를 때마다 check | 조립은 `node/repo`, view-model 은 `server/routes/api`, git 은 `node/git` |
| `CtxError` 가 읽기 도구 모듈에 있어 쓰기 모듈 9개가 `tools.js` 를 끈다 · 순수 판정(check → docrefs)이 `toollayer`(child_process)를 끈다 | `core/errors.js` · `core/layout.js` |
| 검색 3벌(문턱 0.67 對 ceil(0.7n)) · INDEX 2벌 · `normKey` 3벌 · `runBuiltinCheck` 인자 조립 4벌 · `titleOf` 2벌 | 각각 하나 |
| 캐시 둘 — MCP 스탬프가 `.git/HEAD` mtime(커밋 · ff pull 에 안 바뀐다) + 최상위 md 만 | **RepoCache 하나**(HEAD sha) — save 안에서도 재사용 |
| save 한 번 = loadRepo 3~4회 + 훅 node 2회 + 화면 재스캔 + MCP 재스캔 | 검사 한 번 · 커밋 `--no-verify`(save 가 같은 트리를 이미 검사했다 — H9 와 40초 사례가 같이 사라진다) |

### 5.2 save v1.0 — 역할이 입력을 가른다

| 입력 | writer | curator | 비고 |
|---|:--:|:--:|---|
| `work` · `vocab`(추가만) · `assets` | ○ | ○ | |
| `edits` | `work/` 밖 · `docs/` 밖만 — 사실상 README | ○ | H7 · `docs/` 는 정본 층 |
| `sections` · `managed`(add · rename · merge · retire · drop) | — | ○ | `managed.add` 에 `form` — 서버가 깨끗한 빈 문서를 찍는다(§8.1) |
| `work.curates` | — | ○ | 대상이 있고 · 큐레이션 · 기준선 기록이 아니고 · `into` 가 이번 `sections` 와 맞는지 |
| `baseline` · `work.baseline` | — | ○ | 블록만 갈아 끼운다 · 블록 밖 거절 |
| `examples: "purge"` · `migrate` | — | ○ | 옛 레포 이행용(§9) |

| 단계 | v1.0 |
|---|---|
| 판정 | **writer save 는 자기 변경분만** error — 필수 필드 · id · 미등재 좌표 · 예약 키(I10 · H2). 레포 전체 검사 결과는 경고로 응답에 싣는다(화면 · curator 몫) |
| `dangling-anchor` | 기록 쪽(touches 가 섹션 없는 좌표를 가리킴) → **대기열 분류**로 내린다(H1). 등록부 구조 결함(패턴이 없는 문서를 가리킴 등)만 error |
| `derive-missing` | info `curation-pending` · warn `curation-stale`(가장 오래된 대기 > 14일 · **curator · admin 에게만** — writer 응답에 매번 싣지 않는다) |
| applied | 서버가 계산(§4.4) |
| dryRun | 지금 그대로 — 큐레이터의 「판정표 + diff」 승인에 쓴다 |
| 커밋 | `--no-verify` · 훅 없음 |

### 5.3 MCP 도구 — 14 → 12, 역할별로 등록

서버는 요청마다 도구 묶음을 다시 만들고 그때 인증 결과를 들고 있다 — **역할에 없는 도구는 보이지도 않는다.**

| 도구 | v1.0 | viewer | writer | curator |
|---|---|:--:|:--:|:--:|
| `match` · `search` · `docs` · `check` · `repos` | 유지 · `docs` 에 서식 id | ○ | ○ | ○ |
| `work` | + `curates` · 큐레이션 상태(대기 · 반영됨 → 섹션 · 기록으로 둠) | ○ | ○ | ○ |
| `where` | 섹션 상태 셋 · 미반영 수 | ○ | ○ | ○ |
| **`section`** | + `state` · `pending[]` · `form` · **미반영 본문을 기본으로 싣는다**(기록당 상한 · 잘렸으면 절단 통보) · 본문의 좌표 참조를 **한 단계** 따라간 정본 섹션(상한 5) — H6 · I7 | ○ | ○ | ○ |
| `brief` | + `sync`(미러 · kit) · `version` 흡수 · 대기 n | ○ | ○ | ○ |
| `save` | 역할별 명함(writer 는 기록만 설명) | | ○ | ○ |
| **`queue`** (새) | 대기열 · 좌표 넷 분류 · 가장 오래된 나이 · 전환 기록 제안 | | | ○ |
| **`forms`** (새) | `{q}` 목록 · `{form}` head · guide · example | | | ○ |
| ~~`derive` · `apply` · `sync` · `version`~~ | `queue` · `section` · `brief` 로 | | | |

### 5.4 HTTP API — 화면용

| 엔드포인트 | 새 · 바뀜 | 판정 |
|---|---|---|
| `GET /api/<r>/repo` · `/status` | + `curation: { queue, oldestDays, pendingSections, last }` — **메뉴 배지의 재료**(`/me` 에 싣지 않는다 · 세션마다 볼 수 있는 레포 전부를 스캔하게 된다) | allow |
| `GET /api/<r>/docs` · `/docs/<id>` | 기록마다 `curation`(대기 · 반영됨 → 좌표 · 기록으로 둠) · 섹션마다 `state` · `pending[]`(id · 제목 · 날짜 · 작성자 · 첫 문단) · 문서의 `form` | allow |
| `GET /api/<r>/check` | 파생 누락 error 가 빠지고 대기 info · 14일 warn · 새 경고 | allow |
| `GET /api/<r>/queue` · `/queue/<id>` | **새** — 대기열(오래된 순 · 좌표 넷 분류) · 기록 하나의 판정 재료(걸린 섹션 · 등록부 없는 타입 · 비슷한 서식 · 정본 후보 · 본문에만 있는 좌표) | 목록 allow · 재료 curate |
| `GET /api/<r>/curations` | **새** — 큐레이션 이력(판정 표 포함) | allow |
| `GET /api/<r>/forms[/<id>]` | **새** — 서식 목록 · **서버가 실제로 찍을 빈 문서**(찍는 함수와 같은 함수) · guide · example | allow |
| `POST /api/<r>/curate` | **새** — 글을 안 쓰는 판정(기록으로 둠 · 전환 기록). 서버가 큐레이션 기록을 지어 같은 `save` 를 탄다(지금 `docs-drop` 과 같은 꼴) | curate |
| `/admin/repos` · `/admin/overview` | 대기 · 가장 오래된 열 · 패키지 열 · `/packages` 지움 | admin |

MCP 도구와 HTTP 가 같은 `core/judge/curation.js` · `core/plan/forms.js` 를 부른다(I1).

### 5.5 검사(check) v1.0

| 남는 error | 내리거나 지우는 것 | 새 경고(curator 화면) |
|---|---|---|
| 프론트매터 필수 · id · 미등재 좌표 · `orphan-applied` · 등록부 구조(겹친 패턴 · 레벨) · 기준선 블록 형식 | `derive-missing`(→ info) · 기록 쪽 `dangling-anchor`(→ 대기열) · `derive-sameday` · `registry-head` · `registry-prose` · `example-coord`(이행 뒤) · `index-stale` | `section-journal`(본문에 날짜 덩어리 3개 이상) · `derive-outgrows-source`(섹션 > 근거 기록 합 × 3, 기준선 블록 제외) · `curation-stale` · `form-unknown` |

### 5.6 모드 A — 쓰기를 끝낸다

| 지금(모드 A) | v1.0 |
|---|---|
| PC 의 지식 레포에 git 커밋 · pre-commit 훅이 `ctx check` | **없다.** 레포는 서버가 쓴다. PC 의 clone 은 읽기용 |
| stdio MCP(`ctx mcp` · 634줄 중 ≈120줄 고유) · `ctx setup`(로컬 갈래) | 없다 — 작업 레포는 늘 HTTP MCP |
| CLI 쓰기 명령(docs drop · examples --purge · apply · derive · setup · sync --pull) ≈328줄 | 없다. CLI 는 읽기 · 서버 관리(`serve` · `auth` · `forms` · `baseline push`)만 |
| 로컬 뷰어(`viewer/server` · `cdp.exe` · tray · SSE · git 라우트 · 로컬 전용 화면 6) | **없앤다** — 개인 서버가 같은 화면을 낸다. 로컬 전용 비용 ≈2,170줄(화면 881 · 서버 ≈1,093 · App 안 ≈200 · 추정)과 HTTP 라우트 두 벌(공유 14 · 로컬 전용 21)이 함께 사라진다 |
| 서버 없는 팀 · 한 사람 | **개인 서버** — `ctx serve --personal <레포 경로>`(127.0.0.1 · 명부에 나 하나 · admin · 첫 접속 주소의 일회용 토큰으로 로그인). 같은 코드 · 같은 save · 같은 화면 |

근거 — 실사용 0(§1.1) · 모드 A 전용 코드 ≈1,000~1,300줄 · 스킬 ≈1,050줄 · 설명서 ≈905줄(추정) · **K2 를 강제할 수 없다**(git 이라 누구나 docs/ 를 커밋한다) · 모드 A/B 갈래 때문에 생긴 실제 사고(하네스 111 — 모드 B 종료 보고에 「push 는 하지 않았습니다」 가 새어 나감).

---

## 6. 에이전트 세팅 v1.0

### 6.1 스킬 — 7 → 5

| v1.0 | 하는 것 | 누가 | 어디서 오나 | 목표 |
|---|---|---|---|---|
| **cdp-work** | 검토(대상 추출) → 주입(`section` 이 섹션 + 기준선 + 미반영 + 정본 한 단계를 준다) → 수행 | 모두 | cdp-work + cdp-load | ≤250줄 |
| **cdp-save** | 기록 세 길 — 이 세션의 작업 · 밖에서 온 문서 편입 · 문서 수정 지시. `work` · `vocab` · `assets` 만. **「기록은 홀로 선다」**(값 · 표 · 결정 · 제약은 본문에 · 큰 추출물은 첨부). 끝 보고에 대기 순번 | writer | cdp-save + cdp-import + cdp-edit 의 기록 쪽 | ≤300줄 + 참고 파일(편입 · 첨부) |
| **cdp-curate** | `queue()` → 묶기(같은 좌표 · 주제 · 섹션 50 이하) → 판정 → `forms()` → 섹션 쓰기 규칙(정본 한 곳 · 현재형 · 경과 한 줄 · 기준선 블록 밖에만 · 종류별 모양은 서식 guide) → 판정표 + diff(dryRun) 승인 → `save` | curator | cdp-managed ③ + 파생 검토 §4 + cdp-edit 의 반영 쪽 | ≤350줄 + 참고 파일(종류별 지침 · 예시) |
| **cdp-registry** | 등록부 행 · rename · merge · retire · drop · 전환 기록 · 옛 레포 이행 | curator | cdp-managed 의 정리 절 + cdp-save 【등록부 변경】 | ≤200줄 |
| **cdp-push** | 이 세션이 만진 파일만 커밋 · push(작업 레포 코드용) | 모두 | 그대로 · YAML 만 고친다 | ~150줄 |

없어지는 것 — cdp-load · cdp-import · cdp-edit · cdp-managed(흡수 · 분할).

### 6.2 쓰는 원칙

| # | 원칙 | 지금의 문제 |
|---|---|---|
| A1 | **모드 갈래가 없다** — 머리 블록 「본문의 호출은 MCP 도구다」 · 「도구가 없을 때」 · 모드 A 예시를 지운다 | 머리 블록 92줄 · 「도구가 없을 때」 138줄 · 모드 A 예시 ≈500줄 |
| A2 | **보증은 도구가 한다** — 스킬은 「`section` 이 준 미반영을 답에 적는다」 만 말한다 | H6 |
| A3 | **점진 공개** — SKILL.md 에는 절차와 판정 기준만, 예시와 드문 길은 같은 폴더의 참고 파일 | 예시 30% |
| A4 | **규칙 한 벌** — 판정표 · 승인 게이트 · `E_CONFLICT` 대처는 한 곳. 서버 오류의 `hint` 가 규칙을 말한다 | 승인 게이트 5벌 · 충돌 대처가 반대 |
| A5 | **설명은 YAML 안전하게 · 누가 쓰는 스킬인지 적는다** — 하네스가 프론트매터를 파싱한다 | cdp-save · cdp-push 실패 |
| A6 | **역할별 kit** — writer kit 에는 cdp-curate · cdp-registry 가 없다 · 큐레이터 폴더용 CLAUDE 블록 | 지금 writer 도 admin 연산 스킬을 받는다 |
| A7 | 문서 이름을 박지 않는다 — 「위험및이슈관리대장」 24곳 하드코딩 | 빈 레포로 시작하면 없는 문서 |

### 6.3 kit · CLAUDE 블록 · 설치

| | 지금 | v1.0 |
|---|---|---|
| kit 원본 | 각 지식 레포의 `.claude/skills`(upgrade 가 레포마다 커밋) | **서버 번들 `kit/`** — 해시도 번들에서. upgrade 직후 작업 레포 대장이 「낡음」 을 띄운다 |
| 작업 레포 CLAUDE 블록 | 75줄 — 절반이 모드 A(`cdp.json {knowledgeRepo}` · `bin/ctx` · 「쓰기는 도구에 없다」) | writer ≈30줄(도구 이름 · 세 스킬 · 「기록만 쓴다」) · curator 블록 따로 |
| 큐레이터 자리 | 「작업 레포가 아니어도 된다」 인데 설치기가 git · 대장 id 를 요구한다 | 설치 한 줄 `--curator <레포>` — git · 대장 등록 없이 폴더 하나 |

### 6.4 설명서

`agent/manual` 셋(2,198줄 · ≈55% 바뀜)을 역할별 넷으로 다시 쓴다 — **사용자(writer)** · **큐레이터** · **서버 관리자** · **개발자(system)**. 모드 A · 로컬 앱 서술(≈905줄)은 부록 「개인 서버」 하나(≤100줄)로. 루트 `manual/`(2,957줄) · 사이트 설명서 · 그림(`shots.json`)은 셸이 바뀌므로 같이 다시 찍는다.

---

## 7. 화면 v1.0

### 7.1 지금의 짐

| 짐 | 실측 | 뜻 |
|---|---|---|
| **메뉴 정의 셋 · 역할 판정 문법 넷** | TopBar `items` · `AdminView.MENU` · `Console.MENU` · `me.admin` · `me.write` · `data.write` · `info.admin` 이 약 열 곳에 | 역할별 메뉴를 지킬 자리가 없다 · 시험도 없다 |
| **App.jsx** | 1,295줄 · 일 12가지(데이터 첫 읽기 · 화면 상태 · 얼굴 안 라우팅 · 문서 이동 · 찾기/뻗어나가기 · 단축키 · 상단 바 포털 · 오버레이 · 화면 고르기 · 로컬 전용 · Landing · 탭 제목) · hook 75 | 셸이 가져갈 것(세그 · 화면 고르기 · Esc → 문서 · 테마)이 전부 여기 있다 |
| 관리(레포 하나) 對 콘솔(서버 전부) | 작업 레포 화면 셋(로컬 설치 289 · 서버 등록 288 · 콘솔 대장 149)이 다른 일인데 이름이 같다 · ui 부품 두 벌이 서로 import · 토스트 · 없는 탭 고침 · 재인증이 콘솔 안에만 | 셸로 올릴 것이 갈라져 있다 |
| 레포 세그 「관리」 | **판정 없음** — 서버형 모든 역할에 열린다(App.jsx:729-737) | |
| 데이터 읽기 세 갈래 | `useResource` 14파일 · 명령형 load · 직접 `then(set)` 7파일 · `api.base()` 가 주소의 레포에 묶임 | 콘솔 얼굴에서 다른 레포를 못 읽는다 |
| 창 기준 중단점 | 1280 · 1080 · 900(6곳) · 720 · 600 | 메뉴 232px 만큼 어긋난다 → `@container` |
| `app.css` 1,753줄 · 죽은 클래스 22 | | |
| 화면 시험 | 단위 시험 34 중 화면 0 · 브라우저로 화면을 모는 것은 `site/demo/capture.mjs` 뿐 | |

### 7.2 셸 — 좌측 메뉴 셸 설계 v0.1 을 이렇게 고쳐 받는다

| | 셸 설계 v0.1 | v1.0 |
|---|---|---|
| 권한 | 묶음 단위(큐레이션 · 레포 관리 · 서버 = admin) | **항목 단위 `need`** — 「연결된 작업 레포」 는 read 로 보이고 등록 단추만 write · 큐레이션 대기열 · 이력은 curate · 서식집은 curate · 서버 묶음은 admin. 묶음은 보이는 항목이 하나라도 있을 때만 |
| 메뉴 정의 | SideNav 안 | **`shell/nav.js` 한 표** — `{ key, group, label, icon, to(repo), match(rest), need, badge? }`. SideNav · 빵부스러기 · 없는 주소 · 권한 밖 주소 replace · 탭 제목이 이 표 하나를 쓴다 · React 를 import 하지 않아 `node --test` 로 역할 × 화면을 고정한다 |
| 역할 판정 | 곳곳 | **`lib/roles.js` 의 `can(me, need, repo)` 하나** |
| 배지 | `/me` | `/api/<r>/repo` 의 `curation`(App 이 이미 읽는 캐시) · 콘솔은 `/admin/repos` · 창 초점이 돌아오고 60초 지났으면 다시 |
| 접힘 | localStorage | + `index.html` 인라인 스크립트가 첫 페인트 전에 `data-nav` — 232 → 56 튐을 없앤다 |
| 찾기 목록의 범위 칩(관리문서 · 작업문서 · 좌표) | 메뉴와 겹친다 | **주소로 올리고 칩은 지운다** — `/r/<r>/` 문서 · `/r/<r>/w[?only=pending|mine]` 작업 기록 |
| 상단 ☰ 對 메뉴 « | 둘 다 | ☰ 는 760px 아래(덮개)에서만 |
| Esc → 문서 | App 의 단축키 | 지운다 — 메뉴가 길을 맡는다 · 모달 Esc 와 겹쳐 확인 창에서 화면까지 나가는 문제(추정)도 같이 사라진다 |
| 재인증 · 토스트 | 콘솔 안 · App 안 각각 | 셸로 |
| 로컬 얼굴 | 지식 + 레포 관리(로컬 항목) | **없다**(§5.6) |
| 색 | 목업이 초록(22곳) · 주황(10곳) | **색 예산 그대로** — 반영됨 · 최신은 무채색 · 대기 · 미반영은 이미 있는 보라(`--pending`) · 새 표지는 accent |

### 7.3 큐레이터 화면 S1~S9

| # | 화면 | 새 부품 | 고칠 부품 | 위험 |
|---|---|---|---|---|
| S1 | 문서 섹션의 「미반영 n」 | PendingChip · PendingBlock | DocView · `markdown.enhance` — 「섹션 머리에 배지를 붙이지 않는다」(DocView.jsx:188-201) 원칙을 뒤집는다 | 본문은 innerHTML 뒤 DOM 을 고치는 방식이라 칩은 섹션 제목 노드에 **포털**로 꽂는다 · 본문을 다시 그리면 노드가 바뀌므로 포털을 렌더 단위로 묶는다 |
| S2 | 작업 기록의 상태 | RecordStateChip | Finder · ValidityBlock | |
| S3 | 큐레이션 › 대기열 | CurationQueue · JudgeMaterials · 전환 카드 | | |
| S4 | 큐레이션 › 이력 | CurationLog | | |
| S5 | 큐레이션 › 서식집 | FormLibrary · FormView(만들어지는 문서 · 작성지침 · 예시) | | 미리보기는 서버의 찍는 함수가 그린 것 그대로 |
| S6 | 레포 관리 › 현황 | | admin/Overview 「문서 상태」 카드 → 큐레이션 카드 · 내려받기 zip 은 문서 화면의 빈 상태(Landing)로 | |
| S7 | 서버 › 지식 레포 | | console/Repos · Overview 에 대기 열 | |
| S8 | 서버 › 새 지식 레포 | | NewRepo(382-497) 의 패키지 · DocPick(344-381) 지움 | |
| S9 | 상태 표시줄 | | StatusBar 「대기 n」 · CheckView 는 종류를 가리지 않고 그려 그대로 | |

새 주소 — `/r/<r>/w[?only=pending|mine]`(read) · `/r/<r>/manage/curation`(curate) · `/r/<r>/manage/curation/log[/<id>]`(curate) · `/r/<r>/manage/forms[/<묶음>/<id>][?tab=]`(curate). 서버는 `/r/<r>/` 아래 새 주소를 고칠 것이 없다(SPA 를 낸다). 지금 App 은 관리 탭을 한 조각만 읽으므로 `shell/routes.js` 의 라우트 표가 필요하다. 권한 밖 주소로 오면 「권한이 필요합니다」 를 그리지 않고 `/r/<r>/` 로 replace(D4).

### 7.4 폴더

```
src/main.jsx
src/shell/      Shell · SideNav · AppBar · SiteBar · AccountMenu · nav.js · routes.js · keys · sudo
src/features/
  repo/         RepoProvider · RepoTools · StatusBar
  docs/         DocsScreen · Finder · Explore · DocView · DocNav · SectionRail · ValidityBlock · VisualFrame · Pending*
  graph/        CoordGraph(그대로 옮긴다)
  search/       Palette · CheckView
  curation/     Queue · Log · Transition
  forms/        FormLibrary · FormView
  repo-admin/   Overview · ManagedDocs · LinkedWorkRepos
  server-admin/ Overview · Repos · Users · Tokens · GitAuth · Ledger · Server · Audit
  site/         Landing · Manual · Login · Setup · NoRepo · NotFound · McpFlow
src/ui/         Card · Row · Mark · Modal · Confirm · Field · Chip · Toast · Icon
src/lib/        api(+ repoApi(name)) · router · session · cache · roles · labels · markdown · doclink · format · clip · clock · audit
src/styles/     tokens · base · shell · docs · finder · graph · admin · console · site
```

- **꼭 지킬 경로** — 공개 사이트(`site/`)가 import 하는 넷(`components/Icon.jsx` · `styles/tokens.css` · `styles/site.css` · `site/McpFlow.jsx`)은 옛 자리에 다시 내보내는 한 줄을 남긴다 · 시험이 import 하는 `lib/` 다섯(doclink · audit · clock · format · keys)은 그대로.
- **순서 — 표 → 셸 → App 쪼개기 → 큐레이션.** 셸을 깔기 전에 App 을 쪼개면 같은 화면을 두 번 뜯는다.
- **같이 고칠 것** — `site/demo/capture.mjs` 의 선택자 다섯 · `shots.json`(v0.19.2 로 이미 낡음) · 설명서의 글로 된 길 안내 56줄(링크는 주소가 그대로라 안 깨진다) · 화면 밖 문구 「콘솔 › …」 「관리 › 작업 레포」 ≈20곳(core · 설치기 · doctor · 스킬) — 이름에 주소를 같이 적는다(「서버 › 지식 레포(`/console/repos`)」).

---

## 8. 서식집 · 배포 v1.0

### 8.1 서식집

`agent/packages/*`(묶음 4 · 서식 79 · blank) → **`agent/forms/<묶음>/<번호>_<제목>.md`**.

```markdown
---
form: public-si/DE_431
title: 테이블정의서                # 관리번호 접두를 뗀 이름
number: DE_431                    # 관리번호 — 내보내기 틀이 쓴다
due: 설계완료                      # 제출시기
required: false
kind: 대상                         # 대상 · 대장 · 정의 · 사건 · 서술
registry:                         # 목록 — DE_501(인터페이스 + 배치) · TE_x02(UT-/PT-/IT-) 처럼 패턴이 여럿인 문서
  - { pattern: "테이블정의서:*", anchor: "## {값}" }
coordValue: 테이블 물리명(소문자)
---
<!-- form:head -->      새 문서로 가는 것 — 첫 문단(대장이면 빈 표 머리)
<!-- form:guide -->     큐레이터가 읽는 것 — 무엇 · 언제 · 누가 · 여기 적지 않는 것 · 작성지침 · 서술형의 골격
<!-- form:example -->   큐레이터가 읽는 것 — (예시) 섹션 · 표 속 예시
```

| | |
|---|---|
| 문서 종류 | **다섯** — 대상 · 대장 · 정의 · 사건 · **서술**. 서식 79종의 머리 표를 세면 등록부 대상 36(대상 · 대장 · 정의가 섞여 있다) · 서술 19(가이드 · 계획서 · 매뉴얼) · 사건 15 · 대장 8 · 기타 1 — 앞서 넷이라 했던 것에 서술이 빠져 있었다. 종류는 등록부 대상인지와 **다른 축**이다 |
| 새 문서 | `managed.add { form }` → 서버가 `# <title>` + 서식 표지 주석 + `form:head` **만** 찍는다. 예시 · 작성지침 · 관리번호 표 · `applied: null` 은 가지 않는다 |
| 변환 | 79/79 가 같은 머리 모양 · `## 작성지침` 이 79/79 에서 마지막 `##` → **기계 변환 53종 · 규칙 하나 필요 26종** · 변환기 + 검사 + 시험 ≈4.5~5.5인일(추정) |
| 이름 겹침 | `시스템아키텍처` ×4 · `인터페이스` ×3 · `기능명세` ×2 — `forms()` 가 묶음을 같이 보이고 등록부 패턴 유일성은 save 가 강제 |
| 자리 · 판 | 서버 설치본 `forms/`(제품 판을 따른다) + 팀 서식 `<data>/forms/`(upgrade 가 덮지 않는다) |
| 도구 | `forms` MCP · 화면 서식집(S5) · `ctx forms list · show · check` |

### 8.2 배포

| | 지금 | v1.0 |
|---|---|---|
| 산출물 | win zip(exe 72MB + `knowledge-repo-<묶음>` ×5) · 서버 tar(≈14MB — 79% 가 같은 `ctx.mjs` 6벌) · 사이트 zip | **서버 tar ≈3MB**(`bin/ctx.mjs` 1벌 · `web/` · `manual/` · `forms/` · `kit/` · `deploy/`) · 사이트 zip |
| 설치 · 갱신 길 | 16(지식 레포 세우기 5 · 도구 층 갱신 3 · 작업 레포 6 · 서버 2+1) | **3** — ① 서버 `install.sh` / `upgrade.sh`(레포에 쓰지 않는다) ② 지식 레포: 콘솔 「새 지식 레포」(빈 틀) 또는 clone ③ 에이전트: 설치 한 줄 · `--update` · `--curator` |
| 레포 틀 | 패키지를 붓는다(`newRepo` 6단계 · 첫 커밋이 훅) | 빈 틀 하나(`_vocab.md` · `_managed.md` · README · `.gitignore` · `.gitattributes` · `docs/` · `work/`) |
| exe · SEA 빌드 · windows release job(40분) | | 없앤다 |

- **배포본의 사내 흔적** — `ops/deploy/{README.md, 설치절차.md, cdp-serve.service}` 가 사내 IP · origin 주소를 담은 채 서버 tar 에 실린다(`release-server.mjs:68-74`). v0.19.2 정리의 남은 항목이다 — v1.0 산출물에서 예시 값으로 바꾼다.

---

## 9. 이행 — 옛 레포를 v1.0 으로

옛 레포는 두 길로 넘어온다. **운영자 지시(2026-10-06) — dpms_wiki 는 다시 세운다**(관리 문서가 엉망이라 고치는 것보다 빈 레포에서 큐레이션부터 다시 하는 쪽이 낫다). gdi 는 제자리에서 옮긴다.

### 9.1 다시 세우기 — 기록만 옮긴다 (dpms_wiki)

`ctx repo new <새 이름> --records-from <옛 레포>` · 콘솔 「새 지식 레포」 의 「기록만 옮겨 오기」(admin).

| 옮긴다 | 옮기지 않는다 |
|---|---|
| `work/*.md` 전부(프론트매터 · 본문 · 날짜 · 작성자 그대로 — 사건이라 바꾸지 않는다) · `work/assets/**` | `docs/**`(관리 문서 39 · 서식 · 예시 · 작성지침) · `_managed.md` 의 행 · 옛 파생 정리 · 등록부 · 문서정리 기록(`tags: derive · registry · docs-prune`) — 옛 문서 층의 사건이라 새 레포에서는 가리킬 것이 없다 |
| `_vocab.md` 에서 **옮긴 기록이 `touches` 하는 좌표와 그 타입만**(라벨 · aliases 그대로) | 예시 좌표(`example:`) · 아무 기록도 안 건드린 좌표 |

- 새 레포의 첫 커밋 하나에 들어간다(작성자 = 실행한 admin · 메시지 「옛 레포 <이름> 의 작업 기록 n건을 옮겨 세움」). 옮긴 기록은 **전부 대기열**에 선다 — 큐레이션 기록이 없으므로.
- 그다음은 평소의 큐레이션이다 — 큐레이터가 `cdp-curate` 로 대기열 14건을 묶어(SCADA 연계 · GDI 베이스 · 시스템관리 화면 · 회의 · 사업분석) **서식집에서 문서를 골라 깨끗한 빈 문서로 세우고** 반영한다. 앞 검토 §5 의 W2~W4(인터페이스 좌표 · 이슈는 결론 한 줄 · 용어집은 뜻만)가 이 첫 큐레이션의 규칙이다.
- 옛 레포는 지우지 않는다 — 이름을 바꿔(`dpms_wiki_old`) 읽기로 두고, 새 레포가 `dpms_wiki` 이름과 origin 을 받는다(콘솔 「레포 연결」). 작업 레포는 설치 한 줄 `--update` 로 새 레포를 가리킨다.
- 시범 측정 — 앞 검토 §2 의 수치(근거 대비 섹션 배수 · 같은 문구의 복제 · 일지형 섹션 · 빈 서식 문서)를 새 레포에서 다시 잰다.

### 9.2 제자리 이행 (gdi)

`ctx migrate <레포> --dry` → curator save 한 번(전환 기록 하나). 순수 함수(`core/plan/migrate.js`)가 save 입력을 만든다.

| 순서 | 하는 것 |
|---|---|
| 1 | **전환 기록** — 지금 `ok` 인 섹션만 건드린 기록은 `verdict: reflect`, 좌표 0 기록 · 등록부 없는 좌표만 건드린 기록 · 옛 derive · registry · docs-prune 기록은 `verdict: keep`. 미반영이 남은 좌표를 건드린 기록만 대기열에 남는다. **날짜 경계로 자르지 않는다**(원문 날짜를 단 편입 기록이 숨는다) — id 목록은 서버가 쓴다 |
| 2 | 서식 잔재 — 예시 purge · 서식 그대로인 문서 drop · `## 작성지침` 섹션 삭제 · 머리 표의 관리번호 · 제출시기 · `등록부` 칸 삭제 · 서식 표지 주석(관리번호로 매칭) |
| 3 | 레포의 도구 층 걷기(`bin/` · `.githooks` · `.claude` · `MANUAL*` · `CLAUDE.md` · `TEMPLATE-work.md` · INDEX) — 커밋 한 번 · `core.hooksPath` 해제 |
| 4 | 작업 레포마다 설치 한 줄 `--update` |

gdi 의 특이점 — ① 지금 save 를 전부 막는 `## rp_plnd_mst` 중복은 I10(자기 변경분으로만 막힌다)이 먼저 풀고, 중복 자체는 curator 가 고친다 ② **`gdi_wiki_gen` 의 「`### 기준선`」 을 기준선 블록으로** — 생성기 출력만 `ctx baseline push` 용 JSON 으로 바꾼다(생성기는 프로젝트에 남는다) ③ 로컬 `C:\project\gdi_wiki` 는 개인 서버로 열거나 서버 레포를 본다.

---

## 10. 판 순서

레포 플래그는 두지 않는다 — 실사용은 레포 둘 · 쓰는 사람 한 명(admin)이고 dpms_wiki 는 다시 세운다. 플래그를 두면 모든 판정에 옛 규칙 · 새 규칙 두 갈래가 생기고, 그것이 이 개편이 지우려는 것이다.

| 판 | 이름 | 하는 것 | 나가는 조건 |
|---|---|---|---|
| **v0.26.0** | 토대 | 코어 정리(errors · layout · 한 벌 계산 · RepoCache) · H4 · H5 고침 · `core/judge/curation.js` · `section` · `where` · `work` 의 `pending` · 큐레이션 상태 · **I10(save 는 자기가 만든 오류로만 막힌다)** · 좌측 메뉴 셸(`nav.js` · `routes.js` · `roles.js` · SideNav) · S1 · S2(읽기) | 단위 시험 · 하네스 초록 · 하위 폴더 문서 ff pull 뒤 `section` 이 새 본문 |
| **v0.27.0** | 큐레이터 | 레포별 `curate` 권한 · writer/curator 입력 분리 · `curates` 판정 · applied 계산 · check 내리기(H1 포함) · `queue` · `forms` 도구 · 서식집(`agent/forms` · 변환기) · 빈 문서 찍기 · 기준선 블록 · `POST /curate` · 화면 S3~S9 · `cdp-curate` · `cdp-registry` · 다시 세우기(`--records-from`) · `ctx migrate` | dpms_wiki 다시 세우기 리허설(로컬 서버) · 첫 큐레이션 · 시범 측정 |
| **v1.0.0** | 전환 | `derive` · `apply` · `sync` · `version` 삭제 · **모드 A 제거**(stdio MCP · 로컬 뷰어 · exe · CLI 쓰기 명령 · 레포 도구 층 · 훅) · 개인 서버 · 스킬 5종 · kit 을 번들에서 · 설명서 넷 · 산출물 2 · 설계 문서 세트 v2 · 사내 흔적 정리 | gdi 제자리 이행 리허설 · 모든 하네스 초록 · 판 안내 「설치 한 줄 다시」 |

push · 태그 · 실서버 upgrade 는 사람이 한다. 실서버에서 dpms_wiki 다시 세우기도 사람이 콘솔에서 누른다(리허설 절차를 TODO 에 둔다).

---

## 11. 결정 — 권장으로 닫는다

| # | 물음 | 정한 것 | 왜 |
|---|---|---|---|
| V1 | 모드 A 를 남기나 | **쓰기도 로컬 뷰어도 끝낸다** — 한 사람 · 서버 없는 팀은 개인 서버(`--personal`) | §5.6 · 실사용 0 · ≈2,170 + ≈1,300줄 |
| V2 | 일반 사용자가 큐레이션해도 되나(운영자 질문 · 운영자가 「개발 진행」 을 지시해 권장으로 닫음) | **레포별 `curate` 권한** — admin 이 writer 중 누구에게나 준다. 반영 · 구조를 가르지 않는다 | §3.1 · H8 |
| V3 | 추출(기준선)을 제품이 받나 | **받는다** — 섹션 안 블록 · 기준선 save · 생성기는 프로젝트 것 | §3.2 · gdi 실측 |
| V4 | 레포에 도구 층을 두나 | **지식만**(I9) | §4.1 · H9 |
| V5 | 서버 save 커밋에 훅을 태우나 | `--no-verify` — save 가 같은 함수로 이미 검사 | §5.1 · 40초 · H9 |
| V6 | 서식 표지 | 주석 `<!-- cdp:form … -->` | H4 |
| V7 | 문서 종류 | 다섯 · 서식 머리에만 | §8.1 |
| V8 | 섹션 레벨 | `##` 하나 · 새 문서는 `##` 만. 옛 `—` · `###` 행은 읽기는 계속하고 서식 · 새 행에서 뺀다 | 사용 0 · 2 |
| V9 | MCP 도구 | 12 · 역할별 등록 | §5.3 |
| V10 | 미반영 본문 | **`section` 이 기본으로 싣는다** | I7 · H6 |
| V11 | 스킬 | 5종 · ≈1,250줄 | §6.1 |
| V12 | writer 의 `edits` | `docs/` 금지 | H7 · I6 |
| V13 | 산출물 · 설치 길 | 2 · 3 | §8.2 |
| V14 | 판 | v0.26 → v0.27 → v1.0.0 · **플래그 없음** | §10 |
| V15 | 용어 · 불변조건 | §4.5 · §2 가 정본 | 세 벌 · 여덟 이름 |
| V16 | 설계 문서 | v2 세트 — 시스템설계서 v2.0 · MCP 설계서 v2.0 · 서식집 규약 v1.0 · 화면 설계서 v1.0 · 용어 v1.0. 나머지는 머리에 「v1.0 → 어디로」 한 줄 | §1.2 |
| V17 | 판정을 어디에 | `curates: [{ id, verdict, into, reason }]` — 데이터로 | §4.2 · 화면 조사 §3.4 |
| V18 | 화면 권한 | 항목마다 `need` · 판정 함수 하나 · 메뉴 표 하나 | §7.2 |
| V19 | 화면 색 | 색 예산 그대로 — 초록 · 주황 없음 · 대기는 보라 | §7.2 |
| V20 | dpms_wiki | **다시 세운다** — 기록만 옮기고 큐레이션부터(운영자 지시) | §9.1 |
| V21 | save 가 막히는 기준 | **이 save 가 새로 만든 error 만**(전 · 후 검사 결과의 차) — writer · curator 같다. 원래 있던 오류는 경고로 싣는다 | I10 · H2 |

앞 설계에서 바뀌는 결정 — 큐레이터 설계 **K1**(큐레이터 = admin) → V2 · **K2**(writer 섹션 금지 · 모드 A warn) → I6 + V1 로 강제 · **K11**(v0.26.0) → V14 · 큐레이터 설계 §4.4 의 「기준선」 → 「전환 기록」 · 셸 설계 **§2.1**(묶음 단위 권한) → V18 · **§3**(로컬 얼굴) → V1 · 목업 색 → V19.

---

## 12. 위험

| 위험 | 막는 것 |
|---|---|
| 큐레이터 병목 | 레포별 curator 여럿(V2) · 대기 · 나이가 화면 세 곳과 경고에 · 미반영이 주입에 실리므로 지연이 정보 손실이 아니다(I7) |
| 큐레이션이 틀리게 쓴다 | 판정표 + diff 승인(dryRun) · `section-journal` · `derive-outgrows-source` 경고 · 경과 줄이 출처를 남긴다 |
| 기준선과 큐레이션이 서로 덮는다 | 블록 경계 — 각자 자기 자리만 쓸 수 있다(save 가 거절) |
| 큰 리팩터의 회귀 | 판마다 단위 시험 · 하네스 초록 · v0.26 은 행동을 거의 안 바꾼다 |
| 모드 A · 로컬 뷰어 사용자 단절 | 실측 0 · 개인 서버 · 판 안내 |
| 다시 세운 dpms_wiki 가 옛 것보다 빈약 | 옛 레포를 읽기로 남긴다 · 기록은 전부 옮긴다 · 대기열이 0이 될 때까지 미반영이 주입에 실린다 |

---

## 13. 다음

운영자가 「완료되면 개발 진행」 을 지시했다(2026-10-06). → `docs/dev/v1.0_개편_TODO.md`(판마다 절차 · 파일 · 시험 · 하네스 항목 · 「나온 것」 표) → v0.26 부터 구현. 목업은 V18 · V19 에 맞춰 v0.26 의 셸 작업에서 같이 고친다.
