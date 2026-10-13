// MCP `source` — 서버가 원천 문서 레포를 받아(bare) follow · update 를 낸다. MCP 만으로 검토 v0.1 ① (M2 · M4 · M5 · M6).
//
// 임시 원천 레포(지도 cdp-sources.json) + 빈 틀 지식 레포(_seed.json 의 from 에 세운 sha) →
// 원천을 고치면 follow 가 누락 · update 초안이 바뀐 좌표를 잡고 · 「왜」 안내 줄이 남은 save 는 E_CHECK · 채우면 통과 → follow 누락 0.
// 원천 미연결은 E_NO_SOURCE · viewer(큐레이터 아님)에게는 도구가 없다 · fetch 실패면 마지막 받은 것 + 경고.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { buildServer } from '../viewer/bin/ctx-mcp.mjs'
import { toolSource, setSource, loadSources, sourceDir, whyMissing, WHY_MARK } from '../core/sourcerepo.js'
import { save } from '../core/save.js'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'viewer', 'bin', 'ctx-cli.mjs')
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' }

const TERM = ['# 용어집', '', '## PLC — 현장 제어 장치', '', '현장 설비를 제어한다.', '', '## SCADA — 감시 시스템', '', 'PLC 를 감시한다.', ''].join(NL)
const MAP = {
  version: 1,
  root: '산출물',
  docs: [{ key: 'term', src: '공통/용어집.md', doc: 'docs/용어집.md', type: 'term', title: '용어집', kind: '정의' }],
  records: [{ id: '2026-0901-회의', date: '2026-09-01 10:00', src: '회의록/0901.md', touches: ['term:PLC'] }],
}

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-source-'))
  const docs = path.join(base, 'docs')
  const kb = path.join(base, 'root', 'kb')
  const data = path.join(base, 'data')
  const g = (cwd, ...a) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a])
  await fs.mkdir(path.join(docs, '산출물', '공통'), { recursive: true })
  await fs.mkdir(path.join(docs, '산출물', '회의록'), { recursive: true })
  await fs.writeFile(path.join(docs, '산출물/공통/용어집.md'), TERM)
  await fs.writeFile(path.join(docs, '산출물/회의록/0901.md'), '# 회의 0901\n\n결정 — PLC 는 현장이 판단한다.\n')
  await fs.writeFile(path.join(docs, 'cdp-sources.json'), JSON.stringify(MAP, null, 1))
  await g(docs, 'init', '-q')
  await g(docs, 'add', '-A')
  await g(docs, 'commit', '-qm', 'seed')
  const seedSha = (await g(docs, 'rev-parse', '--short', 'HEAD')).stdout.trim()
  await fs.mkdir(path.dirname(kb), { recursive: true })
  await run(process.execPath, [CLI, 'repo', 'new', kb, '--title', '시험'], { env: ENV })
  // 세운 자리 — from 의 @sha 가 follow 의 기본 since 다(M5)
  await fs.writeFile(path.join(kb, '_seed.json'), JSON.stringify({ at: '2026-10-12', from: `docs@${seedSha}`, records: [], sections: [] }, null, 1))
  await g(kb, 'add', '-A')
  await g(kb, 'commit', '-qm', 'seed 자리')
  const rm = () => fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  return { base, docs, kb, data, g, seedSha, rm }
}

const server = (S, { curate = true, curateAny = true, sourcer = true } = {}) =>
  buildServer({
    repos: [{ name: 'kb', root: S.kb }],
    fallback: 'kb',
    mode: 'server',
    prompts: 'never',
    saver: () => ({}),
    curate: () => curate,
    curateAny,
    sourcer: sourcer ? (r, name, a) => toolSource(r, a, { dataDir: S.data, name }) : null,
  })

const call = async (srv, name, args) => {
  const out = await srv._registeredTools[name].handler({ repo: 'kb', ...args }, {})
  const j = JSON.parse(out.content[0].text)
  return out.isError ? { error: j.error } : j
}

test('whyMissing — 안내 줄 · 태그 업데이트의 빈 「## 왜」', () => {
  assert.match(whyMissing({ body: `가\n\n## 왜\n\n${WHY_MARK} … -->\n` }), /안내 줄/)
  assert.match(whyMissing({ body: '가\n\n## 왜\n\n<!-- 메모 -->\n\n## 커밋\n\n- a', tags: ['업데이트'] }), /비었다/)
  assert.match(whyMissing({ body: '가', tags: ['업데이트'] }), /절이 없다/)
  assert.equal(whyMissing({ body: '가\n\n## 왜\n\n회의에서 정했다.\n\n## 커밋', tags: ['업데이트'] }), null)
  assert.equal(whyMissing({ body: '보통 기록 — 왜 절 없음' }), null)
})

