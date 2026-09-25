# 동시 기록 TODO — 여럿이 같은 지식 레포에 쓸 때

> 원본: [`../design/CDP_동시기록_검토_v0.1.md`](../design/CDP_동시기록_검토_v0.1.md)(실측 §3 · 문제 P1~P16 · 개선안 §5 · 결정 D1~D14). 시작 v0.11.0 → 목표 **v0.12.0**.
> **상태는 실측한 것만 적는다 — 예정을 완료로 적지 않는다.** 시작 상태는 아래 블록. 운영자 지시(2026-09-25)대로 결정은 전부 권장안이고 묻지 않는다 — 정할 것이 생기면 「나온 것」 에 무엇을 왜 그렇게 정했는지 적는다.
> 절 번호는 검토 §9 의 단계와 맞춘다. 단계마다 **바뀌는 파일** · **확인 방법** · **끝났다고 보는 기준(명령 하나)**. 커밋까지만 — push · 태그 · 실서버 `upgrade.sh` 는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 문서 v0.1 · 실측 M0~M12 · 문제 16 · 결정 D1~D14 | **완료** (2026-09-25 · 커밋 48fc419) |
| ① core — 분류 · 미러 큐 · dirty · E_CONFLICT · `—` 규칙 | **완료** — `core/lock.js` · `core/mirror.js` 신설 · `test/git` 3 · `test/save` 10 초록 (커밋 a778d13) |
| ② 서버 — `/repos` · `/admin/repos/*` · overview · doctor · 로그 · MCP | **완료** — 하네스 93 · 94 · 95 · 97 ✓ |
| ③ 화면 — 콘솔 · 레포 상태바 · 레포 관리 현황 | **완료** — 브라우저 실측(아래 「나온 것」) · `npm run build` ✓ |
| ④ 테스트 · 하네스 91~97 | **완료** — 테스트 **100 / 100** · 하네스 **✓ 82 ✗ 0 – 16** |
| ⑤ 문서 · CHANGELOG · 0.12.0 · 실측 상태 | **완료** — 아래 「끝난 상태」 |

### 끝난 상태 (2026-09-25 실측 · v0.12.0)

```
npm test                 100 / 100  (17파일 · git 3 · save 10 신설 · 한 번 99/100 이 났다 — 재현 안 됨 · 아래 「나온 것」)
npm run verify           ✓ 82  ✗ 0  – 16   (§10 69줄 + 제품화 70~77 + 제품관리서비스 78~90 + 동시 기록 91~97)
npm run build            OK
npm run build:ctx        OK  1,729,125 bytes (0.12.0 찍힘 · 0.11.0 은 1,667 KB 였다 — 미러 · 큐 · 분류가 들어갔다)
npm run check:packages   ok  dpms · project_1 · project_2
git status               깨끗 — 커밋 셋 · push 안 함 · 태그 안 함
```

### 시작 상태 (2026-09-25 실측 · v0.11.0 · 개발용 서버 7382/7383 · `--mirror` · bare origin)

```
다른 섹션 5건 동시 save     5/5 커밋 · 트리 깨끗 · INDEX = work · origin = local · 8,001ms (건별 808 → 7,999)
다른 섹션 10건 동시         10/10 · 17,848ms (≈1.8초/건 직렬)
같은 섹션 둘 동시           1 커밋 + E_CONFLICT { coord, expected, current }   ← 누가 · 언제 · 본문 없음
같은 좌표 새 섹션 둘        1 커밋 + E_CONFLICT { expected: null, current }  · 헤딩 1 · 어휘 줄 1
같은 id 둘                  E_EXISTS
— (문서 전체) 규칙 save     E_REPO "Invalid regular expression: /^#{1,0}\s/"  · applied 늘 null
미러 non-ff                 응답 mirror "queued" · 로그 "미러 실패 alpha: To C:\…"(첫 줄뿐) · /repos lag · doctor fail "push — To C:\…"
동시 push 둘                cannot lock ref … (failed to update ref)   ← fire-and-forget · 직렬화 없음
서버 트리 ↔ origin          fetch 없음 · pullFfOnly 는 로컬형 문장 · 맞추기는 셸 · 뮤텍스 밖
더러운 트리                 사람의 미커밋 줄이 hong 의 save 커밋에 들어갔다 · stray.txt 잔존 · doctor ok
캐시 둘                     save 직후 section 새 applied · Store works = 파일 수 · .git/HEAD mtime 불변(죽은 조각)
서버 모드 404               /api/<레포>/workrepos 404 · /diag 404 → 레포 관리 > 현황 "읽는 중…" 고정
serve.log                   save 줄 key "-" · 결과 코드 없음 · ms 6(도구 시간 아님)
테스트 · 하네스             87/87 (save·git 0건) · ✓ 75 ✗ 0 – 16 (전부 순차 · --mirror 없음)
```

