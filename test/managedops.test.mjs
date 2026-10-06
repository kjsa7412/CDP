// 등록부를 서버가 쓴다 — `core/managed.js` 의 순수 함수 · `core/managedops.js` 의 계획.
// 관리문서 동적 생성 검토 v0.1 §5. 임시 폴더 · git 이 없다 — 글자만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseRegistry,
  globContains,
  globIntersects,
  patternProblem,
  docPathProblem,
  docEscapes,
  registryRow,
  lintRegistry,
  addedBy,
  ADDED_NOTE,
} from '../core/managed.js'
import { planManaged, checkManagedShape, needsAdmin } from '../core/managedops.js'

const NL = '\n'
const REG = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', '| `note:*` | `docs/n.md` | `—` |', '', '## 설명 표 — 규칙이 아니다', '', '| | 16종 | 여기 |', '|---|---|---|', '| `배치:` | 사양서 | 인터페이스 |', ''].join(NL)
const DOCS = ['docs/t.md', 'docs/n.md']
const T = ['# T', '', '## a — A', '<!-- applied: null -->', '', 'a 본문', ''].join(NL)
const disk = (extra = {}) => {
  const m = { 'docs/t.md': T, 'docs/n.md': '# N\n\n전체.\n', ...extra }
  return async (rel) => m[rel] ?? null
}
const plan = (ops, o = {}) => planManaged({ ops: checkManagedShape(ops), registryText: REG, docPaths: DOCS, read: disk(), workId: '2026-0930-시험', ...o })
const rejects = async (p, code, re) => {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message)
    if (re) assert.match(e.message + JSON.stringify(e.detail), re)
    return true
  })
}

// ── 글롭 ────────────────────────────────────────────────────────────────────

// 전수 대조 — 알파벳 {a,b} · 길이 ≤ 6 의 모든 문자열로 정의대로 센다. 패턴 · 문자열 전부가 정의와 같아야 한다.
const strings = ['']
for (let n = 1; n <= 6; n++) for (const s of strings.filter((x) => x.length === n - 1)) for (const c of 'ab') strings.push(s + c)
const pats = ['']
for (let n = 1; n <= 3; n++) for (const s of pats.filter((x) => x.length === n - 1)) for (const c of 'ab*') pats.push(s + c)
const rx = (p) => new RegExp('^' + p.split('*').join('.*') + '$')

test('globContains · globIntersects — 짧은 알파벳 전수 대조와 같다(정의대로 센 것)', () => {
  let cases = 0
  for (const a of pats) {
    for (const b of pats) {
      const A = new Set(strings.filter((s) => rx(a).test(s)))
      const B = new Set(strings.filter((s) => rx(b).test(s)))
      // b 의 언어가 a 의 언어에 든다 ⇔ globContains(a, b). 길이 6 까지로 자르면 포함은 (아래 방향만) 근사다 —
      // 패턴 길이가 ≤ 3 이라 반례는 길이 6 안에 있다
      const contains = [...B].every((s) => A.has(s))
      const inter = [...B].some((s) => A.has(s))
      assert.equal(globContains('t:' + a, 't:' + b), contains, `contains ${a} ⊇ ${b}`)
      assert.equal(globIntersects('t:' + a, 't:' + b), inter, `intersects ${a} ∩ ${b}`)
      cases++
    }
  }
  assert.ok(cases > 1000)
})

test('globContains — 덮는 것 · 덮지 못하는 것', () => {
  assert.equal(globContains('table:*', 'table:a*'), true)
  assert.equal(globContains('table:a*', 'table:*'), false)
  assert.equal(globContains('table:*', 'table:*'), true)
  assert.equal(globContains('시험시나리오:UT-*', '시험시나리오:IT-*'), false)
  assert.equal(globContains('t:a*', 't:*b'), false)
  assert.equal(globIntersects('t:a*', 't:*b'), true)
  assert.equal(globIntersects('시험시나리오:UT-*', '시험시나리오:IT-*'), false)
})

// ── 패턴 · 경로 ─────────────────────────────────────────────────────────────

test('patternProblem — 구체적인 타입 · 표를 깨는 글자 거절', () => {
  for (const ok of ['term:*', 'table:a*', '시험시나리오:UT-*', '용어:PLC', 'x:a.b_c-1*']) assert.equal(patternProblem(ok), null, ok)
  for (const no of ['', '*:x', '*', 'term', ':x', 'Term:*', 'term:', 'term:a b', 'term:a|b', 'term:a`b', 'term:a..b', 'term:a\nb', 'a*:x', 'term:' + 'x'.repeat(201)]) {
    assert.ok(patternProblem(no), JSON.stringify(no))
  }
})

