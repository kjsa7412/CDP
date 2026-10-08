# CHANGELOG

태그마다 한 절. 릴리스 노트는 여기서 나온다(`.github/workflows/release.yml`).
**무엇이 바뀌었나**만 적는다 — 왜는 커밋 메시지와 설계서에 있다.

## v1.0.0

**큐레이터 모델 · 쓰는 길 하나 · 레포에는 지식만** — 메이저다. 계획 `docs/design/CDP_v1.0_개편안.md` · 정본 `docs/design/CDP_시스템설계서_v2.0.md` · 절차와 결정 `docs/dev/v1.0_개편_TODO.md` §5 · 실서버 이행 `docs/dev/v1.0_실서버_이행_절차.md`. **올리기 전에 아래 「올릴 때」 를 본다.**

- **사용자는 작업 기록만 쌓고 관리 문서는 큐레이터가 반영한다** — writer 의 `save` 는 `work` · `vocab` · `assets` 만. 섹션 · 등록부 · 섹션 밖 손질 · 서식 예시 · 기준선은 **레포별 큐레이터**(명부 `users[].curate` · 서버 › 사용자 › 「레포 × 큐레이터」 · admin 은 어디서나)만 — 아니면 파일을 만지기 전에 `E_FORBIDDEN {need:'curate'}`
- **큐레이션 기록** — `work.curates: [{ id, verdict: reflect | new | keep, into, reason }]` 이 다룬 기록과 판정(반영 · 새 문서 · 기록으로 둠)을 남긴다. 반영한 좌표는 같은 save 의 섹션이어야 하고, 섹션의 `applied` 는 반영한 기록 중 그 좌표의 가장 늦은 것이며 뒤로 가지 않는다
- **대기열 · 미반영은 계산값** — 판정 없는 기록이 대기열, `later(applied)`(기록으로 둠 빼고) ∪ (대기열 ∩ 좌표) 가 그 섹션의 미반영. 늦은 반영은 막지 않고 `section` · MCP 리소스 · 프롬프트 · 화면이 미반영 기록을 섹션과 함께 낸다(섹션 제목의 「미반영 n」 · 작업 기록의 큐레이션 상태 · 상태줄 「대기 n」)
- **큐레이션 화면** — 큐레이션 › 대기열(판정 재료 · 비슷한 서식 · 「에이전트 지시 복사」 · 「기록으로 둠」 · 큐레이터 폴더 한 줄) · 이력 · 서식집. 판정과 섹션 쓰기는 큐레이터 자신의 Claude Code 세션(`cdp-curate`)이 한다 — 서버는 LLM 을 부르지 않는다
- **서식집** — 패키지 다섯을 걷고 `forms/` 묶음 넷 · 79종(+ 팀 서식 `<data>/forms`). 새 관리 문서는 제목 · 서식 표지 · 첫 문단만 찍는다(예시 · 작성지침은 서식에 남는다). 읽을 때 lint — 문제 있는 서식으로는 문서를 세우지 않는다 · `ctx forms list | show | check` · 큐레이터 도구 `forms`
- **기준선 블록** — 코드 · DB 에서 기계로 뽑은 사실은 섹션 안 `<!-- cdp:baseline -->` 블록에만. `ctx baseline extract | push` · `POST /api/<레포>/baseline`(큐레이터). 큐레이터의 save 는 블록을 지킨다
- **save** — 그 save 가 **새로 만든 오류**로만 막힌다(원래 있던 오류는 경고) · 커밋에 훅을 태우지 않는다 · writer 응답에서 큐레이터의 일(대기 오래됨)을 뺀다
- **MCP 도구 14 → 12** — derive · apply · sync · version 을 지우고 `queue` · `forms`(큐레이터만)를 더했다. 역할에 없는 도구는 보이지 않는다(viewer 9 · writer 10 · 큐레이터 12). `brief` 가 미러 · 역할별 kit 해시 · 번들 판을 낸다 · 레포 캐시가 HEAD 를 본다
- **스킬 7 → 5** — cdp-work · cdp-save(writer) · cdp-curate · cdp-registry(큐레이터) · cdp-push. SKILL.md 3,837 → ≈880줄 · writer 한 작업의 맥락 ≈51.8k → ≈16.3k자. kit 은 서버 번들에서 역할별로 나간다 — 등록된 작업 레포는 늘 writer kit · 큐레이터 폴더는 설치 한 줄 `--curator`(git · 대장 등록 없이)
- **모드 A 끝** — stdio MCP · 로컬 뷰어 · exe · 트레이 · `ctx setup` · CLI 쓰기 명령(index · docs drop · examples · derive · apply · sync · package · serve kit-refresh)을 걷었다(부르면 무엇으로 바뀌었는지 한 줄 · exit 2). 서버 없는 팀 · 한 사람은 **개인 서버** `ctx serve --personal <레포>`(127.0.0.1 · 명부를 스스로 만들고 첫 접속 주소로 로그인) — 개발 서버도 이것이다
- **레포에는 지식만** — 도구 층(bin · 훅 · 스킬 사본 · CLAUDE.md · MANUAL · TEMPLATE) · INDEX · 등록부 사본 · 서식 예시를 만들지 않는다. 새 레포는 **빈 틀**(README · `_vocab.md` · `_managed.md` · `docs/` · `work/` · `.gitattributes` · `.gitignore`) · 다시 세우기 `ctx repo new --records-from <옛 레포>`(기록 · 첨부 · 그 기록의 어휘만) · 제자리 이행 `ctx migrate <레포>`(전환 기록 하나 · 서식 예시 · 도구 층 걷기). 진단이 옛 도구 층을 알린다
- **화면** — 상단 바의 얼굴 스위처 · 레포 세그를 접히는 왼쪽 메뉴 하나로(지식 · 큐레이션 · 레포 관리 · 서버 · 설명서) · 역할 × 얼굴의 메뉴 표 · 얼굴은 주소 하나로 · 로컬 전용 화면 넷 걷음 · 색 예산 · 미러 lag 의 이름은 「origin 에 못 보냄」
- **산출물 둘** — 서버 tar(bin · web · forms · kit · manual · deploy · 3.0MB · 압축 0.8MB · 전 ≈14MB) · 사이트 zip. win zip · exe 는 없다. install · upgrade 가 forms · kit 을 web 처럼 갈아 끼우고 레포마다 도구 층을 갈던 단계는 없다. 배포 문서의 사내 값을 자리표시로
- **설명서 넷** — 사용자 · **큐레이터**(새 책) · 서버 관리자(부록 개인 서버) · 개발자. 설계 문서 v2 세트(시스템 설계서 v2.0 · MCP 설계서 v2.0 · 서식집 규약 v1.0 · 화면 설계서 v1.0) · 용어 v1.0 · 옛 문서 47개의 머리에 「v1.0 이후」 한 줄
- 시험 — 단위 368 · 하네스 ✓117 ✗0 skip 11(v1.0 항목 118~138 — 역할별 도구 · writer 경계 · 큐레이션 save · 기준선 · 역할별 kit · 빈 틀 · 다시 세우기 · migrate · 개인 서버 · 없앤 명령 · 팀 서식)

