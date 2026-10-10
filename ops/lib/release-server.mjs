// 서버 산출물 — `cdp-server-v<버전>.tar.gz`. 검토 §3.2 · R2 · v1.0 개편안 §8.2(산출물은 이것과 사이트 둘).
//
//     npm run release:server            package.json 의 version 으로
//     npm run release:server -- 0.9.0   버전을 지정해서
//
// 서버에 올릴 것은 exe 69MB 가 아니다. 지금까지는 클라이언트 배포본에서
// `ctx.mjs` 와 `web/` 두 개를 골라 scp 했고, 그 과정에 `scp -r` 중첩 같은
// 함정이 있었다(설치절차 10장). 서버가 받을 것을 **한 덩어리**로 낸다.
//
//   cdp-server-v<버전>/
//     bin/ctx.mjs  bin/ctx  bin/ctx.cmd     서버 본체 (MCP · 관리 서비스 · ctx)
//     web/                                  관리 서비스 화면
//     forms/<묶음>/                         서식집 — 큐레이터가 새 관리 문서를 세울 때 고른다(팀 서식은 <data>/forms)
//     kit/                                  작업 레포 kit — 스킬 여섯(writer 셋 · 큐레이터 여섯) · CLAUDE 블록 둘(writer · 큐레이터). 설치 한 줄이 받는다
//     manual/                               설명서 + 그림 — 서버가 /manual 로 낸다
//     deploy/                               유닛 · install.sh · upgrade.sh · Dockerfile · compose
//     README.md                             버전 · 번들 시각 · 시작 한 줄
//
// 지식 레포 폴더(옛 `packages/<이름>/`)는 담지 않는다 — 새 레포는 서버가 빈 틀로 세운다(v1.0).

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, bundleStamp, copyDirLF, copyFileLF, copyKit, measure } from './bundle-files.mjs'
import { packDir } from '../../core/tar.js'

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))
const VERSION = (arg || pkg.version).replace(/^v/, '')
const NAME = `cdp-server-v${VERSION}`
const OUT_DIR = path.join(ROOT, 'ops', 'out', 'server')
const OUT = path.join(OUT_DIR, NAME)

const log = (...a) => console.log('[release:server]', ...a)
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })

// ── 1) 만든다 — 화면과 번들. exe 는 만들지 않는다 ─────────────────────────
log('버전 v' + VERSION)
if (!process.argv.includes('--no-build')) {
  log('① 화면')
  run('npm', ['run', 'build'])
  log('② ctx 번들')
  run('npm', ['run', 'build:ctx'])
}

// ── 2) 폴더로 묶는다 — 지우고 다시 만든다 ─────────────────────────────────
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const missing = []
const need = (src, rel) => {
  const s = path.join(ROOT, src)
  if (!fs.existsSync(s)) {
    missing.push(src)
    return
  }
  const d = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(d), { recursive: true })
  if (fs.statSync(s).isDirectory()) copyDirLF(s, d)
  else copyFileLF(s, d)
}

log('③ 구성')
need('ops/out/ctx/ctx.mjs', 'bin/ctx.mjs')
need('ops/out/ctx/ctx', 'bin/ctx')
need('ops/out/ctx/ctx.cmd', 'bin/ctx.cmd')
need('ops/out/web', 'web')
need('ops/deploy/cdp-serve.service', 'deploy/cdp-serve.service')
need('ops/deploy/install.sh', 'deploy/install.sh')
need('ops/deploy/upgrade.sh', 'deploy/upgrade.sh')
need('ops/deploy/Dockerfile', 'deploy/Dockerfile')
need('ops/deploy/docker-compose.yml', 'deploy/docker-compose.yml')
need('ops/deploy/README.md', 'deploy/README.md')
need('ops/deploy/설치절차.md', 'deploy/설치절차.md')
// 설명서 — 서버가 `/manual` 로 낸다(제품관리서비스 검토 §4.5). 그림 셋은 소개 페이지의 것.
need('manual', 'manual')
for (const f of ['1_세_레포_구조.svg', '2_설치_세_길.svg', '9_MCP_한_길.svg']) need(`docs/그림/${f}`, `manual/그림/${f}`)

