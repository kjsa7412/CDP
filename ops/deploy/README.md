# deploy — 모드 B 서버 올리기

설계 [`CDP_MCP_설계서 v1.1 §9.4`](../../docs/design/CDP_MCP_설계서_v1.0.md) ·
확정값 [`MCP_0단계_결정`](../../docs/dev/MCP_0단계_결정.md)

> **실제로 올릴 때는 [`설치절차.md`](설치절차.md) 를 따른다.** 순서와 확인이
> 거기 있다. 이 문서는 참조 — 무엇을 왜 그렇게 했는지다.
>
> 사내 배치 하나에 맞춘 실물이다. 다른 배치로 가면 §9.4 의 일반형
> (LaunchAgent · Caddy · Cloudflare Tunnel)을 본다.

---

## 확정된 배치

| | |
|---|---|
| 서버 | `10.10.20.188` · 사내 Linux |
| 접속 | `http://10.10.20.188:7374` — **프록시 없음 · 평문** |
| origin | `git@10.10.20.250:soln1/cdp.git` — 사내 GitLab · **SSH** |
| push 자격 | **Deploy Key (SSH)** — 그 레포 push 만 |
| 레포 | `gdi` 하나 (`<root>/gdi`) |

### 프록시가 없다는 것의 뜻

§4.3 은 "TLS · 레이트리밋 · IP 제한은 프록시가 한다" 였다. **이 배치에는 프록시가
없으므로 그 셋이 없다.** 받아들이고 가는 것이고, 대신 이렇게 좁힌다 —

| | |
|---|---|
| 토큰 | 사내망을 **평문으로** 흐른다. 망을 믿는 것이 전제다 |
| 바인드 | `0.0.0.0` 이 아니라 `10.10.20.188` 하나에만. 다른 인터페이스로는 안 뜬다 |
| Origin | 루프백이 아닌 `Origin` 헤더는 403(§8). 브라우저에서 찌르는 길은 막혀 있다 |
| 레이트리밋 | 없다. 사내 사용자 2~5명 규모라 두지 않는다 |
| claude.ai 커넥터 | **불가능하다.** 공개 HTTPS 가 아니다 — §5.3 의 미검증 항목은 이 배치에서 해당 없음 |

---

## 1. 준비 (한 번)

```bash
sudo useradd -r -m -d /opt/cdp -s /usr/sbin/nologin cdp
sudo mkdir -p /opt/cdp/{bin,repos,data}
sudo chown -R cdp:cdp /opt/cdp

node --version        # 20 이상이어야 한다. cdp.exe 는 서버 모드를 지원하지 않는다
git --version         # 서버가 clone · commit · push 를 직접 한다
command -v node       # systemd 유닛의 ExecStart 와 같아야 한다
```

서버에 올리는 것은 **둘뿐**이다 — `npm run build:ctx` 가 만든 `ops/out/ctx/ctx.mjs`
(MCP SDK · zod · core 가 다 들어 있다)와 `npm run build` 가 만든 `ops/out/web/`(화면).
서버에 `node_modules` 는 필요 없다.

## 2. git 자격 — Deploy Key (SSH)

서버가 origin 으로 push 할 자격이다. **커밋 `author` 와는 다른 것** — author 는
CDP 토큰의 사용자로 서버가 채우므로(§4.5) 누가 정했는지는 사람별로 남고, 여기서
정하는 것은 **누가 보냈나** 뿐이다.

```bash
sudo -u cdp -H mkdir -p /opt/cdp/.ssh && sudo -u cdp -H chmod 700 /opt/cdp/.ssh
sudo -u cdp -H ssh-keygen -t ed25519 -N '' -f /opt/cdp/.ssh/id_ed25519
sudo cat /opt/cdp/.ssh/id_ed25519.pub        # → GitLab Deploy Keys 에 붙여넣는다
sudo -u cdp -H sh -c 'ssh-keyscan -H 10.10.20.250 >> /opt/cdp/.ssh/known_hosts'
```

- **이 GitLab 은 12.9 미만**이라 PAT 에 `write_repository` 스코프가 없다. push 가
  되는 스코프는 `api` 하나인데 그것은 **계정 전체**(모든 그룹·프로젝트 읽기·쓰기)를
  연다 — 서버 평문 파일에 두기엔 너무 넓다.
