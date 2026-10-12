#!/usr/bin/env bash
# CDP 팀 서버 설치 — 한 줄로 끝까지. 제품화 2 검토 §5.2 · TODO ④(결정 D7).
#
#   sudo bash deploy/install.sh --bind <이 서버 IP> \
#        [--admin <아이디> [--label "<이름 · 소속>"]] \
#        [--repo <레포 이름> [--origin <빈 git 프로젝트 url>]] \
#        [--ssh | --pat-stdin --git-host <호스트[:포트]> --git-user <계정>] \
#        [--port 7374] [--prefix /opt/cdp] [--user cdp] [--no-systemd] [--dry]
#
#   root 없이 — bash deploy/install.sh --bind 127.0.0.1 --prefix ~/cdp-server …   (계정 · systemd 없이 · 실행 줄을 알려 준다)
#
# 서버 산출물(cdp-server-v<버전>/) 안에서 돈다 — 이 파일의 부모의 부모가 산출물이다.
#
# 하는 것 (멱등 — 두 번 돌려도 같다. 있는 것은 건너뛰고 그 사실을 찍는다)
#   0  node ≥ 20 · git 확인
#   1  서비스 계정 · 폴더 · 배치(bin web forms kit manual deploy)
#   2  serve.json — 서버 설정 한 장(root · auth · data · web · bind · port). 유닛 · cdp 명령이 같은 장을 읽는다
#   3  /usr/local/bin/cdp — 서비스 계정으로 ctx 를 부르는 한 줄(플래그 없이 `cdp serve doctor` · `cdp serve user add …`)
#   4  systemd 유닛 · 띄우기 · /healthz
#   5  --admin    첫 관리자 + 토큰(원문은 여기서 한 번). 없으면 브라우저 /setup 의 부트스트랩 코드
#      --ssh | --pat-stdin   origin 자격(비밀은 셸에서만 — 검토 D8)
#      --repo     첫 지식 레포(빈 틀) · --origin 이면 첫 커밋을 보낸다
#      doctor     준비물 검사
#   6  다음 할 일 — 해낸 것은 빼고 남은 것만
#
# 하지 않는 것 — 방화벽(배포판마다 다르다 · 명령만 알려 준다) · GitLab 프로젝트 만들기(사람이 웹에서).
#
# Messages are Korean with an English gist so a C-locale console still reads.

set -euo pipefail

PREFIX=/opt/cdp
SVC_USER=cdp
BIND=""
PORT=7374
USE_SYSTEMD=1
DRY=0
ADMIN=""
LABEL=""
REPO=""
ORIGIN=""
GIT_MODE=""
GIT_HOST=""
GIT_USER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --bind) BIND="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    --no-systemd) USE_SYSTEMD=0; shift ;;
    --dry) DRY=1; shift ;;
    --admin) ADMIN="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    --ssh) GIT_MODE=ssh; shift ;;
    --pat-stdin) GIT_MODE=pat; shift ;;
    --git-host) GIT_HOST="$2"; shift 2 ;;
    --git-user) GIT_USER="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,27p' "$0"; exit 0 ;;
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
[ -z "$ORIGIN" ] || [ -n "$REPO" ] || die "--origin 은 --repo 와 같이 준다 (--origin needs --repo)"
if [ "$GIT_MODE" = pat ]; then [ -n "$GIT_HOST" ] && [ -n "$GIT_USER" ] || die "--pat-stdin 은 --git-host · --git-user 와 같이 (PAT on stdin needs host and user)"; fi

