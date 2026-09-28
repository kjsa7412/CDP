# git 자격 TODO — SSH 배포 키는 콘솔에서 · PAT 는 명령 한 줄로

> 운영자 요청(2026-09-28) — 「자격 세팅도 프로그램에서 못하나?」 → ①(SSH 배포 키 · 콘솔) + ②(PAT · 서버 명령) **권장안으로 진행.**
> 원본 결정: 제품관리서비스 검토 v0.1 **D8**(PAT 는 셸 — 비밀이 평문 HTTP 를 건너지 않게). 이 작업은 D8 을 **뒤집지 않는다** —
> 브라우저를 건너는 것은 공개 키 · 지문 · 결과뿐이고, 비밀(개인 키 · PAT)은 서버 밖으로도 안으로도 브라우저를 지나지 않는다.
> 커밋까지만 — push · 태그 · 실서버 갱신은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 결정 G1~G8 | **완료** (아래) |
| ① SSH 배포 키 — 콘솔 | **완료** — 7380 에서 키 만들기 · 409 · 레포 자동 적용 · 스캔 · 접속 확인 · 연결 창 안내. **진짜 ssh 서버에 push 는 못 봤다**(아래) |
| ② PAT — `ctx serve git-auth` | **완료** — 임시 HOME · 임시 전역 설정으로 저장 · 바꿔 쓰기 · `--test` · `--ssh` · `--list` |
| ③ 검증 · 문서 | **완료** — 테스트 111 / 111 · 빌드 ✓ · 관리자 설명서 3.3 · 3장 머리 · 3.4 · 파일 표 · CHANGELOG 「다음」 |

### 시작 상태 (v0.14.0 · 017fda3)

```
http + PAT     설명서 3.3 의 셸 다섯 줄(read -rsp · credential.helper · printf > .git-credentials · user.name · user.email) — 틀릴 자리가 많다
ssh            절차 없음 — cdp 사용자의 키 · known_hosts 를 사람이 알아서
콘솔           진단의 「push 자격 있음 / 없음」 한 줄만 — 무엇이 없는지 · 무엇을 하면 되는지 없음
```

---

## 0. 결정 (권장안)

| | 결정 | 왜 |
|---|---|---|
| G1 | **배포 키는 서버가 만든다**(`ssh-keygen -t ed25519 -N ''`). 자리는 `<data>/ssh/id_ed25519` — 명부 · 대장과 같은 데이터 폴더 | 개인 키가 서버 밖으로 나가지 않는다. 화면에는 공개 키만 — 공개 키는 비밀이 아니다 |
| G2 | 키는 **레포마다 로컬 설정**(`core.sshCommand`)으로 건다 — 전역(`~/.gitconfig` · `~/.ssh/config`)을 건드리지 않는다 | cdp 사용자의 다른 git · ssh 를 바꾸지 않는다. 연결 · clone · 세우기가 ssh 주소일 때 · 키를 만들 때 ssh 원격인 레포 전부에 |
| G3 | `sshCommand` = `ssh -i <키> -o IdentitiesOnly=yes -o UserKnownHostsFile=<data>/ssh/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes` | 모르는 호스트에 **묻지도 붙지도 않는다** — 서버에는 yes 를 칠 사람이 없고, 몰래 받아들이면 가짜 서버에 이력을 보낸다 |
| G4 | 호스트 키는 **사람이 지문을 보고 믿는다** — 「호스트 키 받기」(ssh-keyscan) → 지문 → 「이 지문을 믿는다」. 믿을 때 서버가 **다시 받아서** 같은 지문만 쓴다 | 받은 뒤와 믿은 뒤 사이에 키가 바뀌면 쓰지 않는다. 지문은 GitLab 관리자에게 물어 대조할 수 있다 |
| G5 | 「접속 확인」 = `git ls-remote <url> HEAD`(키 · known_hosts 로 · 프롬프트 없음). 사유는 `classifyPushError` 와 같은 표 | 붙이기 전에 된다는 것을 안다. 아무것도 보내지 않는다 |
| G6 | 키 교체는 「새로 만들기」 — 옛 키는 `id_ed25519.old-<시각>` 으로 남긴다. GitLab 의 옛 키는 사람이 뗀다 | 되돌릴 수 있게. 서버가 GitLab 에 쓰지는 않는다(API 토큰이 필요해진다) |
| G7 | **PAT 는 브라우저로 받지 않는다**(D8 그대로). 서버 명령 `ctx serve git-auth --host <host:port> --user <계정>` — 숨김 입력 · `.git-credentials` 600 · `credential.helper store --file=…` · 같은 호스트 줄은 바꿔 쓴다 · `--test <url>` 이면 ls-remote | 셸 다섯 줄이 한 줄로. 콘솔은 **어느 호스트에 누구로 저장돼 있나**만 보인다(비밀 없음) |
| G8 | 이미 다른 `credential.helper`(manager 등)가 있으면 명령은 멈춘다 — `--yes` 로만 바꾼다 | 남이 정한 자격 방식을 말없이 덮지 않는다 |

