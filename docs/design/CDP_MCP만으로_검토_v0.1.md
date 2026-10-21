# MCP 만으로 — 에이전트가 ctx 를 부르지 않는다 · 검토 v0.1

2026-10-13 · 운영자 지시 「결국 mcp 만 써서 돌아가도록 만들어야 한다」 · 「공식 기능이 아닌 ctx 로 뭘 하는 건 제거」

## 0. 한 줄

**스킬 · 작업 규칙(CLAUDE.md)이 에이전트에게 시키는 일은 MCP 도구만으로 끝난다.** ctx 는 설치 · 서버 운영(admin 의 셸)의 도구로만 남는다.
정본 둘 잇기(`follow` · `update`)와 문서 레포에서 세우기(`seed`)는 서버가 원천 문서 레포를 직접 받아 MCP 도구 `source` 로 낸다.

## 1. 빈자리 — 지금 에이전트가 ctx 를 부르는 곳

| 어디 | 무엇 | 대신할 것 |
|---|---|---|
| cdp-save 「원천 문서 레포를 고쳤으면」 · dpms CLAUDE.md | `ctx update` 초안 → `--save --go` | **걷었다**(f53a255) — 보통 작업 기록 하나(`save`) |
| cdp-seed ①~⑥ | `ctx seed init · check · plan · apply · verify` | 새 도구 `source`(§3) |
| cdp-seed ⑦ · CLAUDE-큐레이터 | `ctx follow` · 누락 메우기 `ctx update` | 새 도구 `source` |
| cdp-rebuild | `ctx rebuild snapshot`(셸이면) | 이미 MCP — `save` 의 스냅샷 봉투. 셸 줄만 걷는다 |
| cdp-registry · curate · seed · rebuild | `ctx repo new --records-from` | 이미 콘솔 「새 지식 레포」 · admin 의 일. 셸 줄만 걷는다 |

`ctx update` · `follow` · `seed` 가 로컬이어야 했던 까닭은 **원천 문서 레포(git)가 이 PC 에만 있다**는 가정 하나다. dpms_docs 는 GitLab origin(`10.10.20.250:2900/platform/dpms_docs.git`)이 있다 — 서버가 받을 수 있다.

## 2. 무엇이 바뀌지 않나

- 쪼개기 · 비교 · 지도 해석(`core/seedmap.js`)은 그대로 — 자리만 CLI → 서버.
- 지도 `cdp-sources.json` 은 원천 레포 루트에(S1) — 서버는 원천 클론의 그 sha 에서 읽는다.
- 판정은 사람과 세션(S8) — 도구는 재료와 초안만 낸다. 쓰기는 기존 `save` 하나(권한 · 검사 · 커밋 · 미러 그대로).
- 세우는 흔적은 `_seed.json` 하나(S13).

## 3. 결정

