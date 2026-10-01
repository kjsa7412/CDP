// ctx repo — 지식 레포를 세우고 센다. 검토 §3.5 · 제품화 TODO 5단계.
//
//   ctx repo new  <경로> --package <이름> [--packages <dir>] [--origin <url>] [--push] [--dry] [--no-examples]
//   ctx repo list --root <폴더>
//
// **계산은 `core/reponew.js` 가 한다.** 관리 서비스의 콘솔(`POST /admin/repos`)이 같은
// 함수를 부른다 — CLI 로 세운 것과 화면에서 세운 것이 같은 모양이어야 한다.

import path from 'node:path'
import { newRepo, listRepos } from '../../core/reponew.js'
import { listPackages } from '../../core/packages.js'
import { toError } from '../../core/tools.js'
import { resolvePackages, materializePackage } from './ctx-package.mjs'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)
const pad = (s, n) => {
  const w = [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s ?? '') + ' '.repeat(Math.max(0, n - w))
}

export async function runRepo(opt) {
  const [sub, arg] = opt.args
  try {
    if (sub === 'new') {
      if (!arg || !opt.package) {
        err('ctx repo new <경로> --package <이름> [--origin <url>] [--push] [--dry] [--no-examples]')
        // 패키지가 여럿이면 이름을 알아야 고른다 — 있는 것을 같이 찍는다
        const pk0 = await resolvePackages({ explicit: opt.packages }).catch(() => null)
        const names = pk0
          ? (await listPackages(pk0.dir).catch(() => [])).map((p) => p.name + (p.manifest?.title ? ' (' + p.manifest.title + ')' : ''))
          : []
        if (names.length) err('  패키지: ' + names.join(' · '))
        return 2
      }
      const pk = await resolvePackages({ explicit: opt.packages })
      if (!pk) {
        err('ctx repo new: 패키지 폴더를 찾을 수 없다. --packages <dir> 또는 CDP_PACKAGES')
        return 2
      }
      const { from, cleanup } = await materializePackage(pk, opt.package)
      try {
        const r = await newRepo({ from, dest: arg, origin: opt.origin || null, push: !!opt.push, dry: !!opt.dry, examples: !opt.noExamples })
        if (r.dry) {
          out(`ctx repo new --dry: ${r.dest}`)
          for (const s of r.steps) out('  ' + s)
          return 0
        }
        out(`ctx repo new: ${r.dest}`)
        out(`  패키지  ${opt.package}`)
        out(`  첫 커밋 ${r.commit} · 파일 ${r.files}`)
        if (r.examples) out(`  서식 예시 뺌 — 좌표 ${r.examples.coords} · 섹션 ${r.examples.sections}${r.examples.left ? ` · 표에 남은 예시 행 ${r.examples.left}(ctx examples)` : ''}`)
        if (r.origin) out(`  origin  ${r.origin}${r.pushed ? '  (push 완료)' : r.pushError ? '  (push 실패: ' + r.pushError + ')' : '  (push 안 함 — --push)'}`)
        out('')
        out('다음 —')
        out('  1. 안 쓰는 문서를 지운다 — bin/ctx docs 로 보고 bin/ctx docs drop <문서…> --dry-run (README.md 「첫날」)')
        out('  2. bin/ctx check 가 이상 없음이면 시작할 수 있다')
        if (!r.origin) out('  3. 원격이 있으면 git remote add origin <url> && git push -u origin HEAD')
        return r.pushError ? 1 : 0
      } finally {
        await cleanup()
      }
    }

    if (sub === 'list') {
      const root = opt.root || arg
      if (!root) {
        err('ctx repo list --root <폴더>')
        return 2
      }
      const rows = await listRepos(path.resolve(root))
      if (opt.json) {
        out(JSON.stringify(rows, null, 2))
        return 0
      }
      out(`${pad('이름', 16)}${pad('레포', 6)}${pad('git', 5)}${pad('head', 9)}${pad('미러', 8)}${pad('훅', 6)}upstream`)
      for (const r of rows) {
        out(
          pad(r.name, 16) +
            pad(r.vocab ? 'O' : '-', 6) +
            pad(r.git ? 'O' : '-', 5) +
            pad(r.head || '-', 9) +
            pad(!r.git ? '-' : !r.upstream ? 'off' : r.ahead > 0 ? `lag ${r.ahead}` : 'ok', 8) +
            pad(r.hooksPath ? 'O' : '-', 6) +
            (r.upstream || '')
        )
      }
      return 0
    }

    err('ctx repo: new · list')
    return 2
  } catch (e) {
    const x = toError(e)
    err(`ctx repo: ${x.message}`)
    if (x.detail?.message) err('  ' + String(x.detail.message).split(NL).join(NL + '  '))
    return e?.code === 'E_CHECK' ? 1 : 2
  }
}
