// MCP `source` 의 세우기 — init · map · plan · apply · verify 를 서버 안에서(MCP 만으로 검토 v0.1 ② · M4 · M7).
//
// 기대값은 seed-cli.test.mjs(CLI → HTTP 길)와 같다 — 관리 문서 · 기록 · _seed.json 이 같은 모양이어야 한다.
// init 은 원천에 쓰지 않는다 · plan · apply 기본은 쓰지 않는다 · stage 로 나눠 부른다 · 다시 apply 는 멱등.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { buildServer } from '../viewer/bin/ctx-mcp.mjs'
import { toolSource, setSource } from '../core/sourcerepo.js'
import { save } from '../core/save.js'
import { stage } from '../core/assets.js'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'viewer', 'bin', 'ctx-cli.mjs')
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' }

const FILES = {
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

const call = async (srv, name, args) => {
  const out = await srv._registeredTools[name].handler({ repo: 'kb', ...args }, {})
  const j = JSON.parse(out.content[0].text)
  return out.isError ? { error: j.error } : j
}

test('MCP source — init · map · plan · apply · verify(서버 안에서 · CLI 와 같은 결과)', { skip: !hasGit && 'git 이 없다', timeout: 180_000 }, async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-source-seed-'))
  const docs = path.join(base, 'docs')
  const kb = path.join(base, 'root', 'kb')
  const data = path.join(base, 'data')
  const staging = path.join(data, 'staging')
  const g = (cwd, ...a) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a])
  try {
    for (const [rel, text] of Object.entries(FILES)) {
      await fs.mkdir(path.dirname(path.join(docs, rel)), { recursive: true })
      await fs.writeFile(path.join(docs, rel), text)
    }
    await fs.mkdir(path.join(docs, '산출물/설계/게이트웨이_그림'), { recursive: true })
    await fs.writeFile(path.join(docs, '산출물/설계/게이트웨이_그림/a.png'), PNG)
    await g(docs, 'init', '-q')
    await g(docs, 'add', '-A')
    await g(docs, 'commit', '-qm', '지도 전')
    await fs.mkdir(path.dirname(kb), { recursive: true })
    await run(process.execPath, [CLI, 'repo', 'new', kb, '--title', '시험'], { env: ENV })
    await setSource(data, 'kb', { url: docs })
    const srv = () =>
      buildServer({
        repos: [{ name: 'kb', root: kb }],
        fallback: 'kb',
        prompts: 'never',
        saver: () => ({}),
        curate: () => true,
        curateAny: true,
        sourcer: (r, name, a) =>
          toolSource(r, a, {
            dataDir: data,
            name,
            seed: { save: (input) => save(kb, input, { user: 'kim', write: true, curate: true, staging }), upload: (rel, buf) => stage(staging, buf) },
          }),
      })

    // 지도 없음 — init 은 뼈대를 돌려줄 뿐 원천에 쓰지 않는다 · map 은 지도가 있어야 한다
    let o = await call(srv(), 'source', { op: 'init', root: '산출물' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(o.exists, false)
    assert.deepEqual(o.map.records.map((x) => x.src), ['회의록/0901.md'])
    assert.ok(o.map.docs.some((d) => d.src === '공통/용어집.md'))
    await assert.rejects(fs.access(path.join(docs, 'cdp-sources.json')))
    assert.equal((await call(srv(), 'source', { op: 'map' })).error.code, 'E_INPUT')

    // 사람이 고친 지도를 원천에 커밋한다
    await fs.writeFile(path.join(docs, 'cdp-sources.json'), JSON.stringify(MAP, null, 1))
    await g(docs, 'add', '-A')
    await g(docs, 'commit', '-qm', '지도')
    o = await call(srv(), 'source', { op: 'map' })
    assert.equal(o.check.ok, true, JSON.stringify(o.check))
    assert.equal(o.check.sections, 5)
    assert.equal(o.check.records, 1)

    // plan — 쓰지 않는다
    o = await call(srv(), 'source', { op: 'plan', date: '2026-10-12' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.ok(o.lines.some((l) => /term\(섹션 2\) — dryRun 통과/.test(l)), o.lines.join(NL))
    assert.equal(o.commits.length, 0)
    assert.doesNotMatch(await fs.readFile(path.join(kb, '_managed.md'), 'utf8'), /용어집/, 'plan 은 쓰지 않는다')
    // apply 도 dryRun 이 기본
    o = await call(srv(), 'source', { op: 'apply', date: '2026-10-12' })
    assert.equal(o.dry, true)
    assert.equal(o.commits.length, 0)

    // apply — 단계로 나눠 부른다(managed 먼저 · 나머지)
    o = await call(srv(), 'source', { op: 'apply', dryRun: false, stage: 'managed', date: '2026-10-12' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(o.commits.length, 2, o.lines.join(NL))
    o = await call(srv(), 'source', { op: 'apply', dryRun: false, date: '2026-10-12' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.ok(o.lines.some((l) => /대기 0 · 근거 없음 0/.test(l)), o.lines.join(NL))
    assert.deepEqual(o.commits.map((c) => c.label), ['2026-0901-회의'])

    // CLI(seed-cli.test.mjs)와 같은 결과
    const works = (await fs.readdir(path.join(kb, 'work'))).filter((f) => f.endsWith('.md'))
    assert.deepEqual(works, ['2026-0901-회의.md'])
    const seed = JSON.parse(await fs.readFile(path.join(kb, '_seed.json'), 'utf8'))
    assert.equal(seed.at, '2026-10-12')
    assert.match(seed.from, /^docs@[0-9a-f]+$/)
    assert.deepEqual(seed.records, ['2026-0901-회의'])
    assert.deepEqual(seed.sections.sort(), ['게이트웨이설계:개요', '게이트웨이설계:구성', '게이트웨이설계:원칙', 'term:PLC', 'term:SCADA'].sort())
    const managed = await fs.readFile(path.join(kb, '_managed.md'), 'utf8')
    assert.match(managed, /`term:\*` \| `docs\/용어집.md` \| `## \{값\}` \| [^|]+ \| 정의 \|/)
    const term = await fs.readFile(path.join(kb, 'docs', '용어집.md'), 'utf8')
    assert.match(term, /<!-- applied: null -->/)
    assert.match(term, /\[회의\]\(\.\.\/work\/2026-0901-회의\.md\)/)
    assert.doesNotMatch(term, /출처/)
    const gw = await fs.readFile(path.join(kb, 'docs', '게이트웨이설계.md'), 'utf8')
    assert.match(gw, /## 원칙 — 1\. 설계 원칙/)
    assert.match(gw, /\.\.\/work\/assets\/2026-1012-이관-gw\/a\.png/)
    await fs.access(path.join(kb, 'work', 'assets', '2026-1012-이관-gw', 'a.png'))

    // verify — 같음 5
    o = await call(srv(), 'source', { op: 'verify' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.deepEqual([o.same, o.intent.length, o.off.length, o.missing.length, o.ok], [5, 0, 0, 0, true])

    // 다시 apply — 멱등(커밋이 늘지 않는다)
    const count = async () => (await g(kb, 'rev-list', '--count', 'HEAD')).stdout.trim()
    const before = await count()
    o = await call(srv(), 'source', { op: 'apply', dryRun: false, date: '2026-10-13' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(await count(), before, o.lines.join(NL))

    // follow 의 기본 since — apply 가 쓴 _seed.json 의 sha
    o = await call(srv(), 'source', { op: 'follow' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(o.sinceFrom, '_seed.json')
    assert.equal(o.total, 0)
  } finally {
    await fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
