#!/usr/bin/env bash
# CDP 서버 갱신 — 설치절차 10장 「고친 뒤 다시 올리기」 ①②③ 을 명령 하나로. 제품화 TODO 3.2.
#
#   sudo bash upgrade.sh <cdp-server-v*.tar.gz> [--prefix /opt/cdp] [--user cdp] [--no-kit]
#   (산출물 폴더를 이미 풀어 두었으면 그 폴더 경로도 받는다)
#
#   1  tar 를 임시 폴더에 푼다.  bin/ctx.mjs · web/index.html 이 없으면 멈춘다
#   2  되돌릴 것을 챙긴다 — bin/ctx.mjs.bak · web.bak · packages.bak · manual.bak (한 세대만)
#   3  ctx.mjs 교체 · web/ 은 **비우고** 넣는다 · packages/ · manual/ 도 · chown
#   4  멈춘다 → **에이전트 세팅 갱신**(ctx serve kit-refresh — 레포마다 스킬 · 도구 · 훅을 새 판으로 한 커밋) → 켠다
#      · /healthz 의 built 가 새 번들 시각인지 · index 의 자산 해시가 tar 의 것과 같은지
#   5  다르면 .bak 으로 되돌리고 **에이전트 세팅도 옛 판으로 한 번 더** 갈고 exit 1
#
# 명부 · 대장 · git 자격은 **건드리지 않는다.** 레포는 도구 층만 간다 — 지식(_vocab · _managed · docs · work)은
# 그대로다. 작업 레포에 가는 스킬은 레포 안의 .claude/skills 에서 나오므로, 이것을 안 갈면 작업 레포가
# 설치 한 줄을 다시 돌려도 옛 스킬을 받는다(에이전트 세팅 갱신 TODO T7). --no-kit 이면 건너뛴다.
#
# Messages are Korean with an English gist.

set -euo pipefail

PREFIX=/opt/cdp
SVC_USER=cdp
ART=""
KIT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --user) SVC_USER="$2"; shift 2 ;;
    --no-kit) KIT=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
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
REPOS="$(unit_arg root)"; REPOS="${REPOS:-$PREFIX/repos}"
# 유닛에 --mirror 가 없으면 서버가 origin 에 안 보내는 배치다 — 갱신 커밋도 보내지 않는다
PUSH_FLAG="--no-push"
printf '%s' "$UNIT" | grep -q -- '--mirror' && PUSH_FLAG=""

# 서비스 사용자로 — HOME 이 그 사람의 것이어야 git 자격(~/.git-credentials · 전역 설정)이 잡힌다
as_svc() {
  if command -v sudo >/dev/null 2>&1; then sudo -u "$SVC_USER" -H "$@"
  else runuser -u "$SVC_USER" -- env HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)" "$@"; fi
}

# 에이전트 세팅 — 레포마다 도구 층을 지금 packages/ 의 판으로. **실패해도 upgrade 를 멈추지 않는다** —
# 서버 판은 올라갔고, 건너뛴 레포는 콘솔 › 지식 레포에 「다름」 으로 남아 거기서 [에이전트 세팅 갱신] 을 누른다.
kit_refresh() {
  [ "$KIT" = 1 ] || { say "에이전트 세팅은 건너뛴다 (--no-kit)"; return 0; }
  [ -d "$REPOS" ] || { say "레포 폴더가 없다 — $REPOS · 에이전트 세팅은 건너뛴다"; return 0; }
  # 옛 번들(되돌릴 때)에는 이 명령이 없다 — 모르는 serve 인자는 서버를 띄우고 멈추지 않는다
  grep -q 'kit-refresh' "$PREFIX/bin/ctx.mjs" || { say "이 번들에는 kit-refresh 가 없다 — 에이전트 세팅은 건너뛴다 (콘솔 · 셸로 맞춘다)"; return 0; }
  say "에이전트 세팅 — $REPOS"
  # shellcheck disable=SC2086
  as_svc "$NODE_BIN" "$PREFIX/bin/ctx.mjs" serve kit-refresh --root "$REPOS" --packages "$PREFIX/packages" $PUSH_FLAG 2>&1 | sed 's/^/[upgrade]   /' || say "에이전트 세팅 갱신이 실패했다 — 콘솔 › 지식 레포에서 다시 (kit refresh failed; retry from console)"
}

# ── 1 푼다
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -d "$ART" ]; then NEW="$ART"; else
  tar -xzf "$ART" -C "$TMP" || die "tar 를 풀 수 없다 — $ART"
  # tar 는 폴더 한 단(cdp-server-v<버전>/)을 감싼다 — 그 한 폴더가 산출물이다. 전에는 bin/ctx.mjs 를 -maxdepth 2 로 찾다가 한 단이 모자라 늘 "없다" 고 했다
  NEW="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
[ -n "$NEW" ] && [ -f "$NEW/bin/ctx.mjs" ] || die "산출물 안에 bin/ctx.mjs 가 없다 (bin/ctx.mjs missing in artifact)"
[ -f "$NEW/web/index.html" ] || die "산출물 안에 web/index.html 이 없다 (web/ missing)"
NEW_BUILT="$("$NODE_BIN" "$NEW/bin/ctx.mjs" version | head -1)"
NEW_ASSET="$(grep -o 'assets/index-[^"]*js' "$NEW/web/index.html" | head -1 || true)"
OLD_BUILT="$("$NODE_BIN" "$PREFIX/bin/ctx.mjs" version | head -1 || echo '?')"
say "지금 $OLD_BUILT → 새것 $NEW_BUILT · 화면 ${NEW_ASSET:-?}"

