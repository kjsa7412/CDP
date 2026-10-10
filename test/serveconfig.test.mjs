// serve.json — 설정 한 장(제품화 2 ④ F5). 명령줄이 이기고 빈 칸만 채운다 · 자리 순서.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findServeConfig, applyServeConfig } from '../viewer/bin/ctx-config.mjs'

test('applyServeConfig — 준 플래그는 그대로 · 빈 칸만', () => {
  const o = applyServeConfig({ cmd: 'serve', port: '9000', auth: undefined }, { root: '/r', auth: '/a.json', port: 7374, bind: '10.0.0.1', unknown: 1 })
  assert.equal(o.port, '9000')
  assert.equal(o.auth, '/a.json')
  assert.equal(o.root, '/r')
  assert.equal(o.bind, '10.0.0.1')
  assert.equal(o.unknown, undefined)
})

test('findServeConfig — --config → CDP_SERVE_CONFIG → 번들 옆 · 없는 --config 는 오류 · 없으면 null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-conf-'))
  await fs.mkdir(path.join(dir, 'bin'))
  assert.equal(await findServeConfig({ env: {}, binDir: path.join(dir, 'bin') }), null)
  await fs.writeFile(path.join(dir, 'serve.json'), JSON.stringify({ root: '/x' }))
  assert.equal((await findServeConfig({ env: {}, binDir: path.join(dir, 'bin') })).cfg.root, '/x')
  const other = path.join(dir, 'o.json')
  await fs.writeFile(other, JSON.stringify({ root: '/y' }))
  assert.equal((await findServeConfig({ env: { CDP_SERVE_CONFIG: other }, binDir: path.join(dir, 'bin') })).cfg.root, '/y')
  await assert.rejects(findServeConfig({ explicit: path.join(dir, 'none.json'), env: {} }), /없다/)
  await fs.writeFile(path.join(dir, 'bad.json'), '{')
  await assert.rejects(findServeConfig({ explicit: path.join(dir, 'bad.json'), env: {} }), /JSON/)
  await fs.rm(dir, { recursive: true, force: true })
})
