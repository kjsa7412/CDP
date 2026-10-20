# 지식 생성 · 작업실 — TODO

검토: [CDP_지식생성_작업실_검토_v0.1.md](../design/CDP_지식생성_작업실_검토_v0.1.md) (G1~G19 · Q1~Q4)

판마다 끝에 전체 시험(`node --test test/*.test.mjs`) · 하네스 · CHANGELOG 「(다음 판)」 · 커밋까지 한다. 판 올림 · 태그 · push 는 사람이 한다.

## v1.6.0 영역 분리 — 기능 없이 경계만 옮긴다(G1~G4)

- [ ] A1 `viewer/src/shell/nav.js` — 항목에 `area: read|studio|server` 를 단다. 작업실 묶음을 만든다 / 정리한다 / 세운다로 나누고 「레포 관리」 이름을 없앤다. 작업실 항목의 need 를 write 이상으로 올린다(G3)
- [ ] A2 왼쪽 메뉴의 영역 스위치(write 이상만) · 영역마다 마지막 주소를 history state 로 기억 · 권한 밖 주소는 `redirectOf` 가 보기 `/` 로
- [ ] A3 보기에서 관리 입구 걷기 — `DocView.jsx` 의 어긋남 칩(X1) · `StatusBar.jsx` 의 「대기 n」 · 「미등재」 를 글자로만(X4) · `Overview.jsx:79` 의 검증 단추(X3)
- [ ] A4 `core/nextsteps.js` 의 `who` 거름 — 보기의 「시작하기」 는 read 줄만, 작업실 현황은 write · curate 줄(X2)
- [ ] A5 시험 — `test/nav.test.mjs` 로 역할 × 영역 항목 수를 고정(viewer 보기 2 · 작업실 0) · 보기 화면 `[data-ui=drift]` 0 · 얼굴 순회의 전체 새로고침 0
- [ ] A6 문서 — 화면 설계서 §4.2 V18 정정 상자 · 좌측메뉴 셸 L1 정정 · 사용자 · 큐레이터 설명서의 메뉴 이름

## v1.7.0 ingest 1 — 결정론 · save 경로(G5 · G10~G12 · G14~G16)

- [ ] B1 `core/save.js` 묶음 입력 `records[]` — 20건 이하 · 기록 · 첨부 · 어휘 add 만 받고 `sections` · `managed` · `edits` · `vocab op` 는 거절 · 뮤텍스 한 번 · `loadRepo` 2회 · 커밋 하나 · 전부 또는 전무 · 오류는 기록 id 별 · 미러 대기 생략
- [ ] B2 source 정형 `<이름>@<commit|->/<경로>#blob:<sha>` 파서 · 같은 blob 의 기록이 있으면 뮤텍스 안에서 `E_EXISTS` + 그 id(G10). 판정은 core 한 곳
- [ ] B3 `core/ingest.js`(새것) — 목록(파일 · 폴더 · git, `openSource` 재사용) · blob sha · id 짓기(날짜 근거는 `planImport` 재사용) · 이전 판 머리줄(G11) · 크기 상한 미리 거르기
- [ ] B4 `viewer/bin/ctx-ingest.mjs` — `--plan`(기본) · `--apply` · `--status` · `--resume` · `--no-llm` · 상태 폴더 `.cdp-ingest/<runId>/`(지식 레포 클론 안이면 거절)
- [ ] B5 `ctx login --server <url>` · `whoami` · `logout` — tokenstore 재사용 · `/me` 로 역할과 레포 출력
- [ ] B6 `ctx import-dir` → `ingest --no-llm` 별칭 · 안내 한 줄
- [ ] B7 대기열 — ingest 기록의 대기 나이는 들어온 커밋 시각(`curation.js` · `check.js` stale)
- [ ] B8 스킬 `cdp-curate` — `touches/` · `touches?/` 태그를 읽고 좌표를 정하는 절차(E4)
- [ ] B9 staging 사용자별 총량 상한 500MB · 413
- [ ] B10 하네스(`ops/verify`) — 3파일 폴더 → 기록 3 · 다시 돌리면 0 · 한 파일 수정 → 1(이전 판 머리줄) · 두 클라이언트 동시 → 중복 0 · 묶음 20 → 커밋 1 · 묶음 중 하나 E_CHECK → 전부 거절 · 수집 중 단건 save 지연이 묶음 하나 이하
- [ ] B11 문서 — MCP 만으로 M1 예외 문구(G18) · 시스템 설계서 save 절 · 사용자 설명서 「문서 · 폴더에서 들이기」