**올릴 때**
1. 서버 — `upgrade.sh` → `doctor` 의 「레포 … 도구 층」 warn 이 v0.x 레포다. 레포마다 **제자리 이행**(서버를 멈추고 `ctx migrate <레포> --dry` → `--dry` 없이 · 뒤에 콘솔 「다시 보내기」) 또는 **다시 세우기**(옛 레포 이름을 바꿔 두고 콘솔 「새 지식 레포」 · 「기록만 옮겨 오기」). 설치절차 10장 · `docs/dev/v1.0_실서버_이행_절차.md`
2. 서버 › 사용자 › 「레포 × 큐레이터」 — 레포마다 큐레이터를 맡긴다
3. 작업 레포마다 설치 한 줄 `--update`(writer 스킬 셋으로 바뀐다) · 큐레이터는 자기 폴더에서 `--curator`
4. `/opt/cdp/packages` 는 더 쓰지 않는다

## v0.25.0

**HTML 시각 자료를 지식 레포에** — `docs/design/CDP_HTML시각자료_검토_v0.1.md` · `docs/dev/HTML시각자료_TODO.md`
- **보안** — 파일 API 가 `.html` · `.htm` 을 sandbox CSP(불투명 출처 · `connect-src 'none'` · 외부는 글꼴 · cdnjs · jsdelivr · unpkg 만)로 낸다. 전에는 레포에 든 HTML 이 같은 출처로 나가 연 사람의 세션으로 스크립트가 돌았다
- 첨부로 HTML 을 받는다 — 올리기 API 가 바이트로 가리고(`<!doctype html` · `<html` · UTF-8) `save assets[]` 가 `work/assets/<id>/` 에 한 커밋. 경고 — 작업 기록 본문이 짧다(요지를 md 로) · 화면이 막는 외부 자원 · CDN(폐쇄망)
- 문서 머리 **「본문 | 자료」 탭** — 첨부 · 본문 링크의 HTML 을 모아 `<title>` 로 탭을 세우고, 고르면 본문 자리에 격리된 틀로 연다(새 탭 · 내려받기). 주소 `?v=` — 뒤로 가기가 본문으로. 본문의 자료 링크에 「자료」 표시 · 첨부 목록 「보기」 · 목록에 눈 표시. 화면 테마를 따른다(`&theme=` → 루트 `data-theme`)
- 스킬 — `cdp-save` 「HTML 시각 자료」(첨부 + 요지는 md) · `cdp-import` 한 줄 · MCP `save` 명함 · 사용자 설명서
- 시험 — `test/html-visual.test.mjs` · 하네스 116

## v0.24.0

**보던 문서로 돌아갈 수 없던 것** — `docs/design/CDP_문서이동_이력_검토_v0.1.md` · `docs/dev/문서이동_이력_TODO.md`
- 문서가 주소에 있다 — 로컬 `/d/<id>` · 서버형 `/r/<레포>/d/<id>`(섹션은 `?at=`). 브라우저 뒤로 · 앞으로 · 마우스 뒤로 단추 · `Alt+←` `Alt+→` 가 이전 · 다음 문서다(전에는 앱을 나갔다). 돌아가면 왼쪽(목록 범위 · 뻗어나가기 뿌리)도 그 문서를 볼 때로. 새로고침 · 주소 공유가 그 문서로 연다
- 본문 위 한 줄 — 「‹ 이전 <제목>」 · ▾ 최근 10건 · **열린 문서 탭**(찾기 · 검색 · 본문 링크는 더하고 뻗어나가기 · `j`/`k` 는 바꾼다 · 8개 · 📌 고정 · 닫기 · 모두 닫기 · 레포별 기억). 900px 아래는 「이전」 · 최근만
- `Alt+←` 가 검색칸 안에서 문서를 바꾸지 않는다 · `j`/`k` 훑기는 이력에 쌓지 않는다
- 본문 링크로 한글 이름 문서를 열면 「문서를 열 수 없습니다 · not-found」 였던 것을 고쳤다
- 로컬 서버 — `/d/…/x.md` 도 화면(index.html)
- 설명서 — 사용자 8.5 「문서 사이를 오가기」 · 단축키 표
- 시험 — `test/doclink.test.mjs`(주소 ↔ 문서 · 탭 규칙)

## v0.23.1

