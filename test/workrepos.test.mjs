// 설치 대장 — `core/workrepos.js`. MCP 설계서 §6.7.2.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as wr from '../core/workrepos.js'

const ctx = { users: ['kjsa', 'qa'], repos: ['alpha', 'beta'] }

test('add — 이름 형식 · 없는 지식 레포 · 명부 밖 담당자 · 중복', () => {
  const db = { repos: [] }
  assert.throws(() => wr.add(db, { name: '', knowledge: 'alpha' }, ctx), /이름 형식/)
  assert.throws(() => wr.add(db, { name: 'a/b', knowledge: 'alpha' }, ctx), /이름 형식/)
  assert.throws(() => wr.add(db, { name: 'x', knowledge: 'gamma' }, ctx), /그런 지식 레포가 없다/)
  assert.throws(() => wr.add(db, { name: 'x', knowledge: 'alpha', owner: '없는사람' }, ctx), /명부에 없는 담당자/)

  const row = wr.add(db, { name: 'my-app', knowledge: 'alpha', owner: 'kjsa', note: '프런트' }, ctx)
  assert.match(row.id, /^wr_[0-9a-f]{6}$/)
  assert.equal(row.applied, null)
  assert.equal(row.owner, 'kjsa')
  // 담당자는 없어도 된다 — 등록은 관문이 아니다
  const noOwner = wr.add(db, { name: 'ops-bot', knowledge: 'alpha' }, ctx)
  assert.equal(noOwner.owner, null)
  assert.throws(() => wr.add(db, { name: 'my-app', knowledge: 'alpha' }, ctx), (e) => e.code === 'E_EXISTS')
  // 같은 이름이라도 다른 지식 레포면 다른 등록이다
  wr.add(db, { name: 'my-app', knowledge: 'beta' }, ctx)
  assert.equal(db.repos.length, 3)
})

test('applied · state — 최신 · 낡음 · 미설치', () => {
  const db = { repos: [] }
  const row = wr.add(db, { name: 'x', knowledge: 'alpha' }, ctx)
  assert.equal(wr.state(row, 'a3f19c'), '미설치')
  wr.applied(db, row.id, { kit: 'a3f19c', by: 'kjsa' })
  assert.equal(row.applied.by, 'kjsa')
  assert.match(row.applied.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(wr.state(row, 'a3f19c'), '최신')
  assert.equal(wr.state(row, 'ffffff'), '낡음')
  assert.throws(() => wr.applied(db, 'wr_nope', { kit: 'x', by: 'y' }), (e) => e.code === 'E_NOT_FOUND')

  const listed = wr.list(db, { kits: { alpha: 'ffffff' } })
  assert.equal(listed[0].state, '낡음')
  assert.equal(listed[0].kitNow, 'ffffff')
  assert.equal(wr.list(db)[0].state, '낡음', '서버 kit 을 모르면 최신일 수 없다')
})

test('remove — 없는 등록은 던진다', () => {
  const db = { repos: [] }
  const row = wr.add(db, { name: 'x', knowledge: 'alpha' }, ctx)
  wr.remove(db, row.id)
  assert.equal(db.repos.length, 0)
  assert.throws(() => wr.remove(db, row.id), (e) => e.code === 'E_NOT_FOUND')
})

// 실서버 종합 시험 F5 — 레포를 휴지통으로 보낸 뒤 남은 등록은 표지가 있어야 지울 수 있다
test('list — known 을 주면 지식 레포가 없어진 등록에 orphan', () => {
  const db = { repos: [] }
  wr.add(db, { name: 'a', knowledge: 'alpha' }, ctx)
  wr.add(db, { name: 'b', knowledge: 'beta' }, ctx)
  const rows = wr.list(db, { known: ['alpha'] })
  assert.deepEqual(rows.map((r) => [r.name, r.orphan]), [['a', false], ['b', true]])
  // known 이 없으면 표지를 달지 않는다(옛 호출 그대로)
  assert.equal('orphan' in wr.list(db)[0], false)
})
