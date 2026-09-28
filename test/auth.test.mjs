// 명부와 토큰 — `core/auth.js`. MCP 설계서 §4.4 · 제품관리서비스 검토 §4.3.
//
// `decide` 는 순수 함수다(`now` 를 받는다). 그래서 만료 · 고아 · 중지 · 폐기를
// 시계 없이 고정할 수 있다 — 이 파일이 그 약속을 지키는지 본다.
//
// v1.2 — 권한 축이 `write` 에서 `role` 로. v1.1 파일(`write:true`)이 그대로
// 읽히는지, 폐기가 줄을 지우지 않는지, 마지막 관리자를 잃지 않는지가 새로 걸린 것이다.

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
  auth.userAdd(db, { name: 'kjsa', label: '개발', repos: ['*'], role: 'admin' })
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

test('decide — 권한은 토큰이 아니라 명부에서 온다 · role 이 write 를 낳는다', () => {
  const { db, k, q } = fixture()
  const a = auth.decide(db, k.raw, NOW)
  assert.equal(a.user, 'kjsa')
  assert.equal(a.role, 'admin')
  assert.equal(a.admin, true)
  assert.equal(a.write, true, 'admin 은 writer 를 포함한다')
  assert.equal(a.allow, null, "repos: ['*'] 면 allow 가 null (전부)")
  // 관리자 토큰은 30일이다 — 그날 끝까지라 31 로 셀 수 있다(올림)
  assert.ok(a.expiresInDays >= 30 && a.expiresInDays <= 31, String(a.expiresInDays))
  assert.equal(a.tokenId, k.rec.sha256.slice(0, 8))

  const b = auth.decide(db, q.raw, NOW)
  assert.equal(b.role, 'viewer')
  assert.equal(b.write, false)
  assert.equal(b.admin, false)
  assert.equal(b.allow('alpha'), true)
  assert.equal(b.allow('beta'), false)
  // 일반 사용자는 90일
  assert.ok(b.expiresInDays >= 90 && b.expiresInDays <= 91, String(b.expiresInDays))

  // 명부를 고치면 **토큰을 다시 발급하지 않아도** 다음 판정에 먹는다
  auth.userSet(db, 'qa', { repos: ['alpha', 'beta'], role: 'writer' })
  const c = auth.decide(db, q.raw, NOW)
  assert.equal(c.write, true)
  assert.equal(c.admin, false)
  assert.equal(c.allow('beta'), true)
})

test('issue — 명부에 없는 이름은 거부한다 · 기본은 역할이 정한다 · never 는 명시 · id · status', () => {
  const db = auth.emptyDb()
  assert.throws(() => auth.issue(db, { user: '유령', now: NOW }), /명부에 없는 이름/)

  auth.userAdd(db, { name: 'a' })
  const t1 = auth.issue(db, { user: 'a', now: NOW })
  assert.equal(t1.rec.expires, new Date(NOW + 90 * DAY).toISOString().slice(0, 10))
  assert.equal(t1.rec.issued, '2026-09-22')
  assert.equal(t1.rec.id, t1.rec.sha256.slice(0, 8))
  assert.equal(t1.rec.status, 'active')
  assert.notEqual(t1.raw, t1.rec.sha256, '파일에는 해시만 남는다')
  assert.equal(t1.rec.sha256, auth.sha256(t1.raw))

  const t2 = auth.issue(db, { user: 'a', expiresDays: 'never', now: NOW })
  assert.equal(t2.rec.expires, 'never')
  assert.equal(auth.daysLeft(t2.rec, NOW), null)

  // 관리자는 30일이 기본 — 명시하면 그대로
  auth.userAdd(db, { name: 'root', role: 'admin' })
  assert.equal(auth.issue(db, { user: 'root', now: NOW }).rec.expires, new Date(NOW + 30 * DAY).toISOString().slice(0, 10))
  assert.equal(auth.issue(db, { user: 'root', expiresDays: 7, now: NOW }).rec.expires, new Date(NOW + 7 * DAY).toISOString().slice(0, 10))
  assert.throws(() => auth.issue(db, { user: 'a', expiresDays: 'soon', now: NOW }), /만료는/)
  assert.equal(auth.tokenList(db, NOW).length, 4)
})

