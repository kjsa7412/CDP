# CHANGELOG

태그마다 한 절. 릴리스 노트는 여기서 나온다(`.github/workflows/release.yml`).
**무엇이 바뀌었나**만 적는다 — 왜는 커밋 메시지와 설계서에 있다.

## 다음

연결 · 삭제 · 내려받기 — [`docs/dev/레포_연결_삭제_내려받기_TODO.md`](docs/dev/레포_연결_삭제_내려받기_TODO.md)

**콘솔 › 지식 레포** — `core/reponew.js` · `viewer/bin/ctx-mcp-serve.mjs` · `viewer/src/console/Repos.jsx`
- **「origin 연결」** — `POST /admin/repos/<이름>/origin { url }`(admin · 재인증 · save 뮤텍스 · `auth.log`). `remote add`/`set-url` → `push -u origin HEAD` · 강제 push 없음(원격에 커밋이 있으면 non-ff 로 거절) · push 가 실패해도 원격은 남는다 · 표에 원격 주소(자격 가림)와 「이었지만 못 보냄」 칩
- **「삭제」** — `DELETE /admin/repos/<이름> { confirm }`. 이름을 쳐야 열린다 · `<data>/trash/<이름>-<시각>/` 로 **옮긴다**(영구 삭제 없음) · 명부 할당에서 뺀다 · 작업 레포 대장은 남긴다
- `core/reponew.js` — `connectOrigin` · `trashRepo` · `ORIGIN_RE`(세우기 · 받아 오기 · 잇기가 같은 주소 모양) · `core/git.js` — `originUrl` · `maskUrl` 내보냄

**내려받기** — `viewer/server/adapter/read-api.js`(로컬 뷰어 · 서버 공통) · `components/DocView.jsx` · `components/admin/Overview.jsx`
- `/file?path=…&download=1` — 파일로(한글 이름 RFC 5987) · 문서 화면 「복사」 줄에 「내려받기 (.md)」
- `/archive?layer=managed|work` — zip(`<레포>-관리문서-<날짜>.zip` · `docs/**/*.md` / `work/` 전부 · 첨부 포함) · 관리 › 현황에 「내려받기」 카드. 읽기 권한이면 누구나 · 권한 밖 레포 404

**캐시** — `viewer/src/lib/cache.js`: 쓰기 뒤 `refresh()`(force)가 **쓰기 전에 떠난 요청**을 같이 받지 않는다 — 끝난 뒤 새로 읽는다(치운 레포가 표에 되살아나던 것)

**문서** — 관리자 설명서 3.4 「세운 뒤 — origin 연결 · 삭제」 · 사용자 설명서 8.5 「내려받기」

## v0.13.0

화면 · 권한 — [`docs/design/CDP_화면_권한_검토_v0.1.md`](docs/design/CDP_화면_권한_검토_v0.1.md) · [`docs/dev/화면_권한_TODO.md`](docs/dev/화면_권한_TODO.md) · 그림 `docs/dev/화면_권한_검토_그림/`(「후」)

**역할 경계** — `viewer/bin/ctx-mcp-serve.mjs` · `viewer/server/adapter/read-api.js` · `http.js` · `core/auth.js` · `core/mirror.js`
- 레포 화면의 **`POST /repos`(writer · 지식 레포 세우기) 삭제** — 404. 세우는 길은 콘솔 `POST /admin/repos`(admin · 재인증 · 볼 사람 지정 · clone)와 셸 `ctx repo new`
- `GET /workrepos` 의 `users`(명부 이름)는 write 에게만 · 서버 모드 공유 읽기 API 에서 `/git` · `/git/config` 를 뺐다(로컬 뷰어만 — `/api/<레포>/git` 404)
- `POST /logout` JSON 200(화면이 pushState 로 소개로 · `GET` 302 는 그대로) · `__CDP_SERVER__` 주입이 `<head>` 첫 줄
- 세션 쿠키에 토큰 id(`tid` · 해시 앞 8자 · 비밀 아님) — `/me` 의 `expiresInDays` · `tokenExpires` 가 브라우저에서도 실제 값. 판정은 그대로 명부만
- `/repos` 행의 `note` — 콘솔에 못 들어가는 사람에게는 「콘솔 > 지식 레포 > 「…」」 대신 「관리자에게(콘솔 「…」)」
- 역할 문구 — writer 는 「save · 작업 레포 등록」(콘솔 사용자 페이지 · 설명서)

