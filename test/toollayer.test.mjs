// core/toollayer — 지식 레포의 도구 층(에이전트 세팅)을 배포본의 판으로. 에이전트 세팅 갱신 TODO T1~T6.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { planToolLayer, refreshToolLayer, describe } from '../core/toollayer.js'
import { kitHash } from '../core/setup.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])

async function put(root, rel, text) {
  const p = path.join(root, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, text)
}
const read = (root, rel) => fs.readFile(path.join(root, rel), 'utf8').catch(() => null)
const exists = (p) => fs.access(p).then(() => true).catch(() => false)
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()

async function setup() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-tool-'))
  const from = path.join(d, 'pkg')
  await put(from, '.claude/skills/cdp-a/SKILL.md', '새 a\n')
  await put(from, '.claude/skills/cdp-b/SKILL.md', '새 b\n')
  await put(from, '.claude/work-repo/CLAUDE.md', '작업 레포 규약 새판\n')
  await put(from, 'CLAUDE.md', '지식 레포 규약 새판\n')
  await put(from, 'TEMPLATE-work.md', '템플릿 새판\n')
  await put(from, 'bin/ctx.mjs', '// 새 번들\n')
  await put(from, '_vocab.md', '# 패키지 어휘 — 레포에 가면 안 된다\n')

  const repo = path.join(d, 'alpha')
  await put(repo, '_vocab.md', '# 레포 어휘\n')
  await put(repo, '.claude/skills/cdp-a/SKILL.md', '옛 a\n')
  await put(repo, '.claude/skills/cdp-old/SKILL.md', '판에서 빠진 스킬\n')
  await put(repo, '.claude/skills/my-skill/SKILL.md', '레포가 따로 둔 스킬\n')
  await put(repo, '.claude/work-repo/CLAUDE.md', '작업 레포 규약 새판\n')
  await put(repo, 'CLAUDE.md', '지식 레포 규약 옛판\n')
  await put(repo, 'bin/ctx.mjs', '// 새 번들\r\n') // 줄바꿈만 다르다 — 같은 것으로 본다
  await put(repo, '.gitattributes', '* -text\n')
  await g(repo, 'init', '-q')
  await g(repo, 'config', 'core.autocrlf', 'false')
  await g(repo, 'add', '-A')
  await g(repo, 'commit', '-qm', 'seed')
  return { d, from, repo, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

test('planToolLayer — 도구 층만 · cdp-* 만 지운다 · 줄바꿈만 다른 것은 같다 · 지식은 안 본다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    const { changes, same } = await planToolLayer(S.repo, S.from)
    const by = Object.fromEntries(changes.map((c) => [c.path, c.op]))
    assert.deepEqual(by, {
      '.claude/skills/cdp-a/SKILL.md': 'update',
      '.claude/skills/cdp-b/SKILL.md': 'create',
      '.claude/skills/cdp-old/SKILL.md': 'delete',
      'CLAUDE.md': 'update',
      'TEMPLATE-work.md': 'create',
    })
    assert.equal(same, 2, 'work-repo/CLAUDE.md · bin/ctx.mjs(CRLF)')
  } finally {
    await S.rm()
  }
})

test('refreshToolLayer — 한 커밋 · 판에서 빠진 스킬 폴더까지 치운다 · 레포 스킬과 어휘는 그대로 · kit 해시가 바뀐다 · 두 번째는 same', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    const k0 = (await kitHash(S.repo)).hash
    const r = await refreshToolLayer(S.repo, S.from, { message: (c) => `에이전트 세팅 갱신 — 시험 ${c.length}건` })
    assert.equal(r.state, 'updated')
    assert.ok(r.commit)
    assert.equal(r.changes.length, 5)
    assert.equal(await read(S.repo, '.claude/skills/cdp-a/SKILL.md'), '새 a\n')
    assert.equal(await read(S.repo, 'TEMPLATE-work.md'), '템플릿 새판\n')
    assert.equal(await exists(path.join(S.repo, '.claude/skills/cdp-old')), false, '빈 폴더가 남으면 collectKit 이 센다')
    assert.equal(await read(S.repo, '.claude/skills/my-skill/SKILL.md'), '레포가 따로 둔 스킬\n')
    assert.equal(await read(S.repo, '_vocab.md'), '# 레포 어휘\n')
    assert.equal(await porcelain(S.repo), '')
    const msg = (await run('git', ['-C', S.repo, 'log', '-1', '--format=%s|%an'])).stdout.trim()
    assert.equal(msg, '에이전트 세팅 갱신 — 시험 5건|cdp')
    assert.notEqual((await kitHash(S.repo)).hash, k0, '작업 레포 대장이 낡음을 알 수 있어야 한다')
    const again = await refreshToolLayer(S.repo, S.from)
    assert.equal(again.state, 'same')
    assert.equal(describe(again), '최신')
  } finally {
    await S.rm()
  }
})

