// ctx up · self-update 의 조각 — 포트 고르기 · 서비스 파일 · 명령 자리(제품화 2 ③). 끝까지 도는 것은 하네스가 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { portFree, stableBin } from '../viewer/bin/ctx-up.mjs'
import { writeShim } from '../viewer/bin/ctx-selfupdate.mjs'

test('portFree — 듣는 포트는 false · 닫으면 true', async () => {
  const s = net.createServer()
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  const port = s.address().port
  assert.equal(await portFree(port), false)
  await new Promise((r) => s.close(r))
  assert.equal(await portFree(port), true)
})

test('stableBin — ~/.cdp/server/current 가 같은 파일이면 그 자리(판이 바뀌어도 서비스가 산다)', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-up-'))
  const v = path.join(home, '.cdp', 'server', 'v9', 'bin')
  await fs.mkdir(v, { recursive: true })
  await fs.writeFile(path.join(v, 'ctx.mjs'), '//')
  await fs.symlink('v9', path.join(home, '.cdp', 'server', 'current'))
  assert.equal(stableBin(path.join(v, 'ctx.mjs'), home), path.join(home, '.cdp', 'server', 'current', 'bin', 'ctx.mjs'))
  assert.equal(stableBin('/elsewhere/ctx.mjs', home), path.resolve('/elsewhere/ctx.mjs'))
  await fs.rm(home, { recursive: true, force: true })
})

test('writeShim — ~/.cdp/bin/ctx 가 current 를 부른다 · PATH 에 없으면 넣을 한 줄', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-shim-'))
  const a = await writeShim({ home, platform: 'linux', env: { PATH: '/usr/bin', SHELL: '/bin/zsh' } })
  assert.equal(a.added, true)
  assert.equal(a.onPath, false)
  assert.match(a.pathLine, /\.zshrc/)
  assert.match(await fs.readFile(a.file, 'utf8'), /server[\\/]current[\\/]bin[\\/]ctx\.mjs/)
  const b = await writeShim({ home, platform: 'linux', env: { PATH: '/usr/bin:' + path.join(home, '.cdp', 'bin') } })
  assert.equal(b.added, false)
  assert.equal(b.onPath, true)
  await fs.rm(home, { recursive: true, force: true })
})
