# 레포 연결 · 삭제 · 내려받기 TODO

> 운영자 요청(2026-09-28) 세 줄 — ① 새로 세운 지식 레포를 원격 저장소에 잇는 기능이 없다(`dpms_wiki` 를
> `http://10.10.20.250:2900/platform/dpms_wiki.git` · `ssh://git@10.10.20.250:443/platform/dpms_wiki.git` 에 올려야 한다) ·
> ② 세운 레포를 지우는 기능이 없다 · ③ 관리 문서 · 작업 문서를 내려받을 수 있게.
> 결정은 전부 **권장안**(운영자 규칙 — 묻지 않는다). 커밋까지만 — push · 태그 · 실서버 갱신 · **실제 원격에 올리는 것**은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · 결정 K1~K9 | **완료** (아래) |
| ① origin 연결 | **완료** — 7380 에서 원격 없이 세운 `dpms_wiki` → bare 원격에 연결 · 첫 push(원격 HEAD = 레포 HEAD `eadc823`) · 칩 「원격 없음」 → 「최신」 |
| ② 삭제(휴지통) | **완료** — 이름 확인 창 · `data/trash/dpms_wiki-20260928-181601` · 표 · `/api/<레포>` 404 |
| ③ 내려받기 | **완료** — 관리 문서 zip 61 KB · 작업 문서 zip(alpha) 24 파일 · 문서 하나 `.md` · 한글 이름 · viewer 권한 경계 |
| ④ 검증 · 문서 | **완료** — 테스트 103 / 103 · 하네스 ✓ 88 ✗ 0 · 빌드 ✓ · 관리자 설명서 3.4 · 사용자 설명서 8.5 · CHANGELOG v0.14.0 · 판 v0.14.0 |

### 시작 상태 (v0.13.0 · c97f188)

```
세우기        POST /admin/repos { package, origin? } — origin 은 세울 때 한 번뿐. 빠뜨리면 다시 넣을 자리가 없다
              (CLI 도 "git remote add origin … && git push -u origin HEAD" 한 줄을 안내만 한다 — 셸이 있어야 한다)
미러 상태      원격이 없으면 「원격 없음」 칩만 — 단추 0
지우기        없다 — 셸에서 rm -rf <root>/<이름>. 명부의 repos 할당은 남는다(없는 이름을 가리킨다)
내려받기       문서 하나의 「본문 원문」 복사 · 첨부의 「원문」 링크(새 탭)뿐. 파일로 받는 길 · 묶음으로 받는 길 0
```

---

## 0. 결정 (권장안)

| | 결정 | 왜 |
|---|---|---|
| K1 | origin 연결은 **콘솔 › 지식 레포의 행 단추**(admin · 재인증 · `auth.log`). `POST /admin/repos/<이름>/origin { url }` | 세우기 · 복구 셋과 같은 자리 · 같은 관문. 레포 화면(writer)에 두지 않는다 — 세우는 것이 admin 이면 잇는 것도 admin(화면 · 권한 R1) |
| K2 | 연결 = `remote add`(있으면 `set-url`) → **`push -u origin HEAD`**. save 와 **같은 뮤텍스** 안에서. 강제 push 없음 | 원격이 비어 있지 않으면 non-ff 로 거절되고 그 사유를 그대로 낸다 — 남의 이력을 덮지 않는다 |
| K3 | push 가 실패해도 **원격은 남긴다**. 같은 단추를 다시 누르면 다시 민다 | 흔한 실패는 자격(PAT · 키)이다 — 고친 뒤 주소를 다시 칠 필요가 없게. 칩은 「upstream 없음」 + 사유 |
| K4 | 주소는 http(s) · ssh · `git@` · 파일 경로 — `newRepo` 와 같은 정규식. 화면 · 로그에는 **자격을 가린 주소**(`//***@`) | 운영자가 준 둘(http · ssh) 다 받는다. 어느 쪽이 되는지는 서버의 자격이 정한다(http → PAT/credential helper · ssh → cdp 사용자의 키) |
| K5 | 지우기 = **휴지통으로 옮긴다** — `<data>/trash/<이름>-<시각>/`. 영구 삭제 없음 | 되돌릴 수 있어야 한다. 원격에 없는 커밋이 있으면 그것이 유일한 사본이다. 되살리기는 셸에서 폴더를 되돌려 놓는 것 |
| K6 | 지우기 확인은 **이름을 그대로 쳐야** 열린다. 원격이 없거나 밀린 커밋이 있으면 확인 창이 그 사실을 먼저 말한다 | 행 단추 하나로 레포가 사라지면 안 된다 |
| K7 | 지우면 명부의 `repos` 할당에서 그 이름을 뺀다(`*` 는 그대로). 작업 레포 대장 행은 **남긴다**(기록) — 몇 건인지 알린다 | 같은 이름으로 다시 세웠을 때 옛 할당이 몰래 살아나지 않게. 대장은 이력이다 |
| K8 | 내려받기는 **읽기 API**(`read-api.js`) — 로컬 뷰어 · 서버가 같은 것. 볼 수 있는 사람이면 누구나(viewer 포함) | 이미 화면에서 읽을 수 있는 것을 파일로 받는 것뿐이다. 권한 밖 레포는 지금처럼 404 |
| K9 | 둘 — 문서 하나(`/file?path=…&download=1` → `.md` 한 파일) · 묶음(`/archive?layer=managed\|work` → zip). 관리 문서 = `docs/**/*.md` · 작업 문서 = `work/` 전부(첨부 `work/assets/` 포함 · `.gitkeep` 제외). 경로는 레포 안의 상대 경로 그대로 | 풀면 레포와 같은 모양. zip 은 이미 있는 `core/zip.js`(의존성 0) |

