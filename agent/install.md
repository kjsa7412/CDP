# CDP 설치 시나리오

**설치는 네 자리에서 벌어진다.** 한 자리만 보면 반드시 빠뜨린다.

```
① 개발 PC      배포본을 만든다              도구 개발자 · 버전마다
② 반입         폐쇄망이면 파일을 옮긴다      관리자 · 버전마다
③ 지식 레포    C:\cdp 를 세운다              관리자 · 프로젝트당 1회
④ 작업 레포    C:\gdi 에 세팅을 넣는다       관리자 · 레포당 1회
⑤ 팀원 PC     clone 하고 두 가지를 더 한다   팀원 · 사람마다
```

자세한 판단(어휘 · 등록부 · 관리 문서)은 `MANUAL-관리자.md` 2장이다.
이 문서는 **순서와 빠지는 것**만 다룬다.

---

## 경로 — 어디든 된다. 지식 레포가 **하나**인 것만 중요하다

| | 무엇 |
|---|---|
| 지식 레포 | `_vocab.md` 가 있는 곳. **하나** |
| 작업 레포 | 코드가 있는 곳. **여럿이어도 된다** |
| 실행기 | `<지식 레포>/tools/cdp.exe` |

사람마다 다른 자리에 두어도 된다. 지식 레포 경로는 **커밋되지 않는**
포인터 파일에 들어가기 때문이다.

```
<작업 레포>/CLAUDE.md            커밋. 규약만. 경로 없음
<작업 레포>/.claude/cdp.json     **커밋 안 함.** { "knowledgeRepo": "…" }
```

이 문서는 `C:\cdp`(지식) · `C:\gdi`(작업)를 예로 쓴다. **예일 뿐이다.**

---

## ① 개발 PC — 배포본 만들기

```
ops\release.cmd 0.2.5
```

화면 → `ctx` 번들 → exe → 묶기까지 한 번에 돈다. 결과는
`ops/release/v0.2.5/` 하나다.

```
cdp.exe                 앱 + ctx 한 파일 (~68MB). **패키지가 여럿이어도 하나** — 복사한 레포의 tools/ 에 넣는다
knowledge-repo-<이름>/   **복사하면 그게 지식 레포다.** 패키지마다 하나씩 (exe 는 없다)
설치.md            이 문서
README.md          요약 (번들 시각 · 패키지 표)
```

**설계서는 안 들어간다.** CDP 를 고칠 사람의 것이고 서비스와 무관하다 —
소스 레포의 `docs/design/` 에 있다.

**끝나면 태그를 단다.**

```
git tag -a v0.2.5 -m "..."
```

태그와 `package-lock.json` 둘 다 있어야 그 버전을 다시 만들 수 있다.
하나라도 없으면 그 배포본은 **지우는 순간 끝이다** — `release.cmd` 가
버전 폴더가 쌓였을 때 태그 없는 것을 따로 알려 주는 이유가 그것이다.

---

## ② 반입

폐쇄망이면 파일 두 개다.

```
① ops/release/v0.2.5/ 폴더째        (또는 cdp.exe + knowledge-repo-<고른 것>/ 둘만)
② git bundle create knowledge.bundle --all      ← 지식 레포가 이미 있다면
```

CDN·인터넷을 타는 것이 하나도 없다. 화면의 폰트까지 base64 로 들어 있다.

---

## ③ 지식 레포 — 관리자, 프로젝트당 1회

**폴더 하나와 exe 를 복사한다.** 배포본에 `knowledge-repo-*` 가 여럿이면 프로젝트에 맞는
**하나만** — 어느 패키지가 무엇인지는 배포본 루트 `README.md` 의 패키지 표에 있다.

```
xcopy /E /I <배포본>\knowledge-repo-<고른 것> C:\cdp
copy <배포본>\cdp.exe C:\cdp\tools\
cd /d C:\cdp
git init && git config core.hooksPath .githooks
```

**네 줄이다.** 전에는 `repo-kit\` 과 `packages\<고른 것>\` 을 차례로 부어야 했다.
**그 이름은 만든 쪽 개념이지 받는 쪽의 것이 아니다** — 무엇이 무엇인지 알아야 순서를
맞출 수 있었다. 지금은 배포본에 완성된 채로 들어 있다. exe 는 배포본 루트에 **하나**다 —
한때 폴더마다 넣었는데 패키지가 늘자 배포본이 그 수만큼(68MB×N) 커져서 되돌렸다(2026-09-23).

| 폴더 안에 이미 있는 것 | 빠지면 |
|---|---|
| `_vocab.md` — 좌표 타입과 순서 | 좌표가 하나도 안 잡힌다 |
| `_managed.md` — 좌표 패턴 → 정본 문서·섹션 | 파생 검사가 아무것도 안 한다 |
| `docs/` — 관리 문서 골격 | 등록부가 가리키는 섹션이 없다 |
| `.gitattributes` — 줄바꿈 고정 | **훅이 조용히 죽는다** |
| `bin/` · `.githooks/` · `.claude/skills` | 검사도 절차도 없다 |
| `tools/cdp.exe` — **배포본 루트의 `cdp.exe` 를 복사해 넣는다** | Node 없는 PC 에서 훅이 검사를 건너뛴다 · 더블클릭할 것이 없다 |

마지막에서 둘째가 무섭다. CRLF 로 체크아웃되면 `pre-commit` 의 셔뱅 뒤에
캐리지리턴이 붙어 실행되지 않는다. **커밋은 통과하고 검사만 사라진다.**
전에는 그 파일이 배포본에 아예 없었다 — 이 표가 준다고 적어 두고서.

**복사한 순간 지식 레포다** — `ctx` 는 `_vocab.md` 로 알아본다. 바로
`bin\ctx check` 가 돌고, 작업 기록이 아직 없으면 `이상 없음` 이다.

**첫날 할 일이 있다** — 안 쓰는 문서를 지우고 `_managed.md` 에서 그 패턴도
함께 지운다. 문서 없이 패턴만 남으면 **커밋이 막힌다**(앵커 없음). 그 폴더의
`README.md` 에 다섯 줄로 적혀 있다.

패키지 없이 손으로 세우려면 `MANUAL-관리자.md` 2장이 그 판단을 다룬다.

---

## ④ 작업 레포 — 관리자, 레포당 1회

**`_vocab.md` 를 만든 뒤에 한다.** `ctx setup` 은 그 파일로 지식 레포를
알아본다 — 없으면 `지식 레포를 찾을 수 없습니다` 로 멈춘다(exit 2).

```
<지식 레포>\tools\cdp.exe ctx setup <작업 레포>
```

앱에서도 된다 — **설정 → 작업 레포 → [에이전트 설치]**. 무엇을 쓸지 먼저
보여 주고 누르면 쓴다. 둘은 같은 함수를 부른다.

```
ctx setup: C:\gdi
  .claude\skills\   cdp-work · cdp-load · cdp-save · cdp-managed
                    cdp-import · cdp-edit · cdp-push
  CLAUDE.md         지식 레포 = C:\cdp