test('refreshToolLayer — dry 는 안 쓴다 · 더러운 트리는 건너뛴다(아무것도 안 쓴다)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    const d = await refreshToolLayer(S.repo, S.from, { dry: true })
    assert.equal(d.state, 'dry')
    assert.equal(await read(S.repo, 'CLAUDE.md'), '지식 레포 규약 옛판\n')
    await put(S.repo, 'docs/남의손.md', '커밋 안 된 것\n')
    const r = await refreshToolLayer(S.repo, S.from)
    assert.equal(r.state, 'skipped')
    assert.equal(r.reason, 'dirty')
    assert.equal(await read(S.repo, 'CLAUDE.md'), '지식 레포 규약 옛판\n')
    assert.match(describe(r), /트리 되돌리기/)
  } finally {
    await S.rm()
  }
})

test('refreshToolLayer — origin 이 앞서 있으면 건너뛴다(갈라지지 않게)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    const bare = path.join(S.d, 'origin.git')
    await run('git', ['init', '-q', '--bare', bare])
    await g(S.repo, 'remote', 'add', 'origin', bare)
    await g(S.repo, 'push', '-q', '-u', 'origin', 'HEAD')
    const other = path.join(S.d, 'other')
    await run('git', ['clone', '-q', bare, other])
    await put(other, 'work/남.md', '밖에서 쓴 것\n')
    await g(other, 'add', '-A')
    await g(other, 'commit', '-qm', 'outside')
    await g(other, 'push', '-q')
    await g(S.repo, 'fetch', '-q')
    const r = await refreshToolLayer(S.repo, S.from)
    assert.equal(r.state, 'skipped')
    assert.equal(r.reason, 'behind')
    assert.match(describe(r), /origin 과 맞추기/)
  } finally {
    await S.rm()
  }
})

test('refreshToolLayer — 훅이 막으면 되돌린다 · 색인도 비운다 · 트리 깨끗', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    await put(S.repo, '.hooks-test/pre-commit', '#!/bin/sh\necho 막는다 >&2\nexit 1\n')
    await fs.chmod(path.join(S.repo, '.hooks-test/pre-commit'), 0o755)
    await g(S.repo, 'add', '-A')
    await g(S.repo, 'commit', '-qm', 'hook')
    await g(S.repo, 'config', 'core.hooksPath', '.hooks-test')
    const head0 = (await run('git', ['-C', S.repo, 'rev-parse', 'HEAD'])).stdout.trim()
    const r = await refreshToolLayer(S.repo, S.from)
    assert.equal(r.state, 'skipped')
    assert.equal(r.reason, 'hook')
    assert.equal((await run('git', ['-C', S.repo, 'rev-parse', 'HEAD'])).stdout.trim(), head0)
    assert.equal(await read(S.repo, 'CLAUDE.md'), '지식 레포 규약 옛판\n')
    assert.equal(await read(S.repo, '.claude/skills/cdp-old/SKILL.md'), '판에서 빠진 스킬\n')
    assert.equal(await exists(path.join(S.repo, 'TEMPLATE-work.md')), false)
    assert.equal(await porcelain(S.repo), '', '다음 save 가 더러운 트리로 막히면 안 된다')
  } finally {
    await S.rm()
  }
})

test('refreshToolLayer — 훅이 시간을 넘겨도 「빈 커밋 + 옛 파일」 은 남지 않는다(된 것이면 된 것 · 안 된 것이면 그대로)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const S = await setup()
  try {
    await put(S.repo, '.hooks-slow/pre-commit', '#!/bin/sh\nsleep 3\nexit 0\n')
    await fs.chmod(path.join(S.repo, '.hooks-slow/pre-commit'), 0o755)
    await g(S.repo, 'add', '-A')
    await g(S.repo, 'commit', '-qm', 'slow hook')
    await g(S.repo, 'config', 'core.hooksPath', '.hooks-slow')
    const head0 = (await run('git', ['-C', S.repo, 'rev-parse', 'HEAD'])).stdout.trim()
    const r = await refreshToolLayer(S.repo, S.from, { commitTimeout: 800 })
    // refreshToolLayer 가 index.lock 이 풀릴 때까지 기다리고 판정한다 — 여기서 더 기다릴 것이 없다
    const head1 = (await run('git', ['-C', S.repo, 'rev-parse', 'HEAD'])).stdout.trim()
    const stat = head1 === head0 ? '' : (await run('git', ['-C', S.repo, 'show', '--stat', '--format=', 'HEAD'])).stdout.trim()
    if (head1 !== head0) {
      assert.ok(stat.length > 0, '빈 커밋이 남았다')
      assert.equal(await read(S.repo, 'CLAUDE.md'), '지식 레포 규약 새판\n', '커밋은 새 판인데 파일이 옛 판')
      assert.equal(r.state, 'updated', '커밋이 됐으면 된 것으로 답한다')
    } else {
      assert.equal(r.state, 'skipped')
      assert.equal(await read(S.repo, 'CLAUDE.md'), '지식 레포 규약 옛판\n')
    }
    assert.equal(await porcelain(S.repo), '')
  } finally {
    await S.rm()
  }
})