test('docPathProblem · docEscapes — docs/…md 만 · 탈출 · 예약 이름 · 깊이', () => {
  for (const ok of ['docs/용어집.md', 'docs/3.용어/용어집.md', 'docs/a/b/c/d.md', 'docs/A B.md']) assert.equal(docPathProblem(ok), null, ok)
  const no = ['', '../x.md', '/abs.md', 'C:/x.md', 'docs/../x.md', 'docs/./x.md', 'docs\\x.md', 'x.md', 'notdocs/x.md', 'docs/x.txt', 'docs/x', 'docs/con.md', 'docs/NUL.md', 'docs/a/b/c/d/e.md', 'docs/.hidden.md', 'docs/x /y.md', 'docs/a./x.md', 'docs/x|y.md', 'docs/x:y.md', 'docs/' + 'x'.repeat(81) + '.md', 'docs//x.md', 'docs/x\u0000.md']
  for (const p of no) assert.ok(docPathProblem(p), JSON.stringify(p))
  for (const p of ['../x.md', '/abs.md', 'C:/x.md', 'docs/../x.md', 'docs\\x.md', '']) assert.equal(docEscapes(p), true, p)
  for (const p of ['docs/a.md', 'knowledge/a.md']) assert.equal(docEscapes(p), false, p)
})

test('registryRow ↔ parseRegistry 왕복 · 4번째 칸이 note · addedBy · 파이프는 바꾼다', () => {
  const row = registryRow({ pattern: 'term:*', doc: 'docs/용어집.md', level: 2, note: ADDED_NOTE + '2026-0930-a|b' })
  const r = parseRegistry(['| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', row, registryRow({ pattern: 'note:*', doc: 'docs/n.md', level: 0 }), registryRow({ pattern: 'x:*', doc: 'docs/x.md', level: 3 })].join(NL))
  assert.equal(r.errors.length, 0)
  assert.deepEqual(r.rules.map((x) => [x.pattern, x.doc, x.level, x.whole]), [['term:*', 'docs/용어집.md', 2, false], ['note:*', 'docs/n.md', 0, true], ['x:*', 'docs/x.md', 3, false]])
  assert.equal(addedBy(r.rules[0]), '2026-0930-a¦b')
  assert.equal(addedBy(r.rules[1]), null)
})

test('lintRegistry — 탈출 · docs/ 밖 · 덮임 · 레벨 섞임', () => {
  const rules = parseRegistry(
    ['| a | b | c |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', '| `table:a*` | `docs/ta.md` | `## {값}` |', '| `term:*` | `docs/t.md` | `### {값}` |', '| `x:*` | `../x.md` | `## {값}` |', '| `y:*` | `knowledge/y.md` | `## {값}` |'].join(NL)
  ).rules
  const l = lintRegistry(rules)
  assert.deepEqual(l.escape.map((x) => x.pattern), ['x:*'])
  assert.deepEqual(l.outside.map((x) => x.pattern), ['y:*'])
  assert.deepEqual(l.shadowed.map((x) => [x.pattern, x.by]), [['table:a*', 'table:*']])
  assert.deepEqual(l.levelMix.map((x) => [x.doc, x.levels]), [['docs/t.md', [2, 3]]])
})

test('옛 레포 표본(public-si)의 등록부는 lintRegistry 가 전부 0건이다', async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'legacy-public-si')
  const reg = parseRegistry(await fs.readFile(path.join(dir, '_managed.md'), 'utf8'))
  const l = lintRegistry(reg.rules)
  assert.deepEqual(l, { escape: [], outside: [], shadowed: [], levelMix: [] })
})

// ── 입력 모양 ───────────────────────────────────────────────────────────────

test('checkManagedShape — op 마다 받는 키 · 모르는 키 거절 · 10건 · level', () => {
  assert.deepEqual(checkManagedShape(undefined), [])
  assert.equal(checkManagedShape([{ pattern: 'a:*', doc: 'docs/a.md' }])[0].op, 'add')
  for (const bad of [
    'x',
    Array.from({ length: 11 }, () => ({ pattern: 'a:*', doc: 'docs/a.md' })),
    [{ op: 'zap' }],
    [{ pattern: 'a:*' }],
    [{ pattern: 'a:*', doc: 'docs/a.md', to: 'docs/b.md' }],
    [{ op: 'rename', doc: 'docs/a.md' }],
    [{ op: 'retire', pattern: 'a:*', doc: 'docs/a.md' }],
    [{ pattern: 'a:*', doc: 'docs/a.md', level: 7 }],
    [{ pattern: 'a:*', doc: 'docs/a.md', level: 1.5 }],
    [{ pattern: 'a:*', doc: 'docs/a.md', title: 'a\nb' }],
    [null],
  ]) assert.throws(() => checkManagedShape(bad), (e) => e.code === 'E_INPUT', JSON.stringify(bad).slice(0, 60))
  assert.equal(needsAdmin([{ op: 'add' }, {}]), false)
  assert.equal(needsAdmin([{ op: 'add' }, { op: 'retire', pattern: 'a:*' }]), true)
})