# root 가 아니면 **사용자 모드** — 계정을 만들지 않고 지금 사람으로 · 시스템 유닛 없이(제품화 2 F4).
# 전에는 --prefix 를 홈으로 줘도 root 를 요구했다
ROOT_MODE=1
if [ "$(id -u)" != 0 ]; then
  ROOT_MODE=0
  SVC_USER="$(id -un)"
  USE_SYSTEMD=0
  case "$PREFIX" in /opt/*|/usr/*|/srv/*) [ "$DRY" = 1 ] || die "root 가 아니면 --prefix 를 쓸 수 있는 자리로 준다 — 예: --prefix ~/cdp-server (or run with sudo)";; esac
fi
PREFIX="$(mkdir -p "$PREFIX" 2>/dev/null && cd "$PREFIX" && pwd || echo "$PREFIX")"
AUTH="$PREFIX/auth.json"
DATA="$PREFIX/data"

# ── 0 준비물
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "node 가 없다. 20 이상을 깐다 — 설치절차 0장 (nodejs >= 20 missing: nodesource 또는 nodejs.org tarball)"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node $("$NODE_BIN" -v) — 20 이상이어야 한다 (node >= 20 required)"
command -v git >/dev/null || die "git 이 없다 — apt-get install git / dnf install git (git missing)"
say "node $("$NODE_BIN" -v) ($NODE_BIN) · $(git --version)"

# ── 1 계정 · 폴더 · 배치
if [ "$ROOT_MODE" = 1 ]; then
  if id "$SVC_USER" >/dev/null 2>&1; then skip "계정 $SVC_USER 있음"; else
    say "계정 $SVC_USER 만든다 (useradd)"
    run useradd -r -m -d "$PREFIX" -s /usr/sbin/nologin "$SVC_USER"
  fi
fi
for d in bin repos data web forms kit manual deploy; do run mkdir -p "$PREFIX/$d"; done

# 화면 · 서식집 · kit · 설명서는 **비우고 넣는다.** 자산 이름에 해시가 붙어 덮어쓰기만 하면 옛 파일이 쌓인다
say "bin/ · web/ · forms/ · kit/ · manual/ 배치 → $PREFIX"
run cp "$SRC"/bin/ctx.mjs "$SRC"/bin/ctx "$SRC"/bin/ctx.cmd "$PREFIX/bin/"
for d in web forms kit manual; do
  if [ -d "$SRC/$d" ]; then
    if [ "$DRY" = 0 ]; then rm -rf "${PREFIX:?}/$d" && mkdir -p "$PREFIX/$d" && cp -r "$SRC/$d/." "$PREFIX/$d/"; else printf '[install]   (dry) %s/ 교체\n' "$d"; fi
  else
    case "$d" in
      forms) skip "forms/ 가 산출물에 없다 — 서식에서 새 관리 문서를 세울 수 없다" ;;
      kit) skip "kit/ 이 산출물에 없다 — 설치 한 줄이 빈 kit 을 낸다" ;;
      manual) skip "manual/ 이 산출물에 없다 — 설명서 페이지가 빈다" ;;
    esac
  fi
done
# 설치절차.md 는 /manual 의 「서버 설치 절차」 책이다 — 빠지면 조용히 넘어가지 않는다(제품화 2 S1)
run cp "$SRC"/deploy/*.sh "$SRC"/deploy/cdp-serve.service "$PREFIX/deploy/"
if [ -f "$SRC/deploy/설치절차.md" ]; then run cp "$SRC/deploy/설치절차.md" "$PREFIX/deploy/"; else say "⚠ deploy/설치절차.md 가 산출물에 없다 — 설명서의 「서버 설치 절차」 책이 빈다"; fi
run chmod 755 "$PREFIX/bin/ctx" "$PREFIX"/deploy/*.sh

# ── 2 serve.json — 설정 한 장. 있으면 bind · port 만 고친다(사람이 더한 칸은 둔다)
CONF="$PREFIX/serve.json"
say "설정 → $CONF (bind $BIND:$PORT)"
if [ "$DRY" = 0 ]; then
  "$NODE_BIN" -e '
    const fs = require("fs"); const [f, prefix, bind, port] = process.argv.slice(1)
    let c = {}; try { c = JSON.parse(fs.readFileSync(f, "utf8")) } catch {}
    c = { root: prefix + "/repos", auth: prefix + "/auth.json", data: prefix + "/data", web: prefix + "/web", manual: prefix + "/manual", mirror: true, ...c, bind, port: Number(port) }
    fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n")' "$CONF" "$PREFIX" "$BIND" "$PORT"
fi
[ "$ROOT_MODE" = 1 ] && run chown -R "$SVC_USER:$SVC_USER" "$PREFIX"

# ── 3 cdp — 서비스 계정으로 ctx 를 부른다. 설정은 serve.json 이 준다(플래그 없이)
if [ "$ROOT_MODE" = 1 ]; then
  CDP=/usr/local/bin/cdp
  say "명령 → $CDP  (cdp serve doctor · cdp serve user add … · cdp repo new <이름>)"
  if [ "$DRY" = 0 ]; then
    cat > "$CDP" <<EOF
#!/bin/sh
# CDP 서버 명령 — install.sh 가 만든다. 설정은 $CONF
if [ "\$(id -un)" = "$SVC_USER" ]; then exec "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "\$@"; fi
# 서비스 계정이 지금 폴더에 못 들어가면(root 의 /root 등) 그 안에서 부르는 git 이 실패한다 — 설치 폴더에서 부른다
sudo -u "$SVC_USER" test -x . 2>/dev/null || cd "$PREFIX"
exec sudo -u "$SVC_USER" -H "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "\$@"
EOF
    chmod 755 "$CDP"
  fi
  cdp() { sudo -u "$SVC_USER" -H env CDP_QUIET_NEXT="${CDP_QUIET_NEXT:-}" "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "$@"; }
  CMD=cdp
else
  CDP="$PREFIX/bin/ctx"
  cdp() { env CDP_QUIET_NEXT="${CDP_QUIET_NEXT:-}" "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "$@"; }
  CMD="$PREFIX/bin/ctx"
fi
if [ "$DRY" = 0 ]; then say "번들 $(cdp version | head -1)"; fi

# ── 4 systemd 유닛 — node 경로 · prefix 를 박는다. bind · port 는 serve.json 에 있다
UNIT_SRC="$SRC/deploy/cdp-serve.service"
[ -f "$UNIT_SRC" ] || die "deploy/cdp-serve.service 가 없다"
render_unit() {
  sed \
    -e "s|^ExecStart=[^ ]*node|ExecStart=$NODE_BIN|" \
    -e "s|/opt/cdp|$PREFIX|g" \
    -e "s|^User=.*|User=$SVC_USER|" \
    -e "s|^Group=.*|Group=$SVC_USER|" \
    "$UNIT_SRC"
}
HAS_SYSTEMD=0
if [ "$USE_SYSTEMD" = 1 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then HAS_SYSTEMD=1; fi

if [ "$HAS_SYSTEMD" = 1 ]; then
  say "유닛 → /etc/systemd/system/cdp-serve.service (node $NODE_BIN · serve --config $CONF)"
  if [ "$DRY" = 0 ]; then render_unit > /etc/systemd/system/cdp-serve.service; else render_unit | sed 's/^/[install]     /'; fi
fi

UP=0
if [ "$HAS_SYSTEMD" = 1 ] && [ "$DRY" = 0 ]; then
  systemctl daemon-reload
  systemctl enable --now cdp-serve >/dev/null
  systemctl restart cdp-serve
  say "cdp-serve 시작 — /healthz 를 기다린다 (up to 10s)"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if "$NODE_BIN" -e "fetch('http://$BIND:$PORT/healthz').then(r=>r.json()).then(j=>{console.log('[install] healthz',JSON.stringify(j));process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; then UP=1; break; fi
    sleep 1
  done
  if [ "$UP" = 0 ]; then
    systemctl status cdp-serve --no-pager -l | tail -20 || true
    die "/healthz 가 10초 안에 답하지 않았다 — journalctl -u cdp-serve -n 50 (service did not come up)"
  fi
elif [ "$DRY" = 0 ]; then
  skip "systemd 없이 — 서버는 이 한 줄로 띄운다(로그인 때 뜨게 하려면 그 OS 의 서비스에 건다):"
  printf '[install]     %s %s/bin/ctx.mjs serve --config %s\n' "$NODE_BIN" "$PREFIX" "$CONF"
fi

# ── 5 첫 관리자 · git 자격 · 첫 레포 · doctor — 준 것만 한다
TOKEN=""
SSH_LATER=""
if [ -n "$ADMIN" ] && [ "$DRY" = 0 ]; then
  if "$NODE_BIN" -e "const j=(()=>{try{return JSON.parse(require('fs').readFileSync('$AUTH','utf8')||'{}')}catch{return {}}})();process.exit((j.users||[]).length?0:1)"; then
    skip "명부가 이미 있다 — 첫 관리자는 만들지 않는다(사람은 콘솔 › 사람)"
  else
    if [ -n "$LABEL" ]; then TOKEN="$(cdp serve init --name "$ADMIN" --label "$LABEL" 2>/dev/null)"; else TOKEN="$(cdp serve init --name "$ADMIN" 2>/dev/null)"; fi
    [ -n "$TOKEN" ] || die "첫 관리자를 만들지 못했다 — cdp serve init --name $ADMIN 를 직접 돌려 본다"
    say "첫 관리자 $ADMIN — 토큰은 아래 한 줄, **다시 볼 수 없다**(로그인 · CDP_TOKEN 에 쓴다):"
    printf '\n    %s\n\n' "$TOKEN"
  fi
fi

if [ -n "$GIT_MODE" ] && [ "$DRY" = 0 ]; then
  if [ "$GIT_MODE" = ssh ]; then
    say "git 자격 — SSH 배포 키(공개 키를 GitLab 프로젝트 › Deploy keys 에 쓰기 권한으로 넣는다)"
    cdp serve git-auth --ssh || say "⚠ SSH 키를 만들지 못했다 — cdp serve git-auth --ssh"
  else
    say "git 자격 — PAT(표준 입력) → $GIT_USER@$GIT_HOST"
    cdp serve git-auth --host "$GIT_HOST" --user "$GIT_USER" || die "PAT 를 두지 못했다 — cdp serve git-auth --host $GIT_HOST --user $GIT_USER"
  fi
fi

if [ -n "$REPO" ] && [ "$DRY" = 0 ]; then
  if [ -f "$PREFIX/repos/$REPO/_vocab.md" ]; then skip "레포 $REPO 있음"; else
    # SSH 배포 키는 방금 만들어 아직 GitLab 에 없다 — 지금 보내면 반드시 실패한다. 레포만 세우고 이을 한 줄을 남긴다
    if [ "$GIT_MODE" = ssh ] && [ -n "$ORIGIN" ]; then
      say "첫 지식 레포 $REPO — origin 은 공개 키를 GitLab 에 넣은 뒤 잇는다"
      CDP_QUIET_NEXT=1 cdp repo new "$REPO"
      RUNAS=""; [ "$ROOT_MODE" = 1 ] && RUNAS="sudo -u $SVC_USER -H "
      SSH_LATER="${RUNAS}git -C $PREFIX/repos/$REPO remote add origin $ORIGIN && ${RUNAS}git -C $PREFIX/repos/$REPO push -u origin HEAD   (또는 콘솔 › 지식 레포 「origin 연결」)"
    elif [ -n "$ORIGIN" ]; then
      say "첫 지식 레포 $REPO → $ORIGIN (첫 커밋을 보낸다)"
      CDP_QUIET_NEXT=1 cdp repo new "$REPO" --origin "$ORIGIN" || say "⚠ push 가 안 됐다 — 위 줄을 본다(자격 · 빈 프로젝트인지)"
    else
      say "첫 지식 레포 $REPO"
      CDP_QUIET_NEXT=1 cdp repo new "$REPO"
    fi
  fi
fi

if [ "$DRY" = 0 ]; then
  say "준비물 검사 — serve doctor"
  cdp serve doctor || true
fi

# ── 6 다음 — 해낸 것은 빼고
step=0
next() { step=$((step + 1)); printf '[install]   %d. %s\n' "$step" "$*"; }
say ""
say "끝났다 (done). 다음 —"
if [ "$UP" = 1 ] || [ "$HAS_SYSTEMD" = 1 ]; then
  next "방화벽 — 밖에서 닿게 하려면 $PORT/tcp 를 연다:  firewall-cmd --permanent --add-port=$PORT/tcp && firewall-cmd --reload   (다른 장비에서 curl -s http://$BIND:$PORT/healthz)"
fi
if [ -z "$TOKEN" ] && [ -f "$DATA/bootstrap.code" ]; then
  next "첫 관리자 — 브라우저 http://$BIND:$PORT/setup 에 코드 $(cat "$DATA/bootstrap.code")   (셸로: sudo bash deploy/install.sh … --admin <아이디>)"
else
  next "브라우저 http://$BIND:$PORT/login — 위 토큰으로. 콘솔 「시작하기」 가 남은 일을 줄마다 알려 준다"
fi
[ -z "$SSH_LATER" ] || next "공개 키(위)를 GitLab 프로젝트 › Deploy keys 에 쓰기 권한으로 넣고 origin 을 잇는다 — $SSH_LATER"
[ -n "$GIT_MODE" ] || [ -n "$ORIGIN" ] || next "origin 자격(레포를 GitLab 에 미러할 때) — $CMD serve git-auth --host <호스트> --user <계정>  또는  --ssh"
[ -n "$REPO" ] || next "첫 지식 레포 — 콘솔 › 지식 레포 [새 레포]  또는  $CMD repo new <이름> [--origin <빈 프로젝트 url>]"
next "사람 · 큐레이터 — 콘솔 › 사람  (셸: $CMD serve user add <아이디> --role writer --curate <레포>)"
next "팀원 PC — 각자 화면 「연결된 작업 레포」 의 한 줄(토큰을 물으면 붙인다 · Claude Code 를 다시 켠다)"
say ""
say "명령은 $CDP 하나 — $CMD serve doctor · $CMD serve user list · $CMD repo new <이름> (설정 $CONF)"
