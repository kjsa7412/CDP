#!/usr/bin/env bash
# CDP 서버 갱신 — 관리자 설명서 8장 「갱신」 을 명령 하나로. 제품화 TODO 3.2 · v1.0 개편안 §8.2.
#
#   sudo bash upgrade.sh <cdp-server-v*.tar.gz> [--prefix /opt/cdp] [--user cdp]
#   (산출물 폴더를 이미 풀어 두었으면 그 폴더 경로도 받는다)
#
#   1  tar 를 임시 폴더에 푼다.  bin/ctx.mjs · web/index.html 이 없으면 멈춘다
#   2  되돌릴 것을 챙긴다 — bin/ctx.mjs.bak · web.bak · forms.bak · kit.bak · manual.bak (한 세대만)
#   3  ctx.mjs 교체 · web/ · forms/ · kit/ · manual/ 은 **비우고** 넣는다 · chown
#   4  재시작 · /healthz 의 built 가 새 번들 시각인지 · index 의 자산 해시가 tar 의 것과 같은지
#   5  다르면 .bak 으로 되돌리고 exit 1
#
# 명부 · 대장 · 레포 · git 자격은 **건드리지 않는다.** v1.0 의 레포에는 지식만 있다 — 작업 레포의 스킬은 서버의
# kit/ 에서 나가므로 레포를 갈 일이 없다. 작업 레포는 설치 한 줄 `--update` 로 새 kit 을 받는다(관리 › 작업 레포 「낡음」).
#
# Messages are Korean with an English gist.

set -euo pipefail

PREFIX=/opt/cdp
SVC_USER=cdp
ART=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) ART="$1"; shift ;;
  esac
done
say()  { printf '[upgrade] %s\n' "$*"; }
die()  { printf '[upgrade] 실패 (fail): %s\n' "$*" >&2; exit 1; }
[ -n "$ART" ] || die "산출물(tar.gz 또는 폴더)을 준다 (artifact path required)"
[ "$(id -u)" = 0 ] || die "root 로 실행한다 (needs root)"
[ -f "$PREFIX/bin/ctx.mjs" ] || die "$PREFIX 에 설치된 것이 없다 — install.sh 먼저 (not installed)"
NODE_BIN="$(command -v node)" || die "node 가 없다"
HAS_SYSTEMD=0
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && systemctl list-unit-files cdp-serve.service >/dev/null 2>&1; then HAS_SYSTEMD=1; fi
UNIT=""
[ "$HAS_SYSTEMD" = 1 ] && UNIT="$(systemctl cat cdp-serve 2>/dev/null || true)"
unit_arg() { printf '%s' "$UNIT" | grep -o -- "--$1 [^ \\]*" | awk '{print $2}' | head -1 || true; }
# serve.json(제품화 2 F5) — install.sh v1.2 부터 유닛은 --config 하나다. 값은 거기서 읽는다
conf_arg() { [ -f "$PREFIX/serve.json" ] && "$NODE_BIN" -p "(JSON.parse(require('fs').readFileSync('$PREFIX/serve.json','utf8'))['$1'] ?? '')" 2>/dev/null || true; }
# `ctx version` 첫 줄 — v1.2 부터 「v<판> · 빌드 <시각>」. healthz.built 와 견줄 것은 시각이다(옛 번들은 시각만 찍는다)
stamp_of() { "$NODE_BIN" "$1" version | head -1 | sed -e 's/^v[^ ]* · 빌드 //' -e 's/^v[^ ]* · 원본 실행.*$/__CTX_BUILT__/'; }

# 통째로 갈아 끼우는 폴더 — 자산 이름에 해시가 붙어 덮어쓰기만 하면 옛 파일이 쌓인다
DIRS="web forms kit manual"

