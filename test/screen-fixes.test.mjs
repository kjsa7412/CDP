// 실서버 종합 시험(2026-10-02)에서 나온 화면 쪽 고침 — 시험이 부를 수 있는 순수 함수만.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAudit } from '../viewer/src/lib/audit.js'
import { plainDetail } from '../viewer/src/lib/format.js'
import { noteServerDate, serverNow, clockSkew, skewText } from '../viewer/src/lib/clock.js'
import { Store } from '../core/store.js'

test('parseAudit — 콘솔 · 마법사 · 셸 · 작업 레포 대장(F6)', () => {
  const t = '2026-10-02T01:33:00.000Z'
  assert.deepEqual(parseAudit(`${t} · admin user add · kjsa · zz · role=writer`), { time: t, actor: 'kjsa', text: 'user add · zz · role=writer' })
  assert.equal(parseAudit(`${t} · setup · user add · kjsa · repos=*`).actor, '(마법사) kjsa')
  assert.equal(parseAudit(`${t} · init · token issue · kjsa · e2acfc63`).actor, '(셸)')
  // 접두 없는 대장 줄 — 옛 줄도 행위자를 찾는다
  const w = parseAudit(`${t} · workrepo add · kjsa · wr_3b3e11 · zz-test-app · zz-test`)
  assert.equal(w.actor, 'kjsa')
  assert.equal(w.text, 'workrepo add · wr_3b3e11 · zz-test-app · zz-test')
  assert.equal(parseAudit(`${t} · workrepo del · hong · wr_1 · a · gdi · 고아`).actor, 'hong')
})

test('plainDetail — 앞의 id 를 떼고 백틱을 벗긴다(W4 · L7)', () => {
  assert.equal(plainDetail('2026-0430-x 본문에 있는데 touches 에 없음', '2026-0430-x'), '본문에 있는데 touches 에 없음')
  assert.equal(plainDetail('docs/a.md `## rp_plnd_mst` 이 둘'), 'docs/a.md ## rp_plnd_mst 이 둘')
  assert.equal(plainDetail('다른 id 로 시작', '2026-x'), '다른 id 로 시작')
})

test('clock — 서버 Date 로 차를 재고 5분 넘게 어긋나면 말한다(F4)', () => {
  assert.equal(skewText(0), null)
  assert.equal(skewText(-4 * 60_000), null)
  assert.equal(skewText(-(2 * 3600_000 + 19 * 60_000)), '이 PC 시계가 서버보다 2시간 19분 빠르다')
  assert.equal(skewText(7 * 60_000), '이 PC 시계가 서버보다 7분 늦다')
  noteServerDate(new Date(Date.now() - 3600_000).toUTCString())
  assert.ok(Math.abs(clockSkew() + 3600_000) < 2000)
  assert.ok(Math.abs(serverNow() - (Date.now() - 3600_000)) < 2000)
  noteServerDate('그런 날짜 없음')
  assert.ok(Math.abs(clockSkew() + 3600_000) < 2000, '못 읽는 머리는 무시한다')
})

test('store.check — 서버형은 git 훅 경고를 내지 않는다(F7)', async () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'fixture')
  const local = new Store({ root, settings: { watch: false } })
  await local.load()
  local._git = { repo: true, hooksPath: null }
  const hasHooks = (s) => s.check().findings.some((f) => f.key === 'hooks-off' || /git 훅이 설치되지 않음/.test(f.label))
  assert.equal(hasHooks(local), true)
  const server = new Store({ root, settings: { watch: false, server: true } })
  await server.load()
  server._git = { repo: true, hooksPath: null }
  assert.equal(hasHooks(server), false)
})

test('kbd — Mac 이 아니면 Ctrl · Alt · Shift · Enter 로(F17)', async () => {
  const { kbd, isMac } = await import('../viewer/src/lib/keys.js')
  assert.equal(kbd('⌘K', false), 'Ctrl+K')
  assert.equal(kbd('⌥←', false), 'Alt+←')
  assert.equal(kbd('⇧⏎', false), 'Shift+Enter')
  assert.equal(kbd('⌘K', true), '⌘K')
  assert.equal(isMac('MacIntel'), true)
  assert.equal(isMac('Win32'), false)
})