| # | 무엇 | 권장안 | 까닭 |
|---|---|---|---|
| M1 | 원칙 | 스킬 · 작업 규칙 · 설명서의 「에이전트가 하는 일」 에 ctx 줄이 없다. ctx 는 설치(`ctx up` · 설치 한 줄) · 서버 셸(admin) · 개발 시험에만 — **예외(v1.7 · [지식 생성 검토](CDP_지식생성_작업실_검토_v0.1.md) G18): 사람이 돌리는 `ctx login` · `ctx ingest`.** 방향이 반대다 — 사람이 ctx 를 부르고, ctx 가 (다음 판에) 에이전트(`claude -p`)를 부르며, 그 에이전트는 MCP 읽기만 한다 | 공식 기능은 MCP 다 — 권한 · 검사 · 감사가 한 길. PC 마다 PATH · 한글 경로 · 토큰 환경변수가 갈리는 사고(2026-10-13 ctx.cmd)가 에이전트 길에서 사라진다 |
| M2 | 원천 연결 | 지식 레포 설정에 `source: { url, branch }` — 콘솔 「레포 설정」 에서 admin 이 넣는다. 서버가 `data/sources/<레포>.git`(bare)로 받고 도구를 부를 때마다 `fetch`(30초 상한 · 실패하면 마지막 받은 것으로 + 경고) | 원천을 서버가 가져야 MCP 로 낼 수 있다. bare 라 작업 트리 · 잠금 경합이 없다 |
| M3 | 원천 인증 | v0.15 git 자격 그대로 — SSH 배포 키(서버 키 하나 · GitLab 에 읽기 전용으로 등록) · http 면 저장된 PAT | 새 비밀 저장소를 만들지 않는다 |
| M4 | 도구 | **`source`** 하나 · `op` 로 가른다 — `map`(지도 · 검사 = 옛 seed check) · `follow`(`since?` · 커밋마다 기록 있음/누락) · `update`(`from` · `to?` → 업데이트 기록 초안 `{ work, vocab }`) · `plan`(세우기 전 단계 dryRun) · `apply`(세우기 — `dryRun` 기본 true) · `verify`(대조) · `init`(지도 뼈대 — 원천에 쓰지 않고 JSON 으로 돌려준다) | 도구 이름이 늘면 권한 줄 · 명함이 는다. 큐레이터 전용(curate 권한) — writer 에게는 안 보인다 |
| M5 | `follow` 의 since | 생략하면 지식 레포 `_seed.json` 의 `at`(세운 sha) | 「지난 점검 sha」 를 사람이 들고 다니지 않는다. 길면 `since` 를 준다 |
| M6 | 「왜」 검사 | `save` 가 「왜」 안내 줄이 남은 기록 · 태그 `업데이트` 인데 `## 왜` 가 빈 기록을 `E_CHECK` 로 거절 | S12 를 CLI(`--save`)에서 서버 검사로 — 어느 길로 와도 같다 |
| M7 | `apply` 의 자리 | 서버 안에서 core 를 바로 부른다(HTTP 를 돌지 않는다) — 기준선 · 관리 문서 · 첨부 · 기록을 한 잠금 안에서 단계별 커밋. 큰 원천이면 단계(`stage`) · 부분(`only`)으로 나눠 부른다 | MCP 한 호출의 시간 · 크기 상한 안에 들어야 한다 |
| M8 | CLI | `ctx seed · follow · update` 는 같은 core 를 부르는 얇은 껍데기로 남긴다(서버 셸 · 시험). 스킬 · 설명서 「에이전트」 쪽에서는 지운다 | 지우면 시험 · 장애 복구 길이 없다. 다음 큰 판에서 쓰임을 보고 정한다 |
| M9 | 원천이 git 서버에 없을 때 | 지원하지 않는다 — 「원천을 git 서버에 올리면 연결된다」 를 콘솔이 말한다 | 로컬 폴더를 서버로 올리는 길(zip)은 세우기 한 번엔 되지만 따라가기가 끊긴다 |

## 4. 도구 모양

```
source({ repo, op: 'map' })                                  → { at, map, check: { errors, unmapped } }
source({ repo, op: 'follow', since? })                       → { range, commits: [{ sha, date, subject, ok, coords: [{ coord, by[] }], records[], outside[] }], miss }
source({ repo, op: 'update', from, to? })                    → { draft: { work, vocab }, coords, records, outside }   # 세션이 「## 왜」 를 채워 save
source({ repo, op: 'plan' | 'apply', stage?, only?, dryRun? }) → 단계별 표 · apply 는 커밋들
source({ repo, op: 'verify' })                               → 같음 · 형식 차이 · 확인 필요 · drift
source({ repo, op: 'init', root? })                          → 지도 뼈대 JSON(원천에 쓰지 않는다 — 사람이 커밋)
```

원천 미연결이면 `E_NO_SOURCE` 「콘솔 레포 설정에서 원천 git 주소를 넣는다」.

## 5. 단계

1. **원천 연결 · `follow` · `update` · M6** — 운영 중 반복되는 일부터. dpms_wiki 에 dpms_docs 를 연결하고 이 PC 의 `ctx follow` 결과와 같은지 본다.
2. **`map` · `init` · `plan` · `apply` · `verify`** — 세우기는 드물지만 dpms 리허설 판(ops/out/archive)으로 같은 결과인지 본다.
3. **걷기** — cdp-seed · cdp-rebuild · cdp-registry · cdp-curate · CLAUDE-큐레이터 · 큐레이터 설명서의 ctx 줄. 하네스에 「스킬 본문에 `ctx ` 이 없다」(설치 줄 제외) 검사.

## 6. 하지 않는 것

- 원천 문서 레포에 쓰지 않는다 — 지도도 `init` 이 돌려준 것을 사람이 커밋한다.
- writer 도구를 늘리지 않는다 — writer 는 `save` 하나(f53a255).
- 서버 upgrade · GitLab 배포 키 등록 · 콘솔에서 원천 넣기는 사람이 한다.

## 7. 확인할 것

- 서버(10.10.20.188)에서 `10.10.20.250:2900` 에 닿는가 · dpms_docs 를 읽을 자격(배포 키 또는 PAT).
- MCP 한 호출 상한(`BODY_LIMIT` 512KB) — `update` 초안 · `follow` 출력이 넘으면 자른다(줄 상한 80 · 커밋 상한).
