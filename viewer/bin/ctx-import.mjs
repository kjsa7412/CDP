// ctx import-dir — md 폴더를 work/ 로 들인다. 제품화 TODO 6.2.
//
//   ctx import-dir <원본> --repo <지식레포> [--author <이름>] [--dry] [--yes] [--json]
//
// `--dry` 가 먼저다 — 무엇이 어디로 가는지 표로 보여 주고 사람이 돌린다.
// 계산은 `core/importdir.js`. 좌표는 추측하지 않는다 — 들인 뒤 P2 는 사람이다.

import readline from 'node:readline'
import { planImport, applyImport } from '../../core/importdir.js'
import { toError } from '../../core/tools.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)
const pad = (s, n) => {
  const w = [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s ?? '') + ' '.repeat(Math.max(0, n - w))
}

export async function runImportDir(opt) {
  const src = opt.args[0]
  if (!src || !opt.repo) {
    err('ctx import-dir <원본 폴더> --repo <지식 레포> [--author <이름>] [--keep-touches] [--dry] [--yes] [--json]')
    err('  --keep-touches   프론트매터의 touches 를 그대로 둔다 (기본은 tags 로 보존). 파생이 남으면 검사가 막고 되돌린다')
    return 2
  }
  let plan
  try {
    plan = await planImport(src, opt.repo, { author: opt.author || null, keepTouches: !!opt.keepTouches })
  } catch (e) {
    err('ctx import-dir: ' + toError(e).message)
    return 2
  }

  if (opt.json && opt.dry) {
    out(JSON.stringify(plan, (k, v) => (k === 'body' ? undefined : v), 2))
    return 0
  }

  const works = plan.files.filter((f) => f.kind === 'work')
  const assets = plan.files.filter((f) => f.kind === 'asset')
  out(`원본  ${plan.src}${plan.gitRoot ? '  (git · 날짜와 작성자를 이력에서 읽는다)' : ''}`)
  out(`레포  ${plan.repo}`)
  out(`md ${works.length} → work/ · 자산 ${assets.length} → work/assets/ · 건너뜀 ${plan.summary.skipped}`)
  out(`날짜 근거  ${Object.entries(plan.summary.dateSources).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}`)
  out('')
  const show = works.slice(0, 40)
  out(`${pad('날짜', 12)}${pad('근거', 12)}${pad('→ work/', 60)}원본`)
  for (const f of show) out(`${pad(f.date.slice(0, 10), 12)}${pad(f.dateSource, 12)}${pad(f.id + '.md', 60)}${f.from}${f.skip ? '  (건너뜀)' : ''}`)
  if (works.length > show.length) out(`... ${works.length - show.length}건 더 (--json --dry 로 전체)`)
  const warned = plan.files.filter((f) => f.warnings?.length)
  if (warned.length) {
    out('')
    out(`주의 ${warned.length}건`)
    for (const f of warned.slice(0, 20)) for (const w of f.warnings) out(`  ${f.from}: ${w}`)
    if (warned.length > 20) out(`  ... ${warned.length - 20}건 더`)
  }
  for (const w of plan.warnings) out(NL + '[주의] ' + w)

  if (opt.dry) {
    out('')
    out(`--dry 이므로 쓰지 않았습니다. 들일 것 ${works.length + assets.length}건.`)
    return 0
  }
  if (!opt.yes) {
    out('')
    const ok = await confirm(`위 ${works.length + assets.length}건을 ${plan.repo} 에 쓸까요? [y/N] `)
    if (!ok) {
      out('그만둡니다. 아무것도 쓰지 않았습니다.')
      return 1
    }
  }
  try {
    const r = await applyImport(plan)
    out('')
    out(`들였다: 작업 기록 ${r.works} · 자산 ${r.assets}  (ctx check 통과${r.warnings.length ? ' · 경고 ' + r.warnings.join(' · ') : ''})`)
    out('')
    out('다음 —')
    out('  1. git add work && git commit   ← 훅이 같은 검사를 한 번 더 한다')
    out('  2. 좌표는 하나도 붙지 않았다. touches 를 채우는 것은 사람 · LLM(cdp-import)의 P2 다')
    out('  3. ctx index 로 INDEX 를 만든다 (훅이 커밋 때 같이 한다)')
    if (opt.json) out(JSON.stringify(r))
    return 0
  } catch (e) {
    const x = toError(e)
    err('ctx import-dir: ' + x.message)
    if (x.detail?.findings) for (const f of x.detail.findings) err(`  [오류] ${f.label} ${f.items.length}건`)
    return 1
  }
}

function confirm(q) {
  if (!process.stdin.isTTY) {
    err('입력을 받을 수 없습니다 — --yes 를 주거나 --dry 로 미리 봅니다.')
    return Promise.resolve(false)
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    rl.question(q, (a) => {
      rl.close()
      res(/^y(es)?$/i.test(a.trim()))
    })
  })
}
