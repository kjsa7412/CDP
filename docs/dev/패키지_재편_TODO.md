# 패키지 재편 TODO — 복제 둘을 걷고 · dpms → public-si · 빈 패키지 · 요즘 개발 방식의 패키지 셋

> 운영자 요청(2026-10-02) — 「현재 생성된 DPMS 패키지 1개에 나머지 project 이름이 2개 패키지는 dpms의 복제라 필요가 없다. 지식레포를 세울때 빈 패키지1개 그리고 DPMS 패키지1개 나머지 요즘 SW 개발 트렌드에 맞는 패키지를 몇 개 생성해보자. DPMS 패키지는 패키지이름을 범용적으로 바꾸도록 하자.」 **권장안으로 진행.**
> 짝 문서 — [`../design/CDP_패키지_재편_검토_v0.1.md`](../design/CDP_패키지_재편_검토_v0.1.md) (실측 Q1~Q9 · 문제 K1~K5 · 결정 P1~P12 · 패키지별 설계 §5).
> 커밋까지만 — push · 태그 · CHANGELOG 절 · `package.json` 판 올림 · 사이트 데모 다시 찍기 · 실서버 upgrade 는 사람이.
> **같은 체크아웃에 다른 세션이 있다**(실서버 종합 시험 F1 · F2 — `viewer/bin/*` · `viewer/src/*`). 커밋은 이 작업의 경로만 `git add` 한다.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · TODO | **완료** — eacc11a |
| ① 걷기 · 이름 | **완료** — 21289fa |
| ② `blank` | **완료** — 21289fa |
| ③ 새 패키지 셋 | **완료** — 21289fa (`agile-product` 14 · `cloud-native` 13 · `ai-service` 12) |
| ④ 코드 | **완료** — c1471e0 |
| ⑤ 시험 · 하네스 | **완료** — c1471e0 · `test/packages-shipped.test.mjs` 26 · 하네스 ✓ 100 ✗ 0 |
| ⑥ 설명서 · 사이트 | **완료** — 8e2162b · 이 커밋(관리자 설명서 7.1) |
| ⑦ 실측 | **완료** — 아래 「나온 것」 |

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

- [x] `ctx package rename dpms public-si --title "공공 SI 산출물 세트"` — 폴더 · 매니페스트 · README 제목
- [x] `_package.json` — `version` 1.1.0 · `description` · `source` 「docs/attic/dpms-패키지/ (옛 이름 dpms)」
- [x] `README.md` — 붓는 줄 `knowledge-repo-public-si` · 「왜 40종인가」 · 「서식 원본이 없는 15종」 을 attic 으로 옮기고 「어디서 왔나」 한 단락
- [x] `관리번호.md` — 원천 폴더 경로를 「산출물 폴더」 로 · §5 는 남긴다(이름 없음 · 되돌리는 법 — 검토 P3)
- [x] `_vocab.md` 「DPMS 는 같은 업무 영역을…」 → 사업 일반의 말로
- [x] `DE_101` 작성지침의 `## arch` → `## 시스템아키텍처`
- [x] `docs/attic/dpms-패키지/README.md` — 「패키지에서 옮긴 것(2026-10-02)」 절
- [x] `agent/packages/project_1` · `project_2` 지움

## ② blank

- [x] `_package.json` · `README.md`(첫날 — 첫 관리 문서 세우기 · 서버형 save `managed` + `vocab` · 셸 · 에이전트) · `_vocab.md`(쓰는 법 · 생성 블록) · `_managed.md`(머리 표) · `docs/.gitkeep`
- [x] `ctx package check blank` · `ctx repo new … --package blank`

## ③ 새 패키지 셋 — 검토 §5.2 · §5.3 · §5.4

패키지마다 같은 틀이다.

- [x] `_package.json` — name · title · version 1.0.0 · description · source 「docs/design/CDP_패키지_재편_검토_v0.1.md §5.x」 · updated
- [x] `README.md` — `# <이름> — <제목>` · 이런 팀 · 붓는다 · 첫날 · 문서 표(관리번호 · 문서 · 언제 · 유형 · 좌표) · 원칙(작업 기록 = ADR · 코드가 정본인 것) · 번호 · 더할 만한 것 · 알려진 한계
- [x] `_managed.md` — 규칙 행 + 「등록부에 없는 좌표는 정상이다」 · 「등록부 대상이 아닌 관리 문서」
- [x] `_vocab.md` — 「무슨 일을 하면 무엇을 적나」 표 · 생성 블록 · 타입 절마다 예시(`example:`) · 고정 좌표 · 정착도 제외 축
- [x] 문서 — 머리 표 · 무엇/언제/누가 · 여기 적지 않는 것 · (좌표형) 예시 섹션 + `<!-- applied: null -->` · (대장) 예시 행 · (사건) 예시 날짜 섹션 · `## 작성지침`
- [x] 서식 규약 열 가지(`docs/관리문서패키지/03_템플릿규약.md` §1) — 값에 ` - ` 없음 · 섹션 레벨 = 등록부 · applied 는 제목 바로 다음 줄 · 하위 제목 대신 볼드 · 정규화 뒤 충돌 없음
- [x] 머리 표 `등록부` 칸 · `_vocab.md` 생성 블록은 `core/regen.js` 로 찍어 맞춘다(손 사본이 어긋나면 `registry-head` 오류)
- [x] `ctx package check <이름>` ok · 경고는 예시 하나