---

## 0. 전제 — 닫혔다

검토 §7 · §8. 코드가 따라야 하는 것만 다시 적는다.

- [x] 판정은 `core/` 한 곳 — 분류 · 큐 · 맞추기 · 되돌리기를 서버 · CLI(doctor) · 화면이 같은 함수로 (D1 · D2 · 불변조건 1)
- [x] 미러 push 는 `save` 뒤와 사람의 「다시 보내기」 뿐 — 주기 · 시작 시 push 없음 (D13 · 불변조건 11)
- [x] ff 는 사람의 클릭(콘솔) · merge 없음 · `save` 마다 fetch 없음 (D4 · 불변조건 10)
- [x] 더러운 트리는 거절 · 되돌리기는 콘솔(재인증 · 감사) (D5)
- [x] 섹션 점유 UI 없음 (D13)
- [x] `cdp-managed` 모드 B = 파생 정리 기록 규약 · 코드 변경 0 (D8)
- [x] 판 0.12.0 · 커밋 셋 (D14)

---

## ① core — 분류 · 미러 큐 · dirty · `E_CONFLICT` · `—` 규칙

**바뀌는 파일** — `core/git.js`(`classifyPushError` 순수 함수 · `push` 가 `reason` 을 분류로 · `ffToUpstream`(fetch 없이 `merge --ff-only @{u}` — `pull --ff-only` 의 뒷단) · `restoreTree` · diverged 문장에 서버용 줄) · **`core/mirror.js`(새)**(레포당 큐 · `again` 합침 · `last(root)` · non-ff 면 `fetch` 로 `ahead/behind`) · `core/save.js`(0.5 dirty 검사 → `E_GIT dirty` · `E_CONFLICT` detail `currentWork` · `content` · `level 0` 치환 · 헤딩 검사 생략 · 미러 큐 · 1.5초 상한 · `mirrorReason` · `mirrorLast` · `warnings`) · `core/managed.js`(`—` 섹션의 `applied` = 문서 머리 주석) · `core/frontmatter.js`(`appliedTop`) · `core/reponew.js`(`listRepos` 에 `dirty` · `behind` — `git.status` 한 번으로) · `core/sync.js`(서버용 diverged 문장 인자).

- [x] `classifyPushError(text)` → `{ reason, line }` — `non-ff`(`[rejected] … (fetch first|non-fast-forward)`) · `auth`(`Authentication failed` · `could not read Username` · `403` · `Permission denied (publickey)` · `invalid credentials`) · `net`(`Could not resolve host` · `Connection refused` · `timed out` · `unable to access` 이면서 auth 아님) · `protected`(`pre-receive hook declined` · `protected branch`) · `locked`(`cannot lock ref` · `failed to update ref` · `index.lock`) · `no-upstream` · `unknown`. `line` 은 `!` 줄 또는 `error:`/`fatal:` 줄 — 첫 줄 `To …` 가 아니다
- [x] `core/mirror.js` — `enqueuePush(root, { log })` → 결과 `{ ok, state: 'ok'|'lag'|'diverged'|'off', reason, message, at, ahead, behind }` · 도는 중이면 `again = true` 하고 같은 결과를 기다린다 · `last(root)` · `stateOf(st, last)` 순수 함수(`git.status` + 마지막 결과 → `off · ok · lag · diverged · behind`)
- [x] `save` — 뮤텍스 안 첫 단계에 `git.status` 한 번: `dirty > 0` → `E_GIT { reason: 'dirty', paths }` · 문장 *"서버 트리에 커밋 안 된 변경 N — save 를 거절했다. 콘솔 > 지식 레포 > 트리 되돌리기, 또는 셸에서 git -C <root> checkout -- . && git clean -fd"* · 뮤텍스 밖에서 `enqueuePush` → `Promise.race([p, 1500ms])` → `mirror` · `mirrorReason` · `mirrorLast` · `warnings`
- [x] `E_CONFLICT` — `currentWork`(`r0.byId.get(current)` 의 id · title · author · date) · `content`(`sliceSection(r0, coord).content` · 8,000자 · `truncated`) · 문장에 누가 · 언제
- [x] `—` 규칙 — `parseDoc` 이 첫 3줄의 applied 주석을 `appliedTop` 으로 · `find()` 의 `—` 섹션에 `applied: doc.appliedTop` · `replaceSection` `level 0` = 파일 전체 치환(`<!-- applied: id -->` + 빈 줄 + body) · 헤딩 검사는 `level > 0` 만
- [x] `listRepos` — `git.status` 로 `head · upstream · ahead · behind · dirty · branch` (프로세스 4 → 2)

