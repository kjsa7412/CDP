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
import { newRepo, cloneRepo, connectOrigin, trashRepo, listRepos, REPO_NAME_RE } from '../core/reponew.js'

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
  assert.ok(REPO_NAME_RE.test('my_app-2'))
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

test('cloneRepo — origin 에서 받아 온다 · hooksPath · 자리에 무엇이 있으면 E_EXISTS · 지식 레포가 아니면 지운다 · 주소 형식', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-cl-'))
  try {
    const src = await completedFolder(d)
    await run('git', ['-C', src, 'init', '-q'])
    await run('git', ['-C', src, 'add', '-A'])
    await run('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qm', 'seed'])
    const dest = path.join(d, 'root', 'k1')
    const r = await cloneRepo({ url: src, dest })
    assert.ok(r.commit, 'head')
    assert.equal(r.origin, src)
    assert.equal(await fs.readFile(path.join(dest, '_vocab.md'), 'utf8'), '# 어휘\n\n## table\n')
    assert.equal((await run('git', ['-C', dest, 'config', '--get', 'core.hooksPath'])).stdout.trim(), '.githooks')
    // 이미 있는 자리
    await assert.rejects(cloneRepo({ url: src, dest }), /이미 무엇이/)
    // 지식 레포가 아닌 것 — _vocab.md 없는 git 레포. clone 은 되지만 지운다
    const plain = path.join(d, 'plain')
    await fs.mkdir(plain)
    await fs.writeFile(path.join(plain, 'a.txt'), 'x')
    await run('git', ['-C', plain, 'init', '-q'])
    await run('git', ['-C', plain, 'add', '-A'])
    await run('git', ['-C', plain, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qm', 'seed'])
    await assert.rejects(cloneRepo({ url: plain, dest: path.join(d, 'root', 'k2') }), /지식 레포가 아니다/)
    assert.equal(await fs.stat(path.join(d, 'root', 'k2')).catch(() => null), null, '지웠다')
    // 주소 형식 · 없는 원격
    await assert.rejects(cloneRepo({ url: 'not a url', dest: path.join(d, 'root', 'k3') }), /형식/)
    await assert.rejects(cloneRepo({ url: path.join(d, 'nowhere'), dest: path.join(d, 'root', 'k4') }), /clone 실패/)
    assert.equal(await fs.stat(path.join(d, 'root', 'k4')).catch(() => null), null, '실패해도 폴더를 남기지 않는다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('connectOrigin — 원격 없이 세운 레포를 잇고 첫 push · 같은 주소면 다시 민다 · 주소 형식', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-co-'))
  try {
    const from = await completedFolder(d)
    const dest = path.join(d, 'out', 'dpms_wiki')
    const made = await newRepo({ from, dest })
    assert.equal((await listRepos(path.join(d, 'out')))[0].upstream, null, '처음엔 원격 없음')
    await assert.rejects(connectOrigin({ root: dest, url: 'not a url' }), /형식/)
    await assert.rejects(connectOrigin({ root: dest, url: 'http://x/a b.git' }), /형식/)

    const bare = path.join(d, 'origin.git')
    await run('git', ['init', '-q', '--bare', bare])
    const r = await connectOrigin({ root: dest, url: bare })
    assert.equal(r.pushed, true)
    assert.equal(r.before, null)
    assert.equal((await run('git', ['-C', bare, 'rev-parse', '--short', 'HEAD'])).stdout.trim(), made.commit, '원격이 첫 커밋을 받았다')
    const row = (await listRepos(path.join(d, 'out')))[0]
    assert.ok(row.upstream, 'upstream 이 잡혔다')
    assert.equal(row.ahead, 0)
    // 같은 주소 다시 — 바꾸지 않고 다시 민다(보낼 것이 없어도 성공)
    const again = await connectOrigin({ root: dest, url: bare })
    assert.equal(again.changed, false)
    assert.equal(again.pushed, true)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('connectOrigin — 원격에 남의 커밋이 있으면 non-ff 로 거절 · 원격 주소는 남는다(강제 push 없음)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-co-'))
  try {
    const from = await completedFolder(d)
    const dest = path.join(d, 'out', 'k')
    await newRepo({ from, dest })
    // 비어 있지 않은 원격 — 다른 이력 하나
    const other = path.join(d, 'other')
    await fs.mkdir(other)
    await fs.writeFile(path.join(other, 'x.txt'), 'x')
    await run('git', ['-C', other, 'init', '-q'])
    await run('git', ['-C', other, 'add', '-A'])
    await run('git', ['-C', other, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qm', 'someone'])
    const bare = path.join(d, 'busy.git')
    await run('git', ['clone', '-q', '--bare', other, bare])
    const theirs = (await run('git', ['-C', bare, 'rev-parse', 'HEAD'])).stdout.trim()
    // 브랜치 이름을 맞춘다 — 서로 다른 기본 브랜치면 거절이 아니라 새 브랜치가 된다
    const br = (await run('git', ['-C', dest, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    await run('git', ['-C', bare, 'branch', '-f', br, theirs]).catch(() => {})
    const r = await connectOrigin({ root: dest, url: bare })
    assert.equal(r.pushed, false)
    assert.equal(r.reason, 'non-ff')
    assert.equal((await run('git', ['-C', dest, 'remote', 'get-url', 'origin'])).stdout.trim(), bare, '원격은 남는다')
    assert.equal((await run('git', ['-C', bare, 'rev-parse', br])).stdout.trim(), theirs, '남의 이력을 덮지 않았다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('trashRepo — 휴지통으로 옮긴다 · 원래 자리는 빈다 · 지식 레포가 아니면 거절', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-tr-'))
  try {
    const from = await completedFolder(d)
    const dest = path.join(d, 'out', 'gone')
    await newRepo({ from, dest })
    const trash = path.join(d, 'data', 'trash')
    const r = await trashRepo({ root: dest, trashDir: trash, now: new Date(2026, 8, 28, 9, 5, 7) })
    assert.equal(path.basename(r.to), 'gone-20260928-090507')
    assert.equal(await fs.stat(dest).catch(() => null), null, '원래 자리는 비었다')
    assert.ok(await fs.stat(path.join(r.to, '_vocab.md')), '옮긴 자리에 있다')
    assert.ok(await fs.stat(path.join(r.to, '.git')), 'git 이력째')
    // 같은 초에 같은 이름을 또 치우면 뒤에 번호
    await newRepo({ from, dest })
    const r2 = await trashRepo({ root: dest, trashDir: trash, now: new Date(2026, 8, 28, 9, 5, 7) })
    assert.equal(path.basename(r2.to), 'gone-20260928-090507-2')
    // 지식 레포가 아닌 폴더 · 없는 폴더
    const plain = path.join(d, 'out', 'plain')
    await fs.mkdir(plain, { recursive: true })
    await assert.rejects(trashRepo({ root: plain, trashDir: trash }), /지식 레포가 아니다/)
    assert.ok(await fs.stat(plain), '남의 폴더는 그대로')
    await assert.rejects(trashRepo({ root: path.join(d, 'out', 'none'), trashDir: trash }), /없다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
