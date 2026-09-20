# CDP MCP 적용 검토 · 설계서 v0.1

2026-09-19 · 현재 v0.8.0 · 대상 릴리스 **미정 — 04 §7 B 단계(에이전트 개편)와 같이** ·
전제 문서 [`맥락배포프로토콜 §11.5`](../design/맥락배포프로토콜_설계서_v1.1.md) ·
[`CDP_시스템설계서_v1.0`](../design/CDP_시스템설계서_v1.0.md) ·
[`04_에이전트이식설계`](../이집이지_이관/04_에이전트이식설계.md)

> **MCP 는 규약이고, 우리 것에서는 `ctx` 의 세 번째 껍데기다.** 판정(`core/`)도
> 절차(스킬)도 훅도 안 바뀐다. 바뀌는 것은 스킬 안의 `bin/ctx` 호출 줄이 타입 있는
> 도구 호출이 되는 것, 그리고 그 도구를 Claude Code 밖(대화창 · 에이전트)에서도
> 부를 수 있게 되는 것이다. **지금은 만들지 않는다.** 이점 넷이 전부 아직 안 하는
> 일에 대한 것이라, 그 일(에이전트 개편)을 시작할 때 첫 단계로 만든다.
> 이 문서는 그때 만들 사람이 먼저 읽는다.

---

## 0. MCP 가 무엇인가 — 이 레포의 말로

**규약이다.** git 이 규약이고 원격이 상대이듯, MCP 는 "모델을 돌리는 프로그램(호스트)"과
"도구를 가진 프로그램(서버)"이 대화하는 정해진 말투다. 스킬로 구현하는 게 아니라
**프로그램 하나**로 구현한다.

```
 모델                            도구 목록을 보고 "이걸 부르자"고 정한다
   │
 호스트  Claude Code · Desktop     서버를 띄우고 · 권한을 묻고 · 결과를 모델에 넣는다
   │  JSON-RPC (initialize · tools/list · tools/call)
 MCP 서버  작은 프로그램            도구를 "이름 + 설명 + 입력 스키마"(명함)로 내놓고, 불리면 실행한다
   │
 실제 시스템  core/ · DB · HTTP API
```

**"서버"는 이름만 서버다.** 전송이 둘인데 우리는 하나만 쓴다.

| 전송 | 실체 | 우리 |
|---|---|---|
| **stdio** | 호스트가 **자식 프로세스로 띄우고 stdin/stdout** 으로 대화. 포트 없음 · 네트워크 없음 · 세션이 끝나면 같이 죽는다 | **이것만** |
| HTTP | URL 로 붙는 원격 서버 | 안 쓴다 — 문서가 PC 를 떠난다 |

stdio 로 보면 `bin/ctx` 와 같은 프로그램이다. `ctx where …` 는 한 번 답하고 죽는데,
MCP 서버는 세션 동안 살아서 계속 답한다 — 차이는 그것과 **명함**뿐이다.
**서버 안에 LLM 은 없다.** 함수 몇 개를 규약대로 포장한 것이다.

규약이 정한 세 가지 —

| | 시작하는 쪽 | 들어오는 것 | Claude Code 에서 | 지식 레포로 치면 |
|---|---|---|---|---|
| **tools** | 모델이 명함을 보고 | 데이터 | `mcp__cdp__where` | `bin/ctx` 명령 |
| resources | 사람이 첨부 | 데이터 | `@` 멘션 | 관리 문서의 섹션 |
| prompts | 사람이 고른다 | 절차(+데이터) | `/mcp-cdp-load` | MANUAL 의 절차 = 스킬 |

**스킬 · MCP · 훅의 경계** — 절차는 스킬, 도구는 MCP, 결정론적 보증은 훅.
명령만 쥔 사람은 pull 없이 커밋한다. 훅이 파생 누락은 잡지만 좌표를 잘못 고른 것과
"왜"가 빠진 본문은 못 잡는다. 그래서 절차는 스킬에 남고, **스킬이 없는 자리(대화창)
에서는 쓰기를 하지 않는다.**

---

## 1. 검토 — 이집이지에서 MCP 가 붙을 자리 (2026-09-19 실측)

서비스 코드에 MCP 를 *넣을* 데는 사실상 없다. LLM 을 부르는 컴포넌트 중 살아 있는 것은
`ezipez_agent` 하나이고 도구 없는 단일 호출이다. 붙을 자리는 전부
**"지금 Bash · curl · psql 로 하고 있는 읽기"** 다.

### 1.1 판정표

| # | 자리 | 지금 | MCP 로 바뀌는 것 | 판정 | 소유 |
|---|---|---|---|---|---|
| ① | 운영자 Claude 세션 → DB · 파이프라인 현황 | psql/curl 을 Bash 로 반복 | 읽기전용 타입 도구 2종 (`ezipez-db` · `ezipez-ops`) | **실익 가장 큼** | 이집이지 레포 — CDP 밖 |
| ② | 지식 레포 `ezipez_cdp` 소비 | 스킬이 `bin/ctx` 를 Bash 로 호출 | `ctx` 의 MCP 어댑터 | 프로토콜 §11.5 신호 충족 · **이 문서의 설계 대상** | CDP |
| ③ | 제품 외부 채널 (web_back → 원격 MCP) | 없음 | 외부 AI 가 이집이지 데이터 질의 | think 주간이 "유입 축 · 승격 금지" 판정 — **운영자 결정** | 이집이지 |
| — | `ezipez_lab` · `ezipez_agent` · ops 봇 | | | 적용 없음 (§1.5) | |

