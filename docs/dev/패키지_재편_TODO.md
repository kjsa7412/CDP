# 패키지 재편 TODO — 복제 둘을 걷고 · dpms → public-si · 빈 패키지 · 요즘 개발 방식의 패키지 셋

> 운영자 요청(2026-10-02) — 「현재 생성된 DPMS 패키지 1개에 나머지 project 이름이 2개 패키지는 dpms의 복제라 필요가 없다. 지식레포를 세울때 빈 패키지1개 그리고 DPMS 패키지1개 나머지 요즘 SW 개발 트렌드에 맞는 패키지를 몇 개 생성해보자. DPMS 패키지는 패키지이름을 범용적으로 바꾸도록 하자.」 **권장안으로 진행.**
> 짝 문서 — [`../design/CDP_패키지_재편_검토_v0.1.md`](../design/CDP_패키지_재편_검토_v0.1.md) (실측 Q1~Q9 · 문제 K1~K5 · 결정 P1~P12 · 패키지별 설계 §5).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림 · 사이트 데모 다시 찍기 · 실서버 upgrade 는 사람이.
> **같은 체크아웃에 다른 세션이 있다**(실서버 종합 시험 F1 · F2 — `viewer/bin/*` · `viewer/src/*`). 커밋은 이 작업의 경로만 `git add` 한다.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · TODO | 이 커밋 |
| ① 걷기 · 이름 | |
| ② `blank` | |
| ③ 새 패키지 셋 | |
| ④ 코드 | |
| ⑤ 시험 · 하네스 | |
| ⑥ 설명서 · 사이트 | |
| ⑦ 실측 | |

---

## 0. 전제 — 닫혔다

- [x] 다섯 — `blank` · `public-si` · `agile-product` · `cloud-native` · `ai-service` (P1)
- [x] `dpms` → `public-si` · 제목 「공공 SI 산출물 세트」 · 1.1.0 · `ctx package rename` 으로 (P2)
- [x] 원천 기록은 `docs/attic/dpms-패키지/README.md` 로 · 예시 값은 그대로 (P3)
- [x] 복제 둘 지움 (P4) · 「이름은 자리표시자」 정책을 「방식별 서식 · 맞춤은 레포 안에서」 로 (P5)
- [x] 타입은 한글로 시작 (P6) · 작업 기록 = ADR · 코드가 정본인 것은 옮기지 않는다 · 좌표는 바뀌는 대상에만 (P7)
- [x] 12~14종 (P8) · `필수 제출` 칸 없음 · 묶음 접두 번호 · `관리번호.md` 없음 (P9) · 예시는 「(예시) 온라인 상점」 (P10)
- [x] 판 · CHANGELOG · 실서버는 사람이 (P12)

---

## ① 걷기 · 이름

- [ ] `ctx package rename dpms public-si --title "공공 SI 산출물 세트"` — 폴더 · 매니페스트 · README 제목
- [ ] `_package.json` — `version` 1.1.0 · `description` · `source` 「docs/attic/dpms-패키지/ (옛 이름 dpms)」
- [ ] `README.md` — 붓는 줄 `knowledge-repo-public-si` · 「왜 40종인가」 · 「서식 원본이 없는 15종」 을 attic 으로 옮기고 「어디서 왔나」 한 단락
- [ ] `관리번호.md` — 원천 폴더 경로를 「산출물 폴더」 로 · §5.1~5.3 을 attic 으로 · §5.4(뺀 7종 · 더한 2종)는 남긴다
- [ ] `_vocab.md` 「DPMS 는 같은 업무 영역을…」 → 사업 일반의 말로
- [ ] `DE_101` 작성지침의 `## arch` → `## 시스템아키텍처`
- [ ] `docs/attic/dpms-패키지/README.md` — 「패키지에서 옮긴 것(2026-10-02)」 절
- [ ] `agent/packages/project_1` · `project_2` 지움

## ② blank

- [ ] `_package.json` · `README.md`(첫날 — 첫 관리 문서 세우기 · 서버형 save `managed` + `vocab` · 셸 · 에이전트) · `_vocab.md`(쓰는 법 · 생성 블록) · `_managed.md`(머리 표) · `docs/.gitkeep`
- [ ] `ctx package check blank` · `ctx repo new … --package blank`

## ③ 새 패키지 셋 — 검토 §5.2 · §5.3 · §5.4

패키지마다 같은 틀이다.