**실서버 종합 시험 v0.1 의 나머지** — `docs/design/CDP_실서버_종합시험_v0.1.md` · `docs/dev/실서버_종합시험_TODO.md` ⑤
- 콘솔 — 레포 이름 · origin 이 틀리면 칸 아래에서 까닭을 말한다(단추가 말없이 꺼져 있었다 · F10) · 토스트가 모달 위에(F14) · PAT 저장 자리의 `%3a` 를 푼다(F19) · 지식 레포 [접근] 이 사용자 표의 그 레포 열을 칠한다(F20) · 진단을 읽는 동안 「아직 검사하지 않았다」 대신 「읽는 중…」(F23) · 판 · 패키지 둘째 줄이 「·」 로 시작하지 않는다(L6) · 지식 레포 안내의 상태 다섯을 표로(W1) · 문구의 을/를 · 이/가 를 이름 끝소리에 맞춘다(W6) · 서버 로그 보기의 퍼센트 인코딩을 푼다
- 레포 화면 — 900px 아래에서 문서를 고르면 덮어 뜬 목록이 접힌다(F11) · 단축키 표기가 그 PC 의 키다(Windows 면 `Ctrl+K` · F17) · 「문서 N」 이 「작업 N」 · 「작업문서 N · 관리문서 M」(F18) · 그래프 자동 회전 기본 끔 · 카테고리 이름이 안 잘린다 · 라벨의 한글 글꼴(F16) · 목차에 백틱 · `**` 가 보이지 않는다(L7) · 뻗어나가기 열이 칸에 정수 개로 맞는다(L8) · 레포 홈 최근 기록 왼쪽 정렬(L9)
- 모달 몸통이 스크롤하고 바닥줄(세우기 · 저장)이 늘 보인다(L11) · 설명서 — 휴대폰에서 목차가 접히고 표 때문에 가로로 넘치지 않는다(L10) · 레포 한 줄 설명이 README 의 `>` · 링크를 벗기고 낱말에서 자른다(W2)
- 관리 문서 지우기 미리보기(dryRun)의 serve.log 등록부 줄에 「(미리보기)」(F15) · 소개의 도구 수(W3)
- 설명서 — 관리자 5.2(작업 레포 목록 · 삭제 · 설치 꾸러미 409) · 10.1(주소와 다른 레포에 쓴 save · 409 · 시계 어긋남 · 검증 빨강이면 그 레포 save 전부 거절) · 사용자 8.6(회전) · 8.8(900px)
- 시험 — `test/screen-fixes.test.mjs`(kbd · josa) · `test/serve-log.test.mjs`(레포 한 줄 설명)

## v0.23.0

**패키지가 사실상 하나였던 것** — `agent/packages/` — 셋 중 둘(`project_1` · `project_2`)은 `dpms` 를 이름만 바꾼 복제였고, 공공 SI 가 아닌 팀은 40종을 붓고 대부분 지우거나 패키지 없이 손으로 세워야 했다. 남은 하나의 이름은 사내 원천 폴더였다
- 패키지를 일하는 방식별 다섯으로 — `blank`(빈 레포 · 문서 0) · `public-si`(공공 SI 산출물 40종 · 옛 `dpms` · 1.1.0) · `agile-product`(애자일 제품 개발 14) · `cloud-native`(클라우드 네이티브 서비스 운영 13) · `ai-service`(AI · LLM 서비스 12). 복제 둘은 지웠다
- 새 셋 — 작업 기록이 ADR 이다(결정 문서를 따로 두지 않는다) · 코드가 정본인 것(OpenAPI · 마이그레이션 · IaC · 프롬프트 원문)은 `정본 위치` 만 · 같은 가상 업무 「(예시) 온라인 상점」 · 타입은 전부 한글 시작(MCP · save 가 받는 모양) · 고정 좌표(시스템아키텍처 넷 · `인프라:prod` `stg` `dev`)
- `public-si` 안의 원천 사업 기록(폴더 · 실물 셈)은 소스 레포 `docs/attic/dpms-패키지/` 로 — 받는 사람에게 가지 않는다
- 「패키지 이름은 자리표시자 — 프로젝트 이름으로 바꾼다」 를 「방식별 서식 — 프로젝트 맞춤은 세운 레포 안에서」 로(패키지 README · 콘솔 › 서버 · 설명서 · 소개 사이트)
- `ctx repo new` — 빈 패키지면 「다음 — 1. 첫 관리 문서를 세운다」 · `ctx package list` · `check` 의 이름 칸이 긴 이름에 맞는다
- **이미 세운 레포는 그대로다** — 레포는 패키지의 사본이다. upgrade 가 서버 `packages/` 를 통째로 갈아 끼우므로 `dpms` 는 콘솔 선택지에서 사라지고 같은 40종이 `public-si` 로 선다. 배포본은 `knowledge-repo-<패키지>/` 다섯

**실서버 종합 시험 v0.1 의 결함** — `docs/design/CDP_실서버_종합시험_v0.1.md` · `docs/dev/실서버_종합시험_TODO.md`
- 레포 관리 › 작업 레포가 그 지식 레포의 것만 보이고 설치 명령 · 꾸러미가 **행의 레포**로 나간다 — 다른 레포 화면에서 열면 `--repo` 가 화면의 레포로 나가 작업 레포가 엉뚱한 지식 레포에 붙었다(F1)
- serve.log · 콘솔 최근 기록의 레포 칸이 실제로 쓴 레포다 — 전에는 `/mcp/<주소>` 의 레포였다(F2) · 상대 시각 · 만료 D-n 이 서버 시계 기준이고 콘솔 개요가 PC 시계 차이를 알린다(F4)
- 토큰 화면 — `?user=` 로 연 뒤 창을 닫을 때마다 발급 창이 다시 떠 토큰이 하나 더 생기던 것(F3) · 발급 창의 기본 사용자가 나였던 것과 만료 단추 순서가 역할마다 바뀌던 것(F13) · 만료 기본이 토큰 주인의 역할을 따른다(F12)
- 휴지통으로 보낸 지식 레포의 작업 레포 등록을 지울 길이 없던 것 — 콘솔 「지식 레포 없음」 칩 · [삭제] · 레포 화면 행의 [삭제](F5) · 감사에서 웹 화면 등록의 행위자가 「(셸)」 이던 것(F6)
- 서버형 검증 패널의 「git 훅이 설치되지 않음」 · 검증 단추 제목을 서버형 말로(F7 · F8) · 관리 문서를 지운 뒤 「검증 N」 · 문서 목록이 옛 값이던 것(F9)
- 한글이 음절마다 끊기던 것 — 어절로 끊는다 · 죽은 `.field` 규칙 · 고정폭 글꼴의 한글 폴백 · 문서 고르기 칸(L1 · L2 · L3 · L5) · 인자 형식에서 거절된 save 가 콘솔 최근 기록에 「기록됨」 으로 뜨던 것

