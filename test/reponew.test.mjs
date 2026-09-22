// 지식 레포 세우기 — `core/reponew.js`. 검토 §3.5 · 제품화 TODO 5.1.
//
// git 을 실제로 부른다 — 첫 커밋에서 **훅이 도는 것**이 이 함수의 값이라서다.
// 훅은 `bin/ctx` → `bin/ctx.mjs` 를 부르므로 완성 폴더에 실행되는 번들이 있어야
// 한다. 여기서는 작은 가짜 번들(`process.exit(0)`)을 둔다 — 훅이 **돌았다는 것**만
// 본다. 판정의 정답은 다른 테스트(check · validity)의 몫이다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { newRepo, listRepos, REPO_NAME_RE } from '../core/reponew.js'

const run = promisify(execFile)
const HOOK = `#!/bin/sh
repo=$(git rev-parse --show-toplevel)
sh "$repo/bin/ctx" check --repo "$repo"
rc=$?
[ "$rc" -eq 127 ] && exit 0
exit $rc
`
const CTX_SH = `#!/bin/sh
here=$(dirname "$0")
exec node "$here/ctx.mjs" "$@"
`

async function completedFolder(dir, { hookFails = false } = {}) {
  const f = path.join(dir, 'pkg')
  await fs.mkdir(path.join(f, 'docs'), { recursive: true })
  await fs.mkdir(path.join(f, 'bin'), { recursive: true })
  await fs.mkdir(path.join(f, '.githooks'), { recursive: true })
  await fs.writeFile(path.join(f, '_vocab.md'), '# 어휘\n\n## table\n')
  await fs.writeFile(path.join(f, '_managed.md'), '| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n| `table:*` | `docs/t.md` | `## {값}` |\n')
  await fs.writeFile(path.join(f, 'docs', 't.md'), '# t\n')
  await fs.writeFile(path.join(f, 'README.md'), '# repo\n')
  await fs.writeFile(path.join(f, '.gitattributes'), '* text=auto eol=lf\n')
  await fs.writeFile(path.join(f, '.gitignore'), '/tools/*.exe\n')
  await fs.writeFile(path.join(f, '_package.json'), '{"name":"pkg"}')
  await fs.writeFile(path.join(f, 'tools.exe'), 'not really')
  await fs.writeFile(path.join(f, 'bin', 'ctx'), CTX_SH)
  await fs.writeFile(path.join(f, 'bin', 'ctx.mjs'), hookFails ? 'console.error("[가짜] 검사 실패"); process.exit(1)\n' : 'process.exit(0)\n')
  await fs.writeFile(path.join(f, '.githooks', 'pre-commit'), HOOK)
  return f
}

const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)

test('REPO_NAME_RE', () => {
  assert.ok(REPO_NAME_RE.test('gdi'))
  assert.ok(REPO_NAME_RE.test('ezipez_cdp-2'))
  assert.ok(!REPO_NAME_RE.test('한글'))
  assert.ok(!REPO_NAME_RE.test('a b'))
  assert.ok(!REPO_NAME_RE.test('.hidden'))
})

test('newRepo — dry 는 계획만 · 입력 검사', async (t) => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const from = await completedFolder(d)
    const plan = await newRepo({ from, dest: path.join(d, 'out', 'alpha'), origin: 'https://git.example/x.git', push: true, dry: true })
    assert.equal(plan.dry, true)
    assert.equal(plan.name, 'alpha')
    assert.ok(plan.steps.includes('remote add origin'))
    assert.ok(plan.steps.includes('push -u origin HEAD'))
    assert.equal(await fs.stat(path.join(d, 'out')).catch(() => null), null, 'dry 는 아무것도 만들지 않는다')

    await assert.rejects(newRepo({ from: path.join(d, '없음'), dest: path.join(d, 'x') }), /복사할 폴더가 없다/)
    await assert.rejects(newRepo({ from: d, dest: path.join(d, 'x') }), /_vocab\.md 없음/)
    await assert.rejects(newRepo({ from, dest: path.join(d, '한글이름') }), /이름 형식/)
    await assert.rejects(newRepo({ from, dest: path.join(d, 'x'), origin: 'not a url' }), /origin 주소 형식/)
    await fs.mkdir(path.join(d, 'occupied'))
    await fs.writeFile(path.join(d, 'occupied', 'a'), 'x')
    await assert.rejects(newRepo({ from, dest: path.join(d, 'occupied') }), /이미 무엇이 있다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newRepo — 복사 · git init · hooksPath · 첫 커밋 (훅이 돈다) · exe 와 매니페스트는 안 담는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const from = await completedFolder(d)
    const dest = path.join(d, 'out', 'alpha')
    const r = await newRepo({ from, dest, author: 'tester' })
    assert.match(r.commit, /^[0-9a-f]{7,}$/)
    assert.ok(r.files >= 8, String(r.files))
    assert.equal(r.pushed, false)
    assert.equal(await fs.stat(path.join(dest, 'work', '.gitkeep')).then(() => true), true)
    assert.equal(await fs.stat(path.join(dest, '_package.json')).catch(() => null), null, '매니페스트는 받는 사람에게 가지 않는다')
    assert.equal(await fs.stat(path.join(dest, 'tools.exe')).catch(() => null), null, 'exe 는 담지 않는다')
    const hp = (await run('git', ['-C', dest, 'config', '--get', 'core.hooksPath'])).stdout.trim()
    assert.equal(hp, '.githooks')
    const who = (await run('git', ['-C', dest, 'log', '-1', '--format=%an'])).stdout.trim()
    assert.equal(who, 'tester')

    const list = await listRepos(path.join(d, 'out'))
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'alpha')
    assert.equal(list[0].vocab, true)
    assert.equal(list[0].git, true)
    assert.equal(list[0].upstream, null)
    assert.equal(list[0].hooksPath, '.githooks')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newRepo — 훅이 막으면 E_CHECK 이고 반쪽 레포를 남기지 않는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const from = await completedFolder(d, { hookFails: true })
    const dest = path.join(d, 'out', 'beta')
    await assert.rejects(newRepo({ from, dest }), (e) => e.code === 'E_CHECK')
    assert.equal(await fs.stat(dest).catch(() => null), null, '지웠다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newRepo — origin 이 있으면 remote add · push 는 파일 원격으로 실제로', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const from = await completedFolder(d)
    const bare = path.join(d, 'origin.git')
    await run('git', ['init', '-q', '--bare', bare])
    const dest = path.join(d, 'out', 'gamma')
    const r = await newRepo({ from, dest, origin: bare, push: true })
    assert.equal(r.pushed, true)
    const remote = (await run('git', ['-C', bare, 'rev-parse', '--short', 'HEAD'])).stdout.trim()
    assert.equal(remote, r.commit)
    const list = await listRepos(path.join(d, 'out'))
    assert.ok(list[0].upstream, 'upstream 이 잡혔다')
    assert.equal(list[0].ahead, 0)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
