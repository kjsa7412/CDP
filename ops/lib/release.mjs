// 원클릭 릴리스 — 화면 → ctx 번들 → exe → **버전 폴더로 묶기**.
//
//     npm run release            package.json 의 version 으로
//     npm run release -- 0.3.0   버전을 지정해서
//
// 결과는 `release/v<버전>/` 하나다. **그 폴더를 통째로 옮기면 CDP 를 쓸 수
// 있다** — 그것이 이 스크립트가 존재하는 이유다.
//
// 전에는 `npm run release` 가 `build && build:exe && seed` 를 이어 붙인
// 문자열이었다. 산출물이 `build/`·`dist/`·`fixture/bin/` 에 흩어져 있어서
// **무엇을 나눠줘야 하는지 사람이 기억해야 했다.** 기억에 의존하면 빠뜨린다.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleKnowledgeRepo, bundleStamp, listPackages } from './assemble.mjs'

// **`..` 가 두 번이다.** 이 파일은 `ops/lib/` 에 있으므로 한 번으로는
// `ops/` 를 가리킨다 -- 그러면 `ops/package.json` 을 찾다가 죽는다.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))
const VERSION = (arg || pkg.version).replace(/^v/, '')
// 버전 폴더가 사는 곳. **한 곳에서만 만든다** -- 전에는 목록은 `ops/release`
// 에서 읽고 크기는 `release/` 에서 쟀다(구조 재편 때 옮겨진 자리). 그래서
// 폴더가 셋을 넘는 순간 -- 다 만들어 놓고 마지막 안내에서 -- ENOENT 로 죽었다.
const REL = path.join(ROOT, 'ops', 'release')
const OUT = path.join(REL, 'v' + VERSION)

const log = (...a) => console.log('[release]', ...a)
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })

// **줄바꿈을 LF 로 맞춰서 담는다.**
//
// 이 레포의 작업본은 `core.autocrlf=true` 인 PC 에서 CRLF 로 놓인다. 그걸
// 그대로 복사하면 배포본에 CRLF 가 섞여 나가고, 받는 사람의 **첫 커밋에서
// 경고가 19줄** 뜬다 -- `.gitattributes` 의 `* text=auto eol=lf` 가 그제서야
// 전부 되돌리기 때문이다. 복사 붙여넣기로 끝난다고 해 놓고 첫 화면이 경고면
// 그 약속이 거짓말이 된다.
//
// 기준은 **자기 자신을 clone 한 결과와 같아지는 것**이다. 예외는 `.cmd` 하나 —
// 전에는 "clone 하면 LF 가 되고, 그래도 돈다" 고 적어 두었는데 **틀렸다.** LF 로 바뀐
// ctx.cmd 는 cmd.exe 에서 `( … )` 블록이 어긋나 죽는다(2026-09-23 실측 · CRLF 는 돈다).
// 그래서 지식 레포의 `.gitattributes` 도 `*.cmd text eol=crlf` 다.
const BIN = /[.](?:exe|png|jpe?g|gif|ico|pdf|xlsx?|hwpx?|pptx?|zip|woff2?|ttf|otf|blob)$/i
// `.cmd` 는 CRLF 그대로 — cmd.exe 가 LF 파일을 잘못 읽는다(`assemble.mjs` 의 같은 주석).
const ASIS = /[.](?:cmd|bat)$/i
function copyFile(s, d) {
  if (BIN.test(s) || ASIS.test(s)) return fs.copyFileSync(s, d)
  const b = fs.readFileSync(s)
  // NUL 이 있으면 확장자가 뭐든 이진이다. 확장자 목록은 언젠가 샌다.
  if (b.includes(0)) return fs.copyFileSync(s, d)
  fs.writeFileSync(d, b.toString('utf8').replace(/\r\n/g, '\n'))
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    // **실행 파일을 두 번 담지 않는다.** 전에 샘플 레포에 옛 cdp.exe 사본이
    // 남아 릴리스가 68MB → 136MB 가 된 적이 있다. 샘플은 이제 안 담지만
    // 다른 폴더에서 같은 일이 나지 않게 가드는 남긴다.
    if (e.isFile() && /[.]exe$/i.test(e.name)) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else copyFile(s, d)
  }
}

function put(src, rel) {
  const s = path.join(ROOT, src)
  if (!fs.existsSync(s)) return false
  const d = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(d), { recursive: true })
  if (fs.statSync(s).isDirectory()) copyDir(s, d)
  else copyFile(s, d)
  return true
}