**관리 · 상단 바** — `viewer/src/components/admin/*` · `components/TopBar.jsx` · `App.jsx`
- 서버 모드 관리 메뉴 **셋 — 현황 · 작업 레포 · 정보**(전에는 다섯 + 콘솔 · 문서로 돌아가기). `RepoServer.jsx` 삭제 · 「진단 · 정보」 → **「정보」**(`Info.jsx` — 판 · 빌드 · 내 계정 · 역할 · 할 수 있는 것 · 토큰 만료 D-n · 볼 수 있는 레포 수 · 단축키 · 설명서 · 요청 0). 로컬 다섯은 그대로
- 상단 스위처 셋(설명서 · 레포 ▾ · 콘솔) — 「소개」 탭 제거(표식 = 소개 · 소개에서 표식에 `aria-current` · 좁은 화면 표식 메뉴에는 「소개」 줄) · ⋯ 메뉴의 「관리 —」 줄 제거 · 콘솔 현황 진단 카드 「자세히」 → `/console/server#doctor`
- 조작 수 — 상단 바 admin 12 → 11 · writer 10 · ⋯ 15 → 14 · 관리 메뉴 6 → 3

**껍데기 하나 · 세션 · 캐시 · 주소 · 테마** — `viewer/src/Shell.jsx`(새) · `lib/session.jsx` · `lib/cache.js` · `lib/slots.js` · `lib/keys.js`(새) · `lib/api.js` · `lib/router.jsx` · `main.jsx` · `index.html` · `styles/*`
- `main.jsx` 는 `<Shell/>` 하나 — 라우트가 매 렌더 얼굴을 고르고 `TopBar` 는 한 번(얼굴 사이에 살아남는다) · 레포 도구는 포털 · `<App key={repo}>`. **얼굴 순회 12정거장이 문서 교체 0**(전에는 얼굴 · 레포를 넘는 31곳이 전부 교체)
- `api.js` 의 모드 상수 → `getMode()` · `isServer()` · `currentRepo()` · `req()` 가 부르는 시점의 레포 · 얼굴 밖 `<a href>` 21곳 → `Link` · `location.href` 0(로컬의 레포 경로 바꾸기도 문서 교체 없이 다시 세운다)
- 세션 하나(`/site/info` + `/me` 한 번 · 상단 바가 두 번 그려지지 않는다) · `useResource`(stale-while-revalidate · 같은 키는 요청 하나) — 두 번째 방문 「읽는 중…」 0(관리 · 콘솔 7 · 설명서 · 검사 · 문서) · 전환은 `startTransition`
- 주소가 상태 — `/r/<레포>/` · `/graph` · `/manage/<overview|work|info>`(로컬은 `/…`) · 콘솔 → 「레포」 가 마지막 경로로(보던 관리 탭)
- 첫 페인트 전 테마 — `index.html` head 의 CSS 앞 인라인 스크립트(`cdp.theme` + OS → `data-theme` · `data-face` · `color-scheme` meta) · `html` 배경 `--bg` · `color-scheme` · 죽은 `auto-dark` 셀렉터 삭제

**문서** — 사용자 설명서 8.1 · 8.8 · 8.9(「v0.13.0 에서 달라진 것」) · 관리자 설명서 3.4 (다) · 3.7 · 5.2 · 6.1 · 개발자 설명서 7 · 8.5 · 9 · 10.1 · 11.3 · 부록 C · MCP 설계서 §6.6.3 · 제품관리서비스 검토 §4.8 · 화면 UX 검토 §5.5 에 정정 상자 · 검토 v0.1 머리 「구현 완료」 · §2.7 「후」 표

**검증** — 하네스 98~103(writer `POST /repos` 404 · writer `POST /admin/repos` 403 · viewer `/workrepos` users `[]` · viewer `/api/<r>/git` 404 · 인라인 테마 스크립트가 stylesheet 앞 · `POST /logout` 200) · 71 · 72 는 `ctx repo new` 로 · 테스트(`auth` tid · `save` describe) · Playwright 실측(TODO 「나온 것」)

## v0.12.0

동시 기록 — [`docs/design/CDP_동시기록_검토_v0.1.md`](docs/design/CDP_동시기록_검토_v0.1.md) · [`docs/dev/동시기록_TODO.md`](docs/dev/동시기록_TODO.md)

