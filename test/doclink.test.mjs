// 문서 이동 · 돌아가기(문서 이동 검토 v0.1) — 주소 ↔ 문서 · 열린 문서 탭 규칙.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docHref, docOfRoute, canonDocId, docTitle, tabsOpen, tabsClose, tabsPin, recentPush, TAB_MAX } from '../viewer/src/lib/doclink.js'

// 라우터(`modeOf`)가 하는 것과 같게 — 주소 → rest(조각마다 디코드 · 서버형은 /r/<레포> 뒤) · query
const parse = (href) => {
  const u = new URL(href, 'http://x')
  const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  return { rest: seg[0] === 'r' ? seg.slice(2) : seg, query: u.searchParams }
}

test('docHref ↔ docOfRoute — 로컬 · 서버형 · 한글 · 경로 · 섹션', () => {
  const cases = [
    ['/', '2026-0917-PLC-CIMON-SCADA-구조', null],
    ['/', 'docs/테이블정의서.md', null],
    ['/', 'docs/테이블정의서.md', 'table:rp_plnd_mst'],
    ['/r/gdi/', 'MANUAL.md', null],
    ['/r/' + encodeURIComponent('dpms wiki') + '/', 'docs/화면 설계서.md', 'screen:SYB030 #1'],
  ]
  for (const [base, id, at] of cases) {
    const href = docHref(base, id, at)
    assert.ok(href.startsWith(base + 'd/'), href)
    assert.ok(!href.includes('#'), '섹션은 해시가 아니다 — 본문 #앵커와 부딪힌다')
    const { rest, query } = parse(href)
    assert.deepEqual(docOfRoute(rest, query), { id, at, v: null }, href)
  }
  // 고른 시각 자료(?v=) — 섹션과 같이 실린다 · 한글 · 공백 · & 가 있어도 왕복한다
  for (const [at, v] of [[null, 'work/assets/2026-1006-SCADA/SCADA_연계_구성도.html'], ['table:a', 'work/assets/x/a & b.html']]) {
    const href = docHref('/r/gdi/', 'docs/인터페이스정의서.md', at, v)
    const { rest, query } = parse(href)
    assert.deepEqual(docOfRoute(rest, query), { id: 'docs/인터페이스정의서.md', at, v }, href)
  }
  // 경로의 / 는 그대로 — 서버 폴백 · 사람 눈에
  assert.equal(docHref('/', 'docs/a.md'), '/d/docs/a.md')
})

test('docOfRoute — 문서 주소가 아니면 null', () => {
  assert.equal(docOfRoute([], null), null)
  assert.equal(docOfRoute(['graph'], null), null)
  assert.equal(docOfRoute(['manage', 'overview'], null), null)
  assert.equal(docOfRoute(['d'], null), null)
})

test('canonDocId — 본문 링크의 basename 을 관리 문서 경로로(같은 문서 탭 둘 막기)', () => {
  const managed = [{ path: 'docs/테이블정의서.md', name: '테이블정의서' }, { path: 'docs/DB도메인용어정의서.md' }]
  assert.equal(canonDocId('테이블정의서', managed), 'docs/테이블정의서.md')
  assert.equal(canonDocId('테이블정의서.md', managed), 'docs/테이블정의서.md')
  assert.equal(canonDocId('docs/테이블정의서.md', managed), 'docs/테이블정의서.md')
  assert.equal(canonDocId('2026-0101-x', managed), '2026-0101-x')
  assert.equal(canonDocId(encodeURIComponent('2026-0821-응시원서접수부'), managed), '2026-0821-응시원서접수부')
})

test('docTitle — 작업 · 관리 · 기타 · 없음', () => {
  const lists = { docs: [{ id: 'w1', title: '작업 하나' }], managed: [{ path: 'docs/코드정의서.md', name: '코드정의서' }], others: [{ path: 'MANUAL.md' }] }
  assert.deepEqual(docTitle('w1', lists), { title: '작업 하나', missing: false })
  assert.deepEqual(docTitle('docs/코드정의서.md', lists), { title: '코드정의서', missing: false })
  assert.deepEqual(docTitle('MANUAL.md', lists), { title: 'MANUAL.md', missing: false })
  assert.deepEqual(docTitle('docs/지운문서.md', lists), { title: '지운문서', missing: true })
})

test('tabsOpen — tab 은 지금 탭 오른쪽에 더하고 replace 는 지금 탭을 바꾼다', () => {
  const t = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(tabsOpen(t, 'x', { mode: 'tab', active: 'a' }).map((x) => x.id), ['a', 'x', 'b', 'c'])
  assert.deepEqual(tabsOpen(t, 'x', { mode: 'replace', active: 'b' }).map((x) => x.id), ['a', 'x', 'c'])
  // 있으면 그대로(그 탭으로 간다)
  assert.equal(tabsOpen(t, 'b', { mode: 'tab', active: 'a' }), t)
  // 지금 탭이 없으면 끝에
  assert.deepEqual(tabsOpen(t, 'x', { mode: 'replace', active: null }).map((x) => x.id), ['a', 'b', 'c', 'x'])
  // 고정 탭은 바꾸지 않고 더한다
  assert.deepEqual(tabsOpen([{ id: 'a', pin: true }], 'x', { mode: 'replace', active: 'a' }).map((x) => x.id), ['a', 'x'])
})

test('tabsOpen — 넘치면 오래 안 본 고정 아닌 탭부터 닫는다', () => {
  const t = Array.from({ length: TAB_MAX }, (_, i) => ({ id: 't' + i }))
  t[0] = { id: 't0', pin: true }
  const seen = Object.fromEntries(t.map((x, i) => [x.id, `2026-10-06T0${i}:00:00Z`]))
  seen.t2 = '2026-10-01T00:00:00Z' // 가장 오래 안 봄
  const next = tabsOpen(t, 'new', { mode: 'tab', active: 't7', seen })
  assert.equal(next.length, TAB_MAX)
  assert.ok(next.some((x) => x.id === 't0'), '고정은 남는다')
  assert.ok(!next.some((x) => x.id === 't2'))
  assert.ok(next.some((x) => x.id === 'new'), '방금 연 탭은 닫지 않는다')
})

test('tabsClose · tabsPin · recentPush', () => {
  const t = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(tabsClose(t, 'b', 'b'), { tabs: [{ id: 'a' }, { id: 'c' }], next: 'c' })
  assert.deepEqual(tabsClose(t, 'c', 'c').next, 'b')
  assert.deepEqual(tabsClose(t, 'a', 'c').next, 'c')
  assert.deepEqual(tabsClose([{ id: 'a' }], 'a', 'a'), { tabs: [], next: null })
  assert.deepEqual(tabsPin(t, 'b')[1], { id: 'b', pin: true })
  assert.deepEqual(tabsPin(tabsPin(t, 'b'), 'b')[1], { id: 'b' })
  assert.deepEqual(recentPush(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
  assert.equal(recentPush(Array.from({ length: 20 }, (_, i) => 'x' + i), 'y').length, 11)
})
