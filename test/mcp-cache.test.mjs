// MCP 레포 캐시 — `viewer/bin/ctx-mcp.mjs` 의 makeRepoCache · headSha.
//
// 전에는 스탬프가 `.git/HEAD` 의 mtime 과 `docs/` · `work/` **맨 위** md 만 봤다. `.git/HEAD` 는 가지 이름만 적힌
// 파일이라 커밋에도 안 바뀌고, public-si 레포는 관리 문서 40/40 이 하위 폴더(`docs/1.관리/…`)에 있다 — 그래서
// 하위 폴더 문서만 바뀐 커밋 뒤 `section` 이 옛 본문을 냈다(v1.0 개편안 §5.1). 이제 HEAD 의 sha 를 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { makeRepoCache, headSha } from '../viewer/bin/ctx-mcp.mjs'
import { toolSection } from '../core/tools.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'

test('makeRepoCache — 하위 폴더 문서만 바뀐 커밋 뒤에도 새 본문을 낸다 · headSha 는 커밋마다 바뀐다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const r = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-cache-'))
  try {
    await fs.mkdir(path.join(r, 'docs', '1.관리'), { recursive: true })
    await fs.mkdir(path.join(r, 'work'), { recursive: true })
    await fs.writeFile(path.join(r, '_vocab.md'), ['# 어휘', '', '## table', '', '- `table:a` — 에이', ''].join(NL))
    await fs.writeFile(path.join(r, '_managed.md'), ['| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/1.관리/t.md` | `## {값}` |', ''].join(NL))
    const doc = (body) => ['# T', '', '## a — 에이', '<!-- applied: null -->', '', body, ''].join(NL)
    await fs.writeFile(path.join(r, 'docs', '1.관리', 't.md'), doc('처음 본문.'))
    await g(r, 'init', '-q')
    await g(r, 'add', '-A')
    await g(r, 'commit', '-qm', 'seed')
    const sha0 = await headSha(r)
    assert.match(sha0, /^[0-9a-f]{40}$/)

    const cache = makeRepoCache(r)
    assert.match(toolSection(await cache(), { coord: 'table:a' }).content, /처음 본문/)

    // 하위 폴더 문서만 고친 커밋 — 맨 위 md 도 _vocab · _managed 도 그대로다(옛 스탬프가 보던 것은 하나도 안 바뀐다)
    await fs.writeFile(path.join(r, 'docs', '1.관리', 't.md'), doc('고친 본문 — 길이도 다르다.'))
    await g(r, 'commit', '-qam', 'edit')
    assert.notEqual(await headSha(r), sha0)
    assert.match(toolSection(await cache(), { coord: 'table:a' }).content, /고친 본문/)
  } finally {
    await fs.rm(r, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