### 1.2 ① 운영자 세션용 읽기전용 2종 — 실측 근거

- `GitHub/.claude/settings.local.json` allow **752건** 중 curl **264** · psql **111**, 그중
  **DB 비밀번호가 평문으로 박힌 규칙 90건.** 세션이 같은 읽기를 명령줄로 반복하고 그
  명령마다 비밀번호가 설정 파일에 남는다(커밋은 안 된다). 레포별로도 web_front 124
  (psql 14 · curl 36) · web_back 41 · data 36.
- Dagster 상태 해석 함정(SKIPPED≠실패 · STOPPED 스케줄은 리포트에 안 나옴 ·
  `instigators` 가 SoT)이 `GitHub/CLAUDE.md` §1 에 40줄, `운영봇정의서` §오판-함정에 또 —
  **해석을 매번 모델이 한다.**

| 서버 | 무엇 | 왜 |
|---|---|---|
| `ezipez-db` | 읽기전용 Postgres. 기성 서버 + `.mcp.json` `env` 에 `${EZIPEZ_DB_URL}` | 비밀번호가 파일에 안 남고, `ezipez_think` 의 "읽기 전용 SQL 만"이 프롬프트가 아니라 **롤+도구에서** 강제된다 |
| `ezipez-ops` | data_admin `/api/pipeline/overview` · `/api/dagster/{instigators,runs,health}` · `/api/sources/:code` · `/api/lineage/source/:code` 와 ops 의 status/schedule/result 를 **프록시** | **계산기를 다시 만들지 않는다(D-8).** 함정 해석은 도구 설명과 응답 필드(`tick: SKIPPED (W15 no-op)`)에 싣는다. `credentials` 라우터는 노출하지 않는다 |

CDP 의 일이 아니다. 도구 초안만 부록 C 에 둔다.

### 1.3 ② 지식 레포 — 프로토콜 §11.5 의 도입 신호 점검

§11.5 는 MCP 를 "선택 · 다음 셋 중 하나가 필요해질 때"로 뒀다.

| 신호 | 지금 (2026-09-19) | 판정 |
|---|---|---|
| **인덱스 규모** — §10.5 3단계(500건+)는 통째 로드 불가 | `work/` **893건** · INDEX.md 91.7KB · INDEX-by-coord.md 131.9KB · 좌표 590 | **넘었다.** 다만 스킬은 이미 INDEX 를 안 읽고 `ctx where` · `match` 를 쓴다 — 위험은 이미 CLI 가 막고 있다 |
| 최신성 보장 — clone 은 낡을 수 있다, MCP 는 항상 최신 | 혼자 운영 · 로컬 clone 하나 | 약하다. 이건 **원격 MCP** 이야기고 우리는 문서를 PC 밖으로 안 낸다. `ctx sync` 확인은 그대로 필요 |
| 신선도 부가 정보 — "이후 문서 3건 있음" | `ctx where` 가 "작업 51건 · 반영 2026-0911-…" 을 이미 낸다 | 이미 있다 |

**마찰 실측** — `ctx where` · `match` · `derive` · `brief` 각 **0.5초.** 출력은 스킬이 읽게
설계돼 있다(`주입 그 섹션만 — 119줄 · 약 4964자 (docs/…:834)`). §11.5 의 *"지금 붙이면
ls 와 cat 을 감싼 래퍼"* 는 지금도 절반은 맞다 — 그래서 §2 의 이점은 성능이 아니라
**지금 못 하는 것**에 있다.

### 1.4 ③ 제품 외부 MCP — 결정 사항이지 권장이 아니다

기술은 하루 일이다 — web_back `/api/apt` · `/api/events/v2` · `/api/main` 위에 원격 MCP
도구 여섯. 그런데 `ezipez_think` 가 이미 봤다.

- korea-realty MCP(47도구 · 실거래/경매/청약, 대장·공시·정비·학군은 0)를 경쟁 신호로
  추적 중 (H-129 · 09-14 실측)
- H-137 — **"범용 AI 안 시나리오 3(MCP · LLM 인용 유입 · 창 안 앱) = 유입 축 · 첫 1원 무관 ·
  씨앗 · 승격 금지"**

이 문서가 그 판정을 뒤집을 근거는 없다. 붙인다면 제약 하나 — 점수·순위를 외부 LLM 에
주면 보이스 가이드(verdict→lens)를 통제할 수 없다. **사실 테이블만**(실거래 · 세대수 ·
준공 · 거리 · 환경지표) 내보내는 형태여야 한다.

### 1.5 적용 없는 곳

| | 왜 |
|---|---|
| `ezipez_lab` | "Bash 로 DB 조회하라"는 프롬프트에 `--dangerously-skip-permissions` 로 돌던, 타입 도구가 딱 맞던 자리. **2026-09-16 폐기**(운영봇정의서 §주간루틴-2회차 · 운영자: "lab 은 폐기된 서비스다") |
| `ezipez_agent` 분류·생성 | `claude -p` 도구 없는 단일 호출. 쓸 일 없음 |
| ops 봇 | LLM 이 아니다. Slack Bolt. 대신 운영자 세션엔 Slack MCP 커넥터가 이미 있어 #긴급 · #파이프라인 이력은 읽힌다 |

