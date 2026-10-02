// ctx package — 패키지를 물건으로 다룬다. 검토 §3.4 · 제품화 TODO 4단계.
//
//   ctx package list  [--packages <dir>] [--json]
//   ctx package show  <이름>
//   ctx package check [<이름> | --all]          부어서 ctx check — CI 가 돈다
//   ctx package new   <이름> --from <이름> [--title …]
//   ctx package rename <이름> <새 이름> [--title …]   폴더 · 매니페스트 · README 제목을 한 번에
//
// **계산은 `core/packages.js` 가 한다.** 여기는 찾고 · 찍고 · exit code 를 낸다.
//
// 패키지가 사는 자리가 둘이다 —
//   소스 레포   agent/packages/<이름>/     docs · _vocab · _managed · _package.json 만.
//                                         도구(bin · .claude · 훅)는 조립해야 붙는다 → assemble.mjs
//   서버 산출물 packages/<이름>/          **완성된** 지식 레포 폴더. 그대로 복사하면 레포다
// 어느 쪽인지는 폴더 안에 `bin/ctx.mjs` 가 있나로 가른다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as P from '../../core/packages.js'
import { toError } from '../../core/tools.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

function hereDir() {
  try {
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return typeof __dirname !== 'undefined' ? __dirname : process.cwd()
  }
}

// 소스 레포 루트 — `package.json` 의 name 이 cdp 이고 `agent/packages` 가 있는 곳.
// 번들(레포 `bin/` · 서버 `bin/`)에서는 못 찾는다 — 그때는 null 이고, 그것이 맞다.
export async function findSourceRoot(start = hereDir()) {
  let d = path.resolve(start)
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(d, 'package.json'), 'utf8'))
      if (pkg?.name === 'cdp' && (await fs.stat(path.join(d, 'agent', 'packages')).then((s) => s.isDirectory()).catch(() => false))) {
        return d
      }
    } catch {}
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return null
}

// 어디에 있나 — --packages → CDP_PACKAGES → 번들 옆 → 소스.
export async function resolvePackages({ explicit = null, binDir = hereDir() } = {}) {
  const sourceRoot = await findSourceRoot(binDir)
  const found = await P.findPackagesDir({ explicit, binDir, sourceRoot })
  if (!found) return null
  return { ...found, sourceRoot }
}

async function isCompleted(dir) {
  return fs.access(path.join(dir, 'bin', 'ctx.mjs')).then(() => true).catch(() => false)
}

/**
 * 패키지 하나를 **복사할 수 있는 완성 폴더**로 만든다.
 *   완성 폴더(서버 산출물)면 그대로 · 소스 패키지면 임시 폴더에 조립한다.
 * 반환 { from, cleanup } — 다 쓰면 cleanup() 을 부른다.
 */
export async function materializePackage(pk, name) {
  const dir = path.join(pk.dir, name)
  if (!(await P.isPackageDir(dir))) throw Object.assign(new Error(`패키지가 없다 — ${name} (${pk.dir})`), { code: 'E_NOT_FOUND' })
  if (await isCompleted(dir)) return { from: dir, cleanup: async () => {} }
  if (!pk.sourceRoot) {
    throw Object.assign(new Error(`${name} 은 완성된 폴더가 아니고 소스 레포도 아니다 — 서버 산출물의 packages/ 를 가리키세요`), { code: 'E_INPUT' })
  }
  // 소스 — 조립한다. `release.mjs` 와 같은 함수다.
  const { assembleKnowledgeRepo } = await import('../../ops/lib/assemble.mjs')
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-asm-'))
  const dest = path.join(tmp, name)
  // 도구는 소스 루트에서, 문서는 **그 패키지 폴더**에서 — `--packages <dir>` 가 소스 트리
  // 밖을 가리켜도 된다. 전에는 root/agent/packages/<name> 으로 고정이라 임시 사본을 검사할 수 없었다.
  const r = assembleKnowledgeRepo({ root: pk.sourceRoot, name, dest, exe: null, packageDir: dir })
  if (r.missing.length) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw Object.assign(new Error('조립에 빠진 것이 있다 — ' + r.missing.join(' · ') + NL + '  (npm run build:ctx 를 먼저 돌렸나)'), { code: 'E_INPUT' })
  }
  return { from: dest, cleanup: () => fs.rm(tmp, { recursive: true, force: true }).catch(() => {}) }
}

const pad = (s, n) => {
  const w = [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s ?? '') + ' '.repeat(Math.max(0, n - w))
}