// ── 계획 — add ──────────────────────────────────────────────────────────────

test('planManaged add — 마지막 규칙 행 바로 뒤(설명 표에 안 붙는다) · 새 문서 · note · 사건', async () => {
  const p = await plan([{ pattern: 'term:*', doc: 'docs/용어집.md', title: '용어집' }])
  const lines = p.registryText.split(NL)
  const at = lines.findIndex((l) => l.includes('`term:*`'))
  assert.equal(at, lines.findIndex((l) => l.includes('`note:*`')) + 1, '규칙 행 바로 뒤')
  assert.ok(lines[at].endsWith('| 서버 추가 · 2026-0930-시험 |'))
  assert.ok(at < lines.findIndex((l) => l.startsWith('## 설명 표')))
  const reg = parseRegistry(p.registryText)
  assert.deepEqual(reg.rules.map((r) => r.pattern), ['table:*', 'note:*', 'term:*'])
  assert.equal(reg.rules[2].level, 2)
  assert.equal(p.files.get('docs/용어집.md'), '# 용어집\n')
  assert.deepEqual(p.added, ['term:*'])
  assert.deepEqual(p.events, [{ op: 'add', pattern: 'term:*', doc: 'docs/용어집.md', level: 2, created: true }])
  assert.equal(p.changed, true)
})

test('planManaged add — 등록부 파일이 없거나 규칙이 없으면 표째 만든다 · CRLF 는 줄 끝을 지킨다', async () => {
  for (const text of [null, '', '# 등록부\n\n아직 규칙이 없다.\n']) {
    const p = await plan([{ pattern: 'term:*', doc: 'docs/g.md', level: 3 }], { registryText: text })
    const reg = parseRegistry(p.registryText)
    assert.deepEqual(reg.rules.map((r) => [r.pattern, r.level]), [['term:*', 3]], JSON.stringify(text))
    assert.ok(p.registryText.includes('| 좌표 패턴 | 관리 문서 | 섹션 |'))
  }
  const crlf = REG.split(NL).join('\r\n')
  const p = await plan([{ pattern: 'term:*', doc: 'docs/g.md' }], { registryText: crlf })
  const ls = p.registryText.split(NL)
  assert.ok(ls.every((l, i) => i === ls.length - 1 || l.endsWith('\r')), '모든 줄이 CRLF')
  assert.equal(parseRegistry(p.registryText).rules.length, 3)
})

test('planManaged add — 이미 있는 문서는 덮지 않고 붙는다 · 대소문자만 다른 경로도 같은 문서', async () => {
  const p = await plan([{ pattern: 'term:*', doc: 'docs/T.md' }])
  assert.equal(p.files.size, 0, '새 문서를 만들지 않았다')
  assert.equal(parseRegistry(p.registryText).rules[2].doc, 'docs/t.md', '실제 경로로 적는다')
})

test('planManaged add — 같은 패턴: 같은 자리면 멱등 · 다른 자리면 E_CONFLICT { current }', async () => {
  const p = await plan([{ pattern: 'table:*', doc: 'docs/t.md' }])
  assert.equal(p.changed, false)
  assert.deepEqual(p.added, [])
  assert.match(p.warnings.join(), /이미 있다/)
  await assert.rejects(plan([{ pattern: 'table:*', doc: 'docs/other.md' }]), (e) => {
    assert.equal(e.code, 'E_CONFLICT')
    assert.equal(e.detail.kind, 'managed')
    assert.deepEqual(e.detail.current, { doc: 'docs/t.md', level: 2, whole: false, note: null })
    return true
  })
  await assert.rejects(plan([{ pattern: 'table:*', doc: 'docs/t.md', level: 3 }]), (e) => e.code === 'E_CONFLICT')
})

