# 설치 한 줄 TODO — 작업 레포 설치를 명령 한 줄로 · 토큰은 설치기가 묻고 둔다

> 운영자 요청(2026-09-28) — 「작업 레포 세우는 절차가 번거롭다. `node install.mjs` 를 치는 것도, 토큰을 따로 넣는 것도.
> 토큰 저장은 왜 하나?」 → 권장안(한 줄 설치 + 설치기가 토큰을 묻고 저장) **으로 진행.**
> 원본 결정: MCP 설계서 §6.7.3(꾸러미 · 설치기) · §4.4.1(토큰 원문은 발급 때 한 번). 이 작업은 둘 다 **뒤집지 않는다** —
> 화면 · 명령 · 설치기 어디에도 토큰 원문은 없고, 새 발급 경로도 새 비밀도 만들지 않는다.
> 커밋까지만 — push · 태그 · 실서버 갱신은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 결정 I1~I8 | **완료** (아래) |
| ① 서버 — `/install.mjs` · `/kit?as=json` | 아래 「나온 것」 |
| ② 설치기 — 받기 · 토큰 · 저장 | 아래 「나온 것」 |
| ③ 화면 — 관리 › 작업 레포 › 설치 방법 | 아래 「나온 것」 |
| ④ 검증 · 문서 | 아래 「나온 것」 |

### 시작 상태 (v0.14.0 · 017fda3)

```
1. [설치 방법] → zip 내려받기 → 아무 데나 푼다 → 그 폴더로 간다
2. node install.mjs <작업 레포 경로>            ← 경로를 손으로 적는다
3. setx CDP_TOKEN <토큰>                        ← 따로. 틀려도 4 에서 /mcp 가 failed 여야 안다
4. Claude Code 를 다시 켠다 → /mcp
5. git add .mcp.json .claude CLAUDE.md
```

토큰이 없으면 2 는 되지만 대장 보고가 빠지고 「토큰을 두고 한 번 더」 가 나온다 — 순서가 거꾸로다.

### 토큰을 왜 저장하나 (요청의 물음)

설치에 쓰는 것이 아니다. **Claude Code 가 서버에 붙을 때마다** 쓴다 — `.mcp.json` 의 `Authorization: Bearer ${CDP_TOKEN}` 을
Claude Code 가 시작할 때 환경변수로 채운다. 원문을 `.mcp.json` 에 박지 않는 것은 그 파일이 **커밋돼 팀이 같이 쓰고**,
토큰은 **사람마다 다르기** 때문이다(서버는 토큰으로 커밋 author · 권한 · 감사 로그를 가른다). 부수로 설치기가 대장에 보고할 때도 쓴다.

---

## 0. 결정 (권장안)