## ④ 코드

- [x] `viewer/bin/ctx-repo.mjs` — 「다음 —」 를 문서 수로 가른다(0 이면 「첫 관리 문서를 세운다 — README.md 「첫날」」)
- [x] `viewer/src/console/Server.jsx` — 「패키지 이름은 자리표시자다…」 한 줄을 P5 로 — 비어 있을 때 고쳤다(웹 빌드는 릴리스가)
- [x] `core/packages.js` 주석의 `project_1` 예

## ⑤ 시험 · 하네스

- [x] `test/save-registry-copy.test.mjs` · `test/docs-drop.test.mjs` — `agent/packages/public-si`
- [x] `test/site.test.mjs` 누출 규칙의 놓아야 할 문자열 — `패키지 public-si · 공공 SI 산출물`
- [x] 새 `test/packages-shipped.test.mjs` — 소스 패키지가 다섯 · 매니페스트 이름 = 폴더 · `checkPackage` ok · 문서 수 · 사내 흔적(`DPMS` · `C:\project`) 없음 · 타입이 MCP 좌표 규칙(한글 시작 또는 영문 소문자)을 지난다 · 고정 좌표가 예시가 아니다 · `blank` 는 0
- [x] 하네스 `ops/verify/run.mjs` 70 · 71 · 72 · 74 · 98~99 — `public-si` · 74 는 다섯을 다 본다

## ⑥ 설명서 · 사이트

- [x] `agent/packages/README.md` — 목록 다섯 · 이름 정책(P5) · 정정 문단 정리
- [x] `manual/관리자_설명서.md` — 복사 줄 · `--package` · 7.1 첫날 · 패키지 이름 설명
- [x] `manual/개발자_설명서.md` — 패키지 다섯 · R17 정정
- [x] `agent/manual/admin.md` · `agent/install.md` — `knowledge-repo-<패키지>`
- [x] `ops/deploy/install.sh` · `ops/deploy/설치절차.md` — `--package public-si`(다섯 중 하나)
- [x] `site/demo/run.mjs` · `site/demo/content.mjs` · `site/README.md` — `public-si`
- [x] `docs/README.md` — 관리문서패키지 · attic 줄
- [x] `README.md`(루트) 표에 이 검토 한 줄

## ⑦ 실측

- [x] `ctx package list` · `ctx package check --all`
- [x] 다섯 다 `ctx repo new`(예시 그대로 · `--no-examples`) → 첫 커밋 · `ctx check` · `ctx examples --purge` 뒤 `ctx check`
- [x] 새 셋마다 예시 좌표 하나로 파생 한 바퀴 — 작업 기록 `touches` → 커밋이 막힌다 → 섹션 갱신 → 지난다
- [x] `node --test test/*.test.mjs` · `npm run check:packages` · 하네스
- [x] 콘솔 「새 지식 레포」 — 패키지 다섯 · 문서 고르기(브라우저)

---

## 나온 것