test('planManaged add — 앞 행에 완전히 덮이면 거절 · 교차는 경고 · 뒤에 넓은 것은 된다', async () => {
  await rejects(plan([{ pattern: 'table:a*', doc: 'docs/x.md' }]), 'E_INPUT', /shadowedBy/)
  const inter = await plan([{ pattern: 'note:*', doc: 'docs/n.md', level: 0 }].slice(0, 0).concat([{ pattern: 'term:a*', doc: 'docs/x.md' }, { pattern: 'term:*b', doc: 'docs/x.md' }]))
  assert.match(inter.warnings.join(), /일부 겹친다/)
  // 좁은 것 뒤에 넓은 것 — 넓은 행이 나머지를 받는다
  const wide = await plan([{ pattern: 'term:a*', doc: 'docs/x.md' }, { pattern: 'term:*', doc: 'docs/x.md' }])
  assert.deepEqual(parseRegistry(wide.registryText).rules.map((r) => r.pattern).slice(2), ['term:a*', 'term:*'])
  // 같은 save 안에서 앞 add 가 만든 행에도 덮인다
  await rejects(plan([{ pattern: 'term:*', doc: 'docs/x.md' }, { pattern: 'term:b*', doc: 'docs/y.md' }]), 'E_INPUT', /shadowedBy/)
})

test('planManaged add — 한 문서는 한 레벨 · level 0 은 새 문서 전용', async () => {
  await rejects(plan([{ pattern: 'scr:*', doc: 'docs/t.md', level: 3 }]), 'E_INPUT', /한 레벨/)
  await rejects(plan([{ pattern: 'scr:*', doc: 'docs/t.md', level: 0 }]), 'E_INPUT', /level/)
  await rejects(plan([{ pattern: 'scr:*', doc: 'docs/n.md' }]), 'E_INPUT', /한 레벨/) // n.md 는 `—`
  await rejects(plan([{ pattern: 'scr:*', doc: 'docs/새.md', level: 0 }, { pattern: 'scr2:*', doc: 'docs/새.md', level: 0 }]), 'E_INPUT', /level/)
  await rejects(plan([{ pattern: 'scr:*', doc: 'docs/n.md', level: 0 }]), 'E_INPUT', /level/) // 이미 있는 문서를 — 로
  const ok = await plan([{ pattern: 'scr:*', doc: 'docs/t.md' }]) // 같은 레벨의 둘째 행은 된다
  assert.equal(parseRegistry(ok.registryText).rules.length, 3)
})

test('planManaged add — 경로 · 패턴이 틀리면 E_INPUT { field } · 파일을 안 쓴다', async () => {
  for (const [op, field] of [
    [{ pattern: 'term:*', doc: '../x.md' }, 'doc'],
    [{ pattern: 'term:*', doc: '/abs.md' }, 'doc'],
    [{ pattern: 'term:*', doc: 'docs/../../x.md' }, 'doc'],
    [{ pattern: 'term:*', doc: 'notdocs/x.md' }, 'doc'],
    [{ pattern: 'term:*', doc: 'docs/x.txt' }, 'doc'],
    [{ pattern: '*:*', doc: 'docs/x.md' }, 'pattern'],
    [{ pattern: 'term:a|b', doc: 'docs/x.md' }, 'pattern'],
  ]) {
    await assert.rejects(plan([op]), (e) => e.code === 'E_INPUT' && e.detail.field === `managed[0].${field}`, JSON.stringify(op))
  }
})

// ── 계획 — 정리 ─────────────────────────────────────────────────────────────

test('planManaged rename — 파일을 옮기고 그 문서의 모든 행 경로 칸이 바뀐다 · 섹션 글은 그대로', async () => {
  const two = REG.replace('| `note:*`', '| `scr:*` | `docs/t.md` | `## {값}` |\n| `note:*`')
  const p = await plan([{ op: 'rename', doc: 'docs/t.md', to: 'docs/3.용어/표.md' }], { registryText: two })
  assert.equal(p.files.get('docs/3.용어/표.md'), T)
  assert.equal(p.files.get('docs/t.md'), null)
  assert.deepEqual(parseRegistry(p.registryText).rules.map((r) => r.doc), ['docs/3.용어/표.md', 'docs/3.용어/표.md', 'docs/n.md'])
  assert.match(p.warnings.join(), /링크는 고치지 않았다/)
  await assert.rejects(plan([{ op: 'rename', doc: 'docs/없다.md', to: 'docs/x.md' }]), (e) => e.code === 'E_NOT_FOUND')
  await assert.rejects(plan([{ op: 'rename', doc: 'docs/t.md', to: 'docs/n.md' }]), (e) => e.code === 'E_EXISTS')
  await assert.rejects(plan([{ op: 'rename', doc: 'docs/t.md', to: 'docs/T.md' }]), (e) => e.code === 'E_INPUT')
  await assert.rejects(plan([{ op: 'rename', doc: 'docs/t.md', to: '../x.md' }]), (e) => e.code === 'E_INPUT')
})

