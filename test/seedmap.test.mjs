// 문서 레포에서 세우기 — 지도 · 쪼개기 · 다듬기 · 링크 · 검사. `core/seedmap.js` · 문서레포 세우기 검토 v0.1 §2.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSeedMap, normalizeSeedMap, splitH2, docSections, dropHistory, collapseNested, linkTable, relink, checkSeedMap, coordMap, expandTouches, appendixOf, normForCompare } from '../core/seedmap.js'

const NL = '\n'
const MAP = {
  version: 1,
  root: '산출물',
  docs: [
    { key: 'term', src: '공통/용어집.md', doc: 'docs/공통/용어집.md', type: 'term', title: '용어집', kind: '정의' },
    { key: 'scope', src: '착수/수행범위.md', doc: 'docs/착수/수행범위.md', coord: '범위:수행범위', label: '수행 범위', aliases: ['범위'] },
    { key: 'gw', src: '설계/게이트웨이.md', doc: 'docs/설계/게이트웨이.md', split: 'chapters', type: '게이트웨이설계', chapters: ['원칙', '구성'], preamble: '개요', chapterAliases: ['설계 §{n}'], figs: '설계/게이트웨이_그림' },
  ],
  records: [
    { id: '2026-0901-회의', date: '2026-09-01 10:00', src: '회의록/0901.md', touches: ['term:PLC', '@gw'] },
    { id: '2026-0902-용어부록', date: '2026-09-02', from: 'term', touches: ['@term'] },
  ],
  alias: { '회의록/0901_축약.md': '2026-0901-회의' },
  ignore: [{ src: '공통/이동내역.md', why: '정리 기록' }],
  intent: { '범위:수행범위': '형식' },
}
const TERM = ['# 용어집', '', '> 출처: 옛 위키', '', '## PLC — 현장 제어 장치', '', '현장 설비를 제어한다. [회의](../회의록/0901.md)', '**변경** · 2026-09-01 [x](y.md) 옛 이력', '', '## SCADA 서버 — 감시', '', 'PLC 를 감시한다.', '```', '## 코드 안은 헤딩이 아니다', '```', '', '## 부록. 작업 기록', '', '부록 본문'].join(NL)
const SCOPE = ['# 수행범위', '> 출처: 옛 위키', '', '| 포함 | 제외 |', '|---|---|', '| SW | 서버 |', '· 2026-10-12 [근거](a.md) 정정 — 이력'].join(NL)
const GW = ['# 게이트웨이 설계', '', '- 판 v0.2 · 상태 초안', '', '---', '', '## 1. 설계 원칙', '', '판단하지 않는다. ![그림](게이트웨이_그림/a.png)', '', '---', '', '## 2. 구성', '', '[[옛](../../work/x.md)](../착수/수행범위.md#포함) 를 본다'].join(NL)
const FILES = ['공통/용어집.md', '착수/수행범위.md', '설계/게이트웨이.md', '설계/게이트웨이_그림/a.png', '회의록/0901.md', '회의록/0901_축약.md', '공통/이동내역.md', '공통/새문서.md']
const TEXT = { '공통/용어집.md': TERM, '착수/수행범위.md': SCOPE, '설계/게이트웨이.md': GW, '회의록/0901.md': '# 회의\n\n결정 D1.' }

test('parseSeedMap — 모양 검사: version · 경로 · split · 좌표 · 장 · 종류 · 겹침', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  assert.equal(m.docs[0].split, 'h2')
  assert.equal(m.docs[1].split, 'whole', 'coord 가 있으면 whole')
  assert.equal(m.rules.history.length, 2)
  assert.throws(() => normalizeSeedMap({ ...MAP, version: 2 }), /version/)
  assert.throws(() => normalizeSeedMap({ ...MAP, docs: [{ key: 'a', src: 'a.md', doc: 'a.md', type: 't' }] }), /docs\/…md/)
  assert.throws(() => normalizeSeedMap({ ...MAP, docs: [{ key: 'a', src: 'a.md', doc: 'docs/a.md', split: 'chapters', type: 't' }] }), /chapters/)
  assert.throws(() => normalizeSeedMap({ ...MAP, docs: [{ key: 'a', src: 'a.md', doc: 'docs/a.md', type: 't', kind: '모름' }] }), /kind/)
  assert.throws(() => normalizeSeedMap({ ...MAP, records: [{ id: 'x', date: '2026-09-01', src: 'a.md', touches: [] }] }), /YYYY-MMDD/)
  assert.throws(() => normalizeSeedMap({ ...MAP, docs: [MAP.docs[0], { ...MAP.docs[0] }] }), /겹친다/)
  assert.throws(() => parseSeedMap('{'), /JSON/)
})