// ── 1) 만든다 ───────────────────────────────────────────────────────────
log('버전 v' + VERSION)
// `--no-build` — 이미 만든 ops/out/ 로 **조립만** 다시 한다. 조립 함수를 고쳤을 때
// exe 를 다시 굽지 않고 결과를 대조하는 용도다(제품화 TODO 2.1).
if (!process.argv.includes('--no-build')) {
  log('① 화면')
  run('npm', ['run', 'build'])
  log('② ctx 번들')
  run('npm', ['run', 'build:ctx'])
  log('③ 단일 실행 파일 (수 분)')
  run('npm', ['run', 'build:exe'])
} else {
  log('--no-build: ops/out 을 그대로 쓴다')
}

// ── 2) 버전 폴더로 묶는다 ───────────────────────────────────────────────
//
// **덮어쓰지 않고 지우고 다시 만든다.** 지난 릴리스의 파일이 섞여 남으면
// 그것이 이번 판인지 아무도 모른다.
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

log('④ release/v' + VERSION + ' 구성')

const missing = []
const need = (src, rel) => {
  if (!put(src, rel)) missing.push(src)
}

// 실행 파일 — 앱과 ctx 가 한 파일
// **실행 파일 이름은 플랫폼마다 다르다.** Windows 는 `cdp.exe`, macOS·Linux 는
// 확장자 없는 `cdp` 다. 이름을 하나로 박아 두면 맥에서 만든 릴리스가
// "빠진 것 1개"라고 자기를 의심한다 -- 실제로는 다 만들어 놓고서.
// 만든 쪽 이름 그대로 담는다. 받는 사람은 자기 OS 것을 쓴다.
const EXE = process.platform === 'win32' ? 'cdp.exe' : 'cdp'

// ── 지식 레포를 **완성된 채로** 낸다 ──────────────────────────────────────
//
// 전에는 `repo-kit/` 과 `packages/` 를 따로 주고 받는 사람이 둘을 차례로
// 부었다. **그 이름은 우리 개념이지 받는 사람의 것이 아니다** -- 무엇이
// repo-kit 이고 무엇이 package 인지 알아야 붓는 순서를 맞출 수 있었다.
//
// 패키지마다 폴더 하나를 완성해 낸다. **복사하면 그게 지식 레포다.**
// 설치 시나리오는 **배포본 루트**다. 지식 레포가 아직 없을 때 읽는 문서라
// 폴더 안에 두면 복사한 뒤에야 보인다 -- 순서가 거꾸로다.
need('agent/install.md', '설치.md')

// **조립은 `assemble.mjs` 가 한다.** 서버 산출물(`release-server.mjs`)이 같은
// 폴더를 `packages/<이름>/` 으로 담아야 해서 함수로 꺼냈다 — 두 곳에 두면
// 갈라진다. 여기 있던 need() 열다섯 줄이 그대로 그 안에 있다.
const packages = listPackages(ROOT)
if (!packages.length) missing.push('agent/packages/<패키지>')

// **exe 는 배포본 루트에 한 번만.** 폴더마다 tools/ 에 넣으면 패키지 수만큼(68MB×N)
// 커진다 — 셋에서 213MB 였다. 받는 사람이 복사한 레포의 tools/ 에 한 번 복사한다
// (설치.md ③). 조립은 그 자리를 빈 tools/ 로 남긴다.
for (const name of packages) {
  const r = assembleKnowledgeRepo({ root: ROOT, name, dest: path.join(OUT, `knowledge-repo-${name}`), exe: null })
  missing.push(...r.missing)
}
need(path.join('ops', 'out', 'exe', EXE), EXE)

// ── 3) 설치 안내 ────────────────────────────────────────────────────────
const stamp = bundleStamp(ROOT)

// **exe 안의 ctx 판이 번들과 같아야 한다.** `--no-build` 로 조립만 다시 하면 exe 는 옛 번들을
// 품고 레포의 bin/ 은 새 번들이 된다 — 설치.md ⑥ "세 곳이 같아야 한다" 가 배포본 안에서부터
// 깨진다(설명서 걷기 2026-09-23: exe 03:24 · bin 03:52). 사람이 보라고 적은 것을 빌드가 먼저 본다.
try {
  const v = execFileSync(path.join(OUT, EXE), ['ctx', 'version'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
  if (v !== stamp) missing.push(`${EXE} 의 ctx 판(${v})이 번들(${stamp})과 다르다 — npm run build:exe 뒤 다시 (또는 --no-build 를 뺀다)`)
} catch (e) {
  missing.push(`${EXE} 가 실행되지 않는다 — ${String(e?.message || e).split(/\r?\n/)[0]}`)
}

// 패키지 표 — 배포본에 폴더가 여럿이면 받는 사람이 **하나를 고른다.** 이름만으로는
// 못 고르므로 매니페스트의 제목 · 판 · 설명과 문서 수를 같이 낸다. 전에는 예시가
// `knowledge-repo-dpms` 하나로 박혀 있어 둘째 패키지가 생기면 안내가 거짓이 됐다.
const countDocs = (d) => {
  let n = 0
  ;(function walk(x) {
    if (!fs.existsSync(x)) return
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(x, e.name))
      else if (/\.md$/i.test(e.name)) n++
    }
  })(d)
  return n
}
const pkgRows = packages.map((name) => {
  let mf = {}
  try {
    mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent', 'packages', name, '_package.json'), 'utf8').replace(/^﻿/, ''))
  } catch {}
  const docs = countDocs(path.join(ROOT, 'agent', 'packages', name, 'docs'))
  return `| \`knowledge-repo-${name}/\` | ${mf.title || ''} | ${mf.version || '-'} | ${docs} | ${mf.description || ''} |`
})