# ── 2 되돌릴 것 (한 세대)
rm -rf "$PREFIX/web.bak" "$PREFIX/packages.bak" "$PREFIX/manual.bak"
cp "$PREFIX/bin/ctx.mjs" "$PREFIX/bin/ctx.mjs.bak"
[ -d "$PREFIX/web" ] && cp -r "$PREFIX/web" "$PREFIX/web.bak"
[ -d "$PREFIX/packages" ] && cp -r "$PREFIX/packages" "$PREFIX/packages.bak"
[ -d "$PREFIX/manual" ] && cp -r "$PREFIX/manual" "$PREFIX/manual.bak"

restore() {
  say "되돌린다 (rolling back)"
  [ "$HAS_SYSTEMD" = 1 ] && systemctl stop cdp-serve || true
  cp "$PREFIX/bin/ctx.mjs.bak" "$PREFIX/bin/ctx.mjs"
  if [ -d "$PREFIX/web.bak" ]; then rm -rf "$PREFIX/web"; mv "$PREFIX/web.bak" "$PREFIX/web"; fi
  if [ -d "$PREFIX/packages.bak" ]; then rm -rf "$PREFIX/packages"; mv "$PREFIX/packages.bak" "$PREFIX/packages"; fi
  if [ -d "$PREFIX/manual.bak" ]; then rm -rf "$PREFIX/manual"; mv "$PREFIX/manual.bak" "$PREFIX/manual"; fi
  chown -R "$SVC_USER:$SVC_USER" "$PREFIX/bin" "$PREFIX/web" "$PREFIX/packages" "$PREFIX/manual" 2>/dev/null || true
  # 새 스킬은 새 서버의 스키마를 전제한다(예: save 의 touchesEmpty) — 서버만 되돌리면 에이전트가 모르는 키를 보낸다
  [ "$KIT_DONE" = 1 ] && kit_refresh
  if [ "$HAS_SYSTEMD" = 1 ]; then systemctl start cdp-serve || true; fi
}
KIT_DONE=0

# ── 3 갈아 끼운다 — web/ 은 폴더째 지운다 (`*` 는 점 파일을 빠뜨리고 옛 index 가 남으면 없는 자산을 찾는다)
cp "$NEW"/bin/ctx.mjs "$NEW"/bin/ctx "$NEW"/bin/ctx.cmd "$PREFIX/bin/" 2>/dev/null || cp "$NEW/bin/ctx.mjs" "$PREFIX/bin/"
rm -rf "$PREFIX/web" && mkdir -p "$PREFIX/web" && cp -r "$NEW"/web/. "$PREFIX/web/"
if [ -d "$NEW/packages" ]; then rm -rf "$PREFIX/packages" && mkdir -p "$PREFIX/packages" && cp -r "$NEW"/packages/. "$PREFIX/packages/"; fi
if [ -d "$NEW/manual" ]; then rm -rf "$PREFIX/manual" && mkdir -p "$PREFIX/manual" && cp -r "$NEW"/manual/. "$PREFIX/manual/"; fi
# 설치절차.md 도 — 서버의 /manual 페이지가 <prefix>/deploy/설치절차.md 를 「서버 설치 절차」 책으로 낸다
if [ -d "$NEW/deploy" ]; then mkdir -p "$PREFIX/deploy" && cp "$NEW"/deploy/*.sh "$NEW"/deploy/cdp-serve.service "$NEW"/deploy/설치절차.md "$PREFIX/deploy/" 2>/dev/null || true; fi
chmod 755 "$PREFIX/bin/ctx" 2>/dev/null || true
chown -R "$SVC_USER:$SVC_USER" "$PREFIX/bin" "$PREFIX/web" "$PREFIX/packages" "$PREFIX/manual" "$PREFIX/deploy" 2>/dev/null || true

# ── 4 멈춤 → 에이전트 세팅 → 켬 · 확인. 멈춘 사이에 가니 save 와 겹치지 않는다(서버 뮤텍스는 프로세스 안에만 있다)
if [ "$HAS_SYSTEMD" = 1 ]; then
  systemctl stop cdp-serve
  kit_refresh
  KIT_DONE=1
  systemctl start cdp-serve
  # 유닛에서 bind · port 를 읽어 healthz 를 친다
  BIND="$(unit_arg bind)"
  PORT="$(unit_arg port)"
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
  say "에이전트 세팅 — 서버를 멈춘 사이에: sudo -u $SVC_USER -H node $PREFIX/bin/ctx.mjs serve kit-refresh --root <레포 폴더> --packages $PREFIX/packages"
  say "             (또는 띄운 뒤 콘솔 › 지식 레포 › [에이전트 세팅 갱신])"
fi
GOT_ASSET="$(grep -o 'assets/index-[^"]*js' "$PREFIX/web/index.html" | head -1 || true)"
if [ -n "$NEW_ASSET" ] && [ "$GOT_ASSET" != "$NEW_ASSET" ]; then
  restore
  die "화면 자산이 다르다 ($GOT_ASSET ≠ $NEW_ASSET) — 되돌렸다 (web assets mismatch; rolled back)"
fi
say "화면 자산 $GOT_ASSET ✓"
say "끝났다 (done). 브라우저는 강제 새로고침(Ctrl+Shift+R). 되돌릴 것: $PREFIX/bin/ctx.mjs.bak · web.bak · packages.bak · manual.bak (한 세대)"
say "에이전트 세팅이 바뀐 레포가 있으면 관리 › 작업 레포에 「낡음」 이 뜬다 — 담당자가 자기 PC 에서 「일괄 갱신」 한 줄(설치기 --update)"