- 시험 — `test/packages-shipped.test.mjs`(나가는 패키지마다 README 문서 표 · 타입 모양 · 고정 좌표 섹션 · 예시 뺀 뒤 검사 · 사내 흔적) · `test/serve-log.test.mjs` · `test/screen-fixes.test.mjs` · 하네스 70 · 72 · 74 가 다섯 패키지로
- 검토 · TODO — `docs/design/CDP_패키지_재편_검토_v0.1.md` · `docs/dev/패키지_재편_TODO.md`

## v0.22.0

**안 쓰는 관리 문서를 지울 길이 없던 것** — `core/save.js` · `core/managedops.js` · `core/docdrop.js` · `core/docrefs.js` — 패키지 40종을 다 쓰는 사업은 드문데 서버형에는 문서를 지우는 연산이 없었고(`retire` 는 행만 · `merge` 는 서식을 남의 문서로 옮긴다), 셸에서 파일만 지우면 그 문서를 가리키던 「어디로」 표 · README 목록 · `_vocab` 판정표가 그대로 남았다
- `save` 입력 `managed: [{ op: "drop", doc, reason? }]`(admin) — 파일 · 그 문서를 가리키는 등록부 행 · 그 문서로만 가던 예시 좌표를 한 커밋에 지우고 `_managed.md` 끝 「지운 관리 문서」 표에 남긴다. 작업 기록이 쓴 섹션 · `touches` 이력이 있는 문서는 거절(`merge` · `retire` 로)
- 그 문서를 가리키는 다른 줄(링크 · 백틱 이름 · 관리번호)은 같은 save 의 `edits` 로 고치거나 `managed[].reviewed` 로 알고 둬야 커밋된다 — 남으면 `E_INPUT { refs: [{ file, line, text, kind, suggest }] }`(`drop-row` · `unlink` · `review`) · 같이 지우는 문서끼리의 참조는 뺀다
- `save` 입력 `dryRun: true` — 계획 · 거절 · 검사까지 돌고 커밋하지 않는다. 응답 `dropped.refs[].edit` 이 제안의 edits 초안
- `edits` 가 레포 뿌리의 md(`README.md` · `관리번호.md`)도 받는다(도구 층 · `INDEX*` 제외)

**문서를 지워도 검사가 침묵하던 것** — `core/check.js` — 등록부 행이 없는 파일을 가리켜도 「오류 없음」 이었고, 그 타입에 작업 기록이 처음 닿는 순간 레포의 모든 커밋이 막혔다
- `registry-missing`(행이 없는 파일을 가리킨다) · `doc-ref-dangling`(없는 관리 문서로 가는 링크 · 지운 문서의 이름) — 둘 다 경고

**어느 문서를 쓰는지 볼 곳이 없던 것** — `core/docusage.js` · `viewer/src/components/admin/Docs.jsx` · `viewer/src/console/Repos.jsx`
- MCP `docs` 목록의 문서마다 `usage` — 작업 기록이 쓴 섹션 · 닿은 작업 기록 · 들어오는 참조 · 필수 제출 · 마지막 변경 · `state`(`쓰는 중` · `서식 그대로`). 도구 수는 14 그대로
- 레포 › 관리 › 「관리 문서」 — 목록 · 거르기 · 사용 현황 / admin 은 골라서(같은 묶음 제안) 미리보기 → 줄마다 「행 지우기 · 링크만 풀기 · 알고 둔다」 → 사유 → 지우기 · 「지운 관리 문서」 기록
- 콘솔 새 레포의 「문서 고르기」 — 안 쓸 문서의 체크를 풀면 세움 커밋 다음에 「세울 때 뺀 관리 문서」 커밋 하나로 지운다
- HTTP `GET /api/<repo>/managed-docs` · `POST /api/<repo>/docs-drop`(admin) · 모드 A `ctx docs`(사용 현황) · `ctx docs drop <문서…> [--dry-run] [--apply-suggest]`

- 스킬 — `cdp-managed` 「문서 정리」(후보 표 → dryRun → 줄마다 판정 · 산문은 고쳐 쓴다 → 승인) · `cdp-save` 【등록부 변경】 의 지우기 줄
- 패키지 README 셋의 「첫날」 — 지우기를 한 번에(서버형 화면 · 셸 · 에이전트) · 「2를 빠뜨리면 조용하지 않다」 를 고쳤다
- 하네스 115 · `test/docs-drop.test.mjs`
- 검토 · TODO — `docs/design/CDP_관리문서_정리_검토_v0.1.md` · `docs/dev/관리문서_정리_TODO.md`

## v0.21.0

**등록부를 바꾸면 사본 문구가 거짓으로 남던 것** — `core/regen.js` · `core/save.js` · `core/check.js` — `managed: add` 로 행을 더해도 문서 머리 표의 `등록부` 칸(「비대상」)과 `_vocab.md` 의 타입 목록 · 규칙(「`회의록:` 타입이 없다 · 13개가 전부다」)은 그대로였고 고칠 길도, `check` 가 잡을 규칙도 없었다
- 머리 표의 `| 등록부 | … |` 칸과 `_vocab.md` 의 `<!-- cdp:registry -->` 블록을 **등록부에서 찍는다** — save 마다(같은 커밋) · 모드 A 는 `ctx index`. 뜻이 같으면 안 고치고 「비대상 — 사유」 는 남긴다
- `managed: add` 가 새 행과 어긋나는 산문(대상 문서 머리말의 「비대상 · 1:1로 대응하지 않는다」 · `_vocab` · `_managed` 의 「`T:` 타입이 없다」 · 개수 주장)을 찾아 `E_INPUT { lines: [{ file, line, text, why }] }` — 같은 save 의 `edits` 로 고치거나 `managed[].reviewed: ["파일:행"]`
- `check` — `registry-head`(사본이 등록부와 뜻이 다르다 · 오류) · `registry-prose`(어긋나 보이는 산문 · 경고)
- 패키지 3벌의 `_vocab.md` · `_managed.md` 에서 목록 · 개수 사본을 걷고 「지금 등록부」 생성 블록을 둔다

