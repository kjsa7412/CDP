// 명부와 토큰 — `core/auth.js`. MCP 설계서 §4.4.
//
// `decide` 는 순수 함수다(`now` 를 받는다). 그래서 만료 · 고아 · 중지를
// 시계 없이 고정할 수 있다 — 이 파일이 그 약속을 지키는지 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as auth from '../core/auth.js'

const DAY = 86400_000
const NOW = Date.parse('2026-09-22T09:00:00Z')

function fixture() {
  const db = auth.emptyDb()
  auth.userAdd(db, { name: 'kjsa', label: '개발', repos: ['*'], write: true })
  auth.userAdd(db, { name: 'qa', repos: ['alpha'] })
  auth.userAdd(db, { name: 'ghost', repos: ['alpha'] })
  const k = auth.issue(db, { user: 'kjsa', now: NOW, note: '노트북' })
  const q = auth.issue(db, { user: 'qa', now: NOW })
  const g = auth.issue(db, { user: 'ghost', now: NOW })
  return { db, k, q, g }
}

test('decide — 5단계 거절이 각각 다른 문장으로 난다', () => {
  const { db, q, g } = fixture()

  assert.equal(auth.decide(db, null, NOW).message, '토큰이 없다')
  assert.equal(auth.decide(db, 'nonsense', NOW).message, '토큰을 찾을 수 없다')

  // ② 만료 — expires 는 날짜다. 그날 23:59:59 까지 산다
  const expiresAt = Date.parse(q.rec.expires + 'T23:59:59')
  assert.equal(auth.decide(db, q.raw, expiresAt).ok, true, '만료일 당일은 산다')
  assert.equal(auth.decide(db, q.raw, expiresAt + 1000).message, '만료')

  // ③ 고아 — 명부에서 사람을 지우면 토큰이 남아 있어도 막힌다
  db.users = db.users.filter((u) => u.name !== 'ghost')
  assert.equal(auth.decide(db, g.raw, NOW).message, '명부에 없는 토큰')

  // ④ 중지
  auth.userSet(db, 'qa', { active: false })
  assert.equal(auth.decide(db, q.raw, NOW).message, '사용 중지된 사용자')
  auth.userSet(db, 'qa', { active: true })
  assert.equal(auth.decide(db, q.raw, NOW).ok, true)

  for (const d of [auth.decide(db, null, NOW), auth.decide(db, 'x', NOW)]) {
    assert.equal(d.status, 401)
    assert.equal(d.code, 'E_AUTH')
  }
})

test('decide — 권한은 토큰이 아니라 명부에서 온다', () => {
  const { db, k, q } = fixture()
  const a = auth.decide(db, k.raw, NOW)
  assert.equal(a.user, 'kjsa')
  assert.equal(a.write, true)
  assert.equal(a.allow, null, "repos: ['*'] 면 allow 가 null (전부)")
  // 만료는 그날 23:59:59 까지 산다 — 발급 시각이 아침이면 91 로 센다(올림)
  assert.ok(a.expiresInDays >= 90 && a.expiresInDays <= 91, String(a.expiresInDays))
  assert.equal(a.tokenId, k.rec.sha256.slice(0, 8))

  const b = auth.decide(db, q.raw, NOW)
  assert.equal(b.write, false)
  assert.equal(b.allow('alpha'), true)
  assert.equal(b.allow('beta'), false)

  // 명부를 고치면 **토큰을 다시 발급하지 않아도** 다음 판정에 먹는다
  auth.userSet(db, 'qa', { repos: ['alpha', 'beta'], write: true })
  const c = auth.decide(db, q.raw, NOW)
  assert.equal(c.write, true)
  assert.equal(c.allow('beta'), true)
})

test('issue — 명부에 없는 이름은 거부한다 · 기본 90일 · never 는 명시', () => {
  const db = auth.emptyDb()
  assert.throws(() => auth.issue(db, { user: '유령', now: NOW }), /명부에 없는 이름/)

  auth.userAdd(db, { name: 'a' })
  const t1 = auth.issue(db, { user: 'a', now: NOW })
  assert.equal(t1.rec.expires, new Date(NOW + 90 * DAY).toISOString().slice(0, 10))
  assert.equal(t1.rec.issued, '2026-09-22')
  assert.notEqual(t1.raw, t1.rec.sha256, '파일에는 해시만 남는다')
  assert.equal(t1.rec.sha256, auth.sha256(t1.raw))

  const t2 = auth.issue(db, { user: 'a', expiresDays: 'never', now: NOW })
  assert.equal(t2.rec.expires, 'never')
  assert.equal(auth.daysLeft(t2.rec, NOW), null)
  assert.equal(auth.tokenList(db, NOW).length, 2)
})