test('userAdd — 이름 형식 · 중복 · repos 정규화 · role 과 옛 write', () => {
  const db = auth.emptyDb()
  assert.throws(() => auth.userAdd(db, { name: '한글' }), /이름 형식/)
  assert.throws(() => auth.userAdd(db, { name: 'a b' }), /이름 형식/)
  const u = auth.userAdd(db, { name: 'kjsa', repos: 'alpha, beta ,,' })
  assert.deepEqual(u.repos, ['alpha', 'beta'])
  assert.equal(u.active, true)
  assert.equal(u.role, 'viewer', '기본은 viewer')
  assert.equal('write' in u, false, '저장 모양에 write 는 없다')
  assert.throws(() => auth.userAdd(db, { name: 'kjsa' }), /이미 명부에/)
  // '*' 가 섞이면 '*' 하나로
  const v = auth.userAdd(db, { name: 'all', repos: ['alpha', '*'] })
  assert.deepEqual(v.repos, ['*'])
  // 옛 이름 --write 는 writer 다 · 모르는 역할은 거절
  assert.equal(auth.userAdd(db, { name: 'w', write: true }).role, 'writer')
  assert.equal(auth.userAdd(db, { name: 'x', role: 'admin', write: false }).role, 'admin', 'role 이 write 보다 앞선다')
  assert.throws(() => auth.userAdd(db, { name: 'y', role: 'owner' }), /역할은/)
})

