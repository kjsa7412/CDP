// 지식 레포 세우기 — `core/reponew.js`. v1.0 개편안 §8.2 · §9.1.
//
// git 을 실제로 부른다 — 빈 틀 · 첫 커밋 · 원격 · 휴지통이 이 모듈의 값이라서다. 새 레포는 **지식만** 담는다
// (README · 어휘 · 등록부 · docs/ · work/ · git 설정 둘) — 훅 · 도구 층 · 서식 예시가 없다(I9).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { newRepo, cloneRepo, connectOrigin, trashRepo, listRepos, REPO_NAME_RE } from '../core/reponew.js'

const run = promisify(execFile)
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
    const plan = await newRepo({ dest: path.join(d, 'out', 'alpha'), origin: 'https://git.example/x.git', push: true, dry: true })
    assert.equal(plan.dry, true)
    assert.equal(plan.name, 'alpha')
    assert.ok(plan.steps.includes('remote add origin'))
    assert.ok(plan.steps.includes('push -u origin HEAD'))
    assert.equal(await fs.stat(path.join(d, 'out')).catch(() => null), null, 'dry 는 아무것도 만들지 않는다')

    await assert.rejects(newRepo({ dest: path.join(d, '한글이름') }), /이름 형식/)
    await assert.rejects(newRepo({ dest: path.join(d, 'x'), origin: 'not a url' }), /origin 주소 형식/)
    await fs.mkdir(path.join(d, 'occupied'))
    await fs.writeFile(path.join(d, 'occupied', 'a'), 'x')
    await assert.rejects(newRepo({ dest: path.join(d, 'occupied') }), /이미 무엇이 있다/)
    await assert.rejects(newRepo({ dest: path.join(d, 'y'), records: { root: d } }), /지식 레포가 아니다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newRepo — 빈 틀 하나: 지식이 담길 자리만 · 훅 · 도구 층 · hooksPath 없음 · 첫 커밋 · 검사 오류 0', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { loadRepo } = await import('../core/repo.js')
  const { runBuiltinCheck } = await import('../core/check.js')
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const dest = path.join(d, 'out', 'alpha')
    const r = await newRepo({ dest, author: 'tester', title: '알파 팀의 지식' })
    assert.match(r.commit, /^[0-9a-f]{7,}$/)
    assert.equal(r.pushed, false)
    const files = (await run('git', ['-C', dest, 'ls-files'])).stdout.trim().split('\n').sort()
    assert.deepEqual(files, ['.gitattributes', '.gitignore', 'README.md', '_managed.md', '_vocab.md', 'docs/.gitkeep', 'work/.gitkeep'])
    assert.equal(r.files, 7)
    assert.match(await fs.readFile(path.join(dest, 'README.md'), 'utf8'), /^# alpha\n\n알파 팀의 지식\n/)
    const hp = await run('git', ['-C', dest, 'config', '--get', 'core.hooksPath']).then((x) => x.stdout.trim()).catch(() => '')
    assert.equal(hp, '', '훅 경로를 걸지 않는다')
    const who = (await run('git', ['-C', dest, 'log', '-1', '--format=%an|%s'])).stdout.trim()
    assert.equal(who, 'tester|지식 레포 세움 — 빈 틀')
    const repo = await loadRepo(dest)
    const errs = runBuiltinCheck(repo).findings.filter((f) => f.sev === 'error')
    assert.deepEqual(errs, [], '빈 틀은 검사 오류가 없다')

    const list = await listRepos(path.join(d, 'out'))
    assert.equal(list.length, 1)
    assert.equal(list[0].name, 'alpha')
    assert.equal(list[0].vocab, true)
    assert.equal(list[0].git, true)
    assert.equal(list[0].upstream, null)
    assert.equal(list[0].hooksPath, null)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newRepo — origin 이 있으면 remote add · push 는 파일 원격으로 실제로', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const bare = path.join(d, 'origin.git')
    await run('git', ['init', '-q', '--bare', bare])
    const dest = path.join(d, 'out', 'gamma')
    const r = await newRepo({ dest, origin: bare, push: true })
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

test('cloneRepo — origin 에서 받아 온다 · 훅 경로는 걸지 않는다 · 자리에 무엇이 있으면 E_EXISTS · 지식 레포가 아니면 지운다 · 주소 형식', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-cl-'))
  try {
    const src = path.join(d, 'src', 'k0')
    await newRepo({ dest: src })
    const dest = path.join(d, 'root', 'k1')
    const r = await cloneRepo({ url: src, dest })
    assert.ok(r.commit, 'head')
    assert.equal(r.origin, src)
    assert.equal(await fs.readFile(path.join(dest, '_vocab.md'), 'utf8'), await fs.readFile(path.join(src, '_vocab.md'), 'utf8'))
    assert.equal(await run('git', ['-C', dest, 'config', '--get', 'core.hooksPath']).then((x) => x.stdout.trim()).catch(() => ''), '')
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
    const dest = path.join(d, 'out', 'dpms_wiki')
    const made = await newRepo({ dest })
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
    const dest = path.join(d, 'out', 'k')
    await newRepo({ dest })
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
    const dest = path.join(d, 'out', 'gone')
    await newRepo({ dest })
    const trash = path.join(d, 'data', 'trash')
    const r = await trashRepo({ root: dest, trashDir: trash, now: new Date(2026, 8, 28, 9, 5, 7) })
    assert.equal(path.basename(r.to), 'gone-20260928-090507')
    assert.equal(await fs.stat(dest).catch(() => null), null, '원래 자리는 비었다')
    assert.ok(await fs.stat(path.join(r.to, '_vocab.md')), '옮긴 자리에 있다')
    assert.ok(await fs.stat(path.join(r.to, '.git')), 'git 이력째')
    // 같은 초에 같은 이름을 또 치우면 뒤에 번호
    await newRepo({ dest })
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

test('newRepo records — 다시 세우기: 작업 기록 · 첨부 · 그 기록의 어휘만 옮긴다 · 관리 문서 · 옛 기계 기록 · 예시 좌표는 두고 온다(v1.0 §9.1)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { carryVocab } = await import('../core/rebuild.js')
  const { loadRepo } = await import('../core/repo.js')
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-rn-'))
  try {
    const old = path.join(d, 'old')
    await fs.mkdir(path.join(old, 'work', 'assets', '2026-0902-b'), { recursive: true })
    await fs.mkdir(path.join(old, 'docs'), { recursive: true })
    await fs.writeFile(
      path.join(old, '_vocab.md'),
      ['# 어휘', '', '## table', '', '- `table:a` — 에이', '  aliases: 에이표', '- `table:ex` — (예시) 예시', '  example: 서식', '- `table:z` — 아무도 안 씀', '', '## 이슈', '', '- `이슈:ISS-1` — 첫 이슈', ''].join('\n')
    )
    await fs.writeFile(path.join(old, '_managed.md'), '| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n| `table:*` | `docs/t.md` | `## {값}` |\n')
    await fs.writeFile(path.join(old, 'docs', 't.md'), '# t\n\n## a — 에이\n<!-- applied: 2026-0901-a -->\n\n엉망인 섹션.\n')
    const rec = (id, touches, tags = []) => ['---', `id: ${id}`, `title: ${id}`, 'date: 2026-09-01 10:00', 'author: kim', 'touches:', ...touches.map((c) => '  - ' + c), `tags: [${tags.join(', ')}]`, '---', '', `${id} 본문.`, ''].join('\n')
    await fs.writeFile(path.join(old, 'work', '2026-0901-a.md'), rec('2026-0901-a', ['table:a']))
    await fs.writeFile(path.join(old, 'work', '2026-0902-b.md'), rec('2026-0902-b', ['이슈:ISS-1']))
    await fs.writeFile(path.join(old, 'work', 'assets', '2026-0902-b', 'g.png'), 'png')
    await fs.writeFile(path.join(old, 'work', '2026-0903-prune.md'), rec('2026-0903-prune', [], ['docs-prune']).replace('touches:\n', 'touches: []\n'))
    const dest = path.join(d, 'out', 'fresh')
    const r = await newRepo({ dest, records: { root: old }, now: new Date(2026, 9, 6) })
    assert.equal(r.records.records, 2)
    assert.equal(r.records.assets, 1)
    assert.deepEqual(r.records.skipped, [{ id: '2026-0903-prune', kind: 'system' }])
    assert.equal(await fs.readFile(path.join(dest, 'work', '2026-0901-a.md'), 'utf8'), await fs.readFile(path.join(old, 'work', '2026-0901-a.md'), 'utf8'), '기록은 글자 그대로')
    assert.ok(await fs.stat(path.join(dest, 'work', 'assets', '2026-0902-b', 'g.png')))
    assert.equal(await fs.stat(path.join(dest, 'docs', 't.md')).catch(() => null), null, '관리 문서는 안 옮긴다')
    assert.match(await fs.readFile(path.join(dest, 'README.md'), 'utf8'), /old 의 작업 기록을 옮겨 다시 세운 지식 레포\(2026-10-06\)/)
    const v = await fs.readFile(path.join(dest, '_vocab.md'), 'utf8')
    assert.match(v, /`table:a` — 에이\n  aliases: 에이표/)
    assert.match(v, /## 이슈\n\n- `이슈:ISS-1`/)
    assert.doesNotMatch(v, /table:ex|table:z|아직 비어 있다/)
    const nr = await loadRepo(dest)
    assert.deepEqual(nr.curation.queue.map((q) => q.id), ['2026-0901-a', '2026-0902-b'])
    // carryVocab — 펜스 안 · 없는 좌표
    const c = carryVocab('## t\n\n```\n- `t:in` — 펜스\n```\n- `t:a` — 가\n', new Set(['t:a', 't:in', 't:none']))
    assert.deepEqual(c.carried, ['t:a'])
    assert.deepEqual(c.missing.sort(), ['t:in', 't:none'])
  } finally {
    await fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
