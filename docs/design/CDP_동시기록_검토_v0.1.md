# CDP 동시 기록 검토 v0.1 — 여럿이 같은 지식 레포에 쓸 때, 특히 관리 문서
> **v1.0 이후** — 미러 · 뮤텍스 · 더러운 트리 · E_CONFLICT 재료는 그대로다 — [`CDP_시스템설계서_v2.0.md`](CDP_시스템설계서_v2.0.md) §5.6 · §7.6. 「파생 정리 기록」(D8)은 큐레이션 기록으로, 모드 A/B 갈래는 서버 하나로 바뀌었다.

> **판 v0.11.0 실측 · 2026-09-25.** 개발용 서버(7382 · 7383 · `--mirror` · bare origin · 명부 kjsa admin · hong · lee writer)에 `Promise.all` 로 `save` 를 동시에 보내고, origin 을 서버 밖에서 옮기고, 서버 트리를 손으로 더럽혔다. 수치는 전부 그 실측이다([§2](#2-어떻게-봤나--순서와-명령) · [부록 A](#부록-a-실측-방법)). 실서비스 `10.10.20.188:7374` 는 읽지도 않았다 — 이 검토는 쓰기 경로라 개발용 서버에서만 돈다.
> **상태 — 검토 완료 · 구현은 짝 문서 [`../dev/동시기록_TODO.md`](../dev/동시기록_TODO.md) 의 실측 상태를 본다.** 운영자 지시대로 결정은 전부 권장안으로 닫았다([§8](#8-결정-d1d14--권장으로-닫는다)). 물음표를 남기지 않는다.
> 전제로 두는 것: 시스템설계서 제3부 불변조건 14개 — 특히 **1 판정은 `core/` 한 곳 · 3 `work/` 는 불변 · 5 결정론적 보증은 훅(서버형은 `save` 의 검사)뿐 · 7 없는 상태를 화면에 그리지 않는다 · 10 기계가 merge 하지 않는다 · 11 push 는 사람이(서버형은 서버의 미러)** — 그리고 제품관리서비스 검토 v0.1 의 D1~D14(D13 만 여기서 닫는다) · 제품화 검토 v1.0 R15(여기서 정정한다) · `agent/manual/system.md` "`진행중`(점유)은 뺐다".

---

## 0. 한 줄

**다른 섹션은 된다 — 같은 섹션은 거절되는데 다시 만들 재료를 안 주고, 미러 push 는 겹치고 실패 사유를 삼키며, 서버 트리가 origin 과 갈라지거나 더러워지면 아무도 그것을 보지 못한 채 다음 `save` 가 남의 손 편집을 자기 이름으로 커밋한다.** 뮤텍스(`withLock`)와 `applied` 낙관 잠금은 실측에서 흔들리지 않았다 — 5건 · 10건 동시 `save` 가 전부 커밋되고 트리는 깨끗했다. 구멍은 그 바깥에 있다: ① `E_CONFLICT` 가 `{coord, expected, current}` 뿐이라 클라이언트가 `section` 을 다시 부르고 처음부터 다시 만든다 ② 미러 push 가 fire-and-forget 이라 동시 push 는 `cannot lock ref` 로 실패하고 non-ff 는 첫 줄 `To C:\…` 만 남는다 ③ 서버 트리 ↔ origin 갈림(D13) 에 길이 없다 — `pull --ff-only` 는 사람이 셸에서 · 뮤텍스 밖 ④ 더러운 트리를 `save` 가 그대로 커밋한다(실측 — 사람의 미커밋 줄이 hong 의 커밋에 들어갔다) ⑤ `—`(문서 전체) 규칙의 `save` 는 정규식 예외로 죽는다 ⑥ `cdp-managed` 는 모드 B 에 길이 없다. **권장안은 `core/` 에 미러 큐 · 실패 분류 · 맞추기 · 되돌리기 판정을 한 곳에 두고, `save` 응답 · 콘솔 · 레포 화면 · doctor · `brief` 가 그 한 값을 보이게 하는 것이다.** 섹션 점유 UI 는 만들지 않는다 — 낙관 잠금이 맞는 도구다.

---

## 1. 운영자의 말 · 검토의 틀

> CDP 제품화를 기준으로 서비스를 검토하고 개선점을 찾아라. 다중 사용자들의 동시 지식 레포 기록, 특히 관리 문서의 경우 문제 없이 동작하도록 기능 개선 검토가 필요하다. 이건 하나의 기능 개선일 뿐이고, UI/UX 든 사용자들이 쉽게 쓸 수 있도록 특히 프로그램 위주로 개선 작업을 진행해라.

| 축 | 무엇을 봤나 | 기준 |
|---|---|---|
| **A 동시 기록** (깊게) | 다른 섹션 N건 동시 · 같은 섹션 · 같은 좌표 새 섹션 · 같은 어휘 · 같은 id · `E_CONFLICT` 뒤 재시도 비용 · 미러 push 겹침 · 실패 분류 · 서버 트리 ↔ origin(D13) · 더러운 트리 · `—` 규칙 · `cdp-managed` 모드 B · 캐시 둘의 정합 · 혼용 · 기록의 흐름 | 불변조건 1 · 3 · 5 · 7 · 10 · 11 · MCP 설계서 §2.6 · §4.2 · §4.5 · §4.8 |
| **B 제품화 기준** (넓게) | 손 타는 자리 · 조용한 실패 · 회귀 검증 구멍 · doctor 가 못 보는 것 · 서버 모드 404 · 온보딩 | 제품화 검토 v1.0 §3 · 제품관리서비스 D1~D14 · 화면 UX TODO 의 열린 항목 |

심각도 — **P0**: 데이터가 조용히 틀어진다(남의 갱신 · 남의 손 편집이 잘못 실린다) · **P1**: 막히는데 왜인지 · 어떻게 풀지 보이지 않는다 · **P2**: 되지만 손이 더 간다 · **P3**: 잔손. 크기 — S 반나절 · M 하루 · L 이틀.

**프로그램 위주** — 코드 · 스킬 · 화면 · 테스트 · 하네스를 먼저 고치고 문서는 그 변경을 따라 적는다. 문서만 고치는 항목은 뒤로 뺐다([§9](#9-크기--순서--todo)).

---

## 2. 어떻게 봤나 — 순서와 명령

판은 하네스(`ops/verify/run.mjs`)와 같은 모양으로 `ops/out/concur/` 에 세웠다 — fixture 를 `repos/alpha` · `repos/whole` 로 복사 · `git init` · 첫 커밋 · `alpha` 는 bare origin(`origin/alpha.git`)에 `push -u`. `whole` 에는 `## note` 타입과 `| note:* | docs/회의록.md | — |` 규칙을 더했다(`—` 규칙은 어느 패키지에도 없다 — `grep` 0건). 서버는 `ctx serve --root … --auth … --data … --mirror --port 7382`(둘째 실행은 7383). 스크립트는 세션 스크래치패드(`measure.mjs` · `measure2.mjs`), 출력은 `ops/out/concur/result*.json`(추적 안 함).

| # | 무엇 | 어떻게 |
|---|---|---|
| M0 | 시작 상태 | `git status -sb` · `/healthz` · `.git/HEAD` mtime |
| M1 | **다른 섹션 5건 동시** — hong · lee · kjsa 섞어 | `section` ×5 → `Promise.all(save ×5)` → 커밋 수 · `status --porcelain` · INDEX 행 = work 수 · `section` 다시 읽어 applied · origin HEAD = local HEAD · 미러 로그 |
| M2 | **같은 섹션 둘 동시** | 같은 `applied` 로 hong · lee 가 동시에 |
| M3 | **같은 좌표 새 섹션 둘 동시** + 같은 어휘 둘 | `applied: null` · `heading` · `vocab` 같이 |
| M4 | 같은 work id 둘 동시 | — |
| M5 | **`—` 규칙** | `whole` 레포에 `section(note:회의)` → `save` |
| M6 | **캐시 둘** | save 직후 `section` · `/api/alpha/status` 의 works · `.git/HEAD` mtime |
| M7 | **미러 non-ff** — 로컬형이 origin 에 먼저 push | clone → 커밋 → push → 서버 `save` → 응답 `mirror` · `/repos` · `sync` · `brief` · 로그 · doctor · overview · `core/git.pullFfOnly` 의 답 |
| M8 | **더러운 트리** — 사람이 서버 셸에서 파일을 고친 채 | `docs/테이블정의서.md` 에 한 줄 append · `stray.txt` → `save` → 커밋에 무엇이 들어갔나 · doctor |
| M9 | 서버 모드 404 | `/api/alpha/workrepos` · `/diag` · `/git` · `/status` |
| M10 | `withLock` 순서 | 첫 것이 거부돼도 둘째 · 셋째가 순서대로 도나 |
| M11 | 동시 push 의 실제 실패 문장 | bare 하나에 push 둘을 동시에 |
| M12 | **동시 10건** — 시간 | `Promise.all(save ×10)` |

---

## 3. 실측 표

### 3.1 동시 `save` — 뮤텍스와 낙관 잠금은 지켜진다

| # | 결과 | 시간 |
|---|---|---|
| M1 다른 섹션 5건 | **5/5 커밋** (1 → 6) · 트리 깨끗 · INDEX 25행 = work 25 · applied 5/5 새 값 · origin HEAD = local HEAD (`8c4f10e`) · 작성자 hong · lee · kjsa 각자 | 전체 **8,001ms** · 건별 808 · 2,779 · 4,404 · 6,255 · 7,999ms |
| M12 다른 섹션 10건 | **10/10 커밋** (17 → 27) · 트리 깨끗 · origin = local (`ba8d75f`) | 전체 **17,848ms** · 건별 821 → 17,845 (≈ **1.8초/건** 직렬) |
| M2 같은 섹션 둘 | 1 커밋 + 1 **`E_CONFLICT`** `{coord, expected: 2026-0925-동시-1, current: 2026-0925-같은섹션-hong}` · 트리 깨끗 | 778 · 1,195ms |
| M3 같은 좌표 새 섹션 둘 + 같은 어휘 | 1 커밋 + 1 `E_CONFLICT` `{expected: null, current: <첫 id>}` · 헤딩 **1** · 어휘 줄 **1** | 960 · 1,649ms |
| M4 같은 id 둘 | 1 커밋 + 1 `E_EXISTS` · 트리 깨끗 | 991ms |
| M10 `withLock` | 순서 `[1, 1-rej, 2, 3]` — 첫 것이 거부돼도 다음이 순서대로 | — |

직렬화 비용이 **건당 1.8초**다 — `save` 하나가 `loadRepo` 를 세 번(좌표 검사 · INDEX · 검사) 하고 git 을 세 번 띄운다. 다섯 명이 같은 순간 누르면 마지막 사람은 8초를 기다린다. 막히는 것은 아니라 이번 판에서는 손대지 않는다([§4.6](#46-범위-밖-관찰)).

### 3.2 `E_CONFLICT` — 거절은 맞는데 재료가 없다

| 지금 detail | 없는 것 |
|---|---|
| `coord` · `expected`(내가 보낸 applied) · `current`(지금 applied) | **누가 · 언제 · 무슨 제목**으로 바꿨나 · **지금 본문**(`content`) · 다음에 무엇을 보내야 하나 |

스킬(`cdp-save` ⑤B 표 · 모드 표) 과 설명서(사용자 6.5 · 9.2 · 10.2)는 "`section` 을 다시 읽고 ④ 를 다시" 라고만 한다 — 왕복 하나가 더 들고, `current` 가 누구의 것인지 모른 채 그 위에 얹는다.

### 3.3 미러 push — 겹치고, 삼키고, 첫 줄만 남긴다

| # | 본 것 |
|---|---|
| `core/save.js:201-212` | `git.push(root)` 를 **await 하지 않는다** — 뮤텍스 밖 · 직렬화 없음 · 실패는 `log` 한 줄 · 응답 `mirror` 는 언제나 `'queued'` |
| M11 동시 push 둘 | **`remote: error: cannot lock ref 'refs/heads/master': is at … but expected …` · `! [remote rejected] master -> master (failed to update ref)`** — 겹치면 하나가 진다. M1 · M12 에서 안 난 것은 `save` 가 1.8초 간격으로 직렬화돼 push 가 안 겹쳤을 뿐이다 |
| M7 non-ff | 서버 로그 `미러 실패 alpha: To C:\…\alpha.git` — **첫 줄뿐.** 사유(`! [rejected] master -> master (fetch first)`)는 둘째 줄이라 안 남는다. `save` 응답 두 건 모두 `mirror: "queued"` · `warnings` 에 아무것도 없음 · `sync` 는 `mirror: lag` · `brief` 두 줄 그대로 |
| M7 doctor | `fail 레포 alpha push — To C:\…\alpha.git`(같은 첫 줄) + `warn 레포 alpha 미러 2건이 origin 에 안 갔다` · **왜(non-ff · 인증 · 망)를 가르지 않는다** · 2,023ms |
| M7 콘솔 `/admin/overview` | 경고 둘 — `미러가 밀린 레포 1 — alpha 2건` · `진단 fail 1 — 레포 alpha push`. 복구 길은 없다 |
| `core/git.js:253-260` | `push --quiet` 한 번 · 실패면 `reason: 'failed'` + 첫 줄. non-ff · 인증 · 망 · 보호 브랜치 · lock 을 가리지 않는다 |

### 3.4 서버 트리 ↔ origin — D13 이 열려 있는 값

| # | 본 것 |
|---|---|
| M7-1 | 로컬형이 origin 에 push 한 뒤 서버 `fetch`(845ms · 파일 원격) → `## master...origin/master [behind 1]`. **서버는 fetch 를 어디서도 하지 않으므로** 이 사실을 스스로 알 길이 없다 — 다음 `save` 의 push 가 거부될 때까지 |
| M7-2 | 그 뒤 `save` 둘 → `[ahead 2, behind 1]` = **갈라짐.** 서버 커밋은 서버 트리에만 있다 |
| M7-3 | `core/git.pullFfOnly` 를 갈라진 트리에 → `reason: diverged` · 문장 *"앱과 skill 은 merge·rebase 를 하지 않습니다. 터미널에서 정리하세요: git pull --rebase"* — **로컬형 사용자에게 하는 말**이다. 서버 트리는 `sudo -u cdp` 로 · 뮤텍스 밖에서 |
| M7-4/5 | 사람이 rebase 로 맞춘 뒤 origin 만 앞선 상태를 다시 만들면 `pullFfOnly` 173ms 에 ok · 그 뒤 `save` · push 정상(origin = local `a1f6fbd`) — **ff 는 안전하고 싸다** |
| 문서 | 관리자 설명서 7.6 "서버는 pull 하지 않는다 … 사람이 `pull --ff-only`" · `:845` 「안 하는 것」 표에 "자동 merge · 충돌 해결 · **서버의 pull**" 이 한 줄 · MCP 설계서 §4.2 "서버가 유일한 작성자" · 관리자 1.2 "둘을 섞어 쓸 수도 있다 … 쓰기는 한 길로" — 혼용은 허용하고 강제 장치는 없다 |

### 3.5 더러운 트리 — `save` 가 남의 손을 자기 이름으로 커밋한다 (P0)

| # | 본 것 |
|---|---|
| M8 | `docs/테이블정의서.md` 끝에 "사람이 서버 셸에서 커밋 없이 고친 줄" 을 두고 `stray.txt` 를 둔 채 hong 이 그 문서의 한 섹션을 `save` → **커밋 성공** · 커밋된 문서에 그 줄이 **들어 있다**(`humanLineCommitted: true`) · `stray.txt` 는 `??` 로 남는다 · `warnings` 에 아무것도 없음 |
| doctor | `ok 레포 alpha head … push 자격 있음` — **더러운 트리를 보지 않는다** |
| `core/save.js:26-56` `Snap` | 만지기 전 원본을 들고 실패 시 복원한다. 그런데 "원본" 이 이미 더러운 파일이면 그것을 복원한다 · 프로세스가 중간에 죽으면(전원 · OOM) 반쯤 쓰인 파일과 추적 안 되는 `work/<id>.md` 가 남고 복구 절차가 없다 |

### 3.6 `—`(문서 전체) 규칙 — `save` 가 죽는다

| # | 본 것 |
|---|---|
| M5 `section` | `applied: null` · `anchor: (문서 전체)` · `line 1 · end 5` · `content` 에 문서 전체 |
| M5 `save` | **`E_REPO` "Invalid regular expression: /^#{1,0}\s/: numbers out of order in {} quantifier"** — `core/save.js:277` 의 헤딩 검사 정규식이 `level 0` 에서 문법 오류. 그 전에 `replaceSection` 의 `^#{0}\s+값` 도 아무 줄에도 안 걸려 문서 끝에 ` 값` 줄을 붙일 것이었다 |
| `core/managed.js:224` | `—` 섹션은 `applied: null` 고정 — 작업 기록이 한 번이라도 그 좌표를 건드리면 영원히 `unwritten`(파생 누락 오류). `sliceSection` 은 앞 3줄의 applied 주석을 걷어 내게 돼 있어(`core/tools.js:109`) 문서 머리의 주석을 **염두에 두었지만 아무도 읽지 않는다** |
| `check` | `ok` — 규칙이 있어도 조용하다 |

쓰는 곳이 없어(패키지 3종 · fixture 에 `—` 규칙 0) 실사용 사고는 없다. 설계가 허용하는 표기이니 고친다 — 안 고칠 것이면 파서가 거절해야 한다.

### 3.7 캐시 둘 — 정합은 맞다

| # | 본 것 |
|---|---|
| M6 | `save` 직후 `section` → **새 applied**(읽기 781ms — 재스캔 포함) · `/api/alpha/status` works 29 = `work/*.md` 29 |
| M1 | 동시 5건 뒤 `section` 5개 전부 새 applied |
| `.git/HEAD` mtime | 커밋 6개 뒤에도 **그대로**(1790295745874.1587) — 커밋은 `refs/heads/<branch>` 를 쓰지 `HEAD` 를 안 만진다. 스탬프의 그 조각은 죽은 값이고, 잡아 주는 것은 `docs/` · `work/` 의 count + max mtime 이다. `save` 마다 `work/` 수가 늘어 같은 ms 문제가 없다 |
| `Store.load` | `loadRepo` 뒤 `Object.assign(this, r)` 한 번 — 재스캔 중 읽기가 반쪽 상태를 보지 않는다. `makeRepoCache` 는 `inflight` 로 겹침을 합친다 |

### 3.8 보이는 것 — 어디에 무엇이 있나 (M7 · M8 기준)

| 자리 | 지금 | 없는 것 |
|---|---|---|
| `save` 응답 | `mirror: "queued"` 고정 | 실제 상태 · 사유 |
| `E_CONFLICT` | 세 값 | §3.2 |
| `sync` 도구 | `mirror: ok\|lag\|off` | 사유 · 갈림 · 더러움 |
| `brief` | 두 줄 | 미러 · 트리 이상 |
| `/repos`(사용자) | `mirror` 셋 중 하나 · `head` | 사유 · `ahead` · 갈림 · 더러움 |
| 콘솔 지식 레포 | 「밀림 N」 칩 | 사유 · 복구 단추 |
| 콘솔 현황 | 경고 「미러가 밀린 레포」 · 「진단 fail」 | 갈림 · 더러움 · 최근 기록 · 실패 집계 |
| doctor | `push --dry-run` 첫 줄 | 사유 분류 · dirty · origin 이 앞섬 |
| 레포 화면 `/r/<레포>/` | 상태바에 로컬형 문법의 「보낼 것 N」(`/api/<레포>/git`) | 서버형 한 줄(미러 · 갈림 · 더러움) |
| 레포 관리 > 현황 | 작업 레포 카드 **"읽는 중…"** 고정 — M9 `/api/alpha/workrepos` 404 · `/diag` 404 | 서버판 응답 또는 카드 제거(불변조건 7) |
| `serve.log` | `tools/call · save · -` — **key 가 `-`** (`peek` 이 `a.coord \|\| a.id` 만 보고 `work.id` 는 안 본다) · `ms` 6ms(핸들러 반환 시각 · 도구 시간이 아니다) · 결과 코드 없음(MCP 오류는 HTTP 200) | 기록 id · 결과 |

### 3.9 검증 현황

| | 값 |
|---|---|
| `npm test` | 87건 · 15파일 — `core/save.js` 를 만지는 테스트 **0** (`E_CONFLICT` · `withLock` · `save(` 검색 0) · `core/git.js` **0** |
| 하네스 | 28(save 정상) · 29(옛 applied → E_CONFLICT) · 30(검사 실패 복원) · 31 · 73 · 76 — **전부 순차.** §10 "두 클라이언트가 같은 섹션" 은 동시로 검증된 적이 없다. 서버를 `--mirror` 없이 띄운다 — 미러 경로는 하네스 밖 |
| 마지막 번호 | 90 · v0.11.0 ✓ 75 ✗ 0 – 16 |

---

## 4. 문제 목록

### 4.1 동시 기록 (A)

| # | 심각도 | 문제 | 근거 |
|---|---|---|---|
| **P1** | **P0** | **더러운 서버 트리를 `save` 가 그대로 커밋한다.** 사람의 미커밋 편집이 다음 `save` 의 작성자 이름으로 origin 까지 간다. 중단된 `save` 의 잔여도 같은 길이다. 아무 경고가 없고 doctor 도 안 본다 | §3.5 M8 |
| **P2** | **P1** | **`E_CONFLICT` 가 재료를 안 준다** — 누가 · 언제 · 어느 기록 · 지금 본문. 스킬은 `section` 재호출 + 처음부터 다시 | §3.2 M2 · M3 |
| **P3** | **P1** | **미러 push 가 겹친다** — fire-and-forget · 직렬화 없음. 겹치면 `cannot lock ref` 로 하나가 진다(M11). 다음 `save` 까지 origin 이 뒤처진 채 아무도 모른다 | §3.3 |
| **P4** | **P1** | **실패 사유를 삼킨다** — 첫 줄 `To C:\…` 만. non-ff(사람이 맞춰야) · 인증(PAT 만료 — 관리자 10.1 이 "가장 흔하다") · 망(기다리면 된다) · 보호 브랜치 · lock 이 같은 얼굴이다 | §3.3 M7 |
| **P5** | **P1** | **서버 트리 ↔ origin 갈림(D13)에 길이 없다.** 서버는 fetch 를 안 하고, `pullFfOnly` 의 문장은 로컬형 사용자용이며, 맞추기는 셸에서 뮤텍스 밖에서 한다. 관리자 7.1~7.4 가 "등록부는 밖에서 고쳐 origin 에 올리고 7.6 으로 맞춘다" 고 **권하는 흐름**이 그 사이 `save` 한 번이면 갈라진다 | §3.4 |
| **P6** | **P1** | **`—` 규칙의 `save` 가 정규식 예외로 죽고 `E_REPO` 로 보인다** · `applied` 를 읽지 않아 한 번 건드리면 영원히 파생 누락 | §3.6 M5 |
| **P7** | **P1** | **`cdp-managed` 모드 B 에 길이 없다** — 서버형 팀은 파생 남은 섹션을 서버 셸 없이 못 치운다. R15 가 "설계서를 먼저" 라 미뤘다 | 스킬 `:221` · 설계서 §4.8 · R15 |
| **P8** | P2 | **혼용을 검출하지 못한다** — origin 이 서버보다 앞선 것(누군가 밖에서 썼다)을 doctor 의 `ls-remote` 가 이미 받아 오면서도 비교하지 않는다 | §3.4 |
| **P9** | P2 | **기록의 흐름이 안 보인다** — 누가 언제 무엇을 기록했고 무엇이 왜 거부됐는지(E_CONFLICT · E_CHECK · E_GIT)가 로그에도 화면에도 없다. `serve.log` 의 `save` 줄은 key `-` · 결과 없음 | §3.8 |
| **P10** | P2 | **응답 `mirror` 가 늘 `queued`** — 마지막 실제 상태를 말하지 않는다. `brief` 도 조용하다 | §3.3 |
| **P11** | P3 | `.git/HEAD` mtime 은 죽은 스탬프 조각 · `serve.log` 의 MCP `ms` 는 도구 시간이 아니다 | §3.7 · §3.8 |

### 4.2 보이는 것 · 화면

| # | 심각도 | 문제 | 근거 |
|---|---|---|---|
| **P12** | P1 | **레포 관리 > 현황의 작업 레포 카드가 "읽는 중…" 에 멈춘다**(화면 UX TODO 의 열린 버그) — `/api/<레포>/workrepos` · `/diag` 404. 실패를 "읽는 중" 으로 그린다 | §3.8 M9 |
| **P13** | P2 | 레포 화면 상태바가 서버형에서 로컬형 문법(「보낼 것 N」 · pull/push 단추가 `/api/<레포>/git/pull` 404 로)을 쓴다. 미러 · 갈림 · 더러움 한 줄이 없다 | `StatusBar.jsx` · `api.js` |
| **P14** | P2 | 콘솔 지식 레포에 복구 단추가 없다 — 밀림을 보여 주고 "셸에서" 라고만 한다 | `Repos.jsx` Note |
| **P15** | P3 | 설명서의 「안 하는 것」 표가 "자동 merge · 충돌 해결 · 서버의 pull" 을 한 줄로 묶어 ff-only 까지 금지처럼 읽힌다 | 관리자 `:845` |

### 4.3 검증

| # | 심각도 | 문제 |
|---|---|---|
| **P16** | P1 | `core/save.js` · `core/git.js` 단위 테스트 0 · 하네스는 순차뿐 · `--mirror` 경로 0 |

### 4.4 제품화 기준 — 넓게 (B)

제품화 검토 §3 의 영역과 D1~D14 · 화면 UX TODO 의 열린 항목을 다시 걸었다. **프로그램 변경이 있는 것을 앞에** 둔다.

| # | 영역 | 지금 | 판단 | P · 크기 | 이번 판 |
|---|---|---|---|---|---|
| B1 | 조용한 실패 | 더러운 트리 · 미러 사유 · 갈림 — 위 P1 · P3 · P4 · P5 | 오류로 바꾼다 | P0/P1 · M | **○** |
| B2 | doctor 가 못 보는 것 | dirty · origin 앞섬 · 실패 사유 · 토큰 없이 쓰려는 사람(→ `write` 줄은 있다) | 줄 셋 추가 · 사유는 같은 분류 함수 | P1 · S | **○** |
| B3 | 서버 모드 404 | P12 | 서버판으로 그린다 | P1 · S | **○** |
| B4 | 회귀 검증 구멍 | P16 | `test/save` · `test/git` · 하네스 91~ · `--mirror` 서버 하나 더 | P1 · M | **○** |
| B5 | 손 타는 자리 | 서버 트리 맞추기 · 되돌리기 · 다시 보내기 — 전부 `sudo -u cdp git …` | 콘솔 단추 셋(재인증 · 감사) · 판정은 `core/` | P1 · M | **○** |
| B6 | 기록의 흐름 | P9 | 콘솔 현황 「최근 기록」 · 실패 집계 — 본문 · 검색어 없이 | P2 · S | **○** |
| B7 | `save` 비용 | 1.8초/건 직렬 — `loadRepo` ×3 | 한 번 읽고 메모리에서 갱신 판정 | P3 · M | 다음 판 |
| B8 | 온보딩 마찰 | 토큰 → 꾸러미 → 첫 `save` 까지 — 화면 UX v0.11.0 이 길을 닦았다 | 이번 주제 아님 | P3 · — | 다음 판 |
| B9 | 로그의 `save` 줄 | key `-` · 결과 없음 · ms 무의미 | `work.id` · 결과 코드 · 도구 시간 | P2 · S | **○** |
| B10 | `.git/HEAD` 스탬프 | 죽은 조각 | 문서에 적고 둔다(잡아 주는 것이 따로 있다) | P3 · S | 다음 판 |
| B11 | 설계서 · 설명서 어긋남 | §4.8 · R15 · D13 · 7.6 · 「안 하는 것」 | 정정 상자 | P2 · S | **○** |

### 4.5 잘 된 것 — 지킨다

레포당 뮤텍스(`withLock` — 거부돼도 다음이 돈다) · `applied` 낙관 잠금(같은 섹션 · 새 섹션 · 어휘 · id 전부 둘째가 진다) · `Snap` 의 전부-또는-무(검사 실패 복원 · 커밋 0) · `commitPaths` 가 바뀐 경로만 add · author 는 토큰 · `--mirror` 는 커밋 뒤 · 캐시 둘의 정합(save 직후 새 값) · `sections[].body` 의 헤딩 거절 · `dup-anchor` 오류 · `/healthz` 에 이름 없음 · 존재를 알리지 않는 404.

### 4.6 범위 밖 관찰 (이번 판에 넣지 않는다)

- **`save` 1.8초/건** — `loadRepo` 세 번 + git 세 번. 다섯이 동시면 마지막이 8초. B7 · 다음 판.
- `serve.log` 의 MCP `ms` 는 핸들러 반환 시각이다(6ms · 실제 1초). B9 에서 `save` 줄만 고친다 — 전체 도구 시간 계측은 다음 판.
- `pullFfOnly` 의 diverged 문장이 `git pull --rebase` 를 권한다 — 서버 트리에는 `sudo -u cdp -H git -C <root>/<레포> pull --rebase` 다. 서버 쪽 문장은 이번에 갈라 적고, 로컬형 문장은 그대로.
- 개발용 서버 `--web` 없이 띄우면 `/r` 이 빈다 — 실측에는 무관.

---

## 5. 개선안 — 대안과 권장 · 불변조건 대조

### 5.1 미러 push — 큐 하나 · 분류 하나 · 상태 하나 (P3 · P4 · P10) — **권장 A**

| 안 | 무엇 | 되는 것 | 안 되는 것 · 값 |
|---|---|---|---|
| **A · `core/mirror.js` 큐** (권장) | 레포마다 push 큐 하나 — 도는 중이면 **한 번 더**(`again`) 표시만 하고 끝나면 한 번 더 민다(커밋은 누적이라 한 번이면 전부 간다). 결과 `{ state, reason, message, at, ahead, behind }` 를 기억한다. 실패는 `core/git.classifyPushError(stderr)` — **순수 함수** — 로 `non-ff · auth · net · protected · locked · no-upstream · unknown`. non-ff 면 `fetch` 한 번 해서 `ahead/behind` 를 채운다(트리는 안 만진다) | 겹침 0 · 사유 한 곳 · 응답 · 콘솔 · doctor · `brief` · 로그가 같은 값 | 프로세스 메모리라 재시작하면 마지막 사유를 잊는다 — 그때는 `ahead` 만 알고 사유는 "진단을 돌린다" 로 |
| B · `save` 뮤텍스 안에서 push 를 기다린다 | 직렬화는 공짜 | 응답 하나 · 겹침 없음 | 사내망 push 가 초 단위면 그동안 다른 `save` 가 전부 선다 → **아니다** |
| C · 주기 push(타이머) | 밀린 것을 알아서 보낸다 | 재시작 뒤 밀림이 풀린다 | 불변조건 11 "push 는 사람이(서버형은 서버의 미러)" 의 **자동 push 확대**다 · 사람이 보낸 적 없는 push 가 생긴다 → **하지 않는다** |

**A 의 세부** — `save` 응답 `mirror` 는 문자열 그대로(호환)이되 값이 는다: `off` · `ok`(1.5초 안에 갔다) · `queued`(아직 도는 중) · `lag`(실패 — 사유는 `mirrorReason`) · `diverged`. 기다리는 상한 1.5초는 **뮤텍스 밖**이다. 마지막 실제 상태를 `mirrorLast` 로 늘 싣는다. `warnings` 에 미러 이상 한 줄 — *"미러가 밀려 있다 · non-ff — 관리자가 콘솔에서 origin 과 맞춘다"*. `brief` 는 서버형에서 그 한 줄을 낸다.

### 5.2 서버 트리 ↔ origin — D13 을 닫는다 (P5 · P8) — **권장: 콘솔 「origin 과 맞추기」 + 알아채기는 doctor · push 실패에서**

| 어디서 맞추나 | 값 | 판단 |
|---|---|---|
| `save` 마다 fetch | 갈림을 미리 막는다 | 사내망 fetch 19.5초 실측(`core/sync.js` 머리말) — `save` 가 20초가 된다 → **아니다** |
| 주기 fetch(타이머) | 갈림을 몇 분 안에 안다 | 레포 N × 몇 분마다 프로세스. 작업 트리는 안 만지니 안전하지만 지금 값이 작다 → 다음 판 후보 |
| **push 실패 때 fetch** (권장) | non-ff 가 나면 그때 `fetch` → `ahead/behind` → `diverged` | 실패한 순간에만 비용 · 갈림을 정확히 안다 |
| **doctor 의 `ls-remote` 비교** (권장) | 이미 받아 오는 origin HEAD sha 를 로컬 `origin/<branch>` 와 비교 — **fetch 없이** "origin 이 앞서 있다 = 누군가 밖에서 썼다" | 콘솔이 열려 있을 때 60초 캐시로 · 비용 0 추가 |
| **콘솔 단추 「origin 과 맞추기」** (권장) | 재인증 · `withLock` 안에서 `core/sync.runSync`(fetch → 깨끗 · ahead 0 · behind > 0 이면 ff → 재스캔) · 감사 로그 · 갈라졌으면 거절하고 **서버용 문장**(`sudo -u cdp -H git -C … pull --rebase`) | 같은 함수 · 같은 뮤텍스 · 사람의 클릭 |

갈라진 채 `save` 가 오면 — **`save` 는 계속한다**(서버 트리가 정본). 응답 `mirror: diverged` · `warnings` 한 줄 · 콘솔 배지 `갈림` · doctor `fail` · 복구 명령. 막지 않는 이유: 기록을 막으면 사람은 기록을 미루고, 미룬 기록은 사라진다. 서버 트리에는 전부 남으므로 잃는 것이 없다.

불변조건 10 — ff 는 merge 가 아니다(커밋이 생기지 않고 두 갱신이 섞이지 않는다). 11 — 사람의 클릭이다. 관리자 설명서 「안 하는 것」 표는 "자동 merge · 충돌 해결" 과 "서버의 pull(ff-only 는 콘솔에서 사람이)" 로 **갈라 적는다**.

### 5.3 더러운 트리 (P1) — **권장: `save` 거절 + 콘솔 「트리 되돌리기」**

| 안 | 무엇 | 판단 |
|---|---|---|
| **거절** (권장) | `save` 첫 단계(뮤텍스 안)에서 `git status` 한 번(≈80ms) → `dirty > 0` 이면 **`E_GIT { reason: 'dirty', paths: [...5] }`** 로 거절 · 문장에 복구 길 | 조용한 커밋 → 소리 나는 거절. 서버가 유일한 작성자이므로 더러움은 언제나 사고다 |
| 경고만 하고 커밋 | 기록은 된다 | 남의 줄이 내 이름으로 origin 까지 간다 — P0 그대로 → **아니다** |
| 더러운 경로만 빼고 커밋 | `commitPaths` 가 이미 경로만 add 한다 | 섹션 치환이 **더러운 파일 내용 위에서** 도는 것은 그대로다(M8 이 그 경우) → **아니다** |

**되돌리기** — 콘솔 지식 레포 행의 「트리 되돌리기」(재인증 · `withLock` · `git checkout -- . && git clean -fd` · 버린 경로를 감사 로그에) 하나. CLI 는 따로 두지 않는다 — 셸이면 그 두 줄을 직접 치면 되고 설명서에 적는다. 서버가 유일한 작성자라 HEAD 로 되돌리는 것은 merge 도 사람의 것을 버리는 것도 아니다 — 사람의 것은 origin 에 올라간다. doctor 에 `fail 레포 X 트리 — 커밋 안 된 변경 N` · 시작 로그에 한 줄.

### 5.4 `E_CONFLICT` 재료 (P2) — **권장: detail 확장 · 스킬은 재호출 없이 다시**

```jsonc
{ "code": "E_CONFLICT", "message": "섹션이 읽은 뒤 바뀌었다 — hong 이 2026-09-25 11:00 에 2026-0925-같은섹션-hong 으로 갱신했다. detail.content 위에 다시 만들어 applied 에 current 를 넣어 보낸다",
  "detail": { "coord": "…", "expected": "…", "current": "2026-0925-같은섹션-hong",
              "currentWork": { "id": "…", "title": "…", "author": "hong", "date": "2026-09-25 11:00" },
              "content": "…지금 섹션 본문(헤딩 · applied 없이)…", "truncated": false } }
```

`content` 는 8,000자에서 자르고 `truncated: true` — 그때만 `section` 을 다시 부른다. 스킬 ⑤B 표 · 모드 표 · 사용자 6.5 · 9.2 · 10.2 의 문장을 "**detail.content 위에 ④ 를 다시 만들고 applied 에 current 를**" 로 바꾼다. 대안 — 서버가 병합해 준다: 불변조건 10 → 없다.

### 5.5 `—` 규칙 (P6) — **권장: 문서 머리의 applied 주석 · 전체 치환**

- 문서 전체가 좌표의 상태이면 `applied` 는 **문서 첫 3줄 안의 `<!-- applied: … -->`** 다(`sliceSection` 이 이미 그렇게 읽는다). `parseDoc` 이 그것을 `appliedTop` 으로 읽고 `managedIndex.find` 가 `—` 섹션에 싣는다 → 파생 판정이 다른 섹션과 같아진다.
- `save` 의 `level 0` — 헤딩 검사는 건너뛴다(문서 전체에 헤딩이 있는 것이 정상) · 치환은 **파일 전체** = `<!-- applied: <id> -->` + 본문. `current` 는 머리 주석에서.
- 대안 — 파서가 `—` 를 거절: 설계(`docs/관리문서패키지/04_좌표와등록부`)가 허용하는 표기를 코드가 뒤집는다 → 아니다.

### 5.6 `cdp-managed` 모드 B (P7) — **권장 (a) 파생 정리 기록 규약 · 코드 변경 0**

| 안 | 무엇 | 판단 |
|---|---|---|
| **(a) 파생 정리 기록** (권장) | 따라잡은 것을 **작업 기록 한 건**으로 `save` 한다 — `id: YYYY-MMDD-파생정리-<좌표조각>` · `tags: [derive]` · `touches` = 치운 좌표들 · 본문 = 어느 기록(id)을 근거로 어떻게 판단했나 · `sections` = 치운 섹션(applied 는 `section` 값 그대로). 좌표 단위로 나눈다(모드 A 의 "좌표 단위 커밋" 과 같다) | `work/` 불변(3) 그대로 · `save` 의 규칙(출처 있는 변경) 그대로 · 판정 코드 변경 0. §4.8 이 걱정한 "없는 사건" — **따라잡기의 판단은 사건이다.** 모드 A 는 그 판단을 커밋 메시지 한 줄에만 남겼는데, 이쪽이 더 많이 남긴다. `where` 가 그 좌표의 최신 기록으로 파생 정리 기록을 내는 것은 사실이다(섹션이 그 기록에서 갱신됐다) — 본문 첫 줄이 "파생 정리" 임을 말하고 `tags` 로 거를 수 있다 |
| (b) `save` 에 `work` 없는 변형 | 섹션만 보낸다 | 출처 없는 변경 — §4.5 규칙 · R15 · 불변조건 5 와 충돌 · 검사(`later`)가 근거를 잃는다 → **아니다** |
| (c) 따라잡기 전용 도구 `catchup` | 새 도구 하나 | (b) 와 같은 문제를 이름만 바꾼 것 → 아니다 |

여는 순서 — MCP 설계서 §4.8 정정 상자 → 스킬 ④ 모드 B 절 → 사용자 7.3 → 제품화 검토 R15 정정.

### 5.7 보이는 것 (P9 · P12 · P13 · P14)

- **콘솔 지식 레포** — 미러 칩이 사실만: `최신` · `밀림 N · <사유>` · `갈림 (ahead N · behind M)` · `origin 앞섬 M`(맞추면 된다) · `트리 더러움 N` · `원격 없음`. 행 단추 셋(재인증 뒤): 「다시 보내기」(lag) · 「origin 과 맞추기」(behind · diverged 는 거절 문장) · 「트리 되돌리기」(dirty). 0건이면 단추가 없다.
- **콘솔 현황** — 경고 줄에 갈림(bad) · 더러움(bad) · 인증 실패(warn · "PAT") 를 가른다 · 카드 「최근 기록」 10줄(시각 · 사람 · 레포 · id · 결과 · 미러) · 「거부 24h」 집계(E_CONFLICT · E_CHECK · E_GIT). 출처는 `serve.log` 의 `save` 줄 — B9 에서 key 를 `work.id` 로, 결과 코드를 실어 고친다(본문 · 검색어는 그대로 안 적는다).
- **레포 화면** — 상태바(서버형)에 `/repos` 의 자기 행으로 한 줄: 이상 있을 때만(`밀림 2 · 인증 실패 — 관리자에게` · `갈림` · `트리 더러움`). 로컬형 문법의 pull/push 단추는 서버형에서 내지 않는다.
- **레포 관리 > 현황** — 작업 레포 카드는 서버형에서 `/workrepos`(대장 · 이 레포 것만)로 그린다. `diag` 가 없으면 그 줄을 **그리지 않는다**(불변조건 7).
- **doctor** — 레포 줄 셋 추가: `트리`(dirty → fail) · `origin`(ls-remote sha ≠ 로컬 upstream → warn "origin 이 앞서 있다 — 콘솔 > 지식 레포 > origin 과 맞추기") · `push` 의 note 는 분류 사유.

### 5.8 검증 (P16)

- `test/git.test.mjs` — `classifyPushError`(문장 7종) · `status` · `ffToUpstream` · `restoreTree` 를 임시 레포 + bare 로.
- `test/save.test.mjs` — `withLock` 순서 · `save` 를 임시 레포에서 직접(`core/`): 동시 N=5 다른 섹션 · 같은 섹션 둘 · 새 섹션 둘 · `Snap` 복원 · dirty 거절 · `—` 규칙 · `E_CONFLICT` detail 모양 · 미러 큐(bare · non-ff 분류 · 겹침 합침).
- 하네스 91~97 — `--mirror` 서버 하나를 더 띄워(포트 +3 · bare origin) 동시 5건 · 같은 섹션 동시 · non-ff → 사유 · 「맞추기」 · dirty 거절 → 「되돌리기」 · `—` 규칙 · 최근 기록.

### 5.9 문서

MCP 설계서 §2.6 · §4.2 · §4.5 · §4.8 · §4.9 · §10 에 정정 상자 · 제품관리서비스 검토 D13 닫음 · 제품화 검토 R15 정정 · 시스템설계서 제3부에 11 의 서버형 주석 · 사용자 6.5 · 7.3 · 9.2 · 10.2 · 관리자 6장(콘솔 지식 레포 단추) · 7.6 · 10.1 · 11 · 개발자 2.1 · 5.1 · 5.2 · 7.4 · 8.4 · `agent/manual/user.md · admin.md` 의 같은 자리 · `docs/README.md` · `README.md` · CHANGELOG v0.12.0.

---

## 6. 하지 않을 것

| | 왜 |
|---|---|
| **섹션 점유 · 잠금 UI**("hong 이 편집 중") | `system.md:292` — 일감 분배의 문제지 문서 형식이 아니다. 낙관 잠금이 맞는 도구이고 실측에서 흔들리지 않았다. 점유는 풀리지 않은 점유를 만든다 |
| **자동 merge · 충돌 해결** | 불변조건 10. `E_CONFLICT` 의 `content` 를 주는 것은 사람이 합치라는 뜻이다 |
| **자동 push 확대**(주기 · 시작 시 catch-up) | 불변조건 11. 미러 push 는 `save` 뒤와 사람의 「다시 보내기」 뿐 |
| **`save` 마다 fetch** | 19.5초 |
| **화면에서 문서 편집** | 쓰기는 스킬과 `save` 의 일 |
| **혼용 금지**(origin push 를 서버가 막는다) | 막을 수 없다(origin 은 GitLab 이다) · 막지 않되 보이게 |
| **`save` 에 `work` 없는 변형 · `catchup` 도구** | §5.6 |
| **재시작을 견디는 미러 상태 파일** | `ahead` 는 git 이 알고 사유는 doctor 가 다시 낸다. 파일 하나를 더 늘릴 값이 없다 |
| **`save` 성능**(loadRepo 한 번) | 막히지 않는다 — 다음 판 |

---

## 7. 전제 — 지키는 결정

D1(한 프로세스) · D4(권한 밖 403 · 이름 없음) · D5(재인증 15분 — 새 단추 셋이 전부 그 안) · D7(갱신 · 재시작은 셸) · D8(PAT 는 셸 — 콘솔은 사유만 보인다) · `/healthz` 집계만 · `--mirror` 는 커밋 뒤 push · 판정은 `core/` · 스킬 본문의 호출은 MCP 도구 — 전부 그대로다. 바꾸는 결정은 **D13 을 닫는 것**과 **R15 의 "정하지 않는다" 를 정하는 것** 둘이고, 둘 다 설계서 정정 상자로 남긴다.

---

## 8. 결정 D1~D14 — 권장으로 닫는다

| # | 결정 | 대안 | 왜 |
|---|---|---|---|
| D1 | 미러 push 는 **레포당 큐 하나 · 겹치면 한 번 더** (`core/mirror.js`) | 뮤텍스 안 대기 · 타이머 | §5.1 |
| D2 | 실패 사유는 **순수 함수 `classifyPushError`** 하나 — `non-ff · auth · net · protected · locked · no-upstream · unknown` | 자리마다 정규식 | 판정 한 곳(1) |
| D3 | `save` 응답 `mirror` 는 문자열 · 값 `off · ok · queued · lag · diverged` · `mirrorReason` · `mirrorLast` · `warnings` 한 줄 · 기다림 상한 1.5초(뮤텍스 밖) | 객체로 바꿈 · 안 기다림 | 호환 · 빠른 원격은 진실을 · 느린 원격은 `queued` |
| D4 | 서버 트리 ↔ origin — **콘솔 「origin 과 맞추기」**(재인증 · `withLock` · `runSync` · 감사) · 알아채기는 push 실패의 fetch 와 doctor 의 ls-remote 비교 · `save` 마다 fetch 안 함 · 갈라지면 `save` 는 계속 + 표시 | 주기 fetch · save 막기 | §5.2 · D13 닫음 |
| D5 | 더러운 트리 — **`save` 거절 `E_GIT dirty`** · 콘솔 「트리 되돌리기」(`checkout -- . && clean -fd` · 감사) · doctor fail · CLI 없음 | 경고만 · 경로만 빼기 · CLI | §5.3 |
| D6 | `E_CONFLICT` detail 에 `currentWork` · `content`(8,000자 · `truncated`) · 문장에 누가 · 언제 | 그대로 | §5.4 |
| D7 | `—` 규칙 — 문서 첫 3줄의 applied 주석이 `applied` · 전체 치환 · 헤딩 검사 생략 | 파서 거절 | §5.5 |
| D8 | `cdp-managed` 모드 B — **파생 정리 기록 규약**(`tags: [derive]`) · 코드 변경 0 · §4.8 정정 · R15 정정 | `work` 선택 · `catchup` | §5.6 |
| D9 | 혼용 — **막지 않되 보이게**(doctor · 콘솔 · 응답) | 막기 | origin 은 서버 밖 |
| D10 | 기록의 흐름 — `serve.log` `save` 줄에 id · 결과 코드 · 도구 시간 → 콘솔 현황 「최근 기록」 10 · 「거부 24h」 | 새 로그 파일 | 파일을 늘리지 않는다 · 본문은 그대로 안 적는다 |
| D11 | 서버 모드 404 — 작업 레포 카드는 `/workrepos` 로 · `diag` 줄은 안 그린다 | 서버판 `/api/<레포>/diag` | 불변조건 7 · 값이 없는 API 를 늘리지 않는다 |
| D12 | 레포 화면 — 상태바에 서버형 한 줄(이상 있을 때만) · 로컬형 단추는 안 낸다 | 상단 바 배지 | 정상은 조용하다 |
| D13 | 섹션 점유 UI · 자동 merge · 자동 push 확대 · save 마다 fetch — **하지 않는다** | — | §6 |
| D14 | 판 **v0.12.0** · 커밋 셋(검토 · 구현 · 문서) · push · 태그는 사람이 | — | 전례 |

---

## 9. 크기 · 순서 → TODO

| 단계 | 무엇 | 크기 |
|---|---|---|
| ① | `core/git.js` 분류 · `ffToUpstream` · `restoreTree` · `core/mirror.js` 큐 · `core/save.js`(dirty · E_CONFLICT · `—` · 미러 큐 · 응답) · `core/managed.js` · `frontmatter.js`(`—` applied) · `core/reponew.listRepos`(dirty · behind) | M |
| ② | 서버 — `/repos` · `/admin/repos` 행 · `POST /admin/repos/<name>/sync · push · restore` · `/admin/overview` 경고 · 최근 기록 · `/healthz` · doctor 줄 셋 · `peek` · MCP `sync` · `brief` | M |
| ③ | 화면 — 콘솔 지식 레포 칩 · 단추 셋 · 현황 카드 · 레포 상태바 한 줄 · 레포 관리 > 현황 서버판 | S |
| ④ | 테스트 `test/git` · `test/save` · 하네스 91~97(`--mirror` 서버) | M |
| ⑤ | 스킬 · 설명서 · 설계서 정정 상자 · README · CHANGELOG · 0.12.0 · TODO 실측 | S |

의존 — ① → ② → ③ · ④ 는 ①② 뒤 · ⑤ 는 끝. 커밋 셋 — (검토 + 페르소나) · (①~④) · (⑤).

---

## 부록 A. 실측 방법

- 판: `ops/out/concur/`(추적 안 함) — fixture 복사 · `git init` · bare origin · `ctx serve user add`(admin 1 · writer 2) · `serve token` 셋. 토큰 원문은 어디에도 적지 않았다.
- 동시성: Node `fetch` 로 `POST /mcp/alpha` `tools/call save` 를 `Promise.all`. 응답은 SSE `data:` 줄 또는 JSON. 시간은 요청 앞뒤 `Date.now()`.
- git 상태: `git -c core.quotepath=false status -sb · --porcelain · rev-list --count · show --stat`. origin 은 bare 의 `rev-parse HEAD`.
- 갈림: bare 를 clone 한 둘째 트리에서 커밋 · push 한 뒤 서버에 `save`. 동시 push 문장은 bare 하나에 두 clone 이 동시에 push 해서 받았다(M11).
- 스크립트는 스크래치패드에 두고 레포에 넣지 않았다 — 재현은 하네스 91~97 이 맡는다.