**save · 미러** — `core/save.js` · `core/mirror.js`(새) · `core/lock.js`(새) · `core/git.js` · `core/frontmatter.js` · `core/managed.js`
- 미러 push 가 **레포당 큐 하나**로 직렬화된다 — 겹치면 끝난 뒤 한 번 더. 실패 사유를 `classifyPushError` 로 가른다(`non-ff · auth · net · protected · locked · no-upstream · unknown`) — 전에는 첫 줄 `To <원격>` 만 남았다
- `save` 응답 `mirror` 가 실제 상태를 말한다 — `off · ok · queued · lag · diverged` + `mirrorReason` · `mirrorLast` · 이상이면 `warnings` 한 줄(1.5초까지 기다린다 · 뮤텍스 밖)
- **더러운 서버 트리는 `save` 가 거절한다** — `E_GIT { reason: 'dirty', dirty, paths }`(전에는 사람의 미커밋 줄이 다음 `save` 의 이름으로 커밋됐다)
- `E_CONFLICT` detail 에 `currentWork { id, title, author, date }` · `content`(지금 본문 · 8,000자 · `truncated`) · 문장에 누가 언제 — `section` 을 다시 부르지 않고 그 위에 다시 만든다
- 등록부 `—`(문서 전체) 규칙 — 문서 첫 줄의 `<!-- applied: … -->` 가 applied · 전체 치환 · 헤딩 검사 생략(전에는 정규식 예외로 `E_REPO`)
- `git.status` 에 `dirtyPaths`(한글 경로 그대로 · `core.quotepath=false` · `-uall`) · `restoreTree` · `listRepos` 에 `branch · behind · dirty`(프로세스 넷 → 둘)

**서버** — `viewer/bin/ctx-mcp-serve.mjs` · `ctx-serve-doctor.mjs` · `ctx-mcp.mjs`
- `GET /repos` · `/admin/repos` 행에 `mirror`(다섯 값) · `mirrorReason` · `ahead` · `behind` · `dirty` · `note` (`/admin/repos` 는 `dirtyPaths` · `mirrorMessage` · `mirrorAt` 도)
- **`POST /admin/repos/<name>/sync · push · restore`** — 「origin 과 맞추기」(fetch → ff-only → 재스캔 · 갈라졌으면 409 + rebase 문장) · 「다시 보내기」 · 「트리 되돌리기」(버린 경로). 재인증 · `save` 와 같은 뮤텍스 · `auth.log` 에 `admin repo sync|push|restore · <누가> · <레포> · …`
- `/admin/overview` — 경고 넷(더러움 · 갈림 bad · 밀림+사유 · origin 앞섬 warn) · `repos.mirror` 집계에 `diverged` · `behind` · **`saves`**(최근 10 · 24h 거부 집계) · `/healthz` · `/site/info` 집계도 같다
- doctor 레포 줄 셋 — `트리`(dirty → fail) · `origin`(ls-remote 로 origin 앞섬 warn · 갈림 fail — fetch 없이) · `push` 는 분류 사유
- `serve.log` 의 `save` 줄에 `work.id` · 결과 코드 · 도구 시간(전에는 `-` · 200 · 핸들러 시각) · 시작할 때 더러운 레포 경고 한 줄
- MCP `sync`(서버형)에 `mirrorReason · ahead · behind · dirty · note` · `brief` 에 `[CDP] 미러: …` 한 줄(이상일 때만)

**화면** — `viewer/src/console/Repos.jsx` · `Overview.jsx` · `components/StatusBar.jsx` · `components/admin/Overview.jsx` · `RepoServer.jsx` · `lib/api.js`
- 콘솔 › 지식 레포 — 칩 `최신 · 밀림 N · <사유> · 갈림 · origin 앞섬 · 트리 더러움 N` · 진단 줄(트리 · origin · push · 60초 캐시 · 동작 뒤 새로) · 행 단추 셋(재인증 · 되돌리기는 버릴 경로를 보여 주는 확인 모달)
- 콘솔 › 현황 — 경고 넷 · 「최근 기록」 카드(시각 · 사람 · 레포 · id · 결과 · ms · 24h 거부 집계)
- 레포 화면 상태바(서버형) — 이상이 있을 때만 한 줄(`미러 밀림 N · 사유` · `origin 과 갈림 N/M` · `origin 앞섬` · `트리 더러움`). 로컬형의 pull/push 단추 · 감시 · 다시 스캔은 서버형에서 내지 않는다
- 레포 관리 › 현황(서버형) — 미러 카드에 상태 · 사유 · 작업 레포 카드는 대장(`/workrepos`)으로("읽는 중…" 고정이 없어졌다) · 마지막 스캔 줄 없음