---

## ① origin 연결 — K1~K4

**바뀌는 파일** — `core/reponew.js`(`connectOrigin`) · `core/git.js`(`maskUrl` 내보내기) · `viewer/bin/ctx-mcp-serve.mjs`(`POST /admin/repos/<이름>/origin` · `/admin/repos` 행에 `remote`) · `viewer/src/lib/api.js`(`admin.repoOrigin`) · `viewer/src/console/Repos.jsx`(행 단추 · 창).

- [x] `connectOrigin({ root, url, push = true })` — 주소 검사 → `remote get-url origin` → 없으면 add · 다르면 set-url → `push -u origin HEAD` → 실패는 `classifyPushError` 로 사유
- [x] 라우트 — 재인증 뒤 · `withLock(root)` · `auth.log` 에 `admin repo origin · <누가> · <이름> · <가린 주소> · pushed|fail=<사유>` · 미러 요약을 같이 돌려준다
- [x] 콘솔 — 원격 없는 행에 「origin 연결」, 있는 행에 「origin」(바꾸기 · 다시 보내기). 창에 운영자가 준 두 모양의 예시 · 자격 안내 · `--mirror` 가 꺼져 있으면 "save 뒤 자동 push 는 안 된다" 한 줄
- [x] 테스트 — bare 원격으로 연결 · push · 같은 주소 다시 · 비어 있지 않은 원격은 non-ff 로 거절되고 원격은 남는다

## ② 지우기 — K5~K7

**바뀌는 파일** — `core/reponew.js`(`trashRepo`) · `viewer/bin/ctx-mcp-serve.mjs`(`DELETE /admin/repos/<이름>` · `store.forget`) · `viewer/src/lib/api.js`(`admin.repoDelete`) · `viewer/src/console/Repos.jsx`(행 단추 · 이름 확인 창).

- [x] `trashRepo({ root, trashDir })` — `_vocab.md` 가 있는 폴더만 · `rename`(장치가 다르면 복사 뒤 지움) · 옮긴 자리를 돌려준다
- [x] 라우트 — 본문 `{ confirm: <이름> }` 이 아니면 400 · save 뮤텍스 안에서 옮김 · 스토어에서 잊음 · 할당 정리(명부 커밋) · 대장 행 수 · `auth.log`
- [x] 콘솔 — 「삭제」 → 이름 입력 창(원격 없음 · 밀림 경고) → 표에서 사라지고 노트에 옮긴 자리
- [x] 테스트 — 옮겨지고 원래 자리는 비고 · 지식 레포가 아니면 거절

## ③ 내려받기 — K8 · K9

**바뀌는 파일** — `viewer/server/adapter/read-api.js`(`/file` 의 `download=1` · `/archive`) · `viewer/src/lib/api.js`(`downloadUrl` · `archiveUrl`) · `viewer/src/components/DocView.jsx`(「내려받기」) · `viewer/src/components/admin/Overview.jsx`(「내려받기」 카드).

- [x] `/file?…&download=1` — `content-disposition: attachment; filename*=UTF-8''…` (한글 파일명)
- [x] `/archive?layer=managed|work` — zip · `<레포>-관리문서-<날짜>.zip` · 빈 층이면 404
- [x] 문서 화면 「복사」 줄에 「내려받기 (.md)」 · 관리 › 현황에 「내려받기」 카드(관리 문서 n · 작업 문서 m · zip 둘)
- [x] 서버에서 viewer 로 받힌다 · 권한 밖 레포는 404 · 로컬 뷰어에서도 받힌다

## ④ 검증 · 문서

- [x] `npm test` · `npm run build` · 개발 서버에서 실제로 누른다(세우기 → 연결(bare) → 내려받기 → 삭제)
- [x] 관리자 설명서(콘솔 › 지식 레포) · CHANGELOG 「다음」 절

---

## 나온 것

