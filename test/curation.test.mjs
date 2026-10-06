// 큐레이션 계산 — `core/curation.js`. v1.0 개편안 §4.4 · TODO §1.2.
//
// 대기열 · 기록의 큐레이션 상태 · 섹션의 미반영이 **작업 기록만으로** 계산되는가.
// 옛 레포(큐레이션 기록 0)는 암묵 전환 — 옛 판정이 남긴 기록만 대기다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadRepo } from '../core/repo.js'
import { excerptOf, recordKind } from '../core/curation.js'
import { normalizeCurates } from '../core/frontmatter.js'

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 가', '- `table:b` — 나', '- `table:c` — 다', '', '## term', '', '- `term:x` — 엑스', ''].join('\n')
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/테이블.md` | `## {값}` |', ''].join('\n')

function work({ id, date, touches = [], body = '본문 첫 문단이다.', extra = [] }) {
  return ['---', `id: ${id}`, `title: ${id}`, `date: ${date}`, 'author: kim', 'touches:' + (touches.length ? '' : ' []'), ...touches.map((c) => `  - ${c}`), ...extra, 'tags: []', '---', '', body, ''].join('\n')
}

async function repo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-cur-'))
  const all = { '_vocab.md': VOCAB, '_managed.md': MANAGED, ...files }
  for (const [rel, text] of Object.entries(all)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fs.writeFile(path.join(root, rel), text, 'utf8')
  }
  return root
}

const DOC = (secs) => ['# 테이블', '', ...secs.flatMap(([v, applied, body]) => [`## ${v} — 설명`, `<!-- applied: ${applied} -->`, '', body, '']), ''].join('\n')

test('normalizeCurates — 판정 셋 · 모양이 틀리면 bad 를 단다(버리지 않는다)', () => {
  const got = normalizeCurates([
    { id: '2026-0901-a', verdict: 'reflect', into: ['table:a'] },
    { id: '2026-0902-b', verdict: 'keep', reason: '사전지식' },
    '2026-0903-c',
    { id: '2026-0904-d', verdict: 'keep', into: ['table:a'] },
    { id: '2026-0905-e', verdict: 'new' },
  ])
  assert.equal(got.length, 5)
  assert.equal(got[0].bad, undefined)
  assert.equal(got[1].reason, '사전지식')
  assert.match(got[2].bad, /판정/)
  assert.match(got[3].bad, /keep/)
  assert.match(got[4].bad, /into/)
  assert.equal(normalizeCurates(undefined), null)
})

test('recordKind — curates · baseline · 옛 기계 기록 태그 · 사람의 기록', () => {
  assert.equal(recordKind({ curates: [] }), 'curation')
  assert.equal(recordKind({ curates: null, baseline: { source: 'db' } }), 'baseline')
  assert.equal(recordKind({ curates: null, baseline: null, tags: ['derive'] }), 'system')
  assert.equal(recordKind({ curates: null, baseline: null, tags: ['x'] }), 'work')
})

test('excerptOf — 헤딩 · 표 · 주석을 건너뛴 첫 문단', () => {
  assert.equal(excerptOf('# 제목\n\n| a | b |\n\n<!-- x -->\n첫 줄이다.\n둘째 줄.\n\n다음 문단'), '첫 줄이다. 둘째 줄.')
  assert.equal(excerptOf('```\n코드\n```\n본문'), '본문')
  assert.ok(excerptOf('가'.repeat(400)).length <= 160)
})

