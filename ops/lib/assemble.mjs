// 지식 레포 폴더를 **조립한다** — 릴리스와 서버 산출물이 같은 것을 부른다.
//
// `release.mjs` 안에 있던 패키지 루프를 꺼냈다. 서버 산출물(`release-server.mjs`)
// 도 같은 폴더를 `packages/<이름>/` 으로 담아야 하는데, 두 곳에 각자 쓰면
// 갈라진다 — 이 레포가 스킬 · CLAUDE.md · 판정에서 세 번 겪은 것이다.
//
// **복사하면 그게 지식 레포다.** 그 성질이 여기서 만들어진다 — 도구(bin ·
// .githooks · .claude · 매뉴얼)와 패키지(docs · 등록부 · 어휘)가 합쳐진 채로.
//
// 파일 시스템만 만진다. npm 도 git 도 부르지 않는다 — `ctx repo new` 가 서버에서
// 이것을 부를 수 있어야 한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// **`..` 가 두 번이다.** 이 파일은 `ops/lib/` 에 있다.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// 받는 사람에게 가지 않는 것 — 패키지 폴더 안에 있지만 담지 않는다.
//   _package.json   매니페스트. 만든 쪽의 것이다(검토 §3.4)
//   convert/        변환기 자리. 원본 xlsx 가 없으면 돌지 않는다
const PACKAGE_EXCLUDE = new Set(['_package.json', 'convert'])

const BIN = /[.](?:exe|png|jpe?g|gif|ico|pdf|xlsx?|hwpx?|pptx?|zip|woff2?|ttf|otf|blob)$/i

// **줄바꿈을 LF 로 맞춰서 담는다.** 기준은 자기 자신을 clone 한 결과와
// 같아지는 것이다(`release.mjs` 의 같은 주석). 이진은 그대로.
export function copyFileLF(s, d) {
  if (BIN.test(s)) return fs.copyFileSync(s, d)
  const b = fs.readFileSync(s)
  if (b.includes(0)) return fs.copyFileSync(s, d)
  fs.writeFileSync(d, b.toString('utf8').replace(/\r\n/g, '\n'))
}

export function copyDirLF(src, dst, { skip = () => false } = {}) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(e.name, src)) continue
    // **실행 파일을 두 번 담지 않는다.** 전에 샘플 레포에 옛 cdp.exe 사본이
    // 남아 릴리스가 68MB → 136MB 가 된 적이 있다.
    if (e.isFile() && /[.]exe$/i.test(e.name)) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDirLF(s, d, { skip })
    else copyFileLF(s, d)
  }
}

// 소스 레포의 패키지 목록 — `agent/packages/<이름>/` 중 `_vocab.md` 가 있는 것.
export function listPackages(root = ROOT) {
  const dir = path.join(root, 'agent', 'packages')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, '_vocab.md')))
    .map((e) => e.name)
    .sort()
}

/**
 * 지식 레포 하나를 `dest` 에 완성한다.
 *
 *   root    소스 레포 루트 (agent/ · ops/out/ 이 여기 있다)
 *   name    패키지 이름 — agent/packages/<name>
 *   dest    만들 폴더. 있으면 그 안에 덧쓴다 (release 는 미리 지우고 부른다)
 *   exe     실행 파일 경로 또는 null. 있으면 tools/ 에 담는다
 *   ctxDir  ctx 번들이 있는 폴더 (기본 ops/out/ctx)
 *   packageDir  패키지 폴더 (기본 <root>/agent/packages/<name>). `--packages <dir>` 로
 *           소스 트리 밖의 패키지를 가리켰을 때 — 도구는 root 에서, 문서는 여기서 온다
 *
 * 반환 { missing: [빠진 소스 경로] } — 조용히 넘기지 않는다. 없는 채로
 * 배포되면 받는 쪽이 그것을 없는 기능으로 안다.
 */
