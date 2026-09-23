// 망 — `core/net.js`. CIDR 판정과 속도 제한. 제품관리서비스 검토 §4.3.
//
// 둘 다 시계와 소켓을 인자로 받는 순수 함수라 여기서 고정한다 —
// "21번째가 거절된다" 와 "창이 지나면 다시 통한다" 가 그 약속이다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCidrs, ipInCidrs, normalizeIp, makeLimiter } from '../core/net.js'

test('parseCidrs — 대역 · 단일 주소 · IPv6 정확 일치 · 잘못된 것은 던진다', () => {
  const c = parseCidrs('10.10.20.0/24, 127.0.0.1, ::1')
  assert.equal(c.length, 3)
  assert.equal(c[0].kind, 'v4')
  assert.equal(c[1].mask, 0xffffffff, '비트를 안 주면 /32')
  assert.equal(c[2].kind, 'v6')
  assert.deepEqual(parseCidrs(''), [])
  assert.deepEqual(parseCidrs(null), [])
  assert.throws(() => parseCidrs('10.10.20.0/33'), /비트가 틀렸다/)
  assert.throws(() => parseCidrs('10.10.20/24'), /형식이 아니다/)
  assert.throws(() => parseCidrs('사내망'), /형식이 아니다/)
  assert.throws(() => parseCidrs('10.10.20.256'), /형식이 아니다/)
})

test('ipInCidrs — 안 · 밖 · ::ffff: 접두 · 제한이 없으면 전부 통과', () => {
  const c = parseCidrs('10.10.20.0/24, 127.0.0.1')
  assert.equal(ipInCidrs('10.10.20.188', c), true)
  assert.equal(ipInCidrs('10.10.20.1', c), true)
  assert.equal(ipInCidrs('10.10.21.1', c), false)
  assert.equal(ipInCidrs('127.0.0.1', c), true)
  assert.equal(ipInCidrs('127.0.0.2', c), false, '/32 는 그 주소 하나')
  assert.equal(ipInCidrs('::ffff:10.10.20.5', c), true, 'Node 의 듀얼스택 표기')
  assert.equal(ipInCidrs('::1', c), false)
  assert.equal(ipInCidrs('::1', parseCidrs('::1')), true)
  assert.equal(ipInCidrs('garbage', c), false)
  assert.equal(ipInCidrs('1.2.3.4', []), true, '제한이 없다')
  assert.equal(ipInCidrs('1.2.3.4', null), true)
  // /0 은 전부
  assert.equal(ipInCidrs('203.0.113.9', parseCidrs('0.0.0.0/0')), true)
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4')
  assert.equal(normalizeIp(' 1.2.3.4 '), '1.2.3.4')
})

test('makeLimiter — limit 번째까지 통과 · 다음은 거절 · 창이 지나면 다시 · IP 마다 따로 · reset', () => {
  let t = 1_000_000
  const lim = makeLimiter({ limit: 20, windowMs: 60_000, now: () => t })
  for (let i = 1; i <= 20; i++) {
    const r = lim.hit('10.0.0.1')
    assert.equal(r.ok, true, `${i}번째`)
    assert.equal(r.remaining, 20 - i)
    t += 100
  }
  const over = lim.hit('10.0.0.1')
  assert.equal(over.ok, false, '21번째')
  assert.equal(over.remaining, 0)
  assert.ok(over.retryAfterMs > 0 && over.retryAfterMs <= 60_000, String(over.retryAfterMs))
  // 다른 IP 는 영향이 없다 · ::ffff: 는 같은 IP 다
  assert.equal(lim.hit('10.0.0.2').ok, true)
  assert.equal(lim.hit('::ffff:10.0.0.1').ok, false)
  // 창이 지나면 다시 통한다 — 미끄러지는 창이라 첫 시도가 빠져 나가는 순간부터
  t += 60_000
  assert.equal(lim.hit('10.0.0.1').ok, true)
  // reset
  for (let i = 0; i < 25; i++) lim.hit('10.0.0.3')
  assert.equal(lim.hit('10.0.0.3').ok, false)
  lim.reset('10.0.0.3')
  assert.equal(lim.hit('10.0.0.3').ok, true)
})