test('암묵 전환 — 큐레이션 기록이 없으면 옛 판정(applied 뒤 후속)이 남긴 기록만 대기다', async () => {
  const root = await repo({
    'docs/테이블.md': DOC([
      ['a', '2026-0902-a2', 'A 의 지금'],
      ['b', '2026-0901-b1', 'B 의 지금'],
    ]),
    'work/2026-0901-b1.md': work({ id: '2026-0901-b1', date: '2026-09-01 10:00', touches: ['table:b'] }),
    'work/2026-0902-a2.md': work({ id: '2026-0902-a2', date: '2026-09-02 10:00', touches: ['table:a'] }),
    'work/2026-0903-b2.md': work({ id: '2026-0903-b2', date: '2026-09-03 10:00', touches: ['table:b'], body: 'B 를 또 바꿨다.' }),
    'work/2026-0904-x.md': work({ id: '2026-0904-x', date: '2026-09-04 10:00', touches: ['term:x'] }),
  })
  const r = await loadRepo(root)
  assert.equal(r.curation.implicit, true)
  assert.deepEqual(r.curation.queue.map((q) => q.id), ['2026-0903-b2'])
  assert.equal(r.curation.statusOf('2026-0901-b1').state, 'reflected')
  assert.equal(r.curation.statusOf('2026-0901-b1').implicit, true)
  // 등록부 없는 좌표만 건드린 기록도 옛 판정에 안 걸렸으니 대기가 아니다
  assert.equal(r.curation.statusOf('2026-0904-x').state, 'reflected')
  assert.equal(r.curation.statusOf('2026-0903-b2').state, 'queued')
  const pb = r.curation.pendingOf('table:b')
  assert.deepEqual(pb.map((p) => p.id), ['2026-0903-b2'])
  assert.equal(pb[0].excerpt, 'B 를 또 바꿨다.')
  assert.deepEqual(r.curation.pendingOf('table:a'), [])
  assert.equal(r.curation.stats.queue, 1)
  assert.equal(r.curation.stats.pendingSections, 1)
})

test('큐레이션된 레포 — 판정을 받은 기록은 대기가 아니다 · 미반영은 그 좌표를 건드린 대기 기록이다', async () => {
  const root = await repo({
    'docs/테이블.md': DOC([['a', '2026-0905-a5', 'A']]),
    // 원문 날짜를 단 편입 기록(applied 보다 앞선 날짜) — 날짜 기준이면 숨는다(H5)
    'work/2026-0801-old.md': work({ id: '2026-0801-old', date: '2026-08-01', touches: ['table:a'], body: '옛 원문을 편입했다.' }),
    'work/2026-0905-a5.md': work({ id: '2026-0905-a5', date: '2026-09-05 10:00', touches: ['table:a'] }),
    'work/2026-0906-k.md': work({ id: '2026-0906-k', date: '2026-09-06 10:00', touches: ['term:x'] }),
    'work/2026-0907-cur.md': work({
      id: '2026-0907-cur',
      date: '2026-09-07 10:00',
      extra: ['touchesEmpty: 큐레이션', 'curates:', '  - { id: 2026-0905-a5, verdict: reflect, into: [table:a] }', '  - { id: 2026-0906-k, verdict: keep, reason: 사전지식 }'],
    }),
    // 아직 아무도 안 본 기록 · 섹션 없는 좌표(table:c) — 섹션이 없어도 대기열에는 선다
    'work/2026-0908-c.md': work({ id: '2026-0908-c', date: '2026-09-08 10:00', touches: ['table:c'] }),
  })
  const r = await loadRepo(root)
  assert.equal(r.curation.implicit, false)
  assert.deepEqual(r.curation.queue.map((q) => q.id), ['2026-0801-old', '2026-0908-c'])
  assert.equal(r.curation.statusOf('2026-0905-a5').state, 'reflected')
  assert.deepEqual(r.curation.statusOf('2026-0905-a5').into, ['table:a'])
  assert.equal(r.curation.statusOf('2026-0905-a5').by, '2026-0907-cur')
  assert.equal(r.curation.statusOf('2026-0906-k').state, 'kept')
  assert.equal(r.curation.statusOf('2026-0907-cur').state, 'system')
  // 날짜가 applied 보다 앞서도 대기면 미반영이다
  assert.deepEqual(r.curation.pendingOf('table:a').map((p) => p.id), ['2026-0801-old'])
  const qc = r.curation.queue.find((q) => q.id === '2026-0908-c')
  assert.deepEqual(qc.coords, [{ coord: 'table:c', cls: 'anchor' }])
  assert.equal(r.curation.stats.last.id, '2026-0907-cur')
})