**좌표 섹션 밖을 쓰는 길** — `core/edits.js` · `core/save.js` — 서버형에서 문서 머리말 · 등록부 밖 문서(회의록 같은 날짜축) · `_vocab.md` 산문을 고칠 수 없던 것
- `save` 입력 `edits: [{ file, old, new }]` — `old` 가 정확히 한 번 나오는 자리를 바꾼다(없으면 `E_CONFLICT` · 여럿이면 `E_INPUT`) · CRLF 파일은 줄끝 그대로 · 20건 · 작업 기록과 한 커밋
- 못 건드리는 자리 — 좌표 섹션 · applied 주석 · 어휘 줄 · 등록부 행 · 생성 블록 · 문서 전체(—) 문서 · 작업 기록

**서식 예시를 writer 가 지운다** — `core/examples.js` · `core/save.js` · `core/reponew.js` — `check` 는 「예시를 지운다」 고 시키는데 서버형에는 그 연산이 없었다(`retire` 는 admin 의 등록부 연산)
- `save` 입력 `examples: "purge"` — `example:` 어휘 줄 + 짝 섹션 + 제목에 「(예시)」 가 있는 섹션을 한 커밋에. 작업 기록이 쓰는 예시 좌표는 표시만 뗀다(`kept`) · 표의 행으로 남은 예시는 `left` 로 알린다
- 모드 A `ctx examples [--purge]` · 세울 때 `ctx repo new --no-examples` · 콘솔 「새 지식 레포」 의 「서식 예시 — 빼고 세운다」

**문서 조회 도구** — `core/tools.js` · `viewer/bin/ctx-mcp.mjs` — 관리 문서 목록 · 비대상 문서를 볼 MCP 도구가 없어 뷰어의 HTTP API 를 토큰으로 부르던 것
- MCP `docs`(도구 14) — 문서마다 경로 · 관리번호 · 등록부 대상인지 · 걸린 패턴 / `doc` 을 주면 그 문서 원문 · 헤딩(좌표 섹션이면 `coord`) · `ctx docs`
- `match` — 좌표가 안 잡힌 이름은 문서 이름 · 관리번호 · 제목을 대 보고 `docs` 를 싣는다(`match(["회의록"])` → `BM_411`)

**기본 레포 어긋남 · 경고의 해법** — `viewer/bin/ctx-mcp.mjs` · `core/setup.js` · `core/check.js` · `viewer/src/components/CheckView.jsx`
- `brief({ repo })` 의 `repo` 가 이 연결(`.mcp.json` 의 `/mcp/<이름>`)의 기본과 다르면 경고 줄 · 설치가 기존 `.mcp.json` 의 다른 레포를 바로잡으면 계획에 그 줄
- `check` 의 finding 에 `fix`(누가 무엇으로 치우나) — 화면 「검사」 가 라벨 아래에 보인다 · save 의 「새 어휘 타입」 경고에 뒷말

- 스킬 — `cdp-save` 【등록부 변경】 의 「영향 문구」 · 「섹션 밖 쓰기」 · ⑤B-0 `brief({ repo })` / `cdp-import` ③-6 영향 문구 / `cdp-edit` 예시 4 를 모드 A · B 로 가르고 못 하는 일은 승인 전에 / `cdp-managed` 「서식 예시 정리」 · `docs`
- 하네스 113 · 114 · `test/save-registry-copy.test.mjs`(이번 사례를 dpms 패키지 · writer 로) · `test/regen.test.mjs`
- 검토 · TODO — `docs/design/CDP_등록부사본_모순_검토_v0.1.md` · `docs/dev/등록부사본_TODO.md`

## v0.20.0

**본문 그림이 안 보이던 것** — `viewer/src/lib/markdown.js` · `viewer/src/components/DocView.jsx` · `core/repopath.js` — `![설명](../work/assets/…png)` 가 화면 주소 기준으로 풀려 레포에 파일이 있어도 전부 깨진 그림이던 것(파일은 파일 API 로만 나온다)
- 상대 경로는 **그 문서의 폴더 기준** · `/…` 와 `docs/…` · `work/…` 는 레포 루트 · 퍼센트 인코딩 · 꺾쇠(`(<…/시스템 개요.png>)`)를 푼다. 첨부 목록과 같은 함수
- 못 읽은 그림은 「그림을 찾을 수 없음 · <경로>」 상자(레포 밖이면 그 말로) · 그림을 누르면 원본 · 본문의 pdf · xlsx 링크는 파일로 연다(전에는 그 이름의 문서를 찾았다)
- 파일 API 의 `.svg` 에 `content-security-policy: sandbox` · 설명서 화면의 상대 그림은 GitHub raw 로

**첨부를 서버가 받는다** — `core/assets.js` · `core/save.js` · `viewer/bin/ctx-mcp-serve.mjs` · `viewer/bin/ctx-mcp.mjs` — 서버형에는 그림 · pdf 를 들일 길이 없어 지식 레포를 받아 커밋 · push 하고 「origin 과 맞추기」 를 해야 했던 것
- `POST /api/<repo>/assets` — 몸통 = 파일 바이트(`curl -H "Authorization: Bearer $CDP_TOKEN" --data-binary @파일`) · writer 이상 · png · jpg · gif · webp · pdf 를 내용으로 가린다(svg 415) · 10 MB(413 · `Expect: 100-continue` 도) · `<data>/staging/` 에 24시간 → `{ ref, size, type }`. 레포는 바뀌지 않는다
- `save` 입력 `assets: [{ ref, name }]` — `work/assets/<id>/<name>` 에 작업 기록 · 섹션과 **한 커밋**, 검사에서 걸리면 같이 되돌린다 · 작업 기록 `attachments` · 응답 `assets: [{ path, size }]` · 20개 · 합 30 MB
- 경고 둘 — 이 save 가 쓴 본문의 그림이 레포에 없다 · 올린 첨부를 어느 본문도 가리키지 않는다
- 스킬 `cdp-save` 「그림 · 첨부」(모드 A 복사 · 모드 B curl → assets) · `cdp-edit` · `cdp-import` 가 가리킨다 · `save` 명함 · 사용자 설명서 6.5 · 8.5 · 관리자 설명서 부록(staging)
- 하네스 112 · `test/save-assets.test.mjs`
- 검토 · TODO — `docs/design/CDP_그림첨부_검토_v0.1.md` · `docs/dev/그림첨부_TODO.md`