**스킬 · 설명서 · 설계서**
- `cdp-save` ⑤B — `E_CONFLICT` 행(재료로 다시) · 「무엇이 돌아오나」(`mirror` 값 · `E_GIT dirty`) · 모드 표 「충돌」 행 — `cdp-managed` · `cdp-edit` · `cdp-import` 도 같은 행
- **`cdp-managed` ④ 모드 B — 「파생 정리 기록」 규약**(`tags: [derive]` · 좌표 하나에 `save` 하나 · 코드 변경 0) — 전에는 "길이 없다 · 멈춘다"
- 사용자 6.5 · 7.3 · 9.2 · 10.2 · 관리자 7.6(콘솔의 칩 · 단추 셋 · 셸 대응) · 10.1 · 11(「자동 merge」 와 「서버의 자동 pull · 자동 push 확대」 를 갈라 적고 「섹션 점유 화면」 추가) · 개발자 2.1 · 5.1 · 5.2 · 7.2 · 7.4 · 8.4 · `agent/manual/user.md` · `admin.md` 한 행씩
- MCP 설계서 §2.6 · §4.2 · §4.5 · §4.8 · §4.9 · §10 정정 상자 · 제품관리서비스 검토 D13 닫음 · 제품화 검토 R15 정정 · 시스템설계서 제3부 주석 · `docs/README.md` · `README.md`

**검증** — 테스트 100(`git` 3 · `save` 10 신설) · 하네스 91~97(`--mirror` 서버 하나 더 · 동시 5 · 같은 섹션 · non-ff → 사유 · 맞추기 · dirty → 되돌리기 · `—` 규칙 · 최근 기록) — ✓ 82 ✗ 0 – 16 · 잡은 것 — 하네스 56 이 서버 트리를 더럽힌 채 두던 것(이제 `save` 가 거절한다) · 한글 경로의 `core.quotepath`

## v0.11.0

화면 UX — [`docs/design/CDP_화면_UX_검토_v0.1.md`](docs/design/CDP_화면_UX_검토_v0.1.md) · [`docs/dev/화면_UX_TODO.md`](docs/dev/화면_UX_TODO.md) · 목업 `docs/dev/화면_UX_목업/` · 그림 `docs/dev/화면_UX_검토_그림/`(전 · 후)

**공통 상단 바** — 세 얼굴(소개 · 레포 · 콘솔)이 `viewer/src/components/TopBar.jsx` 하나를 쓴다
- 높이 48px 하나(전에는 34/56 · 48 · 30/25) · 표식 `C CDP` 는 언제나 소개로 · 얼굴 스위처 **소개 · 설명서 · 레포 ▾ · 콘솔**(관리자만) · 현재 얼굴에 밑줄 · 오른쪽 이름 · 역할 칩 · 로그아웃(`aria-label`)
- 「레포 ▾」 탭이 곧 레포 메뉴다(마크 글자는 언제나 C) · 소개 · 설명서 · 콘솔의 「레포」 와 로그인 뒤 `/r` 은 **마지막에 보던 레포**(`localStorage cdp.lastRepo`)
- 이름 통일 — 「들어가기」 → 「로그인」 · 「내 레포로」 → 「레포」(히어로는 「레포 열기」) · 「문서로」 → 「레포」(콘솔 왼쪽 아래 항목은 뺐다) · 「콘솔로 →」 → 「콘솔」 · 도움말 「매뉴얼」 → 「레포 문서」 · 「설명서 · 관리자 6장」 → 「설명서 › 관리자 6장」
- 탭 제목 `<페이지> · CDP` — `소개 · CDP` · `<책> · CDP` · `로그인 · CDP` · `<레포> · CDP` · `콘솔 — <페이지> · CDP`
- 1080px 아래에서 스위처가 표식 메뉴(`C CDP ▾`)로 접힌다 — 라벨이 남는다 · 콘솔 · 관리 왼쪽 메뉴의 아이콘에 `title` · `aria-label` · 더보기 단추가 눌리지 않는다(`flex:none`)
- 소개의 「이 서버」 카드에 **얼굴** 한 줄 — 소개 · 설명서 · 레포 · 콘솔이 무엇인가
- 로컬 뷰어는 같은 바에 표식 `C CDP` + 「레포 · <이름>」 이름표 — 스위처는 없다(얼굴이 하나)

**서버** — `viewer/bin/ctx-mcp-serve.mjs`
- 브라우저(`Accept: text/html`)의 없는 주소 → `index.html`(화면의 「없는 주소입니다」 · 404). API · MCP · 에이전트는 지금처럼 JSON
- 열 수 없는 레포 주소 `/r/<x>/` → `/r?from=<x>` — 없는 레포와 권한 밖 레포를 **같은 문장**으로("없거나 이 계정에 할당되지 않았다" · 볼 수 있는 레포 단추). 전에는 말없이 첫 레포로 갔다
- `POST /setup` 응답에 재인증 쿠키(`cdp_su` · 15분)도 — 마법사 직후 첫 쓰기에서 방금 본 토큰을 다시 묻지 않는다
- 하네스 89(없는 주소) · 90(권한 밖 레포) · 80 에 재인증 쿠키 — ✓ 75 ✗ 0