test('setSource — 저장 · 모양 검사 · 끊기', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-src-cfg-'))
  try {
    await assert.rejects(setSource(d, 'kb', { url: 'not a url' }), { code: 'E_INPUT' })
    await assert.rejects(setSource(d, 'kb', { url: 'ssh://git@h:2900/g/p.git', branch: 'a..b' }), { code: 'E_INPUT' })
    assert.deepEqual(await setSource(d, 'kb', { url: 'ssh://git@h:2900/g/p.git', branch: 'main' }), { url: 'ssh://git@h:2900/g/p.git', branch: 'main' })
    assert.equal((await loadSources(d)).repos.kb.branch, 'main')
    assert.equal(await setSource(d, 'kb', { url: '' }), null)
    assert.deepEqual((await loadSources(d)).repos, {})
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('MCP source — follow · update · 「왜」 검사 · E_NO_SOURCE · 큐레이터만', { skip: !hasGit && 'git 이 없다', timeout: 120_000 }, async () => {
  const S = await setup()
  try {
    // 도구 목록 — 큐레이터가 아니면(curateAny false) 없다 · sourcer 가 없으면 없다
    assert.ok(!('source' in server(S, { curateAny: false })._registeredTools), 'viewer · writer 에게 source 가 보인다')
    assert.ok(!('source' in server(S, { sourcer: false })._registeredTools))
    assert.ok('source' in server(S)._registeredTools)
    // 다른 레포의 큐레이터 — 등록은 됐지만 이 레포에서는 E_FORBIDDEN
    assert.equal((await call(server(S, { curate: false }), 'source', { op: 'follow' })).error.code, 'E_FORBIDDEN')

    // 원천 미연결
    let o = await call(server(S), 'source', { op: 'follow' })
    assert.equal(o.error.code, 'E_NO_SOURCE')
    assert.match(o.error.message, /콘솔 레포 설정에서 원천 git 주소를 넣는다/)

    await setSource(S.data, 'kb', { url: S.docs })
    o = await call(server(S), 'source', { op: 'follow' })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(o.range.since, S.seedSha, '기본 since 는 _seed.json 의 sha')
    assert.equal(o.sinceFrom, '_seed.json')
    assert.equal(o.total, 0)
    assert.equal(o.miss, 0)
    await fs.access(path.join(sourceDir(S.data, 'kb'), 'HEAD'))

    // 원천을 고친다 — SCADA 본문 · 새 섹션 HMI
    await fs.writeFile(path.join(S.docs, '산출물/공통/용어집.md'), TERM.replace('PLC 를 감시한다.', 'PLC 를 감시한다. 경보 이력은 ODBC 로 받는다.') + '\n## HMI — 운영 화면\n\n사람이 보는 화면.\n')
    await S.g(S.docs, 'commit', '-qam', 'SCADA 경보 이력 경로')
    const head = (await S.g(S.docs, 'rev-parse', '--short', 'HEAD')).stdout.trim()

    o = await call(server(S), 'source', { op: 'follow' })
    assert.equal(o.total, 1)
    assert.equal(o.miss, 1)
    assert.equal(o.source.at, head, '부를 때마다 fetch 한다')
    const c = o.commits[0]
    assert.equal(c.ok, false)
    assert.equal(c.subject, 'SCADA 경보 이력 경로')
    assert.deepEqual(c.coords, [{ coord: 'term:SCADA', by: [] }, { coord: 'term:HMI', by: [] }])

    o = await call(server(S), 'source', { op: 'update', from: S.seedSha })
    assert.ok(!o.error, JSON.stringify(o))
    assert.deepEqual(o.coords, ['term:SCADA', 'term:HMI'])
    assert.deepEqual(o.draft.vocab, [{ coord: 'term:HMI', label: '운영 화면' }])
    const work = o.draft.work
    assert.deepEqual(work.touches, ['term:SCADA', 'term:HMI'])
    assert.deepEqual(work.tags, ['업데이트'])
    assert.equal(work.source, `docs ${S.seedSha}..${head}`)
    assert.match(work.body, /\+ PLC 를 감시한다\. 경보 이력은 ODBC 로 받는다\./)
    assert.ok(work.body.includes(WHY_MARK))

    // save — 안내 줄이 남으면 E_CHECK(어느 길로 와도 같다 · M6)
    const vocab = [...o.draft.vocab, { coord: 'term:SCADA', label: '감시 시스템' }]
    await assert.rejects(save(S.kb, { work: { ...work }, vocab, dryRun: true }, { user: 'kim', write: true }), { code: 'E_CHECK' })
    const emptied = work.body.replace(/<!-- 왜:[^\n]*-->/, '')
    await assert.rejects(save(S.kb, { work: { ...work, body: emptied }, vocab, dryRun: true }, { user: 'kim', write: true }), { code: 'E_CHECK' })
    const filled = work.body.replace(/<!-- 왜:[^\n]*-->/, '경보 링 버퍼를 쓰지 않기로 해서 — 이력은 ODBC 한 경로다.')
    const saved = await save(S.kb, { work: { ...work, body: filled }, vocab }, { user: 'kim', write: true })
    assert.ok(saved.commit, JSON.stringify(saved))

    o = await call(server(S), 'source', { op: 'follow' })
    assert.equal(o.miss, 0, JSON.stringify(o.commits))
    assert.deepEqual(o.commits[0].coords.map((x) => x.by), [[work.id], [work.id]])

    // 모르는 sha — git 의 거절을 E_INPUT 으로
    assert.equal((await call(server(S), 'source', { op: 'update', from: 'deadbeef' })).error.code, 'E_INPUT')
    assert.equal((await call(server(S), 'source', { op: 'update' })).error.code, 'E_INPUT')

    // fetch 실패 — 마지막 받은 것으로 답하고 경고
    const sources = JSON.parse(await fs.readFile(path.join(S.data, 'sources.json'), 'utf8'))
    sources.repos.kb.url = path.join(S.base, '없는-원천')
    await fs.writeFile(path.join(S.data, 'sources.json'), JSON.stringify(sources))
    o = await call(server(S), 'source', { op: 'follow', since: S.seedSha })
    assert.ok(!o.error, JSON.stringify(o))
    assert.equal(o.source.at, head)
    assert.match(o.warnings[0], /원천 fetch 실패/)
  } finally {
    await S.rm()
  }
})