## v0.19.3

**새 어휘 타입은 서버가 만든다** — `core/save.js` — `save` 의 `vocab` 에 `_vocab.md` 에 없는 타입(`term:PLC` 인데 `## term` 이 없다)이 오면 `E_INPUT` 「타입은 사람이 먼저 만든다」 로 거절하던 것. 서버에만 있는 레포는 사람이 커밋할 곳이 없고 초기에는 새 타입이 계속 는다(dpms_wiki · 도메인 지식 편입이 막혔다) — `d140164`
- 타입 섹션이 없으면 `_vocab.md` 끝에 `## <타입>` 을 만들고 항목을 붙인다. 같은 save 의 다음 항목은 그 섹션에 붙는다. 응답 `warnings` 에 「새 어휘 타입 … 을 만들었다」
- 형식(`checkCoord`) · 좌표 등재 · 등록부 대조는 그대로 — 관리 문서(등록부)가 없는 타입은 `touches` 로만 닿고 `sections` 는 못 쓴다

**관리 문서를 서버가 만들고 붙이고 정리한다** — `core/save.js` · `core/managedops.js` · `core/managed.js` · `core/check.js` — 패키지가 깐 관리 문서는 프로젝트 전체를 덮지 못하는데 서버에만 있는 레포는 새 타입의 좌표를 받을 관리 문서 · 등록부 행을 만들 길이 없었다(`sections` 는 `E_INPUT 등록부에 걸리지 않는다`, 설계서 §4.5 「`_managed.md` 는 `save` 로 바꾸지 않는다」) — `c1d29ec`
- `save` 입력 `managed[]`(선택) — `add`(기본 · writer): 등록부 **맨 끝**에 행 · 4번째 칸 `서버 추가 · <작업 기록 id>` · 문서가 없으면 `# 제목` 으로 생성, 어휘 · 섹션 · 작업 기록과 **한 커밋**. `rename` · `merge` · `retire`(admin): 문서 이름 바꾸기 · 합치기 · 행 폐기(문서는 남는다)
- 쓰기 전에 거른다 — 경로는 `docs/…md` 만(`..` · 절대경로 · 예약 이름 거절) · 앞 행에 완전히 덮이는 패턴 거절(일부 겹침은 경고) · 한 문서는 한 레벨 · 같은 패턴이 다른 자리에 있으면 `E_CONFLICT { kind: 'managed', current }` · 새 행이 걸리는 기존 좌표의 섹션은 같은 save 가 보낸다(`E_INPUT { needSections }`). 검사에서 걸리면 등록부 · 새 문서 · 옮기고 지운 문서까지 전부 되돌린다
- `check` — `registry-path`(레포 밖을 가리키면 오류) · `registry-outside` · `registry-shadowed`(덮인 행) · `registry-level-mix` 경고. 등록부가 준 문서 경로는 `save` 가 레포 밖으로 쓰지 않는다
- 새 섹션의 `heading` 은 제목 줄 전체(`값 — 설명`) — 값이 빠지면 `E_INPUT`(앵커 없음 `E_CHECK` 였다)
- 스킬 — `cdp-save` · `cdp-import` 의 【좌표 판정】 승인에 【등록부 변경】(새 타입 · 새 관리 문서 · 좌표 부착)을 같이 받는다 · `cdp-managed` 「구조 정리」(admin) — `af378a0`
- 패키지가 세운 행 · 문서는 upgrade 가 덮지 않는다(도구 층만 간다 · 시험). 화면은 바뀌지 않는다
- 검토 · TODO — `docs/design/CDP_관리문서_동적생성_검토_v0.1.md` · `docs/dev/관리문서_동적생성_TODO.md`

## v0.19.2

**배포본의 사내 흔적** — `agent/install.md` · `agent/manual/*.md` · `agent/skills/*/SKILL.md` · `viewer/bin/ctx-cli.mjs` · `ctx-mcp-serve.mjs` · `core/*` 주석 · 오류 문구 — 받는 곳에 가는 세팅 · 도움말 · 예시에 사람 이름 · 서버 주소 · 레포 이름 · 고객사 화면 · 스키마 · 업무 말이 그대로 실리던 것
- 사람 → lead · dev.a · dev.b · 서버 → `cdp.example:7374` · GitLab → `<gitlab>` · 작업 레포 → `C:\work\alpha` · 외부 ERP 이름 → 「외부 ERP」 — `aa1e301`
- 화면 · 코드 · 테이블 이름 → 일반 예시(`BZD020` · `HRC043` · `hr_ext_emp_mst` · `screen:HR*` …). 등록부 예시의 prefix 묶음 · 코드 블록 열 맞춤은 그대로 — `2e910ee`
- 업무 말 → 어느 조직에나 있는 말(출장보고 · 심의회 · 운영위 · 사업계획) — `c610971`
- `ctx setup` 사용법 예시 · `storeCredential` 호스트 형식 오류의 예시 주소가 바뀐다. 동작은 그대로
- 남은 것 — `manual/*.md`(제품 설명서 세 권) · `ops/deploy/설치절차.md` 는 사내 서버 실행 절차라 따로 판단한다

**정정 관계 양방향** — `core/store.js` · `viewer/src/components/ValidityBlock.jsx` 외 — 작업 기록 머리와 뻗어나가기에 「이 기록을 정정한」 · 「이 기록이 정정한」 을 싣는다 · 요약 복사(⇧C)가 정정 관계를 참조 목록으로 쓴다 — `382ac20`

## v0.19.1

