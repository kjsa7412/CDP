// git 자격 — `core/gitauth.js`. git 자격 TODO G1~G8.
//
// ssh-keygen · git 을 실제로 부른다. 전역 설정은 **임시 파일**로 돌린다(`GIT_CONFIG_GLOBAL`) — 이 PC 의
// ~/.gitconfig 에 쓰지 않는다. 호스트 키는 ssh-keyscan 대신 가짜 스캐너(진짜 키 줄)를 넣는다 — 망이 없어도 돈다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as ga from '../core/gitauth.js'

const run = promisify(execFile)
const has = async (cmd, args) => run(cmd, args).then(() => true).catch((e) => e.code !== 'ENOENT')
const hasKeygen = await has('ssh-keygen', ['-?'])
const hasGit = await has('git', ['--version'])

test('parseRemote — ssh:// · scp 꼴 · http · 경로', () => {
  assert.deepEqual(ga.parseRemote('ssh://git@10.10.20.250:443/platform/dpms_wiki.git'), { kind: 'ssh', user: 'git', host: '10.10.20.250', port: 443, hostKey: '[10.10.20.250]:443' })
  assert.deepEqual(ga.parseRemote('git@gitlab.x:g/p.git'), { kind: 'ssh', user: 'git', host: 'gitlab.x', port: 22, hostKey: 'gitlab.x' })
  assert.equal(ga.parseRemote('ssh://gitlab.x/g/p.git').hostKey, 'gitlab.x')
  const h = ga.parseRemote('http://10.10.20.250:2900/platform/dpms_wiki.git')
  assert.equal(h.kind, 'http')
  assert.equal(h.host, '10.10.20.250')
  assert.equal(h.port, 2900)
  assert.equal(ga.parseRemote('C:\\x\\y.git').kind, 'file')
  assert.equal(ga.isSsh('https://u:p@h/x.git'), false)
})

test('sshCommand — 앞 빗금 · 모르는 호스트 · 프롬프트에서 멈추지 않는다', () => {
  const c = ga.sshCommand('C:\\data')
  assert.match(c, /-i "C:\/data\/ssh\/id_ed25519"/)
  assert.match(c, /UserKnownHostsFile="C:\/data\/ssh\/known_hosts"/)
  assert.match(c, /StrictHostKeyChecking=yes/)
  assert.match(c, /BatchMode=yes/)
  assert.match(c, /IdentitiesOnly=yes/)
})

