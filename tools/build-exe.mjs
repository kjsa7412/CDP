// 포터블 단일 실행 파일 빌드 — 설계서 §5.1 A안 · §32 11단계.
//
// Node SEA(Single Executable Applications)를 쓴다. 공식 기능이라 서드파티 패커
// 의존을 만들지 않는다(§9). 네이티브 모듈을 하나도 안 쓰기 때문에 이 방식이
// 성립한다 — SQLite 를 넣었으면 여기서 막혔을 것이다.
//
//   node tools/build-exe.mjs
//   → build/cdp.exe  (~110MB)
//
// 화면(dist/)과 서버(server/)를 하나의 CJS 번들로 말아 blob 에 넣는다.

import { execFileSync, execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import rcedit from 'rcedit'
import { buildIco } from './make-icon.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const OUT = path.join(BUILD, process.platform === 'win32' ? 'cdp.exe' : 'cdp')

const log = (...a) => console.log('[build-exe]', ...a)

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
}

// 1) 화면 빌드
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  log('dist 가 없다. vite build 실행')
  run('npm', ['run', 'build'])
}

fs.rmSync(BUILD, { recursive: true, force: true })
fs.mkdirSync(BUILD, { recursive: true })

// 2) dist/ 를 코드에 인라인한다.
//    SEA 는 에셋을 따로 넣을 수 있지만(sea-config assets), 파일 수만큼 키를
//    관리해야 한다. 화면 파일이 10여 개뿐이라 base64 로 말아 넣는 편이 단순하다.
const distDir = path.join(ROOT, 'dist')
const assets = {}
;(function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(p, r)
    else assets[r] = fs.readFileSync(p).toString('base64')
  }
})(distDir)
log(`화면 에셋 ${Object.keys(assets).length}개 인라인`)

fs.writeFileSync(
  path.join(BUILD, 'assets.cjs'),
  'module.exports = ' + JSON.stringify(assets) + ';\n'
)

// 3) 서버를 CJS 로 번들. esbuild 는 vite 의 의존성으로 이미 있다.
const entryShim = path.join(BUILD, 'entry.cjs')
fs.writeFileSync(
  entryShim,
  `// SEA 진입점 — 내장 에셋을 전역에 걸고 서버를 띄운다
globalThis.__CTXVIEW_ASSETS__ = require('./assets.cjs')
require('${path.join(ROOT, 'server', 'index.js').replace(/\\/g, '\\\\')}')
`
)

// **ctx 번들을 먼저 만든다.** 이것을 분리해 두면 반드시 어긋난다.
//
// 폐쇄망 실측에서 exe 가 `sync`·`version` 없이 낡아 있었고, 더 나쁜 것 --
// `bin/ctx.mjs` 는 "같은 날짜는 이후가 아니다" 수정이 들어간 새 것이고 exe 는
// 안 들어간 옛 것이라 **두 실행기가 다른 답을 냈다** (밀림 3곳 vs 4곳).
//
// "앱과 ctx 가 다른 답을 내면 사용자는 어느 쪽을 믿을지 알 수 없다" 는 것이
// core/repo.js 를 만든 이유였는데, **빌드 단계에서 같은 일이 일어났다.**
// 하나만 갱신될 수 없게 묶는다.
log('ctx 번들 (exe 에 들어갈 같은 코드)')
{
  const r0 = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-ctx.mjs')], { stdio: 'inherit' })
  if (r0.status !== 0) {
    console.error('[build-exe] ctx 번들 실패 — exe 를 만들지 않는다')
    process.exit(r0.status || 1)
  }
}

log('esbuild 번들')
run('npx', [
  'esbuild',
  entryShim,
  '--bundle',
  '--platform=node',
  '--target=node20',
  '--format=cjs',
  '--outfile=' + path.join(BUILD, 'bundle.cjs'),
  '--external:fsevents',
  '--log-level=warning',
])

// 3.5) 번들 시각을 exe 에도 심는다.
//
// **exe 가 자기 버전을 못 말하면 낡았는지 알 방법이 없다.** 실측에서 exe 가
// `sync`·`version` 없이 낡아 있었는데, 하필 `version` 이 없어서 그 사실을
// 확인할 수단도 없었다 -- "모르는 명령" 이라는 증상만 남는다.
//
// `bin/ctx.mjs` 와 **같은 값**을 심는다. 그래야 둘을 대조할 수 있다.
{
  const ctxBundle = path.join(ROOT, 'sample-repo', 'bin', 'ctx.mjs')
  let stamp = null
  if (fs.existsSync(ctxBundle)) {
    const m = fs.readFileSync(ctxBundle, 'utf8').match(/BUILT\s*=\s*['"]([^'"]+)['"]/)
    if (m && !m[1].startsWith('__')) stamp = m[1]
  }
  if (stamp) {
    const f = path.join(BUILD, 'bundle.cjs')
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split('__CTX_BUILT__').join(stamp), 'utf8')
    log(`ctx 번들 시각 ${stamp} 을 exe 에 심었다`)
  } else {
    log('⚠ ctx 번들 시각을 못 읽었다 — exe 의 ctx version 이 비어 있게 된다')
  }
}