test('재큐레이션 — 가장 늦은 판정이 이긴다', async () => {
  const root = await repo({
    'docs/테이블.md': DOC([['a', '2026-0901-a', 'A']]),
    'work/2026-0901-a.md': work({ id: '2026-0901-a', date: '2026-09-01 10:00', touches: ['table:a'] }),
    'work/2026-0902-c1.md': work({ id: '2026-0902-c1', date: '2026-09-02 10:00', extra: ['touchesEmpty: 큐레이션', 'curates:', '  - { id: 2026-0901-a, verdict: keep, reason: 보류 }'] }),
    'work/2026-0903-c2.md': work({ id: '2026-0903-c2', date: '2026-09-03 10:00', extra: ['touchesEmpty: 큐레이션', 'curates:', '  - { id: 2026-0901-a, verdict: reflect, into: [table:a] }'] }),
  })
  const r = await loadRepo(root)
  assert.equal(r.curation.statusOf('2026-0901-a').state, 'reflected')
  assert.equal(r.curation.statusOf('2026-0901-a').by, '2026-0903-c2')
  assert.equal(r.curation.queue.length, 0)
})

test('section — 미반영 기록의 본문을 같이 싣는다 · 섹션 없는 좌표도 대기 기록이 근거다 · 본문의 좌표는 한 단계 따라간다', async () => {
  const { toolSection, toolWhere, toolWork } = await import('../core/tools.js')
  const root = await repo({
    'docs/테이블.md': ['# 테이블', '<!-- cdp:form public-si/DE_431 -->', '', '테이블의 지금 상태.', '', '## a — 가', '<!-- applied: 2026-0905-a5 -->', '', 'A 는 `table:b` 를 참조한다.', '', '## b — 나', '<!-- applied: 2026-0905-a5 -->', '', 'B 의 정본.', ''].join('\n'),
    'work/2026-0905-a5.md': work({ id: '2026-0905-a5', date: '2026-09-05 10:00', touches: ['table:a', 'table:b'] }),
    'work/2026-0907-cur.md': work({ id: '2026-0907-cur', date: '2026-09-07 10:00', extra: ['touchesEmpty: 큐레이션', 'curates:', '  - { id: 2026-0905-a5, verdict: reflect, into: [table:a, table:b] }'] }),
    'work/2026-0908-a8.md': work({ id: '2026-0908-a8', date: '2026-09-08 10:00', touches: ['table:a'], body: 'A 에 컬럼을 더했다. 값은 이렇다.' }),
    'work/2026-0909-c9.md': work({ id: '2026-0909-c9', date: '2026-09-09 10:00', touches: ['table:c'], body: 'C 를 처음 만들었다.' }),
  })
  const r = await loadRepo(root)
  const a = toolSection(r, { coord: 'table:a' })
  assert.equal(a.state, 'pending')
  assert.equal(a.form, 'public-si/DE_431')
  assert.deepEqual(a.pending.map((p) => p.id), ['2026-0908-a8'])
  assert.match(a.pendingRecords[0].body, /컬럼을 더했다/)
  assert.equal(a.refs[0].coord, 'table:b')
  assert.match(a.refs[0].content, /B 의 정본/)
  const b = toolSection(r, { coord: 'table:b' })
  assert.equal(b.state, 'ok')
  assert.deepEqual(b.pending, [])
  // 등록부 행은 있는데 섹션이 없는 좌표 — 섹션은 없지만 대기 기록이 온다
  const c = toolSection(r, { coord: 'table:c' })
  assert.equal(c.body, null)
  assert.equal(c.state, 'missing')
  assert.deepEqual(c.pending.map((p) => p.id), ['2026-0909-c9'])
  assert.match(c.pendingRecords[0].body, /처음 만들었다/)
  const w = toolWhere(r, { coord: 'table:a' })
  assert.equal(w.section.state, 'pending')
  assert.equal(w.section.pending, 1)
  assert.equal(toolWork(r, { id: '2026-0905-a5' }).curation.state, 'reflected')
  assert.equal(toolWork(r, { id: '2026-0908-a8' }).curation.state, 'queued')
})
