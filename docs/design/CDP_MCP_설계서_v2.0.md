# CDP MCP 설계서 v2.0

> **무엇인가** — 서버가 에이전트(Claude Code 등 MCP 호스트)에게 내는 것 — 도구 12 · 역할별 등록 · HTTP 전송 · 인증 · 레포 고르기 · 캐시 · 오류 규약 · kit 과 설치.
> **기준** — 코드 main `d5e0a1c`(2026-10-06). 결정은 [`CDP_v1.0_개편안.md`](CDP_v1.0_개편안.md) §5.3 · §5.6 · §6.3(V9 · V10). **어긋나면 코드가 맞다** — [§14](#14-코드와-개편안이-어긋난-곳).
> **대신하는 것** — [`CDP_MCP_설계서_v1.0.md`](CDP_MCP_설계서_v1.0.md)(내용은 v1.1 · 2026-09-21)에서 **살아남은 것만** 옮겼다. 모드 A(stdio) · `ctx setup` · 패키지 · kit-refresh 는 없다. 짝 문서 — [`CDP_시스템설계서_v2.0.md`](CDP_시스템설계서_v2.0.md)(save · 서버 · 검사).
>
> 작성 2026-10-07

---

## 0. 범위 · 용어

| 용어 | 뜻 |
|---|---|
| 호스트 | MCP 클라이언트 — Claude Code · Claude Desktop 등 |
| 서버 | `ctx serve` 한 프로세스 — MCP · 화면 · 콘솔을 같은 포트로 낸다. 팀 서버와 개인 서버(`--personal`)가 같은 코드다 |
| 레포 | 지식 레포 하나. 폴더 이름이 레포 이름이다. 서버 하나가 N 개를 든다 |
| 작업 레포 | 사람이 코드를 짜는 git 레포. 여기에 `.mcp.json` · 스킬 · `CLAUDE.md` 블록이 깔린다 |
| 큐레이터 폴더 | 큐레이터가 큐레이션 세션을 여는 폴더 — 작업 레포가 아니어도 된다(git 도 대장 등록도 없이) |
| 명함 | 도구의 `description` + `inputSchema`. **정본은 [`viewer/bin/ctx-mcp.mjs`](../../viewer/bin/ctx-mcp.mjs) 의 `CARD`** — 이 문서는 요지만 적는다 |
| kit | 작업 레포 · 큐레이터 폴더에 까는 스킬과 CLAUDE 블록 — 서버 번들의 `kit/` 에서 역할별로 나간다 |

범위 밖 — 레포 간 조인(레포는 고르는 것이지 합치는 것이 아니다) · 문서별 권한 · OAuth · 서버가 LLM 을 부르는 것(I11).

---

## 1. 구조

```
호스트(Claude Code) ──HTTP POST /mcp/<레포>── ctx serve ──┬── 인증(명부 · Bearer)            core/auth.js
   .mcp.json: type http · Bearer ${CDP_TOKEN}             ├── buildServer(요청마다)          viewer/bin/ctx-mcp.mjs
                                                          │     도구 · 리소스 · prompts · instructions
                                                          ├── 레포 캐시(HEAD sha)             makeRepoCache
                                                          └── saver → core/save.js           뮤텍스 · 검사 · 커밋 · 미러
```

- **전송은 Streamable HTTP 하나다**(stateless — 세션 id 없음). stdio 는 v1.0 에서 끝났다(§12).
- **요청마다 서버 객체를 새로 만든다** — 무거운 것(레포)은 캐시가 들고 있어 만드는 것은 등록표뿐이다. 그 요청의 인증 결과와 볼 수 있는 레포는 `AsyncLocalStorage` 로 팩토리에 잇는다(전역에 두면 동시 요청이 서로 덮는다).
- **계산은 여기서 하지 않는다** — 도구의 모양은 전부 [`core/tools.js`](../../core/tools.js) 가 만들고 `ctx <명령> --json` 이 같은 함수를 부른다. `ctx-mcp.mjs` 가 하는 일은 셋뿐이다: 레포를 고르고 · 명함을 붙이고 · 오류를 규약 모양으로 싼다.
- `buildServer({ repos, fallback, prompts, allow, notice, saver, built, curate, curateAny, formsOpt })` — `repos` 는 **권한 안의 레포만** 받는다.

---

## 2. 도구 12

| 도구 | 입력 | 출력 요지 | viewer | writer | 큐레이터 |
|---|---|---|:--:|:--:|:--:|
| `match` | `names`(1~20) · `repo?` | `[{ repo, name, coord, kind(이름 · 값 · alias · 미등재), matchedBy, exact, vocabLine, deprecated?, successor?, docs? }]` — `repo` 를 안 주면 볼 수 있는 레포 전부를 대조 | ○ | ○ | ○ |
| `where` | `coord` · `limit?`(5 · ≤50) | `{ coord, normalized?, registry, section: { doc, anchor, line, end, applied, state, pending }, works, total }` — `state` 는 `ok` · `pending` · `missing`, `pending` 은 미반영 건수 | ○ | ○ | ○ |
| `section` | `coord` | 섹션 + **미반영 기록 본문** + 정본 한 단계(아래) | ○ | ○ | ○ |
| `work` | `id` | `{ id, path, frontmatter(… curates? · baseline?), curation, body }` — `curation` 은 기록의 큐레이션 상태 | ○ | ○ | ○ |
| `search` | `words`(1~10) · `limit?`(12 · ≤50) | `[{ coord, hits, docs, works, section }]` — 말 → 좌표 후보. 본문은 싣지 않는다 | ○ | ○ | ○ |
| `check` | — | `{ ok, errors, warnings, findings }` | ○ | ○ | ○ |
| `docs` | `doc?`(경로 · 관리번호 · `_vocab.md` · `_managed.md`) | 목록(문서마다 `usage`) · 문서 하나의 원문 · 헤딩(좌표 섹션이면 `coord`) | ○ | ○ | ○ |
| `brief` | — | `{ lines, …repoStatus, curation?, sync, built }` — 옛 `sync` · `version` 을 흡수했다 | ○ | ○ | ○ |
| `repos` | — | `[{ name, title, default, coords, works, docs }]` — 권한 안의 레포만 | ○ | ○ | ○ |
| `save` | `repo`(필수) · `work` · `sections?` · `vocab?` · `managed?` · `edits?` · `examples?` · `dryRun?` · `baseline?` · `assets?` | [시스템설계서 §5](CDP_시스템설계서_v2.0.md#5-save-v10) | (보인다 · 거절) | 기록만 | 전부 |
| **`queue`** | `id?` | 대기열 `{ items, total, oldestDays, implicit }` · `id` 면 그 기록의 판정 재료 | — | — | ○ |
| **`forms`** | `q?` · `form?` | `{ forms, total, groups }` · `form` 이면 `{ head, guide, example, stamp, … }` — `stamp` 은 서버가 실제로 찍을 빈 문서 | — | — | ○ |

**v0.x 의 14 → 12** — `derive` · `apply` · `sync` · `version` 을 지웠다(5488d75). 무엇이 대신하나 — `queue`(남은 일) · `section`(미반영 기록) · `brief`(미러 · kit 해시 · 번들 판).

### 2.1 `section` — 보증이 실리는 자리(I7 · V10)

```jsonc
{
  "coord", "doc", "anchor", "line", "end", "applied", "heading",
  "body",        // 헤딩부터 실린 원문
  "content",     // 헤딩 · applied 주석 · 기준선 블록을 뺀 글 — 큐레이터가 save 의 sections[].body 에 이것을 고쳐 넣는다
  "baseline",    // { src, asof, body } — 기준선 블록이 있을 때
  "state",       // ok · pending · missing
  "form",        // 그 문서의 서식 id(서식 표지) 또는 null
  "pending",     // [{ id, title, date, author, excerpt }] — 미반영 기록, 날짜 오름차순
  "pendingRecords", // [{ id, title, date, author, touches, body, truncated }] — 그 본문
  "pendingOmitted", // 8건을 넘은 수
  "refs"         // [{ coord, doc, anchor, state, content, truncated }] — 본문이 백틱으로 가리킨 좌표의 정본 섹션(한 단계)
}
```

- **미반영 본문을 기본으로 싣는다** — 섹션은 큐레이터가 반영한 데까지만 지금이다. 그 뒤의 기록까지 읽어야 지금을 안다. 이것을 스킬에 맡기면 보증이 LLM 의 선의에 걸린다(개편안 H6).
- **섹션이 없어도 낸다** — 등록부 없는 타입 · 섹션 없는 좌표면 `body: null` · `state: missing` · `reason`(`unregistered` · `doc-missing` · `anchor-missing`)과 함께, 그 좌표를 건드린 **대기 기록**을 같이 낸다 — 그때는 그 기록이 유일한 근거다.
- 상한(`core/tools.js`) — 미반영 기록 8건 · 한 건 6,000자 · 합 30,000자(넘으면 `truncated` · `pendingOmitted`) · 정본 참조 5개 · 한 섹션 3,000자.

### 2.2 응답 상한 · 입력 형식

- `section` · `work` · `docs` 는 응답이 512 KB 를 넘으면 **자르지 않고 거절한다**(`E_INPUT` · `guardSize`) — 잘린 정본은 정본이 아니다.
- `coord` — `type:value` · 타입은 ASCII 소문자 또는 한글로 시작 · `..` · 제어문자 금지(`E_COORD`). `id` — `YYYY-MMDD-slug`.
- `save` 의 입력은 zod 스키마다 — `work` · `managed[]` · `edits[]` · `baseline[]` · `assets[]` · `curates[]` 는 **모르는 키를 거절한다**(`author` 를 보낸 클라이언트가 무시된 줄 모른 채 「기록했다」 고 답하지 않게). 배열 상한 — `sections` 50 · `vocab` 50 · `managed` 10 · `edits` 20 · `baseline` 200 · `assets` 20 · `curates` 100.

---

## 3. 역할별 등록

**역할에 없는 도구는 보이지도 않는다**(개편안 §5.3). 서버는 요청마다 등록표를 만들고 그때 인증 결과를 들고 있다.

| 무엇 | 가르는 값 | 코드 |
|---|---|---|
| `queue` · `forms` 등록 | `curateAny` — admin 이거나 `curate` 목록이 비어 있지 않다 | `ctx-mcp-serve.mjs` → `buildServer({ curateAny })` |
| 부를 때 레포마다 | `curate(name)` — 그 레포의 큐레이터가 아니면 `E_FORBIDDEN { need: 'curate' }` | `queue` · `forms` 핸들러 |
| `save` 명함 | `curateAny` 면 `CARD.saveCurator`(판정 · 섹션 · 등록부 · edits · 예시 · 첨부) · 아니면 `CARD.save`(기록 하나 · 관리 문서는 쓰지 않는다) | 같다 |
| `save` 의 입력 | save 2.1 이 역할로 가른다 — writer 가 큐레이터 입력을 보내면 `E_FORBIDDEN { need: 'curate', fields }` | `core/save.js` `curatorOnly` |
| `brief` 의 kit 해시 | 그 레포의 큐레이터면 큐레이터 kit, 아니면 writer kit 의 해시 | `syncOf(r, role)` |

- `save` 는 **모든 연결에 등록된다** — viewer 가 부르면 save 1단계가 `E_FORBIDDEN`(쓰기 권한 없음)이다. 개편안은 viewer 에게 안 보이게 적었다(§14).
- 큐레이터 권한은 레포별이므로 `curateAny` 로 등록된 `queue` 가 다른 레포에서는 거절될 수 있다 — 거절이 「그 레포의 큐레이터가 아니다」 를 말한다.

---

## 4. 전송 — HTTP

| 경로 | 뜻 |
|---|---|
| `POST /mcp` | 레포는 도구의 `repo` 인자로 고른다. 기본 레포는 권한 안의 레포가 **하나일 때만** 정해진다 |
| `POST /mcp/<레포>` | 같은 규약 · **`<레포>` 가 기본 레포**다. 다른 `repo` 를 넘기면 권한 안에서 허용한다 — 설치 한 줄이 쓰는 모양 |
| 그 밖의 메서드 | SDK 의 기본 응답(stateless) |

- **몸통 상한 2 MB** — `content-length` 로 한 바이트도 받기 전에 끊고(413), `Expect: 100-continue` 도 같은 자리에서 거절한다.
- **Origin** — 붙어 있으면 같은 출처 · 루프백 · `--public-url` 만 통과한다(아니면 403). MCP 호스트는 Origin 을 보내지 않는다 — 외부 페이지의 `fetch` 가 이 서버를 찌르는 길을 끊는 자리다.
- 모르는 레포 이름이 `/mcp/<레포>` 로 오면 폴더를 다시 훑는다(2초에 한 번) — 방금 세운 레포의 첫 요청이 1분을 기다리지 않게.
- 로그(`serve.log`)는 **몸통을 다 흘려보낸 뒤** 쓴다 — 도구 시간 · 결과 코드가 실린다. 레포 칸은 실제로 쓴 레포이고, 주소와 다르면 `실제←주소` 다(작업 레포의 `.mcp.json` 과 `.claude/cdp.json` 이 갈렸다는 뜻 · 콘솔 현황이 경고한다). save 를 불렀는데 saver 가 돌지 않았으면(인자 형식에서 SDK 가 거절) `E_SCHEMA` 로 적는다. 본문 · 검색어는 적지 않는다(`search` 는 건수만).

---

## 5. 인증

**`auth.json` 은 토큰 대장이 아니라 명부다.** 사람이 먼저 있고 토큰이 거기 달린다 — 권한(`repos` · `role` · `curate`)은 사람에게 붙고 토큰은 신원만 증명한다.

```json
{
  "version": "1.2",
  "users": [
    { "name": "kjsa", "label": "…", "active": true, "repos": ["*"], "role": "admin" },
    { "name": "park", "label": "…", "active": true, "repos": ["dpms_wiki", "gdi"], "role": "writer", "curate": ["dpms_wiki"] },
    { "name": "hong", "label": "…", "active": true, "repos": ["gdi"], "role": "viewer" }
  ],
  "tokens": [ { "sha256": "…", "id": "9f2c…", "user": "kjsa", "issued": "…", "expires": "…", "note": "…", "status": "active" } ]
}
```

**판정** — `core/auth.js` `decide(db, 토큰)` 이 매 요청 탄다(순수 함수 · 시계는 인자).

```
1  Bearer 토큰 → sha256 조회          없다 · 폐기됐다 → 401 E_AUTH
2  expires                           지났다 → 401 E_AUTH (만료일 23:59:59 까지 산다)
3  token.user → users[]              없다 → 401 E_AUTH (고아 토큰)
4  active                            false → 401 E_AUTH
5  권한은 users[] 에서 — grantOf    role · admin · write · allow(레포) · curate(레포) · curateRepos
```

- `curate(레포)` — admin 은 늘 참 · writer 는 `curate` 에 그 레포나 `*` 가 있고 **그 레포를 볼 수 있을 때** · viewer 는 거짓. 판정은 이 함수 하나다(화면의 `lib/roles.js` `can` 은 숨기는 예의이고 막는 것은 이것이다).
- 토큰 — 32바이트 난수 base64url · 파일에는 해시만 · 원문은 발급 응답에 한 번. 만료 기본 admin 30일 · 나머지 90일 · `never` 는 명시해야 한다. 폐기는 줄을 지우지 않고 `status: revoked`.
- 만료 7일 전부터 `brief` 가 한 줄을 더한다 — 「토큰이 n일 뒤 만료된다 — 관리자에게 재발급을 요청한다」.
- 발급은 사람의 절차다 — 콘솔(admin · 재인증) 또는 서버 셸의 `ctx serve token`. 사용자가 토큰을 요청하는 자리는 없다.
- `--auth` 가 없으면 개발용이다 — 루프백에서만 · 모두 viewer 로 통과한다. `--auth` 없이 루프백 밖에 바인드하면 서버가 시작을 거부한다.
- **개인 서버** — 명부를 스스로 만든다(OS 사용자 이름 하나 · admin · `repos: *` · 토큰 무기한). 원문을 `<data>/personal.token`(0600)에 둔다 — 그 PC 의 주인 한 사람이 쓰는 서버라서다. 팀 서버는 원문을 어디에도 두지 않는다.

---

## 6. 레포 고르기

**서버 하나가 레포 N 개를 든다. 고르는 것은 부르는 쪽이다.** 레포마다 서버를 등록하면 명함 12 × N 이 매 요청 실리고 레포를 늘릴 때마다 전원이 `.mcp.json` 을 고친다.

| | 규칙 |
|---|---|
| 기본 레포 | `/mcp/<레포>` 면 그것 · `/mcp` 면 권한 안의 레포가 하나일 때만. 정해지지 않았는데 `repo` 를 생략하면 `E_REPO`(임의로 고르지 않는다) |
| `match` | **레포를 가로지르는 유일한 도구** — `repo` 를 안 주면 볼 수 있는 레포 전부를 대조하고 결과마다 `repo` 를 적는다. 두 레포에 다 있으면 둘 다 낸다(고르지 않는다). 한 레포에서 못 찾은 것을 미등재로 못박지 않는다 |
| 나머지 열하나 | 레포 하나 안에서만 돈다 · 출력에 `repo` 가 붙는다(배열이면 원소마다) |
| `save` | **`repo` 필수** — 쓰기에서 기본값은 사고다 |
| 권한 밖 레포 | 서버 객체에 아예 없다 → `E_REPO` 「그런 레포가 없다」 — **없는 레포와 같은 답**이다(존재를 알리지 않는다) |
| 엇갈린 연결 | `brief` 에 작업 레포 `.claude/cdp.json` 의 `repo` 를 넘기면, 이 연결의 기본 레포와 다를 때 경고 줄이 붙는다 |

절차로 짐작을 막는다 — 좌표를 말로 받았으면 `match`(repo 없이) → 결과의 `repo` 를 그대로 들고 `where` · `section` · `work`.

---

## 7. 캐시

레포마다 `makeRepoCache(root)` 하나 — **요청마다 스탬프를 재서 바뀌었으면 `loadRepo` 로 통째로 바꾼다**(부분 갱신 없음 · 감시 없음).

| 스탬프 조각 | 왜 |
|---|---|
| **HEAD 가 가리키는 커밋 sha** — 프로세스를 띄우지 않고 파일로 읽는다(`.git/HEAD` → ref 파일 → `packed-refs` · worktree 의 `gitdir` · `commondir`) | 커밋 · ff pull 이면 무엇이 바뀌었든 다시 읽는다. 전에는 `.git/HEAD` 의 mtime 이었는데, 그 파일은 가지 이름만 적혀 있어 커밋에도 안 바뀌었다 — 하위 폴더 문서만 바뀐 커밋 뒤 옛 섹션을 냈다(T6 · c57fb1a) |
| `_vocab.md` · `_managed.md` mtime | |
| `docs/` · `work/` 최상위 md 의 수 · 최대 mtime | 커밋 전 파일 변화 |

- 같은 레포를 읽는 요청이 겹치면 진행 중인 `loadRepo` 하나를 같이 받는다(`inflight`).
- 읽기 도구는 캐시의 객체를 읽을 뿐 상태를 바꾸지 않는다 — 동시에 돈다. save 는 레포당 뮤텍스로 줄을 선다(시스템설계서 §5.6).
- 화면은 따로 `Store` 를 든다(감시 끔 · save 뒤 `store.reload`). 둘을 하나로(개편안 §5.1 RepoCache)는 아직이다.

---

## 8. 결과 · 오류 규약

```jsonc
// 성공
{ "content": [{ "type": "text", "text": "<JSON>" }], "structuredContent": { "repo": "…", … } }
// 실패
{ "isError": true, "content": [{ "type": "text", "text": "{\"error\":{\"code\":\"E_CONFLICT\",\"message\":\"…\",\"detail\":{…}}}" }] }
```

| 코드 | 언제 | `detail` |
|---|---|---|
| `E_INPUT` | 형식 · 길이 · 금지 글자 · 규칙 위반 · 응답 512 KB 초과 | `field` · 좌표 · `needSections` · `realSections` · `touchedBy` · `refs` · `lines` 등 |
| `E_COORD` | 좌표 형식이 아니다 | `coord` |
| `E_NOT_FOUND` | 기록 · 서식 · 문서 · 행이 없다 | `id` · `form` · `doc` · `pattern` |
| `E_REPO` | 기본 레포가 없는데 생략 · 그런 레포가 없다(권한 밖 포함) · 레포를 못 연다 | `repos` · `path` · `cause` |
| `E_AUTH` | 토큰 없음 · 무효 · 만료 · 고아 · 사용 중지(HTTP 401) | — |
| `E_FORBIDDEN` | 쓰기 권한이 없다 · **큐레이터 입력 · 도구**(`need: 'curate'` · `fields`) · 볼 수 있는 레포가 없다 | `need` · `fields` · `user` |
| `E_EXISTS` | `work/<id>.md` 가 이미 있다 · 첨부 자리가 차 있다 · rename 대상이 있다 | `id` · `path` · `doc` |
| `E_CONFLICT` | 섹션 `applied` 가 읽은 뒤 바뀌었다 · 같은 패턴이 다른 자리에 있다 · `edits` 의 `old` 가 없다 | 섹션 — `{ coord, expected, current, currentWork, currentCuration, content, truncated }`(`currentCuration` — 그 applied 를 반영해 섹션을 고친 큐레이션 기록 · 문장의 「누가」 도 그 큐레이터) · 등록부 — `{ kind: 'managed', pattern, current }` |
| `E_CHECK` | **이 save 가 만든** 검사 오류(V21) | `findings` · `hint?` |
| `E_GIT` | 더러운 트리 · 커밋 실패 · 시간 초과 · 잠금 | `{ reason: 'dirty' \| 'locked' \| 'timeout' \| 'commit' \| 'add', paths?, message }` |

- 오류 문장이 **다음 할 일**을 말한다 — 예를 들어 writer 가 섹션을 보내면 「work 만 다시 보낸다 · 기록은 대기열에 선다」, `E_CONFLICT` 면 「`detail.content` 위에 다시 만들어 `applied` 에 `current` 를 넣어 보낸다」. 스킬은 그 규칙을 다시 적지 않는다(개편안 A4).
- HTTP 만의 코드 — `E_REAUTH`(콘솔 쓰기에 재인증 필요) · `E_RATE`(429) · `E_SELF` · `E_LAST_ADMIN`(명부 가드). 로그만의 코드 — `E_ORIGIN` · `E_SCHEMA`.

---

## 9. 리소스 · prompts

| 리소스 | 내용 |
|---|---|
| `cdp://{repo}/section/{coord}` (템플릿) | 섹션의 `body` |
| `cdp://{repo}/work/{id}` (템플릿) | 작업 기록 본문 |
| `cdp://<레포>/vocab` · `cdp://<레포>/managed` (정적 · 볼 수 있는 레포마다) | `_vocab.md` · `_managed.md` |

옛 `cdp://{repo}/doc/{name}` · `/index` 는 없다(INDEX 가 레포에 없다).

| prompt | 인자 | 돌려주는 것 |
|---|---|---|
| `load` | `coord` · `repo?` | 서버 번들 kit 의 `cdp-work` 스킬 본문 + `where` + 섹션 `body` — 하나의 user 메시지 |
| `brief` | — | `brief` 의 줄 + 「절차는 스킬 · 이 대화창에서는 읽기만」 |

- `--prompts never` 면 prompts 를 내지 않는다. `auto` 는 지금 `always` 와 같다 — 옛 설계의 「Claude Code 면 숨긴다」(clientInfo 판정)는 코드에 없다.
- 리소스 `section` 과 prompt `load` 는 **미반영 기록을 싣지 않는다** — I7 의 빈자리다(§14). 에이전트는 도구 `section` 을 쓴다.

---

## 10. instructions

호스트가 시스템 프롬프트에 넣는 짧은 규칙이다(`instructions()`). 레포 줄은 서버가 실제 목록으로 채운다(5개까지 · 넘으면 「repos 도구로 본다」).

```
지식 레포의 도구다. 여기 있는 것이 정본이고 모델의 기억이 아니다.
· 다루는 레포 —  (레포마다 한 줄 — 이름 · README 첫 문단)
  기본은 <레포>. 다른 레포면 repo 를 넘긴다. 어느 레포인지 모르면 match 가 찾아준다.
· 시스템의 지금 상태·결정 이유를 물으면 기억으로 답하지 않는다.
· 좌표를 말로 받았으면 match 로 확정 → where 로 상태 → section 으로 그 섹션만.
  이유는 where 가 준 작업 id 로 work 를 연다.
· 문서 전체를 읽지 않는다. section 은 섹션과 그 뒤의 미반영 기록(pendingRecords)을 같이 준다 —
  state 가 pending 이면 둘 다 읽고 그 사실을 답에 적는다.
· 기록은 cdp-save 절차로만 남긴다. 관리 문서는 큐레이터가 반영한다(cdp-curate).
```

---

## 11. kit 과 설치

### 11.1 kit — 서버 번들에서 · 역할별로(V4 · W5)

전에는 **각 지식 레포의 `.claude/`** 가 kit 의 정본이라 upgrade 가 레포마다 도구 층 커밋을 만들고, 더럽거나 origin 이 앞선 레포는 건너뛰어 그 작업 레포들이 옛 스킬을 계속 받았다. v1.0 은 kit 을 **서버 번들**에서 낸다 — 판을 올리면 모든 레포의 kit 이 같이 바뀐다(`core/kit.js`).

| | writer kit | 큐레이터 kit |
|---|---|---|
| 스킬 | `cdp-work` · `cdp-save` · `cdp-push` | 다섯 전부 — + `cdp-curate` · `cdp-registry` |
| CLAUDE 블록 | `CLAUDE-프로젝트레포.md` — 도구 이름 · 스킬 셋 · 「관리 문서는 큐레이터가 반영한다 — 여기서는 기록만」 | `CLAUDE-큐레이터.md` — 큐레이션 자리 · `queue` · `forms` · 승인 게이트(dryRun) · 기준선 블록은 손대지 않는다 |
| 자리 | `.claude/skills/cdp-*` · `.claude/work-repo/CLAUDE.md`(→ 작업 레포 `CLAUDE.md` 의 블록) | 같다 |

- **찾는 순서** — `--kit` → 환경변수 `CDP_KIT` → 번들 옆 `kit/` → 소스 `agent/`(`findKitDir`).
- **해시** — 파일 이름 · 내용의 sha256 앞 6자(`hashOf`). 작업 레포 `CLAUDE.md` 블록 첫 줄 `<!-- cdp:kit <해시> -->` 와 대 보아 낡았는지 안다. 블록은 `<!-- cdp:begin … -->` ~ `<!-- cdp:end -->` 이고 설치기는 **블록만** 갈아 끼운다.

### 11.2 서버가 내는 것

| 경로 | 인증 | 내는 것 |
|---|---|---|
| `GET /install.mjs` | **없음** | 설치기 — 앞에 `globalThis.__CDP_KIT__ = { server }` 한 줄. 레포 · 사람 · kit · 토큰은 없다(`/healthz` 와 같은 규칙) |
| `GET /kit/<레포>` | 쿠키 · Bearer | kit zip. 역할은 그 레포의 큐레이터면 큐레이터 · 아니면 writer(`?role=writer` 면 writer) |
| `GET /kit/<레포>?workrepo=<id>` | 같다 | **설치 꾸러미** zip — `설치.md` · `install.mjs`(설정 한 줄을 박은 설치기) · `kit/`(한 단 내림 — 푸는 것만으로는 아무것도 안 덮인다 · `.mcp.json` · `.claude/cdp.json` · `CLAUDE.md` 포함). 등록의 지식 레포가 주소의 레포와 다르면 409 |
| `…?workrepo=<id>&as=json` | 같다 | 같은 kit 을 JSON(base64)으로 — 설치 한 줄이 토큰으로 받는다 |
| `GET /kit/<레포>?as=json`(workrepo 없이) | 같다 | 큐레이터 폴더용 — kit + `.mcp.json` + `.claude/cdp.json` + `CLAUDE.md`. 대장에 오르지 않는다 |

**토큰은 꾸러미 · 명령 · 설치기 어디에도 없다** — 사람이 관리자에게 받아 붙여넣는 것뿐이다.

### 11.3 설치기 — 길 셋

```
node install.mjs <작업 레포>                                              꾸러미(zip 안)
node cdp-install.mjs --repo <레포> --workrepo <id> <작업 레포> [--dry] [--yes] [--no-save]     설치 한 줄
node cdp-install.mjs --update [<작업 레포>…] [--dry] [--yes] [--commit]                        일괄 갱신
node cdp-install.mjs --curator --repo <레포> [<폴더>] [--dry] [--yes]                          큐레이터 폴더
```

| 길 | 하는 것 |
|---|---|
| 설치 | 토큰 — `CDP_TOKEN` 이 있으면 서버에 확인하고, 없거나 안 통하면 **보이지 않게 묻는다** → 이 PC 에 둘지 묻는다(Windows 사용자 환경변수 · 그 밖 `~/.config/cdp/token`) · kit 을 받아 **바뀔 것을 먼저 보이고 묻는다** · `core/setup.js` 의 `planSetup` · `applySetup` — `.mcp.json` 은 `cdp` 항목만 더한다(다른 서버는 그대로) · `CLAUDE.md` 는 블록만 · `cdp-` 아닌 스킬은 건드리지 않는다 · 끝에 `POST /workrepos/<id>/applied { kit }` 보고 · 이 PC 의 설치 목록(`core/localreg.js`)에 경로를 적는다 |
| `--update` | 이 PC 에 **이 서버로** 설치한 작업 레포 전부를 한 번에 — 계획 → 한 번 묻고 → 적용 → 레포마다 보고. `--commit` 이면 바꾼 경로만 커밋하고, 그 경로에 원래 커밋 안 된 변경이 있던 레포는 커밋하지 않는다 |
| `--curator` | git · 대장 등록 없이 폴더 하나에 큐레이터 kit 을 쓴다 — 그 토큰이 그 레포의 큐레이터가 아니면 멈춘다. 전용 폴더를 전제한다(블록 병합 없이 파일을 쓴다) |

`.mcp.json` 의 항목 —

```json
{ "mcpServers": { "cdp": { "type": "http", "url": "<서버>/mcp/<레포>", "headers": { "Authorization": "Bearer ${CDP_TOKEN}" } } } }
```

`.claude/cdp.json` 은 `{ server, repo }` — PC 와 무관하므로 커밋한다. 팀원은 `git pull` 과 토큰만으로 끝난다.

### 11.4 보고 · 낡음

| 어디 | 어떻게 |
|---|---|
| 작업 레포 대장(`<data>/workrepos.json`) | 등록 `{ id, name, knowledge, owner, note, applied: { at, by, kit } }`. `applied.kit` ≠ 서버의 **writer kit 해시** → 「낡음」 · 보고 없음 → 「미설치」. 보고의 `by` · `at` 은 서버가 채운다(보내면 `E_INPUT`). 보고는 추적용이지 관문이 아니다 |
| 에이전트 | `brief` 의 `sync.kit.hash` ≠ 작업 레포 `CLAUDE.md` 의 `cdp:kit` → 스킬이 답에 적는다 · 고치는 것은 `--update` |
| 콘솔 현황 | 낡은 작업 레포 수를 경고한다 — 담당자가 자기 PC 에서 「일괄 갱신」 한 줄 |

대장 등록 · 삭제는 write(그 레포를 볼 수 있어야 지운다 · 레포가 휴지통으로 간 고아 등록은 admin) · 조회 · 보고는 그 레포를 볼 수 있으면 된다. 담당자 후보는 그 레포를 볼 수 있는 사람이다.

---

## 12. stdio 가 없어진 이유

v0.x 는 전송이 둘이었다 — 모드 A(`ctx mcp` · stdio · PC 의 지식 레포 clone · 쓰기는 스킬 + git 훅)와 모드 B(서버 · HTTP · `save`). v1.0 은 **A 를 걷었다**(V1 · 9ca4cbd · e252f40).

| 까닭 | 근거(개편안 §5.6 · §1.1) |
|---|---|
| 실사용이 없었다 | 최근 save 10건 전부 서버 경로 · 작업 레포 설치 둘 다 모드 B · 모드 A 지식 레포는 서버 레포의 옛 로컬 사본 하나 |
| 정본 층 작성자 하나(I6)를 강제할 수 없다 | git 이라 누구나 `docs/` 를 커밋한다 — 큐레이터 모델이 서지 않는다 |
| 갈래가 사고를 냈다 | 스킬의 모드 A/B 표 · 「도구가 없을 때」 절 — 모드 B 보고에 「push 는 하지 않았습니다」 가 새어 나갔다(하네스 111) |
| 쓰기 판정이 둘이었다 | 훅이 레포 안 옛 번들로 같은 검사를 돌았고 판이 어긋나면 옛 규칙으로 막았다(H9) |
| 비용 | 진입점 7 · 스킬의 모드 A 몫 ≈12% · 설명서의 모드 A · 로컬 앱 서술 41% · 로컬 뷰어 ≈2,170줄(추정 · 개편안) |

**대신하는 것 — 개인 서버**(`ctx serve --personal <레포>`) — 127.0.0.1 · 레포 하나 · 명부(나 하나 · admin)를 스스로 만든다. 같은 코드 · 같은 save · 같은 화면 · 같은 HTTP MCP 다. 시작할 때 MCP 주소(`http://127.0.0.1:<포트>/mcp/<레포>`)와 큐레이터 설치 한 줄을 찍는다.

`ctx mcp` · `ctx setup` 을 부르면 무엇으로 바뀌었는지 한 줄로 답하고 exit 2 다. **서버에 닿지 않는 완전 에어갭**에서는 MCP 자체가 성립하지 않는다 — 그것은 v0.x 에서도 같았다(호스트가 모델에 닿아야 한다 · [`개념정리_MCP`](개념정리_MCP.md)).

---

## 13. 옛 설계서에서 살아남은 것 · 바뀐 것

| 옛 설계서 v1.1 | v2.0 |
|---|---|
| §2.9 서버 하나 · 레포 N · 고르는 쪽 · `match` 만 가로지른다 · save 는 `repo` 필수 | **그대로**(§6) |
| §2.2 도구 읽기 12 + save | 12 — `derive` · `apply` · `sync` · `version` → `queue` · `forms` 와 `brief` 흡수(§2) |
| §2.2 `where.state` `derive-pending` | `pending`(미반영) · `missing` · `ok` |
| §2.2 `section` 은 섹션만 | 섹션 + 미반영 기록 본문 + 정본 한 단계 + 기준선 블록 따로 + 서식 id(§2.1) |
| §2.3 결과 형식 · 오류 코드 | **그대로** + `E_FORBIDDEN { need: 'curate' }` · `E_CHECK` 는 이 save 가 만든 것만(§8) |
| §2.4 리소스 `doc` · `index` | 없다(§9) |
| §2.5 prompts — `load` 가 `cdp-load` 를 읽는다 | `cdp-work` 를 서버 번들 kit 에서 읽는다 · `auto` 판정 없음 |
| §2.6 캐시 스탬프 — `.git/HEAD` mtime | HEAD sha(§7) |
| §3 모드 A 전부 · §5.4 반입 | 없다(§12) |
| §4.2 `POST /repos`(write) · `/packages` | 없다 — 레포 세우기는 콘솔 `POST /admin/repos`(admin · 재인증) · 패키지는 서식집 |
| §4.4 명부 · 토큰 · 5단계 · 권한 밖은 「없음」 | **그대로** + 사람마다 `curate`(§5) |
| §4.5 save | [시스템설계서 §5](CDP_시스템설계서_v2.0.md#5-save-v10) — 역할 분리 · V21 · `--no-verify` · INDEX 없음 · `managed` 정리는 admin → 큐레이터 |
| §4.8 「파생 정리 기록」(D8) | 큐레이션 기록(`curates`) |
| §4.7 `ctx setup --server` | 없다 — 설치 한 줄(§11.3) |
| §6.7 대장 · 보고 · 꾸러미 한 단 내림 · 토큰은 꾸러미에 없다 | **그대로**(§11) |
| §6.7.4 kit 해시는 지식 레포 `.claude/skills` 로 계산 · kit-refresh | 서버 번들 kit · 역할별 · kit-refresh 없음 |
| §8 보안 — 루프백 + 프록시 · Origin · `--auth` 없이 밖에 바인드 거부 · `/healthz` 집계만 · 요청 2 MB | **그대로** |
| §9 `cdp.exe` 가 `ctx mcp` 를 돈다 | 없다 |

---

## 14. 코드와 개편안이 어긋난 곳

| 개편안 | 적은 것 | 코드 |
|---|---|---|
| §5.3 | `save` 는 viewer 에게 안 보인다 | 모든 연결에 등록된다 — viewer 는 `E_FORBIDDEN` → **고침** (8d92edf) |
| §6.3 · A6 | 작업 레포 CLAUDE 블록은 writer 것 · 큐레이터 블록은 큐레이터 폴더 | `/kit/<레포>?workrepo=` 도 **부른 사람의 역할**로 kit 을 고른다 — admin · 큐레이터가 작업 레포를 깔면 큐레이터 kit(스킬 다섯 · 큐레이터 블록)이 그 작업 레포에 커밋되고, 대장의 「낡음」 은 writer kit 해시와 대 보므로 그 행이 늘 「낡음」 으로 보일 수 있다(코드로 읽은 것 — 실측 안 함) → **고침** — 작업 레포는 늘 writer kit(8d92edf) |
| I7 | 섹션을 내보내는 모든 자리가 미반영을 같이 | 리소스 `cdp://{repo}/section/{coord}` · prompt `load` 는 섹션 글만 → **고침** — `sectionMarkdown`(8d92edf) |
| §5.3 명함 | 명함은 규칙과 맞는다 | `CARD.saveCurator` 가 v1.0 에서 걷은 「등록부 행과 어긋나는 문구 → `E_INPUT` 에 `파일:행`」 을 아직 설명한다 · `guardSize` 의 문장이 없는 리소스 `cdp://<repo>/doc` 로 안내한다 → **고침** (8d92edf) |
| 옛 설계 §2.5 | `--prompts auto` 는 Claude Code 에서 숨긴다 | `auto` = `always` |