export function assembleKnowledgeRepo({ root = ROOT, name, dest, exe = null, ctxDir = null, packageDir = null }) {
  const missing = []
  const R = dest
  const ctx = ctxDir || path.join(root, 'ops', 'out', 'ctx')

  const put = (src, rel, { skip } = {}) => {
    const s = path.isAbsolute(src) ? src : path.join(root, src)
    if (!fs.existsSync(s)) {
      missing.push(path.relative(root, s) || s)
      return false
    }
    const d = path.join(R, rel)
    fs.mkdirSync(path.dirname(d), { recursive: true })
    if (fs.statSync(s).isDirectory()) copyDirLF(s, d, { skip })
    else copyFileLF(s, d)
    return true
  }

  // 모든 패키지가 같은 것을 받는 층 — 도구 · 규약 · 매뉴얼 · 훅
  put('agent/skills', '.claude/skills')
  // **CLAUDE.md 는 두 종류다.** 루트의 것은 지식 레포판이어야 한다.
  put('agent/CLAUDE-지식레포.md', 'CLAUDE.md')
  // 작업 레포용 규약은 **서식**이라 루트에 두지 않는다 — `ctx setup` 이 여기서 읽는다.
  put('agent/CLAUDE-프로젝트레포.md', '.claude/work-repo/CLAUDE.md')
  put('agent/TEMPLATE-work.md', 'TEMPLATE-work.md')
  put('agent/hooks/pre-commit', '.githooks/pre-commit')
  put('agent/manual/user.md', 'MANUAL.md')
  put('agent/manual/admin.md', 'MANUAL-관리자.md')
  put('agent/manual/system.md', 'MANUAL-시스템.md')
  put(path.join(ctx, 'ctx.mjs'), 'bin/ctx.mjs')
  put(path.join(ctx, 'ctx'), 'bin/ctx')
  put(path.join(ctx, 'ctx.cmd'), 'bin/ctx.cmd')
  // **훅이 조용히 죽는 자리.** 이것이 없으면 core.autocrlf=true 인 PC 가
  // clone 할 때 pre-commit 이 CRLF 로 와서 셔뱅 뒤에 캐리지리턴이 붙는다.
  put('agent/gitattributes', '.gitattributes')
  put('agent/gitignore', '.gitignore')

  // tools/ — 실행 파일 자리. 배포본은 exe 를 **루트에 한 번만** 두고(패키지가 여럿이어도
  // 68MB 하나 — 폴더마다 넣던 때 셋에서 213MB 였다) 받는 사람이 여기로 복사한다. 그래서
  // 빈 폴더를 `.gitkeep` 으로 남긴다 — `copy cdp.exe C:\cdp\tools\` 는 폴더가 없으면
  // 실패하고, 빈 폴더는 zip 도 git 도 실어 주지 않는다. exe 를 직접 주면(시험용) 담는다 —
  // 레포의 `.gitignore` 가 `/tools/*.exe` 를 막으므로 커밋되지는 않는다.
  fs.mkdirSync(path.join(R, 'tools'), { recursive: true })
  if (exe) {
    if (fs.existsSync(exe)) fs.copyFileSync(exe, path.join(R, 'tools', path.basename(exe)))
    else missing.push(path.relative(root, exe) || exe)
  } else {
    fs.writeFileSync(path.join(R, 'tools', '.gitkeep'), '')
  }

  // 이 패키지가 정하는 층 — docs/ 골격 · 등록부 · 어휘. 매니페스트는 빼고.
  put(packageDir || path.join('agent', 'packages', name), '.', { skip: (n) => PACKAGE_EXCLUDE.has(n) })

  // 작업 기록이 들어갈 자리. **`.gitkeep` 이 있어야 한다** — 빈 디렉터리는
  // git 이 추적하지 않으므로 clone 한 팀원에게는 없다.
  fs.mkdirSync(path.join(R, 'work'), { recursive: true })
  fs.writeFileSync(path.join(R, 'work', '.gitkeep'), '')

  // bin/ctx 는 sh 스크립트다 — 실행 권한. Windows 에서는 조용히 지나간다.
  try {
    fs.chmodSync(path.join(R, 'bin', 'ctx'), 0o755)
    fs.chmodSync(path.join(R, '.githooks', 'pre-commit'), 0o755)
  } catch {}

  return { missing }
}

// 번들 시각 — `ctx.mjs` 안의 `BUILT = '…'`. 없으면 '?'.
export function bundleStamp(root = ROOT, ctxDir = null) {
  try {
    const f = path.join(ctxDir || path.join(root, 'ops', 'out', 'ctx'), 'ctx.mjs')
    const m = fs.readFileSync(f, 'utf8').match(/BUILT\s*=\s*['"]([^'"]+)['"]/)
    return m && !m[1].startsWith('__') ? m[1] : '?'
  } catch {
    return '?'
  }
}

// 폴더 크기 · 파일 수 — 보고용.
export function measure(dir) {
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
  })(dir)
  return { files, bytes, mb: (bytes / 1048576).toFixed(1) }
}
