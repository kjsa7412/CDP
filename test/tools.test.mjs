// 도구 입력 검증 — `core/tools.js`. MCP 설계서 §2.7 · §8.
//
// 좌표와 id 는 **파일 이름으로 쓰인다.** `..` 하나가 레포 밖을 연다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCoord, checkId, guardSize, toError, CtxError, BODY_LIMIT, sectionState, bundleAgeNotice } from '../core/tools.js'

test('checkCoord — type:value 만 · `..` · 제어문자 · 절대경로 거절 · 한글 타입은 받는다', () => {
  assert.equal(checkCoord('table:rp_plnd_mst'), 'table:rp_plnd_mst')
  assert.equal(checkCoord('api:/adapter/a10/expense-slip'), 'api:/adapter/a10/expense-slip')
  // 어휘(vocab.COORD)와 같은 문자 집합 — dpms 패키지는 타입이 전부 한글이다
  assert.equal(checkCoord('테이블정의서:ex_plan_mst'), '테이블정의서:ex_plan_mst')
  assert.equal(checkCoord('시험시나리오:UT-001'), '시험시나리오:UT-001')
  // ASCII 타입은 소문자만 — 그래서 Windows 절대경로(`C:/…`)가 좌표로 통과하지 않는다
  for (const bad of ['../etc/passwd', 'table:a/../../b', 'C:/abs/path', 'Table:x', 'table:', 'table: x', 'table:a\u0001b', '1type:x', ':x']) {
    assert.throws(() => checkCoord(bad), (e) => e instanceof CtxError && e.code === 'E_COORD', bad)
  }
})

test('checkId — YYYY-MMDD-slug · 슬래시 · `..` 거절', () => {
  assert.equal(checkId('2026-0921-검증-정상'), '2026-0921-검증-정상')
  for (const bad of ['nope', '2026-09-21-x', '2026-0921-a/b', '2026-0921-a..b', '']) {
    assert.throws(() => checkId(bad), (e) => e instanceof CtxError && e.code === 'E_INPUT', bad)
  }
})

test('guardSize — 512KB 를 넘으면 자르지 않고 거절한다', () => {
  const small = { body: 'x'.repeat(1000) }
  assert.equal(guardSize(small, 'section'), small)
  const big = { body: 'x'.repeat(BODY_LIMIT + 10) }
  assert.throws(() => guardSize(big, 'section'), (e) => e.code === 'E_INPUT' && /512KB/.test(e.message))
})

test('toError — CtxError 는 코드 그대로 · 그 밖은 E_REPO', () => {
  assert.deepEqual(toError(new CtxError('E_CONFLICT', '충돌', { coord: 'x' })), { code: 'E_CONFLICT', message: '충돌', detail: { coord: 'x' } })
  assert.equal(toError(new Error('boom')).code, 'E_REPO')
  assert.equal(toError('문자열').message, '문자열')
})

test('sectionState — 다섯을 셋으로 접는다', () => {
  assert.equal(sectionState(null), 'missing')
  assert.equal(sectionState({ state: 'doc-missing' }), 'missing')
  assert.equal(sectionState({ state: 'anchor-missing' }), 'missing')
  assert.equal(sectionState({ state: 'stale' }), 'derive-pending')
  assert.equal(sectionState({ state: 'unwritten' }), 'derive-pending')
  assert.equal(sectionState({ state: 'orphan' }), 'derive-pending')
  assert.equal(sectionState({ state: 'ok' }), 'ok')
  assert.equal(sectionState({ state: 'empty' }), 'ok')
})

test('bundleAgeNotice — 90일 넘으면 한 줄 · 번들이 아니면(__) 없다', () => {
  const now = Date.parse('2026-09-22T09:00:00Z')
  assert.equal(bundleAgeNotice('__CTX_BUILT__', now), null)
  assert.equal(bundleAgeNotice('2026-09-01 07:19', now), null)
  assert.match(bundleAgeNotice('2026-06-01 07:19', now), /번들이 11[0-9]일 됐다/)
  assert.match(bundleAgeNotice('2026-01-01', now), /새 판을 받는다/)
  assert.equal(bundleAgeNotice(null, now), null)
})
