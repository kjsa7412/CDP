// 조립 — `ops/lib/assemble.mjs`.
//
// 설명서 걷기(2026-09-23)에서 잡은 것 — 조립이 `bin/ctx.cmd` 를 LF 로 바꿔 cmd.exe 에서
// 죽었다. `.mcp.json` 이 그 파일을 띄우므로 모드 A 의 MCP 가 통째로 빠지는 자리였는데,
// 하네스는 fixture 의(CRLF 로 추적되는) ctx.cmd 를 써서 못 봤다. 조립 결과를 직접 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { copyFileLF, assembleKnowledgeRepo, listPackages, ROOT } from '../ops/lib/assemble.mjs'

test('copyFileLF — md 는 LF 로 · .cmd 는 CRLF 바이트 그대로 · 이진은 그대로', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-asm-'))
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

test('assembleKnowledgeRepo — bin/ctx.cmd 는 번들의 것과 바이트까지 같고 · tools/ 는 .gitkeep 만 · 매니페스트는 안 나간다', async () => {
  const names = listPackages(ROOT)
  const ctxDir = path.join(ROOT, 'ops', 'out', 'ctx')
  const bundled = await fs.readFile(path.join(ctxDir, 'ctx.cmd')).catch(() => null)
  if (!names.length || !bundled) return // 번들이 없는 자리(build:ctx 전) — 조립 자체를 못 하니 건너뛴다
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-asm-'))
  try {
    const dest = path.join(d, names[0])
    const r = assembleKnowledgeRepo({ root: ROOT, name: names[0], dest, exe: null })
    assert.deepEqual(r.missing, [])
    assert.deepEqual(await fs.readFile(path.join(dest, 'bin', 'ctx.cmd')), bundled, 'ctx.cmd 가 바뀌었다')
    assert.ok((await fs.readFile(path.join(dest, 'bin', 'ctx.cmd'), 'latin1')).includes('\r\n'), 'CRLF 여야 한다')
    assert.deepEqual(await fs.readdir(path.join(dest, 'tools')), ['.gitkeep'])
    assert.equal(await fs.stat(path.join(dest, '_package.json')).catch(() => null), null)
    assert.ok(await fs.stat(path.join(dest, '_vocab.md')), '어휘가 들어온다')
    assert.ok(await fs.stat(path.join(dest, '.githooks', 'pre-commit')), '훅이 들어온다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
