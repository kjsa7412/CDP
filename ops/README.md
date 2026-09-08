# ops — 명령

**사람이 실행하는 것은 여기 있고, 그것이 부르는 구현은 `tools/` 에 있다.**

전에는 둘이 섞여 있었다. `tools/` 를 열면 `build-exe.mjs`(스크립트가 부른다)와
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
  tools/         위 명령이 부르는 구현 (직접 실행하지 않는다)
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