**확인 방법** — `npm test`(④ 의 `test/git` · `test/save`) · 스크래치 판에서 `node -e` 로 `save` 를 임시 레포에 직접.
**끝났다고 보는 기준** — `node --test test/save.test.mjs test/git.test.mjs` 초록 · `grep -n "#{' + level" core/save.js` 0건.

## ② 서버 — 상태 한 값 · 단추 셋 · 최근 기록 · doctor

**바뀌는 파일** — `viewer/bin/ctx-mcp-serve.mjs`(`GET /repos` 행에 `mirror`(다섯 값) · `mirrorReason` · `ahead` · `behind` · `dirty` · `GET /admin/repos` 같은 것 + `mirrorLast` · **`POST /admin/repos/<name>/sync`**(재인증 · `withLock` · `runSync` · `store.reload` · 감사 `admin repo sync · <who> · <name> · pulled=N|reason`) · **`/push`**(큐로 한 번 더 · 감사) · **`/restore`**(`restoreTree` · 버린 경로 감사) · `/admin/overview` 경고(갈림 bad · 더러움 bad · 인증 실패 warn · origin 앞섬 warn) + `saves: { recent[10], rejected24h }` · `/healthz` `mirror.diverged` · `peek` 이 `work.id` 를 key 로 · saver 가 결과 코드 · 도구 시간을 로그 줄에 · MCP `sync` 에 `mirrorReason` · `dirty` · `brief` 에 서버형 한 줄) · `viewer/bin/ctx-serve-doctor.mjs`(레포 줄 셋 — `트리`(dirty fail) · `origin`(ls-remote sha ≠ `origin/<branch>` → warn) · `push` note 를 분류 사유로) · `viewer/bin/ctx-mcp.mjs`(`mirrorOf` 를 `core/mirror.stateOf` 로 · `sync` · `brief` 서버형 줄).

- [x] `/repos` · `/admin/repos` · `/healthz` · `/admin/overview` 모양
- [x] 단추 셋의 API — 재인증(`cdp_su`) · `withLock(root)` · `auth.log`
- [x] `serve.log` `save` 줄 — key = `work.id` · 결과 `200|E_CONFLICT|E_CHECK|E_GIT|…` · ms = 도구 시간(CTX 저장소에 결과를 두고 로그 줄이 읽는다)
- [x] `/admin/overview.saves` — `serve.log` 꼬리(최근 2,000줄)에서 `save` 줄만 · `recent`(시각 · 사람 · 레포 · id · 결과 · 미러) · `rejected24h { E_CONFLICT, E_CHECK, E_GIT }` — 본문 · 검색어는 그대로 없다
- [x] doctor 줄 셋 · `runDoctorCached` 그대로(60초)
- [x] MCP `sync`(서버형) `{ head, mirror, mirrorReason, ahead, behind, dirty, kit }` · `brief` 에 `[CDP] 미러: …` 이상일 때만

**확인 방법** — `curl -H 'authorization: Bearer …' /repos` · 콘솔 세션으로 `/admin/repos` · `/admin/overview` · 하네스 93~97.
**끝났다고 보는 기준** — `npm run verify` 의 93(non-ff → 사유) · 94(맞추기) · 95(dirty → 되돌리기) · 97(최근 기록) ✓.

