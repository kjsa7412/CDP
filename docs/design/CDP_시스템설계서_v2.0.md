# CDP 시스템 설계서 v2.0

> **무엇인가** — v1.0 의 프로토콜(무엇을 어떻게 기록하고 판정하나)과 프로그램(어떤 구조로 구현했나)을 한 문서에 담는다. **고칠 사람을 위한 문서다.**
> **기준** — 코드 main `d5e0a1c`(2026-10-06). 결정은 [`CDP_v1.0_개편안.md`](CDP_v1.0_개편안.md)(이하 「개편안」 · V1~V21)이 내렸고, 이 문서는 그것이 **코드로 어디까지 왔나**를 적는다. 둘이 어긋나면 **코드가 맞다** — 어긋난 자리는 [§12](#12-개편안과-코드가-어긋난-곳--남은-것)에 모았다. 판 올림(1.0.0 · TODO W10)은 아직이다 — `package.json` 은 0.25.0 이다.
> **대신하는 것** — [`CDP_시스템설계서_v1.0.md`](CDP_시스템설계서_v1.0.md)(2026-09-07). 짝 문서 — [`CDP_MCP_설계서_v2.0.md`](CDP_MCP_설계서_v2.0.md) · [`CDP_서식집_규약_v1.0.md`](CDP_서식집_규약_v1.0.md) · [`CDP_화면_설계서_v1.0.md`](CDP_화면_설계서_v1.0.md). 말은 [`../용어.md`](../용어.md)(v1.0)가 정본이다.
>
> 작성 2026-10-07

---

## 0. 한 줄

**v1.0 은 세 가지를 동시에 바꿨다.** ① **쓰는 길은 서버 `save` 하나다** — PC 의 지식 레포 · git 훅 · stdio MCP(모드 A)와 로컬 뷰어 · exe 를 걷었다. 서버 없는 한 사람은 같은 코드의 개인 서버(`ctx serve --personal`)를 쓴다. ② **관리 문서는 큐레이션으로만 바뀐다** — writer 는 작업 기록만 쌓고, 레포별 큐레이터가 기록을 보고 반영하고, 기계(기준선 생성기)는 섹션 안 추출 블록만 갈아 끼운다. 늦은 반영을 막지 않는 대신 **섹션을 내보내는 자리가 그 섹션의 미반영 기록을 같이 낸다.** ③ **레포에는 지식만 둔다** — 도구 층 · 훅 · 스킬 사본 · INDEX · 등록부 사본 · 서식 예시가 레포에서 나갔다. 스킬 · CLAUDE 블록은 서버 번들의 `kit/`, 서식은 `forms/` 에서 나간다.

문제 · 좌표 · 두 층은 v1.0 문서 그대로다([v1.0 제0부](CDP_시스템설계서_v1.0.md#제0부--이-시스템이-푸는-문제)) — 같은 대상을 사람마다 다르게 부르니 **대상마다 정본 이름 하나(좌표)** 를 두고, `work/`(사건 · 불변)와 `docs/`(상태 · 덮어쓴다)를 가른다. 바뀐 것은 둘 사이를 **누가 · 언제 · 어떻게** 잇는가다.

| | v1.0 문서 (v0.x 코드) | v2.0 (v1.0 코드) |
|---|---|---|
| 섹션을 쓰는 사람 | 작업한 사람(파생 필수) | 그 레포의 **큐레이터** · 기준선 블록은 기계 |
| 섹션이 기록을 못 따라간 상태 | 없다 — `derive-missing` **error** 가 커밋을 막는다 | **미반영**이라는 상태다 — info. 섹션과 함께 그 기록이 실린다 |
| 결정론적 보증 | git 훅 하나(`pre-commit → ctx check`) | 서버 `save` 의 검사(커밋 전 · 같은 함수) + **읽기 도구가 미반영을 싣는다** |
| 쓰는 길 | 모드 A(PC git) · 모드 B(서버 save) | 서버 `save` 하나 |
| 레포에 있는 것 | 지식 + 도구 층(bin · 훅 · 스킬 · INDEX · 설명서) | 지식만 |
| 관리 문서가 생기는 때 | 패키지를 부을 때(40종) | 큐레이터가 서식집에서 고를 때(빈 문서로) |
| 프로그램 | `cdp.exe`(트레이 · 로컬 뷰어) + 서버 | 서버 하나(`bin/ctx.mjs`) — 팀 서버 · 개인 서버 |

---

## 1. 불변조건 v1.0

개편안 §2 가 세 벌(설계서 14 · 개발자 설명서 16 · system.md 14)을 **한 벌로 합치고 번호를 고정했다.** 이 표가 정본이고 설명서 · 스킬 · 코드 주석은 번호로만 가리킨다. 「지키는 자리」 는 코드에서 확인한 것이다.

| # | 불변조건 | 지키는 자리 (코드) | 깨지면 |
|---|---|---|---|
| I1 | 판정은 `core/` 한 곳에서 순수 함수로 한다. CLI · 서버 · 화면은 부르기만 한다 | `core/curation.js` 를 `loadRepo` · 화면 `Store` · MCP 가 같이 쓴다 · 새 문서는 `core/forms.js` 의 `stampDoc` 하나가 찍고 화면의 서식 미리보기가 같은 함수를 부른다 | 화면 · 도구 · 커밋 판정이 갈라지고 사람은 화면을 믿는다 |
| I2 | **쓰기 길은 서버 `save` 하나다.** 한 번의 save 가 한 커밋이다 | `core/save.js` — 화면의 쓰기(`POST /api/<r>/curate` · `/docs-drop` · `/baseline`)도 save 입력을 지어 같은 함수를 탄다 | 검사를 거치지 않은 정본 변경이 생긴다 |
| I3 | `work/` 는 불변이다. 작업 기록은 사건이고 원천이다 | save 3단계(같은 id 면 `E_EXISTS`) · `edits` 는 `work/` 를 받지 않는다(`edits.editableFile`) · 정정은 `supersedes` 를 단 새 기록 | 그때의 판단이 사라진다 |
| I4 | 좌표는 `_vocab.md` 에만 등재된다 | save 5단계(어휘 등재 뒤 좌표 대조) · `check` `unregistered-coord` error | 두 이름이 갈라져 좌표가 좌표가 아니다 |
| I5 | 좌표 하나에 정본 섹션 하나 — **사실 하나에 정본 자리 하나.** 다른 섹션은 좌표를 건다 | `check` `dup-anchor` error · `section` 의 `refs`(본문이 가리키는 좌표의 정본 섹션 한 단계) · `cdp-curate` 의 쓰기 규칙 | 같은 결정이 여러 섹션에 복제되고 하나만 고쳐진다 |
| I6 | **관리 문서는 큐레이션으로만 바뀐다**(큐레이터 · 기준선). writer 는 기록만 쓴다 | save 2.1 `curatorOnly` — writer 가 `sections` · `managed` · `edits` · `examples` · `baseline` · `work.curates` · `work.baseline` · 예약 태그를 보내면 `E_FORBIDDEN { need: 'curate' }` | 정본 층의 작성자가 둘이 되어 이름 · 구조가 갈라진다 |
| I7 | **미반영은 상태다. 섹션을 내보내는 자리는 그 섹션의 미반영 기록을 같이 낸다** — 보증은 도구가 한다 | MCP `section`(`pending` · `pendingRecords`) · `where`(`state` · `pending`) · 화면 `/api/<r>/docs/<id>` 의 `sectionStates[].pending` → 「미반영 n」 칩 | 섹션만 읽고 최신이라 믿는다 — 늦은 반영이 정보 손실이 된다 |
| I8 | 상태는 계산할 뿐 저장하지 않는다 — `status` 필드 · 대기열 필드 없음 | `buildCuration` 이 작업 기록만으로 대기열 · 기록 상태 · 미반영을 계산한다 · `applied` 도 save 가 판정에서 계산해 쓴다 | 저장한 상태는 반드시 낡는다 |
| I9 | **레포에는 지식만** — 도구 · 사본 · 색인을 레포에 커밋하지 않는다 | 새 레포는 빈 틀(`core/skeleton.js`) · save 가 INDEX · 등록부 사본을 만들지 않는다 · kit 은 번들(`core/kit.js`) · 옛 레포는 `ctx migrate` 가 도구 층을 걷는다 | 레포마다 판이 갈라지고(옛 훅이 새 규칙을 막는다 — 개편안 H9) 사본이 낡는다 |
| I10 | 쓰는 사람의 save 는 **자기 변경분으로만** 막힌다 | save 8단계 `newErrors(before, after)`(V21) — writer · 큐레이터가 같다. 원래 있던 오류는 `warnings` 로 | 고칠 권한이 없는 사람의 save 가 남의 오류로 전부 막힌다(실서버 종합시험 F8) |
| I11 | 서버는 LLM 을 부르지 않는다 · CDN · 인터넷 없음 | 글은 큐레이터의 에이전트 세션이 쓰고 서버는 검사 · 커밋만 한다 · 화면 번들은 외부 자원을 부르지 않는다(HTML 시각 자료 첨부만 CSP 가 정한 CDN 셋을 열고, save 가 그것을 경고한다) | 서버에 키 · 비용 · 반출이 생긴다 · 폐쇄망에서 조용히 다르게 그려진다 |
| I12 | 기계는 merge 하지 않는다 · origin 으로는 미러가 민다 | `core/git.js`(merge · rebase · 충돌 해결 없음) · `core/mirror.js`(레포당 push 큐 하나 · 갈라지면 멈춤) · 「origin 과 맞추기」 는 ff 만 | 두 갱신이 섞인 결과가 정본 자리에 앉는다 |
| I13 | 정렬은 상태를 보지 않는다 · 읽는 경계에서 개행을 정규화한다 · 실패는 조용하지 않다 · 토큰 원문은 저장하지 않는다 · 빌드는 스스로 검증한다 | `scan.readText` · `forms` 의 `norm`(CRLF) · 토큰은 해시만(`auth.issue`) · `release-server.mjs` 가 빠진 것을 세어 exit 1 | 같은 것을 두 번 봐도 자리가 달라지고 · CRLF 클론이 아무것도 못 읽고 · 반쪽 산출물이 정상으로 나간다 |

**옛 번호(v1.0 문서 제3부) → v1.0**

| 옛 | v1.0 |
|---|---|
| 1 판정은 `core/` 한 곳 | I1 |
| 2 `later()` 는 하나 | 목록 밖 — 그대로다. `validity.later` 하나를 옛 판정(`buildSectionStatus`)과 암묵 전환이 쓴다 |
| 3 `work/` 불변 · 4 좌표는 `_vocab.md` 에만 | I3 · I4 |
| 5 결정론적 보증은 git 훅뿐 | **죽었다** — save 의 검사 + I7(도구가 미반영을 싣는다) |
| 6 error 를 함부로 늘리지 않는다 | 목록 밖 — 그대로다. v1.0 은 오히려 줄였다(§6) |
| 7 없는 상태를 화면에 그리지 않는다 | 목록 밖 — 바뀌어 남았다. 미반영은 **있는** 상태라 칩으로 그린다 · 서버가 값을 안 내면(옛 서버) 그리지 않는다 |
| 8 정렬 · 9 개행 · 13 빌드 검증 | I13 |
| 10 기계는 merge 하지 않는다 · 11 push 는 사람이 | I12 — 서버형의 push 는 save 뒤 미러 큐와 콘솔의 「다시 보내기」 뿐이다(주기 · 시작 시 push 없음) |
| 12 CDN 을 타지 않는다 | I11 |
| 14 `bin/ctx` 번들 시각이 찍힌다 | **죽었다** — 레포 안 번들이 없다(I9). 서버 판은 `ctx version` · `/healthz` 의 `built` |

- **죽은 원칙** — 「밀림이라는 상태는 없다」(v1.0 §1.5①) · 「빈 섹션을 두려워하지 말라」(수행 §3.4) · 「미반영을 별도 용어로 만들지 않는다」(수행 §6.4) · 「결정론적 보증은 git 훅뿐」.
- **I13 의 예외 하나** — 개인 서버는 그 PC 의 주인 한 사람이 쓰므로 토큰 원문을 `<data>/personal.token`(0600)에 둔다(`ctx-mcp-serve.mjs` `preparePersonal`). 팀 서버는 해시만 둔다.

---

## 2. 운영 모델 — 원천 셋 · 역할 넷

### 2.1 원천 셋

```
                    ┌────────────── 작업 기록 work/ (불변 · 원천) ──────────────┐
 writer 세션 ──save(work)──▶ 기록 ──▶ 대기열 ──▶ 큐레이터 세션(cdp-curate) ──save(curation)──┐
 (cdp-work · cdp-save)                              판정 · 정본 · 현재형                        │
                                                                                               ▼
 생성기(프로젝트 스크립트) ──save(baseline)── 코드 · DB · 매뉴얼에서 기계로 ──────▶  관리 문서 docs/
                                                                                    섹션 = 정본 서술
 읽는 쪽(사람 · 에이전트) ◀── section · 화면 ── 섹션 + 기준선 블록 + 미반영 기록 ◀──   + 기준선 블록 + 경과
```

| 원천 | 누가 쓰나 | 어디에 | 성질 |
|---|---|---|---|
| 작업 기록 | writer(큐레이터도 자기 작업은 이것으로) | `work/<id>.md` · 첨부 `work/assets/<id>/` | 사건 · 불변 · **홀로 선다**(값 · 표 · 결정 · 제약은 본문에 — 큐레이터는 기록만 보고 반영한다) |
| 큐레이터의 판단 | 큐레이터 | 관리 문서 섹션의 서술 · 큐레이션 기록(`curates`) | 정본 · 현재형 · 경과는 한 줄씩 |
| 추출 | 기계(프로젝트의 생성기) | 섹션 안 기준선 블록 · 기준선 기록(`baseline`) | 통째로 갈아 끼운다(멱등) · `asof` 가 신선도다 · 대기열 · 미반영을 만들지 않는다 |

gdi 는 셋째를 제품 밖 생성기(`gdi_wiki_gen`)로 해 왔고 「작업 기록이 쓴 섹션은 덮지 않는다」 를 생성기가 스스로 지켰다. v1.0 은 그 규칙을 **블록 경계 하나**로 바꿨다 — 큐레이션 save 는 블록 안을, 기준선 save 는 블록 밖을 못 쓴다(개편안 §3.2 · V3).

### 2.2 역할 넷

| 역할 | 명부(`auth.json`) | 하는 것 | 쓰는 것 |
|---|---|---|---|
| **writer** | `role: writer` · `repos` | 작업 기록 save(`work` · `vocab` · `assets`) · 첨부 올리기 · 작업 레포 등록 | 스킬 `cdp-work` · `cdp-save` · `cdp-push` · 화면 지식 · 레포 관리 |
| **큐레이터** | writer 이상 + **`curate: [레포 \| *]`** — admin 은 모든 레포 | + 큐레이션 save(판정 · 섹션 · 새 문서 · 등록부 · 섹션 밖 글 · 서식 예시 정리 · 문서 지우기) · 「기록으로 둠」 · 기준선 | + `cdp-curate` · `cdp-registry` · MCP `queue` · `forms` · 화면 큐레이션 묶음 |
| **서버 관리자** | `role: admin` | + 명부 · 토큰 · 레포 세우기 · 치우기 · origin 연결 · 미러 복구 · git 자격 · 감사 · 서버 설정 | 화면 서버 묶음(`/console/*`) · `ctx serve user \| token \| git-auth \| doctor` |
| **기계(기준선)** | 큐레이터 토큰을 쓰는 프로젝트 스크립트 | 기준선 블록만 | `ctx baseline push` · `POST /api/<r>/baseline` |

- 모든 역할의 바탕은 **viewer**(`role: viewer`) — 읽기 · 검색 · 주입이다.
- **명부 모양** — 전역 `role`(viewer · writer · admin)은 그대로 두고 사람마다 `curate: [레포]` 한 줄을 더했다. 판정은 `core/auth.js` 의 `grantOf` 하나가 `curate(레포)` 를 낸다 — admin 은 늘 참, writer 는 목록에 그 레포나 `*` 가 있고 **그 레포를 볼 수 있을 때**, viewer 는 거짓(적어 둔 값이 있어도 역할이 이긴다 · `curateOf`). 옛 `auth.json` 은 그대로 돈다(옛 `write: true` 는 writer 로 읽는다).
- 큐레이터를 **레포별 권한**으로 둔 것은 개편안 V2 다 — 「아무나 문서를 세우면 이름 · 구조가 갈라진다」 는 사람을 고르는 문제이지 writer 전체를 묶을 문제가 아니다. 큐레이터 설계 v0.1 의 K1(큐레이터 = admin)을 바꿨다.
- 맡기는 길 — 콘솔 › 사용자의 「레포 × 큐레이터」 표(체크 하나 = `curate` 한 줄 · 재인증) · 셸 `ctx serve user set --name <이름> --curate <레포,…|*>`(빈 값이면 해제).

### 2.3 하루의 흐름

| 누가 | 하는 것 | 막히는가 |
|---|---|---|
| writer | 작업 → `cdp-save` 가 【좌표 판정】을 보이고 승인 → `save(work)` → 기록은 대기열에 선다 | 자기 기록의 형식 · 미등재 좌표 · 예약 키로만(I10) |
| 큐레이터 | 화면 큐레이션 › 대기열에서 기록을 고르고 [에이전트 지시 복사] → 자기 PC 의 큐레이터 폴더에서 Claude Code(`cdp-curate`) → `queue` · `work` · `section` · `forms` → 판정표 + diff(`dryRun: true`) 승인 → `save(curation)` | 섹션 충돌(`E_CONFLICT`) · 이 save 가 만든 오류 |
| 큐레이터(화면) | 글을 안 쓰는 판정 「기록으로 둠」(사유 필수) — 서버가 큐레이션 기록을 지어 save | 같다 |
| 생성기 | 야간 또는 손으로 `ctx baseline push <json>` | 등록부 · 블록 모양 |
| 누구나 | 섹션을 읽으면 미반영 기록이 같이 온다(화면 칩 · `section` 의 `pendingRecords`) | — |

**서버는 글을 쓰지 않는다**(I11 · K12). 판단과 글은 큐레이터의 에이전트 세션이, 검사 · 커밋 · `applied` 계산은 서버가 한다.

---

## 3. 데이터 모델

### 3.1 레포 — 남는 것 · 나간 것

| 남는다 — 빈 틀(`core/skeleton.js`) | 나갔다 | 대신 |
|---|---|---|
| `README.md`(이름 · 한 줄 · 자리 표) | `INDEX.md` · `INDEX-by-coord.md` | 화면 · 도구가 계산한다 |
| `_vocab.md` · `_managed.md` | `CLAUDE.md` · `TEMPLATE-work.md` · `MANUAL*.md` | 서버 `/manual` · kit |
| `docs/` · `work/`(각 `.gitkeep`) · `work/assets/<id>/` | `.claude/skills/*` · `.claude/work-repo/` | 서버 번들 `kit/` |
| `.gitattributes`(`* text=auto eol=lf` · 그림 · pdf binary) · `.gitignore`(`/submit/` · 오피스 파일) | `.githooks/` · `bin/ctx{,.mjs,.cmd}` · `tools/` · `core.hooksPath` | 없다(I2 · I9) |
| | 문서 머리 표의 `등록부` 칸 · `_vocab.md` 생성 블록 · `관리번호.md` | `_managed.md` 한 곳 |
| | `(예시)` 섹션 · `example:` 어휘 · `## 작성지침` | 서식집(서식의 `guide` · `example`) |

### 3.2 작업 기록 — `work/<id>.md`

```yaml
---
id: 2026-1006-SYA030-사원번호-직접입력     # 파일명과 같다 · YYYY-MMDD-slug
title: "…"                                # YAML 이 깨지는 글자가 있으면 save 가 인용한다
date: 2026-10-06 14:30                    # 시각까지 — 없으면 save 가 경고(편입 source 가 있으면 안 한다)
author: kjsa                              # save 가 토큰의 사용자로 채운다 — 보내면 E_INPUT
source: "…"                               # 편입한 원문의 출처(선택)
touches:                                  # 이 작업이 바꾼 좌표 — 0개면 touches: [] 와 touchesEmpty
  - screen:SYA030
touchesEmpty: "…"                          # 좌표 0개의 사유
supersedes: 2026-0930-…                    # 이 기록 자체가 틀렸을 때만 — 참조이지 판정이 아니다
attachments: [assets/<id>/<name>]          # save 의 assets 가 채운다
curates:                                   # 큐레이션 기록 — 키가 있으면 큐레이션 기록
  - { id: "…", verdict: reflect, into: ["screen:SYA030"] }
  - { id: "…", verdict: keep, reason: "…" }
baseline: { source: "운영 DB sy_pgm_info", asof: "2026-10-02" }   # 기준선 기록
tags: [curate]
---
(본문 — 자유 형식. 기록은 홀로 선다)
```

| 필드 | 필수 | 누가 | 규칙(코드) |
|---|:--:|---|---|
| `id` `title` `date` `author` | O | 모두 | `check` `missing-field` error · id ≠ 파일명은 `id-mismatch` error |
| `touches` | 키 | 모두 | save 는 비면 `touchesEmpty` 를 요구하고 경고 한 줄을 싣는다 · 둘을 같이 보내면 `E_INPUT` · 큐레이션 · 기준선 기록은 갖지 않는다 |
| `status` | X | — | 쓸 수 있는 값이 없다 — `확정` · `완료` 는 읽는 경계에서 지우고 나머지는 error(`agenda-status` · `status-value`) |
| `supersedes` | X | 모두 | 참조 — 순환 · 대상 없음만 error |
| `curates` | X | **큐레이터** | `[{ id, verdict, into?, reason? }]` — `verdict` ∈ `reflect` · `new` · `keep`. reflect · new 는 `into` 1개 이상, keep 은 `into` 없음(`frontmatter.normalizeCurates`) |
| `baseline` | X | **큐레이터(생성기)** | `{ source, asof }` — save 의 `baseline[]` 과 같이만 |
| `tags` | X | 모두 | 예약 태그(`curate` · `baseline` · `transition` · `registry` · `docs-prune` · `derive`)는 큐레이터만(`save.RESERVED_TAGS`) |

- 읽는 경계는 너그럽다 — 모양이 틀린 판정도 버리지 않고 `bad` 를 달아 둔다. 거르면 「이 기록은 큐레이션됐다」 가 조용히 사라지고 그 기록이 대기열로 돌아온다. 판정은 save 와 `check` `curates-shape` error 가 한다.
- 읽기는 옛 모양도 받는다 — `knowledge/` 층 · `supersedes: [{ id, scope }]`(§12).

### 3.3 기록의 종류 넷 — `curation.recordKind`

| 종류 | 가르는 것 | 대기열 | 미반영 |
|---|---|:--:|:--:|
| `work` | 아래 어느 것도 아니다 — 사람의 작업 기록 | 선다 | 만든다 |
| `curation` | `curates` 키 | 안 선다 | 안 만든다 |
| `baseline` | `baseline` 키 | 안 선다 | 안 만든다 |
| `system` | 태그 `registry` · `docs-prune` · `derive` — 옛 문서 층의 기계 기록(등록부 정리 · 문서 정리 · 파생 정리) | 안 선다 | 안 만든다 |

전환 기록(태그 `transition`)은 `curates` 가 있어 `curation` 이다. **키가 있으면 그 기록이다** — 판정을 본문 표에 두지 않고 데이터로 둔다(V17). 화면은 마크다운을 파싱하지 않는다.

### 3.4 관리 문서 · 섹션

```markdown
# 테이블정의서
<!-- cdp:form public-si/DE_431 -->              ← 서식 표지 — H1 바로 아래(서식에서 세운 문서만)

테이블의 지금 상태. 섹션 하나가 테이블 하나다.     ← 서식의 head(첫 문단)

## sy_user_info — 사용자정보
<!-- applied: 2026-1006-SYA030-사원번호-직접입력 -->   ← save 가 쓴다 — 반영한 기록 중 그 좌표의 가장 늦은 것

사용자 계정. 사원번호는 화면에서 직접 넣는다(`screen:SYA030`).   ← 큐레이터의 서술 · 현재형

<!-- cdp:baseline src="개발 DB pg_catalog" asof="2026-10-04" -->
| 컬럼 | 타입 | NULL | 키 | 설명 |                       ← 기준선 블록 · 기준선 save 만
…
<!-- /cdp:baseline -->

**경과**                                                ← 한 줄씩 쌓는다 · 본문을 일지로 만들지 않는다
- 2026-10-06 [`SYA030-사원번호-직접입력`](../work/…) `emp_no` 를 화면 입력으로
```

| 규칙 | 코드 |
|---|---|
| 헤딩 | `## <값> — <설명>` — 값은 ` — ` 앞이다(`managed.parseManagedSections`). 새 섹션의 `heading` 은 제목 줄 **전체**이고 값으로 시작해야 한다 — 아니면 `E_INPUT` |
| 섹션의 끝 | 같은 레벨 이하의 다음 헤딩 앞 · 코드 펜스 안의 헤딩은 세지 않는다 |
| `applied` | 헤딩 아래 3줄 안 · 다음 헤딩을 넘지 않는다 · `null` · `-` 는 없음이다. 문서 전체(`—`) 규칙은 **문서 첫 3줄**의 주석이다(`frontmatter.topApplied`) |
| 서식 표지 | `<!-- cdp:form <묶음>/<번호> -->` — H1 아래 3줄 안. YAML 이 아니라 주석이다(개편안 H4 · V6). [서식집 규약 §6](CDP_서식집_규약_v1.0.md#6-서식-표지) |
| 기준선 블록 | 여는 표지 `<!-- cdp:baseline src="…" asof="…" -->` · 닫는 표지 `<!-- /cdp:baseline -->`. 섹션 안 **앞의 하나**만 블록이다. 다시 붙일 때 `**경과**` 줄 앞, 없으면 끝에(`baseline.joinBaseline`) |
| 레벨 | 등록부가 정한다 — 한 문서는 한 레벨(`registry-level-mix` warn). 서식의 새 행은 `## {값}` 또는 `—` 뿐이다(V8 · [§12](#12-개편안과-코드가-어긋난-곳--남은-것)) |
| 문서 종류 | 문서에 적지 않는다 — 서식 머리의 `kind`(대상 · 대장 · 정의 · 사건 · 서술)에서 온다 |
| 섹션 밖 글 | 머리말 · 등록부 비대상 문서(회의록 같은 날짜축) · 산문은 큐레이터의 `edits` 로만 쓴다(§5) |

### 3.5 등록부 · 어휘

- **`_managed.md`** — `` | `<패턴>` | `<문서>` | `## {값}` 또는 — | `` 한 줄이 규칙 하나다(넷째 칸은 note). 위에서부터 먼저 걸리는 행이 이긴다 · glob 은 `*` 만. 서버가 더한 행의 note 는 `서버 추가 · <work.id>` — 표의 머리는 넷째 칸 「비고」 까지다(빈 틀의 빈 표에 첫 행이 들어가고, 머리가 셋째 칸까지인 옛 레포는 행을 더할 때 머리를 넓힌다). drop 은 끝의 「지운 관리 문서」 표(첫 칸에 콜론이 없어 규칙이 아니다)에 한 줄을 남긴다.
- **등록부에 없는 좌표는 정상이다** — 그 작업 기록이 원천이다(v1.0 §1.2 그대로). v1.0 은 하나를 더했다 — **등록부 행은 있는데 섹션이 없는 좌표도 오류가 아니다.** 대기열의 「등록부 있음 · 섹션 없음」 이고, `section` 은 섹션 대신 그 좌표의 대기 기록을 낸다(개편안 H1 · 0a5e2c6).
- **`_vocab.md`** — `## <타입>`(공백 없는 머리글) 아래 `` - `타입:값` — 설명 `` · `aliases:` · `deprecated:` · `supersededBy:` · 타입 절 아래 `excluded:`. 타입 절 순서가 카테고리 순서다. save 의 `vocab[]` 는 추가만 하고, 타입 절이 없으면 파일 끝에 만들고 경고한다. 삭제는 없다(`deprecated` 표기).

### 3.6 계산값 — 저장하지 않는다(I8)

`core/curation.js` 의 `buildCuration({ works, sections, managedIndex, coords, bodies })` 하나가 `loadRepo` 의 `r.curation` 을 만든다. 화면 `Store` 도 `loadRepo` 를 그대로 쓰므로 같은 값이다.

| 값 | 정의(코드) |
|---|---|
| **판정의 순서** | 큐레이션 기록을 오래된 것부터 덮어쓴다 — **가장 늦은 판정이 이긴다**(재큐레이션). 대상이 `work` 종류일 때만 |
| **기록 상태** `statusOf(id)` | `queued` · `reflected { into, by, at }` · `kept { reason, by, at }` · `system`(work 가 아닌 기록 자신) |
| **대기열** `queue` | `work` 종류 중 어떤 판정도 받지 않은 것 — 오래된 순(날짜 → id). 행마다 `ageDays` · `zero`(좌표 0) · 좌표마다 `cls` |
| **좌표 분류** `coordClass` | `section`(섹션 있음 · 반영 후보) · `anchor`(등록부 행은 있는데 문서나 섹션이 없음) · `unregistered`(등록부 없음 · 새 문서 후보 또는 기록으로 둠). 「좌표 0」 은 행의 `zero` |
| **섹션의 미반영** `pendingOf(coord)` | 큐레이션된 레포 — **그 좌표를 건드린 기록 ∩ 대기열**. 암묵 전환 레포 — 옛 판정(`later(applied, coord)` 의 후속). 날짜 오름차순 · 발췌(첫 문단 160자) |
| **섹션 상태 셋** `stateOf` | `missing`(등록부 행은 있는데 문서 · 섹션이 없다) · `pending`(미반영 1건 이상) · `ok` |
| **`applied`** | save 가 쓴다 — 이 save 의 `curates` 중 keep 이 아니고 `into` 에 그 좌표가 있는 기록의 **가장 늦은 것**(날짜 → id). 판정이 없으면 이 save 의 기록 id(§5.4) |
| **통계** `stats` | `queue` · `oldestDays` · `stale`(가장 오래된 대기 > 14일 · `QUEUE_STALE_DAYS`) · `pendingSections` · `last`(마지막 큐레이션) |
| **암묵 전환** `implicit` | 큐레이션 기록이 하나도 없고 `applied` 가 있는 섹션이 하나라도 있는 레포 — 옛 파생 이력이 있는 레포다. 그때는 옛 판정(applied 뒤 후속 · applied 없음 · orphan)이 남긴 기록과 「등록부 있음 · 섹션 없음」 좌표를 건드린 기록만 대기이고 나머지는 `reflected { implicit: true }` 로 읽는다 |
| **판정 재료** `materialsOf(r, id)` | 기록 하나 — 좌표마다 `{ cls, doc, state, applied, pending }` · 등록부 없는 타입 · 본문에만 있는 좌표(백틱 안 · 어휘에 있는 것) · `together`(같은 좌표를 건드린 다른 대기 기록 — 묶어서 다룬다) |

- 새 레포 · 다시 세운 레포는 `applied` 가 있는 섹션이 없어 암묵 전환이 아니다 — 기록 전부가 대기다(「큐레이션부터 다시」). 옛 레포를 판을 올린 순간 대기열이 기록 전부로 쏟아지지 않게 하는 것이 암묵 전환이고(큐레이터 설계 K6), 그 어림을 기록으로 굳히는 것이 전환 기록이다(§10).
- 같은 날 동배(`peers`)는 `later()` 안에서 계산되지만 그 경고(`derive-sameday`)는 지웠다 — 대기열이 그 틈을 덮는다(K9).

---

## 4. 모듈 배치

개편안 §5.1 이 그린 폴더 나누기(`core/model · judge · plan · read` · `node/` · `server/` · `cli/`)는 **하지 않았다** — `core/` 는 평평하고 판정의 자리만 정리됐다(§12). 지금 있는 파일이다.

### 4.1 `core/`

| 갈래 | 파일 | 책임 |
|---|---|---|
| 읽기 · 모델 | `scan.js` | 디렉터리 순회 + 증분 캐시(mtime · size). **CRLF 를 읽는 경계에서 지운다**(`readText`) |
| | `frontmatter.js` | 프론트매터 정규화 · 층(`work` · `managed`) · `curates` · `baseline` · `topApplied` · 관리 문서 섹션 분해 |
| | `vocab.js` · `managed.js` | `_vocab.md` → 타입 · 좌표 · alias · `normKey` / `_managed.md` → 규칙 · `resolveCoord` · `buildManagedIndex` · 패턴 · 경로 · 겹침(`lintRegistry`) |
| | `repo.js` | **입구** — `loadRepo()` 가 위를 조립해 `r` 하나(`r.curation` 포함)를 낸다 · `repoStatus()` |
| | `repopath.js` · `visuals.js` · `search.js` | 본문의 그림 · 링크 경로(화면과 save 가 같은 규칙) · HTML 시각 자료 이름 · 이름 대조와 전문 색인 |
| 판정 | `validity.js` | `later()` 하나 · `buildSectionStatus`(옛 판정 — 암묵 전환 · `orphan`) · `supersedes` 순환 |
| | `curation.js` | **대기열 · 기록 상태 · 미반영 · 섹션 상태 셋 · 판정 재료**(v1.0) |
| | `check.js` | 검사 · 등급 · `newErrors`(V21 — 이 save 가 만든 error) |
| | `docrefs.js` · `docusage.js` · `regen.js` | 관리 문서를 가리키는 자리(열쇠 셋) · 사용 현황 · 지우기를 막는 까닭 · 옛 등록부 사본의 **자리 찾기**(어휘 구조 줄 · 규칙 행 · 머리말 끝 — 사본은 더 만들지 않는다) |
| 쓰기 계획(순수) | `managedops.js` | `managed[]` — add(서식이면 `stampDoc`) · rename · merge · retire · drop |
| | `edits.js` · `examples.js` · `docdrop.js` | 섹션 밖 쓰기 · 서식 예시 정리 · 문서 지우기의 거절과 참조 |
| | `baseline.js` · `forms.js` | 기준선 블록(`renderBlock` · `splitBaseline` · `joinBaseline` · `extractFromDoc`) · 서식 하나(`parseForm` · `stampDoc` · `formIdOf` · `lintForm`) |
| | `migrate.js` · `rebuild.js` · `skeleton.js` | 전환 기록 계획 · 걷을 도구 층 · 다시 세우기(옮길 기록 · 어휘) · 빈 틀 |
| 쓰기 · I/O | `save.js` | **유일한 쓰기**(§5) — `Snap`(되돌리기) · 뮤텍스 · 커밋 · 미러 |
| | `git.js` · `mirror.js` · `lock.js` · `sync.js` | git(merge 없음) · 미러 큐와 상태 다섯 · 레포당 뮤텍스 · fetch → ff |
| | `assets.js` · `reponew.js` · `importdir.js` | 첨부 올리기 · 레포 세우기(빈 틀 · 다시 세우기 · clone · origin · 휴지통) · md 폴더 들이기 |
| | `formslib.js` · `kit.js` | 서식집 · kit 의 **자리 찾기와 묶기**(명시 · 환경변수 · 번들 옆 · 소스 · 팀 서식) |
| 서버 · 설치 | `auth.js` · `store.js` · `tools.js` · `errors.js` | 명부 · 토큰 · 판정 · 세션 · 재인증 · 감사 / 화면 view-model(`Store`) / MCP 도구의 순수 함수 / `CtxError` |
| | `workrepos.js` · `setup.js` · `localreg.js` · `tokenstore.js` | 작업 레포 대장 · CLAUDE 블록과 `.mcp.json` 병합 · 이 PC 의 설치 목록 · 토큰 두기 |
| | `gitauth.js` · `net.js` · `zip.js` · `appinfo.js` | SSH 배포 키 · PAT · CIDR · 속도 제한 · zip · 판 |
| 남은 것 | `indexes.js` | INDEX 생성 — v1.0 에서 부르는 곳이 없다(시험만 · §12) |

### 4.2 `viewer/bin/` — 진입점

| 파일 | 하는 것 |
|---|---|
| `ctx-cli.mjs` | `ctx` — 읽기 명령 · 하위 명령으로 가른다(§8) |
| `ctx-mcp.mjs` | MCP 서버 정의 — 도구 12 · 명함(`CARD`) · 리소스 · prompts · 레포 캐시(HEAD sha) · [MCP 설계서 v2.0](CDP_MCP_설계서_v2.0.md) |
| `ctx-mcp-serve.mjs` | `ctx serve` — HTTP 서버 하나(MCP · 화면 API · 콘솔 API · 사이트 · kit · 설치기) · 개인 서버 · `serve user` · `token`. **2,565줄 한 파일**이다 |
| `ctx-serve-doctor.mjs` | `serve doctor` · `serve init` |
| `ctx-repo.mjs` · `ctx-migrate.mjs` · `ctx-baseline.mjs` · `ctx-import.mjs` · `ctx-gitauth.mjs` | 레포 세우기 · 제자리 이행 · 기준선 · 들이기 · git 자격 |
| `cdp-install.mjs` | 설치기 — 서버가 `/install.mjs` 로 낸다(설치 · `--update` · `--curator`) |

`viewer/server/` 에는 `adapter/read-api.js`(화면 읽기 API `handleRead`) · `adapter/security.js`(`resolveInside`) · `runtime.js` 만 남았다. 로컬 뷰어(`index` · `http` · `tray` · `appstate` · `logger`)와 exe 빌드는 c2f7858 에서 걷었다.

### 4.3 그 밖

| 자리 | 무엇 |
|---|---|
| `viewer/src/` | 화면(React) — [화면 설계서 v1.0](CDP_화면_설계서_v1.0.md) |
| `agent/skills/` · `agent/CLAUDE-프로젝트레포.md` · `agent/CLAUDE-큐레이터.md` | kit 의 원본 — 스킬 다섯(`cdp-work` · `cdp-save` · `cdp-curate` · `cdp-registry` · `cdp-push`)과 CLAUDE 블록 둘. 서버 산출물의 `kit/` 이 된다(`ops/lib/bundle-files.mjs` `copyKit`) |
| `agent/forms/` | 서식집 — 묶음 넷 · 서식 79([서식집 규약](CDP_서식집_규약_v1.0.md)) |
| `manual/` | 설명서 원천 — 넷(사용자 · 큐레이터 · 서버 관리자 · 개발자). 서버가 `/manual` 로 낸다 |
| `ops/lib/` · `ops/deploy/` · `ops/verify/run.mjs` | 빌드 · 산출물 · 설치 스크립트 · 하네스 |
| `test/` | 단위 시험 — `node --test test/*.test.mjs` |
| `site/` | 공식 사이트(정적 SPA) |
| `viewer/fixture/` | 개발용 표본 레포 — 지식만(e4a0383). 개인 서버로 띄운다(`npm run dev:server`) |

---

## 5. save v1.0

### 5.1 역할이 입력을 가른다

| 입력 | writer | 큐레이터 | 비고 |
|---|:--:|:--:|---|
| `work`(id · title · date · touches · touchesEmpty · source · supersedes · tags · body) | ○ | ○ | 예약 태그는 큐레이터만 · `author` 는 보내지 않는다 |
| `vocab`(추가만) · `assets`(`{ ref, name }`) | ○ | ○ | 첨부 바이트는 `POST /api/<r>/assets` 로 먼저 올린다 |
| `dryRun` | ○ | ○ | 검사까지 돌고 되돌린다 — 큐레이터의 「판정표 + diff」 승인이 이것을 쓴다 |
| `sections[]`(`{ coord, applied, body, heading? }`) | — | ○ | `applied` 는 `section` 으로 읽은 값 그대로 · 새 값은 서버가 쓴다 |
| `managed[]`(add · rename · merge · retire · drop) | — | ○ | add 에 `form` 이면 서식의 빈 문서를 찍는다 |
| `edits[]`(`{ file, old, new }`) | — | ○ | `docs/**.md` · `_vocab.md` · `_managed.md` · 뿌리 md — 좌표 섹션 · applied · 어휘 줄 · 규칙 행은 못 건드린다 |
| `examples: "purge"` | — | ○ | 옛 레포의 서식 예시 정리 |
| `work.curates` · 태그 `curate` · `transition` | — | ○ | |
| `baseline[]`(`{ coord, body, src?, asof?, heading? }`) · `work.baseline` | — | ○ | 생성기도 큐레이터 토큰을 쓴다 |

writer 가 큐레이터만 받는 입력(위 표에서 writer 칸이 — 인 줄 · 예약 태그)을 하나라도 보내면 **파일을 만지기 전에** `E_FORBIDDEN { need: 'curate', fields }` — 메시지가 「work 만 다시 보낸다 · 기록은 대기열에 선다」 를 말한다.

### 5.2 처리 순서 — 레포 뮤텍스 안

```
1    권한          write(writer 이상)                                                  E_FORBIDDEN
2    스키마        id · title · body · author 금지 · 본문의 <!-- applied: 금지 · 좌표 형식 · source ·
                   touchesEmpty · sections[].body(applied · 기준선 표지 금지) · baseline[] · vocab[].label ·
                   examples · dryRun · assets(20개 · 이름)                                E_INPUT
2.1  역할          큐레이터가 아니면 curatorOnly(…)                                      E_FORBIDDEN { need: 'curate' }
2.2  큐레이션 기록  curates 모양 · 중복 · touches 없음(touchesEmpty 「큐레이션」 · 태그 curate 를 서버가) ·
                   into ⊂ 이번 sections — 전환 기록은 면한다                               E_INPUT
2.3  기준선 기록    큐레이션과 한 save 에 섞지 않는다 · touches 없음 · source 필수 ·
                   touchesEmpty 「기준선」 · 태그 baseline 을 서버가                         E_INPUT
3    존재          work/<id>.md 가 없어야 한다                                           E_EXISTS
3.5  트리          git status — 커밋 안 된 변경이 있으면                                   E_GIT { reason: 'dirty', paths }
3.7  좌표 0개      touches 가 비면 touchesEmpty(사유) 필수 · 받으면 경고(큐레이션 · 기준선은 경고 없음)   E_INPUT
3.8  첨부          staging 의 ref → 바이트 · 종류 ↔ 확장자 · 합 30 MB                        E_INPUT
4    어휘          vocab[] 를 타입 절 끝에 — 절이 없으면 만들고 경고
5    쓰기 전 검사   loadRepo → before = 검사 결과                                          (V21 의 기준)
5.0  판정 대상      curates 의 id 가 있고 work 종류 · 전환 기록은 암묵 전환 레포에서 한 번      E_INPUT
5.1  예시 정리      examples: "purge"
5.2  섹션 밖 쓰기   edits[] — old 가 정확히 한 번 · 못 쓰는 줄                              E_INPUT · E_CONFLICT
     좌표           touches · sections · baseline 의 좌표가 어휘에 있다                       E_INPUT
5.5  등록부        managed[] 계획 → _managed.md · 새 문서 · 옮김 · 지움                       E_INPUT · E_CONFLICT · E_NOT_FOUND · E_EXISTS
5.6  지우기        drop — 작업 기록이 쓴 섹션 · touches 이력이 있는 문서 거절 ·
                   가리키는 줄은 edits 로 고쳤거나 reviewed 에                              E_INPUT { realSections | touchedBy | refs }
6    섹션          새 등록부로 자리 · 본문에 섹션 레벨 이하 헤딩 금지 · 지금 기준선 블록은 그대로 다시 붙인다 ·
                   보낸 applied ≠ 지금 applied                                           E_CONFLICT { coord, expected, current, currentWork, currentCuration, content, truncated }
6.2  기준선        블록만 통째로 — 섹션이 없으면 블록만 든 섹션(applied: null) · 문서 전체(—) 좌표는 안 받는다
6.5  첨부          work/assets/<id>/<name> 에 새 파일로(있으면 E_EXISTS)
6.7  그림 경고      본문이 가리키는 그림이 레포에 없다 · 어느 본문도 안 가리키는 첨부
6.8  HTML 경고      HTML 시각 자료에 본문이 짧다 · 외부 자원(CSP 가 막는다) · CDN
7    기록          work/<id>.md — 정해진 순서의 프론트매터(author = 토큰 사용자) + body
8    검사          loadRepo → newErrors(before, after) 가 있으면 되돌리고                  E_CHECK { findings }
                   원래 있던 error 는 warnings 에 한 줄 · warn 은 종류마다 한 줄
     dryRun        여기서 되돌리고 커밋 · 미러 없이 답한다
10   커밋          바뀐 경로만 add · --no-verify · 작성자 = 토큰 사용자                       E_GIT
11   미러          뮤텍스 밖 · 레포당 큐 · 1.5초까지 기다려 실제 결과를 답한다
```

옛 9단계(INDEX 재생성)와 9.5(등록부 사본 다시 찍기) · 5.4(어긋나는 산문 거절)는 없다(I9 · V4). 파일을 만지기 전에 원본을 전부 들고 시작하고(`Snap`), 어느 단계에서 실패해도 만지기 전으로 되돌린다 — 새로 만든 파일 · 폴더까지.

**응답** — `{ commit, id, sections, baseline?, vocab, managed, managedChanges?, assets?, edits?, examples?, dropped?, warnings, mirror, mirrorReason?, mirrorLast? }`(MCP 는 `repo` 를 앞에 붙인다). `dryRun` 이면 `{ dryRun: true, … , mirror: 'off' }` 이고 `commit` 이 없다.

### 5.3 자기 변경분으로만 막힌다 — V21

- save 는 **쓰기 전 레포**와 **쓴 뒤 레포**를 같은 검사(`runBuiltinCheck`)로 본다. 쓴 뒤에만 있는 error 가 이 save 가 만든 것이고, 그것만 막는다(`check.newErrors`).
- 열쇠는 `findingKey` — 종류 · 기록 id · 좌표 · 경로 · 설명이고 **설명 속 숫자는 지운다**. 줄 번호 · 건수는 다른 기록이 더해지면 바뀌는데, 그것 때문에 원래 있던 오류가 「새 오류」 가 되면 안 된다.
- 쓰기 전 검사는 어휘를 더한 **뒤**에 한다 — 어휘 추가는 오류를 만들지 않는다.
- writer · 큐레이터가 같다. 개편안 §5.2 는 writer 만 적었고 V21 이 둘로 넓혔다.

### 5.4 applied

- 섹션의 `applied` 는 **서버가 계산한다** — 이 save 의 `curates` 중 판정이 keep 이 아니고 `into` 에 그 좌표가 있는 기록의 가장 늦은 것(날짜 → id). 큐레이션 기록의 id 가 들어가 「어느 기록까지 반영했나」 가 깨지던 것(개편안 H3)을 막는다.
- 판정 없이 섹션을 보낸 큐레이터의 save(큐레이터 자신의 작업 기록 + 섹션)는 그 save 의 기록 id 가 `applied` 다.
- 보낸 `applied` 는 **낙관 잠금으로만** 쓴다 — 지금 값과 다르면 `E_CONFLICT` 이고, 거절에 지금 본문(8,000자까지)과 누가 언제 어느 기록으로 바꿨나가 실린다. `section` 을 다시 부르지 않고 그 위에 다시 만든다.

### 5.5 큐레이션 · 기준선 · 전환 기록

| | 큐레이션 기록 | 기준선 기록 | 전환 기록 |
|---|---|---|---|
| 만드는 길 | `cdp-curate` 의 save · 화면 「기록으로 둠」(`POST /api/<r>/curate` · keep 만) | `ctx baseline push` · `POST /api/<r>/baseline` | `ctx migrate` 1단계 |
| 표지 | `curates` 키 · 태그 `curate` | `baseline` 키 · 태그 `baseline` | `curates` 키 · 태그 `transition` |
| touches | 없다(`touchesEmpty: 큐레이션`) | 없다(`touchesEmpty: 기준선`) | 없다 |
| 섹션 | reflect · new 의 `into` 좌표는 **같은 save 의 `sections` 에** 있어야 한다 — 바뀐 것이 없으면 `section` 의 `content` 그대로 보낸다 · keep 은 섹션 없이 | 블록만 — 블록 밖 · applied 그대로 | 쓰지 않는다 — `into` 검사를 면한다 |
| 제약 | 대상은 work 종류 · 같은 id 두 번 금지 | 큐레이션과 섞지 않는다 · source 필수 | 암묵 전환 레포에서 **한 번** |

### 5.6 커밋 · 동시성

- **커밋 훅을 타지 않는다**(`--no-verify` · V5) — 커밋할 트리를 8단계가 같은 함수로 이미 봤다. 훅은 레포 안 옛 번들로 같은 검사를 한 번 더 돌았고, 판이 어긋나면 옛 규칙으로 막았다(개편안 H9 · 40초 사례).
- `git add -- <바뀐 경로>` 만 — 서버 트리의 다른 것이 딸려 들어가지 않는다. 작성자 `<user> <<user>@cdp>`.
- 커밋 상한 120초 — 넘으면 git 을 **프로세스 나무째** 죽이고 돌아온 뒤 `index.lock` 이 풀리기를 기다려 **HEAD 로** 판정한다(커밋이 이미 됐으면 성공 · 남이 쥔 잠금이면 두 번까지 다시 · 5분이 지나도 잠겨 있으면 파일을 둔 채 `E_GIT { reason: 'locked' }`).
- **뮤텍스는 레포당 하나**(`core/lock.js`) — save · 미러 push 큐 · 「origin 과 맞추기」 · 「트리 되돌리기」 가 같은 줄에 선다. 미러 push 는 뮤텍스 밖이다.

---

## 6. 검사 v1.0

`core/check.js` `runBuiltinCheck` 하나를 save(전 · 후) · MCP `check` · 화면 `/api/<r>/check` · `ctx check` 가 부른다. **막는 것은 save 뿐이다**(V21) — 훅은 없고 `ctx check` 는 사람이 보는 exit code 다.

| 등급 | 종류 |
|---|---|
| **error** | `missing-field` · `frontmatter` · `unregistered-coord` · `broken-supersedes` · `cycle` · `id-mismatch` · `agenda-status` · `status-value` · `dup-anchor` · `registry-path` · `orphan-applied` · `curates-shape`(새 — 판정 모양 · 대상 없음) |
| warn | `example-coord` · `deprecated-coord` · `body-only-coord`(큐레이션 · 기준선 기록은 뺀다) · `registry-outside` · `registry-shadowed` · `registry-level-mix` · `registry-missing` · `doc-ref-dangling` · `curation-stale`(새 — 가장 오래된 대기 > 14일) |
| info | `no-touches-key` · `thin-body` · `curation-pending`(새 — 미반영 섹션 · 「파생 누락」 을 대신한다) · `single-coord` |

**걷거나 내린 것** — `derive-missing`(error → info `curation-pending`) · 기록 쪽 `dangling-anchor`(error → 대기열의 「등록부 있음 · 섹션 없음」 · H1) · `derive-sameday`(K9) · INDEX 불일치(I9) · `registry-head` · `registry-prose`(등록부 사본 · V4) · 훅 미설치 경고(V5).

finding 은 `{ sev, kind, label, items, fix? }` — `fix` 는 누가 무엇으로 치우는가다. 개편안 §5.5 가 적은 새 경고 중 `section-journal` · `derive-outgrows-source` · `form-unknown` 과 「기준선 블록 형식」 error 는 아직 없다(§12).

---

## 7. 서버

한 프로세스 · 한 포트(기본 7374)가 MCP · 화면 · 콘솔 · 사이트를 낸다. 경로 첫 조각이 얼굴을 고른다.

### 7.1 경로

| 경로 | 인증 | 내용 |
|---|---|---|
| `GET /healthz` | 없음 | `{ ok, built, repos: n, mirror: { ok, lag, off, diverged, behind } }` — **레포 이름이 없다**(집계만) |
| `GET /install.mjs` | 없음 | 설치기 — 서버 주소 한 줄 + 설치기 원문. 레포 · 사람 · kit 은 없다 |
| `/assets/*` 등 정적 자산 | 없음 | 화면 빌드 |
| `/` · `/manual/*` · `/setup` · `/login` | 없음(`--private-pages` 면 세션) | 사이트 SPA |
| `GET /site/info` · `/site/manual/<책>` | 없음 | 판 · 집계 · 설명서 목록과 원문 — 레포 이름 · 사람 이름 없음 |
| `POST /setup` | 부트스트랩 코드 | 명부가 비었을 때 한 번 — 첫 관리자 + 토큰 원문 1회 + 세션 · 재인증 쿠키 |
| `POST /login` · `/logout` | 토큰 · 쿠키 | 세션 쿠키 `cdp_s`(12시간). 개인 서버만 `GET /login?auto=<토큰>` |
| `/console/*` · `/r` · `/r/<레포>/…` | 세션 | 화면 SPA. 볼 수 없는 레포는 `/r?from=<이름>` 으로(없는 레포와 같은 길) |
| `POST /mcp` · `/mcp/<레포>` | Bearer | MCP — [MCP 설계서 v2.0](CDP_MCP_설계서_v2.0.md) |
| `GET /me` | 쿠키 · Bearer | 누구 · 역할 · `write` · `curate`(admin 은 `['*']`) · 재인증 여부 · 토큰 만료 · 볼 수 있는 레포 |
| `GET /repos` | 쿠키 · Bearer | 볼 수 있는 레포와 미러 상태 한 값 · 사유(콘솔 단추 이름은 admin 에게만) |
| `/workrepos` · `/workrepos/<id>` · `/workrepos/<id>/applied` | 쿠키 · Bearer | 작업 레포 대장 — 조회 · 설치 보고는 볼 수 있으면 · 등록 · 삭제는 write |
| `GET /kit/<레포>` | 쿠키 · Bearer | 역할별 kit — zip · `?workrepo=<id>` 꾸러미 · `&as=json` |
| `/api/<레포>/…` | 쿠키 · Bearer | 화면 API(§7.2) — 볼 수 없는 레포는 404 |
| `/admin/*` | 쿠키 + admin(+ `--admin-from` 대역) · **쓰기는 재인증** `cdp_su`(15분) | 콘솔 API(§7.3) |

### 7.2 화면 API — `/api/<레포>/…`

| 메서드 · 경로 | 판정 | 내용 |
|---|---|---|
| `GET /repo` | read | `repoInfo()` — 수 · 검사 건수 · `curation: { queue, oldestDays, stale, pendingSections, last }`(메뉴 배지 재료) |
| `GET /status` | read | `repoStatus()` |
| `GET /docs` | read | 작업 기록 목록(행마다 `curation: { state }`) · 그 밖 문서 |
| `GET /docs/<id \| 경로>` | read | 상세 — 관리 문서면 `form` · `sectionStates[]`(`cstate` · `pending[]`) · 작업 기록이면 `curation` |
| `GET /next` · `/vocab` · `/timeline` · `/search` · `/check` · `/managed` · `/coord` | read | 뻗어나가기 · 어휘 트리 · 좌표 시간축 · 검색 · 검사 · 관리 문서 목록 · 좌표 전모 |
| `GET /file` · `/archive` | read | 레포 안 파일(SVG · HTML 은 sandbox CSP) · zip(`managed` · `work`) |
| `GET /managed-docs` | read | 관리 문서 사용 현황 · 지우기를 막는 까닭 · 「지운 관리 문서」 |
| `GET /queue` | read | 대기열 `{ items, total, oldestDays, implicit }` |
| `GET /queue/<id>` | **curate** | 판정 재료 + 등록부 없는 타입마다 비슷한 서식 5 · `canonical`(= `together`) |
| `GET /curations` | read | 큐레이션 이력 — 판정 · 반영 섹션 수 · 새 문서 |
| `GET /forms` · `/forms/<묶음>/<번호>` | read | 서식 목록(이 레포가 쓰는 서식은 `used`) · 서식 하나(`stamp` 포함) |
| `POST /assets` | write | 첨부 올리기(10 MB · png · jpg · gif · webp · pdf · html — 내용으로 가린다 · 24시간 staging) → `ref` |
| `POST /curate` | **curate** | `{ verdict: 'keep', ids(1~50), reason }` → 큐레이션 기록을 지어 save |
| `POST /docs-drop` | **curate** | `{ docs(1~10), reason, edits?, reviewed?, dryRun? }` → 정리 기록(`docs-prune`)을 지어 save |
| `POST /baseline` | **curate** | `{ source, asof?, items, vocab?, managed?, dryRun? }` → 기준선 기록을 지어 save |

이 PC 를 만지는 옛 로컬 라우트(`/setup` · `/open` · `/git/*` · `/sync` · `/diag` …)는 **없다** — 막은 것이 아니라 없는 것이다(404).

### 7.3 콘솔 API — `/admin/*`

판정 순서 — 세션(401) → admin(403) → 대역(403) → 쓰기면 재인증(401 `E_REAUTH`). 모든 쓰기가 `<data>/logs/auth.log` 에 `admin <행위> · <행위자> · <대상> · <바뀐 값>` 으로 남는다.

| 경로 | 내용 |
|---|---|
| `GET /overview` | 카드 · 경고(관리자 없음 · 토큰 만료 임박 · 더러운 트리 · 갈라짐 · 밀림 · origin 앞섬 · kit 낡음 · 진단 fail · 주소와 다른 레포에 쓴 save · 고아 등록) · 최근 save · 감사 꼬리 |
| `GET · POST /users` · `PATCH /users/<이름>` | 명부 — `role` · `repos` · `active` · `label` · **`curate`**. 자기 역할 · 활성은 못 바꾼다 · 마지막 admin 을 잃지 않는다 |
| `/tokens` · `/tokens/<id>[/reissue \| /revoke]` | 발급(원문은 응답에 한 번) · 재발급 · 폐기(줄은 남는다) · 메모 · 만료 |
| `GET · POST /repos` | 서버의 레포 전부(행마다 미러 · 볼 수 있는 사람 · `curation`) · 세우기(빈 틀 · `recordsFrom` · `clone` · `grant`) |
| `POST /repos/<r>/origin` · `DELETE /repos/<r>` · `POST /repos/<r>/sync \| push \| restore` | origin 연결 · 휴지통(`<data>/trash/`) · origin 과 맞추기 · 다시 보내기 · 트리 되돌리기 |
| `/gitauth[/key \| scan \| trust \| test]` | SSH 배포 키 · 호스트 키 · 원격 시험(비밀은 브라우저를 건너지 않는다) |
| `GET /workrepos` · `/doctor` · `/server` · `/audit` · `/log` · `POST /sudo` | 대장 전부 · 진단(60초 캐시) · 설정값 · 로그 꼬리 · 재인증 |

### 7.4 인증

- **명부가 근거다** — 토큰은 신원만 증명한다. 매 요청 `decide`(토큰 해시 → 폐기 → 만료 → 명부에 있나 → 활성 → 권한)를 탄다. 쿠키는 서명만 하고(`<data>/secret`) 권한은 매 요청 명부에서 읽는다 — `active: false` 는 다음 요청부터 막힌다.
- 토큰 만료 기본 — admin 30일 · 나머지 90일. 원문은 발급 응답에 한 번 · 파일에는 sha256 만.
- MCP 는 Bearer 만, 브라우저 경로(`/api` · `/r` · `/kit` · `/admin` · `/me` · `/repos` · `/workrepos`)는 쿠키(Bearer 도 받는다).
- **Origin** — 붙어 있으면 같은 출처 · 루프백 · `--public-url` 만 통과(아니면 403). MCP 호스트는 Origin 을 보내지 않는다.
- 로그인 · 마법사 · 재인증 POST 는 IP 당 분당 20. 실패 문장은 하나(「토큰을 확인하세요」)이고 구분은 로그에만.
- `--auth` 없이 루프백 밖에 바인드하면 시작을 거부한다. `--auth` 가 없으면 개발용이다 — 모두 viewer 로 통과(루프백만).
- 몸통 상한 — MCP 2 MB(`content-length` 로 받기 전에 끊는다 · `Expect: 100-continue` 도) · 첨부 10 MB · 기준선 16 MB.

### 7.5 레포 저장소 · 캐시

- **등록은 폴더를 두는 것이다** — `<root>/<이름>/` 에 `_vocab.md` 가 있으면 레포다. 목록은 60초마다(비어 있으면 2초), 모르는 이름이 오면 2초에 한 번 다시 훑는다(`ensure`).
- **서버가 유일한 작성자다.** 더러운 트리는 save 가 거절하고 시작할 때 로그에 한 줄을 남긴다. 사람이 origin 에 먼저 쓰면 막지 않고 보이게 한다(미러 `behind` · `diverged`).
- **캐시가 둘이다** — MCP 의 `makeRepoCache`(스탬프 = HEAD sha + `_vocab` · `_managed` mtime + `docs/` · `work/` 최상위 md 수 · 최대 mtime · 바뀌면 통째로 다시 읽는다)와 화면의 `Store`(감시 끔 — save · 「기록으로 둠」 · 지우기 · 기준선 · 맞추기 · 되돌리기 뒤 `store.reload`). 둘 다 `loadRepo` 를 부른다. HEAD sha 는 v1.0 에 들어왔다 — `.git/HEAD` mtime 은 커밋 · ff pull 에 안 바뀌어 하위 폴더 문서만 바뀐 커밋 뒤 옛 섹션을 냈다(T6 · c57fb1a). 개편안의 「RepoCache 하나 · save 안에서도 재사용」 은 아직이다(§12).

### 7.6 미러

| 상태 | 뜻 |
|---|---|
| `off` | 원격 · upstream 이 없다 |
| `ok` | origin 과 같다 |
| `lag` | 서버 커밋이 origin 에 못 갔다 — 사유 `non-ff` · `auth` · `net` · `protected` · `locked` · `no-upstream` · `unknown`(`git.classifyPushError`) |
| `diverged` | 서로 모르는 커밋이 있다 — **기계는 합치지 않는다.** 사람이 셸에서 rebase 한 뒤 「다시 보내기」 |
| `behind` | origin 만 앞섰다 — 누군가 서버 밖에서 썼다 · 「origin 과 맞추기」(ff) |

`--mirror` 면 save 뒤 레포당 큐 하나로 push 한다(도는 중에 또 오면 끝난 뒤 한 번 더). non-ff 면 fetch 한 번으로 ahead/behind 를 채운다. 주기 push · 시작 시 push · 상태 파일은 없다 — 재시작하면 마지막 사유를 잊고 doctor 가 다시 낸다. 판정은 `core/mirror.stateOf` 하나 · 사람의 한 줄은 `describe`(정상이면 null).

### 7.7 개인 서버

`ctx serve --personal <레포 경로>` — 서버 없는 팀 · 한 사람의 자리다(모드 A 를 대신한다 · V1 · 3beb924).

| | |
|---|---|
| 레포 | 그 폴더 하나(`_vocab.md` 가 있어야 · 폴더 이름이 레포 이름) |
| 바인드 | 127.0.0.1 · 포트 기본 7400 |
| 명부 | `<data>`(기본 `~/.cdp/personal/<레포>`)에 스스로 만든다 — OS 사용자 이름 하나 · admin · `repos: *` · 토큰 무기한(원문을 `personal.token` 0600 에) |
| 들어가기 | 시작할 때 화면 주소 `/login?auto=<토큰>` · MCP 주소 · 큐레이터 설치 한 줄을 찍는다 |
| 코드 | 팀 서버와 **같은 코드 · 같은 save · 같은 화면** |

개발 서버도 이것이다 — `npm run dev:server`(= `ctx serve --personal viewer/fixture --port 7373`) 위에 vite(`npm run dev`)가 화면을 낸다.

### 7.8 로그

| 파일 | 무엇 | 안 적는 것 |
|---|---|---|
| `<data>/logs/serve.log`(3×1 MB 회전) | 시각 · user · 레포(실제와 주소가 다르면 `실제←주소`) · 메서드 · 도구 · 열쇠(좌표 · id · `work.id`) · ms · 결과 코드 · IP · 토큰 id(앞 8자) | 본문 · 검색어(`search` 는 건수만) · 토큰 |
| `<data>/logs/auth.log`(회전 없음 · 이력) | 명부 · 토큰 · 레포 세우기 · 치우기 · 연결 · 미러 복구 · git 자격 · 작업 레포 등록 · 삭제 · 재인증 | 토큰 원문 |

---

## 8. CLI — `ctx`

**읽기와 서버 관리만 한다** — 쓰기 길은 서버 save 하나다(I2). 서버 번들의 `bin/ctx.mjs` 하나로 돈다 — 지식 레포 안에는 더 들어가지 않는다.

| 명령 | 하는 것 |
|---|---|
| `ctx check [--json]` | 검사 — error 가 있으면 exit 1 |
| `ctx docs [<문서 \| 관리번호>]` · `match` · `where` · `search` · `term` · `brief` | 읽기 — MCP 와 같은 `core/tools.js` 의 모양 |
| `ctx version` | 번들 시각 · `mcp: http` |
| `ctx serve --root <폴더> [--auth --data --bind --port --mirror --web --forms --kit --manual --private-pages --admin-from --public-url --prompts]` | 서버 |
| `ctx serve --personal <레포>` | 개인 서버(§7.7) |
| `ctx serve user add \| set \| list` · `token [list \| reissue \| set \| revoke]` · `git-auth` · `doctor` · `init` | 명부(`--role` · `--curate`) · 토큰 · origin 자격 · 준비물 검사 · 첫 관리자 |
| `ctx repo new <경로> [--title --origin --push --dry --records-from <옛 레포>]` · `repo list --root <폴더>` | 레포 세우기 · 다시 세우기 · 목록 |
| `ctx baseline extract <옛 레포> --doc <문서> [--src --asof --form --to]` · `baseline push <json> --server <주소> --repo <레포>` | 기준선 뽑기 · 올리기(`CDP_TOKEN` = 큐레이터) |
| `ctx migrate <레포> [--dry --by <이름> --keep-tools]` | 제자리 이행(§10.2) |
| `ctx import-dir <원본> --repo <지식레포>` | md 폴더를 `work/` 로 들이기 |

**없앤 명령** — `mcp`(stdio) · `setup` · `index` · `derive` · `apply` · `sync` · `examples` · `docs drop` · `package`. 부르면 무엇으로 바뀌었는지 한 줄로 답하고 exit 2 다(e252f40).

---

## 9. 배포

### 9.1 산출물 둘

태그 `v*` 에서 `.github/workflows/release.yml` 이 만든다 — 태그와 `package.json` 의 판이 다르면 실패한다.

| 산출물 | 담는 것 | 만드는 것 |
|---|---|---|
| `cdp-server-v<판>.tar.gz` | `bin/ctx.mjs` · `ctx` · `ctx.cmd` · `web/` · `forms/`(서식집) · `kit/`(스킬 다섯 · CLAUDE 블록 둘) · `manual/`(+ 그림 셋) · `deploy/`(유닛 · `install.sh` · `upgrade.sh` · Dockerfile · compose · 설치절차) · `README.md` | `npm run release:server` — 빠진 것이 있으면 세어 알리고 exit 1(I13) |
| `cdp-site-v<판>.zip` | 공식 사이트 정적 폴더 | `npm run build:site`(prerender · 누출 검사) |

`SHA256SUMS` 가 같이 붙는다. **없앤 것** — win zip · exe(SEA) · `knowledge-repo-<묶음>` · 서버 산출물의 `packages/`(1403331).

### 9.2 설치 · 갱신 길 셋

| 길 | 무엇 |
|---|---|
| ① 서버 | `sudo bash deploy/install.sh --bind <IP>` → 끝에 찍힌 부트스트랩 코드로 브라우저 `/setup` 에서 첫 관리자. 갱신은 `sudo bash deploy/upgrade.sh <tar>` — `bin/ctx.mjs` 를 갈고 `web/` · `forms/` · `kit/` · `manual/` 을 **비우고** 넣는다(`.bak` 한 세대 · `/healthz` 의 `built` 와 자산 해시로 확인 · 다르면 되돌림). 명부 · 대장 · 레포 · git 자격은 안 건드린다 |
| ② 지식 레포 | 콘솔 「새 지식 레포」(빈 틀 · 기록만 옮겨 오기 · origin 에서 clone) 또는 `ctx repo new` |
| ③ 에이전트 | 설치 한 줄(서버의 `/install.mjs`) · `--update`(이 PC 에 이 서버로 깐 작업 레포 전부) · `--curator`(큐레이터 폴더) — [MCP 설계서 §11](CDP_MCP_설계서_v2.0.md#11-kit-과-설치) |

### 9.3 번들 옆을 찾는 순서

| 무엇 | 순서 |
|---|---|
| 서식집 | `--forms` → `CDP_FORMS` → 번들 옆 `forms/` → 소스 `agent/forms`. 그리고 **팀 서식** `<data>/forms/`(upgrade 가 덮지 않는다 · 같은 id 면 팀 서식이 이긴다) |
| kit | `--kit` → `CDP_KIT` → 번들 옆 `kit/` → 소스 `agent/` |
| 설명서 | `--manual` → 번들 옆 `manual/` → 소스 `manual/`(`*_설명서.md` 가 있는 곳) |

`ctx serve doctor` 가 kit(없으면 fail) · 서식집(없으면 warn)을 본다.

---

## 10. 이행 — 옛 레포를 v1.0 으로

레포 플래그는 두지 않았다(V14) — 옛 규칙 · 새 규칙 두 갈래가 모든 판정에 생기기 때문이다. 옛 레포는 아래 넷 중 하나로 넘어온다.

### 10.1 읽기만 — 암묵 전환

판을 올리기만 해도 옛 레포는 읽힌다. 큐레이션 기록이 없고 옛 파생 이력이 있으면 `buildCuration` 이 옛 판정이 남긴 기록만 대기로 본다(§3.6). 섹션 없는 등록부 좌표를 건드린 기록은 옛 규칙에서 커밋될 수 없었으니 v1.0 뒤에 들어온 것으로 보고 대기로 둔다.

### 10.2 제자리 이행 — `ctx migrate <레포>` (gdi)

**서버를 멈추거나 아무도 쓰지 않을 때** 돌린다 — 이 프로세스는 서버의 save 뮤텍스를 공유하지 않는다. `--dry` 로 먼저 본다.

| 단계 | 하는 것 |
|---|---|
| 1 전환 기록 | `planTransition` — 대기가 아닌 work 기록마다 touches 중 **섹션이 있는 좌표**가 있으면 `reflect`(into = 그 좌표들), 없으면 `keep`(사유 「등록부 없는 좌표만」 · 「좌표 없는 기록」). 대기 기록은 판정하지 않고 둔다. **날짜 경계로 자르지 않는다** — 원문 날짜를 단 편입 기록이 경계 앞으로 숨는다. save 한 번(태그 `transition` · 큐레이터 권한) |
| 2 서식 예시 | 남았으면 `examples: "purge"` save 한 번 |
| 3 도구 층 | `git rm -r` — `bin` · `.githooks` · `.claude` · `tools` · `MANUAL*.md` · `CLAUDE.md` · `TEMPLATE-work.md` · `INDEX*.md`(`migrate.TOOL_LAYER`) · `core.hooksPath` 해제 · 커밋 하나(`--no-verify`). README 가 걷은 파일을 가리키면 줄을 알리기만 한다 |
| 다음 | 작업 레포마다 설치 한 줄 `--update` · 큐레이터는 `queue` 로 남은 대기열을 다룬다 |

개편안 §9.2 의 2단계 중 `## 작성지침` 섹션 삭제 · 머리 표 칸 삭제 · 서식 표지 달기 · 서식 그대로인 문서 drop 은 `ctx migrate` 에 없다(§12) — 큐레이터가 `cdp-registry` 로 한다.

### 10.3 다시 세우기 — `--records-from` (dpms_wiki)

`ctx repo new <새 경로> --records-from <옛 레포>` · 콘솔 「새 지식 레포」 의 「기록만 옮겨 오기」(admin · `recordsFrom`). 판정은 `core/rebuild.js` + `reponew.newRepo` 하나다.

| 옮긴다 | 옮기지 않는다 |
|---|---|
| work 종류의 기록 파일 그대로(글자 하나 안 바꾼다) · `work/assets/<id>/` | 관리 문서 · 등록부 행 · 옛 기계 기록(`curation` · `baseline` · `system` 종류) |
| `_vocab.md` 에서 **옮긴 기록이 touches 하는 좌표의 줄**과 그 타입 절(라벨 · aliases · deprecated 그대로 · `example:` 표시는 뗀다) | 아무 기록도 안 건드린 좌표 · 서식 예시 |

첫 커밋 하나에 들어가고(「지식 레포 다시 세움 — <옛> 의 작업 기록 n건을 옮겼다」), 옮긴 기록은 **전부 대기열**에 선다. 옛 레포는 그대로 둔다 — 이름을 바꿔 읽기로 두고 새 레포에 이름과 origin 을 주는 것은 사람의 일이다(개편안 §9.1).

### 10.4 옛 섹션을 기준선으로

옛 레포의 대상형 섹션(테이블 · 코드 · 화면)은 대개 기록이 아니라 섹션에만 있었다 — 기록만 옮기면 사라진다. 그것은 추출물이었으니 기준선 블록이 제자리다.

```
ctx baseline extract <옛 레포> --doc docs/…/DE_431_테이블정의서.md [--form public-si/DE_431] [--to docs/테이블정의서.md] > base.json
ctx baseline push base.json --server <주소> --repo <새 레포>          # CDP_TOKEN = 큐레이터
```

`extractFromDoc` 이 등록부 행이 있는 레벨의 섹션마다(예시 아닌 좌표) 글에서 옛 이력(`**변경**` · `**경과**` 와 그 목록)을 떼고 블록 본문으로 싣는다. 서식은 주지 않으면 관리번호로 찾는다(public-si 우선). JSON 은 `{ source, asof, managed: [{ op: 'add', pattern, doc, form }], vocab, items: [{ coord, heading, body }] }` — 프로젝트의 생성기도 같은 모양을 만들어 `push` 한다.

---

## 11. v1.0 문서에서 바뀐 것

| v1.0 문서 | v2.0 |
|---|---|
| §0.4 두 층 | 그대로 |
| §1.1 정본 문서 · `### 변경` | 관리 문서 · 섹션 — `**경과**` 목록 · 서식 표지 · 기준선 블록(§3.4) |
| §1.2 등록부에 없는 좌표는 결함이 아니다 | 그대로 + 등록부 있음 · 섹션 없음도 결함이 아니다(§3.5) |
| §1.3 좌표를 붙이는 기준(바꾼 것만) | 그대로 — 0개는 사유(`touchesEmpty`)와 함께 |
| §1.4 `later()` 하나 · 같은 날짜 | `later()` 는 그대로 하나 · 미반영은 큐레이션 계산(§3.6) · 같은 날 경고는 지웠다 |
| §1.5① 밀림은 상태가 아니다 · 파생 누락 = 오류 | **뒤집혔다** — 미반영은 상태다(I7) |
| §1.5②③ 미결 · 제안 · 덮힘 | 그대로 — `status` 에 쓸 수 있는 값이 없다 · `supersedes` 는 참조 |
| §1.7 보증은 git 훅 | save 의 검사(V21) + 도구가 미반영을 싣는다(I7) |
| §2.1 `cdp.exe` · 트레이 | 없다 — 서버 하나 · 개인 서버(§7.7) |
| §2.2 층 구조 · `core/` 표 | §4 |
| §2.3 HTTP 어댑터(로컬) · 보안 경계 | §7 — 서버 하나 · 명부 · 쿠키 · Origin |
| §2.4 화면 | [화면 설계서 v1.0](CDP_화면_설계서_v1.0.md) |
| §2.5 CLI · `bin/ctx` 실행기 | §8 — 레포 안 번들 없음 · 쓰기 명령 없음 |
| §2.6 SEA | 없다 |
| §2.7 CRLF | 그대로(I13) — 훅 셔뱅 문제는 훅과 함께 사라졌다 |
| §2.8 폴더 · 릴리스 | §4.3 · §9 |
| 제3부 불변조건 14 | §1 I1~I13 |
| 제4부 거부한 설계 | §13 |

---

## 12. 개편안과 코드가 어긋난 곳 · 남은 것

코드가 맞다. 아래는 2026-10-07(`d5e0a1c`)에 적은 것이고, 그 뒤 고친 줄에는 「→ **고침**」 과 커밋을 붙였다. 고치지 않고 둔 것의 까닭은 [TODO §5](../dev/v1.0_개편_TODO.md#5-나온-것) 끝 줄.

| 개편안 · TODO | 적은 것 | 코드 |
|---|---|---|
| §5.1 모듈 배치 | `core/model · judge · plan · read` · `node/` · `server/routes/*` · `cli/` · `core/layout.js` | 하지 않았다 — `core/` 평평 · `ctx-mcp-serve.mjs` 2,565줄 한 파일 · 예약 태그는 `save.js` · 시스템 태그는 `curation.js` 에 |
| §5.1 캐시 | RepoCache 하나(HEAD sha) — save 안에서도 재사용 · 도구 · 화면 공용 | MCP 캐시(HEAD sha 스탬프)와 화면 `Store` 둘 · save 는 `loadRepo` 를 두 번(전 · 후) · `repoInfo()` 가 부를 때마다 검사를 돈다 |
| §4.4 · TODO §1.2 미반영 | `later(applied, C) ∪ (대기열 ∩ C)` | 큐레이션된 레포는 `대기열 ∩ C` 만 — reflect 의 `into` 에서 빠진 좌표는 미반영으로 다시 서지 않는다(코드 주석: 「판정을 받은 기록은 큐레이터가 이미 봤다」) → **고침** — `later(applied, C)`(기록으로 둠 빼고) ∪ (대기열 ∩ C) · applied 는 뒤로 가지 않는다(8d92edf) |
| §5.2 writer 의 `edits` | `work/` · `docs/` 밖만(사실상 README) 허용 | `edits` 는 통째로 큐레이터만 |
| §5.2 `curation-stale` | curator · admin 에게만 — writer 응답에 매번 싣지 않는다 | save 가 warn 을 전부 `warnings` 에 싣는다 — writer 응답에도 간다 → **고침** — writer 응답에서 뺀다(eeaa1c8) |
| §5.3 save 도구 | viewer 에게 안 보인다 | 모든 연결에 등록된다 — viewer 가 부르면 `E_FORBIDDEN`(쓰기 권한 없음) → **고침** — viewer 에게 등록하지 않는다(8d92edf) |
| §6.3 · A6 역할별 kit | 작업 레포에는 writer kit · 큐레이터 kit 은 큐레이터 폴더에 | 작업 레포 설치(`/kit/<레포>?workrepo=`)도 **부른 사람의 역할**로 kit 을 고른다 — admin · 큐레이터가 깔면 큐레이터 kit 이 그 작업 레포에 들어가고, 대장은 writer kit 해시와 대 보므로 「낡음」 으로 보일 수 있다(코드로 읽은 것 · [MCP 설계서 §14](CDP_MCP_설계서_v2.0.md#14-코드와-개편안이-어긋난-곳)) → **고침** — 등록된 작업 레포(`?workrepo=`)는 늘 writer kit(8d92edf) |
| §5.5 새 경고 | `section-journal` · `derive-outgrows-source` · `form-unknown` · 기준선 블록 형식 error | `curation-stale` 만 있다 |
| §4.2 지운다 | `status` · `{ id, scope }` supersedes · `knowledge/` 층 | `status` 는 값이 있으면 error(그대로) · 나머지 둘은 읽기가 남았다 |
| V8 섹션 레벨 | `##` 하나 · 새 행에서 `###` 를 뺀다 | 서식(`lintForm`)은 `## {값}` · `—` 만 받지만 save 의 `managed.add` 는 `level` 0~6 을 받는다 |
| I7 섹션을 내보내는 모든 자리 | 미반영을 같이 | MCP 리소스 `cdp://{repo}/section/{coord}` · prompt `load` · 화면이 안 쓰는 `/api/<r>/coord` 는 섹션 글만 낸다 → **고침** — 리소스 · prompt · `/coord` 도 미반영을 같이(`sectionMarkdown` · 8d92edf) |
| H4 | 관리 문서에 YAML 을 달면 섹션이 밀린다 | 표지를 주석으로 둬 **피했다**(V6). 근원 — 섹션 줄은 프론트매터 뒤 기준(`parseManagedSections(body)`)이고 `sliceSection` 은 전체 글로 자른다 — 은 그대로다. 프론트매터가 있는 관리 문서의 `section` · `E_CONFLICT.content` 는 어긋난다 |
| §9.2 2단계 | 서식 잔재 — 예시 purge · 서식 그대로인 문서 drop · `## 작성지침` · 머리 표 칸 · 서식 표지 | `ctx migrate` 는 예시 purge 만 한다 |
| §8.1 도구 | `ctx forms list · show · check` | CLI 에 없다 — 서식은 MCP `forms` · 화면 서식집 · `GET /api/<r>/forms` → **고침** — `ctx forms list · show · check`(eeaa1c8) |
| TODO §1.3 | `/site/info` 에도 `curate` | `/me` 에만 있다(화면은 `/me` 를 쓴다) → **고침** — `/site/info` 에도 `curate`(8d92edf) |
| W1 | `derive` · `apply` 삭제 | MCP · CLI 에서는 지웠고 `core/tools.js` 의 `toolDerive` · `toolApply` 가 부르는 곳 없이 남았다. 같은 꼴 — `ctx-mcp-serve.mjs` 의 `collectKit`, `core/indexes.js`(시험만) → **고침** — `toolDerive` · `toolApply` · `collectKit`(8d92edf) · `core/indexes.js`(a517d12) 삭제 |
| W2 · §7.2 | 로컬 얼굴 없음 | 화면 코드에 남았다 — [화면 설계서 §12](CDP_화면_설계서_v1.0.md#12-코드와-개편안이-어긋난-곳) |
| W10 | 판 1.0.0 | `package.json` 0.25.0 · `"bin": { "cdp": "server/index.js" }`(없는 파일)도 남았다 |

옛 문구가 남았던 자리 — `tools.guardSize` 의 거절 문장 · `CARD.saveCurator` 의 걷은 「어긋나는 산문」 거절(8d92edf) · 서식 guide 의 `**변경**` · 「ctx check 가 막는다」(8331dad)는 고쳤다. `agent/` 의 v0.x 원본(`hooks/pre-commit` · `CLAUDE-지식레포.md` · `manual/` · `TEMPLATE-work.md`)은 지웠다(99dd9d5 · 설명서 갈래).

---

## 13. 거부한 설계

v1.0 문서 제4부(RAG · 알림 · 지식 폴더 자동 최신화 · 본문 형식 강요 · 하네스 훅으로 절차 강제 · `CLAUDE.md` 절차 규약 · 작업 할당 · 검토를 승인 관문으로 · 문서 단위 낡음 판정 · 비개발 직군 UI)는 그대로다. v1.0 이 더한 것 —

| | 왜 |
|---|---|
| **모드 A 를 남기기**(PC git 쓰기 · stdio · 로컬 뷰어) | 실사용 0 · 정본 층 작성자 하나(I6)를 git 에서는 강제할 수 없다 · 모드 갈래 때문에 실제 사고가 났다(하네스 111). 개인 서버가 대신한다(V1) |
| **레포 플래그**(옛 규칙 · 새 규칙) | 모든 판정에 두 갈래가 생긴다 — 이 개편이 지우려는 것(V14) |
| **서버가 LLM 으로 큐레이션** | 서버에 키 · 비용 · 폐쇄망 반출이 생긴다 · 승인 게이트(판정표 · diff)가 대화에 있어야 한다(K12 · I11) |
| **관리 문서 자동 생성** | 그대로 거부한다. 기준선은 다르다 — 생성기는 프로젝트의 것이고 섹션 안 **블록 하나**만 쓴다. 입도 · 서술은 큐레이터가 정한다 |
| **반영 권한과 구조 권한 가르기** | 「구조 필요」 왕복이 생기고 한 판단을 두 사람이 나눠 진다(V2) |
| **writer 의 섹션 쓰기** | 정본 층의 작성자가 둘이면 복제 · 이름 갈림이 다시 생긴다(I6 · K2) |
| **패키지를 부어 레포 세우기** | 쓰지 않는 서식 문서 30종이 껍데기로 남았다(파생 검토 C4) — 빈 틀 + 서식집 |
| **레포에 도구 층** | 판이 레포마다 갈라진다(H9 · V4) |
| **문서 종류를 문서에 · 서식 표지를 YAML 로** | 문서가 늘 같은 말을 하고 섹션 줄이 밀린다(V6 · V7) |

---

## 부록 — 개발

```
npm run dev:server     개인 서버 — viewer/fixture · 7373 (API)
npm run dev            vite — 화면 (API 는 dev:server 로 넘긴다)
npm start              개인 서버 + 빌드된 화면
npm run build          화면 → ops/out/web
npm run build:ctx      bin/ctx.mjs 번들
npm run release:server 서버 산출물
npm run build:site     공식 사이트
node --test test/*.test.mjs   단위 시험
npm run verify         하네스(ops/verify/run.mjs)
```
