// 화면 v1.0 — 설치 한 줄(개편안 §6.3 · W5).
//
//   설치 한 줄     작업 레포 · 일괄 갱신 · 큐레이터 폴더가 한 함수(`lib/install.js`)로 짓는다

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installCommand, guessShell, SHELLS } from '../viewer/src/lib/install.js'

test('설치 한 줄 — 작업 레포 · 일괄 갱신 · 큐레이터 폴더가 한 함수로', () => {
  const o = 'http://cdp.example:7374'
  assert.deepEqual(SHELLS.map((s) => s.key), ['ps', 'cmd', 'sh'])
  // 큐레이터 폴더 — 등록 id 도 git 도 없다 · 그 폴더에서(.)
  assert.equal(installCommand('sh', { origin: o, repo: 'alpha', curator: true }), `curl -fsSLo /tmp/cdp-install.mjs ${o}/install.mjs && node /tmp/cdp-install.mjs --curator --repo alpha .`)
  assert.equal(
    installCommand('ps', { origin: o, repo: 'alpha', curator: true }),
    `curl.exe -fsSLo "$env:TEMP\\cdp-install.mjs" ${o}/install.mjs; if ($?) { node "$env:TEMP\\cdp-install.mjs" --curator --repo alpha . }`
  )
  assert.equal(installCommand('cmd', { origin: o, repo: 'alpha', curator: true }), `curl -fsSLo "%TEMP%\\cdp-install.mjs" ${o}/install.mjs && node "%TEMP%\\cdp-install.mjs" --curator --repo alpha .`)
  for (const sh of ['ps', 'cmd', 'sh']) assert.ok(!installCommand(sh, { origin: o, repo: 'alpha', curator: true }).includes('--workrepo'), `${sh} — 큐레이터 폴더는 대장에 오르지 않는다`)
  // 작업 레포 · 일괄 갱신 — 전과 같은 모양
  assert.match(installCommand('sh', { origin: o, repo: 'alpha', id: 'wr-1' }), / --repo alpha --workrepo wr-1 \.$/)
  assert.match(installCommand('sh', { origin: o, update: true }), / --update$/)
  // 토큰은 명령에 없다(§6.7.3)
  for (const args of [{ repo: 'alpha', curator: true }, { repo: 'alpha', id: 'x' }, { update: true }]) assert.ok(!/token|Bearer|CDP_TOKEN/i.test(installCommand('ps', { origin: o, ...args })))
  assert.equal(guessShell({ platform: 'Win32' }), 'ps')
  assert.equal(guessShell({ platform: 'MacIntel' }), 'sh')
  assert.equal(guessShell(null), 'sh')
})
