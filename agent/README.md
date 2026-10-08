# agent — 받는 사람에게 가는 것

**여기가 원본이다.** 서버 번들의 `kit/` · `forms/` 와 작업 레포 · 큐레이터 폴더 안의 `.claude/skills` 는 전부 사본이고,
서버 산출물 빌드(`npm run release:server` — `ops/lib/release-server.mjs` · `bundle-files.mjs` 의 `copyKit`)가 여기서 복사해 만든다.
사본을 고치면 다음 빌드 · 설치 한 줄에 덮인다.

판정 기준은 하나다 — **받는 사람에게 가는가.** 도구를 만드는 사람만 보는 것은 `docs/` 에 있다.

```
skills/                  절차 — 에이전트가 읽는 지시문
  cdp-work/              모두     검토(match) → 주입(section — 섹션 · 미반영 · 건 정본 · 기준선) → 수행
  cdp-save/              writer   작업 기록 하나 — 이 세션의 작업 · 편입(편입.md) · 문서 수정 지시 · 첨부(첨부.md)
  cdp-push/              모두     이 세션이 만진 파일만 그 레포에 커밋 · push
  cdp-curate/            큐레이터  대기열의 기록을 관리 문서에 반영 — 종류별.md · 예시.md
  cdp-registry/          큐레이터  등록부 · 문서 구조 — 행 · 이름 · 합치기 · 폐기 · 지우기 · 섹션 밖 글
CLAUDE-프로젝트레포.md     작업 레포의 CLAUDE.md **블록** — writer
CLAUDE-큐레이터.md        큐레이터 폴더의 CLAUDE.md **블록**
forms/<묶음>/             서식집 — public-si 40 · agile-product 14 · cloud-native 13 · ai-service 12 (+ _묶음.json)
install.md               에이전트 세팅이 받는 사람에게 가는 길 — 한 줄 · --update · --curator
```

## 어디로 가나

```
agent/skills/cdp-*           →  kit/skills/cdp-*           →  작업 레포 · 큐레이터 폴더의 .claude/skills/cdp-*
agent/CLAUDE-프로젝트레포.md   →  kit/CLAUDE-프로젝트레포.md   →  작업 레포 CLAUDE.md 의 <!-- cdp:begin --> … <!-- cdp:end -->
agent/CLAUDE-큐레이터.md      →  kit/CLAUDE-큐레이터.md      →  큐레이터 폴더 CLAUDE.md 의 같은 블록
agent/forms/<묶음>/           →  forms/<묶음>/              →  (레포로 가지 않는다) 서버가 새 관리 문서를 찍을 때 읽는다
```

**역할별 kit** — 서버(`GET /kit/<레포>`)가 고른다(`core/kit.js`). writer 는 스킬 셋(cdp-work · cdp-save · cdp-push) + 프로젝트레포
블록, 큐레이터는 다섯 + 큐레이터 블록. **등록된 작업 레포는 누가 깔아도 writer kit** 이다(팀이 같이 커밋하는 자리) — 큐레이터 kit 은
큐레이터 폴더(`--curator`)에만 간다. kit 의 해시가 작업 레포 `CLAUDE.md` 첫 줄의 `<!-- cdp:kit <해시> -->` 이고, 작업 레포
대장의 「낡음」 이 이것으로 갈린다. 판을 올리면 모든 레포의 kit 이 같이 바뀐다 — 레포마다 다르지 않다.

**지식 레포에는 아무것도 가지 않는다**(v1.0 I9). 옛 판이 레포에 넣던 `MANUAL*.md` · `CLAUDE.md` · `TEMPLATE-work.md` · 훅 · `bin/ctx` · 스킬
사본은 레포를 떠났다 — 설명서는 서버의 `/manual`(원천은 소스 레포 루트 [`manual/`](../manual)), 작업 기록의 모양은 `cdp-save` 의
「필드 — work」 표, 검사는 서버 `save` 다.

> 옛 판의 도구 층 원본(`CLAUDE-지식레포.md` · `hooks/` · `gitattributes` · `gitignore`)과 그것을 표본에 심던 `ops/lib/seed-kit.mjs` 는
> v1.0 에서 지웠다(W2 · W6). 새 지식 레포의 `.gitattributes` · `.gitignore` 는 빈 틀(`core/skeleton.js`)이 쓰고, 옛 레포에 남은 도구 층은
> `ctx migrate` 가 걷는다.

## CLAUDE 블록이 왜 둘인가

자리가 다르기 때문이다. **작업 레포**는 옆에 서버의 지식 레포가 있고 여기서는 기록만 남긴다는 것을, **큐레이터 폴더**는 그 레포의
대기열을 판정해 관리 문서에 반영하는 자리라는 것을 말해야 한다. 내용이 겹치지 않는다. 이름에 용도를 적어 두는 이유가 그것이다 —
하나뿐이던 시절에 지식 레포 자리에 작업 레포판이 들어가고 있었다.

## 블록으로 들어간다

작업 레포에는 이미 그 프로젝트의 `CLAUDE.md` 가 있을 수 있다. 통째로 덮지 않고 `<!-- cdp:begin -->` … `<!-- cdp:end -->` 사이만
갈아 끼운다. `core/setup.js` 가 그 일을 하고, 설치기(`viewer/bin/cdp-install.mjs`)의 모든 모양 — 한 줄 · `--update` · `--curator` ·
꾸러미 zip — 이 같은 함수를 부른다. **절차는 블록에 적지 않는다** — 스킬 안에 있다. 두 곳에 적으면 한쪽만 고쳐진다.

## 고칠 때

- **스킬** — `SKILL.md` 머리말은 YAML 로 읽혀야 한다(`name` = 폴더 · `description` 은 큰따옴표 · 누가 쓰는 스킬인지). 줄 수 상한과 함께
  하네스 117 이 본다. 예시와 드문 길은 같은 폴더의 참고 파일로(점진 공개).
- **도구 이름** — 스킬 · 블록이 부르는 도구는 서버 등록(`viewer/bin/ctx-mcp.mjs`)과 같아야 한다. 공식 사이트(`site/src/data/facts.js`)가
  도구 · 스킬 이름을 대조한다(`test/site.test.mjs`).
- **서식** — `core/forms.js` 의 `lintForm` 이 전부를 본다(`test/forms.test.mjs`). 서식은 서식이지 내용이 아니다 — 프로젝트의 값을 넣지 않는다.
  팀 서식은 여기가 아니라 서버의 `<data>/forms/` 다.
- **사내 흔적을 넣지 않는다** — 여기 있는 것은 전부 밖으로 나간다.
- 판을 올리면 사람들은 `--update`(작업 레포) · `--curator`(큐레이터 폴더) 한 줄로 받는다 — [`install.md`](install.md).