fs.writeFileSync(
  path.join(OUT, 'README.md'),
  `# CDP v${VERSION}

빌드 ${stamp}

**이 폴더를 통째로 옮기면 CDP 를 쓸 수 있다.**

\`\`\`
cdp.exe                 앱 + ctx 가 한 파일 (~68MB). **패키지가 여럿이어도 하나** — 복사한 레포의 tools/ 에 넣는다
knowledge-repo-<이름>/   **복사하면 그게 지식 레포다.** 패키지마다 하나씩 (exe 는 없다)
  docs/                관리 문서 골격 — 이 패키지가 정한다
  _vocab.md            좌표 어휘 · _managed.md  등록부
  bin/                 ctx 실행기 (Node 없어도 돈다 — tools/ 의 exe 로 넘어간다)
  tools/               **비어 있다.** 위 cdp.exe 를 여기 복사한다. 더블클릭하면 이 레포가 열린다
  .githooks/           pre-commit — 유일한 결정론적 보증
  .claude/skills       절차 (work · load · save · managed · import · edit · push)
  .gitattributes       **줄바꿈 고정.** 없으면 훅이 조용히 죽는다
  CLAUDE.md            레포 규약 · MANUAL 셋 · TEMPLATE-work.md
  README.md            이 문서 세트가 무엇인가 · 첫날 무엇을 하나
설치.md                **설치 시나리오 — 여기부터 읽는다**
\`\`\`

**설계서도 변환기도 안 들어 있다.** 앞은 CDP 를 고칠 사람의 것이고 뒤는
패키지를 만든 사람의 것이다 — 둘 다 소스 레포에 있다.

설치는 \`설치.md\` 를 따른다 — 네 자리(개발 PC · 지식 레포 · 작업
레포 · 팀원 PC)에서 벌어지고, 한 자리만 보면 반드시 빠뜨린다.

## 이 배포본의 패키지 — **하나만 고른다**

| 폴더 | 무엇 | 판 | 문서 | 설명 |
|---|---|---|--:|---|
${pkgRows.join('\n')}

프로젝트당 지식 레포는 하나다. 프로젝트에 맞는 폴더 **하나**를 복사한다 — 둘을
합치지 않는다. 패키지는 서식이라 값이 없고, 문서 목록만 다르다.

## 새 지식 레포 세우기 — 폴더를 복사한다

\`\`\`
xcopy /E /I knowledge-repo-<고른 것> C:\\cdp
copy cdp.exe C:\\cdp\\tools\\
cd /d C:\\cdp
git init && git config core.hooksPath .githooks
\`\`\`

**네 줄이다.** 전에는 \`repo-kit\` 과 \`packages\` 를 차례로 부어야 했다 — 그 이름은
만든 쪽 개념이지 받는 쪽의 것이 아니었다. exe 는 한때 폴더마다 넣었는데 패키지가
늘자 배포본이 그 수만큼(68MB×N) 커져서 **루트에 하나만** 두고 복사하게 했다.

\`tools\\cdp.exe\` 를 더블클릭하면 이 레포가 열린다. Node 가 없는 PC 에서는
\`bin/ctx\` 가 이 exe 로 넘어간다 — 없으면 훅이 검사를 건너뛴다. 레포의
\`.gitignore\` 가 \`/tools/*.exe\` 를 막으므로 68MB 가 커밋되지는 않는다.

복사 직후 \`bin\\ctx check\` 가 **이상 없음**이면 시작할 수 있다. 안 쓰는
문서를 지울 때는 \`_managed.md\` 에서 그 패턴도 함께 지운다 — 자세한 것은
그 폴더의 \`README.md\`.

**\`_vocab.md\` 가 먼저다.** \`ctx setup\` 은 그 파일로 지식 레포를 알아본다 —
없으면 "지식 레포를 찾을 수 없습니다" 로 멈춘다(exit 2).

## 작업 레포에도 넣는다

코드가 있는 레포에서 클로드를 열면 **지식 레포의 skill 이 보이지 않는다** —
하네스는 프로젝트 루트의 \`.claude/skills/\` 만 읽는다. 한 번 넣어 준다.

\`\`\`
tools\\cdp.exe ctx setup C:\\gdi
\`\`\`

규약(\`CLAUDE.md\`, 지식 레포 경로가 박힌다)과 skill 전부가 함께 들어간다.
작업 레포의 \`.gitignore\` 가 \`.claude\` 를 막고 있으면 그것도 알려 준다 —
막힌 채로 두면 **내 PC 에서만 되고 팀은 받지 못한다.**

## 폐쇄망으로

파일 두 개만 옮기면 된다.

\`\`\`
① 이 폴더 (또는 cdp.exe + knowledge-repo-<고른 것>/ 둘만)
② git bundle create knowledge.bundle --all     ← 지식 레포가 이미 있다면
\`\`\`

**CDN·인터넷을 타는 것이 하나도 없다.** 화면의 폰트까지 base64 로 인라인돼
있다.

## 확인

\`\`\`
cdp.exe ctx version      → ${stamp}
cd <지식 레포> && bin/ctx check
\`\`\`

세 곳(배포본의 \`cdp.exe\` · 레포의 \`tools\\cdp.exe\` · 레포의 \`bin\\ctx\`)의 \`ctx version\` 이
**같아야 한다.** 다르면 그 레포만 옛 답을 낸다.
`,
  'utf8'
)