### 1.6 설계 원칙과 충돌하는 것 — 하지 않는다

| | 충돌하는 원칙 |
|---|---|
| MCP prompt 로 스킬을 **따로** 적기 | "같은 일에 입구가 둘"(04 §5). 텍스트가 둘이면 하나만 고쳐진다 |
| 쓰기 도구 | 문서 편집은 `cdp-save` 의 일. 뷰어가 하면 좌표 대조·훅 검증을 우회하는 경로가 생긴다(README 안 하는 것) — MCP 도 같다 |
| 유사도 검색 도구 | RAG 기각 그대로. `search` 는 이름·본문 **일치**이지 유사도가 아니다 |
| 지식 레포를 원격 MCP 로 | 문서 내용은 PC 를 떠나지 않는다 |

---

## 2. ctx → MCP — 이점 · 이점 아닌 것 · 비용

### 2.1 이점 넷 — 전부 "지금 못 하는 것"

| # | 이점 | 지금은 | MCP 면 |
|---|---|---|---|
| 1 | **에이전트에 "지식 조회만" 줄 수 있다** | 에이전트 6종(`GitHub/.claude/agents/` · 04 이후 `qa_master` 추가)은 전부 `tools:` 미지정 = 셸 포함 전부. ctx 를 쓰게 하려면 **셸 전체**를 줘야 한다 | `tools: Read, Grep, mcp__cdp__where, mcp__cdp__section` — 셸 없이 정본만 본다. 04 §7.2 "수치·스키마는 좌표로 가리키고 주입한다"의 **실행 수단** |
| 2 | **Claude Code 밖에서 지식 레포를 묻는다** | 스킬은 Claude Code + `ctx setup` 된 레포 안에서만 산다 | Desktop 대화 · Cowork · 다른 호스트 어디서든 같은 `where` |
| 3 | **사람이 `@` 로 섹션을 찍어 넣는다** | 스킬을 부르거나 줄 번호를 알아내 Read | `@cdp:section/table:mart.마스터_단지` — 그 119줄만 |
| 4 | **도구 층이 한 곳에 산다** | 호출법이 스킬 본문(레포 8곳 사본)에 문자열로. 명령이 늘면 사본 8개. 모델이 매번 절대경로 · `bin/ctx` vs `ctx.cmd` · 따옴표를 조립 | 명함은 서버가 준다. 권한도 `mcp__cdp` 한 줄. 모델은 명령줄을 조립하지 않는다 — Windows 폐쇄망 대상이라 작지 않다 |

**1 이 가장 크다.** 판단이 필요한 에이전트에게 정본 읽기는 주고 셸은 주고 싶지 않다 —
Bash 로는 이 둘을 가를 수 없다.

### 2.2 이점이 아닌 것

- **속도** — 0.5초. 느낄 수 없다.
- **판정 · 정확도** — 같은 `core/`. 변화 0.
- **JSON** — `--json` 이 이미 있다. 스킬이 그걸 쓰라고 하면 끝나는 일.
- **"실시간 · 최신"** — 로컬 clone 을 보는 건 같다(§1.3).

### 2.3 비용

| | |
|---|---|
| 명함이 세션마다 실린다 | 11도구 ≈ 1~2K 토큰(추정 · §7 에서 실측). 스킬은 부를 때만 읽히는데 도구 명함은 처음부터 있다(최근 호스트는 많으면 지연 로드) |
| 설치 단계 하나 | `.mcp.json` — `ctx setup` 이 쓴다(§3.8). 첫 사용 승인 한 번 |
| 버전 | `ctx.mjs` 번들 안에 두므로 `ctx version` 세 곳 맞추기에 **추가되지 않는다.** 따로 두면 낡는 곳이 하나 는다 |
| 입구 둘 | Bash-ctx 와 MCP-ctx 공존 기간엔 스킬이 하나만 가리켜야 한다(§3.9) |

### 2.4 호출 방식은 안 바뀐다

사람이 하는 말은 같다 — 요청 · "응" · "기록해" · "ㅇㅋ". 스킬 이름을 부를 일이 없다.
스킬은 description 으로 뜨고(04 §5 가 커맨드를 일부러 안 만든 이유), 뜬 스킬이 ①~⑤
안에서 도구를 부른다. MCP 가 있으면 그중 `ctx` 줄이 `cdp:*` 호출이 되고 없으면
지금처럼 Bash 다.

```
① pull          git pull --ff-only            Bash             (그대로)
② 좌표 판정      ctx match …                   Bash → cdp:match
③ 작업 기록      work/….md                     Write            (그대로)
④ 파생 갱신      ctx derive · ctx apply         Bash → cdp:derive · cdp:apply
                섹션 수정                       Edit             (그대로 · 사람이 승인)
⑤ 커밋          git commit → 훅 ctx check       Bash · 훅은 CLI   (그대로)
```

스킬이 없는 자리(Desktop 대화창)에서는 **읽기만** 된다. "저장해" 는 거절하는 것이
설계다 — 절차 없는 저장은 훅을 우회하는 두 번째 입구다.

