# deploy — 모드 B 서버를 올리는 것

설계 [`CDP_MCP_설계서 v1.1 §9.4`](../../docs/design/CDP_MCP_설계서_v1.0.md) ·
확정값 [`MCP_0단계_결정`](../../docs/dev/MCP_0단계_결정.md) ·
근거 [`제품화 검토 §3.3`](../../docs/design/CDP_제품화_검토_v1.0.md)

> **실제로 올릴 때는 [`설치절차.md`](설치절차.md) 를 따른다.** 이 문서는 참조 —
> 여기 있는 파일이 각각 무엇을 하고 **무엇을 하지 않는지**다.

```
cdp-serve.service   systemd 유닛 — install.sh 가 node 경로 · bind · port 를 박아 /etc/systemd/system 에 둔다
install.sh          설치 — 설치절차 0 · 2 · 6장.  멱등.  방화벽은 안내만
upgrade.sh          갱신 — 설치절차 10장 ①②③.  백업 · 교체 · 재시작 · 대조 · 실패면 되돌림
Dockerfile          선택지 — systemd 없이 컨테이너로.  CI 확인용으로도
docker-compose.yml  그 compose
설치절차.md         사람이 따라가는 순서.  스크립트가 무엇을 하는지의 설명
```

**서버 산출물**(`npm run release:server` → `cdp-server-v<버전>.tar.gz`)에 이 폴더가
`deploy/` 로 들어간다. 스크립트는 그 산출물 안에서 돈다 — `bin/` · `web/` · `packages/`
가 형제라는 것을 전제한다.

## 확정된 배치

| | |
|---|---|
| 서버 | `10.10.20.188` · 사내 Linux |
| 접속 | `http://10.10.20.188:7374` — **프록시 없음 · 평문** |
| origin | `http://10.10.20.250:2900/soln1/cdp.git` — 사내 GitLab · HTTP · PAT |
| 레포 | `gdi` (`<root>/gdi`) — 패키지로 더 세울 수 있다(`ctx repo new`) |

### 프록시가 없다는 것의 뜻

§4.3 은 "TLS · 레이트리밋 · IP 제한은 프록시가 한다" 였다. 이 배치에는 프록시가 없으므로
그 셋이 없다. 받아들이고 가는 것이고, 대신 이렇게 좁힌다 —

| | |
|---|---|
| 토큰 | 사내망을 **평문으로** 흐른다. 망을 믿는 것이 전제다 |
| 바인드 | `0.0.0.0` 이 아니라 `10.10.20.188` 하나에만 — `install.sh --bind` 가 그것을 요구한다 |
| Origin | 같은 출처가 아닌 `Origin` 은 403(§8) |
| 레이트리밋 | 없다. 사용자 2~5명 |
| claude.ai 커넥터 | **불가.** 공개 HTTPS 가 아니다 |

TLS 를 켜려면 Caddy 한 줄이다(§9.4) — `install.sh` 는 그것을 **하지 않는다.** 배치가 정한다.

```
cdp.example.com { reverse_proxy 127.0.0.1:7374 }
```

## 스크립트가 하는 것과 하지 않는 것

| | 한다 | 하지 않는다 |
|---|---|---|
| `install.sh` | node ≥ 20 · git 확인 · 계정 · 폴더 · 파일 배치(`manual/` 포함) · 유닛(node 경로 자동) · enable · healthz 확인 · 방화벽 **안내** · 끝에 `/setup` 주소와 **부트스트랩 코드** | git 자격 · 레포 · 명부 · 토큰 · 방화벽 실행 — 명부 · 토큰 · 레포는 `/setup` 과 콘솔이 |
| `upgrade.sh` | 산출물 검증 · `.bak`(bin · web · packages · manual 한 세대) · 교체 · restart · `built` 와 자산 해시 대조 · 실패 시 되돌림 | 명부 · 대장 · 레포 · git 자격 · 유닛. v0.9.0 명부의 관리자 승격은 사람이(설치절차 10장) |
| `ctx serve doctor` | node · git · `auth.json` 권한/형식 · 레포마다 `_vocab` · git · upstream · **origin 도달 · push 자격** · web · data · packages · 포트/healthz | 고치지 않는다 — 말만 한다. fail 이면 exit 1 |
| `ctx serve init` | 첫 사용자(`admin`) + 첫 토큰 (명부가 없을 때만) — 브라우저 `/setup` 마법사가 같은 일을 한다 | 둘째 사람부터는 콘솔 > 사용자 · 토큰(또는 `user add` · `token`) |
| `ctx repo new` | 패키지 복사 · `git init` · `hooksPath` · 첫 커밋(훅) · `remote add` · `push -u` | origin 프로젝트를 만드는 것 — GitLab 웹에서 먼저 |

**발급은 관리자가 한다** — 콘솔 `/console/tokens`(세션 + 재인증 15분) 또는 서버 셸(§4.4.1 정정). 사용자가 HTTP 로
발급을 요청하는 길은 없다. 첫 관리자만 `install.sh` 가 찍는 부트스트랩 코드로 `/setup` 에서 만든다.

## Docker — 선택지

```bash
cd cdp-server-v0.9.0
touch auth.json
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec cdp node bin/ctx.mjs serve init --auth /opt/cdp/auth.json --data /opt/cdp/data --name kjsa    # 또는 브라우저 /setup
```

컨테이너 안에서 `--bind 0.0.0.0` 은 맞다 — 경계는 호스트의 `-p` 매핑이다. 기본 배치는
systemd 다(검토 R10). Docker 는 사내 배치가 바뀌었을 때의 두 번째 길이고 CI 에서 서버
산출물이 실제로 뜨는지 확인하는 자리다.

## 막혔을 때

| 증상 | 볼 곳 |
|---|---|
| 시작하자마자 죽는다 | `journalctl -u cdp-serve -n 50` · `--auth` 경로 · Node 판 · `ExecStart` 의 node 경로 |
| `거부: --bind … 인증 없이 밖으로 열 수 없다` | `--auth` 가 빠졌다(§8) |
| `mirror: lag` 가 안 풀린다 | `doctor` — `레포 … push` 줄. 토큰 만료 · Deploy Key 삭제 · 보호 브랜치 |
| 401 인데 토큰은 맞다 | 만료 · 명부에서 지워짐 · `active:false`. `serve user list` |
| 레포가 안 보인다 | `_vocab.md` 가 있는가 · 목록 갱신은 60초 주기 |
| `repo new` 가 첫 커밋에서 막힌다 | 패키지가 규약을 어겼다 — 개발 PC 에서 `ctx package check` |

## 실측 — 2026-09-22

WSL Ubuntu(systemd · node 20.20.2)에 tar 로 — `install.sh` 두 번(둘째는 전부 건너뜀) ·
`serve init` · `repo new` · `doctor` fail 0 · `POST /repos` · `upgrade.sh` 같은 판 ✓ ·
**깨진 번들을 주면 되돌리고 exit 1**(서비스는 옛 번들로 살아 있다). Docker — 이미지
빌드 · `/healthz` · HEALTHCHECK healthy. 절차는 [`제품화 TODO` 9단계](../../docs/dev/제품화_TODO.md).

시험 셸이 Git Bash 면 앞에 **`MSYS_NO_PATHCONV=1`** 을 둔다 — `/opt/cdp/auth.json` 같은
인자를 `C:/Program Files/Git/opt/…` 로 바꿔 `wsl` · `docker exec` 에 넘긴다. 컨테이너 안
`init` 이 그것 때문에 한 번 헛돌았다.
