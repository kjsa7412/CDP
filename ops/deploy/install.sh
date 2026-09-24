#!/usr/bin/env bash
# CDP 서버 설치 — 설치절차 0·2·6장을 명령 하나로. 검토 §3.3 · 제품화 TODO 3.1.
#
#   sudo bash deploy/install.sh --bind <이 서버 IP> [--port 7374] [--prefix /opt/cdp] [--user cdp] [--no-systemd] [--dry]
#
# 서버 산출물(cdp-server-v<버전>/) 안에서 돈다 — 이 파일의 부모의 부모가 산출물이다.
#
# 하는 것 (멱등 — 두 번 돌려도 같다. 있는 것은 건너뛰고 그 사실을 찍는다)
#   0  node ≥ 20 · git 확인.  없으면 무엇을 깔지 말하고 멈춘다
#   1  서비스 계정 · 폴더 (bin repos data web packages manual)
#   2  bin/ · web/ · packages/ 배치 · chown
#   3  systemd 유닛 — **command -v node 를 읽어 ExecStart 에 박는다** (203/EXEC 의 원인이 여기였다)
#   4  daemon-reload · enable --now · /healthz 확인
#   5  방화벽 명령을 **안내만** 한다 — 배포판마다 다르고, 열지 않는 것도 선택이다
#   6  첫 관리자의 부트스트랩 코드와 /setup 주소 · 다음 할 일 — git 자격(3장)은 셸, 레포 · 명부는 브라우저 콘솔
#
# 하지 않는 것 — git 자격(비밀은 브라우저를 건너지 않는다 · 검토 D8) · 명부 자체(브라우저 /setup 또는 init).
#
# Messages are Korean with an English gist so a C-locale console still reads.

set -euo pipefail

PREFIX=/opt/cdp
SVC_USER=cdp
BIND=""
PORT=7374
USE_SYSTEMD=1
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bind) BIND="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    --no-systemd) USE_SYSTEMD=0; shift ;;
    --dry) DRY=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "모르는 인자 (unknown arg): $1" >&2; exit 2 ;;
  esac
done