### 2.5 확정 호출 — 대화창의 스킬은 prompts 다

| | 시작하는 쪽 | 강제성 |
|---|---|---|
| 스킬 description · 도구 명함 | 모델이 말을 보고 | 확률 |
| `/cdp-save` · **MCP prompt**(`/mcp-cdp-load` · Desktop `+` 메뉴) · `@` 리소스 | **사람** | **확정** |

도구는 매 순간 모델이 "부를까"를 다시 정한다. 명함이 흐리면 기억으로 답한다 — 이
시스템이 1순위로 막는 사고(§12 검증 계약)다. 그래서 명함 문구(§3.4)와 서버
instructions(§3.5)가 **이 설계의 실체**다. 코드는 스무 줄이고, 문장이 일이다.

---

## 3. 설계 — `cdp` MCP 서버

### 3.1 자리

```
core/                                판정 — 정본.  안 바뀐다
   ├─ viewer/server/adapter/http.js   앱       (HTTP + SSE)             ← 1
   ├─ viewer/bin/ctx-cli.mjs           ctx      (argv → stdout 텍스트)     ← 2
   └─ viewer/bin/ctx-mcp.mjs           ctx mcp  (stdin/stdout JSON-RPC)   ← 3  신설
```

`ctx-cli.mjs` 의 `mcp` 서브커맨드가 `ctx-mcp.mjs` 를 부른다. **`viewer/bin/` 에 두는
이유** — 지식 레포 안으로 번들되어 들어가는 것은 `viewer/bin/` 이고,
`viewer/server/adapter/` 는 앱 프로세스의 I/O(HTTP · 트레이 · 봉인)라 번들에 안
들어간다. README 가 예고한 *"adapter 만 갈아끼운다"* 의 세 번째 소비자이지만 사는
곳은 `ctx` 옆이다.

`build-ctx.mjs` 는 entry 가 `ctx-cli.mjs` 하나라 import 만 하면 같은 `ctx.mjs` 에
들어간다. **`ctx version` 이 곧 서버 버전**이다 — `serverInfo.version = BUILT`.

### 3.2 전송 · 프로토콜

- **stdio 만.** HTTP 전송은 만들지 않는다.
- JSON-RPC 2.0, 줄 단위. 필요한 메서드는 여덟이다 — `initialize` ·
  `notifications/initialized` · `ping` · `tools/list` · `tools/call` · `resources/list` ·
  `resources/templates/list` · `resources/read` (+ 3단계에 `prompts/list` · `prompts/get`).
- **stdout 은 규약 전용이다.** `ctx-cli.mjs` 의 `out()` 은 stdout 에 쓴다 — mcp 모드에서는
  **한 바이트도** 규약 밖으로 stdout 에 쓰면 안 된다. 로그 · 진행 · 경고는 전부 stderr.

**직접 구현 vs SDK** — 결정: **직접 구현.**

| | 직접 | `@modelcontextprotocol/server` + zod |
|---|---|---|
| 번들 | +0 | +수백 KB(실측 필요) · SEA 에 그대로 실린다 |
| 스펙 추적 | 우리가 (버전 협상 · 필드) | SDK 가 |
| 선례 | 트레이(PowerShell) · 아이콘(무압축 DIB) — **작은 표면은 직접** | viewer 는 js-yaml · chokidar 를 쓴다 — 필요하면 의존한다 |

표면이 여덟 메서드라 직접이 맞다. 대신 **스펙 버전을 고정**(`protocolVersion` 협상에서
아는 것만 답한다)하고, Claude Code 의 실제 핸드셰이크를 녹음한 픽스처로 시험한다(§7).
SDK 로 바꿀 신호: 호스트가 우리가 모르는 필수 필드를 요구할 때.

### 3.3 레포 해결 · 수명 · 신선도

- **레포** — `ctx-cli.mjs` 와 같다. `--repo` → `CDP_REPO` → `.claude/cdp.json` 상위 탐색 →
  **자기 위치**(`<repo>/bin/ctx.mjs` 의 부모). §3.8 이 `.mcp.json` 에 절대경로 shim 을
  적으므로 실제로는 마지막 규칙 하나로 끝난다.
- **수명** — 세션당 프로세스 하나. 호스트가 띄우고 호스트가 죽인다. 유휴 종료를 스스로
  하지 않는다(호스트 기본 30분).
- **신선도** — 첫 호출에 `loadRepo` 로 한 번 읽고 메모리에 둔다. 이후 호출마다
  `_vocab.md` · `_managed.md` · `docs/` · `work/` · `.git/HEAD` 의 mtime 을 stat 해
  바뀌었으면 다시 읽는다(0.5초). **chokidar 감시는 쓰지 않는다** — 번들에 안 넣고,
  감시가 문제를 일으키는 환경(`--no-watch` 가 있는 이유)을 MCP 까지 끌고 가지 않는다.
- **동시성** — 호출은 순차 처리. 호스트가 병렬로 보내도 큐에 쌓는다. 전부 읽기라
  순서가 결과를 바꾸지 않는다.

### 3.4 도구 11종 — 전부 읽기

**쓰기 도구는 없다. git 을 만지는 도구도 없다.** pull · commit · push 는 스킬 안의
Bash 로 남는다 — "받는 것과 보내는 것은 사람이 결정한다"가 그대로다.