test('planManaged rename — 옮긴 이름은 `$&` 같은 글자가 있어도 글자 그대로 들어간다', async () => {
  const p = await plan([{ op: 'rename', doc: 'docs/t.md', to: 'docs/a$&b.md' }])
  assert.equal(parseRegistry(p.registryText).rules[0].doc, 'docs/a$&b.md')
})

const TWO = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', '| `view:*` | `docs/v.md` | `## {값}` |', ''].join(NL)
const V = ['# V 문서', '', '<!-- 머리 주석 -->', '', '## x — X', '<!-- applied: 2026-0901-x -->', '', 'x 본문', '', '### 소제목', '', '## y', '', 'y 본문', ''].join(NL)

test('planManaged merge — 섹션을 into 끝에 이어 붙이고 행을 돌리고 원본은 지운다 · 제목 줄은 버린다', async () => {
  const p = await plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], { registryText: TWO, docPaths: ['docs/t.md', 'docs/v.md'], read: disk({ 'docs/v.md': V }) })
  const merged = p.files.get('docs/t.md')
  assert.ok(merged.startsWith(T.replace(/\s+$/, '')))
  assert.ok(merged.includes('\n\n## x — X\n<!-- applied: 2026-0901-x -->'))
  assert.ok(!merged.includes('# V 문서'))
  assert.ok(merged.endsWith('y 본문\n'))
  assert.equal(p.files.get('docs/v.md'), null)
  assert.deepEqual(parseRegistry(p.registryText).rules.map((r) => r.doc), ['docs/t.md', 'docs/t.md'])
})

test('planManaged merge — 레벨이 다르거나 — 문서이거나 머리말이 있으면 거절', async () => {
  const opt = (reg, extra) => ({ registryText: reg, docPaths: ['docs/t.md', 'docs/v.md'], read: disk({ 'docs/v.md': V, ...extra }) })
  await rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], opt(TWO.replace('`view:*` | `docs/v.md` | `## {값}`', '`view:*` | `docs/v.md` | `### {값}`'))), 'E_INPUT', /레벨이 다르다/)
  await rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], opt(TWO.replace('`view:*` | `docs/v.md` | `## {값}`', '`view:*` | `docs/v.md` | —'))), 'E_INPUT', /문서 전체/)
  await rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], opt(TWO, { 'docs/v.md': '# V\n\n이 문서는 이런 것이다.\n\n## x\n\nx\n' })), 'E_INPUT', /머리말/)
  await rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], opt(TWO, { 'docs/v.md': '# V\n\n제목뿐\n' })), 'E_INPUT', /머리말|섹션이 없다/)
  await assert.rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/없다.md' }], opt(TWO)), (e) => e.code === 'E_NOT_FOUND')
  await rejects(plan([{ op: 'merge', doc: 'docs/v.md', into: 'docs/V.md' }], opt(TWO)), 'E_INPUT', /같은 문서/)
})

test('planManaged retire — 행만 지운다 · 문서는 그대로 · 고아 문서 경고 · 없는 행은 E_NOT_FOUND', async () => {
  const p = await plan([{ op: 'retire', pattern: 'note:*' }])
  assert.deepEqual(parseRegistry(p.registryText).rules.map((r) => r.pattern), ['table:*'])
  assert.equal(p.files.size, 0)
  assert.match(p.warnings.join(), /docs\/n\.md 은 이제 등록부에 안 걸린 관리 문서/)
  await assert.rejects(plan([{ op: 'retire', pattern: 'nope:*' }]), (e) => e.code === 'E_NOT_FOUND')
})

test('planManaged — 앞 동작이 만든 상태 위에서 뒤 동작이 돈다(add → rename → retire) · 순수하다', async () => {
  const seen = []
  const p = await plan(
    [{ pattern: 'term:*', doc: 'docs/용어집.md' }, { op: 'rename', doc: 'docs/용어집.md', to: 'docs/용어/용어집.md' }, { op: 'retire', pattern: 'note:*' }],
    { read: async (rel) => (seen.push(rel), (await disk()(rel))) }
  )
  assert.deepEqual(parseRegistry(p.registryText).rules.map((r) => [r.pattern, r.doc]), [['table:*', 'docs/t.md'], ['term:*', 'docs/용어/용어집.md']])
  assert.equal(p.files.get('docs/용어집.md'), null)
  assert.equal(p.files.get('docs/용어/용어집.md'), '# 용어집\n')
  assert.deepEqual(p.events.map((e) => e.op), ['add', 'rename', 'retire'])
})
