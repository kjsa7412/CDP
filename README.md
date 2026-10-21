# cdp

지식 레포 서버. **작업 기록이 원천이고, 관리 문서는 큐레이터가 반영한다.** 좌표로 찾고 사람이 본문을 읽는다.

| 문서 | |
|---|---|
| **시스템 설계** | [`docs/design/CDP_시스템설계서_v2.0.md`](docs/design/CDP_시스템설계서_v2.0.md) — 불변조건 · 데이터 모델 · save · 서버 · 배포 · 이행. **고칠 사람이 먼저 읽는다** |
| 설계 v2 세트 | [MCP 설계서 v2.0](docs/design/CDP_MCP_설계서_v2.0.md) · [서식집 규약 v1.0](docs/design/CDP_서식집_규약_v1.0.md) · [화면 설계서 v1.0](docs/design/CDP_화면_설계서_v1.0.md) · [용어 v1.0](docs/용어.md) — 정본은 여기 한 곳 |
| 결정의 정본 | [v1.0 개편안](docs/design/CDP_v1.0_개편안.md)(불변조건 · V1~V21) · [제품화 2 검토](docs/design/CDP_제품화_검토_v2.0.md)(v1.2 — 원큐 설치 · 시작하기 · 화면 16) |
| **제품 설명서** | [`manual/`](manual) — 사용자 · 큐레이터 · 서버 관리자 · 개발자 네 권. 서버가 `/manual` 로 낸다 |
| 공식 사이트 | [`site/`](site) — 제품 소개 정적 SPA(사외) |
| 바뀐 것 | [`CHANGELOG.md`](CHANGELOG.md) — 태그마다 한 절. 릴리스 노트가 여기서 나온다 |
| `docs/` 의 판정 | [`docs/README.md`](docs/README.md) — 무엇이 정본이고 무엇이 이력인가 |

## 무엇을 하는가

```
work/      작업 기록 — 사건. 무엇을 했고 왜 그렇게 정했나. 쓰고 나면 고치지 않는다
docs/      관리 문서 — 대상마다 지금의 정본 섹션. 큐레이터가 기록을 보고 반영한다
_vocab.md  좌표 어휘 · _managed.md 등록부(좌표 → 어느 문서 어느 섹션)

좌표(테이블정의서:pj_plan_mst · 화면설계서:SYA030 …)가 둘을 잇는다.
```

| 역할 | 하는 일 |
|---|---|
| **사용자(writer)** | 작업 레포의 Claude Code 에서 일하고 **작업 기록만** 남긴다(`cdp-save`). 관리 문서는 쓰지 않는다 |
| **큐레이터**(레포별 권한) | 대기열의 기록을 판정한다 — 반영 · 새 문서(서식집에서 빈 문서로) · 기록으로 둠(`cdp-curate`). 자기 Claude Code 세션에서 한다 — 서버는 LLM 을 부르지 않는다 |
| **서버 관리자** | 서버 · 사람 · 토큰 · 큐레이터 맡기기 · 레포 세우기(콘솔) |
| 기계(기준선) | 코드 · DB 에서 뽑은 사실을 섹션 안 **기준선 블록**에만 쓴다(`ctx baseline push`) |

늦은 반영은 막지 않는다 — 섹션 뒤에 그 좌표를 건드린 **미반영 기록**을 도구(`section`)와 화면(「미반영 n」)이 섹션과 함께 낸다.

**쓰는 길은 서버 `save` 하나다.** 레포에는 지식만 둔다(도구 층 · 훅 · 스킬 사본 · INDEX 없음).

## 시작 — 한 줄

```bash
ctx up ~/cdp/<레포> --install <코드 폴더> --curator ~/cdp/curator     # 혼자 · 서버 없이 — 빈 틀 · 개인 서버 · 토큰 · 화면 · 설치까지
sudo bash deploy/install.sh --bind <IP> --admin <id> --repo <레포> [--origin <url>] [--ssh]   # 팀 서버 — 산출물 폴더 안에서
```