결과는 `content: [{ type: "text", text: <JSON> }]` 이고 JSON 모양은
**`ctx <명령> --json` 과 동일**하다(같은 함수). 명함(description)은 아래 문구 그대로
쓴다 — 이것이 `cdp-load` 의 규칙을 도구 단위로 옮긴 것이다.

| 도구 | 입력 | 돌려주는 것 | 명함 |
|---|---|---|---|
| `match` | `names: string[]` | 이름별 정본 좌표 · 일치 종류(이름/값/alias) · `_vocab.md` 줄 · 폐기면 후속 | 이름·alias·자유 표현을 정본 좌표로 대조한다. 테이블·화면·API·팩터·원천·용어를 말로 가리켰으면 좌표를 짐작하지 말고 먼저 이것으로 확정한다. `(미등재)` 는 어휘에 없다는 뜻이다 — 다른 좌표로 바꾸지 말고 그대로 보고한다. 폐기 좌표면 후속 좌표를 준다 |
| `where` | `coord`(정본 또는 alias) · `limit=5` | 등록부 판정 · 문서·섹션·줄 범위 · `applied` · 상태(ok / 파생 남음 / 섹션 없음) · 건드린 작업 목록(최신순) | 좌표의 **지금 상태**가 어느 관리 문서 어느 섹션에 있나, 마지막으로 반영된 작업, 그 좌표를 건드린 작업들. "지금 어떻게 돼 있나"는 이것. alias 를 주면 정본으로 바꾸고 바꿨다고 적는다. 상태가 `파생 남음`이면 그 섹션은 아직 최신이 아니다 — 답에 그 사실을 적는다. 등록부에 없는 타입(`domain:` 등)은 관리 문서가 없는 것이 정상이고 작업 기록이 유일한 근거다 |
| `section` | `coord` | 그 섹션 본문 · 문서 경로 · 줄 범위 · `applied` | 관리 문서에서 그 좌표의 **섹션 본문만** 돌려준다. 문서 전체를 읽지 않는다 — 테이블정의서에는 테이블이 수십 개다. 섹션이 없으면 빈 섹션으로 알린다 |
| `work` | `id` | 프론트매터 + 본문 | 작업 기록 본문. **"왜 그렇게 정했나"** 는 관리 문서가 아니라 여기 있다. 한 기록에 좌표가 여럿이고 좌표마다 그 뒤 사정이 다르다 — 문서 단위로 "덮였다"고 판정하지 말고 좌표별로 `where` 를 본다 |
| `search` | `words: string[]` · `limit=12` | 좌표 후보 · 걸린 말 · 문서 · 관련 작업 | 말 → 좌표 후보. `match` 가 미등재를 냈을 때의 폴백. 본문은 싣지 않는다 — 후보를 고른 뒤 `section` 으로 읽는다. 유사도 검색이 아니다: 걸리지 않으면 없는 것이다 |
| `derive` | — | 파생 남은 섹션 · 깨진 섹션 | 파생이 남은 섹션과 깨진 섹션. 이것이 비어야 커밋된다. 치우는 것은 `cdp-managed` 절차 |
| `apply` | `coord` | 변경 줄 초안 | 파생할 섹션에 붙일 변경 줄 초안. **파일은 고치지 않는다** — 고치는 것은 `cdp-save` 안에서 사람이 승인한 뒤 Edit 로 |
| `check` | — | `ok` · 오류/경고 수 · 소견 | 커밋 가능한가. 훅이 커밋 때 같은 검사를 돌린다 — 이 도구로 미리 본다 |
| `sync` | — | 받을 것 · 보낼 것 · 훅 설정 여부 · 원격 유무 | 원격과의 차이와 훅 설정 여부. **받지 않는다.** 받을 것이 있으면 주입한 섹션이 최신이 아닐 수 있다고 알린다 — 받는 것은 사람이 결정한다(`git pull --ff-only`) |
| `brief` | — | 두 줄 | 두 줄 요약 — 절차와 살아 있는 레포 상태 |
| `version` | — | 번들 시각 | 이 번들이 언제 만들어졌나. 번들이 낡으면 옛 판정을 낸다 |

`term` 은 `match` 에 접는다(alias · 폐기 · 후속을 이미 낸다). `setup` · `index` ·
`sync --pull` 은 **쓰기라 도구가 아니다.**

명함 길이는 도구당 3~4문장으로 **제한**한다. 늘리고 싶은 말은 §3.5 instructions 로
올린다 — 명함은 "언제 부르나", instructions 는 "어떻게 다루나".

### 3.5 서버 instructions — 초기화 응답에 실어 시스템 프롬프트로

```
<레포 이름> 지식 레포의 읽기 도구다. 여기 있는 것이 정본이고 모델의 기억이 아니다.
· 시스템의 지금 상태·결정 이유를 물으면 기억으로 답하지 않는다.
· 좌표를 말로 받았으면 match 로 확정 → where 로 상태 → section 으로 그 섹션만.
  이유는 where 가 준 작업 id 로 work 를 연다.
· 문서 전체를 읽지 않는다. "후속 있음"을 "덮임"이라 쓰지 않는다.
  파생 남음이면 그 사실을 답에 적는다.
· 쓰기 도구는 없다. 기록·갱신은 작업 레포의 cdp-save 절차로만 한다.
```