## ③ 화면 — 사실만 · 단추는 재인증 뒤 · 0건이면 조용

**바뀌는 파일** — `viewer/src/console/Repos.jsx`(칩 `최신 · 밀림 N · <사유> · 갈림 · origin 앞섬 · 트리 더러움 · 원격 없음` · 행 단추 「다시 보내기」 「origin 과 맞추기」 「트리 되돌리기」 — 해당 상태일 때만 · `withSudo` · 결과 토스트 · Note 문장) · `viewer/src/console/Overview.jsx`(경고 넷 · 카드 「최근 기록」 · 「거부 24h」) · `viewer/src/lib/api.js`(`admin.repoSync · repoPush · repoRestore`) · `viewer/src/components/StatusBar.jsx`(서버형: `/repos` 자기 행 한 줄 — 이상일 때만 · 로컬형 pull/push 단추는 안 낸다) · `viewer/src/components/admin/Overview.jsx`(작업 레포 카드 서버판 = `api.registry()` 이 레포 것 · `diag` 줄은 서버형에서 안 그린다) · `viewer/src/components/admin/RepoServer.jsx`(칩 다섯 값 · 사유 한 줄 · 읽기만) · `viewer/src/styles/console.css` · `admin.css`(CRLF — 앵커 줄바꿈 주의 · 칩 색은 `warn`/`bad` 토큰만).

- [x] 콘솔 지식 레포 — 칩 · 단추 · 토스트
- [x] 콘솔 현황 — 경고 · 최근 기록 · 거부 집계
- [x] 레포 상태바 — 서버형 한 줄 · 로컬형 단추 없음
- [x] 레포 관리 > 현황 — 작업 레포 카드 서버판 · "읽는 중…" 고정 없음
- [x] `npm run build`

**확인 방법** — 개발용 서버(7382 · `--mirror` · bare origin)에서 kjsa 로 `/console/repos` — non-ff 를 만들고(clone 에서 push) `save` 한 번 → 칩 `갈림` · 단추 「origin 과 맞추기」 → 거절 문장 · 사람이 rebase → 「다시 보내기」 → `최신`. 트리를 더럽히고 → `save` 거절 → 「트리 되돌리기」 → `save` 됨. hong 으로 `/r/alpha/` 상태바 한 줄. 레포 관리 > 현황 카드. 그림은 `docs/dev/동시기록_검토_그림/`(300KB 아래 · 토큰 원문 없이).
**끝났다고 보는 기준** — 위 여정을 「나온 것」 에 글로 적고 `npm run build` OK.

## ④ 테스트 · 하네스

**바뀌는 파일** — **`test/git.test.mjs`(새)** · **`test/save.test.mjs`(새)** · `ops/verify/run.mjs`(91~97 · `--mirror` 서버 `PORT + 3` · bare origin · clone).

- [x] `test/git.test.mjs` — `classifyPushError` 문장 7종(실측 문장 그대로 — non-ff · locked · net · auth · protected · unknown · 빈 문자열) · `status` 임시 레포(dirty · ahead · behind · upstream 없음) · `ffToUpstream`(behind 1 → ok · diverged → 거절 · dirty → 거절) · `restoreTree`(수정 · 미추적 → 깨끗 · 버린 경로 목록)
- [x] `test/save.test.mjs` — `withLock` 순서(거부 뒤 계속) · 임시 지식 레포(작은 어휘 · 등록부 · 문서 하나 · git init) · **동시 5건 다른 섹션** → 커밋 5 · 트리 깨끗 · applied · **같은 섹션 둘** → 하나 `E_CONFLICT` 이고 `detail.currentWork.author` · `content` 가 있다 · **새 섹션 둘** → 헤딩 1 · **dirty 거절** → `E_GIT dirty` · 트리 그대로 · **`Snap` 복원**(검사 실패 → 파일 원상 · 커밋 0) · **`—` 규칙**(save → 문서 머리 주석 · 다음 `section` 의 `applied` = id · 둘째 save 의 `current`) · **미러 큐**(bare origin · 동시 save 3 → push 겹침 0 · origin = local · non-ff → `reason: non-ff` · `state: diverged` · `ahead/behind`) · 응답 `mirror` 값
- [x] 하네스 — 91 동시 save 5(Promise.all · 커밋 5 · 트리 깨끗 · applied 5) · 92 같은 섹션 동시(E_CONFLICT detail 에 `currentWork` · `content`) · 93 `--mirror` 서버: non-ff → 응답 `mirror` · `/repos` `mirrorReason: non-ff` · `/admin/overview` 경고 「갈림」 · doctor `origin` 줄 · 94 origin 만 앞선 상태 → `POST /admin/repos/alpha/sync` → `pulled 1` · 그 뒤 save · push ok · 95 dirty → save `E_GIT dirty` → `POST …/restore` → 깨끗 → save ok · 96 `—` 규칙 save · 97 `/admin/overview.saves.recent` 에 방금 id · `rejected24h.E_CONFLICT ≥ 1`