| | 무엇을 · 왜 |
|---|---|
| 이름 | `dpms` → **`public-si`** 「공공 SI 산출물 세트」 1.1.0 — 내용(공공 SW 사업 산출물)을 말한다. 방법론 이름(`waterfall`)은 문서 세트를 말하지 못한다(P2) |
| 새 셋의 이름 | `agile-product` · `cloud-native` · `ai-service` — 팀이 「우리는 무엇을 하나」 로 고를 수 있는 낱말. 빈 패키지는 `blank` |
| P3 범위를 좁혔다 | `관리번호.md` §5(원본 대장과 다르게 준 번호)는 **남겼다** — 원천 이름이 없고 발주처가 원본 번호로 말을 맞출 때 되돌리는 법이라 받는 사람의 것이다. 옮긴 것은 README 두 절(원천 폴더 · 실물 셈)뿐이고, `_vocab.md` 한 문장 · `관리번호.md` 폴더 경로는 일반의 말로 고쳤다 |
| **정정 — `supersedes`** | 검토 P7 을 「`supersedes` 가 대체 관계」 로 적었는데 **틀렸다** — CDP 에서 `supersedes` 는 기록 자체가 틀렸을 때(오기재)만이다(시스템 설명서 §4.4 · `TEMPLATE-work.md`). 결정을 뒤집으면 같은 좌표에 새 기록을 내고 순서는 도구가 날짜로 센다. agile-product 를 쓴 에이전트가 먼저 바로 썼고, 검토 · 패키지 README · ai-service README 를 고쳤다 |
| 타입 이름 | 전부 한글 시작 — `기능명세` · `제품지표` · `화면명세` · `인터페이스` · `데이터모델` · `서비스명세` · `이벤트명세` · `데이터저장소` · `인프라` · `서비스수준` · `런북` · `장애` · `모델카드` · `프롬프트` · `지식소스` · `에이전트도구` · `평가셋` · 셋 다 `시스템아키텍처`. 정착도 제외 축은 `제품영역`(agile) · `도메인`(cloud) |
| 고정 좌표 | 시스템아키텍처 넷(agile `context` `container` `deploy` `security` · cloud `context` `platform` `network` `security` · ai `context` `pipeline` `serving` `observability`) · cloud 의 `인프라:prod` `stg` `dev` — 예시가 아니라서 `--no-examples` · purge 뒤에도 남는다(시험이 섹션을 본다) |
| 값에 판을 넣나 | ai — 넣지 않는다(판은 섹션 안 칸 · 좌표 이력이 안 끊긴다). cloud — API 는 **메이저 판만** 값에(`ex-order-v1` — 깨지는 변경은 다른 계약), 이벤트는 토픽 이름이 값이고 깨지는 스키마는 새 이름 |
| 사내 흔적 | 예시 VPC `10.10.0.0/16` 이 사내 대역 규칙에 걸려 `10.0.0.0/16` 으로. 사이트 누출 규칙(`site/tools/leaks.mjs`)으로 다섯 패키지 전부 0건 |
| 덤으로 고친 것 | `ctx package list` · `check` 의 이름 칸이 12자 고정이라 `agile-product` 가 판 칸에 붙었다 → 가장 긴 이름에 맞춘다. `test/docs-drop.test.mjs` 의 `README.md:81` 기대값은 f8333d9(README 첫날 9줄 추가) 때부터 어긋나 있었다 → 90. 관리자 설명서 7.1 의 첫날 5단계(「2 `_managed.md` 에서 패턴을 지운다」)가 v0.22 의 drop 이전 순서였다 → 패키지 README 의 4단계로 |
| 실측 — 검사 | `ctx package check --all` 다섯 다 ok · 경고는 서식 예시 하나(agile 6 · ai 6 · cloud 8 · public-si 18 · blank 0) |
| 실측 — 세우기 | 다섯 다 `ctx repo new` 첫 커밋(훅) 통과 · `--no-examples` 도 통과 · `ctx examples --purge` 뒤 `ctx check` 이상 없음(시험이 다섯마다 잰다). blank 는 「다음 — 1. 첫 관리 문서를 세운다」 |
| 실측 — 파생 한 바퀴 | 작업 기록 `touches` 만 넣고 커밋 → 「오류 1건」 으로 막힘 → 섹션 `applied` 를 고치면 통과. agile `기능명세:EX-CHECKOUT` · cloud `장애:EX-INC-001` · ai `프롬프트:` + `평가셋:`(둘 다 막히고 둘 다 고쳐야 지난다) |
| 실측 — 시험 · 하네스 | `node --test test/*.test.mjs` 225 + `packages-shipped` 26 초록 · `npm run check:packages` · 하네스 ✓ 100 ✗ 0 – 16(70 「5개 · public-si v1.1.0 · 문서 40」 · 72 「관리 문서 40」 · 74 「5개 ok」) |
| 실측 — 콘솔 | 7387 개발 서버(소스 `agent/packages`) · 「새 지식 레포」 — 선택지 다섯(이름 · 판 · 제목 · 문서 수) · cloud-native 고르면 문서 고르기 「13 / 13종」 · 묶음 셋 · 좌표 아홉 표시 · blank 고르면 문서 고르기가 없고 설명만 |
| 남은 것(사람) | 판 올림 · CHANGELOG 절 · push · 태그 · 실서버 upgrade(서버 `packages/` 를 통째로 갈아 끼운다 — 옛 `dpms` 는 사라지고 다섯이 선다 · 이미 세운 dpms_wiki 는 무관) · `npm run site:demo` 다시 찍기(데모가 `public-si` 로 세운다 · 화면에 패키지 이름이 찍히는 장면은 없다) · 콘솔 › 서버 「패키지」 카드 문구는 다음 웹 빌드부터 |
| 하지 않은 것 | `public-si` 예시 업무(연구과제)의 가상화 · 타입 정규식 넓히기(`API명세:`) · 패키지 섞기 — 검토 §6 |