레포 이름은 하드코딩하지 않는다 — 레포 폴더명(또는 `_vocab.md` 머리)에서 읽어 넣는다.
**CDP 는 이집이지를 모른다.**

### 3.6 리소스

| URI | 내용 | 비고 |
|---|---|---|
| `cdp://section/{coord}` (템플릿) | `section` 과 같음 | `@` 로 정본 섹션 첨부 |
| `cdp://work/{id}` (템플릿) | `work` 와 같음 | |
| `cdp://doc/<관리문서명>` (정적 · 등록부의 문서들) | 문서 전체 | description 에 **크기**를 적는다 — "팩터정의서 245KB. 섹션을 써라" |
| `cdp://index` · `cdp://vocab` · `cdp://managed` | INDEX.md · `_vocab.md` · `_managed.md` | 사람이 훑을 때 |

작업 기록 893건은 정적 목록에 올리지 않는다 — 템플릿과 `where` 로 닿는다.

### 3.7 prompts — 3단계 · 조건 둘

대화창(스킬이 없는 자리)의 확정 호출이다. **읽기 절차만**: `load {coord}` · `brief`.

`load` 핸들러는 절차 문장만이 아니라 **데이터까지 뽑아** 돌려준다 — `sync` → `match` →
`where` → `section` 을 서버가 돌리고, 결과와 규칙을 한 메시지로. `cdp-load` ①~⑤ 가
한 번의 확정 호출이 된다.

| 조건 | 왜 |
|---|---|
| 절차 문장은 **`.claude/skills/cdp-load/SKILL.md` 를 읽어** 내보낸다 | 따로 적으면 "같은 일에 텍스트 둘". 이를 위해 스킬 본문의 도구 줄이 호스트 중립이어야 한다(§3.9) |
| **Claude Code 에는 prompts 를 내놓지 않는다** — `initialize` 의 `clientInfo.name` 으로 가른다 | Code 에서는 `/cdp-load` 와 `/mcp-cdp-load` 가 나란히 뜬다. 자리마다 입구 하나 |

`save` 는 prompt 로 만들지 않는다(§2.4).

### 3.8 설치 — `ctx setup` 이 `.mcp.json` 을 쓴다

| 안 | 커밋 | 문제 |
|---|---|---|
| **A. `ctx setup` 이 PC 마다 절대경로로 쓴다 · 미커밋** | ✗ | 없음. `.claude/cdp.json` 과 같은 성격 — 지식 레포 경로는 사람마다 다르다 |
| B. 커밋 + `${CDP_REPO}` | ○ | shim 이름이 OS 마다 다르다(`ctx` / `ctx.cmd`) · env var 는 사람이 PC 마다 |
| C. 커밋 + `.claude/cdp-mcp.mjs` 런처 | ○ | `node` 필수 — 폐쇄망 전제(Node 없음) 위반 |

**A.** 팀 전파는 git 이 아니라 `ctx setup` 이 한다 — `cdp.json` 을 쓰려면 어차피
PC 마다 한 번 돌린다.

```jsonc
// <작업 레포>/.mcp.json — ctx setup 이 쓴다. 손으로 고치지 마라
{ "mcpServers": { "cdp": {
    "type": "stdio",
    "command": "/Users/kjsa/Documents/GitHub/ezipez_cdp/bin/ctx",   // Windows: cmd /c …\bin\ctx.cmd (§7)
    "args": ["mcp"] } } }
```

- shim 을 가리키므로 **Node 가 없으면 `cdp.exe ctx mcp` 로 넘어간다** — 폐쇄망에서도
  같은 서버.
- `planSetup` 에 op 하나(`.mcp.json` 쓰기), `.gitignore` 안내에 `.mcp.json` 한 줄 추가,
  관리 > 작업 레포의 설치 상태(`inspect`)에 `.mcp.json` 유무 반영.
- Claude Desktop 은 자기 설정 파일(`claude_desktop_config.json`)을 쓴다 — 3단계에서
  `ctx setup --desktop` 으로 같은 항목을 쓴다. 지금은 사람이 한 번 적는다.

### 3.9 스킬 본문 — 줄 단위로 바뀐다

스킬 머리의 `<repo>` 정의 줄 옆에 한 문장을 둔다 —

> `ctx` 호출은 MCP 도구 `cdp:*` 가 있으면 그것으로, 없으면 `<repo>/bin/ctx …` 로.
> **둘은 같은 함수다.**

그리고 각 줄 —

| 스킬 | 지금 | 바뀐 줄 |
|---|---|---|
| cdp-load §0 | `<repo>/bin/ctx sync` | `sync` |
| cdp-load §2 · cdp-edit | `ctx where <좌표>` → 그 섹션만 Read | `where` → `section` |
| cdp-load §5 | `ctx search` | `search` |
| cdp-work ① · cdp-save ② · cdp-import ③ | `ctx match …` | `match` |
| cdp-save ④ · cdp-managed | `ctx derive` · `ctx apply` | `derive` · `apply` |
| 전부 | `git pull --ff-only` · `git commit` · push | **그대로 Bash** |

훅(`.githooks/pre-commit`)은 **CLI 를 그대로 쓴다.** 훅은 MCP 를 모른다.

