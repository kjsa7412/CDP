# agent — 받는 사람에게 가는 것

**여기가 원본이다.** 지식 레포·작업 레포·`viewer/fixture` 안의 같은 파일은 전부
사본이고, `ops\release.cmd` 와 `ops\seed.cmd` 가 여기서 복사해 만든다.
사본을 고치면 다음 빌드에 덮인다.

판정 기준은 하나다 — **받는 사람에게 가는가.** 도구를 만드는 사람만 보는
것은 `docs/` 에 있다.

```
skills/                 절차 — work · load · save · import · edit · managed · push
CLAUDE-지식레포.md       지식 레포의 CLAUDE.md 로
CLAUDE-프로젝트레포.md    작업 레포의 CLAUDE.md **블록**으로
TEMPLATE-work.md        작업 기록 서식
hooks/pre-commit        유일한 결정론적 보증 층
manual/
  system.md               **정본** — CDP 가 지금 무엇인지
  user.md                 하루 쓰는 법
  admin.md                설치 · 어휘 운영 · 배포 · 장애
packages/               프로젝트마다 골라서 붓는 문서 골격 · 등록부 · 어휘
install.md              설치 시나리오 — 네 자리
```

## 배포본에서 어디로 가나

```
manual/system.md   →  repo-kit/MANUAL-시스템.md      지식 레포 안
manual/user.md     →  repo-kit/MANUAL.md
manual/admin.md    →  repo-kit/MANUAL-관리자.md
skills/            →  repo-kit/.claude/skills
CLAUDE-지식레포.md            →  repo-kit/CLAUDE.md
CLAUDE-프로젝트레포.md        →  repo-kit/.claude/work-repo/CLAUDE.md   (서식)
packages/          →  **배포본 루트** packages/   (골라서 붓는다)
hooks/pre-commit   →  repo-kit/.githooks/pre-commit
install.md         →  **배포본 루트** 설치.md
```

`install.md` 와 `packages/` 만 루트로 간다. **지식 레포가 아직 없을 때 읽고
고르는 것**이라 `repo-kit/` 안에 두면 부은 뒤에야 보인다 — 순서가 거꾸로다.

> **`packages/` 가 `repo-kit/` 에 안 들어가는 이유가 그것이다.** `repo-kit` 은
> 통째로 붓는 것이고 패키지는 **그중 하나를 고르는** 것이다. 둘을 같은 자리에
> 두면 고를 것이 없어진다.

## `CLAUDE.md` 가 왜 둘인가

레포가 둘이기 때문이다. **지식 레포**는 자기 자신이 무엇인지 말해야 하고,
**작업 레포**는 옆에 지식 레포가 있다는 것을 말해야 한다. 내용이 겹치지
않는다.

전에는 이 구분이 없어 하나뿐이었고, 그 하나가 작업 레포판이었다. 그래서
`seed` 와 `release` 가 **지식 레포 자리에 작업 레포판을 넣고 있었다.**
같은 시기에 지식 레포판은 파이썬 두 파일에 문자열로 각각 박혀 있다가 이미
갈라져 있었다 — 한쪽은 '산출물', 다른 쪽은 '산출물 16종'.

이름에 용도를 적어 두는 이유가 그것이다.

## 작업 레포판은 **블록**으로 들어간다

작업 레포에는 이미 그 프로젝트의 `CLAUDE.md` 가 있을 수 있다. 통째로 덮지
않고 `<!-- cdp:begin -->` … `<!-- cdp:end -->` 사이만 갈아 끼운다.
`viewer/server/core/setup.js` 가 그 일을 하고, **앱과 `ctx setup` 이 같은
함수를 부른다.**
