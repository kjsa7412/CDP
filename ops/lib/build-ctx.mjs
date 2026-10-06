// bin/ctx.mjs 를 지식 레포용 단일 파일로 번들한다 — 작업환경 v1.1 §3.1.
//
// 왜 번들인가. `bin/ctx.mjs` 는 **지식 레포 안에** 들어가서 폐쇄망 PC 로
// 이관된다. 거기에는 node_modules 도 이 프로젝트도 없다. 그런데 구현을 손으로
// 베껴 두면 앱과 CLI 가 갈라진다 — 등록부를 한 곳에 두라고 한 것과 같은 이유로
// **계산도 한 곳에 있어야 한다.** 그래서 `core/` 에서 생성한다.
//
//   node ops/lib/build-ctx.mjs [출력경로]
//
// 기본 출력은 `out/ctx/ctx.mjs`.
//
// **전에는 `viewer/fixture/bin/ctx.mjs` 였다.** 빌드 산출물이 git 추적 대상인
// fixture 안에 살아서 빌드할 때마다 diff 가 떴고, exe 빌드가 fixture 에
// 의존했다. 산출물은 산출물 자리에 둔다.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// **`..` 가 두 번이다.** 이 파일은 `ops/lib/` 에 있으므로 한 번으로는
// `ops/` 를 가리킨다 -- 그러면 `ops/package.json` 을 찾다가 죽는다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const outFile = path.resolve(process.argv[2] || path.join(root, 'ops', 'out', 'ctx', 'ctx.mjs'))

fs.mkdirSync(path.dirname(outFile), { recursive: true })

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

// **`bin/esbuild` 가 무엇인지는 플랫폼마다 다르다.**
// Windows 에서는 node 가 읽는 JS 셔임이고, macOS·Linux 에서는 네이티브
// 바이너리다. 후자를 `node` 에 넘기면 "Invalid or unexpected token" 으로
// 죽는다 -- 개발 PC 가 Windows 라 이관 전까지 드러나지 않았다.
// 첫 바이트로 가른다 -- Mach-O cf/ce fa ed fe · ELF 7f 45 4c 46 · PE 4d 5a
const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
const magic = fs.readFileSync(esbuildBin).subarray(0, 4)
const isBinary =
  [[0xcf, 0xfa, 0xed, 0xfe], [0xce, 0xfa, 0xed, 0xfe], [0x7f, 0x45, 0x4c, 0x46]].some((sig) =>
    sig.every((b, i) => magic[i] === b)
  ) || (magic[0] === 0x4d && magic[1] === 0x5a)
const [cmd, head] = isBinary ? [esbuildBin, []] : [process.execPath, [esbuildBin]]