**확인 방법** — `npm test` · `npm run verify`(포트가 막히면 `-- --port 7390`).
**끝났다고 보는 기준** — `npm test` 실패 0(87 + 신설) · `npm run verify` ✗ 0 · 91~97 ✓.

## ⑤ 문서 · CHANGELOG · 판 · 실측 상태

**바뀌는 파일** — `agent/skills/cdp-save/SKILL.md`(모드 표 「충돌」 행 · ⑤B `E_CONFLICT` 행 · 「무엇이 돌아오나」 `mirror` 값) · `cdp-managed/SKILL.md`(④ 모드 B — 파생 정리 기록 규약) · `cdp-edit` · `cdp-import/SKILL.md`(모드 표 「충돌」 행) · `agent/manual/user.md` · `admin.md`(같은 자리) · `manual/사용자_설명서.md`(6.5 · 7.3 · 9.2 · 10.2) · `manual/관리자_설명서.md`(6장 지식 레포 단추 셋 · 7.6 · 10.1 · 11 「안 하는 것」 갈라 적기) · `manual/개발자_설명서.md`(2.1 `mirror.js` · 5.1 테스트 표 · 5.2 · 7.4 · 8.4) · `docs/design/CDP_MCP_설계서_v1.0.md`(§2.6 · §4.2 · §4.5 · §4.8 · §4.9 · §10 정정 상자) · `CDP_제품관리서비스_검토_v0.1.md`(D13 닫음) · `CDP_제품화_검토_v1.0.md`(R15 정정) · `CDP_시스템설계서_v1.0.md`(제3부 11 서버형 주석) · `docs/README.md` · `README.md` · `CHANGELOG.md`(v0.12.0 — 무엇이 바뀌었나만) · `package.json` 0.12.0 · 이 문서의 표 · 「나온 것」.

- [x] 스킬 넷 · 매뉴얼 둘(agent) · 설명서 셋
- [x] 설계서 정정 상자 여섯 자리 · D13 · R15 · 불변조건 11 주석
- [x] README 둘 · CHANGELOG · 0.12.0
- [x] `npm test` · `npm run verify` · `npm run build` · `npm run build:ctx`(번들 크기 기록) · `npm run check:packages`
- [x] 이 표의 상태를 실측으로 · 「나온 것」

**끝났다고 보는 기준** — 아래 여섯 명령이 전부 통과하고 `git status` 가 깨끗(커밋 셋 이상 · push 안 함 · 태그 안 함).

```
npm test                      전부 통과
npm run verify                ✗ 0 (91~97 포함)
npm run build                 OK
npm run build:ctx             OK (번들 크기)
npm run check:packages        ok
git status                    깨끗
```

---

## 나온 것

(끝난 단계만 · 실측 · 잡은 버그 · 정한 것과 왜)