**사이트 · 설명서 · 대비 · 테마**
- `.site-top` 이 긴 페이지에서 56 → 34px 로 눌리던 것 · 바닥글이 설명서 목차를 덮던 것 — `#root{height:auto}` · 바 sticky · 목차 sticky(자기 스크롤)
- 부제 · 힌트 · 바닥글 · 빵부스러기(10.5~12px)의 색 `--text-3`(3.0:1) → `--text-2`(6.3:1). 토큰 값은 그대로
- 테마 키 하나 `cdp.theme` — 레포 화면의 설정을 소개 · 콘솔 · 다른 레포가 같이 따른다(전에는 레포마다)
- `/console/<없는 페이지>` → 현황으로 · 마법사 입력의 라벨이 입력에 묶인다 · 새 레포 직후 표에 「읽는 중…」 · 마법사 ③에서 레포가 0 이면 「레포」 를 내지 않는다

**문서** — 사용자 8.1 · 8.8 · 8.9(v0.11.0 표) · 관리자 3.7 · 6장 · 설치절차 7장 · 제품관리서비스 검토 §4.8 · §4.11 정정 상자 · 설명서 판 v0.11.0

- `install.sh` · `upgrade.sh` 가 `deploy/설치절차.md` 도 `<prefix>/deploy/` 에 복사한다 — 서버의 `/manual` 이 그 파일을 「서버 설치 절차」 책으로 내는데 v0.10.0 스크립트는 `*.sh` 와 유닛만 옮겨 실서버 목록에서 그 책이 빠졌다(2026-09-24 실측). 이미 올린 서버는 파일 하나를 복사하고 재시작한다 — 관리자 설명서 부록 A

## v0.10.0

제품 관리 서비스 — [`docs/design/CDP_제품관리서비스_검토_v0.1.md`](docs/design/CDP_제품관리서비스_검토_v0.1.md) · [`docs/dev/제품관리서비스_TODO.md`](docs/dev/제품관리서비스_TODO.md)

**세 얼굴 한 프로세스** — `ctx serve` 가 주소로 얼굴을 고른다
- 사이트 `/` 소개 · `/manual/<책>` 설명서(서버가 든 `manual/` 원문을 화면이 렌더 · GitHub 규칙 slug) · `/login`(JSON · `next`) · `/setup` 첫 관리자 마법사 · `/r` 빈 상태
- 콘솔 `/console` 일곱 — 현황 · 사용자(매트릭스) · 토큰(원문 1회 · 재발급 · 폐기 회색) · 지식 레포(세우기 · clone · grant) · 작업 레포 · 서버(진단 · 로그 · 파일 위치) · 감사
- 레포 화면 — 레포 메뉴 항상(쓰기/읽기 칩) · who 에 설명서 · 콘솔 · 역할 칩 · 관리 메뉴에 「콘솔로 →」 · 도움말에 제품 설명서
- 화면: `lib/router.jsx`(의존성 0) · `main.jsx` 가 `App` · `Site` · `Console` 을 고름 · `styles/site.css` · `console.css` · `Icon` 열 개

**명부 v1.2** — `core/auth.js`
- `role` viewer · writer · admin(`write: true` 는 writer 로 읽힘) · 토큰 `status` active · revoked(폐기가 행으로 남는다) · `reissue` = 폐기 + 발급 · `tokenSet`
- 기본 만료 관리자 30일 · 나머지 90일 · 남은 일수는 달력 날짜 차이 · 가드 `E_LAST_ADMIN` · `E_SELF`
- 부트스트랩 코드 `<data>/bootstrap.code`(명부가 비었을 때만 · 쓰면 삭제) · 재인증 쿠키 `cdp_su`(15분 · `kind: sudo`)
- CLI `serve init`(첫 사용자 admin) · `user add/set --role` · `token reissue` · `token set` · `serve doctor` 에 관리자 수 · 관리자 토큰 30일 · 부트스트랩 · manual 줄

**서버** — `viewer/bin/ctx-mcp-serve.mjs`
- `/site/info` · `/site/manual/<파일>` · `POST /setup` · `POST /admin/sudo` · `/admin/*` 열여덟(overview · users · tokens · repos · workrepos · doctor · server · audit · log) — 비관리자 403 · 쓰기는 `cdp_su` 없으면 401 `E_REAUTH`
- `--manual <dir>` · `--private-pages` · `--admin-from <CIDR,…>`(관리 API 대역) · 속도 제한 `/login` · `/setup` · `/admin/sudo` 20/분 → 429 `E_RATE`(`core/net.js`)
- `buildRepo` 하나를 `POST /repos` 와 `POST /admin/repos` 가 같이 쓴다 · `core/reponew.js` `cloneRepo`(지식 레포가 아니면 지운다)
- `serve.log` 끝 열에 토큰 id · `auth.log` 콘솔 줄은 `admin <행위> · <행위자> · …` · `index.html` 에 `window.__CDP_SERVER__` · `/logout` → `/` · `GET /` 는 소개(레포로 보내지 않는다)
- 정적 자원은 인증 앞에서 낸다 · `linkify` 가 `install.sh` 같은 파일 이름을 주소로 삼지 않는다(`fuzzyLink` off)