const r = spawnSync(
  cmd,
  [
    ...head,
    path.join(root, 'viewer', 'bin', 'ctx-cli.mjs'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    '--legal-comments=none',
    // **`require` 를 살려 둔다.**
    //
    // ESM 으로 말면 esbuild 는 `require` 를 "Dynamic require ... is not
    // supported" 를 던지는 셔임으로 바꾼다. 번들에 들어온 CJS 모듈(chokidar ·
    // MCP SDK)이 `require('events')` 같은 내장 모듈을 그렇게 부르므로, 서버가
    // **시작하자마자 죽는다.** 실측으로 잡았다.
    //
    // `createRequire` 로 진짜 `require` 를 준다 — 내장 모듈은 그대로 풀리고,
    // chokidar 의 `fsevents`(macOS 전용 네이티브)는 원래 try/catch 안이라
    // 없으면 없는 대로 간다.
    '--banner:js=#!/usr/bin/env node\n' +
      '// 생성물 -- 손으로 고치지 마세요. `node ops/lib/build-ctx.mjs` 가 만듭니다.\n' +
      '// 원본: core/ + viewer/bin/ctx-cli.mjs  (작업환경 설계서 3.1)\n' +
      "import{createRequire as __cr}from'node:module';var require=__cr(import.meta.url);\n",
    "--define:__CTX_BUILT_DEF__='" + stamp + "'",
    '--outfile=' + outFile,
  ],
  { stdio: 'inherit' }
)
if (r.status !== 0) process.exit(r.status || 1)

// esbuild 의 --define 은 식별자만 치환한다. 문자열 리터럴 안의 자리표시자는
// 빌드 후에 바꾼다 -- USAGE 문자열 안에도 들어 있어야 사용자가 볼 수 있다.
{
  const src = fs.readFileSync(outFile, 'utf8').split('__CTX_BUILT__').join(stamp)
  fs.writeFileSync(outFile, src, 'utf8')
}

// 판 — `core/appinfo.js` 의 `__CDP_VERSION__` 을 package.json 의 version 으로. 전에는 exe 빌드만
// 찍어서 서버(관리 서비스)가 자기가 몇 판인지 말할 수 없었다(제품관리서비스 TODO ②).
{
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const src = fs.readFileSync(outFile, 'utf8').split('__CDP_VERSION__').join(version)
  fs.writeFileSync(outFile, src, 'utf8')
}

// ── 설치기 — 꾸러미 안에 들어가는 실행기(설계서 §6.7.3) ────────────────
//
// **서버가 이 텍스트를 들고 있어야 한다.** `/kit?workrepo=` 가 zip 에
// `install.mjs` 로 넣는다. 따로 번들하는 이유는 하나다 -- 이 파일은
// `core/setup.js` 를 부르는데, 그것을 손으로 베껴 두면 병합 규칙이 두 벌이
// 되고 조금씩 어긋난다.
const installerFile = path.join(path.dirname(outFile), 'install.mjs')
{
  const ri = spawnSync(
    cmd,
    [
      ...head,
      path.join(root, 'viewer', 'bin', 'cdp-install.mjs'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node20',
      '--legal-comments=none',
      '--banner:js=// 생성물 -- 손으로 고치지 마세요.\n',
      '--outfile=' + installerFile,
    ],
    { stdio: 'inherit' }
  )
  if (ri.status !== 0) process.exit(ri.status || 1)
  const src = fs.readFileSync(installerFile, 'utf8')

  // **자리표시자를 통째로 바꾼다.** `--define` 은 못 쓴다 -- 명령줄에 수십
  // KB 를 실을 수 없다. `__CTX_BUILT__` 와 같은 방식이다.
  const bundled = fs.readFileSync(outFile, 'utf8')
  // esbuild 는 따옴표를 자기 취향으로 바꾼다 -- 소스에 `'...'` 로 써도
  // 번들에는 `"..."` 로 나온다. 둘 다 본다.
  const marks = ["'__CDP_INSTALLER_SRC__'", '"__CDP_INSTALLER_SRC__"']
  const mark = marks.find((m) => bundled.includes(m))
  if (!mark) {
    console.error('[build-ctx] 실패: 번들에 설치기 자리표시자가 없습니다.')
    process.exit(1)
  }
  fs.writeFileSync(outFile, bundled.split(mark).join(JSON.stringify(src)), 'utf8')
  console.log(`[build-ctx] 설치기 ${(src.length / 1024).toFixed(0)} KB 를 번들에 넣었습니다`)
}

const kb = (fs.statSync(outFile).size / 1024).toFixed(0)
console.log(`[build-ctx] ${path.relative(root, outFile)}  ${kb} KB`)

// 껍데기도 같이 옮긴다. 지식 레포에는 셋이 함께 있어야 실행기 선택이 돌아간다.
for (const name of ['ctx', 'ctx.cmd']) {
  const src = path.join(root, 'viewer', 'bin', name)
  const dst = path.join(path.dirname(outFile), name)
  if (!fs.existsSync(src)) continue
  fs.copyFileSync(src, dst)
  if (name === 'ctx') {
    try {
      fs.chmodSync(dst, 0o755)
    } catch {}
  }
  console.log(`[build-ctx] ${path.relative(root, dst)}`)
}

// 다른 지식 레포에도 같은 번들을 넣는다 — **손으로 복사하면 늦는다.**
//
// 지식 레포는 `bin/ctx` 를 **자기 안에** 들고 있다(폐쇄망 자족). 그래서
// 재번들할 때마다 레포마다 복사해야 하는데, 그걸 잊으면 그 레포는 옛 번들로
// 돈다 -- 그리고 **조용하다.** 실측에서 `C:\cdp` 의 `bin/ctx.mjs` 가 사흘
// 묵은 채로 남아, exe 와 소스는 고쳐졌는데 그 레포만 없어진 명령을 알고
// 있었다.
//
// 자동으로 찾을 방법은 없다 -- 레포 목록을 아는 곳이 없다. 그래서
// `CDP_REPO`(이미 `ctx --repo` 의 기본값으로 쓰는 그 변수)가 가리키는
// 레포까지만 같이 갱신하고, **무엇을 했는지 반드시 찍는다.**
{
  const extra = process.env.CDP_REPO
  const outDir = path.dirname(outFile)
  if (extra && fs.existsSync(path.join(extra, 'bin'))) {
    const dst = path.resolve(extra, 'bin')
    if (dst !== path.resolve(outDir)) {
      for (const name of ['ctx.mjs', 'ctx', 'ctx.cmd']) {
        const src = path.join(outDir, name)
        if (!fs.existsSync(src)) continue
        fs.copyFileSync(src, path.join(dst, name))
        if (name === 'ctx') {
          try {
            fs.chmodSync(path.join(dst, name), 0o755)
          } catch {}
        }
      }
      console.log(`[build-ctx] CDP_REPO 도 갱신: ${dst}`)
    }
  } else if (extra) {
    console.log(`[build-ctx] CDP_REPO=${extra} 에 bin/ 이 없어 건너뜀`)
  }
}

// 진입 판정 확인 — 번들된 파일이 실제로 실행되는지 본다. 이것을 빼먹으면
// "번들은 됐는데 아무것도 안 나오는" 상태를 배포하게 된다.
const probe = spawnSync(process.execPath, [outFile, '--help'], { encoding: 'utf8' })
if (!/ctx check/.test(probe.stdout || '')) {
  console.error('[build-ctx] 실패: 번들이 실행되지 않습니다.')
  console.error((probe.stderr || probe.stdout || '').slice(0, 600))
  process.exit(1)
}
console.log('[build-ctx] 실행 확인 OK')
