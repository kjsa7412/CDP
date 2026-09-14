// bin/ctx.mjs 를 지식 레포용 단일 파일로 번들한다 — 작업환경 v1.1 §3.1.
//
// 왜 번들인가. `bin/ctx.mjs` 는 **지식 레포 안에** 들어가서 폐쇄망 PC 로
// 이관된다. 거기에는 node_modules 도 이 프로젝트도 없다. 그런데 구현을 손으로
// 베껴 두면 앱과 CLI 가 갈라진다 — 등록부를 한 곳에 두라고 한 것과 같은 이유로
// **계산도 한 곳에 있어야 한다.** 그래서 `server/core/` 에서 생성한다.
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
    '--target=node18',
    '--legal-comments=none',
    '--banner:js=#!/usr/bin/env node\n' +
      '// 생성물 -- 손으로 고치지 마세요. `node ops/lib/build-ctx.mjs` 가 만듭니다.\n' +
      '// 원본: viewer/server/core/ + viewer/bin/ctx-cli.mjs  (작업환경 설계서 3.1)\n',
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

// 샘플 레포에도 넣어 둔다 -- `npm start` 로 띄운 fixture 에서 `bin/ctx` 가
// 바로 돌아야 한다. **정본은 `out/ctx/` 이고 이것은 편의 사본이다**(추적 안 함).
{
  const outDir = path.dirname(outFile)
  const dst = path.join(root, 'viewer', 'fixture', 'bin')
  fs.mkdirSync(dst, { recursive: true })
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
  console.log('[build-ctx] viewer/fixture/bin 갱신 (편의 사본)')
}