# ── 1 푼다
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -d "$ART" ]; then NEW="$ART"; else
  tar -xzf "$ART" -C "$TMP" || die "tar 를 풀 수 없다 — $ART"
  # tar 는 폴더 한 단(cdp-server-v<버전>/)을 감싼다 — 그 한 폴더가 산출물이다
  NEW="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[ -n "$NEW" ] && [ -f "$NEW/bin/ctx.mjs" ] || die "산출물 안에 bin/ctx.mjs 가 없다 (bin/ctx.mjs missing in artifact)"
[ -f "$NEW/web/index.html" ] || die "산출물 안에 web/index.html 이 없다 (web/ missing)"
NEW_BUILT="$(stamp_of "$NEW/bin/ctx.mjs")"
NEW_ASSET="$(grep -o 'assets/index-[^"]*js' "$NEW/web/index.html" | head -1 || true)"
OLD_BUILT="$(stamp_of "$PREFIX/bin/ctx.mjs" || echo '?')"
say "지금 $OLD_BUILT → 새것 $NEW_BUILT · 화면 ${NEW_ASSET:-?}"

# ── 2 되돌릴 것 (한 세대)
cp "$PREFIX/bin/ctx.mjs" "$PREFIX/bin/ctx.mjs.bak"
for d in $DIRS; do
  rm -rf "$PREFIX/$d.bak"
  [ -d "$PREFIX/$d" ] && cp -r "$PREFIX/$d" "$PREFIX/$d.bak"
done

restore() {
  say "되돌린다 (rolling back)"
  [ "$HAS_SYSTEMD" = 1 ] && systemctl stop cdp-serve || true
  cp "$PREFIX/bin/ctx.mjs.bak" "$PREFIX/bin/ctx.mjs"
  for d in $DIRS; do
    if [ -d "$PREFIX/$d.bak" ]; then rm -rf "$PREFIX/$d"; mv "$PREFIX/$d.bak" "$PREFIX/$d"; fi
  done
  chown -R "$SVC_USER:$SVC_USER" "$PREFIX/bin" 2>/dev/null || true
  for d in $DIRS; do chown -R "$SVC_USER:$SVC_USER" "$PREFIX/$d" 2>/dev/null || true; done
  if [ "$HAS_SYSTEMD" = 1 ]; then systemctl start cdp-serve || true; fi
}

# ── 3 갈아 끼운다 — 폴더째 지운다 (`*` 는 점 파일을 빠뜨리고 옛 index 가 남으면 없는 자산을 찾는다)
cp "$NEW"/bin/ctx.mjs "$NEW"/bin/ctx "$NEW"/bin/ctx.cmd "$PREFIX/bin/" 2>/dev/null || cp "$NEW/bin/ctx.mjs" "$PREFIX/bin/"
for d in $DIRS; do
  if [ -d "$NEW/$d" ]; then rm -rf "$PREFIX/$d" && mkdir -p "$PREFIX/$d" && cp -r "$NEW/$d/." "$PREFIX/$d/"; fi
