// core/localreg — 이 PC 의 설치 목록. 에이전트 세팅 갱신 TODO T9.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { regFile, loadReg, saveReg, record, forServer, forget, samePath } from '../core/localreg.js'

test('regFile — CDP_CONFIG_DIR · Windows %APPDATA% · 그 밖 ~/.config/cdp', () => {
  assert.equal(regFile({ env: { CDP_CONFIG_DIR: '/x/cfg' }, platform: 'linux', home: '/h' }), path.join('/x/cfg', 'workrepos.json'))
  assert.equal(regFile({ env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\a' }), path.join('C:\\Users\\a\\AppData\\Roaming', 'cdp', 'workrepos.json'))
  assert.equal(regFile({ env: {}, platform: 'darwin', home: '/Users/a' }), path.join('/Users/a', '.config', 'cdp', 'workrepos.json'))
})

test('record — 경로가 열쇠 · 다시 설치하면 바꿔 쓴다 · 서버 끝 / 는 같다 · Windows 는 대소문자 무시', () => {
  const db = { entries: [] }
  record(db, { server: 'http://s:7374/', repo: 'alpha', workrepo: 'wr_1', path: 'C:\\Work\\App', kit: 'aaa111' }, 'win32')
  record(db, { server: 'http://s:7374', repo: 'alpha', workrepo: 'wr_1', path: 'c:\\work\\app\\', kit: 'bbb222' }, 'win32')
  record(db, { server: 'http://other:1', repo: 'beta', workrepo: 'wr_2', path: 'C:\\Work\\Lib' }, 'win32')
  assert.equal(db.entries.length, 2)
  assert.equal(db.entries[0].kit, 'bbb222')
  assert.equal(db.entries[0].server, 'http://s:7374')
  assert.deepEqual(forServer(db, 'http://s:7374/').map((e) => e.repo), ['alpha'])
  assert.equal(samePath('/a/B', '/a/b', 'linux'), false)
  assert.equal(forget(db, 'C:\\WORK\\LIB', 'win32'), true)
  assert.equal(db.entries.length, 1)
})

test('loadReg · saveReg — 없으면 빈 목록 · 깨졌으면 옆으로 치우고 빈 목록(설치를 막지 않는다) · 다시 읽힌다', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-reg-'))
  try {
    const f = path.join(d, 'sub', 'workrepos.json')
    assert.deepEqual(await loadReg(f), { entries: [] })
    const db = { entries: [] }
    record(db, { server: 'http://s', repo: 'alpha', workrepo: 'wr_1', path: d, kit: 'k' })
    await saveReg(db, f)
    const back = await loadReg(f)
    assert.equal(back.entries.length, 1)
    assert.equal(back.entries[0].repo, 'alpha')
    await fs.writeFile(f, '{ 깨짐')
    const broken = await loadReg(f)
    assert.equal(broken.broken, true)
    assert.deepEqual(broken.entries, [])
    const left = await fs.readdir(path.dirname(f))
    assert.ok(left.some((n) => n.startsWith('workrepos.json.broken-')), left.join(' '))
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('제품화 2 — 루프백 별칭은 같은 서버(F13) · kind(work · curator · folder)', async () => {
  const { normServer } = await import('../core/localreg.js')
  assert.equal(normServer('http://localhost:7400/'), 'http://127.0.0.1:7400')
  assert.equal(normServer('http://[::1]:7400'), 'http://127.0.0.1:7400')
  assert.equal(normServer('http://localhostx:1'), 'http://localhostx:1')
  const db = { entries: [] }
  record(db, { server: 'http://localhost:7400', repo: 'a', path: '/w/a' }, 'linux')
  record(db, { server: 'http://127.0.0.1:7400', repo: 'a', path: '/w/cur', kind: 'curator' }, 'linux')
  record(db, { server: 'http://127.0.0.1:7400', repo: 'a', path: '/w/sk', kind: 'nope' }, 'linux')
  assert.deepEqual(forServer(db, 'http://localhost:7400').map((e) => e.kind), ['work', 'curator', 'work'])
})