실측 — 2026-09-28 · 개발 서버 `cdp-serve`(7380 · `ops/out/dev-serve` · 새 코드로 띄움) · 토큰은 실측용으로 발급하고 끝난 뒤 폐기했다.

| 확인 | 결과 |
|---|---|
| `POST /admin/repos { name: dpms_wiki, package: dpms }` | 200 · 커밋 `eadc823` · 파일 67 · origin 없음 → 표 「원격 없음」 · `remote` null |
| `POST …/origin { url: 'not a url' }` | 400 E_INPUT 「origin 주소 형식이 아니다」 |
| `POST …/origin { url: <bare> }` | 200 · `pushed: true` · `mirror.state: ok` · upstream `origin/master` · bare 의 HEAD = `eadc823` |
| 비어 있지 않은 원격(테스트) | `pushed: false` · `reason: non-ff` · 원격 주소는 남고 원격 이력은 그대로 |
| `GET /api/dpms_wiki/archive?layer=managed` | 200 zip 61,394 B · `filename*=UTF-8''dpms_wiki-관리문서-20260928.zip` |
| `…?layer=work`(세운 직후) · `layer=x` | 404 「작업문서가 없다」 · 400 |
| `GET /api/alpha/archive?layer=work` | 200 · 24 파일 · 이름 UTF-8 플래그(0x800) · `testzip` 이상 없음 |
| `GET /api/<r>/file?path=docs/1.관리/BM_111_착수보고서.md&download=1` | 200 `text/markdown` · `attachment` · 한글 이름 |
| hong(writer) — alpha zip · beta zip · origin · delete | 200 · **404**(권한 밖) · **403** · **403** |
| `DELETE …/dpms_wiki { confirm: 'x' }` · `{ confirm: 'dpms_wiki' }` | 400 · 200 `trash=…/data/trash/dpms_wiki-20260928-181601` · 목록에서 빠짐 · `/api/dpms_wiki/repo` 404 |
| 콘솔 화면 | 행 단추 「origin 연결」 · 「삭제」 · 연결 창(두 모양 예시 · `--mirror` 꺼짐 경고) · 삭제 창(이름을 다 치기 전 단추 꺼짐 · 「원격에 올라간 적이 없다」 경고) · 치운 뒤 노트에 휴지통 자리 |
| 레포 화면 | 관리 › 현황 「내려받기」 카드(관리 문서 16개 · 기록 22건) · 문서 화면 「복사」 줄 「내려받기 (.md)」 |
| `node --test test/*.test.mjs` | **103 / 103**(`reponew` 에 연결 둘 · 휴지통 하나 추가) |
| `npm run verify` | ✓ 88 ✗ 0 – 16 — v0.13.0 과 같다(새 라우트는 위 실측으로 · 하네스 줄은 더하지 않았다) |

**실측 중 고친 것** — 치운 레포가 콘솔 표에 **남아 보였다.** 서버 답은 맞았고(`/admin/repos` 에 없음), 화면이 치우기 **전에** 떠난
`/admin/repos`(첫 스캔이라 5.5초)를 쓰기 뒤 `refresh()` 가 같이 받았다 — `cache.load(force)` 가 진행 중인 요청을 재사용했다. `force` 면
진행 중인 것이 끝난 뒤 **새로 읽게** 고쳤다(`viewer/src/lib/cache.js`). 다른 쓰기 뒤 새로 읽기(세우기 · 복구 셋 · 사용자 · 토큰)에도 같은 틈이 있었다.

**권장안으로 정한 것** — K1~K9(위 표). 특히 K5(영구 삭제 없음 · 휴지통) · K3(push 실패해도 원격을 남김) · K7(대장 행은 남김).

**하지 않은 것 · 사람의 일**
- **실제 원격에 올리기** — `dpms_wiki` 를 `http://10.10.20.250:2900/platform/dpms_wiki.git`(또는 `ssh://git@10.10.20.250:443/platform/dpms_wiki.git`)에 잇는 것은
  이 판이 올라간 서버의 콘솔에서 사람이 누른다. 그 전에 GitLab 에 **빈** 프로젝트가 있어야 하고(README 로 초기화하면 non-ff 로 거절된다),
  서버 cdp 사용자에게 http 면 PAT(credential helper) · ssh 면 키가 있어야 한다. 개발 서버에서는 bare 원격으로만 확인했다.
- CLI(`ctx repo origin` · `ctx repo rm`) — 만들지 않았다. 셸에서는 git 두 줄 · `mv` 한 줄이라 설명서 3.4 에 적었다.
- 휴지통 비우기 — 자동으로 하지 않는다(셸에서).
- `npm test` 가 이 PC(Node 22)에서 `test/` 를 모듈로 찾다 실패한다(이 작업 전부터) — `node --test test/*.test.mjs` 로 돌렸다.
- push · 태그 · 실서버 `upgrade.sh` — 사람이.