done
# 설치절차.md 도 — 서버의 /manual 페이지가 <prefix>/deploy/설치절차.md 를 「서버 설치 절차」 책으로 낸다
if [ -d "$NEW/deploy" ]; then mkdir -p "$PREFIX/deploy" && cp "$NEW"/deploy/*.sh "$NEW"/deploy/cdp-serve.service "$NEW"/deploy/설치절차.md "$PREFIX/deploy/" 2>/dev/null || true; fi
chmod 755 "$PREFIX/bin/ctx" 2>/dev/null || true
# 셸 명령 cdp — install.sh 가 놓은 것이 있으면 지금 모양으로 다시 쓴다(못 들어가는 폴더에서 부르면 설치 폴더로 옮겨 부른다)
if [ -f /usr/local/bin/cdp ] && [ -w /usr/local/bin/cdp ]; then
  cat > /usr/local/bin/cdp <<EOF
#!/bin/sh
# CDP 서버 명령 — install.sh 가 만든다. 설정은 $PREFIX/serve.json
if [ "\$(id -un)" = "$SVC_USER" ]; then exec "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "\$@"; fi
# 서비스 계정이 지금 폴더에 못 들어가면(root 의 /root 등) 그 안에서 부르는 git 이 실패한다 — 설치 폴더에서 부른다
sudo -u "$SVC_USER" test -x . 2>/dev/null || cd "$PREFIX"
exec sudo -u "$SVC_USER" -H "$NODE_BIN" "$PREFIX/bin/ctx.mjs" "\$@"
EOF
  chmod 755 /usr/local/bin/cdp
fi
chown -R "$SVC_USER:$SVC_USER" "$PREFIX/bin" "$PREFIX/deploy" 2>/dev/null || true
for d in $DIRS; do chown -R "$SVC_USER:$SVC_USER" "$PREFIX/$d" 2>/dev/null || true; done

# ── 4 재시작 · 확인
if [ "$HAS_SYSTEMD" = 1 ]; then
  systemctl restart cdp-serve
  # 유닛에서 bind · port 를 읽어 healthz 를 친다
  BIND="$(conf_arg bind)"; [ -n "$BIND" ] || BIND="$(unit_arg bind)"
  PORT="$(conf_arg port)"; [ -n "$PORT" ] || PORT="$(unit_arg port)"
  BIND="${BIND:-127.0.0.1}"; PORT="${PORT:-7374}"
  GOT=""
  for i in 1 2 3 4 5 6 7 8 9 10; do
    GOT="$("$NODE_BIN" -e "fetch('http://$BIND:$PORT/healthz').then(r=>r.json()).then(j=>console.log(j.built)).catch(()=>process.exit(1))" 2>/dev/null || true)"
    [ -n "$GOT" ] && break
    sleep 1
  done
  if [ "$GOT" != "$NEW_BUILT" ]; then
    say "healthz.built '$GOT' ≠ 새 번들 '$NEW_BUILT'"
    restore
    die "새것이 뜨지 않았다 — 되돌렸다. journalctl -u cdp-serve -n 50 (new bundle did not come up; rolled back)"
  fi
  say "healthz.built = $GOT ✓"
else
  say "systemd 유닛이 없다 — 파일만 갈아 끼웠다. 서버를 직접 다시 띄운다 (no systemd: restart the process yourself)"
fi
GOT_ASSET="$(grep -o 'assets/index-[^"]*js' "$PREFIX/web/index.html" | head -1 || true)"
if [ -n "$NEW_ASSET" ] && [ "$GOT_ASSET" != "$NEW_ASSET" ]; then
  restore
  die "화면 자산이 다르다 ($GOT_ASSET ≠ $NEW_ASSET) — 되돌렸다 (web assets mismatch; rolled back)"
fi
say "화면 자산 $GOT_ASSET ✓"
say "끝났다 (done). 브라우저는 강제 새로고침(Ctrl+Shift+R). 되돌릴 것: $PREFIX/bin/ctx.mjs.bak · web.bak · forms.bak · kit.bak · manual.bak (한 세대)"
# 에이전트 세팅(kit)이 바뀌었나 — 바뀌었으면 사람들이 할 한 줄을 말한다(제품화 2 ④). 안 바뀌었으면 말하지 않는다
if [ -d "$PREFIX/kit.bak" ] && ! diff -rq "$PREFIX/kit.bak" "$PREFIX/kit" >/dev/null 2>&1; then
  say "에이전트 세팅(kit)이 바뀌었다 — 각 PC 에서 한 줄(작업 레포 · 큐레이터 폴더 전부):"
  say "    설치기 --update [--commit]   (화면 「시작하기」 · 연결된 작업 레포 에 같은 줄이 있다)"
fi
command -v cdp >/dev/null 2>&1 && say "확인: cdp serve doctor"
# v0.x 에서 올라왔으면 — 옛 도구 층이 남은 레포는 진단(ctx serve doctor)이 알린다. 서버를 멈추고 ctx migrate <레포>
[ -d "$PREFIX/packages" ] && say "v1.0 은 $PREFIX/packages 를 쓰지 않는다 — 확인 뒤 지워도 된다 (packages/ is unused since v1.0)"
exit 0