SRC="$(cd "$(dirname "$0")/.." && pwd)"
say()  { printf '[install] %s\n' "$*"; }
skip() { printf '[install]   건너뜀 (skip): %s\n' "$*"; }
die()  { printf '[install] 실패 (fail): %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '[install]   (dry) %s\n' "$*"; else "$@"; fi; }

[ -n "$BIND" ] || die "--bind <이 서버 IP> 가 필요하다. 프록시가 없는 배치에서 바인드가 유일한 경계다 (--bind is required)"
[ -f "$SRC/bin/ctx.mjs" ] || die "$SRC/bin/ctx.mjs 가 없다 — 서버 산출물 폴더 안에서 실행한다 (run inside cdp-server-v*/)"
[ -f "$SRC/web/index.html" ] || die "$SRC/web/index.html 이 없다 (web/ missing)"
if [ "$(id -u)" != 0 ] && [ "$DRY" = 0 ]; then die "root 로 실행한다 — sudo bash deploy/install.sh … (needs root)"; fi

# ── 0 준비물
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "node 가 없다. 20 이상을 깐다 — 설치절차 0장 (nodejs >= 20 missing: nodesource 또는 nodejs.org tarball)"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node $("$NODE_BIN" -v) — 20 이상이어야 한다 (node >= 20 required)"
command -v git >/dev/null || die "git 이 없다 — apt-get install git / dnf install git (git missing)"
say "node $("$NODE_BIN" -v) ($NODE_BIN) · $(git --version)"

# ── 1 계정 · 폴더
if id "$SVC_USER" >/dev/null 2>&1; then skip "계정 $SVC_USER 있음"; else
  say "계정 $SVC_USER 만든다 (useradd)"
  run useradd -r -m -d "$PREFIX" -s /usr/sbin/nologin "$SVC_USER"
fi
for d in bin repos data web packages manual deploy; do run mkdir -p "$PREFIX/$d"; done

# ── 2 배치 — 화면과 패키지는 **비우고 넣는다.** 자산 이름에 해시가 붙어 덮어쓰기만 하면 옛 파일이 쌓인다
say "bin/ · web/ · packages/ 배치 → $PREFIX"
run cp "$SRC"/bin/ctx.mjs "$SRC"/bin/ctx "$SRC"/bin/ctx.cmd "$PREFIX/bin/"
if [ "$DRY" = 0 ]; then rm -rf "$PREFIX/web" && mkdir -p "$PREFIX/web" && cp -r "$SRC"/web/. "$PREFIX/web/"; else printf '[install]   (dry) web/ 교체\n'; fi
if [ -d "$SRC/packages" ]; then
  if [ "$DRY" = 0 ]; then rm -rf "$PREFIX/packages" && mkdir -p "$PREFIX/packages" && cp -r "$SRC"/packages/. "$PREFIX/packages/"; else printf '[install]   (dry) packages/ 교체\n'; fi
else skip "packages/ 가 산출물에 없다 — ctx repo new 를 못 쓴다"; fi
# 설명서 — 서버가 /manual 로 낸다. 화면과 같이 비우고 넣는다
if [ -d "$SRC/manual" ]; then
  if [ "$DRY" = 0 ]; then rm -rf "$PREFIX/manual" && mkdir -p "$PREFIX/manual" && cp -r "$SRC"/manual/. "$PREFIX/manual/"; else printf '[install]   (dry) manual/ 교체\n'; fi
else skip "manual/ 이 산출물에 없다 — 설명서 페이지가 빈다"; fi
run cp "$SRC"/deploy/*.sh "$SRC"/deploy/cdp-serve.service "$SRC"/deploy/설치절차.md "$PREFIX/deploy/" 2>/dev/null || true   # 설치절차.md 는 /manual 의 「서버 설치 절차」 책이다
run chmod 755 "$PREFIX/bin/ctx" "$PREFIX/deploy/"*.sh 2>/dev/null || true
run chown -R "$SVC_USER:$SVC_USER" "$PREFIX"
# 파일이 실제로 돈다 — 번들 시각이 나와야 한다
if [ "$DRY" = 0 ]; then
  BUILT="$(sudo -u "$SVC_USER" "$NODE_BIN" "$PREFIX/bin/ctx.mjs" version | head -1)"
  say "번들 $BUILT"
fi

# ── 3 systemd 유닛 — node 경로 · bind · port · prefix 를 박는다
UNIT_SRC="$SRC/deploy/cdp-serve.service"
[ -f "$UNIT_SRC" ] || die "deploy/cdp-serve.service 가 없다"
render_unit() {
  sed \
    -e "s|^ExecStart=[^ ]*node|ExecStart=$NODE_BIN|" \
    -e "s|/opt/cdp|$PREFIX|g" \
    -e "s|--bind [^ ]*|--bind $BIND|" \
    -e "s|--port [^ ]*|--port $PORT|" \
    -e "s|^User=.*|User=$SVC_USER|" \
    -e "s|^Group=.*|Group=$SVC_USER|" \
    "$UNIT_SRC"
}
HAS_SYSTEMD=0
if [ "$USE_SYSTEMD" = 1 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then HAS_SYSTEMD=1; fi

if [ "$HAS_SYSTEMD" = 1 ]; then
  say "유닛 → /etc/systemd/system/cdp-serve.service (node $NODE_BIN · bind $BIND:$PORT)"
  if [ "$DRY" = 0 ]; then render_unit > /etc/systemd/system/cdp-serve.service; else render_unit | sed 's/^/[install]     /'; fi
else
  skip "systemd 가 없다 (또는 --no-systemd) — 유닛을 $PREFIX/deploy/cdp-serve.rendered.service 에 써 둔다. 직접 띄우려면:"
  if [ "$DRY" = 0 ]; then render_unit > "$PREFIX/deploy/cdp-serve.rendered.service"; fi
  printf '[install]     sudo -u %s %s %s/bin/ctx.mjs serve --root %s/repos --auth %s/auth.json --data %s/data --bind %s --port %s --web %s/web --packages %s/packages --mirror\n' \
    "$SVC_USER" "$NODE_BIN" "$PREFIX" "$PREFIX" "$PREFIX" "$PREFIX" "$BIND" "$PORT" "$PREFIX" "$PREFIX"
fi

# ── 4 띄우고 확인
if [ "$HAS_SYSTEMD" = 1 ] && [ "$DRY" = 0 ]; then
  systemctl daemon-reload
  systemctl enable --now cdp-serve >/dev/null
  systemctl restart cdp-serve
  say "cdp-serve 시작 — /healthz 를 기다린다 (up to 10s)"
  ok=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if "$NODE_BIN" -e "fetch('http://$BIND:$PORT/healthz').then(r=>r.json()).then(j=>{console.log('[install] healthz',JSON.stringify(j));process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" = 0 ]; then
    systemctl status cdp-serve --no-pager -l | tail -20 || true
    die "/healthz 가 10초 안에 답하지 않았다 — journalctl -u cdp-serve -n 50 (service did not come up)"
  fi
  # 첫 관리자 — 명부가 비어 있으면 서버가 일회용 코드를 남긴다. 브라우저의 설치 마법사가 그것으로 첫 관리자를 만든다.
  sleep 1
  if [ -f "$PREFIX/data/bootstrap.code" ]; then
    say ""
    say "첫 관리자가 없다 — 브라우저에서 만든다 (first admin: open the setup page in a browser):"
    printf '[install]     http://%s:%s/setup\n' "$BIND" "$PORT"
    printf '[install]     부트스트랩 코드 (bootstrap code):  %s\n' "$(cat "$PREFIX/data/bootstrap.code")"
    say "  코드는 명부가 생기면 어디서도 통하지 않는다. 셸로 하려면 아래의 init."
  fi
fi

# ── 5 방화벽 — 안내만
say "방화벽: 이 서버 밖에서 닿게 하려면 $PORT/tcp 를 연다 (firewall — run one of these yourself):"
printf '[install]     firewall-cmd --permanent --add-port=%s/tcp && firewall-cmd --reload\n' "$PORT"
printf '[install]     iptables -I INPUT -p tcp --dport %s -j ACCEPT && service iptables save\n' "$PORT"
say "  확인은 **다른 장비에서** — loopback 은 방화벽을 안 탄다: curl -s -m 5 http://$BIND:$PORT/healthz"

# ── 6 다음
cat <<EOF
[install]
[install] 끝났다 (done). 남은 것 — 셸은 git 자격 하나, 나머지는 브라우저다:
[install]   3장  git 자격      sudo -u $SVC_USER -H git config --global credential.helper 'store --file=$PREFIX/.git-credentials'   (설치절차 3장 · 비밀은 셸에서)
[install]   브라우저           http://$BIND:$PORT/setup  → 첫 관리자(위 코드) → 콘솔 /console 에서 지식 레포 · 사용자 · 토큰
[install]   셸로 하려면        sudo -u $SVC_USER $NODE_BIN $PREFIX/bin/ctx.mjs serve init --auth $PREFIX/auth.json --data $PREFIX/data --name <이름>
[install]                      sudo -u $SVC_USER $NODE_BIN $PREFIX/bin/ctx.mjs repo new $PREFIX/repos/<이름> --package dpms --packages $PREFIX/packages [--origin <url> --push]
[install]   확인               sudo -u $SVC_USER $NODE_BIN $PREFIX/bin/ctx.mjs serve doctor --root $PREFIX/repos --auth $PREFIX/auth.json --data $PREFIX/data --web $PREFIX/web --manual $PREFIX/manual --packages $PREFIX/packages --bind $BIND --port $PORT
EOF
