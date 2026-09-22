// zip — `core/zip.js`. 꾸러미가 진짜 zip 이어야 한다(설계서 §6.7.3).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zip, unzip, crc32 } from '../core/zip.js'

test('crc32 — 알려진 값', () => {
  assert.equal(crc32(Buffer.from('')), 0)
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
})

test('zip → unzip 왕복 — 한글 이름 · 빈 파일 · 압축이 안 되는 것 · 순서 유지', async () => {
  const entries = [
    { name: 'kit/.claude/skills/cdp-load/SKILL.md', data: '# 스킬\n'.repeat(200) },
    { name: '설치.md', data: Buffer.from('안내') },
    { name: 'empty.txt', data: '' },
    // 무작위 바이트는 디플레이트가 되레 커진다 → method 0 으로 담긴다
    { name: 'bin.dat', data: Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 7919) % 256)) },
  ]
  const buf = await zip(entries, { now: new Date('2026-09-22T10:00:00') })
  assert.equal(buf.readUInt32LE(0), 0x04034b50, '로컬 헤더 시그니처')
  const back = await unzip(buf)
  assert.deepEqual(
    back.map((e) => e.name),
    entries.map((e) => e.name)
  )
  for (let i = 0; i < entries.length; i++) {
    const want = Buffer.isBuffer(entries[i].data) ? entries[i].data : Buffer.from(entries[i].data)
    assert.ok(back[i].data.equals(want), entries[i].name)
  }
})

test('zip — 결정론: 같은 입력 · 같은 시각이면 바이트까지 같다', async () => {
  const e = [{ name: 'a.txt', data: 'x'.repeat(100) }]
  const now = new Date('2026-01-01T00:00:00')
  assert.ok((await zip(e, { now })).equals(await zip(e, { now })))
})

test('unzip — zip 이 아니면 던진다 · 경로는 그대로 낸다 (막는 것은 부르는 쪽)', async () => {
  await assert.rejects(unzip(Buffer.from('not a zip at all')), /EOCD/)
  const buf = await zip([{ name: '../탈출.md', data: 'x' }])
  const [f] = await unzip(buf)
  assert.equal(f.name, '../탈출.md', 'zip 은 형식이고 판단은 setup-server 가 한다')
})