**동시 save 의 index.lock 경합** — `core/git.js` · `core/save.js` — 뮤텍스 밖의 읽기(미러 큐 · doctor · 개요 · `/repos`)가 `git status` 로 색인을 고쳐 쓰며 `.git/index.lock` 을 잠깐 쥐어, 겹친 save 가 `E_GIT` `Unable to create '…/index.lock': File exists` 로 거절되던 것(하네스 91 · 가끔)
- 읽기 `status` 는 `--no-optional-locks` — 색인을 쓰지 않는다. 쓰기(add · commit · checkout · clean · reset · pull)는 그대로
- save 10단계 — 남이 쥔 index.lock 때문에 add · commit 이 시작도 못 했으면(HEAD 그대로) 잠금이 풀린 뒤 두 번까지 다시 커밋한다
- `test/save.test.mjs` — 색인을 안 고쳐 쓴다 · 가짜 index.lock 을 쥔 동안의 save · 동시 save 중 status 두드리기 — `e379eb3`

**하네스** — `ops/verify/run.mjs` — 서버가 받을 때까지 기다린다(고정 2.5초 대신) · 93 은 앞 save 의 미러가 끝난 뒤 clone · 미러 로그 줄 · 미러 대기 30초 · 실패에 stderr 한 줄 — `69ff1a3`

## v0.19.0

에이전트 세팅 갱신 — [`docs/dev/에이전트세팅_갱신_TODO.md`](docs/dev/에이전트세팅_갱신_TODO.md). 작업 레포에 가는 kit 은 **지식 레포 안의 `.claude/skills`** 에서 나온다 — 스킬을 고친 판을 올려도 레포가 옛 판이라 작업 레포가 옛 스킬을 받던 것

**upgrade 가 도구 층을 간다** — `ops/deploy/upgrade.sh` · `core/toollayer.js`(새) · `viewer/bin/ctx-serve-kit.mjs`(새)
- 멈춤 → `ctx serve kit-refresh` → 켬 — 레포마다 `.claude/skills/cdp-*` · 작업 레포 규약 · `CLAUDE.md` · `TEMPLATE-work.md` · `MANUAL*.md` · 훅 · `bin/ctx*` · `.gitattributes` 를 새 `packages/` 판으로 한 커밋(작성자 `cdp`) · `--mirror` 면 origin 에. 지식(`_vocab` · `_managed` · `docs` · `work`)은 그대로
- 트리 더러움 · origin 앞섬이면 건너뛰고 사유 한 줄 · 새 판이 안 떠서 되돌리면 옛 판으로 한 번 더 · `--no-kit`
- 콘솔 › 지식 레포 — `에이전트 세팅 다름 N` 칩 · 건너뛴 사유 · [에이전트 세팅 갱신](재인증 · 뮤텍스 · `auth.log`) · 현황 경고 · 진단 줄

**작업 레포 일괄 갱신** — `viewer/bin/cdp-install.mjs` · `core/localreg.js`(새) · `viewer/src/components/admin/WorkReposServer.jsx`
- 설치기가 설치할 때마다 그 PC 의 설치 목록(`%APPDATA%\cdp\workrepos.json` · `~/.config/cdp/workrepos.json`)에 적는다
- `--update` — 그 PC 에 이 서버로 설치한 작업 레포 전부를 계획 → 한 번 묻고 → 적용 → 레포마다 대장 보고 · `--commit` 은 바꾼 파일만(고치던 파일이 있는 레포는 커밋 안 함) · `--dry`
- 관리 › 작업 레포 — 낡음이 있으면 맨 위에 담당자별 「일괄 갱신」 카드 · cdp-load ⓪ · `sync` 명함이 이 한 줄을 가리킨다

**커밋 시간 초과** — `core/git.js` · `core/save.js` — 훅이 20초를 넘기면 Windows 에서 실행기만 죽고 진짜 git 이 뒤늦게 커밋해 빈 커밋 + 옛 파일이 남던 것. 시간 초과 때 git 을 프로세스 나무째 멈추고 HEAD 로 판정한다(save · 도구 층 둘 다) · 도구 층 커밋은 180초 — `ea387c1` · `4f3d33d`

**문서** — 관리자 설명서 9.1 · 9.2(로컬형도 스킬을 덮는다) · 9.3 · 설치절차 10장 · 사용자 설명서 · 설계서 6.7.4

## v0.18.0

편입 때 좌표 누락 방지 — [`docs/dev/좌표누락_TODO.md`](docs/dev/좌표누락_TODO.md). 지식 문서를 결정 문서 기준으로 판정해 `touches: []` 가 경고 없이 커밋됐던 것(dpms_wiki `b5a1fc6`)

**`save`** — `core/save.js` · `viewer/bin/ctx-mcp.mjs`
- `touches` 가 비면 `E_INPUT { field: 'work.touches' }` — 정말 0개면 `work.touchesEmpty` 에 사유(커밋되고 경고 한 줄 · 프론트매터 `touchesEmpty:`). `touches` 와 같이 보내면 `E_INPUT`
- `work.source`(편입한 원문의 출처) — 프론트매터 `author` 다음 줄 · 있으면 시각 없는 `date` 경고를 내지 않는다
- 프론트매터 값(title · author · source · touchesEmpty · tags)은 YAML 이 깨지는 글자가 있으면 인용 · 빈 좌표는 `touches: []`
- 명함 — `save` 에 「부르기 전에 【좌표 판정】을 보이고 승인」 · `match` 의 `미등재` 는 기록 중이면 등재 후보 · `where` 의 `registry: null` 이면 `touches` 가 유일한 길

**스킬** — `cdp-import` ③ 을 ③-1~③-6(문서 성격 · 「정의했다 → O」 · 답 읽는 법 · 0개면 멈춤 · 승인 필수) · 좌표 누락은 정정 기록 · 도메인 지식 문서 예시 / `cdp-save` ⑤B-0 승인 필수 · `TEMPLATE-work.md` 두 줄

**그 밖** — 파서 · `work` 도구 · `ctx import` · 기록 화면이 `source` · `touchesEmpty` 를 안다(「원문 출처 — …」 · 「좌표가 없다 — … 사유」) — `5af7753`

## v0.17.0