`ctx` 는 서버 산출물(`cdp-server-v<판>.tar.gz`)의 `bin/ctx.mjs` — 처음 한 번 `node bin/ctx.mjs self-update <tar>` 가 `~/.cdp/bin/ctx` 를 만든다.
판을 올릴 때는 개인 `ctx self-update <새 tar>` 뒤 `ctx up <레포> --update` · 팀 `upgrade.sh`. 다음 할 일은 화면의 「시작하기」 와 명령의 끝 출력이 같이 말한다.

## 실행 — 개발

```bash
npm ci
npm run dev:server     # 개인 서버 — viewer/fixture · 127.0.0.1:7373
npm run dev            # 화면 — vite 5173 · API 는 7373 으로 넘긴다
```

자동 로그인 주소는 화면에 찍지 않는다 — `ops/out/dev-personal/login.url` 의 포트를 5173 으로 바꿔 연다. 빌드된 화면으로 한 번에는 `npm run build && npm start`.
절차 · 규칙 · 릴리스는 [개발자 설명서](manual/개발자_설명서.md), 서버는 [서버 관리자 설명서](manual/관리자_설명서.md).

## npm 스크립트

| | |
|---|---|
| **`npm run release:server`** | 서버 산출물 `ops/out/server/cdp-server-v<버전>.tar.gz` — bin · web · forms · kit · manual · deploy. `install.sh` · `upgrade.sh` · `ctx self-update` 가 받는다. tar 는 `core/tar.js` 가 싼다(한글 이름 NFC) |
| `npm run build` · `build:ctx` | 화면(`ops/out/web`) · ctx 번들(`ops/out/ctx/ctx.mjs` — 서버 본체) |
| `npm run build:site` | 공식 사이트 → `ops/out/site/` — 빌드 · 사전 생성 · **누출 검사**(사내 흔적이 있으면 실패) |
| `npm test` | 단위 시험(`node:test` · `test/`). 개발 중에는 `node --test test/<파일>` 로 좁게 |
| **`npm run verify`** | 검증 하네스 — 설계서 §10 · v1.0 · 제품화 2(`ctx up` 원큐) 항목을 실제 서버로 |
| `npm run dev` · `dev:server` · `start` · `ctx -- <명령>` | 화면 / 개인 서버 개발 · 소스로 CLI — 나머지(`seed` · `site:demo` …)는 개발자 설명서 부록 A |

태그 `v*` 를 push 하면 `release.yml` 이 서버 tar · 사이트 zip · SHA256SUMS 를 Release 에 붙인다(태그 ≠ `package.json` 버전이면 실패). CI 는 위 스크립트만 부른다.

## CLI — `ctx`

서버 · 화면과 **같은 계산**(`core/`)을 쓴다. 읽기와 서버 관리만 한다 — 쓰는 길은 서버 `save` 다.

```
ctx check · docs · match · where · search · term · brief · drift · version  읽기
ctx up [<폴더>] [--install <코드 폴더>]… [--curator] [--skills] [--service]  개인 서버 한 줄 · --update [--commit] 은 판이 오른 뒤
ctx self-update <tar.gz|url>                                           개인 서버 판 올림(~/.cdp/server · SHA256SUMS 대조)
ctx serve --root … | --personal <레포> | --config <serve.json>         서버(MCP · 화면 · 관리 서비스) — serve.json 은 설정 한 장
ctx serve doctor · init · user · token · git-auth                       서버 준비물 · 명부 · 토큰 · origin 자격
ctx repo new <경로> [--title] [--origin <url>] [--records-from <옛 레포>]  빈 틀로 세우기(origin 이면 push) · 기록만 옮겨 다시 세우기
ctx migrate · baseline · rebuild · forms                              이행 · 기준선 · 스냅샷 · 서식집
ctx login · ingest                                                    문서 · 폴더 · 레포를 작업 기록으로(사람 PC · 서버 save)
```