## v1.8.0 ingest 2 — 변환 · 판단 · 진행(G6~G9 · G13 · G19)

- [ ] C1 `core/zip.js` 읽기 · `core/convert.js` — docx · pptx · xlsx · hwpx 를 Node 로 직접 md 로 · 외부 `pdftotext` · `soffice` · `pandoc` 감지 · 변환 경고 · 실패는 들이지 않는다
- [ ] C2 `kit/ingest/prompt.md` — `편입.md` 를 포함해 생성 · draft JSON 스키마 · 줄 범위 계약(본문 생성 금지)
- [ ] C3 `--analyze` — `claude -p` 자식 프로세스 · 임시 MCP 설정 · 허용 목록과 금지 목록 · 스키마 검증과 1회 재시도 · `--budget` · `--concurrency 2` · `--redo`
- [ ] C4 `--review` — 【좌표 판정】 표 · registered 만 미리 체크 · 미등재는 `touches?/` 태그 · `--approve registered`
- [ ] C5 `ctx ingest doctor [--live]` — claude 경로 · 판 · 로그인 · 서버 · 토큰 역할 · 변환기
- [ ] C6 잡 API `/api/<레포>/jobs`(만들기 · 목록 · 상세 · plan · files/<n> · done · cancel) · 저장 `<data>/jobs/` · 남의 잡 404 · 15분 무보고는 멈춤
- [ ] C7 화면 작업실 › 지식 생성 — 새 수집(명령 복사 셸 셋) · 목록 · 상세(읽기)
- [ ] C8 대기열 — `ingest/<runId>` 로 접기 · 사람 기록 먼저 · 일괄 「기록으로 둠」 50건씩
- [ ] C9 서버 설정 레포별 `llmIngest: false` — 잡 만들기와 `ingest-llm` 태그 save 거절(G19)
- [ ] C10 doctor — 멈춘 잡 · staging 총량 · 같은 blob 기록 둘 이상 · 대기열 중 수집 비율
- [ ] C11 시험 — docx · xlsx · hwpx 픽스처 → md 표 · `claude` 를 흉내 내는 가짜 실행 파일로 analyze/review 흐름 · 잡 상태 전이

## v1.9.0 작업실 마무리(G17 · G4)

- [ ] D1 잡 `approve` — 화면 승인 → 서버가 묶음 save · 파일마다 결과 · 실패만 다시
- [ ] D2 작업실 › 출처 — 원천 상태 · 지도 검사 · 따라가기 누락 · 원천 연결 단추를 콘솔에서 옮긴다(X9)
- [ ] D3 작업실 › 어휘 — 좌표 · alias · 폐기 · 쓰임 읽기 · 고치기는 [에이전트 지시 복사]
- [ ] D4 X5~X7 정리 — 관리 문서 사용 현황과 지우기 분리 · 작업 레포 연결의 보기/쓰기 · 서식집을 메뉴로
- [ ] D5 `import-dir` 별칭 제거
- [ ] D6 하네스 — writer 가 남의 잡을 읽으면 404 · viewer 의 `POST /jobs` 403 · 승인 뒤 E_CHECK 가 상세에 남는다 · 콘솔 Repos 의 「원천」 단추 0

## 나온 것

(구현하면서 채운다)