```

### 왜 작업 레포에도 넣나

**하네스는 프로젝트 루트의 `.claude/skills/` 만 읽는다.** 지식 레포에만
두면 코드 레포에서 클로드를 열었을 때 `cdp-work` 가 목록에 아예 없다 —
절차 층이 통째로 빠진다.

### `.gitignore` 를 본다

많은 프로젝트가 `.claude/*` 를 통째로 막아 둔다. 그대로 두면 skill 이
**설치한 사람 PC 에만** 남고 팀은 받지 못한다. 그리고 설치한 사람은
되니까 됐다고 생각한다.

```
.claude/*
!.claude/skills/     ← 이 줄
```

`ctx setup` 이 이 경우를 알려 주지만, 고치는 것은 사람이 한다.

---

## ⑤ 팀원 PC — 사람마다

```
git clone <지식레포>  C:\cdp
git clone <코드레포>  C:\gdi
```

**clone 이 실어 오지 않는 것이 둘 있다.**

```
cd C:\cdp
git config core.hooksPath .githooks     ← 훅은 clone 을 따라오지 않는다
copy <배포본>\cdp.exe tools\           ← 68MB. .gitignore 로 빠져 있다
```

따라오는 것 —

```
.claude/skills · .claude/work-repo · .githooks/pre-commit
bin/ctx · bin/ctx.cmd · bin/ctx.mjs · CLAUDE.md · MANUAL 2종
```

작업 레포 쪽 skill 과 `CLAUDE.md` 는 ④ 에서 커밋해 두었으면 clone 으로
따라온다. 다만 `.claude/cdp.json` 은 커밋되지 않으므로 **각자 한 번씩
`ctx setup` 을 돌린다** — 앱 설정에서 버튼 하나다.

---

## ⑥ 확인 — 세 곳이 같아야 한다

```
C:\cdp\tools\cdp.exe ctx version
C:\cdp\bin\ctx version
<배포본>\cdp.exe ctx version
```

다르면 **그 레포만 옛 답을 낸다.** 그리고 틀렸다는 말은 어디에도 안 나온다.

```
cd C:\cdp && bin\ctx check      → 이상 없음
```

훅이 실제로 도는지도 한 번 본다. 미등재 좌표를 하나 넣은 기록을 만들어
커밋을 시도하고, **막히는 것을 눈으로 확인한다.** 막히지 않으면 ③ 의
`core.hooksPath` 나 `.gitattributes` 를 다시 본다.

---

## 갱신 — 새 버전이 나왔을 때

지식 레포를 다시 세우지 않는다. **덮어쓰는 것은 도구뿐이다.**

```
copy <새 배포본>\knowledge-repo-dpms\bin\*         C:\cdp\bin\
copy <새 배포본>\cdp.exe                             C:\cdp\tools\
copy <새 배포본>\knowledge-repo-dpms\MANUAL*.md    C:\cdp\
C:\cdp\tools\cdp.exe ctx setup C:\gdi   ← skill 도 같이 갱신된다
```

`_vocab.md` · `_managed.md` · `docs/` · `work/` 는 **건드리지 않는다.**
그것이 지식이고, 도구는 그 위에서 도는 것뿐이다.

---

## 점검표

| | | |
|---|---|---|
| ☐ | ① | `ops/release/v<버전>/` 생성 · **태그를 달았다** |
| ☐ | ③ | `core.hooksPath` = `.githooks` |
| ☐ | ③ | `.gitattributes` 에 `eol=lf` |
| ☐ | ③ | `_vocab.md` · `_managed.md` · `docs/` |
| ☐ | ③ | `tools\cdp.exe` 가 있다 |
| ☐ | ④ | `ctx setup` 을 **`_vocab.md` 뒤에** 돌렸다 |
| ☐ | ④ | 작업 레포 `.gitignore` 에 `!.claude/skills/` |
| ☐ | ⑥ | `ctx version` 세 곳 일치 |
| ☐ | ⑥ | `ctx check` 이상 없음 |
| ☐ | ⑥ | **일부러 틀린 기록으로 커밋이 막히는 것을 봤다** |

마지막 줄이 이 점검표의 목적이다. 나머지는 그것을 위한 준비다.