test('userAdd — 이름 형식 · 중복 · repos 정규화', () => {
  const db = auth.emptyDb()
  assert.throws(() => auth.userAdd(db, { name: '한글' }), /이름 형식/)
  assert.throws(() => auth.userAdd(db, { name: 'a b' }), /이름 형식/)
  const u = auth.userAdd(db, { name: 'kjsa', repos: 'alpha, beta ,,' })
  assert.deepEqual(u.repos, ['alpha', 'beta'])
  assert.equal(u.active, true)
  assert.equal(u.write, false)
  assert.throws(() => auth.userAdd(db, { name: 'kjsa' }), /이미 명부에/)
  // '*' 가 섞이면 '*' 하나로
  const v = auth.userAdd(db, { name: 'all', repos: ['alpha', '*'] })
  assert.deepEqual(v.repos, ['*'])
})

test('userSet — 없는 사람 · inactive 는 left 를 적고 토큰은 남긴다', () => {
  const { db, q } = fixture()
  assert.throws(() => auth.userSet(db, 'nobody', { write: true }), /명부에 없다/)
  const before = db.tokens.length
  auth.userSet(db, 'qa', { active: false })
  const u = db.users.find((x) => x.name === 'qa')
  assert.equal(u.active, false)
  assert.match(u.left, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(db.tokens.length, before, '토큰은 지우지 않는다')
  auth.userSet(db, 'qa', { active: true })
  assert.equal(u.left, undefined)
  assert.equal(auth.decide(db, q.raw, NOW).ok, true)
})

test('userList — 레포로 거르면 그 레포를 볼 수 있는 활성 사용자만', () => {
  const { db } = fixture()
  auth.userSet(db, 'ghost', { active: false })
  const beta = auth.userList(db, { repo: 'beta', now: NOW }).map((u) => u.name)
  assert.deepEqual(beta, ['kjsa'], "'*' 만 beta 를 본다")
  const alpha = auth.userList(db, { repo: 'alpha', now: NOW }).map((u) => u.name)
  assert.deepEqual(alpha, ['kjsa', 'qa'], '중지된 ghost 는 빠진다')
  const all = auth.userList(db, { now: NOW })
  assert.equal(all.length, 3)
  const k = all.find((u) => u.name === 'kjsa')
  assert.equal(k.tokens, 1)
  assert.equal(k.liveTokens, 1)
})

test('revoke — 사람 전체 또는 id 하나 · 없으면 던진다', () => {
  const { db, k } = fixture()
  const k2 = auth.issue(db, { user: 'kjsa', now: NOW, note: '둘째' })
  assert.equal(auth.revoke(db, { user: 'kjsa', id: k2.rec.sha256.slice(0, 8) }), 1)
  assert.equal(auth.decide(db, k.raw, NOW).ok, true, '다른 토큰은 산다')
  assert.equal(auth.decide(db, k2.raw, NOW).ok, false)
  assert.equal(auth.revoke(db, { user: 'kjsa' }), 1)
  assert.throws(() => auth.revoke(db, { user: 'kjsa' }), /지울 토큰이 없다/)
})

test('세션 쿠키 — 서명 왕복 · 위조 · 만료 · 권한은 매 요청 명부에서', () => {
  const { db } = fixture()
  const secret = Buffer.alloc(32, 7)
  const c = auth.signSession(secret, 'qa', { now: NOW })
  const s = auth.readSession(secret, c, NOW)
  assert.equal(s.user, 'qa')
  assert.equal(s.exp, NOW + 12 * 3600_000)

  assert.equal(auth.readSession(secret, c, NOW + 13 * 3600_000), null, '12시간 뒤')
  assert.equal(auth.readSession(Buffer.alloc(32, 9), c, NOW), null, '다른 비밀')
  assert.equal(auth.readSession(secret, c.slice(0, -1) + 'x', NOW), null, '서명 한 글자')
  assert.equal(auth.readSession(secret, 'garbage', NOW), null)

  const d = auth.decideSession(db, s)
  assert.equal(d.ok, true)
  assert.equal(d.allow('alpha'), true)
  // 쿠키가 살아 있어도 명부에서 멈추면 끊긴다 — 권한을 쿠키에 담지 않았기 때문이다
  auth.userSet(db, 'qa', { active: false })
  assert.equal(auth.decideSession(db, s).message, '사용 중지된 사용자')
  assert.equal(auth.decideSession(db, null).status, 401)
})

test('parseCookies', () => {
  assert.deepEqual(auth.parseCookies('a=1; cdp_s=x.y; b=%20'), { a: '1', cdp_s: 'x.y', b: ' ' })
  assert.deepEqual(auth.parseCookies(undefined), {})
})

test('load — v1.0 형식(토큰에 repos·write)은 조용히 받지 않는다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-auth-'))
  try {
    const file = path.join(dir, 'auth.json')
    assert.deepEqual(await auth.load(file), { users: [], tokens: [] }, '없으면 빈 명부')

    await fs.writeFile(file, JSON.stringify({ users: [], tokens: [{ sha256: 'x', user: 'a', repos: ['*'] }] }))
    await assert.rejects(auth.load(file), /권한은 users\[\] 에만/)

    await fs.writeFile(file, '{ not json')
    await assert.rejects(auth.load(file), /JSON 이 아니다/)

    const { db } = fixture()
    await auth.store(file, db)
    const back = await auth.load(file)
    assert.equal(back.users.length, 3)
    assert.equal(back.tokens.length, 3)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