**산출물 · 설치**
- `cdp-server-v*.tar.gz` 에 `manual/`(세 권 · 설치 절차 · 그림) · `install.sh` 가 끝에 `/setup` 주소와 부트스트랩 코드 · `upgrade.sh` 가 `manual` 도 갈고 되돌린다 · Dockerfile `COPY manual`
- `build-ctx` 가 `__CDP_VERSION__` 을 찍어 서버가 판을 안다

**문서**
- 관리자 설명서 3.5(마법사) · 3.7(세 얼굴) · 6장(콘솔 기준 · 셸은 같은 것) · 7.5 · 9.1(올리기 · 9.1.1 v0.9.0 → v0.10.0) · 11장 · 부록 A · B · C · 사용자 설명서 0장 · 1.4 · 2.1 · 8.1 · 8.8 · 8.9(새 판이 올라간 뒤 — 달라지는 화면) · 10.3 · 개발자 설명서 11.2 · 11.3 · 부록 C · 설치절차 5장 · 7장 · deploy README · 루트 README 「사이트 · 콘솔」
- MCP 설계서 §4.3 · §4.4.1 · §4.4.2 · §6.3 · §6.6.4 에 **정정** 상자(지우지 않는다) · 목업 `docs/dev/제품관리서비스_목업/`

**올리기 — v0.9.0 서버에서**
- `upgrade.sh` 한 번(`manual/` 도 갈고 `.bak` 한 세대) · 유닛은 그대로 — `manual/` 은 `bin/` 옆에서 찾는다
- 명부 v1.1 은 읽을 때 `write: true` → `writer` 로 접히고 첫 저장에서 `version: 1.2` 가 된다. **관리자가 0명**이라 콘솔이 잠겨 있다 — 셸에서 한 번 `ctx serve user set --name <아이디> --role admin`. 부트스트랩 코드 · `/setup` 은 명부가 빈 서버에만 있다
- 그 관리자의 옛 토큰은 90일이라 `doctor` 가 「관리자 토큰 … 30일 안으로 둔다」 를 낸다 — 콘솔 > 토큰 > [재발급]
- `GET /` 가 소개 페이지다(전에는 `/r/<레포>` 로 보냈다). `/r/<레포>/` 북마크 · 로그인 상태는 그대로 — 관리자 설명서 9.1

**검증**
- 테스트 87(auth 14 · net 3 · reponew clone) · 하네스 78~88(사이트 · 마법사 · `/admin/*` · 재인증 · 토큰 · 만료 · clone · v1.1 명부 · CIDR · 속도 제한) — ✓ 73 ✗ 0 – 16

## v0.9.0

제품화 1차 — [`docs/design/CDP_제품화_검토_v1.0.md`](docs/design/CDP_제품화_검토_v1.0.md) · [`docs/dev/제품화_TODO.md`](docs/dev/제품화_TODO.md)

**CI/CD**
- GitHub Actions `ci.yml`(push · PR: build · bundle · `npm test` · `check:packages` · `verify`) · `release.yml`(태그 `v*` → win zip · server tar.gz · SHA256SUMS → GitHub Release)
- 단위 테스트 `test/` 12파일(`node:test` · 의존성 0) · `npm test`
- 검증 하네스를 `npm run verify` 로 · fresh clone 에서 돈다(`ops/lib/seed-kit.mjs` 가 fixture 의 `.claude/` 를 Python 없이 만든다) · 52번(꾸러미 `kit/` 한 단) 수정 · 20번(번들 90일 경고) 살림 · 제품화 70~74 추가
- Node `>=20` 고정(`engines` · `.nvmrc`) · 번들 target `node20`

**산출물**
- 서버 산출물 `cdp-server-v<버전>.tar.gz`(`npm run release:server`) — `bin/` · `web/` · `packages/` · `deploy/`
- 조립 함수 하나(`ops/lib/assemble.mjs`)로 클라이언트 릴리스와 서버 산출물이 같은 지식 레포 폴더를 낸다
- `npm run release -- --no-build` — 조립만 다시
- 클라이언트 배포본의 `cdp.exe` 는 **루트에 하나**(2026-09-23) — 패키지마다 `tools/` 에 넣지 않는다. 조립은 빈 `tools/`(`.gitkeep`)를 남기고 받는 사람이 복사한다(설치.md ③). 패키지 셋에서 213MB → 75MB

