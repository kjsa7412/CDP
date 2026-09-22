// 최신성 — `core/validity.js`. 수행 v1.0 §6 · 시스템설계서 §1.4.
//
// `later(기준, 좌표)` 하나가 세 질문에 답한다. 그리고 **같은 날짜는 후속이
// 아니다** — 그 규칙이 여기서 고정된다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCoordIndex, buildSectionStatus, buildValidity, cmpDateDesc } from '../core/validity.js'
import { parseRegistry, buildManagedIndex } from '../core/managed.js'
import { parseDoc } from '../core/frontmatter.js'
import { renderIndex, renderByCoord } from '../core/indexes.js'

const W = (id, date, touches, extra = {}) => ({
  id,
  title: id,
  date,
  author: 'kjsa',
  status: null,
  path: `work/${id}.md`,
  touches,
  supersedes: [],
  ...extra,
})

const works = [
  W('2026-0801-첫작업', '2026-08-01', ['table:a', 'domain:심의']),
  W('2026-0815-둘째', '2026-08-15', ['table:a', 'screen:X']),
  W('2026-0815-같은날', '2026-08-15', ['table:a']),
  W('2026-0901-셋째', '2026-09-01 10:00', ['table:a']),
  W('2026-0901-시각뒤', '2026-09-01 14:30', ['table:a']),
]

test('cmpDateDesc — 최신 먼저 · 날짜 없는 것은 뒤로 · 같은 날은 id 역순', () => {
  const sorted = [...works, W('x-없음', null, [])].sort(cmpDateDesc).map((d) => d.id)
  assert.equal(sorted[0], '2026-0901-시각뒤')
  assert.equal(sorted.at(-1), 'x-없음')
})

test('later — 기준이 없으면 그 좌표의 전부 · 기준이 기록이면 그 뒤 것', () => {
  const idx = buildCoordIndex(works, { excludeTypes: ['domain'] })
  const all = idx.later(null, 'table:a')
  assert.equal(all.count, 5)
  assert.equal(all.total, 5)
  assert.equal(idx.latest('table:a').id, '2026-0901-시각뒤')

  const l = idx.later('2026-0801-첫작업', 'table:a')
  assert.equal(l.count, 4)
  assert.deepEqual(l.peers, [])

  assert.equal(idx.excluded('domain:심의'), true)
  assert.equal(idx.excluded('table:a'), false)
  assert.equal(idx.later(null, 'nope:x').total, 0)
})

test('later — 같은 날짜는 후속이 아니라 동배다 · 시각이 있으면 결판난다', () => {
  const idx = buildCoordIndex(works)
  const l = idx.later('2026-0815-둘째', 'table:a')
  assert.deepEqual(
    l.items.map((x) => x.id),
    ['2026-0901-시각뒤', '2026-0901-셋째'],
    '같은 날(0815-같은날)은 후속에 들지 않는다'
  )
  assert.deepEqual(
    l.peers.map((x) => x.id),
    ['2026-0815-같은날'],
    '대신 동배로 따로 센다 — check 가 경고로 낸다'
  )

  const t = idx.later('2026-0901-셋째', 'table:a')
  assert.deepEqual(t.items.map((x) => x.id), ['2026-0901-시각뒤'], '10:00 뒤의 14:30 은 후속이다')
  assert.deepEqual(t.peers, [], '둘 다 시각이 있으면 동배가 아니다')
})

test('later — applied 가 없는 기록을 가리키면 refUnknown 으로 알린다 (조용히 최신 판정하지 않는다)', () => {
  const idx = buildCoordIndex(works)
  const l = idx.later('2026-0000-유령', 'table:a')
  assert.equal(l.refUnknown, true)
  assert.equal(l.count, 5)
})

test('ofWork — 한 기록의 좌표마다 판정이 다르다', () => {
  const idx = buildCoordIndex(works)
  const r = idx.ofWork(works[1])
  assert.deepEqual(
    r.map((x) => [x.coord, x.count]),
    [
      ['table:a', 2],
      ['screen:X', 0],
    ]
  )
})