// 서식집 · kit — 서버가 새 문서를 찍고(managed.add { form }) 작업 레포에 스킬을 내는 자리(v1.0 §8)
need('agent/forms', 'forms')
const kit = copyKit(ROOT, path.join(OUT, 'kit'))
missing.push(...kit.missing)

// sh 실행 권한 — tar 가 이것을 그대로 싼다. Windows 에서는 아래 tar 에서 mode 를 준다.
for (const f of ['bin/ctx', 'deploy/install.sh', 'deploy/upgrade.sh']) {
  try {
    fs.chmodSync(path.join(OUT, f), 0o755)
  } catch {}
}
const stamp = bundleStamp(ROOT)
fs.writeFileSync(
  path.join(OUT, 'README.md'),
  `# CDP 서버 v${VERSION}

빌드 ${stamp}

**서버에 올릴 것은 이 폴더 하나다.** 산출물 둘(\`ctx.mjs\` · \`web/\`)을 따로
꺼내 옮기지 않는다.

\`\`\`
bin/ctx.mjs       서버 본체 — MCP(http) · 관리 서비스 · ctx.  Node 20 으로 돈다
web/              관리 서비스 화면
forms/            서식집 — 큐레이터가 새 관리 문서를 세울 때 고른다(팀 서식은 <data>/forms)
kit/              작업 레포 kit — 스킬 ${kit.skills.length}(${kit.skills.join(' · ')}) · CLAUDE 블록 둘.  설치 한 줄이 받는다
manual/           설명서 + 그림.  서버가 /manual 로 낸다
deploy/           systemd 유닛 · install.sh · upgrade.sh · Dockerfile
\`\`\`

새 지식 레포는 콘솔 「새 지식 레포」(빈 틀 · 기록만 옮겨 오기) 또는 \`node bin/ctx.mjs repo new <root>/<이름>\`.

## 처음

\`\`\`
sudo bash deploy/install.sh --bind <이 서버 IP>
\`\`\`

끝에 찍히는 **부트스트랩 코드**로 브라우저 \`http://<IP>:7374/setup\` 에서 첫 관리자를 만들고,
레포 · 사용자 · 토큰은 콘솔(\`/console\`)에서 한다. git 자격(3장)만 셸이다 — \`deploy/설치절차.md\`.

## 갱신

\`\`\`
sudo bash deploy/upgrade.sh <이 tar.gz>
\`\`\`

## 확인

\`\`\`
node bin/ctx.mjs version                         ${stamp} · mcp: http
node bin/ctx.mjs serve doctor --root … --auth … --data … --web web     (kit · forms 는 번들 옆을 찾는다)
\`\`\`
`,
  'utf8'
)

// ── 3) tar.gz — 우리가 싼다(`core/tar.js`) ──────────────────────────────────
//
// 시스템 tar 를 쓰지 않는다. macOS 의 bsdtar 는 한글 파일명을 NFD 로 바꿔 싸서
// Linux 서버에서 설명서 · kit CLAUDE 블록이 조용히 빠졌다(제품화 2 검토 S1).
// 이름은 NFC · 실행 비트는 살린다. 풀 때는 GNU tar · bsdtar · `ctx self-update` 어느 쪽이든 같다.
const artifact = path.join(OUT_DIR, NAME + '.tar.gz')
fs.rmSync(artifact, { force: true })
fs.writeFileSync(artifact, packDir(OUT, NAME))

// ── 4) 보고 ─────────────────────────────────────────────────────────────
const m = measure(OUT)
log('')
log(`완료: ${path.relative(ROOT, OUT)}  파일 ${m.files} · ${m.mb}MB · 번들 ${stamp}`)
log(`      ${path.relative(ROOT, artifact)}  ${(fs.statSync(artifact).size / 1048576).toFixed(1)}MB`)
log(`      kit 스킬 ${kit.skills.length} — ${kit.skills.join(' · ') || '없음'} · 서식집 forms/`)
if (missing.length) {
  log('')
  log(`⚠ 빠진 것 ${missing.length}개 — 배포 전에 확인하세요:`)
  for (const x of missing) log('   ' + x)
  process.exitCode = 1
}