// ── 4) 보고 ─────────────────────────────────────────────────────────────
let files = 0
let bytes = 0
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else {
      files++
      bytes += fs.statSync(p).size
    }
  }
})(OUT)

log('')
log('완료: release/v' + VERSION)
log('  파일 %d · %sMB · 번들 %s'.replace('%d', files)
    .replace('%s', (bytes / 1048576).toFixed(1)).replace('%s', stamp))
if (missing.length) {
  // **빠진 것을 조용히 넘기지 않는다.** 없는 채로 배포되면 받는 쪽이
  // 그것을 없는 기능으로 안다.
  log('')
  log('⚠ 빠진 것 %d개 — 배포 전에 확인하세요:'.replace('%d', missing.length))
  for (const m of missing) log('   ' + m)
  process.exitCode = 1
}

// ── 5) 보관 안내 ────────────────────────────────────────────────────────
// 버전 폴더는 하나가 68MB 다 -- 사실상 `cdp.exe` 하나가 그만큼이다.
// 쌓이면 exe 만 쌓인다.
//
// **지우지는 않는다.** 배포본을 프로그램이 말없이 지우면 안 된다.
// 대신 되살릴 수 있는 것과 없는 것을 갈라서 알려준다 -- 태그가 없는
// 버전은 지우면 끝이므로, 지워도 된다고 말하지 않는다.
const KEEP = 2

const tags = (() => {
  try {
    return new Set(
      execFileSync('git', ['tag'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map((s) => s.trim())
    )
  } catch {
    return null // git 이 없거나 저장소가 아니다 -- 그러면 아무 말도 하지 않는다
  }
})()

const semver = (v) => v.replace(/^v/, '').split('.').map(Number)
const older = fs
  .readdirSync(REL, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^v\d/.test(e.name))
  .sort((a, b) => {
    const [x, y] = [semver(b.name), semver(a.name)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
  })
  .slice(KEEP)

if (older.length && tags) {
  const size = (d) => {
    let n = 0
    ;(function w(p) {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const q = path.join(p, e.name)
        e.isDirectory() ? w(q) : (n += fs.statSync(q).size)
      }
    })(d)
    return (n / 1048576).toFixed(0) + 'MB'
  }
  const safe = older.filter((e) => tags.has(e.name))
  const risky = older.filter((e) => !tags.has(e.name))

  log('')
  log('보관: 버전 폴더 %d개 -- 최근 %d개를 넘습니다'
    .replace('%d', older.length + KEEP).replace('%d', KEEP))
  for (const e of safe) log('   %s  %s  태그 있음 -- 지워도 다시 만들 수 있습니다'
    .replace('%s', e.name).replace('%s', size(path.join(REL, e.name))))
  for (const e of risky) log('   %s  %s  **태그 없음 -- 지우면 되살릴 수 없습니다**'
    .replace('%s', e.name).replace('%s', size(path.join(REL, e.name))))
  if (safe.length) {
    log('')
    log('   되살리는 법:  git checkout %s && npm ci && ops\\release.cmd %s'
      .replace('%s', safe[0].name).replace('%s', safe[0].name.slice(1)))
  }
  if (risky.length) {
    log('')
    log('   태그를 먼저 다세요:  git tag -a %s <그 시점 커밋>'.replace('%s', risky[0].name))
  }
}