test('splitH2 · docSections — 세 모양 · 값에 공백이면 첫 낱말 · 부록 건너뜀 · 코드 블록 · 이력 줄 · 머리말', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  assert.deepEqual(splitH2(TERM).secs.map((s) => s.value), ['PLC', 'SCADA', '부록.'])
  const term = docSections(m.docs[0], TERM, m)
  assert.deepEqual(term.map((s) => s.coord), ['term:PLC', 'term:SCADA'])
  assert.equal(term[1].heading, 'SCADA — 서버 — 감시')
  assert.equal(term[0].label, '현장 제어 장치')
  assert.doesNotMatch(term[0].body, /옛 이력/, '이력 줄을 걷는다')
  assert.match(term[1].body, /## 코드 안은 헤딩이 아니다/)
  const scope = docSections(m.docs[1], SCOPE, m)
  assert.equal(scope.length, 1)
  assert.equal(scope[0].coord, '범위:수행범위')
  assert.doesNotMatch(scope[0].body, /^# |출처|정정 — 이력/m)
  const gw = docSections(m.docs[2], GW, m)
  assert.deepEqual(gw.map((s) => s.coord), ['게이트웨이설계:개요', '게이트웨이설계:원칙', '게이트웨이설계:구성'])
  assert.equal(gw[1].heading, '원칙 — 1. 설계 원칙')
  assert.deepEqual(gw[1].aliases, ['설계 §1'])
  assert.match(gw[0].body, /판 v0.2/)
  assert.doesNotMatch(gw[1].body, /---\s*$/, '장 끝 구분선은 걷는다')
  assert.throws(() => docSections(m.docs[2], GW + '\n\n## 3. 없는 장\n', m), /장 번호를 모른다/)
  assert.equal(appendixOf(TERM, m).body, '부록 본문')
})

test('dropHistory · collapseNested — 옛 이력 줄 · 겹 링크', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  assert.equal(dropHistory('가\n**변경** · 2026-09-01 [a](b) x\n· 2026-10-12 [c](d) y\n· 2026-10-12 정정\n나', m), '가\n· 2026-10-12 정정\n나')
  assert.equal(collapseNested('보라 [[옛 이름](../../work/x.md)](../a/b.md) 끝'), '보라 [옛 이름](../a/b.md) 끝')
})

test('linkTable · relink — 관리 문서 · 기록 · 별칭 · 그림 · 장 문서는 앵커를 뗀다 · 표 밖은 글자만 · 웹 · 버튼 표기는 그대로', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  const t = linkTable(m, FILES, '2026-10-12')
  assert.equal(t.get('설계/게이트웨이_그림/a.png'), 'work/assets/2026-1012-이관-gw/a.png')
  const un = new Map()
  const out = relink('[회의](../회의록/0901.md) [축약](../회의록/0901_축약.md) [범위](../착수/수행범위.md#포함) [설계](../설계/게이트웨이.md#2-구성) [엑셀](../x/표.xlsx) [웹](https://x.y/a.md) [즉시실행](기타1) ![g](../설계/게이트웨이_그림/a.png)', '공통/용어집.md', 'docs/공통/용어집.md', t, un)
  assert.equal(
    out,
    '[회의](../../work/2026-0901-회의.md) [축약](../../work/2026-0901-회의.md) [범위](../착수/수행범위.md#포함) [설계](../설계/게이트웨이.md) 엑셀 [웹](https://x.y/a.md) [즉시실행](기타1) ![g](../../work/assets/2026-1012-이관-gw/a.png)'
  )
  assert.deepEqual([...un.keys()], ['x/표.xlsx'])
})

test('checkSeedMap — 지도에 없는 md · 없는 파일 · 모르는 touches · intent', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  const read = (f) => TEXT[f] ?? ''
  const r = checkSeedMap(m, FILES, read)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.untracked, ['공통/새문서.md'])
  assert.deepEqual(r.docs, [{ key: 'term', sections: 2 }, { key: 'scope', sections: 1 }, { key: 'gw', sections: 3 }])
  const bad = parseSeedMap(JSON.stringify({ ...MAP, records: [...MAP.records, { id: '2026-0903-x', date: '2026-09-03', src: '없다.md', touches: ['@없음'] }] }))
  const r2 = checkSeedMap(bad, FILES, read)
  assert.ok(r2.errors.some((e) => /원천 파일이 없다: 없다.md/.test(e)))
  assert.ok(r2.errors.some((e) => /@없음/.test(e)))
  assert.deepEqual(expandTouches(m.records[0], m, (d) => docSections(d, read(d.src), m)), ['term:PLC', '게이트웨이설계:개요', '게이트웨이설계:원칙', '게이트웨이설계:구성'])
})

test('coordMap — 이력 줄만 바뀐 것은 섹션 변경이 아니다(follow · update)', () => {
  const m = parseSeedMap(JSON.stringify(MAP))
  const a = coordMap(m.docs[0], TERM, m)
  const b = coordMap(m.docs[0], TERM.replace('**변경** · 2026-09-01 [x](y.md) 옛 이력', '**변경** · 2026-09-01 [x](y.md) 옛 이력\n**변경** · 2026-10-01 [z](w.md) 새 이력'), m)
  assert.equal(a.get('term:PLC'), b.get('term:PLC'))
  const c = coordMap(m.docs[0], TERM.replace('현장 설비를 제어한다.', '현장 설비를 제어한다. 인터록도.'), m)
  assert.notEqual(a.get('term:PLC'), c.get('term:PLC'))
  assert.equal(c.get('term:SCADA'), a.get('term:SCADA'))
})

test('normForCompare — 링크 대상 · 경과 · 기준선 표지 · 공백은 견주지 않는다', () => {
  assert.equal(normForCompare('가 [a](x.md)\n\n**경과**\n- 2026 [b](c) d\n'), normForCompare('가   [a](y.md)'))
})
