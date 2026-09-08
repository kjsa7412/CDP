# ops — 명령

**사람이 실행하는 것은 여기 있고, 그것이 부르는 구현은 `lib/` 에 있다.**

전에는 둘이 섞여 있었다. 한 폴더를 열면 `build-exe.mjs`(스크립트가 부른다)와
`release.cmd`(사람이 더블클릭한다)가 나란히 있어서, **무엇을 직접 실행해도
되는지**를 파일을 열어 봐야 알았다.

```
ops/
  setup.cmd      최초 1회 — 의존성 설치
  dev.cmd        개발 서버 (화면 + API)
  start.cmd      앱 실행 (빌드된 화면 · sample-repo)
  check.cmd      지식 레포 검사
  seed.cmd       sample-repo 재생성
  release.cmd    **배포본 만들기** → release/v<버전>/
  lib/           위 명령이 부르는 구현 (직접 실행하지 않는다)
```

## 더블클릭해도 되고 인자를 줘도 된다

```
ops\release.cmd            package.json 의 version 으로
ops\release.cmd 0.3.0      버전 지정
ops\check.cmd C:\cdp       그 레포를 검사
ops\start.cmd C:\cdp       그 레포로 앱 실행
```

`npm run <이름>` 도 같은 것을 한다 — `.cmd` 는 **npm 을 모르는 사람도 쓸 수
있게** 둔 껍데기다.

## 산출물은 어디로

```
out/web/    화면 (vite)
out/ctx/    ctx 번들
out/exe/    cdp.exe
release/v<버전>/   배포본 — **이 폴더를 통째로 옮기면 CDP 를 쓸 수 있다**
```

셋 다 추적하지 않는다. `out/` 은 중간 산출물이고 `release/` 는 결과다.

## 버전은 몇 개나 들고 있나

버전 폴더 하나가 약 68MB 인데 **사실상 `cdp.exe` 하나가 그만큼**이다.
쌓이면 exe 만 쌓인다.

`release.cmd` 는 최근 2개를 넘으면 알려만 준다. **지우지는 않는다** —
배포본을 프로그램이 말없이 지우면 안 된다. 대신 되살릴 수 있는 것과
없는 것을 갈라서 말한다.

```
v0.1.0  68MB  태그 있음 -- 지워도 다시 만들 수 있습니다
v0.0.1  68MB  **태그 없음 -- 지우면 되살릴 수 없습니다**
```

되살아나는 근거는 태그와 `package-lock.json` 둘 다다. 태그가 소스를
고정하고 lock 이 의존성을 고정한다. 하나라도 없으면 그 버전은 다시
만들 수 없다 — 그래서 **배포한 버전에는 반드시 태그를 단다.**

```
git tag -a v0.2.0 -m "..."
git checkout v0.2.0 && npm ci && ops\release.cmd 0.2.0
```