- [ ] `_package.json` — name · title · version 1.0.0 · description · source 「docs/design/CDP_패키지_재편_검토_v0.1.md §5.x」 · updated
- [ ] `README.md` — `# <이름> — <제목>` · 이런 팀 · 붓는다 · 첫날 · 문서 표(관리번호 · 문서 · 언제 · 유형 · 좌표) · 원칙(작업 기록 = ADR · 코드가 정본인 것) · 번호 · 더할 만한 것 · 알려진 한계
- [ ] `_managed.md` — 규칙 행 + 「등록부에 없는 좌표는 정상이다」 · 「등록부 대상이 아닌 관리 문서」
- [ ] `_vocab.md` — 「무슨 일을 하면 무엇을 적나」 표 · 생성 블록 · 타입 절마다 예시(`example:`) · 고정 좌표 · 정착도 제외 축
- [ ] 문서 — 머리 표 · 무엇/언제/누가 · 여기 적지 않는 것 · (좌표형) 예시 섹션 + `<!-- applied: null -->` · (대장) 예시 행 · (사건) 예시 날짜 섹션 · `## 작성지침`
- [ ] 서식 규약 열 가지(`docs/관리문서패키지/03_템플릿규약.md` §1) — 값에 ` - ` 없음 · 섹션 레벨 = 등록부 · applied 는 제목 바로 다음 줄 · 하위 제목 대신 볼드 · 정규화 뒤 충돌 없음
- [ ] 머리 표 `등록부` 칸 · `_vocab.md` 생성 블록은 `core/regen.js` 로 찍어 맞춘다(손 사본이 어긋나면 `registry-head` 오류)
- [ ] `ctx package check <이름>` ok · 경고는 예시 하나

## ④ 코드

- [ ] `viewer/bin/ctx-repo.mjs` — 「다음 —」 를 문서 수로 가른다(0 이면 「첫 관리 문서를 세운다 — README.md 「첫날」」)
- [ ] `viewer/src/console/Server.jsx` — 「패키지 이름은 자리표시자다…」 한 줄을 P5 로 **(다른 세션이 `viewer/src` 를 만지는 중 — 이 파일이 비어 있을 때만)**
- [ ] `core/packages.js` 주석의 `project_1` 예

## ⑤ 시험 · 하네스

- [ ] `test/save-registry-copy.test.mjs` · `test/docs-drop.test.mjs` — `agent/packages/public-si`
- [ ] `test/site.test.mjs` 누출 규칙의 놓아야 할 문자열 — `패키지 public-si · 공공 SI 산출물`
- [ ] 새 `test/packages-shipped.test.mjs` — 소스 패키지가 다섯 · 매니페스트 이름 = 폴더 · `checkPackage` ok · 문서 수 · 사내 흔적(`DPMS` · `C:\project`) 없음 · 타입이 MCP 좌표 규칙(한글 시작 또는 영문 소문자)을 지난다 · 고정 좌표가 예시가 아니다 · `blank` 는 0
- [ ] 하네스 `ops/verify/run.mjs` 70 · 71 · 72 · 74 · 98~99 — `public-si` · 74 는 다섯을 다 본다

## ⑥ 설명서 · 사이트

- [ ] `agent/packages/README.md` — 목록 다섯 · 이름 정책(P5) · 정정 문단 정리
- [ ] `manual/관리자_설명서.md` — 복사 줄 · `--package` · 7.1 첫날 · 패키지 이름 설명
- [ ] `manual/개발자_설명서.md` — 패키지 다섯 · R17 정정
- [ ] `agent/manual/admin.md` · `agent/install.md` — `knowledge-repo-<패키지>`
- [ ] `ops/deploy/install.sh` · `ops/deploy/설치절차.md` — `--package public-si`(다섯 중 하나)
- [ ] `site/demo/run.mjs` · `site/demo/content.mjs` · `site/README.md` — `public-si`
- [ ] `docs/README.md` — 관리문서패키지 · attic 줄
- [ ] `README.md`(루트) 표에 이 검토 한 줄

## ⑦ 실측

- [ ] `ctx package list` · `ctx package check --all`
- [ ] 다섯 다 `ctx repo new`(예시 그대로 · `--no-examples`) → 첫 커밋 · `ctx check` · `ctx examples --purge` 뒤 `ctx check`
- [ ] 새 셋마다 예시 좌표 하나로 파생 한 바퀴 — 작업 기록 `touches` → 커밋이 막힌다 → 섹션 갱신 → 지난다
- [ ] `node --test test/*.test.mjs` · `npm run check:packages` · 하네스
- [ ] 콘솔 「새 지식 레포」 — 패키지 다섯 · 문서 고르기(브라우저)

---

## 나온 것

| | 무엇을 · 왜 |
|---|---|
