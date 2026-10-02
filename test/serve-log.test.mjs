// serve.log 의 레포 칸 — 실서버 종합 시험 F2.
//
// MCP save 가 `repo` 인자로 주소(/mcp/<레포>)와 다른 레포에 쓰면 로그가 주소 레포를 적어 콘솔 최근 기록이 거짓이었다.
// 이제 레포 칸 = 실제로 쓴 레포, 다르면 `실제←주소`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { logRepo, parseSaveLine, saveStats } from '../viewer/bin/ctx-mcp-serve.mjs'

test('logRepo — 같으면 하나 · 다르면 실제←주소 · 저장이 아니면 주소', () => {
  assert.equal(logRepo('gdi', 'gdi'), 'gdi')
  assert.equal(logRepo('gdi', 'dpms_wiki'), 'dpms_wiki←gdi')
  assert.equal(logRepo('gdi', undefined), 'gdi')
  assert.equal(logRepo(undefined, 'alpha'), 'alpha')
  assert.equal(logRepo(undefined, undefined), '-')
  assert.equal(logRepo(encodeURIComponent('한글'), undefined), '한글')
})

test('parseSaveLine — 화살표를 가르고 옛 줄도 읽는다', () => {
  const line = (repo, code = '200') => `2026-10-01T23:04:05.928Z · kjsa · ${repo} · tools/call · save · 2026-1002-x · 3697ms · ${code} · 10.10.125.187 · e2acfc63`
  assert.deepEqual(
    { ...parseSaveLine(line('dpms_wiki←gdi')), at: undefined },
    { at: undefined, user: 'kjsa', repo: 'dpms_wiki', via: 'gdi', id: '2026-1002-x', result: 'ok', ms: 3697 }
  )
  const old = parseSaveLine(line('gdi', 'E_CHECK'))
  assert.equal(old.repo, 'gdi')
  assert.equal(old.via, null)
  assert.equal(old.result, 'E_CHECK')
  assert.equal(parseSaveLine('2026-10-01T23:04:05Z · kjsa · gdi · tools/call · where · x · 3ms · 200 · ip · -'), null)
})

test('saveStats — 주소와 다른 레포에 쓴 save 를 7일 안에서 한 번씩 센다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-log-'))
  await fs.mkdir(path.join(dir, 'logs'))
  const now = Date.parse('2026-10-02T00:00:00Z')
  const at = (h) => new Date(now - h * 3600_000).toISOString()
  const l = (t, repo) => `${t} · kjsa · ${repo} · tools/call · save · id · 10ms · 200 · ip · tid`
  await fs.writeFile(
    path.join(dir, 'logs', 'serve.log'),
    [l(at(24 * 9), 'beta←alpha'), l(at(3), 'gdi'), l(at(2), 'dpms_wiki←gdi'), l(at(1), 'dpms_wiki←gdi')].join('\n') + '\n'
  )
  const s = await saveStats(dir, { now })
  assert.deepEqual(s.mismatch7d.map((m) => [m.via, m.repo]), [['gdi', 'dpms_wiki']])
  assert.equal(s.total24h, 3)
  assert.equal(s.recent[0].via, 'gdi')
  await fs.rm(dir, { recursive: true, force: true })
})

test('oneLine — 레포 한 줄 설명: 인용 · 링크 · 강조를 벗기고 낱말에서 자른다(W2)', async () => {
  const { oneLine } = await import('../viewer/bin/ctx-mcp-serve.mjs')
  assert.equal(oneLine('> **public-si** 패키지에서 세웠다'), 'public-si 패키지에서 세웠다')
  assert.equal(oneLine('[설명서](docs/a.md) 를 본다'), '설명서 를 본다')
  const long = '경상북도 연구원 연구관리시스템(GDI) 구축 프로젝트의 지식 레포. 화면 설계서와 테이블 정의서를 정본으로 두고 화면 하나를 고칠 때마다 작업 기록을 남기며 좌표로 잇는다'
  assert.equal(oneLine(long), '경상북도 연구원 연구관리시스템(GDI) 구축 프로젝트의 지식 레포.')
  const r = oneLine('가나다 '.repeat(30))
  assert.ok(r.endsWith('…') && !/가나$/.test(r.replace('…', '')), r)
})