| | 결정 | 왜 |
|---|---|---|
| I1 | **공개 `GET /install.mjs`** — 설치기 전문(`core/setup.js` 병합 규칙 포함) 앞에 이 서버 주소 한 줄만 박는다. 레포 이름 · 사람 · kit 은 없다 | 받기 전에 인증을 요구하면 「토큰을 먼저 이 셸에 넣어라」 가 다시 생긴다. 담긴 것이 코드뿐이라 `/healthz` 규칙(이름을 내지 않는다) 안이다 |
| I2 | **kit 은 설치기가 토큰으로 받는다** — `GET /kit/<레포>?workrepo=<id>&as=json`(Bearer). zip 과 같은 판정 · 같은 조립, 담는 모양만 JSON | 권한 판정이 한 자리(권한 밖 레포는 404)다. **일회용 설치 코드 안은 버렸다** — 토큰은 어차피 필요하고, URL 에 실리는 새 비밀 · 서버 상태가 생긴다 |
| I3 | **설치기가 토큰을 묻는다.** `CDP_TOKEN` 이 있으면 `/me` 로 확인, 없거나 안 통하면 숨김 입력(세 번). 통하면 「kjsa (writer) 로 확인」 | 틀린 토큰을 재시작 뒤 `/mcp failed` 가 아니라 **그 자리에서** 안다. 실패 메시지는 서버와 같이 하나(「토큰을 확인하세요」) |
| I4 | **저장은 묻고 한다.** Windows — 사용자 환경변수(PowerShell `SetEnvironmentVariable(…,'User')`, 원문은 **표준 입력**으로 — 명령줄 인자에 안 뜨게). macOS · Linux — `~/.config/cdp/token`(600) + 셸 rc 에 그것을 읽는 한 줄(`# cdp:token`). `--yes` 면 묻지 않고 `--no-save` 면 안 한다 | 관리자 권한이 필요 없고 PC 에 한 번이면 작업 레포 전부가 쓴다. rc 파일은 남이 읽을 수 있는 배치가 있어 원문은 600 파일에 둔다 |
| I5 | **`.claude/settings.local.json` 의 `env` 에 두는 안은 버렸다** | **실측(Claude Code 2.1.92 · `claude mcp list`)** — `settings.local.json` 의 `env` 로는 `${CDP_TOKEN}` 이 채워지지 않고 원문 `Bearer ${CDP_TOKEN}` 이 그대로 나갔다. 프로세스 환경변수로는 채워졌다. 또 `git add .claude` 가 그 파일을 커밋할 위험이 있다 |
| I6 | **명령은 화면이 만든다** — 주소(`location.origin`) · 레포 · 등록 id 를 채운 한 줄. PowerShell · cmd · macOS/Linux 세 벌, 기본 탭은 OS 로. 받은 파일은 **임시 폴더**에 — 작업 레포에 남지 않는다. 작업 레포 경로는 `.`(그 폴더에서 붙여넣는다) | 경로를 손으로 적는 일 · 푼 폴더로 옮겨 가는 일이 없어진다 |
| I7 | **zip 은 남긴다** — Node 가 없을 때 · 손으로 옮길 때 · 내려받기가 막힌 망. zip 안 `install.mjs` 도 같은 토큰 단계를 탄다(없으면 묻고, Enter 면 건너뛴다 — 설치는 되고 보고만 빠진다) | 두 길의 결과가 같아야 한다. 규칙은 한 벌(`core/setup.js`) |
| I8 | 번들이 아닐 때(소스로 도는 개발 · 하네스) `/install.mjs` 는 **이 PC 의 `viewer/bin/cdp-install.mjs` 를 부르는 두 줄**이다 | 전에는 소스 모드에서 설치기를 아예 안 냈다 — 그래서 하네스가 설치기를 끝까지 돌려 볼 수 없었다 |

---

## ① 서버 — `viewer/bin/ctx-mcp-serve.mjs`

- [x] `GET /install.mjs` — 인증 앞 · `text/javascript` · `no-store` · 서버 주소 한 줄 + 설치기(번들) 또는 소스 두 줄(I8)
- [x] `GET /kit/<레포>?workrepo=<id>&as=json` — `{ server, repo, workrepo, kit, files: [{ name, data(base64) }] }` · zip 의 `kit/` 아래와 같은 것
- [x] 꾸러미 `설치.md` — 토큰 단계를 「설치기가 묻는다」 로

## ② 설치기 — `viewer/bin/cdp-install.mjs`

- [x] 두 모양 — 꾸러미(옆에 `kit/`) · 받은 것(`--repo · --workrepo`, kit 은 서버에서 → 임시 폴더 → 끝나면 지운다)
- [x] 토큰 — 환경변수 확인 → 없거나 안 통하면 숨김 입력 · 세 번 · TTY 가 아니면 묻지 않는다
- [x] 저장 — Windows 사용자 환경변수 · macOS/Linux 600 파일 + rc 한 줄 · 묻는다 · `--yes` · `--no-save`
- [x] 대장 보고는 확인된 토큰으로 — 환경변수를 다시 읽지 않는다
- [x] 끝 안내 — 「Claude Code 를 **완전히** 끄고 다시 켠다(VS Code · 데스크톱 앱 안이면 그 앱을)」 · 커밋

## ③ 화면 — `viewer/src/components/admin/WorkReposServer.jsx`

- [x] [설치 방법] — ① 작업 레포 폴더에서 한 줄(탭 셋) ② 토큰을 물으면 붙여넣기(이 PC 에서 처음일 때만) ③ 다시 켜기 ④ 커밋
- [x] zip 은 「Node 가 없거나 손으로 옮길 때」 로 접어 둔다
- [x] 옛 주석(「발급은 서버 셸에서만」 — v0.10 부터 콘솔도 발급한다) 정리
- [x] 콘솔 › 작업 레포의 「낡음」 안내 — `node install.mjs` 대신 「설치 명령을 한 번 더」

## ④ 검증 · 문서

- [x] 하네스 — `/install.mjs` 가 인증 없이 나오고 레포 이름이 없다 · `as=json` 이 권한 밖 레포에 404 · 받은 설치기로 빈 레포에 설치 → 대장 최신 · 토큰 원문 0
- [x] 단위 — rc 한 줄이 두 번 붙지 않는다 · 토큰 파일 600
- [x] 사용자 설명서 2.1 · 관리자 설명서의 작업 레포 절 · CHANGELOG
- [x] 화면 실측 — [설치 방법] 의 탭 셋 · 명령 복사