// 4) SEA blob 생성
fs.writeFileSync(
  path.join(BUILD, 'sea-config.json'),
  JSON.stringify(
    {
      main: path.join(BUILD, 'bundle.cjs'),
      output: path.join(BUILD, 'sea-prep.blob'),
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2
  )
)

log('SEA blob 생성')
run('node', ['--experimental-sea-config', path.join(BUILD, 'sea-config.json')])

// 5) node 실행 파일 복사
fs.copyFileSync(process.execPath, OUT)
log(`node 복사 → ${path.relative(ROOT, OUT)}`)

if (process.platform === 'win32') {
  // 서명이 있으면 주입 전에 떼어낸다. 없으면 무시.
  try {
    execSync(`npx signtool remove /s "${OUT}"`, { stdio: 'ignore' })
  } catch {}

  // 5-1) 아이콘과 버전 정보.
  //
  // 리소스 편집은 **blob 주입 전에** 한다. postject 가 넣은 섹션을 나중에
  // 건드리면 깨질 수 있다.
  //
  // 아이콘이 없으면 탐색기·작업표시줄에 Node 아이콘이 뜬다. 사용자가
  // 자기 도구를 못 알아본다 — 트레이가 그리는 마크와 같은 모양을 쓴다.
  const icoPath = path.join(BUILD, 'cdp.ico')
  fs.writeFileSync(icoPath, buildIco())
  log('아이콘 생성 (16~256px)')

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  try {
    await rcedit(OUT, {
      icon: icoPath,
      'version-string': {
        ProductName: 'cdp',
        FileDescription: '지식 레포 뷰어',
        CompanyName: '',
        LegalCopyright: '',
        OriginalFilename: 'cdp.exe',
        InternalName: 'cdp',
      },
      'file-version': `${pkg.version}.0`,
      'product-version': `${pkg.version}.0`,
    })
    log('아이콘·버전 정보 적용')
  } catch (e) {
    log('⚠ 리소스 편집 실패 — Node 아이콘으로 남는다:', e.message)
  }

  // 5-2) PE 서브시스템을 CONSOLE(3) → WINDOWS(2) 로 바꾼다.
  //
  // 설계서 §5.2 ② "콘솔 창 없음". node.exe 를 그대로 복사하면 콘솔
  // 서브시스템이라 더블클릭 시 검은 창이 같이 뜬다.
  //
  // 대신 stdout 이 사라지므로 로그를 파일로도 남긴다(§6.1 logs/app.log).
  // CLI 로 쓰는 경로는 `npx cdp` 쪽이고 그건 콘솔 그대로다.
  patchSubsystem(OUT)
}

log('postject 주입 (수 분 걸린다)')
run('npx', [
  '--yes',
  'postject',
  OUT,
  'NODE_SEA_BLOB',
  path.join(BUILD, 'sea-prep.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
])

// PE 헤더의 Subsystem 필드를 WINDOWS(2) 로 바꾼다.
//   DOS 헤더 0x3C  → PE 시그니처 오프셋
//   PE+0x18        → Optional Header (magic 0x20b = PE32+)
//   Optional+0x44  → Subsystem (2바이트)
function patchSubsystem(exe) {
  const fd = fs.openSync(exe, 'r+')
  try {
    const head = Buffer.alloc(0x400)
    fs.readSync(fd, head, 0, head.length, 0)
    if (head.readUInt16LE(0) !== 0x5a4d) throw new Error('MZ 시그니처 없음')

    const peOff = head.readUInt32LE(0x3c)
    const sig = Buffer.alloc(4)
    fs.readSync(fd, sig, 0, 4, peOff)
    // 'P','E',0,0 — 문자열 비교는 NUL 때문에 실수하기 쉽다. 바이트로 본다.
    if (sig[0] !== 0x50 || sig[1] !== 0x45 || sig[2] !== 0 || sig[3] !== 0) {
      throw new Error('PE 시그니처 없음')
    }

    const optOff = peOff + 24
    const magic = Buffer.alloc(2)
    fs.readSync(fd, magic, 0, 2, optOff)
    const isPE32Plus = magic.readUInt16LE(0) === 0x20b
    if (!isPE32Plus && magic.readUInt16LE(0) !== 0x10b) throw new Error('Optional Header magic 불명')

    const subOff = optOff + 0x44
    const cur = Buffer.alloc(2)
    fs.readSync(fd, cur, 0, 2, subOff)
    const before = cur.readUInt16LE(0)
    if (before === 2) {
      log('서브시스템 이미 WINDOWS')
      return
    }
    if (before !== 3) throw new Error(`예상치 못한 서브시스템 값 ${before}`)

    fs.writeSync(fd, Buffer.from([0x02, 0x00]), 0, 2, subOff)
    log('서브시스템 CONSOLE → WINDOWS (더블클릭 시 콘솔 창 없음)')
  } catch (e) {
    log('⚠ 서브시스템 패치 실패 — 콘솔 창이 뜬다:', e.message)
  } finally {
    fs.closeSync(fd)
  }
}

const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1)
log(`완료: ${path.relative(ROOT, OUT)} (${mb}MB)`)
log('')
log('  포터블 모드로 쓰려면 exe 옆에 빈 파일 cdp.portable 을 둔다(§6.1).')
log('  실행:  cdp.exe --repo <지식 레포 경로>')