- **Deploy Key 는 그 레포에 push 하는 것 하나만** 할 수 있다. 사람 계정과 무관해서
  담당자가 바뀌어도 미러가 멈추지 않고, SSH 라 자격이 평문으로 흐르지 않는다.
- 등록할 때 **`Write access allowed` 체크**가 핵심이다. 안 누르면 clone 은 되고
  push 만 막히는데, 그 증상은 `mirror: lag` 뿐이라 원인이 안 드러난다.
- `ssh-keyscan` 을 빠뜨리면 systemd 밑에서 host key 확인 프롬프트를 답할 사람이
  없어 `push` 가 영영 기다린다.

## 3. 레포

```bash
sudo -u cdp -H git clone git@10.10.20.250:soln1/cdp.git /opt/cdp/repos/gdi
```

폴더명이 곧 레포 이름이다(§4.2). **`cdp` 가 아니라 `gdi` 로 받는다** — 로컬
작업 트리의 폴더명(`C:\cdp`)과 다른 것이 정상이다.

> 서버 트리에서 **사람이 커밋하지 않는다.** 서버가 유일한 작성자다(§4.2).
> 사람은 origin 을 읽기 전용으로 clone 해서 본다.

## 4. 명부와 토큰

```bash
CTX="sudo -u cdp node /opt/cdp/bin/ctx.mjs serve"
A=/opt/cdp/auth.json

$CTX user add --auth $A --name kjsa --label "사경진 · 개발" --repos gdi --write --data /opt/cdp/data
$CTX token   --auth $A --user kjsa --note "노트북" --data /opt/cdp/data    # 원문은 여기서 한 번만
$CTX user list --auth $A --data /opt/cdp/data

sudo chmod 600 $A
```

**발급 엔드포인트는 없다**(§4.4.1). 여기 셸이 있는 사람만 발급할 수 있고, 원문은
받는 사람에게 직접 전한다 — 메신저·메일에 남기지 않는다(§4.4.2).

## 5. systemd

`cdp-serve.service` 를 `/etc/systemd/system/` 에 둔다.

```bash
sudo cp ops/deploy/cdp-serve.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cdp-serve
sudo systemctl status cdp-serve
```

확인 —

```bash
curl -s http://10.10.20.188:7374/healthz
curl -s -H "Authorization: Bearer <토큰>" http://10.10.20.188:7374/repos
```

`/healthz` 는 인증 없이 열린다(§4.3). **레포 이름은 싣지 않는다** — 집계까지다.

## 6. 운영 (§9.4)

| | |
|---|---|
| 감시 | `GET /healthz` 를 ops 봇 목록에 추가. 레포별 지연은 감시용 토큰으로 `GET /repos` |
| 로그 | `/opt/cdp/data/logs/serve.log` 3×1MB 회전 · `auth.log` 는 회전하지 않는다(이력) |
| 백업 | `--mirror` + `/opt/cdp/repos` 디스크 스냅샷 |
| 토큰 | 기본 90일. 분기마다 회전 — 새로 발급 → `CDP_TOKEN` 교체 → 옛것 `revoke` |
| 갱신 | `bin/ctx.mjs` 교체 후 `systemctl restart cdp-serve` · `/healthz.built` 로 확인 |
| 권한 | `auth.json` 0600 · `/opt/cdp/.ssh` 700 · 키 600 |

## 7. 막혔을 때

| 증상 | 볼 곳 |
|---|---|
| 시작하자마자 죽는다 | `journalctl -u cdp-serve -n 50` · `--auth` 경로 · Node 버전 · `ExecStart` 가 실제 node 경로인가(`203/EXEC`) |
| `거부: --bind … 인증 없이 밖으로 열 수 없다` | `--auth` 가 빠졌다. 루프백 밖은 인증 없이 못 연다(§8) |
| `mirror: lag` 가 안 풀린다 | 서버가 `10.10.20.250:2900` 에 닿는가 · Deploy Key 가 지워졌나 |
| 401 인데 토큰은 맞다 | 만료 · 명부에서 지워짐 · `active:false`. `serve user list` 로 본다 |
| 레포가 안 보인다 | 폴더에 `_vocab.md` 가 있는가 · 목록 갱신은 60초 주기 |
