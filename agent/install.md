# 에이전트 세팅 — 받는 사람에게 가는 길

v1.0 의 설치 · 갱신 길은 셋이다 — ① **서버**(`install.sh` · `upgrade.sh` — 서버 관리자 설명서) ② **지식 레포**(콘솔 「새 지식 레포」 ·
clone — 레포에는 지식만) ③ **에이전트 세팅** — 이 문서. 이 폴더(`agent/`)의 스킬과 CLAUDE 블록이 작업 레포 · 큐레이터 폴더에 닿는 길이다.

```
agent/ ──release:server──▶ 서버 번들 kit/ ──GET /kit/<레포>(토큰의 역할)──▶ install.mjs ──병합──▶ 작업 레포 · 큐레이터 폴더
```

사람이 따라 하는 순서는 [사용자 설명서](../manual/사용자_설명서.md) 2장(작업 레포) · [큐레이터 설명서](../manual/큐레이터_설명서.md)
1장(큐레이터 폴더)이다. 이 문서는 **무엇이 어디로 가고 무엇을 지키나**만 다룬다.

---

## 자리 넷

| 자리 | 누가 | 명령 | 받는 kit |
|---|---|---|---|
| 작업 레포 | writer · 담당자 | 레포 관리 › 연결된 작업 레포 › [설치 방법] 한 줄 — `--repo <레포> --workrepo <id> .` | writer — 스킬 셋 · 프로젝트레포 블록 |
| 작업 레포 갱신 | 담당자 | 같은 화면 맨 위 카드의 한 줄 — `--update [--commit] [--dry]` | 그 PC 에 이 서버로 설치한 작업 레포 전부 |
| 큐레이터 폴더 | 큐레이터 | `--curator --repo <레포> .` — 등록 없이 폴더 하나 | 큐레이터 — 스킬 여섯 · 큐레이터 블록 |
| Node 가 없는 망 | 누구나 | [설치 방법] 의 꾸러미 zip → 풀고 `node install.mjs <폴더>` | 한 줄과 같다 |

한 줄의 모양(PowerShell) —

```
curl.exe -fsSLo "$env:TEMP\cdp-install.mjs" http://<서버>:7374/install.mjs; if ($?) { node "$env:TEMP\cdp-install.mjs" <인자> }
```

명령 프롬프트 · macOS/Linux 모양은 화면이 탭으로 준다. 설치기는 임시 폴더에 받는다 — 작업 레포에는 CDP 파일만 들어간다.

---

## 한 줄이 하는 일

1. **설치기** — 공개 `GET /install.mjs`. 서버 주소만 박혀 있다 — 레포 이름 · 사람 · kit · 토큰은 없다.
2. **토큰** — `CDP_TOKEN` 이 있으면 서버에 확인하고, 없거나 안 통하면 숨김 입력으로 묻는다. 확인되면 이 PC 에 둘지 묻는다
   (Windows 사용자 환경변수 · macOS/Linux `~/.config/cdp/token` 600 + rc 한 줄). **명령 · 설치기 · 꾸러미 어디에도 원문은 없다.**
3. **kit** — 그 토큰으로 `GET /kit/<레포>?workrepo=<id>&as=json` — 등록된 작업 레포는 **토큰의 역할과 무관하게 writer kit** 이다.
   큐레이터 폴더는 `?as=json&role=curator`(등록 없이 · 토큰이 그 레포의 큐레이터가 아니면 멈춘다). 다른 레포의 등록 id 면 409 ·
   권한 밖 레포는 404.
4. **병합** — `core/setup.js` 한 벌. 바뀔 것을 보여 주고 묻는다(`--dry` 는 보기만 · `--yes` 는 묻지 않는다).

   ```
   .mcp.json             cdp 항목만 — 서버 /mcp/<레포> · Authorization: Bearer ${CDP_TOKEN}. 다른 MCP 서버는 그대로
   .claude/cdp.json      { "server": …, "repo": … }
   .claude/skills/cdp-*  cdp- 로 시작하는 것만 간다 — kit 에서 사라진 cdp- 스킬은 치운다 · 남의 스킬은 둔다
   CLAUDE.md             <!-- cdp:begin --> … <!-- cdp:end --> 블록만 · 첫 줄 <!-- cdp:kit <해시> --> · 나머지는 그대로
   ```

5. **보고** — 작업 레포면 대장에(`POST /workrepos/<id>/applied` — 행이 `최신`) · 이 PC 의 설치 목록에(`--update` 가 이것을 돈다).
   큐레이터 폴더는 대장 · 설치 목록에 오르지 않는다.

**git 레포일 때만** 쓴다(작업 레포). 큐레이터 폴더는 git 이 아니어도 된다.

---

## `.gitignore` 를 본다

작업 레포의 세팅은 **커밋한다** — `git add .mcp.json .claude CLAUDE.md`. 팀원은 pull 뒤 같은 한 줄을 한 번(토큰 · 보고만).
많은 프로젝트가 `.claude/*` 를 통째로 막아 둔다 — 그대로면 스킬이 설치한 사람 PC 에만 남고 팀은 받지 못한다.

```
.claude/*
!.claude/skills/     ← 이 줄
```

설치기가 이 경우를 알려 주지만 고치는 것은 사람이다. `.claude/cdp.json` 을 막아 둔 것도 알려 준다 — 서버 주소 · 레포는 PC 와 무관해 커밋한다.

---

## 갱신 — 판이 오르면

kit 은 **서버 번들**에서 나간다. `upgrade.sh` 가 `kit/` 을 갈면 그 순간부터 모든 레포의 kit 이 새 판이고, 작업 레포 대장의 행이
`낡음` 이 된다(kit 해시가 다르다) → 담당자가 `--update` 한 줄 → 팀원은 그 커밋을 pull. 큐레이터 폴더는 같은 `--curator` 한 줄을 다시.
새 스킬은 Claude Code 를 다시 켜야 읽힌다.

v0.x 에서 올라온 작업 레포는 `--update` 한 번에 옛 스킬(cdp-load · cdp-import · cdp-edit · cdp-managed)이 치워지고 셋이 남는다.

---

## 확인

| ☐ | |
|---|---|
| ☐ | Claude Code 를 다시 켠 뒤 `/mcp` 에 `cdp` connected — 도구 10(작업 레포 · writer) · 12(큐레이터 폴더) |
| ☐ | 작업 레포 대장의 행이 `최신` |
| ☐ | `.claude/skills/` 가 커밋됐고 `.gitignore` 에 막히지 않았다 |
| ☐ | 새 터미널에서 `CDP_TOKEN` 이 보인다 |
| ☐ | 큐레이터 폴더 — 화면에 「큐레이션」 메뉴 · 에이전트가 `queue` 로 대기열을 낸다 |