**소개에 「MCP 가 도는 길」** — `viewer/src/site/McpFlow.jsx`(새) · `viewer/src/site/Landing.jsx` · `viewer/src/styles/site.css`
- 소개(`/`) 맨 아래 — tools/list 에서 tools/call 까지 열두 걸음의 순서도(모델 · Claude Code · cdp 서버 · core/)
- 화살표나 [이전] · [다음](키보드 Enter · Space)을 누르면 그 구간의 실제 요청 · 응답과 설명이 오른쪽에 뜬다 — MCP 구간(JSON-RPC over HTTP · Bearer) · 모델 API 구간 · 서버 안
- 예시 `Host` 는 연 서버 주소 · 레포 이름은 `<레포>`(소개는 집계만) · 900px 아래는 한 열 — `4a68b91`

## v0.16.0

설치 한 줄 — [`docs/dev/설치_한줄_TODO.md`](docs/dev/설치_한줄_TODO.md). 토큰 원문은 화면 · 명령 · 설치기 어디에도 없다 — §4.4.1 그대로

**작업 레포 설치가 명령 한 줄** — `viewer/bin/ctx-mcp-serve.mjs` · `viewer/bin/cdp-install.mjs` · `core/tokenstore.js`(새) · `viewer/src/components/admin/WorkReposServer.jsx`
- 관리 › 작업 레포 › `[설치 방법]` — 작업 레포 폴더에서 붙여넣는 한 줄(PowerShell · 명령 프롬프트 · macOS/Linux 탭 · 주소 · 레포 · 등록 id 가 채워져 있다). zip 은 「Node 가 없거나 손으로 옮길 때」 로 접었다
- `GET /install.mjs` — 인증 앞 · 설치기 전문과 서버 주소 한 줄뿐(레포 이름 · 사람 · kit 없음) · `GET /kit/<레포>?workrepo=<id>&as=json` — 설치기가 토큰으로 받는 같은 kit(zip 과 같은 판정)
- 설치기가 **토큰을 묻는다** — `CDP_TOKEN` 을 `/me` 로 확인 · 없거나 안 통하면 숨김 입력(세 번) · 통하면 이 PC 에 둘지 묻는다(Windows 사용자 환경변수 — 원문은 표준 입력으로 · macOS/Linux `~/.config/cdp/token` 600 + rc 한 줄) · `--no-save` · 대장 보고는 확인된 토큰으로
- zip 안 `install.mjs` 도 같은 토큰 단계(Enter 로 건너뛰면 보고만 빠진다) · 꾸러미 `설치.md` 를 그 순서로
- `.claude/settings.local.json` 의 `env` 는 쓰지 않는다 — 실측(Claude Code 2.1.92)으로 `.mcp.json` 의 `${CDP_TOKEN}` 을 채우지 않았다

**문서** — 사용자 설명서 2.1 · 관리자 설명서 5.2 · 9.3 · 명령 목록

**그 밖** — 설명서 첫 권 · 역할별 첫 화면(로그인 뒤 admin 은 콘솔 · 나머지는 레포 · `next` 가 로그인 · 마법사로 되돌아가지 않는다) · http 배치에서 복사(`viewer/src/lib/clip.js` — `navigator.clipboard` 가 없으면 `execCommand` · 그것도 안 되면 값을 보여 준다) — `cb95c73`

## v0.15.0

git 자격 — [`docs/dev/git자격_TODO.md`](docs/dev/git자격_TODO.md). 비밀(개인 키 · PAT)은 브라우저를 건너지 않는다 — 제품관리서비스 검토 D8 그대로

**SSH 배포 키 — 콘솔 › 서버 › git 자격** — `core/gitauth.js`(새) · `viewer/bin/ctx-mcp-serve.mjs` · `viewer/src/console/GitAuth.jsx`(새) · `Server.jsx` · `Repos.jsx`
- 「배포 키 만들기」(`POST /admin/gitauth/key` · ed25519 · `<data>/ssh/` · 화면에는 공개 키 · 지문만 · 「새로 만들기」 는 옛 키를 `.old-<시각>` 으로) — 만들면 ssh 원격 레포에 바로 건다
- 「호스트 키 받기」 → 지문 → 「이 지문을 믿는다」(`/admin/gitauth/scan` · `/trust` — 믿을 때 다시 받아 같은 지문만 쓴다 · 다르면 409 `E_CHANGED`) · 「접속 확인」(`/admin/gitauth/test` · `ls-remote`)
- 키는 **레포마다 로컬 `core.sshCommand`**(`IdentitiesOnly` · 전용 `known_hosts` · `StrictHostKeyChecking=yes` · `BatchMode`) — 전역 ssh · git 설정은 그대로. 연결 · clone · 세우기가 ssh 주소면 건다
- 「origin 연결」 창이 이 주소로 모자란 자격(키 없음 · 호스트 안 믿음 · 그 호스트의 PAT 없음)을 누르기 전에 말한다
- `GET /admin/gitauth` — 키 · 믿는 호스트 · PAT 가 저장된 호스트와 계정(비밀 없음) · 레포마다 ssh 인가 · 키가 걸렸나

**PAT — `ctx serve git-auth`** — `viewer/bin/ctx-gitauth.mjs`(새) · `ctx-cli.mjs`
- `--host <h:p> --user <계정> [--scheme] [--file] [--test <url>] [--yes]` — 숨김 입력(또는 파이프 한 줄) · `.git-credentials` 600 · `credential.helper store --file=…` · 같은 호스트 줄은 바꾼다 · 다른 helper 가 있으면 멈춘다
- `--ssh --data <dir> [--rotate]`(콘솔과 같은 키) · `--list [--data]`

**그 밖** — `core/git.maskUrl` 이 ssh 계정(`ssh://git@…`)은 남긴다(비밀이 아니다 · 전에는 `ssh://***@`) · 세우기 · clone · 연결의 push 가 자격 프롬프트에서 멈추지 않는다(`GIT_TERMINAL_PROMPT=0`)

**문서** — 관리자 설명서 3.3 「SSH 배포 키(콘솔) · PAT(명령 한 줄)」

## v0.14.0

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