---

## ① SSH 배포 키 — 콘솔 › 서버 › 「git 자격」

**바뀌는 파일** — `core/gitauth.js`(새) · `core/reponew.js`(`sshCommand` 인자 — 연결 · clone · 세우기) · `viewer/bin/ctx-mcp-serve.mjs`(`/admin/gitauth` 다섯) · `viewer/src/lib/api.js` · `viewer/src/console/Server.jsx`(카드) · `viewer/src/console/Repos.jsx`(연결 창의 안내).

- [x] `GET /admin/gitauth` — 키(있나 · 공개 키 · 지문) · 믿는 호스트 · PAT 저장 호스트(호스트 · 계정만)
- [x] `POST /admin/gitauth/key { rotate? }` — 만들기 · 교체 · ssh 원격 레포에 `core.sshCommand` 적용 수
- [x] `POST /admin/gitauth/scan { url }` · `POST /admin/gitauth/trust { url, fingerprint }` — G4
- [x] `POST /admin/gitauth/test { url }` — G5
- [x] 연결 · clone · 세우기가 ssh 주소면 키를 건다(G2) · 키가 없거나 호스트를 안 믿으면 연결 창이 먼저 말한다
- [x] 전부 재인증 뒤 · `auth.log`

## ② PAT — `ctx serve git-auth`

- [x] `--host · --user · [--scheme http] · [--file] · [--test <url>] · [--yes]` — 숨김 입력(TTY) 또는 표준 입력 한 줄
- [x] `--ssh --data <dir> [--rotate]` — 콘솔과 같은 키 만들기(셸에서도) · `--list [--data]` — 지금 상태

## ③ 검증 · 문서

- [x] 테스트 — 키 만들기 · 교체 · 레포 적용 · known_hosts(지문 대조 · 다르면 거절) · 원격 파싱 · PAT 줄 바꿔 쓰기 · 600 · helper(GIT_CONFIG_GLOBAL 임시)
- [x] 개발 서버에서 콘솔 카드 · 연결 창 · 명령
- [x] 관리자 설명서 3.3 · CHANGELOG 「다음」

---

## 나온 것

실측 — 2026-09-28 · 개발 서버 `cdp-serve`(7380 · 새 코드로 다시 띄움) · 실측 토큰은 끝난 뒤 폐기.