## 나온 것

**커밋이 둘로 갈렸다.** ① 의 서버 쪽(`/install.mjs` · `as=json` · `설치.md`)은 같은 체크아웃에서 돌던 다른 세션의
`cb95c73`(설명서 첫 권 · 역할별 첫 화면 · http 복사)에 **통째로 함께 들어갔다** — 그 세션이 `ctx-mcp-serve.mjs` 를 파일째 올렸다.
내용은 완성된 것이라 이력은 고치지 않았다. 나머지(설치기 · 토큰 저장 · 화면 · 하네스 · 문서)는 이 TODO 의 커밋이다.

### 실측 (2026-09-29 · Windows 10 · PowerShell 5.1 · Node 22.23 · Claude Code 2.1.92)

| | 결과 |
|---|---|
| I5 근거 | 빈 폴더에 `.mcp.json`(`Bearer ${CDP_TOKEN}`) + 요청을 적는 서버. `settings.local.json` 의 `env` 만 → 서버에 **`Bearer ${CDP_TOKEN}` 원문 그대로**. 프로세스 환경변수 → 채워진 값 |
| 화면 | 개발 서버 7384(`cdp-serve-install`) · hong(writer) · 관리 › 작업 레포 › 등록 `demo-app` › [설치 방법] — 탭 셋 · 한 줄 · zip 접힘 · 콘솔 오류 0 |
| PowerShell 한 줄 | 화면의 명령 그대로(+ `--yes --no-save`) → `토큰 hong (writer) — CDP_TOKEN` · 10건 적용 · 대장에 보고 · 화면의 행 `최신` |
| 명령 프롬프트 한 줄 | 같다 — 10건 적용 · 보고 |
| Claude Code | 설치된 폴더에서 `claude mcp list` → `cdp: http://localhost:7384/mcp/alpha (HTTP) - ✓ Connected` |
| Windows 저장 | `saveTokenWindows` 를 시험 이름(`CDP_TOKEN_PROBE`)으로 — `HKCU\Environment` 에 쓰이고 다시 읽혔다 · 지웠다 |
| 하네스 | **✓ 92 ✗ 0 – 16** (`node ops/verify/run.mjs` · 104~107 새로) |
| 단위 | `node --test test/*.test.mjs` 115/115 (`tokenstore` 4 새로) |

**못 잰 것** — **숨김 입력(TTY)** 은 이 세션에서 손으로 칠 터미널이 없어 돌려 보지 못했다(도구의 셸은 TTY 가 아니라 설치기가
묻지 않는 쪽으로 간다 — 107 이 그 길이다). 사람이 한 번 — 토큰이 없는 새 PowerShell 창에서 화면의 한 줄 → 붙여넣기 → Enter →
`확인했습니다 — …` → `Y` → 새 창에서 `echo $env:CDP_TOKEN`. macOS · Linux 의 rc 한 줄도 실기기로는 안 쟀다(단위 테스트만).
Git Bash(mintty) 의 node 는 TTY 가 아닐 수 있다 — 그때는 묻지 않고 「CDP_TOKEN 이 없거나 통하지 않습니다」 로 멈춘다. PowerShell 이나 명령 프롬프트 탭을 쓴다.

### 하네스

| | 확인 | 결과 |
|---|---|---|
| 104 | `/install.mjs` 가 인증 없이 · 설정은 `server` 하나 · 레포 이름 · 사람 · 토큰 없음 | 0.1 KB(소스 모드 두 줄) |
| 105 | `as=json` — 토큰 없이 401 · 권한 밖 레포 404 · `kit/` 밖의 것 없음 · 원문 0 | 11개 |
| 106 | 받은 설치기 한 줄 → 빈 레포에 스킬 7 · 다른 MCP 서버 보존 · `${CDP_TOKEN}` 자리 · 대장 최신 · 두 번째는 이미 최신 · 임시 kit 남은 것 0 | ✓ |
| 107 | 토큰이 없고 물을 수 없으면(`--yes` · TTY 아님) exit 2 · 쓴 것 0 · 틀린 토큰도 같다 | ✓ |

첫 번째 돌림에서 73(세운 레포에 save)이 한 번 떨어졌다 — 그때 체크아웃에 다른 세션의 변경이 걸려 있었다. 그 세션이 커밋한 뒤 이 트리만으로 다시 돌려 ✓ 92 ✗ 0.