test('userSet — 없는 사람 · inactive 는 left 를 적고 토큰은 남긴다 · write 옛 축', () => {
  const { db, q } = fixture()
  assert.throws(() => auth.userSet(db, 'nobody', { role: 'writer' }), /명부에 없다/)
  const before = db.tokens.length
  auth.userSet(db, 'qa', { active: false })
  const u = db.users.find((x) => x.name === 'qa')
  assert.equal(u.active, false)
  assert.match(u.left, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(db.tokens.length, before, '토큰은 지우지 않는다')
  auth.userSet(db, 'qa', { active: true })
  assert.equal(u.left, undefined)
  assert.equal(auth.decide(db, q.raw, NOW).ok, true)

  // --write / --no-write 는 writer / viewer 다. admin 에게 --write 는 그대로 admin
  assert.equal(auth.userSet(db, 'qa', { write: true }).role, 'writer')
  assert.equal(auth.userSet(db, 'qa', { write: false }).role, 'viewer')
  assert.equal(auth.userSet(db, 'kjsa', { write: true }).role, 'admin')
})

test('userSet — 마지막 관리자는 내리지도 끄지도 못한다 · 자기 자신은 바꾸지 못한다', () => {
  const { db } = fixture()
  // kjsa 가 유일한 admin 이다
  assert.throws(() => auth.userSet(db, 'kjsa', { role: 'writer' }), /마지막 관리자/)
  assert.throws(() => auth.userSet(db, 'kjsa', { active: false }), /마지막 관리자/)
  assert.throws(() => auth.userSet(db, 'kjsa', { write: false }), /마지막 관리자/)
  // 라벨 · 레포는 된다
  auth.userSet(db, 'kjsa', { label: '사경진', repos: ['*'] })
  assert.equal(db.users[0].label, '사경진')

  // 둘째 admin 을 올리면 첫째를 내릴 수 있다 — 다만 자기 자신은 못 한다(actor)
  auth.userSet(db, 'qa', { role: 'admin' })
  assert.equal(auth.admins(db).length, 2)
  assert.throws(() => auth.userSet(db, 'kjsa', { role: 'writer' }, { actor: 'kjsa' }), /자기 자신/)
  assert.throws(() => auth.userSet(db, 'kjsa', { active: false }, { actor: 'kjsa' }), /자기 자신/)
  // 자기 라벨은 된다
  auth.userSet(db, 'kjsa', { label: '나' }, { actor: 'kjsa' })
  // 다른 관리자가 내린다
  assert.equal(auth.userSet(db, 'kjsa', { role: 'writer' }, { actor: 'qa' }).role, 'writer')
  assert.deepEqual(auth.admins(db).map((a) => a.name), ['qa'])
  // 이제 qa 가 마지막이다 — 셸(actor 없음)에서도 못 내린다
  assert.throws(() => auth.userSet(db, 'qa', { role: 'viewer' }), /마지막 관리자/)
  const e = (() => {
    try {
      auth.userSet(db, 'qa', { role: 'viewer' })
    } catch (x) {
      return x
    }
  })()
  assert.equal(e.code, 'E_LAST_ADMIN')
})

test('userList — 레포로 거르면 그 레포를 볼 수 있는 활성 사용자만 · role 이 실린다', () => {
  const { db } = fixture()
  auth.userSet(db, 'ghost', { active: false })
  const beta = auth.userList(db, { repo: 'beta', now: NOW }).map((u) => u.name)
  assert.deepEqual(beta, ['kjsa'], "'*' 만 beta 를 본다")
  const alpha = auth.userList(db, { repo: 'alpha', now: NOW }).map((u) => u.name)
  assert.deepEqual(alpha, ['kjsa', 'qa'], '중지된 ghost 는 빠진다')
  const all = auth.userList(db, { now: NOW })
  assert.equal(all.length, 3)
  const k = all.find((u) => u.name === 'kjsa')
  assert.equal(k.role, 'admin')
  assert.equal(k.admin, true)
  assert.equal(k.write, true)
  assert.equal(k.tokens, 1)
  assert.equal(k.liveTokens, 1)
  // 폐기하면 liveTokens 만 준다 — tokens(이력)는 그대로
  auth.revoke(db, { user: 'kjsa' })
  const k2 = auth.userList(db, { now: NOW }).find((u) => u.name === 'kjsa')
  assert.equal(k2.tokens, 1)
  assert.equal(k2.liveTokens, 0)
})

test('revoke — 줄을 지우지 않고 status 를 바꾼다 · decide 가 거절 · 사람 전체 또는 id 하나 · 없으면 던진다', () => {
  const { db, k } = fixture()
  const k2 = auth.issue(db, { user: 'kjsa', now: NOW, note: '둘째' })
  const n = db.tokens.length
  assert.equal(auth.revoke(db, { user: 'kjsa', id: k2.rec.sha256.slice(0, 8), by: 'kjsa', now: NOW }), 1)
  assert.equal(db.tokens.length, n, '줄은 남는다')
  const rec = db.tokens.find((t) => t.sha256 === k2.rec.sha256)
  assert.equal(rec.status, 'revoked')
  assert.equal(rec.revokedAt, '2026-09-22')
  assert.equal(rec.revokedBy, 'kjsa')
  assert.equal(auth.decide(db, k.raw, NOW).ok, true, '다른 토큰은 산다')
  assert.equal(auth.decide(db, k2.raw, NOW).message, '폐기된 토큰')
  assert.equal(auth.revoke(db, { user: 'kjsa' }), 1, '활성인 것만 센다')
  assert.throws(() => auth.revoke(db, { user: 'kjsa' }), /지울 토큰이 없다/)
  const list = auth.tokenList(db, NOW)
  assert.equal(list.filter((t) => t.user === 'kjsa' && t.status === 'revoked').length, 2)
})

test('reissue — 폐기 + 발급 한 동작 · 옛 토큰 401 · 새 토큰 200 · 메모를 잇는다', () => {
  const { db, q } = fixture()
  const r = auth.reissue(db, { id: q.rec.id, by: 'kjsa', now: NOW })
  assert.equal(r.old.sha256, q.rec.sha256)
  assert.equal(r.old.status, 'revoked')
  assert.equal(r.rec.user, 'qa')
  assert.equal(r.rec.status, 'active')
  assert.equal(r.rec.note, '재발급')
  assert.equal(auth.decide(db, q.raw, NOW).message, '폐기된 토큰')
  assert.equal(auth.decide(db, r.raw, NOW).ok, true)
  // 폐기된 id 로는 다시 재발급하지 못한다
  assert.throws(() => auth.reissue(db, { id: q.rec.id, now: NOW }), /활성 토큰이 없다/)
  // 메모가 있으면 그 뒤에 붙는다
  const r2 = auth.reissue(db, { id: r.rec.id, now: NOW })
  assert.equal(r2.rec.note, '재발급 재발급')
})

test('tokenSet — 메모 · 만료(일수 · 날짜 · never) · 폐기된 토큰의 만료는 못 바꾼다', () => {
  const { db, q } = fixture()
  auth.tokenSet(db, { id: q.rec.id, note: '공용 PC', now: NOW })
  assert.equal(q.rec.note, '공용 PC')
  auth.tokenSet(db, { id: q.rec.id, expires: 10, now: NOW })
  assert.equal(q.rec.expires, new Date(NOW + 10 * DAY).toISOString().slice(0, 10))
  auth.tokenSet(db, { id: q.rec.id, expires: '2027-01-01', now: NOW })
  assert.equal(q.rec.expires, '2027-01-01')
  auth.tokenSet(db, { id: q.rec.id, expires: 'never', now: NOW })
  assert.equal(q.rec.expires, 'never')
  assert.throws(() => auth.tokenSet(db, { id: 'zzzzzzzz', note: 'x' }), /토큰이 없다/)
  auth.revoke(db, { id: q.rec.id, now: NOW })
  auth.tokenSet(db, { id: q.rec.id, note: '잃음' })
  assert.throws(() => auth.tokenSet(db, { id: q.rec.id, expires: 30 }), /폐기된 토큰/)
})

test('세션 쿠키 — 서명 왕복 · 위조 · 만료 · 권한은 매 요청 명부에서 · sudo 는 kind 가 다르다', () => {
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
  assert.equal(d.role, 'viewer')
  assert.equal(d.allow('alpha'), true)
  // 쿠키가 살아 있어도 명부에서 멈추면 끊긴다 — 권한을 쿠키에 담지 않았기 때문이다
  auth.userSet(db, 'qa', { active: false })
  assert.equal(auth.decideSession(db, s).message, '사용 중지된 사용자')
  assert.equal(auth.decideSession(db, null).status, 401)
  auth.userSet(db, 'qa', { active: true })

  // 쿠키의 tid — 권한이 아니라 만료를 말하는 표지다. 모르면 null(지어내지 않는다)
  assert.equal(auth.decideSession(db, s).expiresInDays, null, 'tid 없는 옛 쿠키')
  assert.equal(auth.decideSession(db, s).tokenExpires, null)
  const { rec } = auth.issue(db, { user: 'qa', expiresDays: 30, now: NOW })
  const c2 = auth.signSession(secret, 'qa', { now: NOW, tid: rec.sha256.slice(0, 8) })
  const s2 = auth.readSession(secret, c2, NOW)
  assert.equal(s2.tid, rec.sha256.slice(0, 8))
  const d2 = auth.decideSession(db, s2, NOW)
  assert.equal(d2.tokenExpires, rec.expires)
  assert.equal(typeof d2.expiresInDays, 'number')
  auth.revoke(db, { id: rec.sha256.slice(0, 8) })
  assert.equal(auth.decideSession(db, s2, NOW).tokenExpires, null, '폐기한 토큰의 만료는 말하지 않는다')
  assert.equal(auth.decideSession(db, s2, NOW).ok, true, '판정은 그대로 명부만 본다')

  // 재인증 쿠키 — 15분 · kind: sudo. 세션 자리에 내밀어도 안 통하고, 그 반대도 같다
  const su = auth.signSession(secret, 'kjsa', { now: NOW, minutes: auth.SUDO_MINUTES, kind: 'sudo' })
  assert.equal(auth.readSession(secret, su, NOW, { kind: 'sudo' }).exp, NOW + 15 * 60_000)
  assert.equal(auth.readSession(secret, su, NOW + 16 * 60_000, { kind: 'sudo' }), null, '15분 뒤')
  assert.equal(auth.readSession(secret, su, NOW), null, 'sudo 쿠키는 세션이 아니다')
  assert.equal(auth.readSession(secret, c, NOW, { kind: 'sudo' }), null, '세션 쿠키는 sudo 가 아니다')
})

test('parseCookies', () => {
  assert.deepEqual(auth.parseCookies('a=1; cdp_s=x.y; b=%20'), { a: '1', cdp_s: 'x.y', b: ' ' })
  assert.deepEqual(auth.parseCookies(undefined), {})
})

test('load — v1.0 형식은 거절 · v1.1(write) 은 role 로 접힌다 · 저장은 v1.2', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-auth-'))
  try {
    const file = path.join(dir, 'auth.json')
    assert.deepEqual(await auth.load(file), { users: [], tokens: [] }, '없으면 빈 명부')

    await fs.writeFile(file, JSON.stringify({ users: [], tokens: [{ sha256: 'x', user: 'a', repos: ['*'] }] }))
    await assert.rejects(auth.load(file), /권한은 users\[\] 에만/)

    await fs.writeFile(file, '{ not json')
    await assert.rejects(auth.load(file), /JSON 이 아니다/)

    // v1.1 — write:true · 토큰에 id · status 없음
    await fs.writeFile(
      file,
      JSON.stringify({
        users: [
          { name: 'kjsa', label: '개발', active: true, repos: ['*'], write: true },
          { name: 'qa', active: true, repos: ['alpha'], write: false },
        ],
        tokens: [{ sha256: 'abcdef0123456789', user: 'kjsa', issued: '2026-09-21', expires: '2026-12-20', note: null }],
      })
    )
    const v11 = await auth.load(file)
    assert.equal(v11.users[0].role, 'writer', 'write:true → writer')
    assert.equal(v11.users[1].role, 'viewer')
    assert.equal('write' in v11.users[0], false)
    assert.equal(v11.tokens[0].id, 'abcdef01')
    assert.equal(v11.tokens[0].status, 'active')
    assert.equal(auth.admins(v11).length, 0, 'v1.1 명부에는 관리자가 없다 — 셸에서 올린다')

    // 저장하면 v1.2 다 — version 과 role
    await auth.store(file, v11)
    const raw = JSON.parse(await fs.readFile(file, 'utf8'))
    assert.equal(raw.version, '1.2')
    assert.equal(raw.users[0].role, 'writer')
    assert.equal('write' in raw.users[0], false)

    const { db } = fixture()
    await auth.store(file, db)
    const back = await auth.load(file)
    assert.equal(back.users.length, 3)
    assert.equal(back.tokens.length, 3)
    assert.equal(back.users[0].role, 'admin')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('부트스트랩 — 명부가 비면 코드가 생기고 · 맞는 코드만 통하고 · 명부가 생기면 지워진다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-boot-'))
  try {
    assert.equal(await auth.ensureBootstrap(null, auth.emptyDb()), null, 'data 폴더가 없으면 없다')
    const code = await auth.ensureBootstrap(dir, auth.emptyDb())
    assert.ok(code && code.length >= 24, code)
    assert.equal(await auth.ensureBootstrap(dir, auth.emptyDb()), code, '두 번 불러도 같은 코드')
    assert.equal(await auth.verifyBootstrap(dir, code), true)
    assert.equal(await auth.verifyBootstrap(dir, ' ' + code + '\n'), true, '앞뒤 공백은 지운다')
    assert.equal(await auth.verifyBootstrap(dir, code.slice(0, -1) + 'x'), false)
    assert.equal(await auth.verifyBootstrap(dir, ''), false)
    assert.equal(await auth.verifyBootstrap(dir, code + 'x'), false, '길이가 달라도 던지지 않는다')
    // 명부가 생기면 파일이 지워지고 그 뒤로는 어떤 코드도 안 통한다
    const { db } = fixture()
    assert.equal(await auth.ensureBootstrap(dir, db), null)
    assert.equal(await auth.verifyBootstrap(dir, code), false)
    await assert.rejects(fs.access(path.join(dir, 'bootstrap.code')))
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