| 확인 | 결과 |
|---|---|
| `GET /admin/gitauth`(재인증 없이) | 200 · 키 없음 · 믿는 호스트 0 · PAT 0 · 레포 셋 ssh 아님 |
| `POST /admin/gitauth/key`(재인증 없이 · 뒤 · 두 번째) | 401 E_REAUTH · 200 ed25519 `SHA256:eg78…` · 409 E_EXISTS 「새로 만들기(rotate)」 |
| `scan` http 주소 · 닿지 않는 ssh(127.0.0.1:1) · `trust` 지문 형식 | 400 「ssh 주소가 아니다」 · 400 E_GIT 「호스트 키를 받지 못했다」 · 400 |
| `test` 닿지 않는 ssh | 200 `ok:false · reason net` 「원격에 닿지 않는다」 |
| 세우기 + ssh origin(`ssh://git@127.0.0.1:1/…`) | 레포는 서고 push 실패(연결 거부) · `/admin/gitauth` 의 그 레포 `ssh:true · applied:true` — 키가 로컬 설정으로 걸렸다 |
| 콘솔 › 서버 | 「SSH 배포 키」(지문 · 공개 키 복사) · 「PAT — http 주소」(저장 호스트 · 명령) · 「접속 확인 · 호스트 키」 · `#gitauth` 로 오면 그 자리로 |
| 주소칸에 `ssh://git@10.10.20.250:443/platform/dpms_wiki.git` | 「호스트 [10.10.20.250]:443 를 아직 믿지 않았다」 경고 — 연결 창도 같은 문장 |
| `ctx serve git-auth --host 127.0.0.1:2900 --user kjsa --test <bare>`(파이프) | 저장 · helper `store --file=…` · 「접속 확인 — 빈 프로젝트」 · 두 번째는 「같은 호스트의 옛 줄을 바꿨다」 · `--ssh` 공개 키 · `--list` · 인자 없으면 사용법 rc 2 |
| 이 PC 의 전역 git 설정 | 바뀌지 않았다(`credential.helper` · `core.sshCommand` 없음 그대로 · 테스트는 `GIT_CONFIG_GLOBAL` 임시) |
| `node --test test/*.test.mjs` | **111 / 111**(`gitauth` 여덟 추가) |
| `npm run verify`(커밋 311a9c0 만 든 임시 worktree · 혼자 돌림) | **✓ 88 ✗ 0 – 16** — v0.14.0 과 같다. 다른 세션의 변경이 섞인 작업 트리에서 다른 일과 겹쳐 돌렸을 때는 ✗ 6(93 의 하네스 자체 push 가 미러 push 와 겹친 경쟁 → 94~97 이 연쇄 · 73)이었다 — 이 작업의 것이 아니다 |

**못 본 것 — 진짜 ssh 서버로 push.** 이 PC 에서 `10.10.20.250:443` 은 TCP 는 받지만 8초 안에 SSH 배너가 없었다(`ssh-keyscan` 0줄 ·
http 2900 은 302 로 답한다). 방화벽 · 프록시일 수도, 443 이 ssh 가 아닐 수도 있다. **CDP 서버(10.10.20.188)에서 「호스트 키 받기」 가 첫 확인이다** —
지문이 뜨면 ssh 가 닿는 것이고, 안 뜨면 http + PAT(②)로 간다. 키 · known_hosts · sshCommand 는 테스트가 진짜 ssh-keygen 으로 확인했다.

**권장안으로 정한 것** — G1~G8(위 표). 특히 G2(전역을 건드리지 않고 레포 로컬 설정) · G4(믿을 때 다시 받아 같은 지문만) · G7(PAT 는 셸만 — D8 그대로).

**실측 중 고친 것** — `core/git.maskUrl` 이 ssh 계정까지 가려 화면에 `ssh://***@…` 가 떴다 — ssh 계정은 남기고 http 자격 · ssh 비밀번호 · 문장 속 주소만 가린다(테스트).
`#gitauth` 로 와도 카드가 페이지보다 늦게 서서 자리로 안 갔다 — 카드가 선 뒤 스스로 간다.

**같은 체크아웃의 다른 세션** — 이 작업 중 `App.jsx` · `site/*` · `api.js`(`landingFor`) · `ctx-mcp-serve.mjs`(`landingOf`) · `core/tokenstore.js` ·
`docs/dev/설치_한줄_TODO.md` 등이 다른 곳에서 바뀌고 있었다. 커밋에는 **이 작업의 hunk 만** 담았다(섞인 두 파일은 hunk 단위로). 테스트 · 하네스 · 브라우저는
그 변경이 섞인 작업 트리에서 돌았다 — 커밋된 트리는 따로 임시 worktree 에서 빌드 · 테스트했다.

**사람의 일** — push · 태그 · 실서버 upgrade · 서버에서 「배포 키 만들기」 → GitLab Deploy keys(쓰기) → 「호스트 키 받기」(지문을 GitLab 관리자와 대조) → 「접속 확인」 → 지식 레포 › dpms_wiki › 「origin 연결」.
ssh 가 안 닿으면 `ctx serve git-auth --host 10.10.20.250:2900 --user <계정> --test http://10.10.20.250:2900/platform/dpms_wiki.git`.
