// ctx seed · follow · update — 임시 문서 레포 + 빈 틀 지식 레포 + 서버 하나로 끝까지(문서레포 세우기 검토 v0.1 §7).
//
// check → plan → apply(기준선 · 이관 · 스냅샷 · 기록) → verify 같음 → 다시 apply 는 멱등 → 문서를 고치면 follow 가 누락을 내고
// update 초안이 바뀐 좌표를 잡고 · 「왜」 없이는 저장 거절 · 채우면 대기열에 선다 → follow 누락 0.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { runSeed } from '../viewer/bin/ctx-seed.mjs'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'viewer', 'bin', 'ctx-cli.mjs')
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'

const files = {
  '산출물/공통/용어집.md': ['# 용어집', '', '> 출처: 옛 위키', '', '## PLC — 현장 제어 장치', '', '현장 설비를 제어한다. [회의](../회의록/0901.md)', '', '## SCADA — 감시 시스템', '', 'PLC 를 감시한다.', ''].join(NL),
  '산출물/설계/게이트웨이.md': ['# 게이트웨이', '', '- 판 v0.1', '', '## 1. 설계 원칙', '', '판단하지 않는다. ![구성](게이트웨이_그림/a.png)', '', '## 2. 구성', '', '모듈 셋.', ''].join(NL),
  '산출물/회의록/0901.md': ['# 회의 0901', '', '결정 — PLC 는 현장이 판단한다.', ''].join(NL),
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
const MAP = {
  version: 1,
  root: '산출물',
  docs: [
    { key: 'term', src: '공통/용어집.md', doc: 'docs/용어집.md', type: 'term', title: '용어집', kind: '정의' },
    { key: 'gw', src: '설계/게이트웨이.md', doc: 'docs/게이트웨이설계.md', split: 'chapters', type: '게이트웨이설계', chapters: ['원칙', '구성'], preamble: '개요', title: '게이트웨이설계', figs: '설계/게이트웨이_그림' },
  ],
  records: [{ id: '2026-0901-회의', date: '2026-09-01 10:00', src: '회의록/0901.md', touches: ['term:PLC'] }],
}

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-seed-'))
  const docs = path.join(base, 'docs')
  const root = path.join(base, 'root')
  const g = (cwd, ...a) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a])
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(docs, rel)), { recursive: true })
    await fs.writeFile(path.join(docs, rel), text)
  }
  await fs.mkdir(path.join(docs, '산출물/설계/게이트웨이_그림'), { recursive: true })
  await fs.writeFile(path.join(docs, '산출물/설계/게이트웨이_그림/a.png'), PNG)
  await fs.writeFile(path.join(docs, 'cdp-sources.json'), JSON.stringify(MAP, null, 1))
  await fs.writeFile(path.join(docs, '.gitignore'), '.cdp-updates/\n')
  await g(docs, 'init', '-q')
  await g(docs, 'add', '-A')
  await g(docs, 'commit', '-qm', 'seed')
  const seedSha = (await g(docs, 'rev-parse', '--short', 'HEAD')).stdout.trim()
  await fs.mkdir(root, { recursive: true })
  await run(process.execPath, [CLI, 'repo', 'new', path.join(root, 'kb'), '--title', '시험'], { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' } })
  const init = await run(process.execPath, [CLI, 'serve', 'init', '--auth', path.join(base, 'auth.json'), '--name', 'kim'])
  const token = init.stdout.split(NL).map((l) => l.trim()).find((l) => /^[A-Za-z0-9_-]{30,}$/.test(l))
  const port = 7450 + Math.floor(Math.random() * 40)
  const srv = spawn(process.execPath, [CLI, 'serve', '--root', root, '--auth', path.join(base, 'auth.json'), '--data', path.join(base, 'data'), '--port', String(port)], { stdio: 'ignore' })
  const server = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(server + '/site/info').then((r) => r.ok).catch(() => false)
    if (ok) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const rm = async () => {
    srv.kill()
    await new Promise((r) => setTimeout(r, 300))
    await fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
  return { base, docs, root, kb: path.join(root, 'kb'), token, server, g, seedSha, rm }
}

const io = () => {
  const lines = []
  return { lines, out: (t = '') => lines.push(t), err: (t = '') => lines.push('ERR ' + t), text: () => lines.join(NL) }
}
const opt = (o) => ({ cmd: 'seed', args: [], ...o })

test('ctx seed · follow · update — 끝까지', { skip: !hasGit && 'git 이 없다', timeout: 180_000 }, async () => {
  const S = await setup()
  const tokenWas = process.env.CDP_TOKEN
  process.env.CDP_TOKEN = S.token
  try {
    assert.ok(S.token, '토큰을 못 읽었다')
    let o = io()
    assert.equal(await runSeed(opt({ args: ['check'], from: S.docs }), o), 0, o.text())
    assert.match(o.text(), /문서 2 · 섹션 5 · 기록 1/)

    o = io()
    assert.equal(await runSeed(opt({ args: ['plan'], from: S.docs, server: S.server, repo: 'kb', date: '2026-10-12' }), o), 0, o.text())
    assert.match(o.text(), /term\(섹션 2\) — dryRun 통과/)
    assert.doesNotMatch(await fs.readFile(path.join(S.kb, '_managed.md'), 'utf8'), /용어집/, 'plan 은 쓰지 않는다')

    o = io()
    assert.equal(await runSeed(opt({ args: ['apply'], from: S.docs, server: S.server, repo: 'kb', date: '2026-10-12' }), o), 0, o.text())
    assert.match(o.text(), /스냅샷 5 · 건너뜀 0/)
    assert.match(o.text(), /대기 1 · 근거 없음 0/)
    const managed = await fs.readFile(path.join(S.kb, '_managed.md'), 'utf8')
    assert.match(managed, /`term:\*` \| `docs\/용어집.md` \| `## \{값\}` \| [^|]+ \| 정의 \|/)
    const term = await fs.readFile(path.join(S.kb, 'docs', '용어집.md'), 'utf8')
    assert.match(term, /\[회의\]\(\.\.\/work\/2026-0901-회의\.md\)/)
    assert.doesNotMatch(term, /출처/)
    const gw = await fs.readFile(path.join(S.kb, 'docs', '게이트웨이설계.md'), 'utf8')
    assert.match(gw, /## 원칙 — 1\. 설계 원칙/)
    assert.match(gw, /\.\.\/work\/assets\/2026-1012-이관-gw\/a\.png/)
    await fs.access(path.join(S.kb, 'work', 'assets', '2026-1012-이관-gw', 'a.png'))

    o = io()
    assert.equal(await runSeed(opt({ args: ['verify'], from: S.docs, clone: S.kb }), o), 0, o.text())
    assert.match(o.text(), /같음 5 · 형식 차이 0 · 확인 필요 0 · 위키에 없음 0/)

    // 다시 — 멱등(커밋이 늘지 않는다)
    const count = async () => (await S.g(S.kb, 'rev-list', '--count', 'HEAD')).stdout.trim()
    const before = await count()
    o = io()
    assert.equal(await runSeed(opt({ args: ['apply'], from: S.docs, server: S.server, repo: 'kb', date: '2026-10-13' }), o), 0, o.text())
    assert.equal(await count(), before, o.text())

    // 문서를 고친다 — 이력 줄만 바꾼 커밋은 섹션 변경이 아니다
    const termSrc = path.join(S.docs, '산출물/공통/용어집.md')
    await fs.writeFile(termSrc, files['산출물/공통/용어집.md'].replace('PLC 를 감시한다.', 'PLC 를 감시한다. 경보 이력은 ODBC 로 받는다.'))
    await S.g(S.docs, 'commit', '-qam', 'SCADA 경보 이력 경로')
    o = io()
    assert.equal(await runSeed({ cmd: 'follow', args: [], from: S.docs, clone: S.kb, since: S.seedSha }, o), 1, o.text())
    assert.match(o.text(), /✗ 누락 .* SCADA 경보 이력 경로\n\s+term:SCADA — 기록 없음/)

    o = io()
    assert.equal(await runSeed({ cmd: 'update', args: [S.seedSha], from: S.docs }, o), 0, o.text())
    const draftPath = o.text().match(/초안 (.+\.json)/)[1]
    const draft = JSON.parse(await fs.readFile(draftPath, 'utf8'))
    assert.deepEqual(draft.touches, ['term:SCADA'])
    assert.match(draft.body, /\+ PLC 를 감시한다\. 경보 이력은 ODBC 로 받는다\./)
    assert.doesNotMatch(o.text(), /gitignore/, '.cdp-updates 가 무시되고 있다')

    o = io()
    assert.equal(await runSeed({ cmd: 'update', args: [], saveDraft: draftPath, server: S.server, repo: 'kb' }, o), 1)
    assert.match(o.text(), /「## 왜」 를 채우지 않았다/)
    draft.body = draft.body.replace(/<!-- 왜:[^\n]*-->/, '경보 링 버퍼를 쓰지 않기로 해서 — 이력은 ODBC 한 경로다.')
    await fs.writeFile(draftPath, JSON.stringify(draft))
    o = io()
    assert.equal(await runSeed({ cmd: 'update', args: [], saveDraft: draftPath, server: S.server, repo: 'kb', go: true }, o), 0, o.text())
    assert.match(o.text(), /대기열에 섰다/)

    o = io()
    assert.equal(await runSeed({ cmd: 'follow', args: [], from: S.docs, clone: S.kb, since: S.seedSha }, o), 0, o.text())
    assert.match(o.text(), /누락 0/)
  } finally {
    if (tokenWas == null) delete process.env.CDP_TOKEN
    else process.env.CDP_TOKEN = tokenWas
    await S.rm()
  }
})