### 3.10 에이전트 — 04 §7 B 단계의 연결점

```yaml
# GitHub/.claude/agents/data_master.md
tools: Read, Grep, Glob, mcp__cdp__match, mcp__cdp__where, mcp__cdp__section, mcp__cdp__work
```

셸이 없다. 정본은 읽되 psql 도 git 도 못 친다. 04 §7.2 *"수치·목록·스키마는 좌표로
가리키고 주입한다"* 를 본문 문장이 아니라 **도구 목록**으로 강제한다. 어느 에이전트에
무엇을 주는지는 B 단계에서 정한다 — 이 문서는 수단만 만든다.

### 3.11 보안 — 새로 여는 것 0

| | |
|---|---|
| 리스너 | 없다. stdio. README 보안표의 위험면(토큰 · Origin · DNS 리바인딩)이 해당 없다 |
| 쓰기 | 없다. 도구 11종 전부 읽기. git 도구 없음 |
| 경로 | 레포 밖을 읽지 않는다 — `section` · `work` · `doc` 은 레포 안 상대경로만, `..` 거부 |
| 문서가 모델에 간다 | 지금 스킬이 Read 로 보내는 것과 같다. "PC 를 떠나지 않는다"는 *네트워크로 나가는 것은 git 원격뿐* 이라는 뜻이고 그대로다 |
| 첫 사용 | 호스트가 승인을 묻는다. 프로젝트 스코프 `.mcp.json` 은 세션마다가 아니라 한 번 |

---

## 4. 지키는 것 / 새로 여는 것

| 지키는 것 | |
|---|---|
| 판정은 `core/` 한 곳 | 세 번째 소비자일 뿐. 계산을 다시 하지 않는다 |
| 절차는 스킬 | 도구 줄만 바뀐다 |
| 훅은 CLI | 안 바뀐다 |
| 쓰기 · git 은 사람과 스킬 | MCP 에 없다 |
| 폐쇄망 자족 | 같은 번들 · shim 이 exe 로 넘긴다 |
| 설정은 setup 이 만든다 | `.mcp.json` 도 `cdp.json` 처럼 |

| 새로 여는 것 | |
|---|---|
| 스킬 없는 자리에서의 **읽기** | Desktop · 에이전트 · 다른 호스트 |
| 도구 단위 권한 | 에이전트에 셸 없이 정본만 |
| `@` 섹션 첨부 | |

## 5. 안 하는 것

| | 왜 |
|---|---|
| HTTP 전송 | 문서가 PC 를 떠난다 |
| 쓰기 · git 도구 | §1.6 |
| 유사도 검색 | §1.6 |
| prompts 를 따로 쓰기 | 한 파일. §3.7 |
| chokidar 감시 | §3.3 |
| SDK 번들 | §3.2 — 신호가 오면 |
| 이집이지 이름 하드코딩 | CDP 는 도메인을 모른다 |
| **지금 만들기** | §6 |

## 6. 실행 시점과 순서

**04 §7 B 단계(에이전트 개편)의 첫 단계로 만든다.** 이점 넷은 전부 아직 안 하는 일에
대한 것이라, 그 전에 만들면 명함만 실리는 비용이다. 단독으로 시작하는 신호 둘 —
Claude Code 밖에서 지식 레포를 물을 일이 생김 · 팀원.

```
1단계  tools 11 + resources                ctx-mcp.mjs · ctx mcp · 픽스처 시험 · setup 이 .mcp.json
       스킬은 아직 Bash — MCP 는 에이전트만 쓴다                       ← B 단계와 같이
2단계  스킬 줄 교체 (§3.9) · 관리화면 설치 상태
3단계  prompts(load · brief) · clientInfo 가르기 · ctx setup --desktop
```

1 과 2 를 섞지 않는다 — 1 은 도구, 2 는 절차. 섞으면 무엇이 깨졌을 때 어느 쪽인지
못 가른다.

## 7. 검증 항목

```
□ ctx where <좌표> --json 과 tools/call where 의 결과가 바이트까지 같다 (같은 함수의 증명)
□ Claude Code /mcp 에 cdp 가 연결로 뜨고 tools/list 가 11건이다
□ mcp 모드에서 stdout 에 규약 밖 바이트 0 — 오류·진행이 전부 stderr 로 간다
□ Node 없는 PC: shim → cdp.exe ctx mcp 로 stdio 가 열린다
     ← exe 는 콘솔 서브시스템을 뗐다. 파이프로 띄웠을 때 stdin/stdout 이 붙는지 실측.
       안 붙으면 mcp 만 CONSOLE 빌드로 가른다
□ Windows .mcp.json: .cmd 직접 지정이 되는가, 아니면 cmd /c 가 필요한가
□ 명함 11개의 토큰 비용 실측 (세션 시작 컨텍스트 차이)
□ tools: 를 제한한 에이전트가 Bash 없이 where 를 부른다
□ 레포 밖 경로(../) 는 거부된다
□ 번들 크기 차이 (246KB 대비) · ctx version 이 serverInfo.version 과 같다
□ 세션 중 work/ 에 파일이 생기면 다음 호출이 그것을 본다 (mtime 재스캔)
□ Claude Code 가 보내는 initialize 의 protocolVersion · clientInfo.name 을 녹음해 픽스처로 둔다
□ 3단계: Desktop 에서 load prompt 가 섹션까지 한 번에 넣는다 · Code 에서는 /mcp-cdp-load 가 안 보인다
```

