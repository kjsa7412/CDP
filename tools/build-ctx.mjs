// bin/ctx.mjs 를 지식 레포용 단일 파일로 번들한다 — 작업환경 v1.1 §3.1.
//
// 왜 번들인가. `bin/ctx.mjs` 는 **지식 레포 안에** 들어가서 폐쇄망 PC 로
// 이관된다. 거기에는 node_modules 도 이 프로젝트도 없다. 그런데 구현을 손으로
// 베껴 두면 앱과 CLI 가 갈라진다 — 등록부를 한 곳에 두라고 한 것과 같은 이유로
// **계산도 한 곳에 있어야 한다.** 그래서 `server/core/` 에서 생성한다.
//
//   node tools/build-ctx.mjs [출력경로]
//
// 기본 출력은 sample-repo/bin/ctx.mjs.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.resolve(process.argv[2] || path.join(root, 'sample-repo', 'bin', 'ctx.mjs'))

fs.mkdirSync(path.dirname(outFile), { recursive: true })

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

const r = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
    path.join(root, 'bin', 'ctx-cli.mjs'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node18',
    '--legal-comments=none',
    '--banner:js=#!/usr/bin/env node\n' +
      '// 생성물 -- 손으로 고치지 마세요. `node tools/build-ctx.mjs` 가 만듭니다.\n' +
      '// 원본: server/core/ + bin/ctx-cli.mjs  (작업환경 설계서 3.1)\n',
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
  const src = path.join(root, 'bin', name)
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

// 진입 판정 확인 — 번들된 파일이 실제로 실행되는지 본다. 이것을 빼먹으면
// "번들은 됐는데 아무것도 안 나오는" 상태를 배포하게 된다.
const probe = spawnSync(process.execPath, [outFile, '--help'], { encoding: 'utf8' })
if (!/ctx check/.test(probe.stdout || '')) {
  console.error('[build-ctx] 실패: 번들이 실행되지 않습니다.')
  console.error((probe.stderr || probe.stdout || '').slice(0, 600))
  process.exit(1)
}
console.log('[build-ctx] 실행 확인 OK')
