// core/git — 실패 분류(순수 함수) · status 의 dirty · restoreTree. 동시 기록 검토 v0.1 D2 · D5.
//
// 분류 문장은 2026-09-25 실측에서 git 이 낸 것 그대로다 — 문장이 바뀌면 여기가 먼저 안다.
// git 이 없는 PC 에서는 파일 시스템을 만지는 것만 건너뛴다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { classifyPushError, status, restoreTree, push } from '../core/git.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])

test('classifyPushError — 실측 문장 7종 · 빈 문자열', () => {
  const nonff = 'To C:/x/o.git\n ! [rejected]        master -> master (fetch first)\nerror: failed to push some refs to \'C:/x/o.git\'\nhint: Updates were rejected because the remote contains work that you do\nhint: not have locally.'
  assert.deepEqual(classifyPushError(nonff), { reason: 'non-ff', line: '! [rejected]        master -> master (fetch first)' })
  const locked = 'remote: error: cannot lock ref \'refs/heads/master\': is at 421e but expected 8f87\nTo C:/x/o.git\n ! [remote rejected] master -> master (failed to update ref)\nerror: failed to push some refs'
  assert.equal(classifyPushError(locked).reason, 'locked')
  assert.equal(classifyPushError(locked).line, '! [remote rejected] master -> master (failed to update ref)')
  assert.equal(classifyPushError("fatal: unable to access 'https://h/x.git/': Could not resolve host: h").reason, 'net')
  assert.equal(classifyPushError("fatal: Authentication failed for 'https://gitlab/x.git/'").reason, 'auth')
  assert.equal(classifyPushError('remote: HTTP Basic: Access denied. The provided password or token is incorrect\nfatal: Authentication failed').reason, 'auth')
  assert.equal(classifyPushError('remote: GitLab: You are not allowed to push code to protected branches on this project.\nTo x\n ! [remote rejected] master -> master (pre-receive hook declined)').reason, 'protected')
  assert.equal(classifyPushError('fatal: The current branch master has no upstream branch.').reason, 'no-upstream')
  assert.deepEqual(classifyPushError(''), { reason: 'unknown', line: null })
  assert.deepEqual(classifyPushError('something odd'), { reason: 'unknown', line: 'something odd' })
  // 첫 줄 `To …` 는 사유가 아니다 — 절대 `line` 으로 나오지 않는다
  assert.ok(!classifyPushError(nonff).line.startsWith('To '))
})

test('status — dirty · dirtyPaths(수정 · 미추적) · restoreTree 가 깨끗하게 · 버린 경로', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-git-'))
  try {
    await g(d, 'init', '-q')
    // 지식 레포와 같은 규칙 — autocrlf 가 켜진 PC 에서 checkout 이 CRLF 로 돌아오지 않게
    await fs.writeFile(path.join(d, '.gitattributes'), '* text=auto eol=lf\n')
    await fs.writeFile(path.join(d, 'a.md'), 'a\n')
    await fs.mkdir(path.join(d, 'docs'))
    await fs.writeFile(path.join(d, 'docs', 'b.md'), 'b\n')
    await g(d, 'add', '-A')
    await g(d, 'commit', '-qm', 'seed')
    let st = await status(d)
    assert.equal(st.dirty, 0)
    assert.deepEqual(st.dirtyPaths, [])
    assert.equal(st.upstream, null)

    await fs.appendFile(path.join(d, 'docs', 'b.md'), '사람이 고친 줄\n')
    await fs.writeFile(path.join(d, 'stray.txt'), 'x')
    await fs.mkdir(path.join(d, 'work'))
    await fs.writeFile(path.join(d, 'work', '2026-0925-반쯤.md'), '중단된 save 의 잔여')
    st = await status(d)
    assert.equal(st.dirty, 3, JSON.stringify(st.dirtyPaths))
    assert.ok(st.dirtyPaths.includes('docs/b.md'))
    assert.ok(st.dirtyPaths.includes('stray.txt'))
    // 한글 경로가 `\354\240\225…` 로 오지 않는다(core.quotepath) — 콘솔 실측에서 잡았다
    assert.ok(st.dirtyPaths.includes('work/2026-0925-반쯤.md'), JSON.stringify(st.dirtyPaths))

    const r = await restoreTree(d)
    assert.equal(r.ok, true)
    assert.equal(r.discarded.length, 3, JSON.stringify(r.discarded))
    assert.ok(r.discarded.includes('work/2026-0925-반쯤.md'), JSON.stringify(r.discarded))
    assert.equal((await status(d)).dirty, 0)
    assert.equal((await fs.readFile(path.join(d, 'docs', 'b.md'), 'utf8')).replace(/\r\n/g, '\n'), 'b\n')
    assert.equal(await fs.stat(path.join(d, 'stray.txt')).catch(() => null), null)

    const again = await restoreTree(d)
    assert.deepEqual(again.discarded, [], '버릴 것이 없으면 아무것도 안 한다')
  } finally {
    await fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})

test('push — bare origin 으로 ok · 남이 먼저 밀면 non-ff 로 분류 · 사유 줄은 `!` 줄', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-git-'))
  try {
    const bare = path.join(d, 'o.git')
    await run('git', ['init', '-q', '--bare', bare])
    const a = path.join(d, 'a')
    await run('git', ['clone', '-q', bare, a])
    await fs.writeFile(path.join(a, 'f'), '1')
    await g(a, 'add', '-A')
    await g(a, 'commit', '-qm', 'a')
    await g(a, 'push', '-q', '-u', 'origin', 'HEAD')
    assert.equal((await push(a)).skipped, 'nothing-to-push')

    const b = path.join(d, 'b')
    await run('git', ['clone', '-q', bare, b])
    await fs.writeFile(path.join(b, 'g'), '2')
    await g(b, 'add', '-A')
    await g(b, 'commit', '-qm', 'b')
    await g(b, 'push', '-q')

    await fs.writeFile(path.join(a, 'h'), '3')
    await g(a, 'add', '-A')
    await g(a, 'commit', '-qm', 'a2')
    const p = await push(a)
    assert.equal(p.ok, false)
    assert.equal(p.reason, 'non-ff')
    assert.match(p.message, /^! \[rejected\]/)
  } finally {
    await fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
