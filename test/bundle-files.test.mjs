// 산출물에 담는 파일 — `ops/lib/bundle-files.mjs`. v1.0 개편안 §8.2.
//
// `.cmd` 를 LF 로 바꾸면 cmd.exe 에서 죽는다(2026-09-23 실측) — 복사 규칙을 직접 본다. 그리고 서버 산출물의
// `kit/` 이 `core/kit.js` 가 읽는 모양(스킬 다섯 · CLAUDE 블록 둘)인지 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { copyFileLF, copyKit, ROOT } from '../ops/lib/bundle-files.mjs'
import { kitFiles } from '../core/kit.js'

test('copyFileLF — md 는 LF 로 · .cmd 는 CRLF 바이트 그대로 · 이진은 그대로', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-bf-'))
  try {
    await fs.writeFile(path.join(d, 'a.md'), '# 제목\r\n본문\r\n')
    await fs.writeFile(path.join(d, 'x.cmd'), '@echo off\r\nif exist "%~dp0ctx.mjs" (\r\n  node "%~dp0ctx.mjs" %*\r\n)\r\n')
    await fs.writeFile(path.join(d, 'b.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    copyFileLF(path.join(d, 'a.md'), path.join(d, 'a2.md'))
    copyFileLF(path.join(d, 'x.cmd'), path.join(d, 'x2.cmd'))
    copyFileLF(path.join(d, 'b.png'), path.join(d, 'b2.png'))
    assert.equal(await fs.readFile(path.join(d, 'a2.md'), 'utf8'), '# 제목\n본문\n')
    assert.deepEqual(await fs.readFile(path.join(d, 'x2.cmd')), await fs.readFile(path.join(d, 'x.cmd')), '.cmd 는 CRLF 그대로')
    assert.deepEqual(await fs.readFile(path.join(d, 'b2.png')), await fs.readFile(path.join(d, 'b.png')))
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('copyKit — 산출물 kit/ 은 스킬 다섯과 CLAUDE 블록 둘 · core/kit.js 가 그대로 읽어 소스와 같은 해시를 낸다', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-bf-'))
  try {
    const r = copyKit(ROOT, path.join(d, 'kit'))
    assert.deepEqual(r.missing, [])
    assert.deepEqual(r.skills, ['cdp-curate', 'cdp-push', 'cdp-registry', 'cdp-save', 'cdp-work'])
    for (const role of ['writer', 'curator']) {
      const shipped = await kitFiles({ role, explicit: path.join(d, 'kit') })
      const source = await kitFiles({ role, explicit: path.join(ROOT, 'agent') })
      assert.equal(shipped.hash, source.hash, role + ' kit 해시가 소스와 같다')
      assert.deepEqual(shipped.skills, source.skills)
    }
    assert.deepEqual((await kitFiles({ role: 'writer', explicit: path.join(d, 'kit') })).skills, ['cdp-push', 'cdp-save', 'cdp-work'])
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
