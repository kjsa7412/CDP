// ctx forms — 서식집을 보고 검사한다. v1.0 개편안 §8.1(도구: forms MCP · 화면 서식집 · ctx forms).
//
//   ctx forms list  [--forms <dir>] [--data <dir>] [--json]   묶음 · 서식 목록(팀 서식은 「팀」)
//   ctx forms show  <묶음/번호> [--forms …] [--data …]          서식 하나 — 작성지침 · 예시 · 서버가 찍을 빈 문서
//   ctx forms check [--forms …] [--data …]                      lint — 문제가 있으면 exit 1(그 서식으로는 save 가 문서를 세우지 않는다)
//
// `--data` 는 서버의 데이터 폴더다 — 팀 서식 `<data>/forms/<묶음>/` 를 같이 읽는다(같은 id 면 팀 서식이 이긴다).

import { loadForms, formDetail } from '../../core/formslib.js'
import { toError } from '../../core/tools.js'

const NL = '\n'
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

export async function runForms(opt) {
  const [sub, arg] = opt.args
  try {
    const lib = await loadForms({ explicit: opt.forms || null, dataDir: opt.data || null })
    if (!lib.dir && !lib.forms.length) {
      err('ctx forms: 서식집을 찾을 수 없다 — --forms <dir> 또는 CDP_FORMS (번들 옆 forms/ · 소스 agent/forms)')
      return 2
    }
    if (!sub || sub === 'list') {
      if (opt.json) {
        out(JSON.stringify({ dir: lib.dir, groups: lib.groups, forms: lib.forms.map((f) => ({ id: f.id, title: f.title, kind: f.kind ?? null, origin: f.origin, problems: f.problems.length })) }, null, 2))
        return 0
      }
      out(`서식집 ${lib.dir || '(없음)'}${lib.how ? ' (' + lib.how + ')' : ''} · 묶음 ${lib.groups.length} · 서식 ${lib.forms.length}`)
      for (const g of lib.groups) {
        const fs = lib.forms.filter((f) => f.group === g.name)
        out('')
        out(`${g.name}${g.title ? ' — ' + g.title : ''}${g.origin === 'team' ? '  [팀]' : ''} · ${fs.length}종`)
        for (const f of fs) out(`  ${f.id.padEnd(28)} ${(f.kind || '').padEnd(3)} ${f.title}${f.origin === 'team' ? '  [팀]' : ''}${f.problems.length ? `  ⚠ 문제 ${f.problems.length}` : ''}`)
      }
      return 0
    }
    if (sub === 'show') {
      const f = arg ? lib.byId.get(arg) : null
      if (!f) {
        err(`ctx forms show: 그 서식이 없다 — ${arg || '(id 없음)'} · ctx forms list 로 id 를 본다`)
        return 2
      }
      const d = formDetail(f)
      if (opt.json) {
        out(JSON.stringify(d, null, 2))
        return 0
      }
      out(`# ${d.id} — ${d.title}  (${d.kind || '종류 없음'} · ${d.origin === 'team' ? '팀 서식' : '번들'})`)
      if (d.registry.length) out(`등록부  ${d.registry.map((r) => r.pattern + ' → ' + r.anchor).join(' · ')}`)
      if (d.problemList.length) for (const p of d.problemList) out(`⚠ ${p}`)
      for (const s of ['', '── 서버가 찍을 빈 문서 ──', d.stamp, '── 작성지침 ──', d.guide || '(없음)', '── 예시 ──', d.example || '(없음)']) out(s)
      return 0
    }
    if (sub === 'check') {
      const bad = lib.forms.filter((f) => f.problems.length)
      for (const f of bad) {
        out(`✗ ${f.id}${f.origin === 'team' ? ' [팀]' : ''}`)
        for (const p of f.problems) out(`    ${p}`)
      }
      out(`${bad.length ? '✗' : '✓'} 서식 ${lib.forms.length} · 문제 있는 서식 ${bad.length}`)
      return bad.length ? 1 : 0
    }
    err('ctx forms: list · show <id> · check')
    return 2
  } catch (e) {
    const x = toError(e)
    err(`ctx forms: ${x.code} ${x.message}`)
    return 1
  }
}