## 8. 열린 질문 — 기본값

| # | 질문 | 기본값 (답 없으면 이대로) |
|---|---|---|
| 1 | `clientInfo.name` 의 실제 값 (Claude Code · Desktop) | 픽스처로 실측한 뒤 가른다. 모르면 prompts 를 **내놓지 않는다** |
| 2 | `where` 가 alias 를 받나 | 받는다. 대화창의 왕복 한 번을 줄인다. 바꿨다는 사실을 결과에 적는다 |
| 3 | `search` 를 넣나 (RAG 우려) | 넣는다. 이름·본문 **일치**이고 `ctx search` 가 이미 있다 |
| 4 | 명함이 세션마다 실리는 비용이 문제가 되면 | 도구를 `match · where · section · work` 넷으로 줄인 "가벼운 프로필"을 `ctx mcp --lite` 로 |
| 5 | Desktop 설정 자동화 | 3단계. 그 전엔 사람이 `claude_desktop_config.json` 에 한 번 |

---

## 부록 A — 한 번의 호출, 실물

```jsonc
// 호스트 → 서버   (protocolVersion 값은 예 — 실제 값은 픽스처로 실측)
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"…","version":"…"},"capabilities":{}}}
// 서버 → 호스트
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","serverInfo":{"name":"cdp","version":"2026-09-19 21:15"},
  "capabilities":{"tools":{},"resources":{}},"instructions":"… 지식 레포의 읽기 도구다. …"}}

{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"where","description":"좌표의 지금 상태가 …",
  "inputSchema":{"type":"object","properties":{"coord":{"type":"string"},"limit":{"type":"integer"}},"required":["coord"]}}, …]}}

{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"where","arguments":{"coord":"table:mart.마스터_단지"}}}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"coord\":\"table:mart.마스터_단지\",\"section\":{\"doc\":\"docs/마스터테이블정의서.md\",\"line\":833,\"end\":952,\"applied\":\"2026-0911-…\",\"total\":51,…}}"}]}}
```

## 부록 B — `ctx-mcp.mjs` 뼈대

```js
// viewer/bin/ctx-mcp.mjs — ctx 의 세 번째 껍데기. 계산은 core/ 에 있다.
import readline from 'node:readline'
import { loadRepo } from '../../core/repo.js'
// … ctx-cli.mjs 와 같은 import

const log  = (s) => process.stderr.write(s + '\n')          // stdout 은 규약 전용
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')

const TOOLS = { match, where, section, work, search, derive, apply, check, sync, brief, version }   // §3.4

const HANDLERS = {
  'initialize':               () => ({ protocolVersion: PROTO, serverInfo: { name: 'cdp', version: BUILT },
                                       capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS }),
  'ping':                     () => ({}),
  'tools/list':               () => ({ tools: Object.values(TOOLS).map((t) => t.card) }),   // card = 명함 + inputSchema
  'tools/call':               async ({ name, arguments: a }) =>
                                ({ content: [{ type: 'text', text: JSON.stringify(await TOOLS[name].run(await repo(), a)) }] }),
  'resources/templates/list': () => ({ resourceTemplates: TEMPLATES }),
  'resources/list':           async () => ({ resources: await staticResources(await repo()) }),
  'resources/read':           async ({ uri }) => readResource(await repo(), uri),
}

let cached = null
async function repo() {            // §3.3 — mtime 이 바뀌었을 때만 다시 읽는다
  const stamp = await stampOf(root)
  if (!cached || cached.stamp !== stamp) cached = { stamp, r: await loadRepo(root) }
  return cached.r
}

const rl = readline.createInterface({ input: process.stdin })
let chain = Promise.resolve()      // 순차 처리
rl.on('line', (line) => { chain = chain.then(() => handle(line)).catch((e) => log(String(e))) })

async function handle(line) {
  const msg = JSON.parse(line)
  if (msg.method?.startsWith('notifications/')) return           // 응답 없음
  const h = HANDLERS[msg.method]
  if (!h) return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: msg.method } })
  try { send({ jsonrpc: '2.0', id: msg.id, result: await h(msg.params ?? {}) }) }
  catch (e) { send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e.message } }) }
}
```

## 부록 C — 이집이지 쪽 `ezipez-ops` 도구 초안 (CDP 밖 · 참고)

| 도구 | 부르는 것 | 함정을 응답에 싣는다 |
|---|---|---|
| `pipeline_overview` | `GET /api/pipeline/overview` | 연체 · 정체 · 입력대기 · 실패 |
| `schedules` | `/api/dagster/instigators` | `orphan`(등록명 바뀜) · "STOPPED 는 리포트에 안 나온다" |
| `runs` | `/api/dagster/runs?…` | `tick: SKIPPED = W15 no-op, 실패 아님` |
| `source` | `/api/sources/:code` | 판정식은 `meta.vw_원천_수집현황` — 계산기 다시 만들지 않음 |
| `lineage` | `/api/lineage/source/:code` | |
| `health` | `/api/dagster/health` + ops status | |

`credentials` 는 없다. `ezipez-db` 는 기성 서버 — `.mcp.json` 에 명령 한 줄.