전체는 [개발자 설명서 부록 B](manual/개발자_설명서.md#부록-b-ctx-명령-전체). v0.x 의 없앤 명령은 바뀐 길을 한 줄로 답하고 exit 2.

## 구조

```
core/            **계산 — 정본.** 스캔 · 어휘 · 등록부 · 큐레이션(대기열 · 미반영) · 검사 · save · 서식집 · kit
                 · 빈 틀 · 이행 · 다음 할 일(nextsteps). 서버 · 화면 · CLI 가 같이 쓴다(I1). HTTP 를 모른다

viewer/
  bin/           ctx CLI · 서버(ctx-mcp-serve · MCP 는 ctx-mcp) · ctx up · self-update · 설치기(cdp-install = install.mjs) — 번들되어 bin/ctx.mjs 하나
  server/        서버가 쓰는 읽기 API · 경로 봉인(read-api · security)
  src/           화면 — 왼쪽 메뉴 셸(shell/nav.js 한 표) · 읽기 · 큐레이션 · 레포 관리 · 서버(콘솔) · 시작하기 · 소개 · 설명서
  fixture/       **개발 · 시험용 표본 레포**(지식만). 산출물에 안 들어간다

agent/           **작업 레포 kit 과 서식집의 원본** — 서버 번들의 kit/ · forms/ 가 여기서 나온다
  skills/        writer(cdp-work · cdp-save · cdp-push) · 큐레이터(+ cdp-curate · cdp-registry · cdp-rebuild)
  CLAUDE-프로젝트레포.md · CLAUDE-큐레이터.md   작업 레포 · 큐레이터 폴더 CLAUDE.md 에 블록으로
  forms/         서식 79종 — 묶음 넷(public-si · agile-product · cloud-native · ai-service)

ops/             명령 · 구현 · 배포 · 검증 — ops/README.md
test/            단위 시험(test/fixtures/legacy-public-si — 옛 레포 표본)
docs/            설계 · 개발 메모 · 용어 · 그림 — docs/README.md
manual/          제품 설명서 네 권(원천)
site/            공식 사이트
```

**판정은 `core/` 한 곳뿐이다.** 두 곳에 두면 화면 · 도구 · save 의 판정이 갈라지고, 그때 사람은 화면을 믿는다. 불변조건은 시스템 설계서 v2.0 §2.

## 안 하는 것

| | |
|---|---|
| 서버가 LLM 으로 큐레이션 | 키 · 비용 · 폐쇄망 반출이 생기고 승인 게이트(판정표 · diff)는 대화에 있어야 한다 — 큐레이터의 세션이 한다 |
| 관리 문서 자동 생성 | 입도 · 서술은 큐레이터가 정한다. 기계는 기준선 블록 하나만 쓴다 |
| writer 의 섹션 쓰기 | 정본 층의 작성자가 둘이면 복제 · 이름 갈림이 다시 생긴다 |
| merge · rebase · 강제 push | 서버는 ff 만 받고 갈라지면 멈춘다 — 사람이 셸에서 정리한다 |
| 본문 요약 · RAG · 임베딩 | 좌표가 답이다. 근사 검색은 「없는 것」 을 「비슷한 것」 으로 채운다 |
| 알림 | 무시되기 시작하면 되돌릴 수 없다 — 대기 · 미반영은 화면과 도구에 상태로 있다 |

## 보안

| | |
|---|---|
| 인증 | 토큰은 신원만 증명하고 권한은 명부(사람 · 역할 · 볼 수 있는 레포 · 큐레이터 레포)에 붙는다. 원문은 저장하지 않는다 |
| 경계 | `--bind` 한 인터페이스 · 인증 없이 루프백 밖으로 열지 않는다 · 같은 출처가 아닌 `Origin` 은 403 · 권한 밖 레포는 **없는 것**(404) |
| 쓰기 | 콘솔의 쓰기는 재인증(15분) · 관리 API 는 `--admin-from` 대역 · 레포 경로 밖 파일은 내지 않는다(`resolveInside`) |
| 레포의 HTML | 첨부 HTML 은 sandbox CSP 로만 낸다 — 같은 출처로 스크립트가 돌지 않는다 |