**서버 설치**
- `ops/deploy/install.sh`(멱등 · node 경로를 유닛에 박음 · healthz 확인) · `upgrade.sh`(백업 · 교체 · 재시작 · built/자산 해시 대조 · 실패 시 되돌림)
- `ctx serve doctor` — 준비물 · 명부 · 레포 · origin 도달 · push 자격 · 포트를 한 번에 · `ctx serve init` — 첫 사용자 + 토큰
- `ops/deploy/Dockerfile` · `docker-compose.yml`(선택지)

**패키지**
- 매니페스트 `_package.json` · `ctx package list · show · check · new` · `core/packages.js`
- `ctx package check` 가 부어서 `ctx check` 를 돌린다 — CI 가 패키지마다 돈다
- `_managed.md` 파서가 설명 표(첫 칸에 `배치:` 같은 타입)를 규칙으로 읽지 않는다
- 복제 패키지 `project_1` · `project_2`(dpms 에서 · 2026-09-23) — 다중 패키지 경로 실측. `package new` 가 README 제목 · 출처를 함께 고치고 `convert/` 는 복사하지 않는다 · 릴리스 README 가 패키지 표를 낸다 · 화면의 새 지식 레포가 패키지를 **고르게** 한다 · `repo new` 와 `POST /repos` 가 없는 패키지 이름에 있는 것을 같이 낸다 · 하네스 74번이 `--all`
- `ctx package rename <이름> <새 이름> [--title]` — 폴더 · 매니페스트 · README 제목을 한 번에. 패키지 이름은 적용하는 프로젝트에 맞춰 바뀌는 것이 정상이고 `project_*` 는 자리표시자다. 패키지 이름 ≠ 지식 레포 이름

**지식 레포 생성**
- `ctx repo new <경로> --package <이름> [--origin] [--push]` · `ctx repo list --root` · `core/reponew.js`
- 서버 `GET /packages` · `POST /repos`(write) · 관리 서비스에 **지식 레포** 메뉴(서버판) — 목록 · 미러 상태 · 새 레포 세우기
- `ctx serve --packages <dir>`

**변환 · 이관**
- `ctx import-dir <원본> --repo <지식레포>` · `core/importdir.js` — md 폴더 → `work/` (평면화 · id · date 근거 · 필드 접기 · 자산 · 링크 재작성 · 결정론 · 검사 뒤 되돌림)

**MCP 클라이언트**
- `ctx setup --also <지식레포>`(한 항목에 레포 여럿) · `ctx setup --desktop`(Claude Desktop 설정 병합)
- 작업 레포 화면에 MCP 연결 상태 · `inspect().mcp`
- `brief` 가 90일 넘은 번들을 경고한다(CLI · MCP 같은 줄)

**끊김** — [`docs/dev/끊김_검토.md`](docs/dev/끊김_검토.md)
- `git.status()` 가 git 을 한 번만 띄운다(`status --porcelain=v2 --branch`) — 재스캔 · 포커스마다 서버가 0.3~0.6초 멈추던 것
- 전문 색인을 자체 구현으로(`core/search.js`) · 쓸 때 짓는다 — **`minisearch` 의존성 제거**. 점수 규칙은 같다
- `git fetch` 는 한 번에 하나 · 60초 안에는 다시 안 한다 · 포커스 새로고침은 15초에 한 번
- 본문의 표·코드 블록은 화면 근처에 온 것만 그린다(`content-visibility`) · 렌더 결과를 기억한다 — 표 수백 개짜리 문서 열기 2~4초 → 0.3초, 그래프에서 돌아오기 7초 → 0.3~0.5초
- 목차 — 현재 섹션을 프레임당 한 번 · 목차 목록만 스크롤 · 섹션 이동이 즉시 이동으로
- 그래프 배치를 다시 풀지 않는다