test('buildSectionStatus — ok · stale · unwritten · empty · orphan · anchor-missing · doc-missing', () => {
  const reg = parseRegistry('| p | d | s |\n|---|---|---|\n| `table:*` | `docs/테이블정의서.md` | `## {값}` |\n| `screen:*` | `docs/화면설계서.md` | `## {값}` |\n| `code:*` | `docs/없는문서.md` | `## {값}` |\n')
  const tbl = parseDoc(
    'docs/테이블정의서.md',
    '# T\n\n## a\n<!-- applied: 2026-0901-시각뒤 -->\n\n최신\n\n## b\n<!-- applied: 2026-0815-둘째 -->\n\n낡음\n\n## c\n<!-- applied: null -->\n\n미작성\n\n## d\n<!-- applied: null -->\n\n작업 없음 — 정상\n\n## e\n<!-- applied: 2026-0000-유령 -->\n\n고아\n'
  )
  const scr = parseDoc('docs/화면설계서.md', '# S\n\n## Y\n<!-- applied: null -->\n')
  const ws = [
    ...works,
    W('2026-0810-b', '2026-08-10', ['table:b']),
    W('2026-0820-b', '2026-08-20', ['table:b']),
    W('2026-0820-c', '2026-08-20', ['table:c']),
    W('2026-0820-e', '2026-08-20', ['table:e']),
    W('2026-0820-x', '2026-08-20', ['screen:X']),
    W('2026-0820-code', '2026-08-20', ['code:C1']),
  ]
  const idx = buildCoordIndex(ws)
  const mi = buildManagedIndex(reg, [tbl, scr])
  const rows = buildSectionStatus(idx, mi, ['table:a', 'table:b', 'table:c', 'table:d', 'table:e', 'screen:X', 'code:C1', 'domain:심의'])
  const by = Object.fromEntries(rows.map((r) => [r.coord, r.state]))
  assert.deepEqual(by, {
    'table:a': 'ok',
    'table:b': 'stale',
    'table:c': 'unwritten',
    'table:d': 'empty',
    'table:e': 'orphan',
    'screen:X': 'anchor-missing',
    'code:C1': 'doc-missing',
  })
  assert.equal(rows.some((r) => r.coord === 'domain:심의'), false, '등록부에 없는 좌표는 행이 없다')
  // 정렬 — 급한 것부터. 화면은 이 순서를 그대로 쓰지 않는다(설계서 §2.4)
  assert.equal(rows[0].state, 'stale')
  assert.equal(rows.at(-1).state, 'ok')
  const b = rows.find((r) => r.coord === 'table:b')
  assert.equal(b.count, 1)
  assert.equal(b.applied, '2026-0815-둘째')
})

test('buildValidity — supersedes 참조 · 대상 없음 · 순환', () => {
  const docs = [
    W('a', '2026-01-01', [], { supersedes: [{ id: 'b', scope: null }] }),
    W('b', '2026-01-02', [], { supersedes: [{ id: 'a', scope: null }] }),
    W('c', '2026-01-03', [], { supersedes: [{ id: '없음', scope: null }, { id: 'd', scope: ['table:x'] }] }),
    W('d', '2026-01-04', []),
  ]
  const v = buildValidity(docs)
  assert.deepEqual(v.missingTargets, [{ doc: 'c', target: '없음' }])
  assert.deepEqual([...v.cycles].sort(), ['a', 'b'])
  assert.equal(v.of('a').state, 'cycle')
  assert.equal(v.of('d').state, 'valid')
  assert.deepEqual(v.of('d').partialBy, [{ by: 'c', scope: ['table:x'] }])
  assert.deepEqual(v.of('c').brokenTargets, ['없음'])
  assert.deepEqual(v.of('b').correctedBy, ['a'])
})

test('renderIndex · renderByCoord — 행 수가 작업 기록 수와 같다 · 상태를 적지 않는다', () => {
  const idx = buildCoordIndex(works)
  const r = { works, allCoords: ['table:a', 'screen:X'], coords: idx, sections: [] }
  const index = renderIndex(r)
  assert.equal(index.split('\n').filter((l) => l.startsWith('| 2026-')).length, works.length)
  const by = renderByCoord(r)
  assert.ok(by.includes('## table'))
  assert.ok(by.includes('`table:a` 작업 5건'))
  assert.ok(by.includes('... 2건 더'), '3건까지만 펴고 나머지는 센다')
})