test('createKey — 만들고 · 두 번째는 E_EXISTS · rotate 면 옛 것을 남긴다 · 공개 키 · 지문', { skip: !hasKeygen && 'ssh-keygen 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ga-'))
  try {
    assert.equal((await ga.keyInfo(d)).exists, false)
    const k = await ga.createKey(d, { comment: 'cdp-test' })
    assert.equal(k.exists, true)
    assert.match(k.publicKey, /^ssh-ed25519 \S+ cdp-test$/)
    assert.match(k.fingerprint, /^SHA256:/)
    assert.equal(k.type, 'ED25519')
    await assert.rejects(ga.createKey(d), /이미 있다/)
    const k2 = await ga.createKey(d, { rotate: true, now: new Date(2026, 8, 28, 10, 0, 0) })
    assert.notEqual(k2.fingerprint, k.fingerprint)
    assert.ok(k2.rotated.endsWith('id_ed25519.old-20260928-100000'))
    assert.ok(await fs.stat(k2.rotated), '옛 개인 키가 남는다')
    assert.equal((await fs.readFile(k2.rotated + '.pub', 'utf8')).trim(), k.publicKey)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('trustHost — 본 지문과 같은 줄만 쓴다 · 다르면 E_CHANGED · 같은 호스트 · 형식은 바꿔 쓴다 · knownHosts', { skip: !hasKeygen && 'ssh-keygen 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ga-'))
  try {
    // 진짜 키 둘 — 호스트 키 자리에 쓴다
    const mk = async (n) => {
      await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', n, '-f', path.join(d, n)])
      return (await fs.readFile(path.join(d, n + '.pub'), 'utf8')).trim().split(' ').slice(0, 2).join(' ')
    }
    const k1 = await mk('h1')
    const k2 = await mk('h2')
    const url = 'ssh://git@10.10.20.250:443/platform/dpms_wiki.git'
    let now = [`[10.10.20.250]:443 ${k1}`]
    const scan = async (r) => {
      assert.equal(r.host, '10.10.20.250')
      assert.equal(r.port, 443)
      return now
    }
    const s = await ga.scanHost(url, { scan })
    assert.equal(s.hostKey, '[10.10.20.250]:443')
    assert.equal(s.keys.length, 1)
    const fp = s.keys[0].fingerprint
    assert.match(fp, /^SHA256:/)
    await assert.rejects(ga.scanHost('http://x/y.git', { scan }), /ssh 주소가 아니다/)
    await assert.rejects(ga.trustHost(d, url, 'nope', { scan }), /지문 형식/)

    // 본 뒤에 키가 바뀌었다 — 쓰지 않는다
    now = [`[10.10.20.250]:443 ${k2}`]
    await assert.rejects(ga.trustHost(d, url, fp, { scan }), (e) => e.code === 'E_CHANGED')
    assert.deepEqual(await ga.knownHosts(d), [])

    now = [`[10.10.20.250]:443 ${k1}`]
    const t = await ga.trustHost(d, url, fp, { scan })
    assert.equal(t.fingerprint, fp)
    let kh = await ga.knownHosts(d)
    assert.equal(kh.length, 1)
    assert.equal(kh[0].host, '[10.10.20.250]:443')
    // 같은 호스트 · 같은 형식을 다시 믿으면 줄이 늘지 않고 바뀐다
    now = [`[10.10.20.250]:443 ${k2}`]
    const fp2 = (await ga.scanHost(url, { scan })).keys[0].fingerprint
    await ga.trustHost(d, url, fp2, { scan })
    kh = await ga.knownHosts(d)
    assert.equal(kh.length, 1)
    assert.equal(kh[0].fingerprint, fp2)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('applyToRepo · repoSshState — ssh 원격 레포에만 로컬 설정으로 · 키가 없으면 안 건다', { skip: !(hasKeygen && hasGit) && 'ssh-keygen · git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ga-'))
  try {
    const data = path.join(d, 'data')
    const a = path.join(d, 'a')
    const b = path.join(d, 'b')
    for (const r of [a, b]) await run('git', ['init', '-q', r])
    await run('git', ['-C', a, 'remote', 'add', 'origin', 'ssh://git@10.10.20.250:443/platform/a.git'])
    await run('git', ['-C', b, 'remote', 'add', 'origin', 'http://10.10.20.250:2900/platform/b.git'])
    assert.equal(await ga.applyToRepo(a, data), false, '키가 없으면 안 건다')
    await ga.createKey(data)
    assert.equal(await ga.applyToRepo(a, data), true)
    assert.equal(await ga.applyToRepo(b, data), false, 'http 원격에는 안 건다')
    assert.equal((await run('git', ['-C', a, 'config', '--local', '--get', 'core.sshCommand'])).stdout.trim(), ga.sshCommand(data))
    assert.deepEqual(await ga.repoSshState(a, data), { remote: 'ssh://git@10.10.20.250:443/platform/a.git', ssh: true, applied: true })
    assert.deepEqual(await ga.repoSshState(b, data), { remote: 'http://10.10.20.250:2900/platform/b.git', ssh: false, applied: false })
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('testRemote — 파일 원격은 ok · 빈 원격 · 없는 원격은 사유', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ga-'))
  try {
    const bare = path.join(d, 'o.git')
    await run('git', ['init', '-q', '--bare', bare])
    const r = await ga.testRemote(bare)
    assert.equal(r.ok, true)
    assert.equal(r.empty, true)
    const x = await ga.testRemote(path.join(d, 'nowhere.git'))
    assert.equal(x.ok, false)
    assert.ok(x.message)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('storeCredential — 600 · helper store · 같은 호스트는 바꿔 쓴다 · 다른 helper 면 멈춘다 · 목록에 비밀 없음', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ga-'))
  try {
    const env = { ...process.env, HOME: d, USERPROFILE: d, GIT_CONFIG_GLOBAL: path.join(d, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' }
    await fs.writeFile(env.GIT_CONFIG_GLOBAL, '')
    const file = path.join(d, 'cred')
    await assert.rejects(ga.storeCredential({ host: 'bad host', user: 'u', secret: 's', env }), /호스트 형식/)
    await assert.rejects(ga.storeCredential({ host: 'h:1', user: 'u', secret: 'a b', env }), /PAT/)
    const r = await ga.storeCredential({ host: '10.10.20.250:2900', user: 'kjsa', secret: 'glpat-AAA', file, env })
    assert.equal(r.helperSet, true)
    assert.equal(r.replaced, 0)
    assert.equal((await fs.readFile(file, 'utf8')).trim(), 'http://kjsa:glpat-AAA@10.10.20.250:2900')
    if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
    const st = await ga.credentialState({ env })
    assert.equal(st.store, true)
    assert.equal(path.resolve(st.file), path.resolve(file))
    // 같은 호스트 · 새 PAT — 줄이 늘지 않는다. 다른 호스트는 남는다
    await fs.appendFile(file, 'https://x:y@other.host\n')
    const r2 = await ga.storeCredential({ host: '10.10.20.250:2900', user: 'kjsa', secret: 'glpat-BBB', env })
    assert.equal(r2.replaced, 1)
    assert.equal(r2.helperSet, false)
    const body = (await fs.readFile(file, 'utf8')).trim().split('\n')
    assert.deepEqual(body, ['https://x:y@other.host', 'http://kjsa:glpat-BBB@10.10.20.250:2900'])
    const list = await ga.listCredentials(file)
    assert.deepEqual(list, [{ scheme: 'https', user: 'x', host: 'other.host' }, { scheme: 'http', user: 'kjsa', host: '10.10.20.250:2900' }])
    assert.ok(!JSON.stringify(list).includes('glpat'), '목록에 비밀이 없다')
    // 다른 helper — 멈춘다 · force 면 바꾼다
    await run('git', ['config', '--global', 'credential.helper', 'manager'], { env })
    await assert.rejects(ga.storeCredential({ host: 'h:1', user: 'u', secret: 's', env }), /이미 「manager」/)
    const r3 = await ga.storeCredential({ host: 'h:1', user: 'u', secret: 's', file, force: true, env })
    assert.equal(r3.helperSet, true)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('maskUrl — ssh 계정은 남기고 http 자격 · ssh 비밀번호 · 문장 속 주소는 가린다', async () => {
  const { maskUrl } = await import('../core/git.js')
  assert.equal(maskUrl('ssh://git@10.10.20.250:443/p/a.git'), 'ssh://git@10.10.20.250:443/p/a.git')
  assert.equal(maskUrl('ssh://git:pw@h/x'), 'ssh://***@h/x')
  assert.equal(maskUrl('https://kjsa:glpat-x@h:2900/a.git'), 'https://***@h:2900/a.git')
  assert.equal(maskUrl('http://glpat-x@h/a'), 'http://***@h/a')
  assert.equal(maskUrl("fatal: unable to access 'http://u:p@h/x/': 403 · http://a:b@c/"), "fatal: unable to access 'http://***@h/x/': 403 · http://***@c/")
  assert.equal(maskUrl('git@h:g/p.git'), 'git@h:g/p.git')
})