export async function runPackage(opt) {
  const [sub, arg] = opt.args
  const pk = await resolvePackages({ explicit: opt.packages })
  if (!pk) {
    err('ctx package: 패키지 폴더를 찾을 수 없다. --packages <dir> 로 지정하거나 CDP_PACKAGES 를 설정한다.')
    return 2
  }

  try {
    if (!sub || sub === 'list') {
      const list = await P.listPackages(pk.dir)
      if (opt.json) {
        out(JSON.stringify({ dir: pk.dir, how: pk.how, packages: list }, null, 2))
        return 0
      }
      out(`패키지 ${list.length}개 — ${pk.dir} (${pk.how})`)
      // 이름 칸은 가장 긴 이름에 맞춘다 — `agile-product` 처럼 12자를 넘으면 판 칸에 붙어 읽혔다
      const w = Math.max(12, ...list.map((p) => p.name.length + 2))
      out(`${pad('이름', w)}${pad('판', 8)}${pad('문서', 6)}${pad('타입', 6)}${pad('패턴', 6)}제목`)
      for (const p of list) {
        out(pad(p.name, w) + pad(p.manifest.version || '-', 8) + pad(p.docs, 6) + pad(p.types, 6) + pad(p.patterns, 6) + (p.manifest.title || (p.manifest.present ? '' : '(매니페스트 없음)')))
      }
      return 0
    }

    if (sub === 'show') {
      if (!arg) return usage('show <이름>')
      const s = await P.showPackage(path.join(pk.dir, arg))
      if (opt.json) {
        out(JSON.stringify(s, null, 2))
        return 0
      }
      out(`${s.name}  ${s.manifest.title || ''}${s.manifest.version ? '  v' + s.manifest.version : ''}`)
      if (s.manifest.description) out(`  ${s.manifest.description}`)
      if (s.manifest.source) out(`  출처  ${s.manifest.source}`)
      out(`  문서 ${s.docs.length} · 좌표 타입 ${s.types.length} · 등록부 패턴 ${s.patterns.length} · 예시 좌표 ${s.examples.length}`)
      out('')
      out('  타입 (선언 순서 = 화면 순서)')
      out('    ' + s.types.map((t) => (s.excludedTypes.includes(t) ? t + '(제외)' : t)).join(' · '))
      out('')
      out('  등록부')
      for (const p of s.patterns) out(`    ${pad(p.pattern, 26)} ${p.doc}  ${p.whole ? '(문서 전체)' : '#'.repeat(p.level) + ' {값}'}`)
      out('')
      out('  문서')
      for (const d of s.docs) out('    ' + d)
      return 0
    }

    if (sub === 'check') {
      const names = opt.all || !arg ? (await P.listPackages(pk.dir)).map((p) => p.name) : [arg]
      if (!names.length) {
        err('ctx package check: 패키지가 없다')
        return 2
      }
      let bad = 0
      const results = []
      const w = Math.max(12, ...names.map((n) => n.length + 1))
      for (const name of names) {
        const dir = path.join(pk.dir, name)
        // 소스면 조립해서 본다 — 검사한 것과 나가는 것이 같은 모양이어야 한다(TODO 4.5)
        const assemble = pk.sourceRoot && !(await isCompleted(dir))
          ? async (dest) => {
              const { assembleKnowledgeRepo } = await import('../../ops/lib/assemble.mjs')
              const r = assembleKnowledgeRepo({ root: pk.sourceRoot, name, dest, exe: null, packageDir: dir })
              if (r.missing.length) throw new Error('조립에 빠진 것 — ' + r.missing.join(' · '))
            }
          : null
        const r = await P.checkPackage(dir, { assemble })
        results.push(r)
        if (!r.ok) bad++
        if (!opt.json) {
          out(`${r.ok ? 'ok  ' : 'FAIL'} ${pad(name, w)} 문서 ${r.docs} · 패턴 ${r.patterns} · 타입 ${r.types} · 예시 ${r.examples}${r.warnings.length ? '  (경고 ' + r.warnings.join(' · ') + ')' : ''}`)
          for (const p of r.problems) out(`       ${p.kind}: ${p.detail}`)
        }
      }
      if (opt.json) out(JSON.stringify(results, null, 2))
      return bad ? 1 : 0
    }

    if (sub === 'new') {
      if (!arg || !opt.from) return usage('new <이름> --from <이름> [--title …] [--description …]')
      if (!pk.sourceRoot && pk.how !== '--packages') {
        err('ctx package new: 패키지는 소스 레포(agent/packages) 에서 만든다. 서버 산출물의 packages/ 는 조립 결과다.')
        return 2
      }
      const r = await P.newPackage(pk.dir, { name: arg, from: opt.from, title: opt.title ?? null, description: opt.description ?? null })
      out(`만들었다: ${r.path}`)
      out(`  ${JSON.stringify(r.manifest)}`)
      out('')
      out('다음 —')
      out('  1. docs/ 의 문서 목록을 고친다 — 이것이 패키지의 차이다')
      out('  2. _managed.md 에서 없는 문서의 패턴을 뺀다 · _vocab.md 에서 안 쓰는 타입을 뺀다')
      out('  3. README.md 를 이 패키지의 것으로 · _package.json 의 title · description 을 채운다')
      out(`  4. ctx package check ${arg}`)
      out('  규약과 좌표 설계는 복사하지 않는다 — docs/관리문서패키지/ 에 한 벌만 둔다')
      return 0
    }

    if (sub === 'rename') {
      const to = opt.args[2]
      if (!arg || !to) return usage('rename <이름> <새 이름> [--title …]')
      if (!pk.sourceRoot && pk.how !== '--packages') {
        err('ctx package rename: 패키지는 소스 레포(agent/packages) 에서 바꾼다. 서버 산출물의 packages/ 는 조립 결과다 — 다음 산출물이 따라간다.')
        return 2
      }
      const r = await P.renamePackage(pk.dir, { from: arg, to, title: opt.title ?? null })
      out(`바꿨다: ${arg} → ${to}  (${r.path})`)
      out(`  ${JSON.stringify(r.manifest)}`)
      out('')
      out('다음 —')
      out('  1. agent/packages/README.md 의 목록 줄을 고친다')
      out(`  2. ctx package check ${to}`)
      out('  이미 세운 지식 레포는 그대로다 — 레포는 패키지의 사본이고 이름을 따로 갖는다')
      out('  서버의 packages/ 는 다음 산출물(release:server → upgrade.sh)에서 바뀐다')
      return 0
    }

    return usage('list · show <이름> · check [<이름>|--all] · new <이름> --from <이름> · rename <이름> <새 이름>')
  } catch (e) {
    const x = toError(e)
    err(`ctx package: ${x.message}`)
    if (x.detail && opt.json) err(JSON.stringify(x.detail))
    return e?.code === 'E_NOT_FOUND' ? 2 : 1
  }
}

function usage(s) {
  err('ctx package ' + s)
  return 2
}
