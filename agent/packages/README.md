# packages — 프로젝트마다 **고르는** 것

```
agent/             모든 프로젝트가 같은 것을 받는다   도구 · 매뉴얼 · skill · 훅
agent/packages/    프로젝트마다 고른다               docs/ · _managed.md · _vocab.md
```

둘 다 "받는 사람에게 가는가" 를 통과한다. **고르는가**에서 갈린다 — 그래서
배포본에서는 **합쳐져** `knowledge-repo-<이름>/` 하나로 나간다.

## 고르는 법 — 폴더를 복사한다

```
xcopy /E /I <배포본>\knowledge-repo-<고른 것> C:\cdp
cd /d C:\cdp
git init && git config core.hooksPath .githooks
```

**세 줄이다.** `ctx init --package` 같은 명령을 만들지 않는다 — 설치가 이미
복사이고, 방식이 둘이면 어느 것이 맞는지 묻게 된다.

복사한 순간 그 폴더가 지식 레포다 — `ctx` 는 `_vocab.md` 로 알아보고,
그 파일이 폴더 안에 이미 있다. `tools/cdp.exe` 도 함께 온다.

## 무엇이 들어 있나 — 서식이지 내용이 아니다

| 있다 | 없다 |
|---|---|
| `docs/` 문서 골격 — 머리 표 · 작성지침 · 예시 섹션 | 그 프로젝트의 데이터 |
| `_managed.md` 좌표 패턴 → 문서 · 섹션 | |
| `_vocab.md` 좌표 타입과 순서 | **좌표 값** |

값을 넣으면 이 패키지를 고른 다른 프로젝트에 **남의 프로젝트 데이터가 따라
들어온다.**

## 매니페스트 — `_package.json`

패키지마다 하나. **사람이 정하는 것만** 적는다 — `name`(폴더명과 같아야 한다) ·
`title` · `version` · `description` · `source`(만든 기록이 어디 있나) · `updated`.
문서 수 · 좌표 타입 · 등록부 패턴은 **폴더에서 센다** — 적어 두면 갈라진다.

```
ctx package list                패키지 · 판 · 문서 · 타입 · 패턴
ctx package show dpms           등록부 · 타입 순서 · 문서 목록
ctx package check dpms          부어서 ctx check — 등록부가 없는 문서를 가리키나 · 예시 어휘만 남았나
ctx package new <이름> --from dpms
```

`check` 는 CI 가 패키지마다 돈다(`npm run check:packages`). 릴리스가 깨진 패키지를
싸는 일이 없다. 매니페스트는 **받는 사람에게 가지 않는다** — 조립(`ops/lib/assemble.mjs`)이 뺀다.
`convert/` 폴더도 같다 — 그 문서 종류의 변환기 자리. 원본 xlsx 가 없으면 돌지 않는다.

## 목록

| 패키지 | 문서 | 어디서 왔나 |
|---|--:|---|
| [`dpms/`](dpms/README.md) | 40 | 공공 SI 전체 산출물 세트 (분석 · 설계 · 구현 · 시험 · 이행 + 사업관리) |
| [`project_1/`](project_1/README.md) | 40 | `dpms` v1.0.0 복제 (2026-09-23). **이름은 자리표시자다** — 적용하는 프로젝트의 이름으로 바꾼다(아래) |
| [`project_2/`](project_2/README.md) | 40 | 같다 |

문서 수는 `docs/**/*.md` 를 센 것이다 — `ctx package list` 가 내는 값과 같다.

## 이름 — 패키지 이름은 프로젝트에 맞춰 바뀐다

패키지는 **서식**이고, 서식은 그것을 쓰는 프로젝트의 것이 된다. 그래서 `project_1` 같은
이름은 자리표시자이고, 프로젝트가 정해지면 그 이름으로 바꾼다.

```
ctx package rename project_1 gdi [--title "GDI 문서 세트"]
```

폴더 · `_package.json` 의 `name` · `README.md` 첫 제목을 **한 번에** 바꾼다 — 셋 중 하나만
바꾸면 매니페스트가 "폴더명과 다르다" 로 거절하거나 레포를 연 사람이 옛 이름을 읽는다.
바꾼 뒤 이 README 의 목록 줄을 고치고 `ctx package check <새 이름>`.

| | |
|---|---|
| **패키지 이름 ≠ 지식 레포 이름** | 패키지는 서식의 이름, 레포 이름은 세울 때 정한다(`ctx repo new <경로> --package <이름>`). `dpms` 로 `gdi` 레포를 세울 수 있다 |
| 이미 세운 레포 | 그대로다. 레포는 패키지의 사본이고 이름을 따로 갖는다 |
| 서버의 `packages/` | 다음 산출물(`release:server` → `upgrade.sh`)이 따라간다 |
| 클라이언트 배포본 | 다음 릴리스의 `knowledge-repo-<새 이름>/` 이 된다 |

## 새 패키지를 만들려면

`ctx package new <이름> --from dpms` 가 복사하고 매니페스트를 고쳐 준다. **바뀌는
것은 문서 목록뿐**이고, 서식 규약과 좌표 설계는 `docs/관리문서패키지/` 에서 공유한다 —
패키지마다 복사해 넣으면 두 벌이 되고 두 벌은 갈라진다. `new` 는 `README.md` 의 첫 제목을
새 이름으로 바꾸고 출처 한 줄을 넣는다 — 조립되면 그것이 지식 레포의 루트 README 다.
`convert/`(변환기 자리)는 복사하지 않는다.

> **정정 (2026-09-23)** — 제품화 검토 R17 은 "두 번째 패키지는 표본이 둘이 될 때" 였다.
> 운영자 지시로 `project_1` · `project_2` 를 dpms 에서 복제해 두었다 — 목록 · 검사 · 릴리스 ·
> 서버 `POST /repos` · 화면의 패키지 선택이 **여럿일 때** 맞게 도는지 실측하기 위한 것이다.
> 실제 프로젝트 패키지는 이 둘 중 하나를 **그 프로젝트의 이름으로 바꾸고**(`rename`) 문서
> 목록을 고쳐서 만든다.
