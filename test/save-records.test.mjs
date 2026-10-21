// 묶음 save(`saveRecords`) · 같은 원본 거절 — 지식 생성 · 작업실 검토 v0.1 §5.1 · §5.2(G10 · G12).
// 임시 git 레포를 세우고 core 를 **직접** 부른다(서버 라우트 `/api/<repo>/records` 는 ingest 시험이 본다).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save, saveRecords, RECORDS_MAX } from '../core/save.js'
import { stage } from '../core/assets.js'
import { blobSha, formatSource, parseSource, blobOf } from '../core/provenance.js'
import { parseDoc } from '../core/frontmatter.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const skip = !hasGit && 'git 이 없다'
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', ''].join(NL)
const T = ['# 테이블정의서', '', '## a — A', '<!-- applied: null -->', '', 'a 의 처음 본문.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-saverec-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n*.png binary\n')
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { d, r, staging: path.join(d, 'staging'), rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const src = (p, text = p) => formatSource({ name: 'spec', path: p, blob: blobSha(text) })
const rec = (id, extra = {}) => ({ work: { id, title: id, date: '2026-08-14', source: src(id + '.md'), touchesEmpty: '들이기 — 큐레이터 판정', tags: ['ingest/20261021-abcd1234'], body: `${id} 의 원문.`, ...extra } })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const W = { user: 'lee', write: true }

test('provenance — git 과 같은 blob · 정형 출처 읽고 쓰기', () => {
  assert.equal(blobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a', 'git hash-object 와 같다')
  const s = formatSource({ name: 'spec', commit: 'abc1234', path: 'a\\b.md', blob: blobSha('x') })
  assert.match(s, /^spec@abc1234\/a\/b\.md#blob:[0-9a-f]{40}$/)
  assert.deepEqual(parseSource(s), { name: 'spec', commit: 'abc1234', path: 'a/b.md', blob: blobSha('x') })
  assert.equal(parseSource(formatSource({ name: 'D:\\x', path: 'a.md', blob: blobSha('x') })).commit, null, 'git 이 아니면 -')
  assert.equal(blobOf('dpms_docs@1a2b3c4/설계/a.md'), null, 'seed 의 출처는 blob 이 없다')
  assert.equal(blobOf(null), null)
})

test('saveRecords — 기록 N건이 커밋 하나 · 프론트매터 · 응답', { skip }, async () => {
  const t = await repo()
  try {
    const n0 = await commits(t.r)
    const list = Array.from({ length: RECORDS_MAX }, (_, i) => rec(`2026-0814-spec-r${String(i).padStart(2, '0')}`))
    const out = await saveRecords(t.r, { records: list }, W)
    assert.equal(out.ids.length, RECORDS_MAX)
    assert.equal(await commits(t.r), n0 + 1, '커밋 하나')
    assert.equal(await porcelain(t.r), '', '트리 깨끗')
    assert.equal(out.mirror, 'off')
    const d = parseDoc('work/x.md', await fs.readFile(path.join(t.r, 'work', list[3].work.id + '.md'), 'utf8'))
    assert.equal(d.author, 'lee', '작성자는 토큰')
    assert.equal(blobOf(d.source), blobOf(list[3].work.source))
    assert.deepEqual(d.tags, ['ingest/20261021-abcd1234'])
  } finally {
    await t.rm()
  }
})

test('saveRecords — 다시 돌리면: 같은 id · 같은 원본은 skipExisting 이면 건너뛰고 아니면 E_EXISTS', { skip }, async () => {
  const t = await repo()
  try {
    const a = rec('2026-0814-spec-a')
    await saveRecords(t.r, { records: [a] }, W)
    const n1 = await commits(t.r)
    // 같은 id
    await assert.rejects(saveRecords(t.r, { records: [a] }, W), (e) => e.code === 'E_EXISTS' && e.detail.id === a.work.id)
    // 이름이 달라도 내용이 같다(같은 blob)
    const moved = rec('2026-0814-spec-a-옮김', { source: a.work.source.replace('/2026-0814-spec-a.md', '/옮긴/a.md') })
    await assert.rejects(saveRecords(t.r, { records: [moved] }, W), (e) => e.code === 'E_EXISTS' && e.detail.existing === a.work.id)
    const b = rec('2026-0814-spec-b')
    const out = await saveRecords(t.r, { records: [a, moved, b], skipExisting: true }, W)
    assert.deepEqual(out.ids, [b.work.id])
    assert.deepEqual(out.skipped.map((x) => x.existing), [a.work.id, a.work.id])
    assert.equal(await commits(t.r), n1 + 1)
    // 전부 있으면 커밋 없음
    const none = await saveRecords(t.r, { records: [a, b], skipExisting: true }, W)
    assert.equal(none.commit, null)
    assert.deepEqual(none.ids, [])
    assert.equal(await commits(t.r), n1 + 1)
    // 묶음 안에서 같은 원본 둘 — 뒤의 것이 있는 것
    const c1 = rec('2026-0814-spec-c1', { source: src('c.md', 'C') })
    const c2 = rec('2026-0814-spec-c2', { source: src('c-사본.md', 'C') })
    const o2 = await saveRecords(t.r, { records: [c1, c2], skipExisting: true }, W)
    assert.deepEqual(o2.ids, [c1.work.id])
    assert.equal(o2.skipped[0].existing, c1.work.id)
  } finally {
    await t.rm()
  }
})

test('단건 save 도 같은 원본을 거절한다(뮤텍스 안 · 판정 한 곳)', { skip }, async () => {
  const t = await repo()
  try {
    const a = rec('2026-0814-spec-a')
    await save(t.r, a, W)
    const again = rec('2026-0814-spec-a2', { source: a.work.source })
    await assert.rejects(save(t.r, again, W), (e) => e.code === 'E_EXISTS' && e.detail.existing === a.work.id)
    // 손으로 적은 출처는 비교하지 않는다
    await save(t.r, rec('2026-0814-hand-1', { source: '회의록 원본(메일)' }), W)
    await save(t.r, rec('2026-0814-hand-2', { source: '회의록 원본(메일)' }), W)
  } finally {
    await t.rm()
  }
})

test('saveRecords — 전부 또는 전무: 하나가 어휘에 없는 좌표면 아무것도 안 쓴다 · 오류는 id 로', { skip }, async () => {
  const t = await repo()
  try {
    const n0 = await commits(t.r)
    const good = rec('2026-0814-spec-ok')
    const bad = rec('2026-0814-spec-bad', { touches: ['table:zzz'], touchesEmpty: undefined })
    delete bad.work.touchesEmpty
    await assert.rejects(saveRecords(t.r, { records: [good, bad] }, W), (e) => e.code === 'E_INPUT' && e.detail.id === bad.work.id && e.detail.coord === 'table:zzz')
    assert.equal(await commits(t.r), n0)
    assert.equal(await porcelain(t.r), '')
    // 어휘를 같이 보내면 된다(더하기)
    const out = await saveRecords(t.r, { records: [good, bad], vocab: [{ coord: 'table:zzz', label: '지지' }] }, W)
    assert.equal(out.vocab, 1)
    assert.equal(out.ids.length, 2)
  } finally {
    await t.rm()
  }
})

test('saveRecords — 받지 않는 것: 큐레이터 입력 · 예약 태그 · 어휘 op · 좌표 0 사유 없음 · 21건 · 권한', { skip }, async () => {
  const t = await repo()
  try {
    const n0 = await commits(t.r)
    const a = rec('2026-0814-spec-a')
    await assert.rejects(saveRecords(t.r, { records: [a], sections: [] }, W), (e) => e.code === 'E_INPUT' && e.detail.field === 'sections')
    await assert.rejects(saveRecords(t.r, { records: [{ ...a, managed: [] }] }, W), (e) => e.code === 'E_INPUT')
    await assert.rejects(saveRecords(t.r, { records: [rec('2026-0814-x', { tags: ['registry'] })] }, W), (e) => e.code === 'E_FORBIDDEN' && e.detail.need === 'curate')
    await assert.rejects(saveRecords(t.r, { records: [a], vocab: [{ op: 'retire', coord: 'table:a', successor: 'table:a' }] }, W), (e) => e.code === 'E_FORBIDDEN' || e.code === 'E_INPUT')
    const zero = rec('2026-0814-zero')
    delete zero.work.touchesEmpty
    await assert.rejects(saveRecords(t.r, { records: [zero] }, W), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touches')
    await assert.rejects(saveRecords(t.r, { records: Array.from({ length: RECORDS_MAX + 1 }, (_, i) => rec('2026-0814-n' + i)) }, W), (e) => e.code === 'E_INPUT' && e.detail.count === RECORDS_MAX + 1)
    await assert.rejects(saveRecords(t.r, { records: [a, a] }, W), (e) => e.code === 'E_INPUT')
    await assert.rejects(saveRecords(t.r, { records: [a] }, { user: 'hong', write: false }), (e) => e.code === 'E_FORBIDDEN' && e.detail.need === 'write')
    await assert.rejects(saveRecords(t.r, { records: [{ work: { ...a.work, author: 'x' } }] }, W), (e) => e.code === 'E_INPUT' && e.detail.index === 0)
    assert.equal(await commits(t.r), n0)
    assert.equal(await porcelain(t.r), '')
  } finally {
    await t.rm()
  }
})

test('saveRecords — 첨부 · 미리보기', { skip }, async () => {
  const t = await repo()
  try {
    const st = await stage(t.staging, PNG)
    const a = rec('2026-0814-spec-img', { body: '그림 ![구성](assets/2026-0814-spec-img/구성.png)' })
    const n0 = await commits(t.r)
    const dry = await saveRecords(t.r, { records: [{ ...a, assets: [{ ref: st.ref, name: '구성.png' }] }], dryRun: true }, { ...W, staging: t.staging })
    assert.equal(dry.dryRun, true)
    assert.equal(await commits(t.r), n0)
    assert.equal(await porcelain(t.r), '', '미리보기는 아무것도 남기지 않는다')
    const out = await saveRecords(t.r, { records: [{ ...a, assets: [{ ref: st.ref, name: '구성.png' }] }] }, { ...W, staging: t.staging })
    assert.deepEqual(out.assets.map((x) => x.path), ['work/assets/2026-0814-spec-img/구성.png'])
    const d = parseDoc('work/x.md', await fs.readFile(path.join(t.r, 'work', a.work.id + '.md'), 'utf8'))
    assert.deepEqual(d.attachments, ['assets/2026-0814-spec-img/구성.png'])
  } finally {
    await t.rm()
  }
})

test('staging — 한 사람의 합 상한(413) · 같은 내용은 다시 세지 않는다 · 다른 사람은 따로', async () => {
  const { usageOf } = await import('../core/assets.js')
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-stg-'))
  try {
    const a = await stage(d, PNG, { by: 'lee', userMax: PNG.length + 1 })
    assert.equal(await usageOf(d, 'lee'), PNG.length)
    await stage(d, PNG, { by: 'lee', userMax: PNG.length + 1 }) // 같은 내용 — 다시 세지 않는다
    const PNG2 = Buffer.concat([PNG, Buffer.from('00', 'hex')])
    await assert.rejects(stage(d, PNG2, { by: 'lee', userMax: PNG.length + 1 }), (e) => e.code === 'E_TOO_LARGE' && e.detail.used === PNG.length)
    await stage(d, PNG2, { by: 'park', userMax: PNG.length + 1 }) // 다른 사람
    assert.equal(await usageOf(d, 'lee', { now: Date.now() + 25 * 3600 * 1000 }), 0, '만료되면 세지 않는다')
    assert.ok(a.ref.startsWith('sha256:'))
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