| 단계 | 무엇 |
|---|---|
| 검토 | 실측 M0~M12 — 검토 §3. 정한 것 — D1~D14(§8). 잡은 것 — `—` 규칙의 정규식 예외 · 더러운 트리 커밋 · 동시 push `cannot lock ref` · `serve.log` save key `-` |
| ① core | **정한 것** — `ffToUpstream`(fetch 없는 ff)은 만들지 않았다: 자동 ff 가 설 자리가 없다(fetch 는 push 실패 때뿐이고 그때는 `ahead ≥ 1` 이라 ff 가 안 된다). ff 는 「origin 과 맞추기」 의 `runSync`(fetch 포함) 하나. `enqueuePush` 는 **요청 뒤에 시작한 첫 push** 로 답한다 — 처음엔 줄 끝(drain)까지 기다리게 했더니 동시 5건이 전부 `queued` 였다. 실패 사유는 fetch **전에** 기억한다 — fetch 도는 동안 "갈라졌는데 사유 없음" 이 나왔다(하네스 93 이 잡았다). **잡은 버그** — `git status --porcelain` v1 의 첫 줄 앞 공백이 `run` 의 trim 에 잘려 `docs/t.md` 가 `ocs/t.md` 로(→ v2) · `core.quotepath` 기본값이 한글 경로를 `\355\205\214…` 로(→ `-c core.quotepath=false` 를 모든 git 호출에) · 미추적 폴더가 `work/` 로 접혀 중단된 save 의 파일이 안 보였다(→ `-uall`) · autocrlf 켜진 PC 에서 checkout 이 CRLF 로 돌아와 테스트가 깨졌다(→ 시험 레포에 `.gitattributes`) · Windows 의 `EBUSY`(→ `fs.rm` 재시도). 테스트 13 — `withLock` · 동시 5 · 같은 섹션(`currentWork.author` · `content` 로 다시 만들어 성공) · 새 섹션 둘 · dirty → restore · Snap · `—` · 미러 큐 3 · non-ff → diverged · behind → ff |
| ② 서버 | 복구 셋의 응답에서 `reason`(diverged · dirty)이 미러 요약의 `reason`(push 사유)과 부딪혀 요약을 `mirror` 아래로 내렸다(하네스 93 이 잡았다). 시작 때 더러운 레포 경고는 **듣기 시작한 뒤**로 옮겼다 — 앞에 두니 하네스 80(빈 명부 `bootstrap.code` 2.5초)이 늦었다. `/admin/repos` 첫 호출 9.7초(레포마다 첫 스캔) · 콘솔 push 2.1 · 11.4 · 16.8초(파일 원격 · 이 PC) — 범위 밖 관찰로 남긴다 |
| ③ 화면 (브라우저 실측 · 개발용 서버 7382 · `--mirror` · 하네스가 남긴 `mu` + bare origin · kjsa admin · 그림은 남기지 않았다 — 이 PC 에 Playwright 가 없고 내장 브라우저는 파일을 못 낸다) | **콘솔 › 지식 레포** — 재시작 직후 칩 `밀림 1`(사유 없음 · title "사유는 진단(doctor)에서") + 「다시 보내기」 → 재인증 → 칩 `최신` · `auth.log` `admin repo push · kjsa · mu · ok`. 트리를 더럽히고 clone 이 origin 에 push → 칩 `최신` + `트리 더러움 1`(title 에 경로) · **진단 줄 셋** `트리 — 커밋 안 된 변경 1건`(fail) · `origin — origin 이 앞서 있다`(warn) · `push — non-ff` · 단추 「origin 과 맞추기」「트리 되돌리기」 → 되돌리기 확인 모달(버릴 경로 · "누구의 편집도 아니다") → 토스트 `트리를 되돌렸다 · 버린 것 1` → 맞추기 → `origin 에서 1건 받았다`. 갈림 — 칩 `갈림 1 · non-ff`(bad · title 문장) · 진단 `origin — 갈라졌다`(fail) → 맞추기 → 409 토스트 *"서버 트리와 origin 이 갈라졌다 — 서버 1건 · origin 1건. 기계는 합치지 않는다. 셸에서: sudo -u cdp -H git -C … pull --rebase (그 뒤 「다시 보내기」)"* · 트리 안 만짐 → 셸 rebase → 「다시 보내기」 → `최신` · origin = local. **콘솔 › 현황** — 경고 `origin 과 갈라진 레포 1 — mu(서버 1 · origin 1) …`(bad) · `진단 fail 2` · 통계 `미러 밀림 · 갈림 1` · 「최근 기록」 `save 24h 13건 · 거절 2 — E_CONFLICT 1 · E_GIT 1` + 10줄(시각 · 사람 · 레포 · id · 기록됨/E_GIT/E_CONFLICT · ms). **레포 화면 `/r/mu/` 상태바** — 갈라졌을 때 `⚠ origin 과 갈림 1/1`(title 문장) 한 조각 · 정상(`mirror ok · dirty 0`)이면 `문서 30 · 좌표 53` 뿐(경고 0 · 단추 0) · 로컬형 단추 없음 · 감시 · 다시 스캔 없음. **레포 관리 › 현황** — 미러 카드 `상태 origin 과 갈림 · 보낼 것 1 건` + `사유` 줄 · 작업 레포 카드 `등록된 작업 레포가 없습니다`("읽는 중…" 고정이 없어졌다) · 마지막 스캔 줄 없음. **시작 로그** `경고: 레포 mu 트리에 커밋 안 된 변경 1건 (docs/테이블정의서.md) — save 가 거절된다 …`. **잡은 것** — 진단 줄이 동작 뒤 60초 낡아 보였다 → 동작 뒤 fresh 한 번 · 상태바의 로컬형 `감시 꺼짐 · 다시 스캔` 이 서버형에도 그려지던 것(불변조건 7) → 안 그린다 |
| ④ 테스트 · 하네스 | 91~97 은 `--mirror` 서버를 `PORT + 9`(7386)에 — `PORT + 3` 은 개발용 서버(7380)와 겹쳤다. 하네스 56 이 서버 트리(`.claude/skills/…`)를 더럽힌 채 두어 76 이 `E_GIT dirty` 로 죽었다 → 56 이 커밋한다(실제로 kit 은 커밋으로 바뀐다). `untilMirror` 는 상태 문자열이 아니라 **조건 함수**로 기다린다(93 은 `mirror === 'diverged' && mirrorReason === 'non-ff' && behind ≥ 1`). `npm test` 가 한 번 99/100 을 냈다(어느 것인지 출력이 안 남았다) — 두 번째 · 세 번째 전부 100/100. git 프로세스 시간에 기대는 곳(`mirrorWaitMs` · `EBUSY`)은 넉넉히 뒀다 |
| ⑤ 문서 | 설계서 정정 상자 여섯(MCP §2.6 · §4.2 · §4.5 · §4.8 · §4.9 · §10) · D13 닫음 · R15 정정 · 시스템설계서 제3부 주석 · 스킬 넷 · 매뉴얼 둘 · 설명서 셋 · README 둘 · CHANGELOG v0.12.0 · `package.json` 0.12.0 |