**고친 것**
- MCP 도구가 한글 타입 좌표(`테이블정의서:…`)를 `E_COORD` 로 거절하던 것 — dpms 레포의 좌표 전부가 그랬다
- `# 제목` 바로 아래 `## 첫 섹션` 의 applied 주석을 제목의 것으로 읽어 섹션 수가 하나 부풀던 것
- 조립이 `bin/ctx.cmd` 를 LF 로 바꿔 cmd.exe 에서 죽던 것 — `.mcp.json` 이 띄우는 파일이라 **모드 A 의 MCP 가 통째로 빠졌다**(설명서 걷기 2026-09-23). `.cmd` 는 바이트 그대로 담고, 지식 레포 `.gitattributes` 에 `*.cmd text eol=crlf`. 있는 레포는 그 한 줄을 넣고 `git add --renormalize .`
- `npm run release` 가 exe 안의 ctx 판과 번들 판을 대조한다 — 다르면 빠진 것으로 exit 1 (`--no-build` 뒤 exe 만 낡는 사고 · 같은 걷기에서 잡았다)
- 서버가 새 지식 레포 폴더를 그 이름의 첫 요청에서 바로 알아본다 — 전에는 1분 주기만이라 `repo new` 직후의 등록이 "그런 지식 레포가 없다" 였다
- 뷰어 exe 가 **자기가 든 지식 레포**(`<레포>/tools/cdp.exe`)를 연다 — 전에는 저장된 설정만 봐서 첫 더블클릭이 경로 지정 화면이었다
- 꾸러미 `install.mjs` 가 바뀐 것이 없어도 `CDP_TOKEN` 이 있으면 설치 대장에 보고한다 — pull 로 받은 사람도 한 번 돌리면 행이 `최신`. 사용자 설명서 2.1 은 토큰을 먼저 두게 순서를 바꿨다
- **헤딩이 두 번 들어가 섹션이 비던 것** — `section` 의 `body`(헤딩부터 실린 원문)를 그대로 고쳐 `save` 에 보내면 서버가 헤딩을 또 붙여 파서가 둘째 헤딩을 새 섹션으로 읽었다. save 는 성공하고 check 도 where 도 조용했다(실사용 2026-09-23). 셋을 두었다 — `section` 이 `content`(헤딩 · applied 없는 본문)를 준다 · `save` 가 섹션 레벨 이하 헤딩이 든 body 를 `E_INPUT` 으로 거절한다 · `ctx check` 가 같은 좌표 섹션 둘을 `dup-anchor` 오류로 낸다. 스킬 넷의 save 안내도 `content` 로

**문서**
- `docs/README.md`(보존 기준) · `CHANGELOG.md` · 설치 절차서를 스크립트 기준으로 · 시나리오 실측 출력과 이집이지 이관을 `docs/attic/` 으로
- 역할별 **제품 설명서** 세 권 — [`manual/`](manual/) 사용자 · 관리자 · 개발자. 원천은 여기, `agent/manual/` 은 레포 안 짧은 판

## v0.8.0 — 2026-09-19 (태그 없음)

- 좌표 타입을 어휘가 정한다 · 서식 예시는 좌표로 세지 않는다(`example:`)
- MCP 서버 두 모드(stdio · HTTP) · 명부 · `save` · 관리 서비스 · 설치 꾸러미 · 검증 하네스 51건 (2026-09-21~22)

## v0.7.0 — 2026-09-16

- 검색 세 갈래 · 상단 동기화

## v0.6.0 — 2026-09-16

- 관리 화면 — 현황 · 지식 레포 · 동기화 · 작업 레포 · 진단
- 동기화 순서를 `core/sync.js` 로 · 단계를 SSE 로 · `syncLog` `setupLog`

## v0.5.0 — 2026-09-15

- 왼쪽을 세 층으로 · 아이콘을 인라인 SVG 17종으로 · 토큰 재설계

## v0.4.1 — 2026-09-14

- 목차를 세워서 본문 옆에

## v0.4.0 — 2026-09-11

- 왼쪽이 한 번에 하나만 한다 · 그래프 전체화면 · 상단바 9→4

## v0.3.8 — 2026-09-09

- postject 선언 · 문서 정정

## v0.3.3 ~ v0.3.7 — 2026-09-09

- `ctx search` · 검토 출력에 주입 범위 · 파생 초안이 목차를 보인다 · `issue:` 누락 검사

## v0.3.2 — 2026-09-08

- 찾기만 · 뻗어나가기 접기 · 구 배치 · 이름 토글

## v0.3.1 — 2026-09-08

- 앱에서 작업 레포 세팅 · 경로 포인터(`.claude/cdp.json`)

## v0.3.0 — 2026-09-08

- `date` 에 시각 · 그래프 렌즈 배치

## v0.2.9 — 2026-09-08

- `MANUAL-시스템.md` 정본 · 스킬 실사용 예시

## v0.2.8 — 2026-09-08

- 읽기 전 최신 확인

## v0.2.7 — 2026-09-08

- `cdp-import` · `cdp-edit`

## v0.2.6 — 2026-09-08

- `status` 값 전면 폐지 · 같은 날 파생 누락 경고

## v0.2.0 ~ v0.2.5 — 2026-09-08

- 판정 모델 정리 · 폴더 재편 · 배포본 원클릭
