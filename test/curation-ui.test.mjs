// 화면의 큐레이션 순수 함수 — 거름 · 상태 이름 · 에이전트 지시 글 · 서식 주소(개편안 §7.3 · TODO §1.2 · §1.3).
// 계산은 서버가 한다. 여기서는 **서버 값이 없을 때 그리지 않는 것**과 복사되는 글의 모양을 지킨다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateOf, filterRecords, hasCuration, curateCommand, CURATE_RULE, coordCounts, verdictCounts, formPath, STATE_LABEL, VERDICT_LABEL } from '../viewer/src/lib/curation.js'

const D = [
  { id: 'a', author: 'lee', curation: { state: 'queued' } },
  { id: 'b', author: 'kjsa', curation: { state: 'reflected', into: ['table:x'] } },
  { id: 'c', author: 'lee', curation: { state: 'kept', reason: '사전지식' } },
  { id: 'd', author: 'kjsa', curation: { state: 'system' } },
]

test('stateOf — 셋만 그린다 · system 과 모르는 값은 null', () => {
  assert.equal(stateOf({ state: 'queued' }), 'queued')
  assert.equal(stateOf({ state: 'reflected' }), 'reflected')
  assert.equal(stateOf({ state: 'kept' }), 'kept')
  assert.equal(stateOf({ state: 'system' }), null, '큐레이션 · 기준선 기록 자신')
  assert.equal(stateOf(undefined), null, '옛 서버')
  assert.equal(stateOf({ state: 'zzz' }), null)
  assert.deepEqual(STATE_LABEL, { queued: '대기', reflected: '반영됨', kept: '기록으로 둠' })
})

test('filterRecords — 대기 · 내 기록 · 전체', () => {
  assert.deepEqual(filterRecords(D, 'pending').map((d) => d.id), ['a'])
  assert.deepEqual(filterRecords(D, 'mine', { user: 'lee' }).map((d) => d.id), ['a', 'c'])
  assert.equal(filterRecords(D, 'mine', null).length, 4, '사람을 모르면 거르지 않는다')
  assert.equal(filterRecords(D, null).length, 4)
  assert.equal(hasCuration(D), true)
  assert.equal(hasCuration([{ id: 'x' }]), false, '옛 서버 — 「대기」 거름을 그리지 않는다')
})

test('curateCommand — 대상은 한 줄에 하나 · 같은 id 한 번 · 규칙 한 줄', () => {
  const t = curateCommand('dpms_wiki', ['2026-1006-a', '2026-1006-b', '2026-1006-a'])
  assert.equal(t, ['cdp-curate dpms_wiki', '대상: 2026-1006-a', '      2026-1006-b', CURATE_RULE].join('\n'))
  assert.equal(CURATE_RULE, '정본 한 곳 · 본문 현재형 · 경과 한 줄. 판정표를 보이고 승인 뒤 save.')
  assert.match(curateCommand('x', []), /^cdp-curate x\n대상: \(대기열 전부/)
})

test('coordCounts · verdictCounts · formPath', () => {
  assert.deepEqual(coordCounts([{ cls: 'section' }, { cls: 'section' }, { cls: 'anchor' }, { cls: 'unregistered' }, { cls: '?' }]), { section: 2, anchor: 1, unregistered: 1 })
  assert.deepEqual(verdictCounts([{ verdict: 'reflect' }, { verdict: 'new' }, { verdict: 'keep' }, { verdict: 'keep' }]), { reflect: 1, new: 1, keep: 2 })
  assert.deepEqual(VERDICT_LABEL, { reflect: '반영', new: '새 문서', keep: '기록으로 둠' })
  assert.equal(formPath({ id: 'public-si/DE_431', group: 'public-si' }), 'public-si/DE_431', '서식 id 가 묶음을 품으면 그대로')
  assert.equal(formPath({ id: 'DE_431', group: 'public-si' }), 'public-si/DE_431', '번호만이면 묶음을 붙인다')
  assert.equal(formPath(null), '')
})
