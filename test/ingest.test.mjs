// 들이기 — 계획(core/ingest.js) · `ctx ingest` 를 서버 하나로 끝까지. 지식 생성 · 작업실 검토 v0.1 §4 · §5 · TODO B3 · B4 · B10.
//
// 계획: id · 날짜 근거 · 원문 좌표 보존 · 그림 첨부와 링크 · 거름 · 건너뜀 · 이전 판 · 결정론.
// 끝까지: 3 파일 → 기록 3(커밋 1) → 다시 돌리면 0 → 하나를 고치면 1(이전 판 머리줄) → 두 PC 가 동시에 같은 폴더 → 중복 0
//         · viewer 는 /records · /sources 403 · 들인 기록의 대기 나이는 들인 날부터.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { planIngest, globRe, runHash, runIdOf } from '../core/ingest.js'
import { blobSha, parseSource } from '../core/provenance.js'
import { ingestedOf } from '../core/curation.js'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'viewer', 'bin', 'ctx-cli.mjs')
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
const RUN = '20261021-abcd1234'

async function srcDir(files) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ing-'))
  const root = path.join(d, '설계문서')
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fs.writeFile(path.join(root, rel), body)
  }
  return { d, root, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

test('globRe — ** · * · ?', () => {
  assert.ok(globRe('**/*.md').test('a/b/c.md'))
  assert.ok(globRe('**/*.md').test('c.md'))
  assert.ok(!globRe('*.md').test('a/c.md'))
  assert.ok(globRe('설계/**').test('설계/x/y.txt'))
  assert.ok(globRe('a?.md').test('ab.md'))
  assert.equal(runHash({ inputs: ['a', 'b'], repo: 'r' }), runHash({ inputs: ['b', 'a'], repo: 'r' }), '대상 순서와 무관')
  assert.match(runIdOf('abcd1234', Date.parse('2026-10-21T10:00:00')), /^20261021-abcd1234$/)
})

test('planIngest — id · 날짜 근거 · 원문 좌표는 tags · 그림은 첨부 · 건너뜀 · 결정론', async () => {
  const s = await srcDir({
    '회의록/2026-08-14_정산회의.md': ['---', 'title: 정산 회의', 'touches: [table:pj_plan_mst, 이상한것]', 'owner: kim', 'status: done', '---', '# 정산 회의', '', '![구성](../그림/구성 도.png) · [첨부](../그림/명세.pdf) · [밖](https://x.y/a.png)', '', '결정 — 한도를 올린다.', ''].join(NL),
    '메모.txt': '그냥 메모\n',
    '빈.md': '   \n',
    '표.xlsx': 'PK',
    '그림/구성 도.png': PNG,
    '그림/명세.pdf': '%PDF-1.4\n%%EOF\n',
    '그림/안씀.png': PNG,
  })
  try {
    const now = Date.parse('2026-10-21T09:00:00')
    const p = await planIngest([s.root], { runId: RUN, now })
    const rec = p.files.find((f) => f.rel === '회의록/2026-08-14_정산회의.md')
    assert.equal(rec.kind, 'record')
    assert.equal(rec.dateSource, 'filename')
    assert.match(rec.id, /^2026-0814-설계문서-회의록-정산회의-[0-9a-f]{7}$/)
    assert.equal(rec.id.slice(-7), rec.blob.slice(0, 7), 'id 꼬리는 blob')
    assert.equal(rec.work.title, '정산 회의')
    assert.equal(rec.work.touches, undefined, '좌표를 추측하지 않는다')
    assert.ok(rec.work.touchesEmpty)
    assert.deepEqual(rec.work.tags, [`ingest/${RUN}`, 'touches/table:pj_plan_mst', 'owner/kim'], '좌표 모양만 보존 · status 는 소거')
    assert.deepEqual(parseSource(rec.work.source), { name: '설계문서', commit: null, path: '회의록/2026-08-14_정산회의.md', blob: rec.blob, part: null })
    assert.deepEqual(rec.assets.map((a) => a.name), ['구성 도.png', '명세.pdf'])
    assert.ok(rec.work.body.includes(`](<assets/${rec.id}/구성 도.png>)`), '공백 든 경로는 꺾쇠로')
    assert.ok(rec.work.body.includes(`](assets/${rec.id}/명세.pdf)`))
    assert.ok(rec.work.body.includes('https://x.y/a.png'), '바깥 링크는 그대로')
    assert.match(rec.work.body.split(NL)[0], /^> 들임 — 원문 `회의록\/2026-08-14_정산회의\.md` · 들인 날 2026-10-21 · 날짜 근거 filename$/)
    assert.ok(!rec.work.body.includes('title: 정산'), '프론트매터는 본문에서 뺀다')
    const txt = p.files.find((f) => f.rel === '메모.txt')
    assert.equal(txt.kind, 'record')
    assert.equal(txt.dateSource, 'mtime')
    const why = Object.fromEntries(p.files.filter((f) => f.kind !== 'record').map((f) => [f.rel, f.reason]))
    assert.match(why['빈.md'], /빈 파일/)
    assert.match(why['표.xlsx'], /변환하지 못했다 — zip/, '깨진 xlsx 는 들이지 않는다')
    assert.match(why['그림/명세.pdf'], /첨부로 간다\(따로는 — 변환하지 못했다/, 'pdf 변환기가 없어도 md 의 첨부로')
    assert.match(why['그림/안씀.png'], /가리키지 않는/)
    assert.match(why['그림/구성 도.png'], /첨부로/)
    assert.equal(p.summary.records, 2)
    // 결정론
    const q = await planIngest([s.root], { runId: RUN, now })
    assert.deepEqual(q.files.map((f) => f.work || f.reason), p.files.map((f) => f.work || f.reason))
    // 거름 · 상한
    const g = await planIngest([s.root], { runId: RUN, now, include: ['**/*.md'] })
    assert.equal(g.summary.records, 1)
    assert.match(g.files.find((f) => f.rel === '메모.txt').reason, /거름/)
    const m = await planIngest([s.root], { runId: RUN, now, maxFiles: 1 })
    assert.equal(m.summary.records, 1)
    // 파일 하나
    const one = await planIngest([path.join(s.root, '메모.txt')], { runId: RUN, now })
    assert.deepEqual(one.files.map((f) => [f.rel, f.kind]), [['메모.txt', 'record']])
  } finally {
    await s.rm()
  }
})

test('planIngest — 이미 들임(같은 blob) · 이전 판(같은 경로 · 다른 blob) · git 의 커밋과 첫 커밋 날짜', { skip: !hasGit && 'git 이 없다' }, async () => {
  const s = await srcDir({ 'a.md': '# A\n\n첫 판\n', 'b.md': '# B\n' })
  try {
    const g = (...a) => run('git', ['-C', s.root, '-c', 'user.name=박', '-c', 'user.email=p@x', ...a])
    await g('init', '-q')
    await g('add', '-A')
    await g('commit', '-qm', 'x', '--date', '2026-07-01T10:00:00')
    await run('git', ['-C', s.root, 'commit', '--amend', '-qm', 'x', '--no-edit'], { env: { ...process.env, GIT_COMMITTER_DATE: '2026-07-01T10:00:00', GIT_AUTHOR_NAME: '박', GIT_AUTHOR_EMAIL: 'p@x', GIT_COMMITTER_NAME: '박', GIT_COMMITTER_EMAIL: 'p@x' } })
    const head = (await g('rev-parse', '--short=12', 'HEAD')).stdout.trim()
    const p = await planIngest([s.root], { runId: RUN })
    const a = p.files.find((f) => f.rel === 'a.md')
    assert.equal(a.dateSource, 'git')
    assert.equal(a.date, '2026-07-01')
    assert.equal(a.writer, '박')
    assert.equal(parseSource(a.work.source).commit, head)
    assert.match(a.work.body.split(NL)[0], / @ [0-9a-f]{12} · 원문 작성 박 · /)
    // 고친 파일 — 커밋 전이면 commit 은 - · 날짜는 git 이 아니다
    await fs.writeFile(path.join(s.root, 'a.md'), '# A\n\n둘째 판\n')
    const known = [{ name: '설계문서', path: 'a.md', blob: a.blob, id: a.id }, { name: '설계문서', path: 'b.md', blob: p.files.find((f) => f.rel === 'b.md').blob, id: 'B-ID' }]
    const q = await planIngest([s.root], { runId: RUN, known })
    const a2 = q.files.find((f) => f.rel === 'a.md')
    assert.equal(a2.kind, 'record')
    assert.equal(a2.prev, a.id)
    assert.notEqual(a2.id, a.id, '새 기록')
    assert.equal(parseSource(a2.work.source).commit, null)
    assert.ok(a2.work.body.split(NL)[0].includes(`이전 판 [\`${a.id}\`](${a.id}.md)`))
    assert.equal(a2.work.supersedes, undefined, 'supersedes 는 정정 전용')
    const b = q.files.find((f) => f.rel === 'b.md')
    assert.equal(b.kind, 'have')
    assert.equal(b.id, 'B-ID')
  } finally {
    await s.rm()
  }
})

test('대기 나이 — 들인 기록은 태그의 들인 날', () => {
  assert.equal(ingestedOf({ tags: ['x', 'ingest/20261021-abcd1234'] }), '2026-10-21')
  assert.equal(ingestedOf({ tags: ['ingest-llm'] }), null)
  assert.equal(ingestedOf({}), null)
})

// ── 끝까지 — 서버 하나 ────────────────────────────────────────────────────────

async function server() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ingsrv-'))
  const root = path.join(base, 'root')
  await fs.mkdir(root, { recursive: true })
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' }
  await run(process.execPath, [CLI, 'repo', 'new', path.join(root, 'kb'), '--title', '시험'], { env })
  const auth = path.join(base, 'auth.json')
  const init = await run(process.execPath, [CLI, 'serve', 'init', '--auth', auth, '--name', 'kim'])
  const token = init.stdout.split(NL).map((l) => l.trim()).find((l) => /^[A-Za-z0-9_-]{30,}$/.test(l))
  await run(process.execPath, [CLI, 'serve', 'user', 'add', '--auth', auth, '--name', 'hong', '--role', 'viewer', '--repos', 'kb'])
  const vt = await run(process.execPath, [CLI, 'serve', 'token', '--auth', auth, '--user', 'hong'])
  const viewerToken = String(vt.stdout || '').split(NL).map((l) => l.trim()).find((l) => /^[A-Za-z0-9_-]{30,}$/.test(l))
  await run(process.execPath, [CLI, 'serve', 'user', 'add', '--auth', auth, '--name', 'lee', '--role', 'writer', '--repos', 'kb'])
  const wt = await run(process.execPath, [CLI, 'serve', 'token', '--auth', auth, '--user', 'lee'])
  const writerToken = String(wt.stdout || '').split(NL).map((l) => l.trim()).find((l) => /^[A-Za-z0-9_-]{30,}$/.test(l))
  const port = 7500 + Math.floor(Math.random() * 60)
  const srv = spawn(process.execPath, [CLI, 'serve', '--root', root, '--auth', auth, '--data', path.join(base, 'data'), '--port', String(port)], { stdio: 'ignore' })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 80; i++) {
    if (await fetch(url + '/site/info').then((r) => r.ok).catch(() => false)) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const ctx = (args, { home = 'a', extra = {} } = {}) =>
    run(process.execPath, [CLI, ...args, '--server', url, '--repo', 'kb', '--yes'], {
      env: { ...process.env, CDP_TOKEN: token, CDP_CONFIG_DIR: path.join(base, 'cfg-' + home), CDP_INGEST_DIR: path.join(base, 'ingest-' + home), ...extra },
      timeout: 120_000,
    }).then(
      (r) => ({ code: 0, text: r.stdout + r.stderr }),
      (e) => ({ code: e.code, text: String(e.stdout || '') + String(e.stderr || '') })
    )
  const commits = async () => Number((await run('git', ['-C', path.join(root, 'kb'), 'rev-list', '--count', 'HEAD'])).stdout.trim())
  const works = async () => (await fs.readdir(path.join(root, 'kb', 'work'))).filter((n) => n.endsWith('.md'))
  const rm = async () => {
    srv.kill()
    await new Promise((r) => setTimeout(r, 300))
    await fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
  return { base, url, token, viewerToken, writerToken, ctx, commits, works, rm, kb: path.join(root, 'kb') }
}

test('ctx ingest — 끝까지: 계획 · 들이기(커밋 1) · 다시 0 · 고치면 1(이전 판) · 두 PC 동시 · 권한', { skip: !hasGit && 'git 이 없다', timeout: 300_000 }, async () => {
  const s = await srcDir({ 'a.md': '# A\n\n![g](g.png)\n', 'b.md': '# B\n', 'c.txt': 'C\n', 'g.png': PNG })
  const S = await server()
  try {
    // 계획 — 쓰지 않는다
    const n0 = await S.commits()
    const w0 = (await S.works()).length
    const plan = await S.ctx(['ingest', s.root])
    assert.equal(plan.code, 0, plan.text)
    assert.match(plan.text, /기록 3 · 이미 들임 0 · 첨부 1/)
    assert.equal(await S.commits(), n0, '계획은 쓰지 않는다')

    // 들이기 — 묶음 하나 = 커밋 하나
    const ap = await S.ctx(['ingest', s.root, '--apply'])
    assert.equal(ap.code, 0, ap.text)
    assert.match(ap.text, /들임 3 · 건너뜀\(이미 있음\) 0 · 실패 0/)
    assert.equal(await S.commits(), n0 + 1)
    assert.equal((await S.works()).length, w0 + 3)
    const png = (await fs.readdir(path.join(S.kb, 'work', 'assets'))).length
    assert.equal(png, 1, '그림은 그 기록의 첨부로')

    // 다시 돌리면 — 들일 것이 없다
    const again = await S.ctx(['ingest', s.root, '--apply'])
    assert.equal(again.code, 0, again.text)
    assert.match(again.text, /기록 0 · 이미 들임 3/)
    assert.equal(await S.commits(), n0 + 1)

    // 하나를 고치면 — 새 기록 하나 · 머리에 이전 판
    await fs.writeFile(path.join(s.root, 'b.md'), '# B\n\n고쳤다\n')
    const b2 = await S.ctx(['ingest', s.root, '--apply'])
    assert.match(b2.text, /들임 1 · /, b2.text)
    const names = await S.works()
    const newest = (await Promise.all(names.map(async (n) => [n, await fs.readFile(path.join(S.kb, 'work', n), 'utf8')]))).find(([, t]) => t.includes('고쳤다'))
    assert.ok(newest && /이전 판 \[`2026-\d{4}-[^`]+`\]/.test(newest[1]), '이전 판 머리줄')

    // 상태
    const st = await S.ctx(['ingest', s.root, '--status'])
    assert.match(st.text, /서버 — 이 run 의 기록 4건: 대기 4/, st.text)

    // 다른 PC 둘이 같은 폴더를 동시에(원장이 없다) — 서버가 blob 으로 막는다 · 중복 0
    const s2 = await srcDir({ 'x.md': '# X\n', 'y.md': '# Y\n', 'z.md': '# Z\n' })
    try {
      const before = (await S.works()).length
      const [p1, p2] = await Promise.all([S.ctx(['ingest', s2.root, '--apply'], { home: 'b' }), S.ctx(['ingest', s2.root, '--apply'], { home: 'c' })])
      assert.equal(p1.code, 0, p1.text)
      assert.equal(p2.code, 0, p2.text)
      assert.equal((await S.works()).length, before + 3, '중복 0')
    } finally {
      await s2.rm()
    }

    // 권한 — viewer 는 들이지 못하고 출처 목록도 못 본다
    {
      assert.ok(S.viewerToken, 'viewer 토큰')
      const h = { authorization: 'Bearer ' + S.viewerToken, 'content-type': 'application/json' }
      const r1 = await fetch(S.url + '/api/kb/records', { method: 'POST', headers: h, body: JSON.stringify({ records: [] }) })
      assert.equal(r1.status, 403)
      const r2 = await fetch(S.url + '/api/kb/sources', { headers: h })
      assert.equal(r2.status, 403)
    }
    // 지식 레포는 들이지 않는다
    const kbIn = await S.ctx(['ingest', S.kb])
    assert.notEqual(kbIn.code, 0)
    assert.match(kbIn.text, /지식 레포다/)
  } finally {
    await S.rm()
    await s.rm()
  }
})

test('ctx login · whoami · logout — 토큰을 /me 로 확인 · 서버 주소만 잊는다', { skip: !hasGit && 'git 이 없다', timeout: 120_000 }, async () => {
  const S = await server()
  try {
    const cfg = path.join(S.base, 'cfg-login')
    const env = { ...process.env, CDP_CONFIG_DIR: cfg, CDP_TOKEN: '' }
    const login = await new Promise((res) => {
      const p = spawn(process.execPath, [CLI, 'login', '--server', S.url, '--token-stdin'], { env })
      let t = ''
      p.stdout.on('data', (c) => (t += c))
      p.stderr.on('data', (c) => (t += c))
      p.on('close', (code) => res({ code, text: t }))
      p.stdin.end(S.token + NL)
    })
    assert.equal(login.code, 0, login.text)
    assert.match(login.text, /kim · admin/)
    assert.match(login.text, /kb/)
    assert.equal((await fs.readFile(path.join(cfg, 'token'), 'utf8')).trim(), S.token)
    const who = await run(process.execPath, [CLI, 'whoami', '--json'], { env })
    assert.equal(JSON.parse(who.stdout).server, S.url, '--server 없이 login.json 의 주소')
    const bad = await new Promise((res) => {
      const p = spawn(process.execPath, [CLI, 'login', '--server', S.url, '--token-stdin'], { env })
      p.on('close', (code) => res(code))
      p.stdin.end('wrong-token-wrong-token-wrong-token\n')
    })
    assert.equal(bad, 1)
    const out = await run(process.execPath, [CLI, 'logout'], { env })
    assert.match(out.stdout, /토큰은 남겼다/)
    assert.equal((await fs.readFile(path.join(cfg, 'token'), 'utf8')).trim(), S.token, '토큰은 그대로')
    const who2 = await run(process.execPath, [CLI, 'whoami'], { env }).catch((e) => e)
    assert.equal(who2.code, 2)
  } finally {
    await S.rm()
  }
})

test('planIngest — docx 를 변환해 들인다 · 그림은 그 기록의 첨부 · 머리에 「변환 docx → md」', async () => {
  const { zip } = await import('../core/zip.js')
  const W = 'xmlns:w="w" xmlns:r="r" xmlns:a="a"'
  const doc = `<w:document ${W}><w:body><w:p><w:r><w:t>결정 — 한도 10MB</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p></w:body></w:document>`
  const rels = '<Relationships><Relationship Id="rId1" Target="media/image1.png"/></Relationships>'
  const buf = await zip([
    { name: 'word/document.xml', data: Buffer.from(doc) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(rels) },
    { name: 'word/media/image1.png', data: PNG },
  ])
  const s = await srcDir({ '2026-09-01 회의.docx': buf })
  try {
    const p = await planIngest([s.root], { runId: RUN })
    const r = p.files[0]
    assert.equal(r.kind, 'record', r.reason)
    assert.equal(r.dateSource, 'filename')
    assert.deepEqual(r.assets.map((a) => [a.name, !!a.buf]), [['image1.png', true]])
    assert.ok(r.work.body.includes(`![](assets/${r.id}/image1.png)`))
    assert.match(r.work.body.split('\n')[0], / · 변환 docx → md/)
    assert.ok(r.work.body.includes('결정 — 한도 10MB'))
    assert.equal(parseSource(r.work.source).blob, blobSha(buf), '출처는 원본(docx)의 blob')
  } finally {
    await s.rm()
  }
})

test('ctx ingest --analyze · review · apply — 가짜 claude 로 끝까지: 후보 · 승인 · 나눔 · 어휘 · 잡 · 남의 잡 404', { skip: !hasGit && 'git 이 없다', timeout: 300_000 }, async () => {
  const S = await server()
  const s = await srcDir({ 'a.md': '# A\n\nPLC 를 정의한다. 새것을 들인다.\n', 'b.md': '# B\n\n첫 결정 PLC.\n\n## 둘째\n\n다른 결정.\n', 'c.md': '# 서식\n\n(빈칸)\n', 'd.md': '# D\n\n깨짐\n' })
  const H = { authorization: 'Bearer ' + S.token, 'content-type': 'application/json' }
  try {
    // 어휘 — term:PLC 를 먼저 등재해 둔다(writer 의 어휘 더하기)
    const seed = await fetch(S.url + '/api/kb/records', { method: 'POST', headers: H, body: JSON.stringify({ records: [{ work: { id: '2026-0101-씨앗', title: '씨앗', date: '2026-01-01', touches: ['term:PLC'], body: 'PLC 등재' } }], vocab: [{ coord: 'term:PLC', label: 'PLC' }] }) })
    assert.equal(seed.status, 200, await seed.text())
    const extra = { CDP_CLAUDE: path.join(HERE, 'fixtures', 'fake-claude.mjs'), CDP_KIT: path.join(HERE, '..', 'agent') }
    const an = await S.ctx(['ingest', s.root, '--analyze'], { extra })
    assert.equal(an.code, 1, an.text) // d.md 는 판단이 깨진다
    assert.match(an.text, /✓ a\.md — 결정 · 좌표 후보 2/)
    assert.match(an.text, /✓ b\.md — 결정 · 2개로/)
    assert.match(an.text, /✓ c\.md — 제외/)
    assert.match(an.text, /✗ d\.md — /)
    const dir = path.join(S.base, 'ingest-a')
    const run = (await fs.readdir(dir))[0]
    const reviewPath = path.join(dir, run, 'review.md')
    let review = await fs.readFile(reviewPath, 'utf8')
    assert.match(review, /- \[x\] `term:PLC` 정의/)
    assert.match(review, /- \[ \] `term:새것` \(미등재\)/)
    assert.ok(!(await fs.readdir(path.join(dir, run))).includes('mcp.json'), 'MCP 설정(토큰)은 끝나면 지운다')
    // 사람이 고친다 — a 의 새것과 그 어휘를 고른다
    review = review.replace('- [ ] `term:새것` (미등재)', '- [x] `term:새것` (미등재)').replace('- [ ] `term:새것` 새것', '- [x] `term:새것` 새것')
    await fs.writeFile(reviewPath, review)
    // 다시 판단해도 이미 한 것은 건너뛴다 · 체크는 남는다
    const an2 = await S.ctx(['ingest', s.root, '--analyze'], { extra })
    assert.match(an2.text, /판단 1건/, '깨진 d.md 만 다시')
    assert.match(await fs.readFile(reviewPath, 'utf8'), /- \[x\] `term:새것` \(미등재\)/)

    const ap = await S.ctx(['ingest', s.root, '--apply'], { extra })
    assert.equal(ap.code, 0, ap.text)
    assert.match(ap.text, /들임 4 · /, ap.text) // a · b 둘 · d(판단 없이) — c 는 제외
    const texts = await Promise.all((await S.works()).map(async (n) => [n, await fs.readFile(path.join(S.kb, 'work', n), 'utf8')]))
    const a = texts.find(([, t]) => t.includes('새것을 들인다'))[1]
    assert.match(a, /touches:\n {2}- term:PLC\n {2}- term:새것/)
    assert.match(a, /ingest-llm/)
    const vocabText = await fs.readFile(path.join(S.kb, '_vocab.md'), 'utf8')
    assert.match(vocabText, /term:새것/, '고른 어휘가 들어갔다')
    const parts = texts.filter(([n]) => /-[12]\.md$/.test(n))
    assert.equal(parts.length, 2, 'b 는 둘로')
    assert.ok(parts.some(([n]) => n.startsWith('2026-0301-')), '판단의 날짜')
    assert.ok(parts.every(([, t]) => /나눔 [12]\/2/.test(t)))
    assert.ok(!texts.some(([, t]) => t.includes('(빈칸)')), '제외는 들이지 않는다')
    const d = texts.find(([, t]) => t.includes('깨짐'))[1]
    assert.ok(!d.includes('ingest-llm'), '판단이 깨진 것은 판단 없이')

    // 잡 — 주인 · 큐레이터는 본다 · 남(writer)은 404 · viewer 는 403
    const list = await (await fetch(S.url + '/api/kb/jobs', { headers: H })).json()
    assert.equal(list.jobs.length, 1)
    const j = list.jobs[0]
    assert.equal(j.state, 'saved')
    assert.equal(j.kind, 'folder')
    const detail = await (await fetch(S.url + '/api/kb/jobs/' + j.id, { headers: H })).json()
    assert.equal(detail.files['a.md'].status, 'saved')
    assert.equal(detail.files['c.md'].status, 'skipped', '판단 「제외」')
    assert.equal(detail.counts.queued, 4, '들인 기록이 대기열에')
    const queue = await (await fetch(S.url + '/api/kb/queue', { headers: H })).json()
    const runs = new Set(queue.items.filter((x) => x.run).map((x) => x.run))
    assert.equal(runs.size, 1, '대기열 줄에 run — 화면이 run 으로 접는다')
    assert.equal(queue.items.filter((x) => x.run).length, 4)
    assert.ok(queue.items.find((x) => !x.run), '사람의 기록(씨앗)은 run 이 없다')
    const W = { authorization: 'Bearer ' + S.writerToken, 'content-type': 'application/json' }
    assert.equal((await fetch(S.url + '/api/kb/jobs/' + j.id, { headers: W })).status, 404, '남의 잡은 없는 것')
    assert.equal((await (await fetch(S.url + '/api/kb/jobs', { headers: W })).json()).jobs.length, 0)
    assert.equal((await fetch(S.url + '/api/kb/jobs/' + j.id + '/report', { method: 'POST', headers: W, body: '{"files":[]}' })).status, 404)
    assert.equal((await fetch(S.url + '/api/kb/jobs', { headers: { authorization: 'Bearer ' + S.viewerToken } })).status, 403)
  } finally {
    await S.rm()
    await s.rm()
  }
})
