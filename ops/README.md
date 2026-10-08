# ops — 명령 · 구현 · 배포 · 검증

```
ops/
  setup.cmd      최초 1회 — 의존성 설치
  dev.cmd        개발 — 개인 서버(7373 · viewer/fixture) + 화면(vite 5173)
  start.cmd      개인 서버로 띄운다(빌드된 화면). 인자로 레포 경로 — 없으면 viewer/fixture
  check.cmd      지식 레포 검사(ctx check)
  seed.cmd       viewer/fixture 재생성(지식만)
  release.cmd    **서버 산출물** → ops/out/server/cdp-server-v<버전>.tar.gz
  lib/           위 명령이 부르는 구현 (직접 실행하지 않는다)
    build-ctx.mjs       ctx 번들(ops/out/ctx/ctx.mjs) — 서버 본체 하나
    release-server.mjs  서버 산출물 — bin · web · forms · kit · manual · deploy
    bundle-files.mjs    산출물에 담는 파일 — LF 복사 · kit(스킬 다섯 · CLAUDE 블록 둘) · 번들 시각
    seed.mjs · seed_repo.py   표본 레포 재생성
  deploy/        서버 — install.sh · upgrade.sh · cdp-serve.service · Dockerfile · 설치절차.md
  verify/        검증 하네스 — npm run verify
```

`npm test` · `npm run verify` · `npm run release:server` 는 `.cmd` 껍데기와 같은 것을 한다 — `.cmd` 는 **npm 을 모르는 사람도 쓸 수 있게** 둔 껍데기다(CP949 · CRLF — cmd.exe 가 읽는다).

## 더블클릭해도 되고 인자를 줘도 된다

```
ops\release.cmd            package.json 의 version 으로
ops\release.cmd 1.0.0      버전 지정
ops\check.cmd C:\repos\x   그 레포를 검사
ops\start.cmd C:\repos\x   그 레포로 개인 서버
```

## 산출물은 어디로

```
out/web/      화면 (vite)
out/ctx/      ctx 번들 — 서버 본체(bin/ctx.mjs)
out/server/   cdp-server-v<버전>/ 와 그 tar.gz   ← 서버에 올리는 것
out/site/     공식 사이트(build:site)
```

추적하지 않는다. v1.0 의 산출물은 **서버 tar 와 사이트 zip 둘**이다 — v0.x 의 win 폴더(exe + 지식 레포 폴더)는 없다. 새 지식 레포는 서버가 빈 틀로 세우고, 작업 레포의 스킬은 서버의 `kit/` 에서 나간다.

## 판과 태그

배포한 판에는 반드시 태그를 단다 — 태그가 소스를, `package-lock.json` 이 의존성을 고정한다. 태그 `v*` 를 push 하면 Actions 가 서버 tar · 사이트 zip · `SHA256SUMS` 를 Release 에 붙인다(태그와 `package.json` 판이 다르면 실패).

```
git tag -a v1.0.0 -m "..."
git checkout v1.0.0 && npm ci && ops\release.cmd 1.0.0
```