**남은 것 — 사람이 한다.** `git push` · 태그 `v0.12.0`(`release.yml` 이 태그 = `package.json` 을 확인한다) · 실서버 `10.10.20.188` 에 `upgrade.sh`(관리자 설명서 9.1 — 재시작 뒤 콘솔 > 지식 레포 칩이 다섯 값으로 보인다 · 첫 관리자 승격은 v0.10.0 때 끝났다) · 그 뒤 콘솔 > 서버 > 「다시 검사」 로 실레포의 `origin` · `push` 줄을 한 번 본다(PAT 상태가 사유로 보인다).

---

## 다음 판

| # | 무엇 | 왜 지금이 아닌가 |
|---|---|---|
| B7 | `save` 1.8초/건 — `loadRepo` 세 번을 한 번으로 | 막히지 않는다 · 판정 코드 손이 크다 |
| B8 | 온보딩 — 토큰 → 꾸러미 → 첫 `save` 클릭 수 | 이번 주제(동시 기록)가 아니다 |
| B10 | `.git/HEAD` mtime 스탬프 조각 | 잡아 주는 것이 따로 있다 |
| — | 주기 fetch(origin 앞섬을 몇 분 안에) | doctor 의 ls-remote 비교로 족한지 실운영을 본 뒤 |
| — | MCP 도구 시간 계측(`serve.log` ms) | `save` 줄만 이번에 |

---

## 하지 않는 것

검토 §6 — 섹션 점유 UI · 자동 merge · 자동 push 확대(주기 · 시작 시) · `save` 마다 fetch · 화면 편집 · 혼용 금지 · `work` 없는 `save` · `catchup` 도구 · 미러 상태 파일 · `save` 성능.
