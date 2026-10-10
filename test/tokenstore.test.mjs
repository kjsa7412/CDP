// 토큰을 이 PC 에 두는 것 — `core/tokenstore.js`. 설치 한 줄 TODO I4.
//
// Windows 쪽(사용자 환경변수)은 이 PC 의 레지스트리를 건드리므로 여기서 돌리지 않는다 —
// 이름 검사만 본다. 실측은 TODO 「나온 것」.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { saveTokenPosix, saveTokenWindows, rcFile, storeLabel, RC_LINE, RC_MARK } from '../core/tokenstore.js'

const tmpHome = () => fs.mkdtemp(path.join(os.tmpdir(), 'cdp-home-'))

test('saveTokenPosix — 원문은 600 파일에 · rc 에는 읽는 한 줄만', async () => {
  const home = await tmpHome()
  await fs.writeFile(path.join(home, '.zshrc'), 'alias ll="ls -l"')
  const r = await saveTokenPosix('  tok-abc  ', { home, shell: '/bin/zsh' })
  assert.equal(await fs.readFile(r.file, 'utf8'), 'tok-abc\n')
  if (process.platform !== 'win32') assert.equal((await fs.stat(r.file)).mode & 0o777, 0o600)
  const rc = await fs.readFile(path.join(home, '.zshrc'), 'utf8')
  assert.equal(rc, 'alias ll="ls -l"\n' + RC_LINE + '\n', '원래 줄 뒤에 줄바꿈하고 한 줄')
  assert.ok(!rc.includes('tok-abc'), 'rc 에 원문이 있다')
  assert.equal(r.added, true)
})

test('saveTokenPosix — 두 번 두면 파일만 바뀌고 rc 줄은 하나', async () => {
  const home = await tmpHome()
  await saveTokenPosix('one', { home, shell: '/bin/bash' })
  const r = await saveTokenPosix('two', { home, shell: '/bin/bash' })
  assert.equal(r.added, false)
  assert.equal(await fs.readFile(r.file, 'utf8'), 'two\n')
  const rc = await fs.readFile(path.join(home, '.bashrc'), 'utf8')
  assert.equal(rc.split(RC_MARK).length - 1, 1)
})

test('rcFile · storeLabel — zsh 면 .zshrc · 나머지는 .bashrc · Windows 는 환경변수', () => {
  assert.equal(path.basename(rcFile({ shell: '/usr/bin/zsh', home: '/h' })), '.zshrc')
  assert.equal(path.basename(rcFile({ shell: '/bin/bash', home: '/h' })), '.bashrc')
  assert.equal(path.basename(rcFile({ shell: '', home: '/h' })), '.bashrc')
  assert.match(storeLabel({ platform: 'win32' }), /사용자 환경변수 CDP_TOKEN/)
  assert.match(storeLabel({ platform: 'darwin', shell: '/bin/zsh', home: '/h' }), /\.config\/cdp\/token.*\.zshrc/)
})

test('saveTokenWindows — 변수 이름이 이상하면 PowerShell 을 부르기 전에 멈춘다', () => {
  assert.throws(() => saveTokenWindows('x', { name: "A'); Remove-Item x; ('" }), /변수 이름/)
})

test('제품화 2 S2 — loadToken: CDP_CONFIG_DIR · ~/.config/cdp/token · 없으면 null · 폴더는 0700', async () => {
  const { loadToken, saveTokenPosix } = await import('../core/tokenstore.js')
  const fsp = (await import('node:fs/promises')).default
  const osm = (await import('node:os')).default
  const p = (await import('node:path')).default
  const home = await fsp.mkdtemp(p.join(osm.tmpdir(), 'cdp-tk-'))
  assert.equal(await loadToken({ platform: 'linux', home, env: {} }), null)
  await saveTokenPosix('abc123', { home, shell: '/bin/zsh' })
  assert.equal((await loadToken({ platform: 'linux', home, env: {} })).token, 'abc123')
  assert.equal((await fsp.stat(p.join(home, '.config', 'cdp'))).mode & 0o777, 0o700)
  const cfg = p.join(home, 'cfg')
  await fsp.mkdir(cfg)
  assert.equal(await loadToken({ platform: 'linux', home, env: { CDP_CONFIG_DIR: cfg } }), null)
  await fsp.writeFile(p.join(cfg, 'token'), 'zzz\n')
  assert.equal((await loadToken({ platform: 'linux', home, env: { CDP_CONFIG_DIR: cfg } })).token, 'zzz')
  await fsp.rm(home, { recursive: true, force: true })
})
